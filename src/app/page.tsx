"use client";

import Link from "next/link";
import { useState } from "react";
import { Progress, STAGES, Workstation } from "@/components/workstation";
import type { PipelineEvent, ResearchProject, Stage } from "@/lib/types";

const EXAMPLE = "Should we launch an AI bookkeeping SaaS for Nigerian SMEs?";

/** Ask a question and watch the report fill in stage by stage as the pipeline streams. */
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

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold print:hidden">Crux</h1>
      <p className="mt-1 text-sm text-muted print:hidden">Forms a thesis, stress-tests it with SERV Reasoning, and shows what changed.</p>

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          if (!running) run();
        }}
      >
        <input
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 focus:border-foreground/40 focus:outline-none"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a hard market or strategy question"
          aria-label="Research question"
        />
        <button className="rounded-lg bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50" disabled={running}>
          {running ? "Researching…" : "Research"}
        </button>
      </form>

      {mode === "mock" && (
        <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn print:hidden">
          Mock mode: illustrative fixtures, not real research. No SERV or Tavily calls are made.
        </p>
      )}

      {(running || project) && (
        <div className="mt-6 space-y-2 print:hidden">
          <Progress project={project} active={active} />
          {running && activeLabel && <p className="text-sm text-muted">Working on {activeLabel.toLowerCase()}…</p>}
        </div>
      )}

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
  );
}
