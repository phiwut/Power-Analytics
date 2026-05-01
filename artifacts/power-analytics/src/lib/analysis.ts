import type { MeasurementRow, ParsedDataset } from "./parser";

export interface Thresholds {
  voltageNominal: number; // V
  voltageTolerancePct: number; // ±%
  thdVWarn: number; // %
  thdVCritical: number;
  thdAWarn: number;
  thdACritical: number;
  thdAMinCurrentA: number;
  thdAMinCurrentPeakPct: number;
  pfWarn: number; // below
  pfCritical: number;
  pfMinImportKw: number;
  imbalanceWarnPct: number;
  imbalanceCriticalPct: number;
  neutralWarnPctOfPhase: number;
  frequencyNominal: number;
  frequencyTolerance: number; // ±Hz
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  voltageNominal: 230,
  voltageTolerancePct: 10,
  thdVWarn: 5,
  thdVCritical: 8,
  thdAWarn: 15,
  thdACritical: 25,
  thdAMinCurrentA: 10,
  thdAMinCurrentPeakPct: 20,
  pfWarn: 0.9,
  pfCritical: 0.8,
  pfMinImportKw: 1,
  imbalanceWarnPct: 2,
  imbalanceCriticalPct: 5,
  neutralWarnPctOfPhase: 50,
  frequencyNominal: 50,
  frequencyTolerance: 0.5,
};

export type Severity = "ok" | "info" | "warning" | "critical";

export interface Insight {
  id: string;
  severity: Severity;
  category:
    | "voltage"
    | "current"
    | "power"
    | "thd"
    | "powerfactor"
    | "imbalance"
    | "neutral"
    | "frequency"
    | "load"
    | "battery"
    | "summary";
  title: string;
  detail: string;
  metric?: { value: number; unit: string };
}

export interface KpiSummary {
  totalRows: number;
  durationHours: number;
  intervalSeconds: number;
  avgPowerKw: number;
  peakPowerKw: number;
  peakPowerAt: number;
  minPowerKw: number;
  energyKwh: number;
  baseLoadKw: number;
  peakToAvg: number;
  voltageAvg: number;
  voltageMin: number;
  voltageMax: number;
  voltageStability: number; // CV %
  imbalanceAvgPct: number;
  imbalanceMaxPct: number;
  pfAvg: number;
  pfMin: number;
  pfImportSampleCount: number;
  pfIgnoredSampleCount: number;
  exportEnergyKwh: number;
  exportPeakKw: number;
  thdVMaxPct: number;
  thdVAvailable: boolean;
  thdAMaxPct: number;
  thdAHighLoadMaxPct: number;
  thdALoadThresholdA: number;
  frequencyAvg: number;
  frequencyMin: number;
  frequencyMax: number;
  neutralCurrentMax: number;
  spikeCount: number;
  capacityFactor: number; // baseload / peak
}

export interface BatteryAssessment {
  recommendedKwh: number;
  recommendedKw: number;
  peakReductionKw: number;
  peakReductionPct: number;
  shavedPeakKw: number;
  rawPeakReductionKw: number;
  rawPeakReductionPct: number;
  billingPeak15MinKw: number;
  billingTarget15MinKw: number;
  billingPeakReductionKw: number;
  billingPeakReductionPct: number;
  cycleEnergyPerDayKwh: number;
  estimatedSavingsKwh: number;
}

export interface AnalysisResult {
  kpi: KpiSummary;
  insights: Insight[];
  battery: BatteryAssessment;
  buckets: BucketStats[];
  hourlyProfile: HourlyProfile[];
  spikes: SpikeEvent[];
}

export interface SpikeEvent {
  timestamp: number;
  endTimestamp: number;
  powerKw: number;
  ratioToBase: number;
  durationSec: number;
  energyAboveThresholdKwh: number;
  thresholdKw: number;
  affectsBillingDemand: boolean;
}

export interface BucketStats {
  start: number;
  end: number;
  avgPowerKw: number;
  maxPowerKw: number;
  minPowerKw: number;
  voltageAvg: number;
  pfAvg: number;
  imbalancePct: number;
}

export interface HourlyProfile {
  hour: number;
  avgPowerKw: number;
  maxPowerKw: number;
  count: number;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

function nonZeroValues(values: number[]): number[] {
  return values.filter((v) => Number.isFinite(v) && Math.abs(v) > 1e-9);
}

function rollingAverage(values: number[], windowSize: number): number[] {
  if (values.length === 0) return [];
  const size = Math.max(1, Math.min(windowSize, values.length));
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= size) sum -= values[i - size]!;
    if (i >= size - 1) out.push(sum / size);
  }
  return out.length ? out : [mean(values)];
}

function imbalancePct(v1: number, v2: number, v3: number): number {
  const vals = [v1, v2, v3].filter((v) => v > 0);
  if (vals.length === 0) return 0;
  const avg = mean(vals);
  if (avg === 0) return 0;
  const maxDev = Math.max(...vals.map((v) => Math.abs(v - avg)));
  return (maxDev / avg) * 100;
}

export function analyse(
  ds: ParsedDataset,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): AnalysisResult {
  const rows = ds.rows;
  const insights: Insight[] = [];

  // Convert to kW (assume input is W, but check)
  const sampleP = rows.slice(0, 50).map((r) => r.power.total).filter((v) => v > 0);
  const isWatts = mean(sampleP) > 1000;
  const wattScale = isWatts ? 1 / 1000 : 1;

  const powers = rows.map((r) => r.power.total * wattScale);
  const importPowers = powers.map((p) => Math.max(p, 0));
  const exportPowers = powers.map((p) => Math.max(-p, 0));
  const positiveImportPowers = importPowers.filter((p) => p > 0);
  const sortedImportPowers = [...positiveImportPowers].sort((a, b) => a - b);

  const peakPowerKw = Math.max(...powers, 0);
  const peakIdx = powers.indexOf(peakPowerKw);
  const peakPowerAt = rows[peakIdx]?.timestamp ?? rows[0]!.timestamp;
  const minPowerKw = Math.min(...powers);
  const avgPowerKw = mean(importPowers);
  const baseLoadKw = quantile(sortedImportPowers, 0.10);

  // Energy
  const intervalH = ds.intervalSeconds / 3600;
  const energyKwh = importPowers.reduce((a, b) => a + b * intervalH, 0);
  const exportEnergyKwh = exportPowers.reduce((a, b) => a + b * intervalH, 0);
  const exportPeakKw = Math.max(...exportPowers, 0);
  const durationHours = ds.durationMs / 3_600_000;

  // Voltage stats
  const allV = rows.flatMap((r) => [r.voltage.L1, r.voltage.L2, r.voltage.L3]).filter((v) => v > 0);
  const voltageAvg = mean(allV);
  const voltageMin = Math.min(...allV);
  const voltageMax = Math.max(...allV);
  const voltageStability = voltageAvg ? (stdev(allV) / voltageAvg) * 100 : 0;

  // Imbalance
  const imbal = rows.map((r) => imbalancePct(r.voltage.L1, r.voltage.L2, r.voltage.L3));
  const imbalAvg = mean(imbal);
  const imbalMax = Math.max(...imbal, 0);

  // PF is meaningful only during material import. Export and near-zero load
  // periods are tracked separately instead of being treated as poor PF.
  const peakImportKw = Math.max(...importPowers, 0);
  const pfImportMinKw = Math.max(thresholds.pfMinImportKw, peakImportKw * 0.02);
  const pfImportVals = rows
    .map((r, i) => ({ pf: r.pf.total, p: powers[i]! }))
    .filter(
      (x): x is { pf: number; p: number } =>
        typeof x.pf === "number" && x.p >= pfImportMinKw,
    )
    .map((x) => Math.abs(x.pf))
    .filter((pf) => Number.isFinite(pf) && pf > 0 && pf <= 1);
  const pfIgnoredSampleCount = rows.filter(
    (r, i) => typeof r.pf.total === "number" && powers[i]! < pfImportMinKw,
  ).length;
  const pfAvg = pfImportVals.length ? mean(pfImportVals) : 1;
  const pfMin = pfImportVals.length ? Math.min(...pfImportVals) : 1;

  // THD
  const thdVAll = rows
    .flatMap((r) => [r.thdV.L1, r.thdV.L2, r.thdV.L3])
    .filter((v): v is number => typeof v === "number");
  const thdVNonZero = nonZeroValues(thdVAll);
  const thdVAvailable = thdVNonZero.length > 0;
  const thdVMax = thdVAvailable ? Math.max(...thdVNonZero) : 0;

  const phaseCurrentValues = rows
    .flatMap((r) => [r.current.L1, r.current.L2, r.current.L3])
    .filter((v) => v > 0);
  const phaseCurrentPeak = Math.max(...phaseCurrentValues, 0);
  const thdALoadThresholdA = Math.max(
    thresholds.thdAMinCurrentA,
    (phaseCurrentPeak * thresholds.thdAMinCurrentPeakPct) / 100,
  );
  const thdAAll = rows.flatMap((r) => [r.thdA.L1, r.thdA.L2, r.thdA.L3]).filter(
    (v): v is number => typeof v === "number",
  );
  const thdAHighLoad = rows.flatMap((r) =>
    (["L1", "L2", "L3"] as const)
      .map((phase) => ({
        current: r.current[phase],
        thd: r.thdA[phase],
      }))
      .filter(
        (x): x is { current: number; thd: number } =>
          x.current >= thdALoadThresholdA && typeof x.thd === "number",
      )
      .map((x) => x.thd),
  );
  const thdAMax = thdAAll.length ? Math.max(...thdAAll) : 0;
  const thdAHighLoadMax = thdAHighLoad.length ? Math.max(...thdAHighLoad) : 0;

  // Frequency
  const freqVals = rows.map((r) => r.frequency).filter((v): v is number => typeof v === "number");
  const frequencyAvg = freqVals.length ? mean(freqVals) : 0;
  const frequencyMin = freqVals.length ? Math.min(...freqVals) : 0;
  const frequencyMax = freqVals.length ? Math.max(...freqVals) : 0;

  // Neutral
  const neutVals = rows.map((r) => r.current.N).filter((v): v is number => typeof v === "number");
  const neutralCurrentMax = neutVals.length ? Math.max(...neutVals) : 0;
  const phaseCurrentAvg = mean(phaseCurrentValues);

  const billingWindowSamples = Math.max(1, Math.ceil(900 / ds.intervalSeconds));
  const billingDemand = rollingAverage(importPowers, billingWindowSamples);
  const sortedBillingDemand = [...billingDemand].sort((a, b) => a - b);
  const billingPeak15MinKw = Math.max(...billingDemand, 0);
  const billingTarget15MinKw = quantile(sortedBillingDemand, 0.95);

  const spikeAffectsBilling = (startIdx: number, endExclusiveIdx: number): boolean => {
    const eventEndIdx = Math.max(startIdx, endExclusiveIdx - 1);
    return billingDemand.some((avg, billingIdx) => {
      const windowEndIdx = billingIdx + billingWindowSamples - 1;
      const windowStartIdx = windowEndIdx - billingWindowSamples + 1;
      const overlaps = windowStartIdx <= eventEndIdx && windowEndIdx >= startIdx;
      return overlaps && avg >= billingTarget15MinKw && avg > 0;
    });
  };

  // Spikes (above 1.8x baseload, contiguous)
  const spikeThreshold = Math.max(baseLoadKw * 1.8, avgPowerKw * 1.5);
  const spikes: SpikeEvent[] = [];
  let inSpike = false;
  let spikeStart = 0;
  let spikePeak = 0;
  let spikeEnergyAbove = 0;
  for (let i = 0; i < importPowers.length; i++) {
    const p = importPowers[i]!;
    if (p >= spikeThreshold) {
      if (!inSpike) {
        inSpike = true;
        spikeStart = i;
        spikePeak = p;
        spikeEnergyAbove = 0;
      } else {
        spikePeak = Math.max(spikePeak, p);
      }
      spikeEnergyAbove += (p - spikeThreshold) * intervalH;
    } else if (inSpike) {
      const dur = ((i - spikeStart) * ds.intervalSeconds);
      spikes.push({
        timestamp: rows[spikeStart]!.timestamp,
        endTimestamp: rows[i - 1]!.timestamp,
        powerKw: spikePeak,
        ratioToBase: baseLoadKw > 0 ? spikePeak / baseLoadKw : 0,
        durationSec: dur,
        energyAboveThresholdKwh: spikeEnergyAbove,
        thresholdKw: spikeThreshold,
        affectsBillingDemand: spikeAffectsBilling(spikeStart, i),
      });
      inSpike = false;
    }
  }
  if (inSpike) {
    const dur = ((importPowers.length - spikeStart) * ds.intervalSeconds);
    spikes.push({
      timestamp: rows[spikeStart]!.timestamp,
      endTimestamp: rows[rows.length - 1]!.timestamp,
      powerKw: spikePeak,
      ratioToBase: baseLoadKw > 0 ? spikePeak / baseLoadKw : 0,
      durationSec: dur,
      energyAboveThresholdKwh: spikeEnergyAbove,
      thresholdKw: spikeThreshold,
      affectsBillingDemand: spikeAffectsBilling(spikeStart, importPowers.length),
    });
  }

  // KPI
  const kpi: KpiSummary = {
    totalRows: rows.length,
    durationHours,
    intervalSeconds: ds.intervalSeconds,
    avgPowerKw,
    peakPowerKw,
    peakPowerAt,
    minPowerKw,
    energyKwh,
    baseLoadKw,
    peakToAvg: avgPowerKw > 0 ? peakPowerKw / avgPowerKw : 0,
    voltageAvg,
    voltageMin,
    voltageMax,
    voltageStability,
    imbalanceAvgPct: imbalAvg,
    imbalanceMaxPct: imbalMax,
    pfAvg,
    pfMin,
    pfImportSampleCount: pfImportVals.length,
    pfIgnoredSampleCount,
    exportEnergyKwh,
    exportPeakKw,
    thdVMaxPct: thdVMax,
    thdVAvailable,
    thdAMaxPct: thdAMax,
    thdAHighLoadMaxPct: thdAHighLoadMax,
    thdALoadThresholdA,
    frequencyAvg,
    frequencyMin,
    frequencyMax,
    neutralCurrentMax,
    spikeCount: spikes.length,
    capacityFactor: peakPowerKw > 0 ? baseLoadKw / peakPowerKw : 0,
  };

  // Insights
  // Voltage health
  const vTolLow = thresholds.voltageNominal * (1 - thresholds.voltageTolerancePct / 100);
  const vTolHigh = thresholds.voltageNominal * (1 + thresholds.voltageTolerancePct / 100);
  if (voltageMin < vTolLow || voltageMax > vTolHigh) {
    insights.push({
      id: "voltage-out-of-range",
      severity: "critical",
      category: "voltage",
      title: "Voltage outside nominal tolerance",
      detail: `Voltage ranged from ${voltageMin.toFixed(1)} V to ${voltageMax.toFixed(
        1,
      )} V — outside the ±${thresholds.voltageTolerancePct}% tolerance band around ${thresholds.voltageNominal} V.`,
    });
  } else if (voltageStability < 0.5) {
    insights.push({
      id: "voltage-stable",
      severity: "ok",
      category: "voltage",
      title: "Voltage is highly stable",
      detail: `Phase voltages stayed within ${voltageStability.toFixed(
        2,
      )}% of average — excellent supply quality.`,
    });
  } else {
    insights.push({
      id: "voltage-ok",
      severity: "info",
      category: "voltage",
      title: "Voltage within tolerance",
      detail: `Voltage band ${voltageMin.toFixed(1)}–${voltageMax.toFixed(
        1,
      )} V around ${voltageAvg.toFixed(1)} V average.`,
    });
  }

  // Imbalance
  if (imbalMax >= thresholds.imbalanceCriticalPct) {
    insights.push({
      id: "imbalance-critical",
      severity: "critical",
      category: "imbalance",
      title: "Severe phase imbalance detected",
      detail: `Peak voltage imbalance of ${imbalMax.toFixed(
        2,
      )}% exceeds ${thresholds.imbalanceCriticalPct}%. Investigate single-phase loads or distribution faults.`,
    });
  } else if (imbalMax >= thresholds.imbalanceWarnPct) {
    insights.push({
      id: "imbalance-warning",
      severity: "warning",
      category: "imbalance",
      title: "Moderate phase imbalance",
      detail: `Voltage imbalance peaks at ${imbalMax.toFixed(
        2,
      )}%, average ${imbalAvg.toFixed(2)}%. Consider rebalancing single-phase loads.`,
    });
  } else {
    insights.push({
      id: "imbalance-ok",
      severity: "ok",
      category: "imbalance",
      title: "Phases are well balanced",
      detail: `Average imbalance ${imbalAvg.toFixed(2)}% — within healthy range.`,
    });
  }

  // PF
  if (pfMin < thresholds.pfCritical && pfImportVals.length) {
    insights.push({
      id: "pf-critical",
      severity: "critical",
      category: "powerfactor",
      title: "Poor import power factor",
      detail: `Import power factor dropped to ${pfMin.toFixed(2)} (avg ${pfAvg.toFixed(
        2,
      )}) during ${pfImportVals.length.toLocaleString()} material import samples. Reactive compensation could reduce billing penalties.`,
    });
  } else if (pfAvg < thresholds.pfWarn && pfImportVals.length) {
    insights.push({
      id: "pf-warning",
      severity: "warning",
      category: "powerfactor",
      title: "Import power factor below ideal",
      detail: `Average import PF ${pfAvg.toFixed(2)}. Export and near-zero load samples are excluded from this assessment.`,
    });
  } else if (pfImportVals.length) {
    insights.push({
      id: "pf-ok",
      severity: "ok",
      category: "powerfactor",
      title: "Healthy import power factor",
      detail: `Average import PF ${pfAvg.toFixed(2)} across material import periods.`,
    });
  } else if (pfIgnoredSampleCount > 0) {
    insights.push({
      id: "pf-not-assessed",
      severity: "info",
      category: "powerfactor",
      title: "Power factor not assessed",
      detail: `PF values were present, but load was below ${pfImportMinKw.toFixed(
        1,
      )} kW import or in export. Negative/near-zero PF was not marked critical without context.`,
    });
  }

  // THD V
  if (!thdVAvailable && thdVAll.length > 0) {
    insights.push({
      id: "thdv-not-available",
      severity: "info",
      category: "thd",
      title: "Voltage THD not available",
      detail: "Voltage THD values are all zero, which usually means the meter did not measure or export THD V. They are not treated as healthy readings.",
    });
  } else if (thdVMax >= thresholds.thdVCritical) {
    insights.push({
      id: "thdv-critical",
      severity: "critical",
      category: "thd",
      title: "High voltage THD",
      detail: `Peak voltage THD ${thdVMax.toFixed(
        1,
      )}% exceeds ${thresholds.thdVCritical}%. Harmonic filters recommended.`,
    });
  } else if (thdVMax >= thresholds.thdVWarn) {
    insights.push({
      id: "thdv-warning",
      severity: "warning",
      category: "thd",
      title: "Elevated voltage THD",
      detail: `Voltage THD reached ${thdVMax.toFixed(
        1,
      )}%. Within EN 50160 limits but worth monitoring.`,
    });
  }

  // THD A
  if (thdAHighLoadMax >= thresholds.thdACritical) {
    insights.push({
      id: "thda-critical",
      severity: "critical",
      category: "thd",
      title: "High current THD under load",
      detail: `Current THD reached ${thdAHighLoadMax.toFixed(
        1,
      )}% while phase current was at least ${thdALoadThresholdA.toFixed(
        1,
      )} A. Non-linear loads may be creating significant harmonic distortion.`,
    });
  } else if (thdAHighLoadMax >= thresholds.thdAWarn) {
    insights.push({
      id: "thda-warning",
      severity: "warning",
      category: "thd",
      title: "Elevated current THD under load",
      detail: `Current THD reached ${thdAHighLoadMax.toFixed(
        1,
      )}% during loaded periods. Low-load THD spikes are excluded from this finding.`,
    });
  } else if (thdAMax >= thresholds.thdAWarn && thdAHighLoad.length === 0) {
    insights.push({
      id: "thda-low-load-only",
      severity: "info",
      category: "thd",
      title: "Current THD only high at low load",
      detail: `Raw current THD reached ${thdAMax.toFixed(
        1,
      )}%, but no samples met the ${thdALoadThresholdA.toFixed(
        1,
      )} A load threshold for a loaded THD assessment.`,
    });
  }

  // Frequency
  if (
    freqVals.length &&
    (Math.abs(frequencyMin - thresholds.frequencyNominal) > thresholds.frequencyTolerance ||
      Math.abs(frequencyMax - thresholds.frequencyNominal) > thresholds.frequencyTolerance)
  ) {
    insights.push({
      id: "frequency-deviation",
      severity: "warning",
      category: "frequency",
      title: "Frequency excursions detected",
      detail: `Frequency ranged ${frequencyMin.toFixed(3)}–${frequencyMax.toFixed(
        3,
      )} Hz around ${thresholds.frequencyNominal} Hz nominal.`,
    });
  } else if (freqVals.length) {
    insights.push({
      id: "frequency-stable",
      severity: "ok",
      category: "frequency",
      title: "Stable grid frequency",
      detail: `Frequency held at ${frequencyAvg.toFixed(3)} Hz throughout the dataset.`,
    });
  }

  // Neutral
  if (
    neutralCurrentMax > 0 &&
    phaseCurrentAvg > 0 &&
    neutralCurrentMax > (phaseCurrentAvg * thresholds.neutralWarnPctOfPhase) / 100
  ) {
    insights.push({
      id: "neutral-warning",
      severity: "warning",
      category: "neutral",
      title: "Elevated neutral current",
      detail: `Neutral current peaked at ${neutralCurrentMax.toFixed(
        1,
      )} A — typical of harmonic-rich or unbalanced single-phase loads.`,
    });
  }

  // Spikes / cyclic behavior
  if (spikes.length > 0) {
    const intervals: number[] = [];
    for (let i = 1; i < spikes.length; i++) {
      intervals.push((spikes[i]!.timestamp - spikes[i - 1]!.timestamp) / 1000);
    }
    const avgInterval = intervals.length ? mean(intervals) : 0;
    const intervalStd = intervals.length ? stdev(intervals) : 0;
    const isCyclic =
      intervals.length >= 3 && avgInterval > 0 && intervalStd / avgInterval < 0.4;

    insights.push({
      id: "load-spikes",
      severity: "info",
      category: "load",
      title: `${spikes.length} load spike${spikes.length === 1 ? "" : "s"} detected`,
      detail: isCyclic
        ? `Spikes recur every ~${formatDuration(avgInterval * 1000)} — consistent with cyclic equipment (compressor, motor, oven).`
        : `Spike events reach up to ${Math.max(...spikes.map((s) => s.powerKw)).toFixed(
            1,
          )} kW vs ${baseLoadKw.toFixed(1)} kW import base load. ${spikes.filter((s) => s.affectsBillingDemand).length} event${spikes.filter((s) => s.affectsBillingDemand).length === 1 ? "" : "s"} affect 15-minute demand.`,
    });
  }

  // Battery / peak shaving
  const rawTargetKw = quantile(sortedImportPowers, 0.95);
  const rawPeakReductionKw = Math.max(0, peakPowerKw - rawTargetKw);
  const rawPeakReductionPct = peakPowerKw > 0 ? (rawPeakReductionKw / peakPowerKw) * 100 : 0;

  const billingPeakReductionKw = Math.max(0, billingPeak15MinKw - billingTarget15MinKw);
  const billingPeakReductionPct =
    billingPeak15MinKw > 0 ? (billingPeakReductionKw / billingPeak15MinKw) * 100 : 0;
  const peakReductionKw = billingPeakReductionKw;
  const peakReductionPct = billingPeakReductionPct;

  // Energy stored above p95 per typical day
  const aboveBillingTarget = billingDemand
    .filter((p) => p > billingTarget15MinKw)
    .map((p) => p - billingTarget15MinKw);
  const billingIntervalH = ds.intervalSeconds / 3600;
  const cycleEnergyDay =
    aboveBillingTarget.reduce((a, b) => a + b * billingIntervalH, 0) /
    Math.max(durationHours / 24, 1);

  // Battery sizing: 2x cycle energy for 50% DoD margin, with min 1h discharge
  const recommendedKwh = Math.max(cycleEnergyDay * 2, peakReductionKw * 1);
  const recommendedKw = peakReductionKw;

  const battery: BatteryAssessment = {
    recommendedKwh,
    recommendedKw,
    peakReductionKw,
    peakReductionPct,
    shavedPeakKw: peakReductionKw,
    rawPeakReductionKw,
    rawPeakReductionPct,
    billingPeak15MinKw,
    billingTarget15MinKw,
    billingPeakReductionKw,
    billingPeakReductionPct,
    cycleEnergyPerDayKwh: cycleEnergyDay,
    estimatedSavingsKwh: cycleEnergyDay * 30,
  };

  if (peakReductionPct > 20 && billingPeak15MinKw > 1) {
    insights.push({
      id: "peak-shaving",
      severity: "info",
      category: "battery",
      title: "Strong 15-minute peak-shaving candidate",
      detail: `15-minute demand above ${billingTarget15MinKw.toFixed(
        1,
      )} kW could be shaved with a ${recommendedKw.toFixed(
        0,
      )} kW / ${recommendedKwh.toFixed(0)} kWh battery — ${peakReductionPct.toFixed(
        0,
      )}% billing-demand reduction potential. Raw instant peak reduction is ${rawPeakReductionPct.toFixed(0)}%.`,
    });
  } else if (billingPeak15MinKw > 1) {
    insights.push({
      id: "peak-shaving-low",
      severity: "ok",
      category: "battery",
      title: "Limited billing peak-shaving benefit",
      detail: `15-minute peak demand is ${billingPeak15MinKw.toFixed(
        1,
      )} kW; reducing to the 95th percentile would save ${billingPeakReductionKw.toFixed(
        1,
      )} kW. Instantaneous spikes are shown separately.`,
    });
  }

  // Demand summary
  insights.unshift({
    id: "demand-summary",
    severity: "info",
    category: "summary",
    title: `Maximum demand reached ${peakPowerKw.toFixed(1)} kW`,
    detail: `Average import load ${avgPowerKw.toFixed(1)} kW, positive import base load ${baseLoadKw.toFixed(
      1,
    )} kW. Import energy ${energyKwh.toFixed(1)} kWh${exportEnergyKwh > 0 ? `, export energy ${exportEnergyKwh.toFixed(1)} kWh` : ""} over ${durationHours.toFixed(1)} h.`,
  });

  // Buckets — adaptive
  const bucketCount = Math.min(48, Math.max(8, Math.floor(rows.length / 30)));
  const bucketSize = Math.ceil(rows.length / bucketCount);
  const buckets: BucketStats[] = [];
  for (let i = 0; i < rows.length; i += bucketSize) {
    const slice = rows.slice(i, i + bucketSize);
    if (slice.length === 0) continue;
    const ps = slice.map((r) => r.power.total * wattScale);
    const vs = slice.flatMap((r) => [r.voltage.L1, r.voltage.L2, r.voltage.L3]).filter((v) => v > 0);
    const pfs = slice
      .map((r) => r.pf.total)
      .filter((v): v is number => typeof v === "number");
    const imbs = slice.map((r) => imbalancePct(r.voltage.L1, r.voltage.L2, r.voltage.L3));
    buckets.push({
      start: slice[0]!.timestamp,
      end: slice[slice.length - 1]!.timestamp,
      avgPowerKw: mean(ps),
      maxPowerKw: Math.max(...ps),
      minPowerKw: Math.min(...ps),
      voltageAvg: mean(vs),
      pfAvg: pfs.length ? mean(pfs) : 1,
      imbalancePct: mean(imbs),
    });
  }

  // Hourly profile
  const hourlyMap = new Map<number, { sum: number; max: number; count: number }>();
  for (let i = 0; i < rows.length; i++) {
    const h = new Date(rows[i]!.timestamp).getHours();
    const cur = hourlyMap.get(h) || { sum: 0, max: 0, count: 0 };
    cur.sum += powers[i]!;
    cur.max = Math.max(cur.max, powers[i]!);
    cur.count += 1;
    hourlyMap.set(h, cur);
  }
  const hourlyProfile: HourlyProfile[] = [];
  for (let h = 0; h < 24; h++) {
    const m = hourlyMap.get(h);
    if (m && m.count > 0) {
      hourlyProfile.push({
        hour: h,
        avgPowerKw: m.sum / m.count,
        maxPowerKw: m.max,
        count: m.count,
      });
    } else {
      hourlyProfile.push({ hour: h, avgPowerKw: 0, maxPowerKw: 0, count: 0 });
    }
  }

  return { kpi, insights, battery, buckets, hourlyProfile, spikes };
}

export function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = sec / 3600;
  if (hr < 48) return `${hr.toFixed(1)}h`;
  return `${(hr / 24).toFixed(1)}d`;
}

export function severityClass(s: Severity): string {
  switch (s) {
    case "ok":
      return "text-emerald-600 dark:text-emerald-400";
    case "info":
      return "text-blue-600 dark:text-blue-400";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    case "critical":
      return "text-red-600 dark:text-red-400";
  }
}

export function severityBg(s: Severity): string {
  switch (s) {
    case "ok":
      return "bg-emerald-500/10 border-emerald-500/30";
    case "info":
      return "bg-blue-500/10 border-blue-500/30";
    case "warning":
      return "bg-amber-500/10 border-amber-500/30";
    case "critical":
      return "bg-red-500/10 border-red-500/30";
  }
}

export function severityDot(s: Severity): string {
  switch (s) {
    case "ok":
      return "bg-emerald-500";
    case "info":
      return "bg-blue-500";
    case "warning":
      return "bg-amber-500";
    case "critical":
      return "bg-red-500";
  }
}

export interface MetricSeries {
  key: string;
  label: string;
  group: string;
  unit: string;
  color: string;
  enabledByDefault: boolean;
  getValue: (r: MeasurementRow) => number | undefined;
}

export const METRIC_SERIES: MetricSeries[] = [
  {
    key: "p_total",
    label: "Active Power Total",
    group: "Power",
    unit: "kW",
    color: "hsl(var(--chart-1))",
    enabledByDefault: true,
    getValue: (r) => r.power.total / 1000,
  },
  {
    key: "p_l1",
    label: "Active Power L1",
    group: "Power",
    unit: "kW",
    color: "hsl(var(--chart-1))",
    enabledByDefault: false,
    getValue: (r) => (r.power.L1 !== undefined ? r.power.L1 / 1000 : undefined),
  },
  {
    key: "p_l2",
    label: "Active Power L2",
    group: "Power",
    unit: "kW",
    color: "hsl(var(--chart-2))",
    enabledByDefault: false,
    getValue: (r) => (r.power.L2 !== undefined ? r.power.L2 / 1000 : undefined),
  },
  {
    key: "p_l3",
    label: "Active Power L3",
    group: "Power",
    unit: "kW",
    color: "hsl(var(--chart-3))",
    enabledByDefault: false,
    getValue: (r) => (r.power.L3 !== undefined ? r.power.L3 / 1000 : undefined),
  },
  {
    key: "v_l1",
    label: "Voltage L1",
    group: "Voltage",
    unit: "V",
    color: "hsl(var(--chart-1))",
    enabledByDefault: false,
    getValue: (r) => r.voltage.L1,
  },
  {
    key: "v_l2",
    label: "Voltage L2",
    group: "Voltage",
    unit: "V",
    color: "hsl(var(--chart-2))",
    enabledByDefault: false,
    getValue: (r) => r.voltage.L2,
  },
  {
    key: "v_l3",
    label: "Voltage L3",
    group: "Voltage",
    unit: "V",
    color: "hsl(var(--chart-3))",
    enabledByDefault: false,
    getValue: (r) => r.voltage.L3,
  },
  {
    key: "i_l1",
    label: "Current L1",
    group: "Current",
    unit: "A",
    color: "hsl(var(--chart-1))",
    enabledByDefault: false,
    getValue: (r) => r.current.L1,
  },
  {
    key: "i_l2",
    label: "Current L2",
    group: "Current",
    unit: "A",
    color: "hsl(var(--chart-2))",
    enabledByDefault: false,
    getValue: (r) => r.current.L2,
  },
  {
    key: "i_l3",
    label: "Current L3",
    group: "Current",
    unit: "A",
    color: "hsl(var(--chart-3))",
    enabledByDefault: false,
    getValue: (r) => r.current.L3,
  },
  {
    key: "i_n",
    label: "Current Neutral",
    group: "Current",
    unit: "A",
    color: "hsl(var(--chart-4))",
    enabledByDefault: false,
    getValue: (r) => r.current.N,
  },
  {
    key: "freq",
    label: "Frequency",
    group: "Frequency",
    unit: "Hz",
    color: "hsl(var(--chart-5))",
    enabledByDefault: false,
    getValue: (r) => r.frequency,
  },
  {
    key: "pf",
    label: "Power Factor",
    group: "Power Factor",
    unit: "",
    color: "hsl(var(--chart-5))",
    enabledByDefault: false,
    getValue: (r) => r.pf.total,
  },
  {
    key: "thdv_l1",
    label: "THD V L1",
    group: "THD",
    unit: "%",
    color: "hsl(var(--chart-1))",
    enabledByDefault: false,
    getValue: (r) => r.thdV.L1,
  },
  {
    key: "thdv_l2",
    label: "THD V L2",
    group: "THD",
    unit: "%",
    color: "hsl(var(--chart-2))",
    enabledByDefault: false,
    getValue: (r) => r.thdV.L2,
  },
  {
    key: "thdv_l3",
    label: "THD V L3",
    group: "THD",
    unit: "%",
    color: "hsl(var(--chart-3))",
    enabledByDefault: false,
    getValue: (r) => r.thdV.L3,
  },
  {
    key: "thda_l1",
    label: "THD A L1",
    group: "THD",
    unit: "%",
    color: "hsl(var(--chart-1))",
    enabledByDefault: false,
    getValue: (r) => r.thdA.L1,
  },
  {
    key: "thda_l2",
    label: "THD A L2",
    group: "THD",
    unit: "%",
    color: "hsl(var(--chart-2))",
    enabledByDefault: false,
    getValue: (r) => r.thdA.L2,
  },
  {
    key: "thda_l3",
    label: "THD A L3",
    group: "THD",
    unit: "%",
    color: "hsl(var(--chart-3))",
    enabledByDefault: false,
    getValue: (r) => r.thdA.L3,
  },
];

export function downsample<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out: T[] = [];
  for (let i = 0; i < target; i++) {
    out.push(arr[Math.floor(i * step)]!);
  }
  // Always include last
  if (out[out.length - 1] !== arr[arr.length - 1]) {
    out.push(arr[arr.length - 1]!);
  }
  return out;
}
