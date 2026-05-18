import type { HourlyProfile } from "@/lib/analysis";
import { maxNumber } from "@/lib/stats";

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
  const importPeakValues = hourly
    .map((h) => h.peakImportKw)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const exportPeakValues = hourly
    .map((h) => h.peakExportKw)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const avgImportValues = hourly
    .map((h) => Math.max(h.avgNetKw, 0))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  const avgExportValues = hourly
    .map((h) => Math.max(-h.avgNetKw, 0))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  const absImportMax = maxNumber(importPeakValues, 0);
  const absExportMax = maxNumber(exportPeakValues, 0);
  const p90ImportPeak = quantile(importPeakValues, 0.9);
  const p90ExportPeak = quantile(exportPeakValues, 0.9);
  const p95AvgImport = quantile(avgImportValues, 0.95);
  const p95AvgExport = quantile(avgExportValues, 0.95);
  const importOutlier = p90ImportPeak > 0 && absImportMax / p90ImportPeak >= 1.4;
  const exportOutlier = p90ExportPeak > 0 && absExportMax / p90ExportPeak >= 1.4;
  const hasOutlier = importOutlier || exportOutlier;

  const adaptiveImport = Math.max(0.5, p90ImportPeak * 1.15, p95AvgImport * 1.2);
  const adaptiveExport = Math.max(0.5, p90ExportPeak * 1.15, p95AvgExport * 1.2);
  const yImportMax = absImportMax > 0 ? (importOutlier ? Math.min(absImportMax, adaptiveImport) : absImportMax) : 0;
  const yExportMax = absExportMax > 0 ? (exportOutlier ? Math.min(absExportMax, adaptiveExport) : absExportMax) : 0;
  const yAbs = Math.max(0.5, yImportMax, yExportMax);

  return (
    <div className="space-y-2 overflow-x-auto pb-1">
      <div className="relative flex h-44 min-w-[520px] items-end gap-1 sm:h-48 sm:min-w-0">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {hourly.map((h) => {
          const hImportPeak = Math.min(50, yAbs > 0 ? (h.peakImportKw / yAbs) * 50 : 0);
          const hExportPeak = Math.min(50, yAbs > 0 ? (h.peakExportKw / yAbs) * 50 : 0);
          const hAvgImport = Math.min(50, yAbs > 0 ? (Math.max(h.avgNetKw, 0) / yAbs) * 50 : 0);
          const hAvgExport = Math.min(50, yAbs > 0 ? (Math.max(-h.avgNetKw, 0) / yAbs) * 50 : 0);
          const hasData = h.count > 0 && h.durationHours > 0;
          const clippedImport = h.peakImportKw > yAbs + 1e-9;
          const clippedExport = h.peakExportKw > yAbs + 1e-9;
          return (
            <div
              key={h.hour}
              className={`flex-1 h-full group relative rounded-sm ${h.isPartial ? "ring-1 ring-amber-500/70" : ""}`}
              title={
                hasData
                  ? `${h.hour}:00 — avg net ${h.avgNetKw.toFixed(1)} kW, peak import ${h.peakImportKw.toFixed(1)} kW, peak export ${h.peakExportKw.toFixed(1)} kW, coverage ${h.durationHours.toFixed(2)} h${h.isPartial ? " (partial hour coverage)" : ""}${clippedImport || clippedExport ? " (clipped by adaptive y-scale)" : ""}`
                  : `${h.hour}:00 — no data`
              }
            >
              <div
                className="absolute inset-x-0 bottom-1/2 rounded-t bg-primary/30 group-hover:bg-primary/50 transition-colors"
                style={{ height: `${hImportPeak}%` }}
              />
              <div
                className="absolute inset-x-0 top-1/2 rounded-b bg-cyan-500/30 group-hover:bg-cyan-500/50 transition-colors"
                style={{ height: `${hExportPeak}%` }}
              />
              <div
                className="absolute inset-x-0 bottom-1/2 rounded-t bg-primary group-hover:bg-primary/90 transition-colors"
                style={{ height: `${hAvgImport}%` }}
              />
              <div
                className="absolute inset-x-0 top-1/2 rounded-b bg-cyan-500 group-hover:bg-cyan-400 transition-colors"
                style={{ height: `${hAvgExport}%` }}
              />
              {clippedImport && <div className="absolute inset-x-0 top-0 h-0.5 bg-destructive/80" />}
              {clippedExport && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-destructive/80" />}
              {h.isPartial && (
                <div className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-500/80" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex min-w-[520px] justify-between font-mono text-[10px] text-muted-foreground sm:min-w-0">
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}:00</span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:gap-4">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary" />
          Avg net import (+)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary/30" />
          Peak import (+)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-cyan-500" />
          Avg net export (-)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-cyan-500/30" />
          Peak export (-)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-amber-500/80" />
          Partial coverage
        </div>
        <div className="w-full font-mono text-[10px] sm:ml-auto sm:w-auto">
          y-scale ±{yAbs.toFixed(1)} kW ({hasOutlier ? "adaptive" : "full range"})
        </div>
      </div>
    </div>
  );
}
