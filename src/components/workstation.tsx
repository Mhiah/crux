"use client";

import { useState, type ReactNode } from "react";
import { Linked, Ref, RefList, RefsProvider } from "./refs";
import type { AssumptionVerdict, Challenge, Claim, Confidence, ResearchProject, Stage } from "@/lib/types";

/**
 * The research workstation: the answer first, then how it was reached (what changed,
 * the stress test, the initial thesis) and the evidence underneath. Renders a project
 * while it streams in and after it's saved.
 */

export const STAGES: { key: Stage; label: string }[] = [
  { key: "research", label: "Research" },
  { key: "thesis", label: "Thesis" },
  { key: "stress_test", label: "Stress test" },
  { key: "reevaluation", label: "Re-evaluate" },
  { key: "conclusion", label: "Conclusion" },
  { key: "what_changed", label: "What changed" },
];

type Tone = "good" | "warn" | "bad" | "neutral" | "info";

const TONE: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-surface text-muted",
};

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[tone]}`}>{children}</span>;
}

const VERDICT_TONE: Record<AssumptionVerdict, Tone> = { supported: "good", weakened: "warn", contradicted: "bad", unresolved: "neutral" };
const THESIS_TONE = { strengthened: "good", survived: "good", weakened: "warn", overturned: "bad" } as const;
const SEVERITY_TONE: Record<Challenge["severity"], Tone> = { minor: "neutral", major: "warn", critical: "bad" };
const STANCE_TONE: Record<Claim["stance"], Tone> = { supports: "good", challenges: "bad", neutral: "neutral" };
const CONFIDENCE_TONE: Record<Confidence, Tone> = { high: "good", medium: "warn", low: "bad" };
const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 };

const human = (s: string) => s.replace(/_/g, " ");

function ConfidenceBadge({ level }: { level: Confidence }) {
  return <Badge tone={CONFIDENCE_TONE[level]}>{level} confidence</Badge>;
}

function Section({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-line pt-8">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside && <div className="text-sm text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line p-4 ${className}`}>{children}</div>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, i) => (
        <li key={i}>
          <Linked text={item} />
        </li>
      ))}
    </ul>
  );
}

export function Progress({ project, active }: { project: ResearchProject | null; active: Stage | null }) {
  const done = new Set(project?.audit.map((a) => a.stage));
  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label="Pipeline progress">
      {STAGES.map((s, i) => {
        const state = done.has(s.key) ? "done" : active === s.key ? "active" : "waiting";
        return (
          <li
            key={s.key}
            aria-current={state === "active" ? "step" : undefined}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${
              state === "done" ? "border-good/40 text-good" : state === "active" ? "animate-pulse border-foreground/40" : "border-line text-muted"
            }`}
          >
            <span className="font-mono text-xs">{state === "done" ? "✓" : i + 1}</span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

/** `downloadable` is off while a run is still streaming, so nobody saves half a report. */
export function Workstation({ project, downloadable = true }: { project: ResearchProject; downloadable?: boolean }) {
  return (
    <RefsProvider project={project}>
      <div className="space-y-10">
        <PrintHeader project={project} />
        {downloadable && <Downloads project={project} />}
        <Answer project={project} />
        <WhatChanged project={project} />
        <StressTest project={project} />
        <Thesis project={project} />
        <Evidence project={project} />
        <Audit project={project} />
      </div>
    </RefsProvider>
  );
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "research";

/** Nothing is stored for anyone: the report leaves the page as a PDF or a JSON file. */
function Downloads({ project }: { project: ResearchProject }) {
  const filename = `crux-${slug(project.question)}-${project.created_at.slice(0, 10)}`;

  function downloadPdf() {
    // Browsers name the saved PDF after the page title.
    const title = document.title;
    document.title = filename;
    window.addEventListener("afterprint", () => (document.title = title), { once: true });
    window.print();
  }

  function downloadJson() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${filename}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const button = "rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface";
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={downloadPdf} className={button}>
        Download PDF
      </button>
      <button type="button" onClick={downloadJson} className={button}>
        Raw data (JSON)
      </button>
      <span className="text-xs text-muted">PDF: choose &ldquo;Save as PDF&rdquo; in the print dialog.</span>
    </div>
  );
}

/** Only in the PDF: what was asked, when, and whether it was a mock run. */
function PrintHeader({ project }: { project: ResearchProject }) {
  return (
    <header className="hidden print:block">
      <p className="text-sm font-semibold">Crux research report</p>
      <h1 className="mt-1 text-2xl font-semibold leading-snug">{project.question}</h1>
      <p className="mt-1 text-sm text-muted">
        {new Date(project.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
        {project.mode === "mock" && " · mock run: illustrative fixtures, not real research"}
      </p>
    </header>
  );
}

function Answer({ project }: { project: ResearchProject }) {
  const c = project.conclusion;
  if (!c) return null;
  const verdict = project.reevaluation?.thesis_verdict;
  return (
    <section id="answer" className="space-y-4">
      <Card className="bg-surface">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Answer</h2>
          <ConfidenceBadge level={c.confidence} />
          {verdict && <Badge tone={THESIS_TONE[verdict]}>thesis {verdict} by stress test</Badge>}
        </div>
        <p className="mt-3 text-lg leading-relaxed">
          <Linked text={c.final_statement} />
        </p>
        <p className="mt-3 text-sm text-muted">
          <Linked text={c.confidence_rationale} />
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <RefList label="Key support" ids={c.key_supporting_claim_ids} />
          <RefList label="Key counter-evidence" ids={c.key_challenging_claim_ids} />
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold">Next steps to validate</h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
            {c.next_validation_steps.map((s, i) => (
              <li key={i}>
                <Linked text={s.step} />
                <p className="text-muted">
                  Resolves: <Linked text={s.resolves} />
                </p>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold">Still uncertain</h3>
          <Bullets items={c.uncertainties} />
        </Card>
      </div>
    </section>
  );
}

function WhatChanged({ project }: { project: ResearchProject }) {
  const wc = project.what_changed;
  if (!wc) return null;
  const critical = wc.challenged.filter((c) => c.severity === "critical").length;
  return (
    <Section
      id="what-changed"
      title="What changed?"
      aside={`${wc.challenged.length} challenges${critical ? `, ${critical} critical` : ""} · thesis ${wc.verdict}`}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-muted">Initial thesis</h3>
            <ConfidenceBadge level={wc.initial.confidence} />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            <Linked text={wc.initial.statement} />
          </p>
        </Card>
        <Card className="border-foreground/25">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">After stress test</h3>
            <ConfidenceBadge level={wc.final.confidence} />
          </div>
          <p className="mt-2 text-sm leading-relaxed">
            <Linked text={wc.final.statement} />
          </p>
        </Card>
      </div>

      <h3 className="mt-6 text-sm font-semibold">Assumptions, re-judged</h3>
      <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
        {wc.assumptions.map((a) => (
          <li key={a.assumption_id}>
            <Expandable
              summary={
                <span className="flex items-start gap-2">
                  <Ref id={a.assumption_id} />
                  <span className="flex-1">{a.text}</span>
                  <Badge tone={VERDICT_TONE[a.verdict]}>{a.verdict}</Badge>
                </span>
              }
            >
              <p className="text-sm">
                <Linked text={a.reasoning} />
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <RefList label="Claims" ids={a.claim_ids} />
                <RefList label="Challenges" ids={a.challenge_ids} />
              </div>
            </Expandable>
          </li>
        ))}
      </ul>

      {wc.changes.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold">How the thesis moved</h3>
          <ul className="mt-2 space-y-3">
            {wc.changes.map((ch, i) => (
              <li key={i}>
                <Card>
                  <p className="text-sm text-muted line-through decoration-muted/50">
                    <Linked text={ch.from} />
                  </p>
                  <p className="mt-1 text-sm">
                    → <Linked text={ch.to} />
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    <Linked text={ch.reason} />
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                    <RefList label="Because of" ids={[...ch.challenge_ids, ...ch.claim_ids]} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {wc.unresolved.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 text-sm font-semibold">The evidence can&apos;t settle</h3>
          <Bullets items={wc.unresolved} />
        </>
      )}
    </Section>
  );
}

function Expandable({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-3">
      {/* A div, not a button: the summary contains ref chips, which are buttons themselves. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={(e) => (e.target as HTMLElement).closest("button") || setOpen(!open)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), setOpen(!open))}
        className="flex cursor-pointer items-start gap-2 text-sm"
      >
        <span className="mt-0.5 w-3 shrink-0 text-muted print:hidden">{open ? "▾" : "▸"}</span>
        <span className="flex-1">{summary}</span>
      </div>
      <div className={`mt-2 pl-5 ${open ? "" : "hidden print:block"}`}>{children}</div>
    </div>
  );
}

function StressTest({ project }: { project: ResearchProject }) {
  const st = project.stress_test;
  if (!st) return null;
  const challenges = [...st.challenges].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return (
    <Section id="stress-test" title="Stress test" aside="A skeptical investor's attack on the initial thesis">
      <ul className="space-y-3">
        {challenges.map((x) => (
          <li key={x.id}>
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Ref id={x.id} />
                <Badge tone={SEVERITY_TONE[x.severity]}>{x.severity}</Badge>
                <span className="text-xs text-muted">{human(x.kind)}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                <Linked text={x.text} />
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <RefList label="Attacks" ids={x.target_assumption_ids} />
                <RefList label="Evidence" ids={x.claim_ids} />
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {st.failure_conditions.length > 0 && (
          <Card>
            <h3 className="mb-2 text-sm font-semibold">The thesis fails if…</h3>
            <Bullets items={st.failure_conditions} />
          </Card>
        )}
        {st.missing_evidence.length > 0 && (
          <Card>
            <h3 className="mb-2 text-sm font-semibold">Missing evidence</h3>
            <ul className="space-y-2 text-sm">
              {st.missing_evidence.map((m, i) => (
                <li key={i}>
                  <Linked text={m.question} />
                  <p className="text-muted">
                    <Linked text={m.why_it_matters} />
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Section>
  );
}

function Thesis({ project }: { project: ResearchProject }) {
  const t = project.thesis;
  if (!t) return null;
  return (
    <Section id="thesis" title="Initial thesis" aside={<ConfidenceBadge level={t.confidence} />}>
      <p className="leading-relaxed">
        <Linked text={t.statement} />
      </p>
      <p className="mt-2 text-sm text-muted">
        <Linked text={t.confidence_rationale} />
      </p>
      <RefList label="Supported by" ids={t.supporting_claim_ids} />

      <h3 className="mt-6 text-sm font-semibold">Load-bearing assumptions</h3>
      <ul className="mt-2 space-y-2">
        {t.assumptions.map((a) => (
          <li key={a.id} className="flex items-start gap-2 text-sm">
            <Ref id={a.id} />
            <span className="flex-1">
              {a.text} {a.supporting_claim_ids.length === 0 && <span className="text-warn">(no supporting evidence)</span>}
              <span className="ml-1">
                <RefList ids={a.supporting_claim_ids} />
              </span>
            </span>
          </li>
        ))}
      </ul>

      {t.uncertainties.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 text-sm font-semibold">Uncertainties it admitted up front</h3>
          <Bullets items={t.uncertainties} />
        </>
      )}
    </Section>
  );
}

const STANCES = ["all", "supports", "challenges", "neutral"] as const;

function Evidence({ project }: { project: ResearchProject }) {
  const r = project.research;
  const [stance, setStance] = useState<(typeof STANCES)[number]>("all");
  if (!r) return null;
  const count = (s: (typeof STANCES)[number]) => (s === "all" ? r.claims.length : r.claims.filter((c) => c.stance === s).length);

  return (
    <Section id="evidence" title="Evidence" aside={`${r.claims.length} claims from ${r.sources.length} sources`}>
      {r.fact_check && <FactCheckSummary check={r.fact_check} />}
      <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Filter claims by stance">
        {STANCES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={stance === s}
            onClick={() => setStance(s)}
            className={`rounded-full border px-3 py-1 text-sm ${stance === s ? "border-foreground bg-foreground text-background" : "border-line text-muted hover:text-foreground"}`}
          >
            {s === "all" ? "All" : s === "supports" ? "For" : s === "challenges" ? "Against" : "Neutral"} · {count(s)}
          </button>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
        {r.claims.map((c) => (
          <li key={c.id} className={`items-start gap-2 p-3 text-sm ${stance === "all" || c.stance === stance ? "flex" : "hidden print:flex"}`}>
            <Ref id={c.id} />
            <div className="flex-1">
              <p>{c.text}</p>
              {c.quotes?.map((q, i) => (
                <blockquote key={i} className="mt-1.5 border-l-2 border-line pl-2 text-muted">
                  &ldquo;{q.text}&rdquo; <Ref id={q.source_id} />
                </blockquote>
              ))}
              <p className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge tone={STANCE_TONE[c.stance]}>{c.stance === "supports" ? "for" : c.stance === "challenges" ? "against" : "neutral"}</Badge>
                <span className="text-xs text-muted">{human(c.category)}</span>
                {c.unmatched_numbers?.length > 0 && (
                  <Badge tone="warn">figures not in source: {c.unmatched_numbers.join(", ")}</Badge>
                )}
                {/* Projects saved before fact checking have no quotes; show their sources instead. */}
                {!c.quotes && <RefList ids={c.source_ids} />}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-sm font-semibold">Sources</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {r.sources.map((s) => (
          <li key={s.id} className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
            <Ref id={s.id} />
            <div className="min-w-0 flex-1">
              <a href={s.url} target="_blank" rel="noreferrer" className="line-clamp-2 hover:underline">
                {s.title}
              </a>
              <p className="mt-0.5 truncate text-xs text-muted">
                {[s.publisher, s.published_date].filter(Boolean).join(" · ")}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <details className="mt-4 text-sm print:hidden">
        <summary className="cursor-pointer text-muted">Search queries ({r.queries.length})</summary>
        <ul className="mt-2 list-disc pl-5 text-muted">
          {r.queries.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </details>
    </Section>
  );
}

function FactCheckSummary({ check }: { check: NonNullable<ResearchProject["research"]>["fact_check"] }) {
  const { extracted, dropped, flagged } = check;
  return (
    <p className="mb-4 rounded-lg bg-surface px-3 py-2 text-sm">
      <span className="font-medium">Fact-checked.</span>{" "}
      <span className="text-muted">
        Each claim below is matched to the exact words in its source.{" "}
        {dropped > 0
          ? `${dropped} of ${extracted} extracted claims were dropped because their quotes weren't in the source.`
          : `All ${extracted} extracted claims passed.`}
        {flagged > 0 && ` ${flagged} ${flagged === 1 ? "is" : "are"} flagged for figures their quote doesn't contain.`}
      </span>
    </p>
  );
}

function Audit({ project }: { project: ResearchProject }) {
  if (project.audit.length === 0) return null;
  const warnings = project.audit.reduce((n, a) => n + a.warnings.length, 0);
  return (
    <Section id="audit" title="Reasoning log" aside={warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "No warnings"}>
      <ul className="divide-y divide-line rounded-lg border border-line text-sm">
        {project.audit.map((a) => (
          <li key={a.stage} className="p-3">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{STAGES.find((s) => s.key === a.stage)?.label}</span>
                <span className="text-xs text-muted">
                  {(a.duration_ms / 1000).toFixed(1)}s{a.model ? ` · ${a.model}` : " · assembled, no model call"}
                </span>
                {a.warnings.length > 0 && <Badge tone="warn">{a.warnings.length} warning{a.warnings.length === 1 ? "" : "s"}</Badge>}
              </summary>
              {a.warnings.map((w) => (
                <p key={w} className="mt-2 text-warn">
                  {w}
                </p>
              ))}
              <pre className="mt-2 max-h-96 overflow-auto rounded bg-surface p-2 text-xs print:hidden">{JSON.stringify(a.output, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
    </Section>
  );
}
