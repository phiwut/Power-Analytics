import type { SpikeEvent } from "@/lib/analysis";
import { Button } from "@/components/ui/button";
import { Crosshair } from "lucide-react";

interface Props {
  spikes: SpikeEvent[];
  onFocus: (ts: number) => void;
}

function fmtDur(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function billingLabel(affectsBillingDemand: boolean) {
  return affectsBillingDemand ? "yes" : "no";
}

export function SpikesTable({ spikes, onFocus }: Props) {
  if (spikes.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-lg">
        No load spikes detected.
      </div>
    );
  }
  const top = [...spikes].sort((a, b) => b.powerKw - a.powerKw).slice(0, 12);
  return (
    <div className="overflow-x-auto rounded-lg border border-card-border">
      <table className="min-w-[720px] w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">When</th>
            <th className="text-right px-3 py-2 font-semibold">Peak</th>
            <th className="text-right px-3 py-2 font-semibold">×Base</th>
            <th className="text-right px-3 py-2 font-semibold">Duration</th>
            <th className="text-right px-3 py-2 font-semibold">Excess</th>
            <th className="text-right px-3 py-2 font-semibold">15m</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {top.map((s, idx) => (
            <tr key={idx} className="border-t border-card-border hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                {new Date(s.timestamp).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{s.powerKw.toFixed(1)} kW</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                {s.ratioToBase.toFixed(1)}×
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                {fmtDur(s.durationSec)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                {s.energyAboveThresholdKwh.toFixed(2)} kWh
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                {billingLabel(s.affectsBillingDemand)}
              </td>
              <td className="px-3 py-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => onFocus(s.timestamp)}>
                  <Crosshair className="size-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
