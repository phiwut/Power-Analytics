import type { HourlyProfile } from "@/lib/analysis";

interface Props {
  hourly: HourlyProfile[];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const t = idx - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

export function HourlyHeatmap({ hourly }: Props) {
  const peakValues = hourly
    .map((h) => h.maxPowerKw)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const avgValues = hourly
    .map((h) => h.avgPowerKw)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  const absoluteMax = Math.max(...peakValues, 0);
  const p90Peak = quantile(peakValues, 0.9);
  const p95Avg = quantile(avgValues, 0.95);
  const hasOutlier = p90Peak > 0 && absoluteMax / p90Peak >= 1.6;
  // Adaptive y-scale: if a single hour is a strong outlier, scale to
  // representative hours and clip the outlier; otherwise use full range.
  const adaptiveCandidate = Math.max(0.5, p90Peak * 1.15, p95Avg * 1.2);
  const yMax = absoluteMax > 0
    ? hasOutlier
      ? Math.min(absoluteMax, adaptiveCandidate)
      : Math.max(absoluteMax, 0.5)
    : 0.5;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-40">
        {hourly.map((h) => {
          const hAvgRaw = yMax > 0 ? (h.avgPowerKw / yMax) * 100 : 0;
          const hMaxRaw = yMax > 0 ? (h.maxPowerKw / yMax) * 100 : 0;
          const hAvg = Math.min(100, hAvgRaw);
          const hMax = Math.min(100, hMaxRaw);
          const hasData = h.count > 0 && h.durationHours > 0;
          const clipped = h.maxPowerKw > yMax + 1e-9;
          return (
            <div
              key={h.hour}
              className={`flex-1 h-full group relative rounded-sm ${h.isPartial ? "ring-1 ring-amber-500/70" : ""}`}
              title={
                hasData
                  ? `${h.hour}:00 — avg ${h.avgPowerKw.toFixed(1)} kW, peak ${h.maxPowerKw.toFixed(1)} kW, coverage ${h.durationHours.toFixed(2)} h${h.isPartial ? " (partial hour coverage)" : ""}${clipped ? " (clipped by adaptive y-scale)" : ""}`
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
              {clipped && <div className="absolute inset-x-0 top-0 h-0.5 bg-destructive/80" />}
              {h.isPartial && (
                <div className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-500/80" />
              )}
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
        <div className="ml-auto font-mono text-[10px]">
          y-scale 0-{yMax.toFixed(1)} kW ({hasOutlier ? "adaptive" : "full range"})
        </div>
      </div>
    </div>
  );
}
