import type { MeasurementRow, ParsedDataset } from "./parser";

export interface Thresholds {
  voltageNominal: number; // V
  voltageTolerancePct: number; // ±%
  thdVWarn: number; // %
  thdVCritical: number;
  thdAWarn: number;
  thdACritical: number;
  pfWarn: number; // below
  pfCritical: number;
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
  pfWarn: 0.9,
  pfCritical: 0.8,
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
  thdVMaxPct: number;
  thdAMaxPct: number;
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
  powerKw: number;
  ratioToBase: number;
  durationSec: number;
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
  const sortedPowers = [...powers].sort((a, b) => a - b);

  const peakPowerKw = Math.max(...powers, 0);
  const peakIdx = powers.indexOf(peakPowerKw);
  const peakPowerAt = rows[peakIdx]?.timestamp ?? rows[0]!.timestamp;
  const minPowerKw = Math.min(...powers);
  const avgPowerKw = mean(powers);
  const baseLoadKw = quantile(sortedPowers, 0.05);

  // Energy
  const intervalH = ds.intervalSeconds / 3600;
  const energyKwh = powers.reduce((a, b) => a + b * intervalH, 0);
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

  // PF
  const pfVals = rows.map((r) => r.pf.total).filter((v): v is number => typeof v === "number");
  const pfAvg = pfVals.length ? mean(pfVals) : 1;
  const pfMin = pfVals.length ? Math.min(...pfVals) : 1;

  // THD
  const thdVAll = rows
    .flatMap((r) => [r.thdV.L1, r.thdV.L2, r.thdV.L3])
    .filter((v): v is number => typeof v === "number");
  const thdAAll = rows
    .flatMap((r) => [r.thdA.L1, r.thdA.L2, r.thdA.L3])
    .filter((v): v is number => typeof v === "number");
  const thdVMax = thdVAll.length ? Math.max(...thdVAll) : 0;
  const thdAMax = thdAAll.length ? Math.max(...thdAAll) : 0;

  // Frequency
  const freqVals = rows.map((r) => r.frequency).filter((v): v is number => typeof v === "number");
  const frequencyAvg = freqVals.length ? mean(freqVals) : 0;
  const frequencyMin = freqVals.length ? Math.min(...freqVals) : 0;
  const frequencyMax = freqVals.length ? Math.max(...freqVals) : 0;

  // Neutral
  const neutVals = rows.map((r) => r.current.N).filter((v): v is number => typeof v === "number");
  const neutralCurrentMax = neutVals.length ? Math.max(...neutVals) : 0;
  const phaseCurrentAvg = mean(
    rows.flatMap((r) => [r.current.L1, r.current.L2, r.current.L3]).filter((v) => v > 0),
  );

  // Spikes (above 1.8x baseload, contiguous)
  const spikeThreshold = Math.max(baseLoadKw * 1.8, avgPowerKw * 1.5);
  const spikes: SpikeEvent[] = [];
  let inSpike = false;
  let spikeStart = 0;
  let spikePeak = 0;
  for (let i = 0; i < powers.length; i++) {
    const p = powers[i]!;
    if (p >= spikeThreshold) {
      if (!inSpike) {
        inSpike = true;
        spikeStart = i;
        spikePeak = p;
      } else {
        spikePeak = Math.max(spikePeak, p);
      }
    } else if (inSpike) {
      const dur = ((i - spikeStart) * ds.intervalSeconds);
      spikes.push({
        timestamp: rows[spikeStart]!.timestamp,
        powerKw: spikePeak,
        ratioToBase: baseLoadKw > 0 ? spikePeak / baseLoadKw : 0,
        durationSec: dur,
      });
      inSpike = false;
    }
  }
  if (inSpike) {
    const dur = ((powers.length - spikeStart) * ds.intervalSeconds);
    spikes.push({
      timestamp: rows[spikeStart]!.timestamp,
      powerKw: spikePeak,
      ratioToBase: baseLoadKw > 0 ? spikePeak / baseLoadKw : 0,
      durationSec: dur,
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
    thdVMaxPct: thdVMax,
    thdAMaxPct: thdAMax,
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
  if (pfMin < thresholds.pfCritical && pfVals.length) {
    insights.push({
      id: "pf-critical",
      severity: "critical",
      category: "powerfactor",
      title: "Poor power factor",
      detail: `Power factor dropped to ${pfMin.toFixed(2)} (avg ${pfAvg.toFixed(
        2,
      )}). Reactive compensation could reduce billing penalties.`,
    });
  } else if (pfAvg < thresholds.pfWarn && pfVals.length) {
    insights.push({
      id: "pf-warning",
      severity: "warning",
      category: "powerfactor",
      title: "Power factor below ideal",
      detail: `Average PF ${pfAvg.toFixed(2)} — capacitor banks may improve efficiency.`,
    });
  } else if (pfVals.length) {
    insights.push({
      id: "pf-ok",
      severity: "ok",
      category: "powerfactor",
      title: "Healthy power factor",
      detail: `Average PF ${pfAvg.toFixed(2)} — no compensation needed.`,
    });
  }

  // THD V
  if (thdVMax >= thresholds.thdVCritical) {
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
  if (thdAMax >= thresholds.thdACritical) {
    insights.push({
      id: "thda-critical",
      severity: "critical",
      category: "thd",
      title: "High current THD",
      detail: `Current THD peaked at ${thdAMax.toFixed(
        1,
      )}% — non-linear loads (drives, rectifiers) creating significant harmonic distortion.`,
    });
  } else if (thdAMax >= thresholds.thdAWarn) {
    insights.push({
      id: "thda-warning",
      severity: "warning",
      category: "thd",
      title: "Elevated current THD",
      detail: `Current THD reached ${thdAMax.toFixed(1)}%. Likely VFDs or switching loads.`,
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
        : `Spikes reach up to ${Math.max(...spikes.map((s) => s.powerKw)).toFixed(
            1,
          )} kW vs ${baseLoadKw.toFixed(1)} kW base load.`,
    });
  }

  // Battery / peak shaving
  const p95 = quantile(sortedPowers, 0.95);
  const shavedPeakKw = Math.max(0, peakPowerKw - p95);
  const peakReductionKw = shavedPeakKw;
  const peakReductionPct = peakPowerKw > 0 ? (peakReductionKw / peakPowerKw) * 100 : 0;

  // Energy stored above p95 per typical day
  const aboveP95 = powers.filter((p) => p > p95).map((p) => p - p95);
  const cycleEnergyDay = aboveP95.reduce((a, b) => a + b * intervalH, 0) /
    Math.max(durationHours / 24, 1);

  // Battery sizing: 2x cycle energy for 50% DoD margin, with min 1h discharge
  const recommendedKwh = Math.max(cycleEnergyDay * 2, peakReductionKw * 1);
  const recommendedKw = peakReductionKw;

  const battery: BatteryAssessment = {
    recommendedKwh,
    recommendedKw,
    peakReductionKw,
    peakReductionPct,
    shavedPeakKw,
    cycleEnergyPerDayKwh: cycleEnergyDay,
    estimatedSavingsKwh: cycleEnergyDay * 30,
  };

  if (peakReductionPct > 20 && peakPowerKw > 1) {
    insights.push({
      id: "peak-shaving",
      severity: "info",
      category: "battery",
      title: "Strong peak-shaving candidate",
      detail: `Peaks above ${p95.toFixed(1)} kW could be shaved with a ${recommendedKw.toFixed(
        0,
      )} kW / ${recommendedKwh.toFixed(0)} kWh battery — ${peakReductionPct.toFixed(
        0,
      )}% peak reduction potential.`,
    });
  } else if (peakPowerKw > 1) {
    insights.push({
      id: "peak-shaving-low",
      severity: "ok",
      category: "battery",
      title: "Limited peak-shaving benefit",
      detail: `Peak-to-base ratio is ${kpi.peakToAvg.toFixed(
        2,
      )} — load profile is already relatively flat.`,
    });
  }

  // Demand summary
  insights.unshift({
    id: "demand-summary",
    severity: "info",
    category: "summary",
    title: `Maximum demand reached ${peakPowerKw.toFixed(1)} kW`,
    detail: `Average load ${avgPowerKw.toFixed(1)} kW, base load ${baseLoadKw.toFixed(
      1,
    )} kW. Total energy ${energyKwh.toFixed(1)} kWh over ${durationHours.toFixed(1)} h.`,
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
