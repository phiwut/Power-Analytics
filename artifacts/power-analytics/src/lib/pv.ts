import Papa from "papaparse";
import type { Insight } from "./analysis";
import type { ParsedDataset } from "./parser";
import {
  detectDecimalMode,
  detectDelimiter,
  parseDate,
  parseNumber,
  parseSingleTimestamp,
} from "./parser";
import { maxNumber, maxNumberOr, minNumberOr } from "./stats";

export type PvDetectedUnit = "W" | "kW" | "Wh" | "kWh" | "inferred-kW" | "inferred-W";
type PvValueKind = "power" | "interval-energy" | "cumulative-energy";

export interface PvRow {
  timestamp: number;
  generationKw: number;
  raw: Record<string, number>;
}

export interface ParsedPvDataset {
  rows: PvRow[];
  columns: string[];
  fileName: string;
  rowCount: number;
  startTime: number;
  endTime: number;
  durationMs: number;
  intervalSeconds: number;
  warnings: string[];
  detectedUnit: PvDetectedUnit;
  detectedKind: PvValueKind;
  mappingConfidence: "high" | "medium" | "low";
  timestampColumn: string;
  valueColumn: string;
  clippedNegativeCount: number;
  skippedRowCount: number;
}

export interface AlignedPvDataset extends ParsedPvDataset {
  originalStartTime: number;
  originalEndTime: number;
  overlapStartTime: number;
  overlapEndTime: number;
  coveragePct: number;
  gapCount: number;
  maxGapMs: number;
}

export interface PvComparisonKpi {
  generationKwh: number;
  coveragePct: number;
  matchedSampleCount: number;
  selfConsumptionKwh: number;
  surplusKwh: number;
  residualMinKw: number;
  residualMaxKw: number;
  backfeedSampleCount: number;
  clippedNegativeCount: number;
  gapCount: number;
  maxGapMinutes: number;
}

export interface PvComparisonPoint {
  timestamp: number;
  generationKw: number;
  residualLoadKw: number;
  loadKw: number;
}

export interface PvComparisonResult {
  aligned: AlignedPvDataset;
  kpi: PvComparisonKpi;
  points: PvComparisonPoint[];
  insights: Insight[];
}

interface PvColumnMap {
  timestamp?: string;
  date?: string;
  time?: string;
  value?: string;
  confidence: "high" | "medium" | "low";
}

const PV_KEYWORDS = [
  /pv/i,
  /solar/i,
  /generation/i,
  /production/i,
  /yield/i,
  /energy/i,
  /energie/i,
  /power/i,
  /leistung/i,
  /erzeugung/i,
  /produktion/i,
  /einspeis/i,
];

export async function parsePvFile(file: File): Promise<ParsedPvDataset> {
  const text = await file.text();
  return parsePvText(text, file.name);
}

export function parsePvText(text: string, fileName: string): ParsedPvDataset {
  const warnings: string[] = [];
  const cleaned = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(cleaned.slice(0, 8192));
  const result = Papa.parse<string[]>(cleaned, {
    delimiter,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (!result.data || result.data.length < 2) {
    throw new Error("PV file contains no parsable rows.");
  }

  const headers = result.data[0]!.map((h) => String(h).trim());
  const dataRows = result.data.slice(1);
  const colMap = buildPvColumnMap(headers);
  if (!colMap.value) {
    throw new Error("No PV generation column detected. Expected a column like PV, solar, generation, power, Leistung or Erzeugung.");
  }
  if (!colMap.timestamp && !colMap.date && !colMap.time) {
    throw new Error("No timestamp column detected in PV file.");
  }

  const decimalMode = detectDecimalMode(dataRows, headers);
  if (decimalMode === "comma") {
    warnings.push("Detected European number format in PV data.");
  }

  const rawRows: Array<{ timestamp: number; value: number; raw: Record<string, number> }> = [];
  let skipped = 0;
  for (const row of dataRows) {
    if (!row?.length) continue;
    const rec: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      rec[headers[i]!] = String(row[i] ?? "").trim();
    }

    const timestamp = parsePvTimestamp(rec, colMap);
    const value = parseNumber(rec[colMap.value] ?? "", decimalMode);
    if (timestamp === null || value === null) {
      skipped++;
      continue;
    }

    const raw: Record<string, number> = {};
    for (const header of headers) {
      const n = parseNumber(rec[header] ?? "", decimalMode);
      if (n !== null) raw[header] = n;
    }
    rawRows.push({ timestamp, value, raw });
  }

  rawRows.sort((a, b) => a.timestamp - b.timestamp);
  if (rawRows.length === 0) {
    throw new Error("No valid PV rows found. Check timestamp and PV generation columns.");
  }

  const intervalSeconds = estimateIntervalSeconds(rawRows.map((r) => r.timestamp));
  const unit = detectPvUnit(colMap.value, rawRows.map((r) => r.value));
  const kind = detectPvKind(unit, rawRows.map((r) => r.value));
  const { rows, clippedNegativeCount, conversionWarning } = normalizePvRows(
    rawRows,
    unit,
    kind,
    intervalSeconds,
  );
  warnings.push(...conversionWarning);

  if (skipped > 0) warnings.push(`${skipped} PV rows skipped (could not parse).`);
  if (clippedNegativeCount > 0) {
    warnings.push(`${clippedNegativeCount} negative PV value${clippedNegativeCount === 1 ? "" : "s"} clipped to 0 kW.`);
  }
  if (colMap.confidence !== "high") {
    warnings.push("PV column mapping confidence is not high; please verify the preview before using the data.");
  }

  return {
    rows,
    columns: headers,
    fileName,
    rowCount: rows.length,
    startTime: rows[0]!.timestamp,
    endTime: rows[rows.length - 1]!.timestamp,
    durationMs: rows[rows.length - 1]!.timestamp - rows[0]!.timestamp,
    intervalSeconds,
    warnings,
    detectedUnit: unit,
    detectedKind: kind,
    mappingConfidence: colMap.confidence,
    timestampColumn: colMap.timestamp ?? [colMap.date, colMap.time].filter(Boolean).join(" + "),
    valueColumn: colMap.value,
    clippedNegativeCount,
    skippedRowCount: skipped,
  };
}

export function alignPvToMeasurement(pv: ParsedPvDataset, ds: ParsedDataset): AlignedPvDataset {
  const rows = pv.rows.filter((row) => row.timestamp >= ds.startTime && row.timestamp <= ds.endTime);
  if (rows.length === 0) {
    throw new Error("PV data does not overlap the measurement time range.");
  }

  const overlapStartTime = Math.max(ds.startTime, pv.startTime);
  const overlapEndTime = Math.min(ds.endTime, pv.endTime);
  const measurementDuration = Math.max(ds.endTime - ds.startTime, 1);
  const coveredDuration = Math.max(0, overlapEndTime - overlapStartTime);
  const { gapCount, maxGapMs } = getGapStats(rows.map((r) => r.timestamp), pv.intervalSeconds);
  const warnings = [...pv.warnings];
  const coveragePct = Math.min(100, (coveredDuration / measurementDuration) * 100);

  if (coveragePct < 95) {
    warnings.push(`PV data covers ${coveragePct.toFixed(1)}% of the measurement range.`);
  }
  if (gapCount > 0) {
    warnings.push(`PV data contains ${gapCount} timestamp gap${gapCount === 1 ? "" : "s"} larger than expected.`);
  }

  return {
    ...pv,
    rows,
    rowCount: rows.length,
    startTime: rows[0]!.timestamp,
    endTime: rows[rows.length - 1]!.timestamp,
    durationMs: rows[rows.length - 1]!.timestamp - rows[0]!.timestamp,
    warnings,
    originalStartTime: pv.startTime,
    originalEndTime: pv.endTime,
    overlapStartTime,
    overlapEndTime,
    coveragePct,
    gapCount,
    maxGapMs,
  };
}

export function analysePvComparison(ds: ParsedDataset, aligned: AlignedPvDataset): PvComparisonResult {
  const sampleP = ds.rows.slice(0, 50).map((r) => r.power.total).filter((v) => v > 0);
  const wattScale = sampleP.reduce((a, b) => a + b, 0) / Math.max(sampleP.length, 1) > 1000 ? 1 / 1000 : 1;
  const toleranceMs = Math.max(ds.intervalSeconds, aligned.intervalSeconds) * 1500;
  const intervalH = ds.intervalSeconds / 3600;
  const points: PvComparisonPoint[] = [];
  const pvRows = aligned.rows;
  let pvIdx = 0;

  for (const row of ds.rows) {
    if (row.timestamp < aligned.startTime || row.timestamp > aligned.endTime) continue;
    while (
      pvIdx + 1 < pvRows.length &&
      Math.abs(pvRows[pvIdx + 1]!.timestamp - row.timestamp) <= Math.abs(pvRows[pvIdx]!.timestamp - row.timestamp)
    ) {
      pvIdx++;
    }
    const pv = pvRows[pvIdx];
    if (!pv || Math.abs(pv.timestamp - row.timestamp) > toleranceMs) continue;
    const loadKw = row.power.total * wattScale;
    const generationKw = pv.generationKw;
    points.push({
      timestamp: row.timestamp,
      generationKw,
      loadKw,
      residualLoadKw: loadKw - generationKw,
    });
  }

  const generationKwh = points.reduce((sum, p) => sum + p.generationKw * intervalH, 0);
  const selfConsumptionKwh = points.reduce((sum, p) => sum + Math.min(Math.max(p.loadKw, 0), p.generationKw) * intervalH, 0);
  const surplusKwh = points.reduce((sum, p) => sum + Math.max(p.generationKw - Math.max(p.loadKw, 0), 0) * intervalH, 0);
  const residuals = points.map((p) => p.residualLoadKw);
  const backfeedSampleCount = points.filter((p) => p.residualLoadKw < 0).length;

  const kpi: PvComparisonKpi = {
    generationKwh,
    coveragePct: aligned.coveragePct,
    matchedSampleCount: points.length,
    selfConsumptionKwh,
    surplusKwh,
    residualMinKw: minNumberOr(residuals, 0),
    residualMaxKw: maxNumberOr(residuals, 0),
    backfeedSampleCount,
    clippedNegativeCount: aligned.clippedNegativeCount,
    gapCount: aligned.gapCount,
    maxGapMinutes: aligned.maxGapMs / 60_000,
  };

  return { aligned, kpi, points, insights: buildPvInsights(kpi, aligned) };
}

function buildPvColumnMap(headers: string[]): PvColumnMap {
  const timestamp = headers.find((h) => /timestamp|datetime|date.?time|zeitstempel/i.test(h));
  const date = headers.find((h) => /^datum$|^date$|^day$/i.test(h));
  const time = headers.find((h) => /^zeit$|^time$|^uhrzeit$/i.test(h));
  const scored = headers
    .filter((h) => h !== timestamp && h !== date && h !== time)
    .map((header) => ({ header, score: scorePvColumn(header) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const confidence = best && best.score >= 5 ? "high" : best && best.score >= 2 ? "medium" : "low";
  return {
    timestamp,
    date,
    time,
    value: best?.score ? best.header : undefined,
    confidence,
  };
}

function scorePvColumn(header: string): number {
  const normalized = header.toLowerCase();
  let score = 0;
  if (PV_KEYWORDS.some((re) => re.test(header))) score += 4;
  if (/\b(k?w|k?wh)\b/i.test(header)) score += 2;
  if (/total|gesamt|sum|avg|mean|mittel/i.test(header)) score += 1;
  if (/voltage|spannung|current|strom|pf|factor|freq|hz|thd/i.test(normalized)) score -= 6;
  if (/date|time|datum|zeit|timestamp/i.test(normalized)) score -= 6;
  return score;
}

function parsePvTimestamp(rec: Record<string, string>, colMap: PvColumnMap): number | null {
  if (colMap.timestamp) return parseSingleTimestamp(rec[colMap.timestamp] ?? "");
  if (colMap.date) return parseDate(rec[colMap.date] ?? "", rec[colMap.time ?? ""] ?? "");
  if (colMap.time) return parseSingleTimestamp(rec[colMap.time] ?? "");
  return null;
}

function detectPvUnit(header: string, values: number[]): PvDetectedUnit {
  const h = header.toLowerCase();
  if (/\bkwh\b|kwh|kw h/.test(h)) return "kWh";
  if (/\bwh\b|w h/.test(h)) return "Wh";
  if (/\bkw\b|kw/.test(h)) return "kW";
  if (/\bw\b|watt/.test(h)) return "W";
  const positive = values.filter((v) => v > 0);
  const peak = maxNumber(positive, 0);
  return peak > 100 ? "inferred-W" : "inferred-kW";
}

function detectPvKind(unit: PvDetectedUnit, values: number[]): PvValueKind {
  if (unit === "Wh" || unit === "kWh") {
    return isMostlyMonotonic(values) ? "cumulative-energy" : "interval-energy";
  }
  return "power";
}

function normalizePvRows(
  rawRows: Array<{ timestamp: number; value: number; raw: Record<string, number> }>,
  unit: PvDetectedUnit,
  kind: PvValueKind,
  intervalSeconds: number,
): { rows: PvRow[]; clippedNegativeCount: number; conversionWarning: string[] } {
  let clippedNegativeCount = 0;
  const conversionWarning: string[] = [];
  const rows: PvRow[] = [];

  if (kind === "cumulative-energy") {
    for (let i = 1; i < rawRows.length; i++) {
      const prev = rawRows[i - 1]!;
      const cur = rawRows[i]!;
      const deltaKwh = toKwh(cur.value - prev.value, unit);
      const hours = Math.max((cur.timestamp - prev.timestamp) / 3_600_000, 1 / 3600);
      const generationKw = cleanGenerationKw(deltaKwh / hours);
      if (generationKw.clipped) clippedNegativeCount++;
      rows.push({ timestamp: cur.timestamp, generationKw: generationKw.value, raw: cur.raw });
    }
    conversionWarning.push("Detected cumulative PV energy and converted deltas to kW.");
    return { rows, clippedNegativeCount, conversionWarning };
  }

  for (const raw of rawRows) {
    const generationKw =
      kind === "interval-energy"
        ? cleanGenerationKw(toKwh(raw.value, unit) / (intervalSeconds / 3600))
        : cleanGenerationKw(toKw(raw.value, unit));
    if (generationKw.clipped) clippedNegativeCount++;
    rows.push({ timestamp: raw.timestamp, generationKw: generationKw.value, raw: raw.raw });
  }

  if (kind === "interval-energy") conversionWarning.push("Detected interval PV energy and converted it to kW.");
  return { rows, clippedNegativeCount, conversionWarning };
}

function cleanGenerationKw(value: number): { value: number; clipped: boolean } {
  if (!Number.isFinite(value)) return { value: 0, clipped: false };
  if (value < 0) return { value: 0, clipped: true };
  return { value, clipped: false };
}

function toKw(value: number, unit: PvDetectedUnit): number {
  if (unit === "W" || unit === "inferred-W") return value / 1000;
  return value;
}

function toKwh(value: number, unit: PvDetectedUnit): number {
  if (unit === "Wh") return value / 1000;
  return value;
}

function isMostlyMonotonic(values: number[]): boolean {
  let comparisons = 0;
  let nonDecreasing = 0;
  for (let i = 1; i < values.length; i++) {
    if (!Number.isFinite(values[i]) || !Number.isFinite(values[i - 1])) continue;
    comparisons++;
    if (values[i]! >= values[i - 1]!) nonDecreasing++;
  }
  return comparisons >= 3 && nonDecreasing / comparisons > 0.9;
}

function estimateIntervalSeconds(timestamps: number[]): number {
  const intervals: number[] = [];
  for (let i = 1; i < Math.min(timestamps.length, 300); i++) {
    const delta = timestamps[i]! - timestamps[i - 1]!;
    if (delta > 0) intervals.push(delta);
  }
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)] ?? 60_000;
  return Math.max(1, Math.round(median / 1000));
}

function getGapStats(timestamps: number[], intervalSeconds: number): { gapCount: number; maxGapMs: number } {
  const threshold = intervalSeconds * 1000 * 1.5;
  let gapCount = 0;
  let maxGapMs = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i]! - timestamps[i - 1]!;
    if (gap > threshold) gapCount++;
    maxGapMs = Math.max(maxGapMs, gap);
  }
  return { gapCount, maxGapMs };
}

function buildPvInsights(kpi: PvComparisonKpi, aligned: AlignedPvDataset): Insight[] {
  const insights: Insight[] = [
    {
      id: "pv-generation-summary",
      severity: "info",
      category: "pv",
      title: `PV generation contributed ${kpi.generationKwh.toFixed(1)} kWh`,
      detail: `PV data covers ${kpi.coveragePct.toFixed(1)}% of the measurement range with ${kpi.matchedSampleCount.toLocaleString()} matched samples. Estimated self-consumption potential is ${kpi.selfConsumptionKwh.toFixed(1)} kWh and surplus potential is ${kpi.surplusKwh.toFixed(1)} kWh.`,
    },
  ];

  if (kpi.backfeedSampleCount > 0) {
    insights.push({
      id: "pv-backfeed-potential",
      severity: "info",
      category: "pv",
      title: "PV may exceed measured load in some periods",
      detail: `${kpi.backfeedSampleCount.toLocaleString()} matched sample${kpi.backfeedSampleCount === 1 ? "" : "s"} produced a negative residual-load estimate. Residual load ranges from ${kpi.residualMinKw.toFixed(1)} to ${kpi.residualMaxKw.toFixed(1)} kW.`,
    });
  }

  if (aligned.coveragePct < 95 || aligned.gapCount > 0 || aligned.mappingConfidence !== "high" || aligned.clippedNegativeCount > 0) {
    insights.push({
      id: "pv-data-quality",
      severity: aligned.coveragePct < 70 ? "warning" : "info",
      category: "pv",
      title: "PV data quality notes",
      detail: `Coverage ${aligned.coveragePct.toFixed(1)}%, ${aligned.gapCount} large gap${aligned.gapCount === 1 ? "" : "s"}, ${aligned.clippedNegativeCount} clipped negative value${aligned.clippedNegativeCount === 1 ? "" : "s"}, mapping confidence ${aligned.mappingConfidence}.`,
    });
  }

  return insights;
}
