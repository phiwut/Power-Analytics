import { Link } from "wouter";
import { ArrowUpRight, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getGlossaryTerm } from "@/lib/glossary";

export function GlossaryTooltipLink({ slug }: { slug?: string }) {
  const term = slug ? getGlossaryTerm(slug) : undefined;

  if (!term) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          aria-label={`Explain ${term.title}`}
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-72 rounded-lg border border-popover-border px-3 py-3">
        <div className="space-y-2">
          <div>
            <div className="font-semibold">{term.title}</div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {term.tooltipSummary}
            </p>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">
            {term.tooltipRange}
          </p>
          <Link
            href={`/glossary/${term.slug}`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            Full explanation
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
