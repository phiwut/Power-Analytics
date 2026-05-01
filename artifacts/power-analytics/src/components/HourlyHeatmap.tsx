import type { HourlyProfile } from "@/lib/analysis";

interface Props {
  hourly: HourlyProfile[];
}

export function HourlyHeatmap({ hourly }: Props) {
  const max = Math.max(...hourly.map((h) => h.maxPowerKw), 0.001);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-40">
        {hourly.map((h) => {
          const hAvg = max > 0 ? (h.avgPowerKw / max) * 100 : 0;
          const hMax = max > 0 ? (h.maxPowerKw / max) * 100 : 0;
          const hasData = h.count > 0 && h.durationHours > 0;
          return (
            <div
              key={h.hour}
              className={`flex-1 h-full group relative rounded-sm ${h.isPartial ? "ring-1 ring-amber-500/70" : ""}`}
              title={
                hasData
                  ? `${h.hour}:00 — avg ${h.avgPowerKw.toFixed(1)} kW, peak ${h.maxPowerKw.toFixed(1)} kW, coverage ${h.durationHours.toFixed(2)} h${h.isPartial ? " (partial hour coverage)" : ""}`
                  : `${h.hour}:00 — no data`
              }
            >
              <div
                className="absolute inset-x-0 bottom-0 rounded-t bg-primary/30 group-hover:bg-primary/50 transition-colors"
                style={{ height: `${hMax}%` }}
              />
              <div
                className="absolute inset-x-0 bottom-0 rounded-t bg-primary group-hover:bg-primary/90 transition-colors"
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
