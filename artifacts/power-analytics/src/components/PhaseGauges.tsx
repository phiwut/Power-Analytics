import type { AnalysisResult } from "@/lib/analysis";
import type { ParsedDataset } from "@/lib/parser";
import { cn } from "@/lib/utils";

interface Props {
  ds: ParsedDataset;
  result: AnalysisResult;
}

interface PhaseStat {
  phase: "L1" | "L2" | "L3";
  voltageAvg: number;
  voltageMin: number;
  voltageMax: number;
  currentAvg: number;
  currentMax: number;
  powerAvg: number;
  powerMax: number;
  thdVMax: number;
  thdAMax: number;
}

function mean(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

const PHASE_COLORS = {
  L1: "hsl(var(--chart-1))",
  L2: "hsl(var(--chart-2))",
  L3: "hsl(var(--chart-3))",
};

export function PhaseGauges({ ds, result }: Props) {
  const wattScale = result.kpi.peakPowerKw > 0 && result.kpi.peakPowerKw < 100
    ? Math.max(...ds.rows.map((r) => r.power.total)) > 1000 ? 1 / 1000 : 1
    : 1 / 1000;

  const stats: PhaseStat[] = (["L1", "L2", "L3"] as const).map((p) => {
    const v = ds.rows.map((r) => r.voltage[p]).filter((x) => x > 0);
    const i = ds.rows.map((r) => r.current[p]).filter((x) => x > 0);
    const power = ds.rows
      .map((r) => r.power[p])
      .filter((x): x is number => typeof x === "number");
    const thdV = ds.rows.map((r) => r.thdV[p]).filter((x): x is number => typeof x === "number");
    const thdA = ds.rows.map((r) => r.thdA[p]).filter((x): x is number => typeof x === "number");
    return {
      phase: p,
      voltageAvg: mean(v),
      voltageMin: v.length ? Math.min(...v) : 0,
      voltageMax: v.length ? Math.max(...v) : 0,
      currentAvg: mean(i),
      currentMax: i.length ? Math.max(...i) : 0,
      powerAvg: mean(power) * wattScale,
      powerMax: power.length ? Math.max(...power) * wattScale : 0,
      thdVMax: thdV.length ? Math.max(...thdV) : 0,
      thdAMax: thdA.length ? Math.max(...thdA) : 0,
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {stats.map((s) => {
        const tolMin = 230 * 0.9;
        const tolMax = 230 * 1.1;
        const inTol = s.voltageMin >= tolMin && s.voltageMax <= tolMax;
        return (
          <div key={s.phase} className="shadcn-card rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full"
                  style={{ background: PHASE_COLORS[s.phase] }}
                />
                <h3 className="font-semibold tracking-tight">Phase {s.phase}</h3>
              </div>
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
                  inTol
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                )}
              >
                {inTol ? "Healthy" : "Watch"}
              </span>
            </div>
            <div className="space-y-3">
              <Row label="Voltage" value={`${s.voltageAvg.toFixed(1)} V`} sub={`${s.voltageMin.toFixed(0)}–${s.voltageMax.toFixed(0)}`} />
              <Row label="Current avg" value={`${s.currentAvg.toFixed(1)} A`} sub={`peak ${s.currentMax.toFixed(0)} A`} />
              <Row label="Power avg" value={`${s.powerAvg.toFixed(2)} kW`} sub={`peak ${s.powerMax.toFixed(2)} kW`} />
              {s.thdVMax > 0 && (
                <Row label="THD V max" value={`${s.thdVMax.toFixed(2)} %`} />
              )}
              {s.thdAMax > 0 && (
                <Row label="THD I max" value={`${s.thdAMax.toFixed(2)} %`} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-right">
        <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground font-mono">{sub}</div>}
      </div>
    </div>
  );
}
