import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Thresholds } from "@/lib/analysis";
import { DEFAULT_THRESHOLDS } from "@/lib/analysis";
import { RotateCcw } from "lucide-react";

interface Props {
  thresholds: Thresholds;
  onChange: (t: Thresholds) => void;
}

export function ThresholdsPanel({ thresholds, onChange }: Props) {
  const set = <K extends keyof Thresholds>(k: K, v: Thresholds[K]) =>
    onChange({ ...thresholds, [k]: v });

  const num = (k: keyof Thresholds, label: string, step = 0.1, suffix = "") => (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs text-muted-foreground flex-1">{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step={step}
          value={thresholds[k]}
          onChange={(e) => set(k, parseFloat(e.target.value) as Thresholds[typeof k])}
          className="h-8 w-24 font-mono text-sm tabular-nums"
        />
        {suffix && <span className="text-xs text-muted-foreground w-6">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Engineering thresholds</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_THRESHOLDS })}
        >
          <RotateCcw className="size-3.5 mr-1" />
          Defaults
        </Button>
      </div>

      <Section title="Voltage">
        {num("voltageNominal", "Nominal", 1, "V")}
        {num("voltageTolerancePct", "Tolerance ±", 0.5, "%")}
      </Section>

      <Section title="Power Factor">
        {num("pfWarn", "Warning below", 0.05)}
        {num("pfCritical", "Critical below", 0.05)}
      </Section>

      <Section title="THD Voltage">
        {num("thdVWarn", "Warning ≥", 0.5, "%")}
        {num("thdVCritical", "Critical ≥", 0.5, "%")}
      </Section>

      <Section title="THD Current">
        {num("thdAWarn", "Warning ≥", 1, "%")}
        {num("thdACritical", "Critical ≥", 1, "%")}
      </Section>

      <Section title="Phase Imbalance">
        {num("imbalanceWarnPct", "Warning ≥", 0.5, "%")}
        {num("imbalanceCriticalPct", "Critical ≥", 0.5, "%")}
      </Section>

      <Section title="Frequency">
        {num("frequencyNominal", "Nominal", 0.1, "Hz")}
        {num("frequencyTolerance", "Tolerance ±", 0.1, "Hz")}
      </Section>

      <Section title="Neutral">
        {num("neutralWarnPctOfPhase", "Warn at % of phase", 5, "%")}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pb-3 border-b last:border-b-0">
      <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
