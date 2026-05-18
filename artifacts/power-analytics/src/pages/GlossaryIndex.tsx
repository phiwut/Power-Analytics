import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, BookOpenText, Search } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  GLOSSARY_CATEGORY_LABELS,
  GLOSSARY_TERMS,
  type GlossaryTerm,
} from "@/lib/glossary";

const CATEGORY_ORDER: GlossaryTerm["category"][] = ["load", "quality", "power", "battery", "pv"];

export default function GlossaryIndex() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GlossaryTerm["category"] | "all">("all");

  const filteredTerms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return GLOSSARY_TERMS.filter((term) => {
      const categoryMatch = category === "all" || term.category === category;
      if (!categoryMatch) return false;
      if (!needle) return true;
      return [
        term.title,
        term.shortLabel,
        term.summary,
        term.definition,
        term.tooltipSummary,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [query, category]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader dark={false} onToggleDark={() => undefined} hideThemeToggle />

      <main className="mx-auto max-w-[1320px] space-y-5 px-3 py-4 sm:space-y-8 sm:px-6 sm:py-8">
        <section className="rounded-2xl border border-card-border bg-card px-4 py-5 sm:px-6 sm:py-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)] lg:items-end">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <BookOpenText className="size-3.5" />
                Power glossary
              </div>
              <div className="space-y-2">
                <h1 className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
                  Power terms explained in plain language, with live examples instead of jargon.
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Every page explains one KPI from the analytics tool, shows what a healthy value looks like,
                  where it becomes risky, and how to interpret the curve in context.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{GLOSSARY_TERMS.length} indexed terms</span>
                <span>Interactive good/watch/bad examples</span>
                <span>Linked directly from dashboard tooltips</span>
              </div>
            </div>

            <div className="grid gap-3 min-[520px]:grid-cols-3 lg:grid-cols-1">
              {[
                { label: "Fast lookup", value: "1 click", body: "Open the exact explanation from the KPI tooltip." },
                { label: "Coverage", value: `${CATEGORY_ORDER.length} areas`, body: "Load, quality, battery and PV overlap in one glossary." },
                { label: "Teaching style", value: "Plain", body: "Definition, examples, FAQ and visual interpretation on every page." },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-border bg-background/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight">{item.value}</div>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-card-border bg-card px-3 py-4 sm:px-5 sm:py-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search peak demand, power factor, THD, PV ..."
                className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none ring-0 transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
            </label>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              <CategoryChip active={category === "all"} onClick={() => setCategory("all")}>
                All terms
              </CategoryChip>
              {CATEGORY_ORDER.map((value) => (
                <CategoryChip
                  key={value}
                  active={category === value}
                  onClick={() => setCategory(value)}
                >
                  {GLOSSARY_CATEGORY_LABELS[value]}
                </CategoryChip>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTerms.map((term) => (
            <Link
              key={term.slug}
              href={`/glossary/${term.slug}`}
              className="group rounded-2xl border border-card-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-card/90 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {GLOSSARY_CATEGORY_LABELS[term.category]}
                  </div>
                  <h2 className="mt-2 text-lg font-semibold tracking-tight sm:text-xl">{term.title}</h2>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                  {term.unit || "ratio"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{term.summary}</p>
              <p className="mt-4 text-sm leading-6">{term.plainLanguage}</p>
              <div className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Open explanation
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}

function CategoryChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className="h-8 shrink-0 rounded-full px-3 text-xs"
    >
      {children}
    </Button>
  );
}
