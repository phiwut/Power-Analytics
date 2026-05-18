import Papa from "papaparse";

export type Phase = "L1" | "L2" | "L3";

export interface MeasurementRow {
  timestamp: number;
  voltage: { L1: number; L2: number; L3: number; N?: number };
  current: { L1: number; L2: number; L3: number; N?: number };
  power: { L1?: number; L2?: number; L3?: number; total: number };
  apparent?: { total?: number };
  reactive?: { total?: number };
  pf: { total?: number; L1?: number; L2?: number; L3?: number };
  thdV: { L1?: number; L2?: number; L3?: number };
  thdA: { L1?: number; L2?: number; L3?: number };
  frequency?: number;
  raw: Record<string, number>;
}

export interface ParsedDataset {
  rows: MeasurementRow[];
  columns: string[];
  fileName: string;
  rowCount: number;
  startTime: number;
  endTime: number;
  durationMs: number;
  intervalSeconds: number;
  warnings: string[];
}

const TIMESTAMP_FORMATS = [
  /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/,
  /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/,
];

export function detectDelimiter(sample: string): string {
  const lines = sample.split(/\r?\n/).slice(0, 8).filter((l) => l.trim());
  if (lines.length === 0) return ",";
  const candidates = ["\t", ";", ",", "|"];
  let best = ",";
  let bestScore = -1;
  for (const delim of candidates) {
    const counts = lines.map((l) => l.split(delim).length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg < 2) continue;
    const variance =
      counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / counts.length;
    const score = avg - variance * 5;
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }
  return best;
}

export type DecimalMode = "auto" | "dot" | "comma";

export function parseNumber(raw: string, mode: DecimalMode = "auto"): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (s === "" || s === "-" || s.toLowerCase() === "nan") return null;
  // Leading decimal like ".210" or ",210"
  if (/^-?[.,]\d+$/.test(s)) {
    return parseFloat(s.replace(",", "."));
  }
  if (mode === "dot") {
    // Dot is decimal separator. Strip any commas (treat as thousands).
    const cleaned = s.replace(/,/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  if (mode === "comma") {
    // Comma is decimal separator. Strip dots (treat as thousands).
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  // Auto-detect per value
  // German style "1.234,56" — has both
  if (s.includes(",") && s.includes(".")) {
    // Whichever appears LAST is decimal
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      return parseFloat(s.replace(/\./g, "").replace(",", "."));
    }
    return parseFloat(s.replace(/,/g, ""));
  }
  if (/^-?\d+,\d+$/.test(s)) {
    return parseFloat(s.replace(",", "."));
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function detectDecimalMode(rows: string[][], headers: string[]): DecimalMode {
  // Sample a chunk of cells (skip first column likely date)
  const startCol = headers.length > 1 ? 1 : 0;
  let commaCount = 0;
  let dotMultiCount = 0; // values with multiple dots like "1.234.567"
  let dotSingleCount = 0; // values with exactly one dot
  let scanned = 0;
  const maxRows = Math.min(rows.length, 200);
  for (let r = 0; r < maxRows; r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = startCol; c < row.length; c++) {
      const v = String(row[c] ?? "").trim();
      if (!v || !/\d/.test(v)) continue;
      // Skip time-of-day strings
      if (/^\d{1,2}:\d{2}/.test(v)) continue;
      scanned++;
      const dots = (v.match(/\./g) || []).length;
      const commas = (v.match(/,/g) || []).length;
      if (commas > 0) commaCount++;
      if (dots > 1) dotMultiCount++;
      else if (dots === 1) dotSingleCount++;
      if (scanned > 4000) break;
    }
    if (scanned > 4000) break;
  }
  // If commas appear -> comma is decimal (German). If dots are always single-occurrence and no commas, dot is decimal.
  if (commaCount > 0 && dotMultiCount === 0) return "comma";
  if (commaCount === 0 && dotSingleCount > 0) return "dot";
  if (dotMultiCount > 0) return "comma"; // grouping with dots
  return "auto";
}

export function parseDate(d: string, t: string): number | null {
  if (!d) return null;
  const dStr = d.trim();
  const tStr = (t || "00:00:00").trim();

  let day = 0,
    month = 0,
    year = 0;
  for (const re of TIMESTAMP_FORMATS) {
    const m = dStr.match(re);
    if (m) {
      const a = parseInt(m[1]!, 10);
      const b = parseInt(m[2]!, 10);
      const c = parseInt(m[3]!, 10);
      if (m[1]!.length === 4) {
        year = a;
        month = b;
        day = c;
      } else {
        day = a;
        month = b;
        year = c < 100 ? 2000 + c : c;
      }
      break;
    }
  }
  if (!year) {
    const d2 = new Date(dStr + " " + tStr);
    if (!isNaN(d2.getTime())) return d2.getTime();
    return null;
  }
  // Time HH:MM:SS or HH:MM:SS.mmm
  const tm = tStr.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/);
  let hh = 0,
    mm = 0,
    ss = 0,
    ms = 0;
  if (tm) {
    hh = parseInt(tm[1]!, 10);
    mm = parseInt(tm[2]!, 10);
    ss = parseInt(tm[3]!, 10);
    if (tm[4]) ms = parseInt(tm[4].slice(0, 3).padEnd(3, "0"), 10);
  }
  return new Date(year, month - 1, day, hh, mm, ss, ms).getTime();
}

export function parseSingleTimestamp(s: string): number | null {
  if (!s) return null;
  const str = s.trim();
  // Try ISO
  const iso = new Date(str);
  if (!isNaN(iso.getTime()) && str.includes("-") && str.includes(":")) {
    return iso.getTime();
  }
  // Try "DD.MM.YYYY HH:MM:SS"
  const m = str.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})[\sT](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d+))?)?/,
  );
  if (m) {
    const day = parseInt(m[1]!, 10);
    const month = parseInt(m[2]!, 10);
    let year = parseInt(m[3]!, 10);
    if (year < 100) year += 2000;
    const hh = parseInt(m[4]!, 10);
    const mm = parseInt(m[5]!, 10);
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const ms = m[7] ? parseInt(m[7].slice(0, 3).padEnd(3, "0"), 10) : 0;
    return new Date(year, month - 1, day, hh, mm, ss, ms).getTime();
  }
  return isNaN(iso.getTime()) ? null : iso.getTime();
}

interface ColumnMap {
  date?: string;
  time?: string;
  timestamp?: string;
  voltage: { L1?: string; L2?: string; L3?: string; N?: string };
  current: { L1?: string; L2?: string; L3?: string; N?: string };
  power: { L1?: string; L2?: string; L3?: string; total?: string };
  apparent: { total?: string };
  reactive: { total?: string };
  pf: { total?: string; L1?: string; L2?: string; L3?: string };
  thdV: { L1?: string; L2?: string; L3?: string };
  thdA: { L1?: string; L2?: string; L3?: string };
  frequency?: string;
}

function findColumn(
  cols: string[],
  patterns: RegExp[],
  preferAvg = true,
): string | undefined {
  const matches = cols.filter((c) => patterns.every((p) => p.test(c)));
  if (matches.length === 0) return undefined;
  if (preferAvg) {
    const avg = matches.find((c) => /\bavg\b|\bmean\b|\bmittel/i.test(c));
    if (avg) return avg;
    const noMinMax = matches.find((c) => !/\b(min|max)\b/i.test(c));
    if (noMinMax) return noMinMax;
  }
  return matches[0];
}

function buildColumnMap(cols: string[]): ColumnMap {
  const map: ColumnMap = {
    voltage: {},
    current: {},
    power: {},
    apparent: {},
    reactive: {},
    pf: {},
    thdV: {},
    thdA: {},
  };

  // Date / time
  map.date = cols.find((c) => /^datum$|^date$|^day$/i.test(c));
  map.time = cols.find((c) => /^zeit$|^time$|^uhrzeit$/i.test(c));
  if (!map.date && !map.time) {
    map.timestamp = cols.find((c) =>
      /timestamp|datetime|date.?time|zeitstempel/i.test(c),
    );
  }

  const phases: Phase[] = ["L1", "L2", "L3"];

  for (const p of phases) {
    map.voltage[p] = findColumn(cols, [
      /spannung|voltage|volt/i,
      new RegExp(`\\b${p}(N)?\\b`, "i"),
    ]);
    map.current[p] = findColumn(cols, [
      /strom|current|amp/i,
      new RegExp(`\\b${p}\\b`, "i"),
    ]);
    map.power[p] = findColumn(cols, [
      /wirkleistung|active.?power|^p\b/i,
      new RegExp(`\\b${p}(N)?\\b`, "i"),
    ]);
    map.pf[p] = findColumn(cols, [
      /\bpf\b|power.?factor|leistungsfaktor|cos.?phi/i,
      new RegExp(`\\b${p}(N)?\\b`, "i"),
    ]);
    map.thdV[p] = findColumn(cols, [
      /thd.?v|thd.?u|thd.?spannung|thd_u/i,
      new RegExp(`\\b${p}(N)?\\b`, "i"),
    ]);
    map.thdA[p] = findColumn(cols, [
      /thd.?a|thd.?i|thd.?strom|thd_i/i,
      new RegExp(`\\b${p}\\b`, "i"),
    ]);
  }

  map.voltage.N = findColumn(cols, [/spannung|voltage/i, /\bNG?\b/i]);
  map.current.N = findColumn(cols, [/strom|current/i, /\bN\b/i]);

  map.power.total = findColumn(cols, [
    /wirkleistung|active.?power/i,
    /total|gesamt|sum/i,
  ]);
  if (!map.power.total) {
    map.power.total = findColumn(cols, [/^total.?p|^p.?total/i]);
  }
  map.apparent.total = findColumn(cols, [
    /va|apparent|scheinleistung/i,
    /total|gesamt|sum/i,
  ]);
  map.reactive.total = findColumn(cols, [
    /var|reactive|blindleistung/i,
    /total|gesamt|sum/i,
  ]);
  map.pf.total = findColumn(cols, [
    /\bpf\b|power.?factor|leistungsfaktor|cos.?phi/i,
    /total|gesamt|sum/i,
  ]);
  map.frequency = findColumn(cols, [/frequenz|frequency|^f$|hz/i]);

  return map;
}

function avgDefined(...vals: (number | undefined | null)[]): number | undefined {
  const nums = vals.filter((v): v is number => typeof v === "number" && !isNaN(v));
  if (nums.length === 0) return undefined;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sumDefined(...vals: (number | undefined | null)[]): number | undefined {
  const nums = vals.filter((v): v is number => typeof v === "number" && !isNaN(v));
  if (nums.length === 0) return undefined;
  return nums.reduce((a, b) => a + b, 0);
}

export async function parseFile(file: File): Promise<ParsedDataset> {
  const text = await file.text();
  return parseText(text, file.name);
}

export function parseText(text: string, fileName: string): ParsedDataset {
  const warnings: string[] = [];
  // Strip BOM
  const cleaned = text.replace(/^\uFEFF/, "");
  const sample = cleaned.slice(0, 8192);
  const delimiter = detectDelimiter(sample);

  const result = Papa.parse<string[]>(cleaned, {
    delimiter,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (!result.data || result.data.length < 2) {
    throw new Error("File contains no parsable rows.");
  }

  const headers = result.data[0]!.map((h) => String(h).trim());
  const dataRows = result.data.slice(1);

  const colMap = buildColumnMap(headers);
  const decimalMode = detectDecimalMode(dataRows, headers);
  if (decimalMode === "comma") {
    warnings.push("Detected European number format (comma decimal separator).");
  }

  const rows: MeasurementRow[] = [];
  let skipped = 0;

  for (const r of dataRows) {
    if (!r || r.length === 0) continue;
    const rec: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      rec[headers[i]!] = String(r[i] ?? "").trim();
    }

    let ts: number | null = null;
    if (colMap.timestamp) {
      ts = parseSingleTimestamp(rec[colMap.timestamp] || "");
    } else if (colMap.date) {
      ts = parseDate(rec[colMap.date] || "", rec[colMap.time || ""] || "");
    } else if (colMap.time) {
      ts = parseSingleTimestamp(rec[colMap.time] || "");
    }
    if (ts === null) {
      skipped++;
      continue;
    }

    const numRec: Record<string, number> = {};
    for (const k of Object.keys(rec)) {
      const v = parseNumber(rec[k]!, decimalMode);
      if (v !== null) numRec[k] = v;
    }

    const get = (col?: string) => (col ? numRec[col] : undefined);

    const v1 = get(colMap.voltage.L1);
    const v2 = get(colMap.voltage.L2);
    const v3 = get(colMap.voltage.L3);
    const vN = get(colMap.voltage.N);

    const i1 = get(colMap.current.L1);
    const i2 = get(colMap.current.L2);
    const i3 = get(colMap.current.L3);
    const iN = get(colMap.current.N);

    const p1 = get(colMap.power.L1);
    const p2 = get(colMap.power.L2);
    const p3 = get(colMap.power.L3);
    let pT = get(colMap.power.total);
    if (pT === undefined) {
      pT = sumDefined(p1, p2, p3);
    }
    if (pT === undefined) {
      // approximate with V*I*PF
      const pfT = get(colMap.pf.total);
      const pf = pfT ?? 1;
      const approx = sumDefined(
        v1 !== undefined && i1 !== undefined ? v1 * i1 * pf : undefined,
        v2 !== undefined && i2 !== undefined ? v2 * i2 * pf : undefined,
        v3 !== undefined && i3 !== undefined ? v3 * i3 * pf : undefined,
      );
      pT = approx;
    }

    if (
      v1 === undefined &&
      v2 === undefined &&
      v3 === undefined &&
      i1 === undefined &&
      i2 === undefined &&
      i3 === undefined &&
      pT === undefined
    ) {
      skipped++;
      continue;
    }

    rows.push({
      timestamp: ts,
      voltage: {
        L1: v1 ?? 0,
        L2: v2 ?? 0,
        L3: v3 ?? 0,
        N: vN,
      },
      current: {
        L1: i1 ?? 0,
        L2: i2 ?? 0,
        L3: i3 ?? 0,
        N: iN,
      },
      power: {
        L1: p1,
        L2: p2,
        L3: p3,
        total: pT ?? 0,
      },
      apparent: { total: get(colMap.apparent.total) },
      reactive: { total: get(colMap.reactive.total) },
      pf: {
        total: get(colMap.pf.total),
        L1: get(colMap.pf.L1),
        L2: get(colMap.pf.L2),
        L3: get(colMap.pf.L3),
      },
      thdV: {
        L1: get(colMap.thdV.L1),
        L2: get(colMap.thdV.L2),
        L3: get(colMap.thdV.L3),
      },
      thdA: {
        L1: get(colMap.thdA.L1),
        L2: get(colMap.thdA.L2),
        L3: get(colMap.thdA.L3),
      },
      frequency: get(colMap.frequency),
      raw: numRec,
    });
  }

  if (rows.length === 0) {
    throw new Error("No valid rows found. Check file format and column mapping.");
  }

  rows.sort((a, b) => a.timestamp - b.timestamp);

  if (skipped > 0) warnings.push(`${skipped} rows skipped (could not parse).`);
  if (!colMap.date && !colMap.timestamp) {
    warnings.push("No date column detected — using best-guess timestamps.");
  }
  if (!colMap.power.total && !colMap.power.L1) {
    warnings.push("No active power column detected — using approximation.");
  }

  // Estimate sampling interval
  const intervals: number[] = [];
  for (let i = 1; i < Math.min(rows.length, 200); i++) {
    intervals.push(rows[i]!.timestamp - rows[i - 1]!.timestamp);
  }
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)] || 60000;
  const intervalSeconds = Math.max(1, Math.round(median / 1000));

  // Use averaged voltage to give voltage shortcuts
  for (const r of rows) {
    if (r.voltage.L1 === 0 && r.voltage.L2 === 0 && r.voltage.L3 === 0) {
      const fallback = avgDefined(r.voltage.L1, r.voltage.L2, r.voltage.L3);
      if (fallback !== undefined) {
        r.voltage.L1 = fallback;
        r.voltage.L2 = fallback;
        r.voltage.L3 = fallback;
      }
    }
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
  };
}
