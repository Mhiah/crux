import type { ResearchProject } from "../types";

/** Reppo accepts up to 50 KB of text. Preserve source IDs and citation provenance. */
export function buildReppoPayload(project: ResearchProject) {
  if (project.mode !== "live" || project.status !== "complete" || !project.research || !project.conclusion) {
    throw new Error("Only completed live research may be reviewed.");
  }
  const sources = project.research.sources.slice(0, 20).map((s) => ({
    id: s.id, title: s.title.slice(0, 160), url: s.url, kind: s.kind, flags: s.flags,
  }));
  let claims = project.research.claims.map((c) => ({
    id: c.id, text: c.text.slice(0, 500), stance: c.stance,
    source_ids: c.source_ids, unmatched_numbers: c.unmatched_numbers,
    quotes: c.quotes.slice(0, 3).map((q) => ({ source_id: q.source_id, text: q.text.slice(0, 350) })),
  }));
  const shared = {
    question: project.question,
    sources,
    thesis: project.thesis,
    stress_test: project.stress_test,
    reevaluation: project.reevaluation,
    conclusion: project.conclusion,
    fact_check: project.research.fact_check,
    reasoning_audit: project.audit.map((a) => ({ stage: a.stage, input_refs: a.input_refs, warnings: a.warnings })),
  };
  let payload = JSON.stringify({ ...shared, claims });
  while (new TextEncoder().encode(payload).length > 48_000 && claims.length > 0) {
    claims = claims.slice(0, Math.floor(claims.length / 2));
    payload = JSON.stringify({ ...shared, claims, note: "Claims truncated to meet the size limit." });
  }
  if (new TextEncoder().encode(payload).length > 48_000) {
    throw new Error("Research trace exceeds the Reppo payload limit.");
  }
  return {
    type: "trace" as const,
    payload,
    context: "Crux is an evidence-linked market-research system using SERV Reasoning. Independently assess whether its conclusion follows from the cited evidence, whether opposing evidence is weighed fairly, whether the assumptions and confidence are justified, and whether gaps are disclosed. Source quotes have been matched to excerpts, but that is not independent factual verification.",
    settlementMinutes: 10 as const,
  };
}
