"use client";

import { useState } from "react";
import type { PipelineEvent, ResearchProject, Stage } from "@/lib/types";

/**
 * Phase 1 harness: runs the pipeline and shows each stage's raw output as it streams.
 * The research workstation (evidence, thesis, stress test panels, What Changed, audit
 * trail) replaces this in Phase 3.
 */

const STAGES: { key: Stage; label: string }[] = [
  { key: "research", label: "Research" },
  { key: "thesis", label: "Thesis" },
  { key: "stress_test", label: "Stress Test" },
  { key: "reevaluation", label: "Re-evaluate" },
  { key: "conclusion", label: "Conclusion" },
  { key: "what_changed", label: "What Changed?" },
];

const EXAMPLE = "Should we launch an AI bookkeeping SaaS for Nigerian SMEs?";

export default function Home() {
  const [question, setQuestion] = useState(EXAMPLE);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<Stage | null>(null);
  const [project, setProject] = useState<ResearchProject | null>(null);
  const [mode, setMode] = useState<"live" | "mock" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handle(event: PipelineEvent) {
    if (event.type === "project") setMode(event.project.mode);
    if (event.type === "stage_started") setActive(event.stage);
    if (event.type === "stage_completed") setProject(event.project);
    if (event.type === "error") setError(`${event.stage ?? "Pipeline"} failed: ${event.message}`);
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

  const completed = new Set(project?.audit.map((a) => a.stage));

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Crux</h1>
      <p className="mt-1 text-sm opacity-70">Forms a thesis, stress-tests it with SERV Reasoning, and shows what changed.</p>

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!running) run();
        }}
      >
        <input
          className="flex-1 rounded border border-current/20 bg-transparent px-3 py-2"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a hard market or strategy question"
        />
        <button className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50" disabled={running}>
          {running ? "Researching…" : "Research"}
        </button>
      </form>

      {mode === "mock" && (
        <p className="mt-3 text-sm text-amber-600">Mock mode: illustrative fixtures, not real research. Set SERV_API_KEY and TAVILY_API_KEY for live runs.</p>
      )}

      <ol className="mt-6 flex flex-wrap gap-2 text-sm">
        {STAGES.map((s) => (
          <li
            key={s.key}
            className={`rounded-full border px-3 py-1 ${
              completed.has(s.key) ? "border-green-600 text-green-600" : active === s.key ? "animate-pulse border-current" : "border-current/20 opacity-50"
            }`}
          >
            {s.label}
          </li>
        ))}
      </ol>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {project?.audit.map((a) => (
        <details key={a.stage} className="mt-4 rounded border border-current/20 p-3" open={a.stage === "what_changed"}>
          <summary className="cursor-pointer font-medium">
            {STAGES.find((s) => s.key === a.stage)?.label}{" "}
            <span className="text-sm font-normal opacity-60">
              {(a.duration_ms / 1000).toFixed(1)}s{a.model ? ` · ${a.model}` : ""}
              {a.warnings.length ? ` · ${a.warnings.length} warning(s)` : ""}
            </span>
          </summary>
          {a.warnings.map((w) => (
            <p key={w} className="mt-2 text-sm text-amber-600">{w}</p>
          ))}
          <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(a.output, null, 2)}</pre>
        </details>
      ))}
    </main>
  );
}
