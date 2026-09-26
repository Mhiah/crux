"use client";

import Link from "next/link";
import { useState } from "react";
import { Progress, STAGES, Workstation } from "@/components/workstation";
import type { PipelineEvent, ResearchProject, Stage } from "@/lib/types";

/** Tapping one fills the box; nothing runs (and no credits are spent) until you press the button. */
const EXAMPLES = [
  "Should we launch a stablecoin remittance app for the UK–Nigeria corridor?",
  "Are small businesses actually willing to accept crypto payments?",
  "Should we launch an AI bookkeeping SaaS for Nigerian SMEs?",
  "Should a Web3 startup issue its own token before product-market fit?",
];

/** Ask a question and watch the report fill in stage by stage as the pipeline streams. */
export default function Home() {
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<Stage | null>(null);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [mode, setMode] = useState<"live" | "mock" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handle(event: PipelineEvent) {
    if (event.type === "project") setMode(event.project.mode);
    if (event.type === "stage_started") setActive(event.stage);
    if (event.type === "stage_completed") setProject(event.project);
    if (event.type === "error") setError(`${STAGES.find((s) => s.key === event.stage)?.label ?? "The pipeline"} failed: ${event.message}`);
    if (event.type === "done") {
      setProject(event.project);
      setActive(null);
    }
  }

  async function run() {
    setRunning(true);
    setProject(null);
    setError(null);
    setMode(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok || !res.body) {
        setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Request failed (${res.status}).`);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handle(JSON.parse(line) as PipelineEvent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setActive(null);
    }
  }

  const activeLabel = STAGES.find((s) => s.key === active)?.label;
  const tooShort = question.trim().length < 10;

  function newQuestion() {
    setProject(null);
    setError(null);
    setMode(null);
  }

  const header = (
    <header className="mx-auto flex w-full max-w-5xl items-center px-5 py-5 print:hidden">
      <button type="button" onClick={newQuestion} disabled={running} className="text-xl font-semibold tracking-tight">
        Crux
      </button>
      {project && !running && (
        <button type="button" onClick={newQuestion} className="ml-auto rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface">
          New question
        </button>
      )}
    </header>
  );

  // Landing: the name, what Crux does, and the question box.
  if (!running && !project) {
    return (
      <>
        {header}
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pt-10 pb-24 sm:pt-16">
          <h1 className="text-center text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-6xl">
            Stress-test your next big decision.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-center text-lg text-muted text-balance">
            Crux researches your question, forms a thesis, attacks it with SERV Reasoning, and shows you exactly what changed and why.
          </p>

          <form
            className="mt-10 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-2 shadow-sm sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!tooShort) run();
            }}
          >
            <input
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base focus:outline-none"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a hard business question…"
              aria-label="Your question"
              maxLength={500}
            />
            <button className="rounded-xl bg-foreground px-5 py-3 font-medium text-background transition disabled:opacity-40" disabled={tooShort}>
              Find the crux
            </button>
          </form>

          {error && <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

          <div className="mt-8">
            <p className="text-center text-xs font-medium uppercase tracking-wider text-muted">Try one</p>
            <ul className="mt-3 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => setQuestion(q)}
                    className="rounded-full border border-line px-3.5 py-2 text-left text-sm text-muted transition hover:border-foreground/30 hover:text-foreground"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main className="mx-auto w-full max-w-4xl px-5 pb-16">
        <h1 className="text-2xl font-semibold leading-snug tracking-tight print:hidden">{question}</h1>

        {mode === "mock" && (
          <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn print:hidden">
            Mock mode: illustrative fixtures, not real research. No SERV or Tavily calls are made.
          </p>
        )}

        <div className="mt-6 space-y-2 print:hidden">
          <Progress project={project} active={active} />
          {running && activeLabel && <p className="text-sm text-muted">Working on {activeLabel.toLowerCase()}…</p>}
        </div>

        {error && <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

        {project && !running && project.status === "complete" && (
          <p className="mt-4 text-sm print:hidden">
            <Link href={`/research/${project.id}`} className="text-info underline underline-offset-2">
              Saved report
            </Link>{" "}
            <span className="text-muted">— reopen or share this run later.</span>
          </p>
        )}

        {project && (
          <div className="mt-8">
            <Workstation project={project} downloadable={!running} />
          </div>
        )}
      </main>
    </>
  );
}
