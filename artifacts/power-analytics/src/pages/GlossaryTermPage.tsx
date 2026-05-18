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

interface TermPlaybook {
  drivers: string[];
  checks: string[];
  actions: string[];
  mistakes: string[];
  inTool: string[];
}

const CATEGORY_PLAYBOOKS: Record<GlossaryTerm["category"], TermPlaybook> = {
  load: {
    drivers: [
      "Operating hours, equipment sequencing, and the difference between active time and idle time.",
      "Whether large loads start together or are spread more evenly across the day.",
      "Data resolution: coarse intervals can smooth the exact behavior you are trying to understand.",
    ],
    checks: [
      "Compare the metric against peak demand, average load, and base load instead of reading it alone.",
      "Look for whether the issue is persistent or driven by a few narrow windows.",
      "Check whether the pattern repeats by hour-of-day, shift, or day-type before changing operations.",
    ],
    actions: [
      "Stagger heavy equipment starts, shorten idle runtime, and shut off avoidable always-on loads.",
      "Use submetering or equipment schedules if one site-level number is not enough to isolate the driver.",
      "If the issue is peak-related, test storage or operational buffering before investing in larger infrastructure.",
    ],
    mistakes: [
      "Treating one high point as a complete story without comparing it to the average and the base profile.",
      "Assuming the metric is operationally meaningful when the sample interval is too coarse to see the root cause.",
      "Optimizing peaks while ignoring a base load that is quietly consuming energy all day.",
    ],
    inTool: [
      "Use the time-series explorer first, then compare the KPI card against the hourly profile and spike table.",
      "If the metric changes a lot when you zoom in, the site behavior is event-driven rather than structurally constant.",
      "The battery recommendation is downstream of these load metrics, so read the load story before trusting the storage story.",
    ],
  },
  quality: {
    drivers: [
      "Upstream grid quality, internal wiring conditions, and how evenly different phases are loaded.",
      "Nonlinear equipment such as drives, UPS systems, LED supplies, and rectifier-based loads.",
      "Whether the observed issue is constant or only appears under certain loading conditions.",
    ],
    checks: [
      "Compare the metric against load level, because many quality issues become relevant only under meaningful current draw.",
      "Use related metrics together: THD, neutral current, imbalance, and voltage stability often explain each other.",
      "Look for repeatable windows rather than isolated samples, especially when deciding whether field investigation is justified.",
    ],
    actions: [
      "Rebalance single-phase loads, review compensation settings, and inspect harmonic-heavy circuits first.",
      "If the issue follows one feeder or panel, measure closer to the source instead of relying only on the main meter.",
      "Treat persistent excursions as an engineering problem, not just a reporting anomaly.",
    ],
    mistakes: [
      "Reading a dramatic percentage at tiny load and assuming it is automatically a serious site-wide issue.",
      "Treating voltage, harmonics, and imbalance as separate problems when they often have a shared cause.",
      "Ignoring duration and repetition: one weird sample is less important than a stable bad pattern.",
    ],
    inTool: [
      "Read the KPI card, then open the phase view and the main chart to see whether the problem is one phase, all phases, or only certain hours.",
      "If the metric worsens during peaks, the load mix is part of the story. If it is bad all the time, the network itself may be involved.",
      "Use findings as prioritization, but verify critical power-quality issues with site engineering context before acting.",
    ],
  },
  power: {
    drivers: [
      "Reactive loads, poor compensation, light loading conditions, and distorted current waveforms.",
      "Whether the site is importing materially from the grid or exporting because of PV.",
      "Changes in motor loading, capacitor bank behavior, or harmonic conditions.",
    ],
    checks: [
      "Read power factor together with load level and THD rather than as a standalone score.",
      "Confirm whether the bad value appears during meaningful import or only during tiny or negative net load.",
      "Check if the issue is stable or only tied to a specific process state.",
    ],
    actions: [
      "Review compensation tuning, avoid overcompensation, and inspect large inductive loads first.",
      "If harmonics are high, solve waveform quality before assuming capacitor changes alone will fix the issue.",
      "Use operating context: some low-PF moments are real problems, others are measurement artefacts of low-load periods.",
    ],
    mistakes: [
      "Treating every low number equally even when the site is barely importing power.",
      "Trying to fix power factor in isolation while harmonic distortion or PV export is driving the reading.",
      "Assuming a good average means there are no expensive bad windows.",
    ],
    inTool: [
      "Use zoom to see whether low power factor happens in the same windows as spikes or THD events.",
      "If PF is weak while THD is clean, compensation is a stronger candidate. If both are poor, the load mix is probably involved.",
      "Use the card as a screening metric, then inspect the chart to decide if it is operational or mostly cosmetic.",
    ],
  },
  battery: {
    drivers: [
      "How tall the peaks are, how long they last, and how often they repeat in tariff-relevant windows.",
      "The gap between average load and peak demand, which determines whether buffering has leverage.",
      "Whether PV or operational flexibility already removes part of the peak before storage is added.",
    ],
    checks: [
      "Compare recommended battery power and energy together; one without the other is misleading.",
      "Check whether the site has sharp repeatable peaks or just a generally high flat demand profile.",
      "Validate that the billing logic matches the tariff you actually care about, especially the 15-minute window.",
    ],
    actions: [
      "Prioritize no-capex fixes first: sequencing, idle shutdowns, and operational staggering can shrink the battery need.",
      "Use storage when the peak pattern is narrow, repetitive, and expensive relative to energy cost.",
      "Re-check the case after adding PV context because residual load can materially change the storage story.",
    ],
    mistakes: [
      "Reading the recommendation as a guaranteed economic answer instead of a technical starting point.",
      "Ignoring flat base demand and trying to solve an all-day inefficiency with a battery.",
      "Sizing only for the single highest point without considering repeatability and usable dispatch windows.",
    ],
    inTool: [
      "Read battery recommendation after understanding peak demand, spike count, and the hourly profile.",
      "If PV overlay is active, compare residual load before treating the original peak as the final storage target.",
      "Use zoom to confirm whether the peak is a narrow dispatch problem or a long-duration energy problem.",
    ],
  },
  pv: {
    drivers: [
      "Timing overlap between PV production and site load matters more than headline generation alone.",
      "Coverage quality, data gaps, and alignment tolerance affect how much of the PV story is visible.",
      "Storage, export tariff, and shift timing change whether surplus is good, neutral, or a problem.",
    ],
    checks: [
      "Check overlap coverage before trusting any PV-derived KPI too strongly.",
      "Read generation, self-consumption, surplus, and residual load together because each one explains the others.",
      "Look for whether mismatch happens every day or only under certain operating or weather patterns.",
    ],
    actions: [
      "Shift flexible loads into solar windows before investing in more PV or storage.",
      "Use storage when self-consumption is low but there is valuable later demand to capture.",
      "If coverage is weak or data quality is poor, improve the PV feed before making economic decisions from it.",
    ],
    mistakes: [
      "Optimizing for maximum PV generation while ignoring whether the site can actually use it.",
      "Treating analytical overlap numbers as billing-grade settlement values without verifying metering boundaries.",
      "Assuming negative residual load is bad when it may simply reflect intentional export.",
    ],
    inTool: [
      "Use the overlay in the main chart to see whether PV trims the same hours that drive cost or only creates midday surplus.",
      "Read PV KPIs only after the alignment review step confirms overlap and data quality.",
      "Residual load is the fastest way to understand whether solar actually changes grid dependency in useful hours.",
    ],
  },
};

const TERM_PLAYBOOK_OVERRIDES: Partial<Record<GlossaryTerm["slug"], Partial<TermPlaybook>>> = {
  "peak-demand": {
    drivers: [
      "Large equipment starts, simultaneous process ramps, and short operational overlaps that happen in the same billing window.",
      "Temporary events can dominate the bill even when the rest of the day looks calm.",
      "The sampled peak may be operationally real or partially smoothed depending on the interval length.",
    ],
    actions: [
      "Separate startup events where possible and avoid stacking multiple heavy loads into the same short interval.",
      "Check whether the highest peak is operationally necessary or just a scheduling habit.",
      "If the peak is narrow and repeatable, storage or controlled ramping usually has the strongest leverage.",
    ],
  },
  "base-load": {
    actions: [
      "Audit night and weekend load first because that is where base-load waste is easiest to expose.",
      "Prioritize HVAC schedules, standby equipment, pumps, and compressed-air support loads.",
      "Base-load work compounds every hour of the year, so even small reductions are durable savings.",
    ],
  },
  "power-factor": {
    checks: [
      "Confirm whether the weak value occurs during real import load; low-load PF can be noisy and less actionable.",
      "Compare PF windows with THD and PV behavior before changing compensation settings.",
      "If PF collapses only during one process step, the culprit is usually local and identifiable.",
    ],
  },
  "thd-current": {
    actions: [
      "Start with drives, UPS systems, chargers, and dense electronics panels rather than treating the whole site equally.",
      "Check whether the distortion coincides with rising neutral current or voltage THD, because that changes urgency.",
      "If the issue is limited to one branch, solve it near the source instead of applying broad site-level fixes.",
    ],
  },
  "phase-imbalance": {
    actions: [
      "Map single-phase circuits to phases and rebalance the biggest recurring contributors first.",
      "If imbalance shows up only during certain shifts, the issue is usually operational rather than structural.",
      "Treat motor-heavy assets with extra caution because small voltage imbalance can create much larger current stress.",
    ],
  },
  "sample-interval": {
    mistakes: [
      "Comparing datasets with very different intervals as if they had the same diagnostic quality.",
      "Assuming missing spikes mean the site is calm when the interval may simply be averaging them away.",
      "Trusting a storage or spike conclusion without checking whether the underlying resolution was sufficient.",
    ],
  },
  "battery-peak-shaving": {
    checks: [
      "Ask whether the 15-minute demand charge is actually a material economic driver for the site.",
      "Validate whether the biggest peaks are repeatable enough to justify dispatch logic and cycling.",
      "Check residual load if PV is present, because solar may already reduce the battery power requirement materially.",
    ],
  },
  "pv-generation": {
    mistakes: [
      "Equating high production with high value without looking at overlap, export, and site demand timing.",
      "Assuming the PV number covers the full monitoring period when overlap coverage may be partial.",
      "Ignoring clipped, normalized, or aligned data notes during the upload review step.",
    ],
  },
  "residual-load": {
    checks: [
      "Look for whether residual load drops in the hours that actually matter for tariff exposure or generator sizing.",
      "Separate helpful daytime shaving from deep negative export windows; they are different operational outcomes.",
      "If residual load barely changes, the PV timing story matters more than the PV size story.",
    ],
  },
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
  const playbook = useMemo(() => (term ? getPlaybook(term) : null), [term]);
  const interpretationRows = useMemo(() => (term ? buildInterpretationRows(term) : []), [term]);

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

  if (!playbook) return null;

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
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  What is {term.title}?
                </h2>
                <p className="mt-3 text-sm leading-7">{term.definition}</p>
              </div>
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Why {term.title} matters
                </h2>
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
                Interpretation guide
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                How to interpret {term.title.toLowerCase()} quickly.
              </h2>
            </div>
            <div className="max-w-xl text-sm leading-6 text-muted-foreground">
              Read the number in context, not in isolation. The examples below show what healthy,
              borderline, and clearly problematic behavior looks like in practice.
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {interpretationRows.map((row) => (
              <div key={row.label} className={`rounded-xl border p-4 ${STATUS_CLASSES[row.status]}`}>
                <div className="text-[11px] font-semibold uppercase tracking-wider">{row.label}</div>
                <div className="mt-2 text-lg font-semibold tracking-tight">{row.value}</div>
                <p className="mt-2 text-sm leading-6 text-current/85">{row.body}</p>
              </div>
            ))}
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

        <section className="grid gap-6 xl:grid-cols-3">
          <ContentListCard
            title="What usually drives this metric"
            body={`These are the main conditions that tend to move ${term.title.toLowerCase()} up or down.`}
            items={playbook.drivers}
          />
          <ContentListCard
            title="What to check next"
            body="Use these checks before jumping to a conclusion or a fix."
            items={playbook.checks}
          />
          <ContentListCard
            title="What usually improves it"
            body={`These are the highest-leverage actions when ${term.title.toLowerCase()} is genuinely weak.`}
            items={playbook.actions}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <ContentListCard
            title="How to use this metric inside Power Analytics"
            body="This is the shortest route from the glossary page back to the actual workflow in the tool."
            items={playbook.inTool}
          />
          <ContentListCard
            title="Common interpretation mistakes"
            body="These are the errors that most often make a metric look more certain than it really is."
            items={playbook.mistakes}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-card-border bg-card p-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              FAQ
            </h2>
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
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Related terms
            </h2>
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

function ContentListCard({
  title,
  body,
  items,
}: {
  title: string;
  body: string;
  items: string[];
}) {
  return (
    <section className="rounded-2xl border border-card-border bg-card p-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="rounded-xl border border-border bg-background/70 px-4 py-3 text-sm leading-6">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
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
        "@type": "Article",
        headline: `${term.title} explained`,
        description: term.summary,
        articleSection: GLOSSARY_CATEGORY_LABELS[term.category],
        about: term.title,
      },
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

function getPlaybook(term: GlossaryTerm): TermPlaybook {
  const base = CATEGORY_PLAYBOOKS[term.category];
  const override = TERM_PLAYBOOK_OVERRIDES[term.slug] ?? {};

  return {
    drivers: override.drivers ?? base.drivers,
    checks: override.checks ?? base.checks,
    actions: override.actions ?? base.actions,
    mistakes: override.mistakes ?? base.mistakes,
    inTool: override.inTool ?? base.inTool,
  };
}

function buildInterpretationRows(term: GlossaryTerm) {
  const [good, watch, bad] = term.examples;

  return [
    {
      label: "Healthy signal",
      status: good.status,
      value: good.value,
      body: `${good.explanation} This is the kind of reading that matches the plain-language definition of the metric without creating obvious operational tension.`,
    },
    {
      label: "Borderline signal",
      status: watch.status,
      value: watch.value,
      body: `${watch.explanation} This is the zone where the metric becomes useful as an investigation cue, even if it does not yet prove a problem on its own.`,
    },
    {
      label: "Clearly weak signal",
      status: bad.status,
      value: bad.value,
      body: `${bad.explanation} When the dashboard looks like this repeatedly, the metric is no longer just descriptive. It is pointing toward a real technical or economic issue.`,
    },
  ] as const;
}
