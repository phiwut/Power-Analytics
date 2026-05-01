import type { HourlyProfile } from "@/lib/analysis";

interface Props {
  hourly: HourlyProfile[];
}

export function HourlyHeatmap({ hourly }: Props) {
  const max = Math.max(...hourly.map((h) => h.maxPowerKw), 0.001);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {hourly.map((h) => {
          const hAvg = max > 0 ? (h.avgPowerKw / max) * 100 : 0;
          const hMax = max > 0 ? (h.maxPowerKw / max) * 100 : 0;
          return (
            <div
              key={h.hour}
              className={`flex-1 flex flex-col-reverse gap-0.5 group relative ${h.isPartial ? "ring-1 ring-amber-500/70 rounded-sm" : ""}`}
              title={`${h.hour}:00 — avg ${h.avgPowerKw.toFixed(1)} kW, peak ${h.maxPowerKw.toFixed(1)} kW, coverage ${h.durationHours.toFixed(2)} h${h.isPartial ? " (partial hour coverage)" : ""}`}
            >
              <div
                className="w-full rounded-t bg-primary/30 group-hover:bg-primary/50 transition-colors"
                style={{ height: `${hMax}%` }}
              />
              <div
                className="w-full rounded-t bg-primary group-hover:bg-primary/90 transition-colors -mt-0.5 absolute bottom-0"
                style={{ height: `${hAvg}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}:00</span>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary" />
          Average
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary/30" />
          Peak
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-amber-500/80" />
          Partial coverage
        </div>
      </div>
    </div>
  );
}
