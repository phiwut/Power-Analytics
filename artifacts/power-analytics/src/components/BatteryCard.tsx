import { Battery, Zap, TrendingDown } from "lucide-react";
import type { AnalysisResult } from "@/lib/analysis";

export function BatteryCard({ result }: { result: AnalysisResult }) {
  const { battery, kpi } = result;
  const reductionPct = battery.peakReductionPct;
  const tone =
    reductionPct > 25
      ? "bg-emerald-500/10 border-emerald-500/30"
      : reductionPct > 10
        ? "bg-amber-500/10 border-amber-500/30"
        : "bg-card border-card-border";

  return (
    <div className={`shadcn-card rounded-xl border p-4 sm:p-6 ${tone}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Battery className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold tracking-tight">Battery & Peak Shaving</h3>
            <p className="text-xs text-muted-foreground">
              Sized from billing-relevant 15-minute demand
            </p>
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Recommended power
          </div>
          <div className="font-mono text-xl font-semibold tabular-nums sm:text-2xl">
            {battery.recommendedKw.toFixed(0)}
            <span className="text-sm text-muted-foreground ml-1">kW</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Recommended energy
          </div>
          <div className="font-mono text-xl font-semibold tabular-nums sm:text-2xl">
            {battery.recommendedKwh.toFixed(0)}
            <span className="text-sm text-muted-foreground ml-1">kWh</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Stat
          icon={<TrendingDown className="size-4" />}
          label="Peak reduction"
          value={`${battery.peakReductionKw.toFixed(1)} kW`}
          sub={`${reductionPct.toFixed(0)}% of ${battery.billingPeak15MinKw.toFixed(1)} kW 15-minute peak`}
        />
        <Stat
          icon={<TrendingDown className="size-4" />}
          label="Instant peak reduction"
          value={`${battery.rawPeakReductionKw.toFixed(1)} kW`}
          sub={`${battery.rawPeakReductionPct.toFixed(0)}% of ${kpi.peakPowerKw.toFixed(1)} kW raw peak`}
        />
        <Stat
          icon={<Zap className="size-4" />}
          label="Daily cycle energy"
          value={`${battery.cycleEnergyPerDayKwh.toFixed(1)} kWh/day`}
          sub={`~${battery.estimatedSavingsKwh.toFixed(0)} kWh / month shifted`}
        />
      </div>

      <p className="mt-5 text-xs text-muted-foreground leading-relaxed border-t pt-4">
        Recommendation is based on 15-minute demand reduction, not only instant peaks. Actual sizing depends on tariff structure, demand charges, and required autonomy.
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-7 items-center justify-center rounded-md bg-card text-muted-foreground shrink-0">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-mono font-semibold text-sm tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}
