import { useMemo, useRef, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Download, Image as ImageIcon } from "lucide-react";
import type { ParsedDataset } from "@/lib/parser";
import { METRIC_SERIES, downsample } from "@/lib/analysis";
import type { PvComparisonResult } from "@/lib/pv";
import { cn } from "@/lib/utils";
import { captureChartPng, downloadCsv } from "@/lib/export";

interface Props {
  ds: ParsedDataset;
  range: [number, number];
  onRangeChange: (r: [number, number]) => void;
  visible: Set<string>;
  onToggleMetric: (key: string) => void;
  pvComparison?: PvComparisonResult | null;
}

const MAX_POINTS = 1500;

function fmtTime(ts: number, totalMs: number): string {
  const d = new Date(ts);
  if (totalMs > 7 * 24 * 3600_000) {
    return d.toLocaleDateString();
  }
  if (totalMs > 24 * 3600_000) {
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" });
  }
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface DualAxisGroup {
  yAxisId: string;
  unit: string;
  side: "left" | "right";
  domain: [number | "auto", number | "auto"];
}

interface ChartSeries {
  key: string;
  label: string;
  unit: string;
  color: string;
  getValue?: (r: ParsedDataset["rows"][number]) => number | undefined;
}

const PV_SERIES: ChartSeries[] = [
  {
    key: "pv_generation",
    label: "PV generation",
    unit: "kW",
    color: "#f59e0b",
  },
  {
    key: "residual_load",
    label: "Residual load estimate",
    unit: "kW",
    color: "#06b6d4",
  },
];

export function MainChart({ ds, range, onRangeChange, visible, onToggleMetric, pvComparison }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);

  const chartSeries = useMemo<ChartSeries[]>(
    () => [
      ...METRIC_SERIES,
      ...(pvComparison ? PV_SERIES : []),
    ],
    [pvComparison],
  );

  const visibleSeries = useMemo(
    () => chartSeries.filter((s) => visible.has(s.key)),
    [chartSeries, visible],
  );

  const pvPointByTimestamp = useMemo(() => {
    const map = new Map<number, { generationKw: number; residualLoadKw: number }>();
    for (const point of pvComparison?.points ?? []) {
      map.set(point.timestamp, {
        generationKw: point.generationKw,
        residualLoadKw: point.residualLoadKw,
      });
    }
    return map;
  }, [pvComparison]);

  const filteredRows = useMemo(() => {
    return ds.rows.filter((r) => r.timestamp >= range[0] && r.timestamp <= range[1]);
  }, [ds.rows, range]);

  const sampledRows = useMemo(
    () => downsample(filteredRows, MAX_POINTS),
    [filteredRows],
  );

  const data = useMemo(() => {
    return sampledRows.map((r) => {
      const point: Record<string, number | string> = { t: r.timestamp };
      for (const s of visibleSeries) {
        const pvPoint = pvPointByTimestamp.get(r.timestamp);
        const v =
          s.key === "pv_generation"
            ? pvPoint?.generationKw
            : s.key === "residual_load"
              ? pvPoint?.residualLoadKw
              : s.getValue?.(r);
        if (v !== undefined && !isNaN(v)) {
          point[s.key] = v;
        }
      }
      return point;
    });
  }, [sampledRows, visibleSeries, pvPointByTimestamp]);

  // Build axis groups by unit
  const axisGroups = useMemo<DualAxisGroup[]>(() => {
    const units = Array.from(new Set(visibleSeries.map((s) => s.unit || "_")));
    return units.slice(0, 2).map((u, idx) => ({
      yAxisId: u,
      unit: u === "_" ? "" : u,
      side: idx === 0 ? "left" : "right",
      domain: ["auto", "auto"],
    }));
  }, [visibleSeries]);

  const seriesAxisFor = useCallback(
    (key: string) => {
      const series = visibleSeries.find((s) => s.key === key);
      if (!series) return axisGroups[0]?.yAxisId ?? "_";
      const unit = series.unit || "_";
      if (axisGroups.find((g) => g.yAxisId === unit)) return unit;
      return axisGroups[0]?.yAxisId ?? unit;
    },
    [visibleSeries, axisGroups],
  );

  const totalMs = ds.endTime - ds.startTime;

  const handleZoomIn = () => {
    const center = (range[0] + range[1]) / 2;
    const half = (range[1] - range[0]) / 4;
    onRangeChange([center - half, center + half]);
  };
  const handleZoomOut = () => {
    const center = (range[0] + range[1]) / 2;
    const half = range[1] - range[0];
    const newStart = Math.max(ds.startTime, center - half);
    const newEnd = Math.min(ds.endTime, center + half);
    onRangeChange([newStart, newEnd]);
  };
  const handleReset = () => onRangeChange([ds.startTime, ds.endTime]);

  const handleExportPng = async () => {
    if (chartRef.current) {
      await captureChartPng(chartRef.current, "power-chart.png");
    }
  };

  const handleExportCsv = () => {
    if (visibleSeries.length === 0) return;
    const headers = ["timestamp_iso", "timestamp_ms", ...visibleSeries.map((s) => `${s.label} (${s.unit})`)];
    const rows = filteredRows.map((r) => [
      new Date(r.timestamp).toISOString(),
      String(r.timestamp),
      ...visibleSeries.map((s) => {
        const pvPoint = pvPointByTimestamp.get(r.timestamp);
        const v =
          s.key === "pv_generation"
            ? pvPoint?.generationKw
            : s.key === "residual_load"
              ? pvPoint?.residualLoadKw
              : s.getValue?.(r);
        return v === undefined ? "" : String(v);
      }),
    ]);
    downloadCsv("power-data.csv", [headers, ...rows]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 min-[860px]:flex-row min-[860px]:items-center min-[860px]:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="sm" onClick={handleZoomIn}>
            <ZoomIn className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleZoomOut}>
            <ZoomOut className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <Maximize2 className="size-4 mr-1" />
            Fit
          </Button>
          <span className="ml-0 w-full pt-1 font-mono text-[11px] text-muted-foreground sm:ml-3 sm:w-auto sm:pt-0 sm:text-xs">
            {fmtTime(range[0], totalMs)} – {fmtTime(range[1], totalMs)}
          </span>
          <span className="text-[11px] text-muted-foreground sm:ml-2 sm:text-xs">
            {filteredRows.length.toLocaleString()} pts → {sampledRows.length.toLocaleString()} drawn
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="size-4 mr-1" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPng}>
            <ImageIcon className="size-4 mr-1" />
            PNG
          </Button>
        </div>
      </div>

      <div ref={chartRef} className="rounded-lg border border-card-border bg-card p-2 sm:p-3">
        <div className="h-[340px] w-full sm:h-[420px] xl:h-[480px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
              onMouseDown={(e) => {
                if (e && e.activeLabel !== undefined) {
                  setDrag({ start: Number(e.activeLabel), end: Number(e.activeLabel) });
                }
              }}
              onMouseMove={(e) => {
                if (drag && e && e.activeLabel !== undefined) {
                  setDrag({ start: drag.start, end: Number(e.activeLabel) });
                }
              }}
              onMouseUp={() => {
                if (drag && Math.abs(drag.end - drag.start) > 1000) {
                  const s = Math.min(drag.start, drag.end);
                  const e = Math.max(drag.start, drag.end);
                  onRangeChange([s, e]);
                }
                setDrag(null);
              }}
            >
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.5} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[range[0], range[1]]}
                scale="time"
                tickFormatter={(v) => fmtTime(v, range[1] - range[0])}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                minTickGap={36}
              />
              {axisGroups.map((g) => (
                <YAxis
                  key={g.yAxisId}
                  yAxisId={g.yAxisId}
                  orientation={g.side}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  width={44}
                  label={{
                    value: g.unit,
                    angle: -90,
                    position: g.side === "left" ? "insideLeft" : "insideRight",
                    style: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
                  }}
                />
              ))}
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "hsl(var(--popover-foreground))",
                }}
                labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                formatter={(value: number, name: string, item: { dataKey?: unknown }) => {
                  const dataKey = typeof item.dataKey === "string" ? item.dataKey : undefined;
                  const series = visibleSeries.find((s) => s.key === dataKey || s.label === name);
                  const unit = series?.unit ? ` ${series.unit}` : "";
                  return [
                    `${Number(value).toFixed(2)}${unit}`,
                    series?.label ?? name,
                  ];
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: 8, fontSize: 11 }}
                onClick={(o) => {
                  const k = (o as { dataKey?: unknown }).dataKey;
                  if (typeof k === "string" || typeof k === "number") {
                    onToggleMetric(String(k));
                  }
                }}
              />
              {visibleSeries.map((s) => (
                <Line
                  key={s.key}
                  yAxisId={seriesAxisFor(s.key)}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
              {drag && (
                <ReferenceArea
                  x1={Math.min(drag.start, drag.end)}
                  x2={Math.max(drag.start, drag.end)}
                  fill="hsl(var(--primary))"
                  fillOpacity={0.15}
                  yAxisId={axisGroups[0]?.yAxisId}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {chartSeries.map((s) => {
          const on = visible.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => onToggleMetric(s.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover-elevate active-elevate-2",
                on
                  ? "bg-card border-card-border text-foreground"
                  : "bg-muted/50 border-transparent text-muted-foreground",
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ background: on ? s.color : "hsl(var(--muted-foreground))" }}
              />
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
