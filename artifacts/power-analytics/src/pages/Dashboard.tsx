import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Battery,
  Bolt,
  Clock,
  Flame,
  Gauge,
  Plug,
  Radio,
  TrendingUp,
  Waves,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { FileDropzone } from "@/components/FileDropzone";
import { KpiCard } from "@/components/KpiCard";
import { MainChart } from "@/components/MainChart";
import { InsightsPanel } from "@/components/InsightsPanel";
import { PhaseGauges } from "@/components/PhaseGauges";
import { HourlyHeatmap } from "@/components/HourlyHeatmap";
import { BatteryCard } from "@/components/BatteryCard";
import { ThresholdsPanel } from "@/components/ThresholdsPanel";
import { SpikesTable } from "@/components/SpikesTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sliders } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { parseFile, type ParsedDataset } from "@/lib/parser";
import {
  analyse,
  DEFAULT_THRESHOLDS,
  METRIC_SERIES,
  type Thresholds,
  type AnalysisResult,
} from "@/lib/analysis";
import { exportFindingsCsv, exportFindingsJson, exportPdfReport } from "@/lib/export";

export default function Dashboard() {
  const [ds, setDs] = useState<ParsedDataset | null>(null);
  const [busy, setBusy] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [visible, setVisible] = useState<Set<string>>(
    new Set(METRIC_SERIES.filter((s) => s.enabledByDefault).map((s) => s.key)),
  );
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });
  const [selectedProfileDay, setSelectedProfileDay] = useState<string>("all");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    setSelectedProfileDay("all");
  }, [ds?.startTime, ds?.endTime]);

  const result: AnalysisResult | null = useMemo(() => {
    if (!ds) return null;
    return analyse(ds, thresholds);
  }, [ds, thresholds]);

  const profileHourly = useMemo(() => {
    if (!result) return [];
    if (selectedProfileDay === "all") return result.hourlyProfile;
    return (
      result.hourlyProfilesByDay.find((d) => String(d.dayStart) === selectedProfileDay)?.hourly ??
      result.hourlyProfile
    );
  }, [result, selectedProfileDay]);

  const selectedProfileLabel = useMemo(() => {
    if (!result || selectedProfileDay === "all") return "All days";
    return (
      result.hourlyProfilesByDay.find((d) => String(d.dayStart) === selectedProfileDay)?.dayLabel ??
      "All days"
    );
  }, [result, selectedProfileDay]);

  const onFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      setDs(parsed);
      setRange([parsed.startTime, parsed.endTime]);
      if (parsed.warnings.length) {
        toast({
          title: "Loaded with notes",
          description: parsed.warnings.slice(0, 2).join(" · "),
        });
      } else {
        toast({
          title: `Loaded ${parsed.rowCount.toLocaleString()} rows`,
          description: `${file.name} parsed successfully.`,
        });
      }
    } catch (e) {
      toast({
        title: "Could not parse file",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSample = useCallback(async () => {
    setBusy(true);
    try {
      const baseUrl = import.meta.env.BASE_URL || "/";
      const res = await fetch(`${baseUrl}sample.txt`);
      if (!res.ok) throw new Error("Sample file unavailable");
      const blob = await res.blob();
      const file = new File([blob], "sample-power-data.txt", { type: "text/plain" });
      const parsed = await parseFile(file);
      setDs(parsed);
      setRange([parsed.startTime, parsed.endTime]);
      toast({
        title: `Loaded sample (${parsed.rowCount.toLocaleString()} rows)`,
      });
    } catch (e) {
      toast({
        title: "Sample not available",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const toggleMetric = useCallback((key: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const focusOn = useCallback(
    (ts: number) => {
      if (!ds) return;
      const span = Math.max(ds.intervalSeconds * 60_000, 5 * 60_000);
      setRange([Math.max(ds.startTime, ts - span), Math.min(ds.endTime, ts + span)]);
    },
    [ds],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader
        fileName={ds?.fileName}
        rowCount={ds?.rowCount}
        onExportPdf={ds && result ? () => exportPdfReport(result, ds) : undefined}
        onExportCsv={ds && result ? () => exportFindingsCsv(result, ds) : undefined}
        onExportJson={ds && result ? () => exportFindingsJson(result, ds) : undefined}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        onLoadSample={loadSample}
      />

      {!ds && <EmptyState onFile={onFile} busy={busy} onLoadSample={loadSample} />}

      {ds && result && range && (
        <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
          <KpiRow result={result} />

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-6 min-w-0">
              <section className="shadcn-card rounded-xl border bg-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-semibold tracking-tight">
                      Time-series explorer
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Drag horizontally on the chart to zoom into any window. Click metric chips to toggle series.
                    </p>
                  </div>
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Sliders className="size-4 mr-1.5" />
                        Thresholds
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
                      <ThresholdsPanel thresholds={thresholds} onChange={setThresholds} />
                    </SheetContent>
                  </Sheet>
                </div>
                <MainChart
                  ds={ds}
                  range={range}
                  onRangeChange={setRange}
                  visible={visible}
                  onToggleMetric={toggleMetric}
                />
              </section>

              <Tabs defaultValue="phases" className="w-full">
                <TabsList className="grid w-full grid-cols-4 max-w-xl">
                  <TabsTrigger value="phases">Phases</TabsTrigger>
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                  <TabsTrigger value="spikes">Spikes</TabsTrigger>
                  <TabsTrigger value="battery">Battery</TabsTrigger>
                </TabsList>
                <TabsContent value="phases" className="mt-4">
                  <PhaseGauges ds={ds} result={result} />
                </TabsContent>
                <TabsContent value="profile" className="mt-4">
                  <div className="shadcn-card rounded-xl border bg-card p-6">
                    <div className="flex items-baseline justify-between mb-4">
                      <div>
                        <h3 className="font-semibold tracking-tight">Hourly load profile</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Average net load and import/export peaks per hour-of-day
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {result.hourlyProfilesByDay.length > 1 && (
                          <Select value={selectedProfileDay} onValueChange={setSelectedProfileDay}>
                            <SelectTrigger className="h-8 w-[170px] text-xs">
                              <SelectValue placeholder="Select day" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All days</SelectItem>
                              {result.hourlyProfilesByDay.map((day) => (
                                <SelectItem key={day.dayStart} value={String(day.dayStart)}>
                                  {day.dayLabel}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <span className="text-xs text-muted-foreground font-mono">
                          {selectedProfileLabel} · peak {result.kpi.peakPowerKw.toFixed(1)} kW
                        </span>
                      </div>
                    </div>
                    <HourlyHeatmap hourly={profileHourly} />
                  </div>
                </TabsContent>
                <TabsContent value="spikes" className="mt-4">
                  <SpikesTable spikes={result.spikes} onFocus={focusOn} />
                </TabsContent>
                <TabsContent value="battery" className="mt-4">
                  <BatteryCard result={result} />
                </TabsContent>
              </Tabs>
            </div>

            <aside className="space-y-6 min-w-0">
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold tracking-tight">Findings</h2>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {result.insights.length} item{result.insights.length === 1 ? "" : "s"}
                  </span>
                </div>
                <InsightsPanel insights={result.insights} />
              </section>

              <FileDropzone onFile={onFile} busy={busy} compact />
            </aside>
          </div>

          {ds.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3 text-sm">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-700 dark:text-amber-300 mb-1">
                  Parsing notes
                </div>
                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                  {ds.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </main>
      )}

      <Toaster />
    </div>
  );
}

function EmptyState({
  onFile,
  busy,
  onLoadSample,
}: {
  onFile: (f: File) => void;
  busy: boolean;
  onLoadSample: () => void;
}) {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 space-y-10">
      <div className="text-center space-y-3">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2">
          <Activity className="size-7" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Power Quality &amp; Load Analytics
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Drop a CSV or TXT export from your power analyzer or energy meter to instantly see load peaks,
          voltage stability, harmonic distortion, phase imbalance, and battery sizing recommendations.
        </p>
      </div>

      <FileDropzone onFile={onFile} busy={busy} />

      <div className="text-center">
        <Button variant="outline" onClick={onLoadSample} disabled={busy}>
          Or try the sample dataset
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
        {[
          { icon: Bolt, title: "Load & energy", body: "Peak demand, average load, base load and total kWh." },
          { icon: Waves, title: "Power quality", body: "Voltage stability, THD, frequency, phase imbalance." },
          { icon: Battery, title: "Peak shaving", body: "Battery kW/kWh sizing for demand-charge reduction." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border bg-card p-4">
            <f.icon className="size-5 text-primary mb-2" />
            <div className="font-semibold text-sm">{f.title}</div>
            <p className="text-xs text-muted-foreground mt-1">{f.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

function KpiRow({ result }: { result: AnalysisResult }) {
  const { kpi } = result;
  const voltageTone =
    kpi.voltageMin < 207 || kpi.voltageMax > 253
      ? "critical"
      : kpi.voltageStability < 1
        ? "ok"
        : "default";
  const pfTone =
    kpi.pfImportSampleCount === 0
      ? "default"
      : kpi.pfMin < 0.8
        ? "critical"
        : kpi.pfAvg < 0.9
          ? "warning"
          : "ok";
  const imbTone =
    kpi.imbalanceMaxPct >= 5 ? "critical" : kpi.imbalanceMaxPct >= 2 ? "warning" : "ok";
  const thdTone =
    kpi.thdAHighLoadMaxPct >= 25 ? "critical" : kpi.thdAHighLoadMaxPct >= 15 ? "warning" : "ok";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      <KpiCard
        label="Peak demand"
        value={kpi.peakPowerKw.toFixed(1)}
        unit="kW"
        hint={new Date(kpi.peakPowerAt).toLocaleString()}
        icon={TrendingUp}
        tone="default"
      />
      <KpiCard
        label="Avg load"
        value={kpi.avgPowerKw.toFixed(1)}
        unit="kW"
        hint={`import base ${kpi.baseLoadKw.toFixed(1)} kW`}
        icon={Gauge}
      />
      <KpiCard
        label="Energy"
        value={kpi.energyKwh.toFixed(0)}
        unit="kWh"
        hint={`${kpi.durationHours.toFixed(1)} h coverage`}
        icon={Zap}
      />
      <KpiCard
        label="Voltage"
        value={kpi.voltageAvg.toFixed(0)}
        unit="V"
        hint={`${kpi.voltageMin.toFixed(0)}–${kpi.voltageMax.toFixed(0)} V`}
        icon={Plug}
        tone={voltageTone}
      />
      <KpiCard
        label="Power factor"
        value={kpi.pfImportSampleCount ? kpi.pfAvg.toFixed(2) : "n/a"}
        hint={
          kpi.pfImportSampleCount
            ? `import min ${kpi.pfMin.toFixed(2)}`
            : `${kpi.pfIgnoredSampleCount.toLocaleString()} ignored`
        }
        icon={Bolt}
        tone={pfTone}
      />
      <KpiCard
        label="THD I load"
        value={kpi.thdAHighLoadMaxPct.toFixed(1)}
        unit="%"
        hint={kpi.thdVAvailable ? `THD V ${kpi.thdVMaxPct.toFixed(1)}%` : "THD V n/a"}
        icon={Radio}
        tone={thdTone}
      />
      <KpiCard
        label="Imbalance"
        value={kpi.imbalanceMaxPct.toFixed(2)}
        unit="%"
        hint={`avg ${kpi.imbalanceAvgPct.toFixed(2)}%`}
        icon={Activity}
        tone={imbTone}
      />
      <KpiCard
        label="Spikes"
        value={String(kpi.spikeCount)}
        hint={`peak/avg ${kpi.peakToAvg.toFixed(2)}×`}
        icon={Flame}
      />
      <KpiCard
        label="Frequency"
        value={kpi.frequencyAvg.toFixed(2)}
        unit="Hz"
        hint={`±${Math.max(Math.abs(kpi.frequencyMax - 50), Math.abs(kpi.frequencyMin - 50)).toFixed(2)}`}
        icon={Waves}
      />
      <KpiCard
        label="Sample interval"
        value={fmtInterval(kpi.intervalSeconds)}
        hint={`${kpi.totalRows.toLocaleString()} samples`}
        icon={Clock}
      />
      <KpiCard
        label="Battery rec"
        value={`${result.battery.recommendedKw.toFixed(0)}/${result.battery.recommendedKwh.toFixed(0)}`}
        unit="kW/kWh"
        hint={`${result.battery.billingPeakReductionPct.toFixed(0)}% 15m ↓`}
        icon={Battery}
      />
      <KpiCard
        label="Neutral I"
        value={kpi.neutralCurrentMax.toFixed(1)}
        unit="A"
        hint="max during window"
        icon={Activity}
      />
    </div>
  );
}

function fmtInterval(s: number): string {
  if (s < 60) return `${s.toFixed(0)} s`;
  if (s < 3600) return `${(s / 60).toFixed(1)} m`;
  return `${(s / 3600).toFixed(1)} h`;
}
