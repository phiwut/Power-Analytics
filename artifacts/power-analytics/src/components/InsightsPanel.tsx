import { AlertTriangle, CheckCircle2, Info, AlertOctagon } from "lucide-react";
import type { Insight } from "@/lib/analysis";
import { severityBg, severityClass } from "@/lib/analysis";
import { cn } from "@/lib/utils";

const ICONS = {
  ok: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  critical: AlertOctagon,
};

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-lg">
        No findings yet.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {insights.map((i) => {
        const Icon = ICONS[i.severity];
        return (
          <div
            key={i.id}
            className={cn(
              "flex gap-3 rounded-lg border p-4",
              severityBg(i.severity),
            )}
          >
            <Icon className={cn("size-5 shrink-0 mt-0.5", severityClass(i.severity))} />
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-sm">{i.title}</h4>
                <span
                  className={cn(
                    "text-[10px] uppercase font-bold px-1.5 py-0.5 rounded tracking-wider",
                    severityClass(i.severity),
                    "bg-background/40",
                  )}
                >
                  {i.severity}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{i.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
