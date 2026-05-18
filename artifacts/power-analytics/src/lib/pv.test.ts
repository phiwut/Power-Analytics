import assert from "node:assert/strict";
import { analysePvComparison, alignPvToMeasurement, parsePvText } from "./pv";
import type { ParsedDataset } from "./parser";

const measurement: ParsedDataset = {
  fileName: "measurement.csv",
  columns: [],
  rowCount: 4,
  startTime: Date.parse("2026-01-01T10:00:00Z"),
  endTime: Date.parse("2026-01-01T10:45:00Z"),
  durationMs: 45 * 60_000,
  intervalSeconds: 900,
  warnings: [],
  rows: [0, 1, 2, 3].map((i) => ({
    timestamp: Date.parse("2026-01-01T10:00:00Z") + i * 900_000,
    voltage: { L1: 230, L2: 230, L3: 230 },
    current: { L1: 10, L2: 10, L3: 10 },
    power: { total: 10_000 },
    pf: {},
    thdV: {},
    thdA: {},
    raw: {},
  })),
};

{
  const pv = parsePvText(
    [
      "timestamp,PV Power (W)",
      "2026-01-01T09:45:00Z,1000",
      "2026-01-01T10:00:00Z,2000",
      "2026-01-01T10:15:00Z,-500",
      "2026-01-01T10:30:00Z,3000",
      "2026-01-01T11:00:00Z,4000",
    ].join("\n"),
    "pv-w.csv",
  );
  assert.equal(pv.detectedUnit, "W");
  assert.equal(pv.detectedKind, "power");
  assert.equal(pv.clippedNegativeCount, 1);

  const aligned = alignPvToMeasurement(pv, measurement);
  assert.equal(aligned.rowCount, 3);
  assert.equal(aligned.rows[0]?.generationKw, 2);
  assert.equal(aligned.rows[1]?.generationKw, 0);
  assert.equal(aligned.rows[2]?.generationKw, 3);

  const comparison = analysePvComparison(measurement, aligned);
  assert.equal(comparison.kpi.matchedSampleCount, 3);
  assert.equal(comparison.kpi.generationKwh, 1.25);
  assert.equal(comparison.kpi.selfConsumptionKwh, 1.25);
  assert.equal(comparison.points[0]?.residualLoadKw, 8);
}

{
  const pv = parsePvText(
    [
      "Datum;Zeit;Erzeugung kWh",
      "01.01.2026;10:00:00;100",
      "01.01.2026;10:15:00;101",
      "01.01.2026;10:30:00;102,5",
      "01.01.2026;10:45:00;103,5",
    ].join("\n"),
    "pv-energy.csv",
  );
  assert.equal(pv.detectedUnit, "kWh");
  assert.equal(pv.detectedKind, "cumulative-energy");
  assert.equal(pv.rows[0]?.generationKw, 4);
  assert.equal(pv.rows[1]?.generationKw, 6);
}

{
  const pv = parsePvText(
    [
      "time\tSolar Yield Wh",
      "2026-01-01T10:00:00Z\t500",
      "2026-01-01T10:15:00Z\t750",
      "2026-01-01T10:30:00Z\t1000",
      "2026-01-01T10:45:00Z\t1250",
    ].join("\n"),
    "pv-wh.tsv",
  );
  assert.equal(pv.detectedUnit, "Wh");
  assert.equal(pv.detectedKind, "cumulative-energy");
  assert.equal(pv.rows[0]?.generationKw, 1);
}

{
  const pv = parsePvText(
    [
      "timestamp,PV kW",
      "2026-01-02T10:00:00Z,2",
      "2026-01-02T10:15:00Z,3",
    ].join("\n"),
    "no-overlap.csv",
  );
  assert.throws(() => alignPvToMeasurement(pv, measurement), /does not overlap/);
}

console.log("PV parser and alignment tests passed");
