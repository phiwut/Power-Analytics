import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, ArrowRight, BookOpenText } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  GLOSSARY_CATEGORY_LABELS,
  GLOSSARY_TERMS,
  getGlossaryTerm,
  type GlossaryTerm,
} from "@/lib/glossary";

const STATUS_COPY: Record<GlossaryTerm["examples"][number]["status"], string> = {
  good: "Healthy example",
  watch: "Needs attention",
  bad: "Poor example",
};

const STATUS_CLASSES: Record<GlossaryTerm["examples"][number]["status"], string> = {
  good: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  watch: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  bad: "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300",
};

export default function GlossaryTermPage({ slug }: { slug: string }) {
  const term = getGlossaryTerm(slug);
  const [selectedExampleIndex, setSelectedExampleIndex] = useState(0);

  useEffect(() => {
    setSelectedExampleIndex(0);
  }, [slug]);

  useEffect(() => {
    if (!term) return;

    document.title = `${term.title} explained | Power Analytics`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", term.summary);
    }

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.glossaryStructuredData = term.slug;
    script.text = JSON.stringify(buildStructuredData(term));
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [term]);

  const selectedExample = term?.examples[selectedExampleIndex];

  const relatedTerms = useMemo(
    () =>
      (term?.relatedSlugs ?? [])
        .map((relatedSlug) => getGlossaryTerm(relatedSlug))
        .filter((value): value is GlossaryTerm => Boolean(value)),
    [term],
  );

  if (!term) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <AppHeader dark={false} onToggleDark={() => undefined} hideThemeToggle />
        <main className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-2xl border border-card-border bg-card p-8">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Glossary
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Term not found</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The requested glossary page does not exist in this build.
            </p>
            <Button className="mt-6" size="sm" asChild>
              <Link href="/glossary">
                Back to glossary
              </Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader dark={false} onToggleDark={() => undefined} hideThemeToggle />

      <main className="mx-auto max-w-[1320px] px-6 py-8 space-y-8">
        <section className="rounded-2xl border border-card-border bg-card px-6 py-8">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link href="/" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              Dashboard
            </Link>
            <span>/</span>
            <Link href="/glossary" className="hover:text-foreground">
              Glossary
            </Link>
            <span>/</span>
            <span className="text-foreground">{term.title}</span>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] lg:items-start">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <BookOpenText className="size-3.5" />
                {term.heroKicker}
              </div>
              <div>
                <h1 className="text-4xl font-semibold tracking-tight">{term.title}</h1>
                <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">{term.summary}</p>
              </div>
              <p className="max-w-3xl text-base leading-7">{term.plainLanguage}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <FactTile label="Unit" value={term.unit || "ratio"} body="Displayed in the dashboard exactly this way." />
              <FactTile label="Quick take" value={term.quickTake} body="Short interpretation for a first read." />
              {term.formula ? <FactTile label="Formula" value={term.formula} body="Rule of thumb used in the explanation." /> : null}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <div className="rounded-2xl border border-card-border bg-card p-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Definition
                </div>
                <p className="mt-3 text-sm leading-7">{term.definition}</p>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Why it matters
                </div>
                <p className="mt-3 text-sm leading-7">{term.whyItMatters}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-card-border bg-card p-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Good vs bad
            </div>
            <div className="mt-3 space-y-3">
              <Callout title="Good" body={term.goodExample} tone="good" />
              <Callout title="Bad" body={term.badExample} tone="bad" />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-card-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Interactive examples
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">See how the value behaves in context.</h2>
            </div>
            <div className="text-sm text-muted-foreground">
              Switch between healthy, borderline and poor scenarios.
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              {term.examples.map((example, index) => (
                <button
                  key={`${example.label}-${index}`}
                  type="button"
                  onClick={() => setSelectedExampleIndex(index)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    selectedExampleIndex === index
                      ? STATUS_CLASSES[example.status]
                      : "border-card-border bg-background/70 hover:border-primary/25"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider">
                        {STATUS_COPY[example.status]}
                      </div>
                      <div className="mt-2 text-lg font-semibold tracking-tight">{example.label}</div>
                    </div>
                    <div className="text-sm font-semibold">{example.value}</div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-current/80">{example.explanation}</p>
                </button>
              ))}
            </div>

            {selectedExample ? (
              <div className="rounded-2xl border border-card-border bg-background/65 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Example curve
                    </div>
                    <div className="mt-1 text-lg font-semibold tracking-tight">{selectedExample.label}</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_CLASSES[selectedExample.status]}`}>
                    {selectedExample.value}
                  </span>
                </div>

                <div className="mt-4 h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={selectedExample.samplePoints.map((value, index) => ({
                        step: index + 1,
                        value,
                      }))}
                      margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.55} />
                      <XAxis
                        dataKey="step"
                        tickLine={false}
                        axisLine={false}
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        width={54}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 10,
                          color: "hsl(var(--popover-foreground))",
                        }}
                        formatter={(value: number) => {
                          const unit = term.unit ? ` ${term.unit}` : "";
                          return [`${Number(value).toFixed(2)}${unit}`, term.shortLabel];
                        }}
                        labelFormatter={(value) => `Step ${value}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={statusStroke(selectedExample.status)}
                        fill={statusFill(selectedExample.status)}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {selectedExample.explanation}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-card-border bg-card p-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              FAQ
            </div>
            <div className="mt-4 divide-y divide-border">
              {term.faq.map((item) => (
                <div key={item.question} className="py-4 first:pt-0 last:pb-0">
                  <h3 className="text-base font-semibold tracking-tight">{item.question}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-card-border bg-card p-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Related terms
            </div>
            <div className="mt-4 space-y-3">
              {relatedTerms.map((related) => (
                <Link
                  key={related.slug}
                  href={`/glossary/${related.slug}`}
                  className="group block rounded-xl border border-card-border bg-background/65 p-4 transition-colors hover:border-primary/25"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {GLOSSARY_CATEGORY_LABELS[related.category]}
                      </div>
                      <div className="mt-1 text-base font-semibold tracking-tight">{related.title}</div>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{related.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function FactTile({
  label,
  value,
  body,
}: {
  label: string;
  value: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold tracking-tight">{value}</div>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}

function Callout({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "good" | "bad";
}) {
  const classes =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";

  return (
    <div className={`rounded-xl border p-4 ${classes}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider">{title}</div>
      <p className="mt-2 text-sm leading-6 text-current/85">{body}</p>
    </div>
  );
}

function statusStroke(status: GlossaryTerm["examples"][number]["status"]) {
  switch (status) {
    case "good":
      return "#059669";
    case "watch":
      return "#d97706";
    case "bad":
      return "#dc2626";
  }
}

function statusFill(status: GlossaryTerm["examples"][number]["status"]) {
  switch (status) {
    case "good":
      return "rgba(5, 150, 105, 0.18)";
    case "watch":
      return "rgba(217, 119, 6, 0.18)";
    case "bad":
      return "rgba(220, 38, 38, 0.18)";
  }
}

function buildStructuredData(term: GlossaryTerm) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTerm",
        name: term.title,
        description: term.summary,
        inDefinedTermSet: "Power Analytics Glossary",
        termCode: term.slug,
      },
      {
        "@type": "FAQPage",
        mainEntity: term.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}
