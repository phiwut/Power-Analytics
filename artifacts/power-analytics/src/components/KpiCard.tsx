import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "ok" | "warning" | "critical";
  delta?: string;
}

const toneClasses: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "border-card-border",
  ok: "border-emerald-500/40",
  warning: "border-amber-500/50",
  critical: "border-red-500/50",
};

const iconBg: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function KpiCard({ label, value, unit, hint, icon: Icon, tone = "default", delta }: KpiCardProps) {
  return (
    <div
      className={cn(
        "shadcn-card rounded-xl border bg-card p-5 flex flex-col gap-3 min-w-0",
        toneClasses[tone],
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </span>
        {Icon && (
          <span className={cn("flex size-8 items-center justify-center rounded-lg", iconBg[tone])}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-3xl font-mono font-semibold tabular-nums tracking-tight truncate">
          {value}
        </span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {(hint || delta) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {hint && <span className="truncate">{hint}</span>}
          {delta && <span className="font-mono">{delta}</span>}
        </div>
      )}
    </div>
  );
}
