import type { AnalysisResult, Insight, Severity, SpikeEvent } from "@/lib/analysis";
import type { ParsedDataset } from "@/lib/parser";
import { maxNumber } from "@/lib/stats";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface PromptBuildResult {
  compactReport: { [key: string]: JsonValue };
  finalPrompt: string;
  truncated: boolean;
}

const MAX_FINDINGS = 8;
const MAX_PEAK_EVENTS = 10;
const MAX_PROMPT_CHARS = 20_000;

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? null;
  const frac = idx - lo;
  return (sorted[lo] ?? 0) * (1 - frac) + (sorted[hi] ?? 0) * frac;
}

function fmtTimestamp(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function hasValues(values: Array<number | undefined>, predicate: (v: number) => boolean = () => true): boolean {
  return values.some((v) => typeof v === "number" && Number.isFinite(v) && predicate(v));
}

function mapInsightTopic(category: Insight["category"]): string {
  switch (category) {
    case "battery":
      return "peak_shaving";
    case "powerfactor":
      return "power_factor";
    case "thd":
      return "harmonics";
    case "voltage":
      return "voltage";
    case "imbalance":
      return "phase_balance";
    case "frequency":
      return "frequency";
    case "neutral":
      return "neutral";
    case "load":
      return "load_spikes";
    default:
      return "summary";
  }
}

function severityRank(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 4;
    case "warning":
      return 3;
    case "info":
      return 2;
    case "ok":
      return 1;
    default:
      return 0;
  }
}

function buildTopFindings(insights: Insight[]): Array<{ [key: string]: JsonValue }> {
  const sorted = [...insights].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return sorted.slice(0, MAX_FINDINGS).map((i) => ({
    severity: i.severity,
    topic: mapInsightTopic(i.category),
    title: i.title,
    evidence: i.detail,
    interpretation: i.detail,
  }));
}

function buildPeakEvents(spikes: SpikeEvent[]): Array<{ [key: string]: JsonValue }> {
  return [...spikes]
    .sort((a, b) => b.energyAboveThresholdKwh - a.energyAboveThresholdKwh)
    .slice(0, MAX_PEAK_EVENTS)
    .map((s) => ({
      time: fmtTimestamp(s.timestamp),
      peak_kw: round(s.powerKw, 2),
      duration_min: round(s.durationSec / 60, 1),
      excess_kwh: round(s.energyAboveThresholdKwh, 3),
      billing_15min_relevant: s.affectsBillingDemand,
    }));
}

function buildPromptInstructions(compactReportJson: string): string {
  return `Du bist ein Power-Quality- und Energiesystem-Analyst fuer Schweizer Gewerbe- und Industrieanlagen.
Analysiere den folgenden kompakten Mess- und Auswertungsreport aus einem Power-Analytics-Dashboard.
Ziel deiner Antwort:
1. Erklaere die wichtigsten Erkenntnisse zuerst einfach und verstaendlich fuer einen Nicht-Elektrotechniker.
2. Danach gib eine technische Einschaetzung fuer eine Fachperson.
3. Unterscheide klar zwischen:
   - gesicherten Befunden
   - Verdachtsmomenten
   - fehlenden Daten
4. Bewerte separat:
   - Peak-Shaving-Potenzial
   - Spannung
   - Frequenz
   - Phasenbalance
   - Power Factor / Blindleistung
   - Oberschwingungen / THD
   - Neutralleiter
   - Datenqualitaet
5. Sage konkret, welche naechsten Messungen oder Abklaerungen sinnvoll sind.
6. Gib eine priorisierte Empfehlung:
   - Was ist sofort relevant?
   - Was sollte weiter geprueft werden?
   - Was ist wahrscheinlich unkritisch?
7. Vermeide falsche Sicherheit:
   - Keine Normkonformitaet behaupten, wenn THD V, Einzelharmonische, Flicker, Sags, Swells oder Transienten fehlen.
   - Hohe Strom-THD nicht automatisch als Netzproblem darstellen, wenn Spannungs-THD fehlt.
   - Schlechten Power Factor bei niedriger Last oder PV-Rueckspeisung vorsichtig interpretieren.
8. Formuliere die Antwort benutzerfreundlich, klar und entscheidungsorientiert.
9. Am Schluss eine kurze Management-Zusammenfassung in 5 Bulletpoints liefern.

Report:
\`\`\`json
${compactReportJson}
\`\`\``;
}

export function buildChatGptPrompt(ds: ParsedDataset, result: AnalysisResult): PromptBuildResult {
  const rows = ds.rows;
  const powerScale = Math.abs(result.kpi.peakPowerKw) > 0 ? Math.abs(rows[0]?.power.total ?? 0) / result.kpi.peakPowerKw : 1;
  const powerValuesKw = rows.map((r) => (powerScale > 100 ? r.power.total / 1000 : r.power.total));
  const allVoltage = rows.flatMap((r) => [r.voltage.L1, r.voltage.L2, r.voltage.L3]).filter((v) => v > 0);
  const allCurrents = rows.flatMap((r) => [r.current.L1, r.current.L2, r.current.L3]).filter((v) => v > 0);
  const allThdA = rows.flatMap((r) => [r.thdA.L1, r.thdA.L2, r.thdA.L3]).filter((v): v is number => typeof v === "number");
  const pfImportSignal = rows
    .map((r) => ({ pf: r.pf.total }))
    .filter((x) => typeof x.pf === "number" && Number.isFinite(x.pf));

  const knownLimitations: string[] = [];
  if (!result.kpi.thdVAvailable) {
    knownLimitations.push("Voltage THD values are missing or all zero and therefore not reliable.");
  }
  knownLimitations.push("Individual harmonics are not available.");
  knownLimitations.push("Sag, swell, flicker and transient events are not available.");
  if (result.kpi.pfIgnoredSampleCount > 0) {
    knownLimitations.push("Power factor can be distorted during low-load or export periods and is filtered for import relevance.");
  }

  const topFindings = buildTopFindings(result.insights);
  const topPeakEvents = buildPeakEvents(result.spikes);

  const p95Power = quantile(powerValuesKw.map((p) => Math.max(p, 0)), 0.95);
  const p99Power = quantile(powerValuesKw.map((p) => Math.max(p, 0)), 0.99);
  const p95Voltage = quantile(allVoltage, 0.95);
  const p99Voltage = quantile(allVoltage, 0.99);
  const p95Current = quantile(allCurrents, 0.95);
  const p99Current = quantile(allCurrents, 0.99);
  const p95ThdI = quantile(allThdA, 0.95);
  const p99ThdI = quantile(allThdA, 0.99);
  const pfValues = pfImportSignal.map((x) => Math.abs(x.pf ?? 0)).filter((v) => v > 0 && v <= 1);
  const p95Pf = quantile(pfValues, 0.95);
  const p99Pf = quantile(pfValues, 0.99);

  const compactReport: { [key: string]: JsonValue } = {
    report_type: "power_quality_screening",
    source: "Fluke export / Power Analytics Dashboard",
    file_name: ds.fileName,
    measurement_window: {
      start: fmtTimestamp(ds.startTime),
      end: fmtTimestamp(ds.endTime),
      coverage_h: round(result.kpi.durationHours, 2),
      sample_interval_s: ds.intervalSeconds,
      rows: ds.rowCount,
    },
    site_context: {
      measurement_point: "unknown",
      pv_present: result.kpi.exportEnergyKwh > 0 ? true : "unknown",
      billing_interval_min: 15,
      site_type: "unknown",
      notes: "",
    },
    data_quality: {
      has_voltage_l1_l2_l3:
        hasValues(rows.map((r) => r.voltage.L1), (v) => v > 0) &&
        hasValues(rows.map((r) => r.voltage.L2), (v) => v > 0) &&
        hasValues(rows.map((r) => r.voltage.L3), (v) => v > 0),
      has_current_l1_l2_l3:
        hasValues(rows.map((r) => r.current.L1), (v) => v > 0) &&
        hasValues(rows.map((r) => r.current.L2), (v) => v > 0) &&
        hasValues(rows.map((r) => r.current.L3), (v) => v > 0),
      has_neutral_current: hasValues(rows.map((r) => r.current.N)),
      has_frequency: hasValues(rows.map((r) => r.frequency)),
      has_active_power: true,
      has_reactive_power: hasValues(rows.map((r) => r.reactive?.total)),
      has_apparent_power: hasValues(rows.map((r) => r.apparent?.total)),
      has_power_factor: hasValues(rows.map((r) => r.pf.total)),
      has_thd_current: hasValues(allThdA),
      has_thd_voltage: result.kpi.thdVAvailable,
      has_individual_harmonics: false,
      has_sags_swells_transients: false,
      known_limitations: knownLimitations,
    },
    summary: {
      peak_kw: round(result.kpi.peakPowerKw, 2),
      peak_time: fmtTimestamp(result.kpi.peakPowerAt),
      avg_load_kw: round(result.kpi.avgPowerKw, 2),
      import_base_kw: round(result.kpi.baseLoadKw, 2),
      import_energy_kwh: round(result.kpi.energyKwh, 2),
      export_energy_kwh: round(result.kpi.exportEnergyKwh, 2),
      voltage: {
        avg_v: round(result.kpi.voltageAvg, 2),
        min_v: round(result.kpi.voltageMin, 2),
        max_v: round(result.kpi.voltageMax, 2),
      },
      frequency: {
        avg_hz: round(result.kpi.frequencyAvg, 3),
        min_hz: round(result.kpi.frequencyMin, 3),
        max_hz: round(result.kpi.frequencyMax, 3),
      },
      phase_imbalance: {
        avg_pct: round(result.kpi.imbalanceAvgPct, 3),
        max_pct: round(result.kpi.imbalanceMaxPct, 3),
      },
      power_factor: {
        avg: result.kpi.pfImportSampleCount > 0 ? round(result.kpi.pfAvg, 3) : null,
        import_min: result.kpi.pfImportSampleCount > 0 ? round(result.kpi.pfMin, 3) : null,
        import_sample_count: result.kpi.pfImportSampleCount,
        ignored_low_load_or_export_samples: result.kpi.pfIgnoredSampleCount,
      },
      harmonics: {
        thd_i_max_under_load_pct: round(result.kpi.thdAHighLoadMaxPct, 2),
        thd_v_available: result.kpi.thdVAvailable,
      },
      neutral_current: {
        max_a: round(result.kpi.neutralCurrentMax, 2),
      },
      spikes: {
        count: result.spikes.length,
        billing_relevant_15min_count: result.spikes.filter((s) => s.affectsBillingDemand).length,
        peak_to_base_ratio_max: round(maxNumber(result.spikes.map((s) => s.ratioToBase), 0), 3),
      },
      battery_recommendation: {
        power_kw: round(result.battery.recommendedKw, 0),
        capacity_kwh: round(result.battery.recommendedKwh, 0),
        estimated_15min_peak_reduction_pct: round(result.battery.billingPeakReductionPct, 1),
        threshold_kw: round(result.battery.billingTarget15MinKw, 2),
      },
      quantiles: {
        power_kw: { p95: p95Power !== null ? round(p95Power, 2) : null, p99: p99Power !== null ? round(p99Power, 2) : null },
        voltage_v: { p95: p95Voltage !== null ? round(p95Voltage, 2) : null, p99: p99Voltage !== null ? round(p99Voltage, 2) : null },
        current_a: { p95: p95Current !== null ? round(p95Current, 2) : null, p99: p99Current !== null ? round(p99Current, 2) : null },
        thd_i_pct: { p95: p95ThdI !== null ? round(p95ThdI, 2) : null, p99: p99ThdI !== null ? round(p99ThdI, 2) : null },
        pf: { p95: p95Pf !== null ? round(p95Pf, 3) : null, p99: p99Pf !== null ? round(p99Pf, 3) : null },
      },
    },
    top_findings: topFindings,
    top_peak_events: topPeakEvents,
  };

  const compactReportJson = JSON.stringify(compactReport, null, 2);
  let finalPrompt = buildPromptInstructions(compactReportJson);
  let truncated = false;
  if (finalPrompt.length > MAX_PROMPT_CHARS) {
    compactReport.top_peak_events = topPeakEvents.slice(0, 5);
    compactReport.top_findings = topFindings.slice(0, 5);
    finalPrompt = buildPromptInstructions(JSON.stringify(compactReport, null, 2));
    truncated = finalPrompt.length > MAX_PROMPT_CHARS;
  }

  return { compactReport, finalPrompt: finalPrompt.slice(0, MAX_PROMPT_CHARS), truncated };
}
