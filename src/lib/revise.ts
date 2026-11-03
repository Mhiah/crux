import { randomUUID } from "node:crypto";
import type { ReasoningProvider } from "./reasoning/provider";
import {
  REVISION_PLAN_SYSTEM,
  REVISION_SYSTEM,
  formatEvidence,
  formatReevaluation,
  formatStressTest,
  formatThesis,
} from "./reasoning/prompts";
import { REVISION_PLAN_SCHEMA, REVISION_SCHEMA } from "./reasoning/schemas";
import { collectResearch } from "./research/collect";
import type { SearchProvider } from "./research/search";
import { sourceRank } from "./research/sources";
import type { Conclusion, CritiqueResponse, Research, ResearchProject, Revision, RevisionMetrics } from "./types";

/**
 * Learning from an independent review: each critique becomes one focused search, the new
 * facts are fact-checked like any others, and SERV revises the conclusion against the old
 * and new evidence, answering every critique. The result is a new report linked to the
 * original, which is never changed. The metrics are counted in code, not by the model.
 */

const MAX_CRITIQUES = 5;
const MAX_NEW_SOURCES = 10;

type Critique = { dimension: string; critique: string };
type RawPlan = { items: { critique_number: number; research_query: string }[] };
type RawRevision = Conclusion & {
  responses: { critique_number: number; status: CritiqueResponse["status"]; response: string; claim_ids: string[] }[];
  changes: Revision["changes"];
};

const num = (id: string) => Number(id.slice(1)) || 0;
const nextNumber = (ids: string[]) => Math.max(0, ...ids.map(num)) + 1;

/** Why a report can't be revised yet, or null when it can. */
export function revisionBlocker(project: ResearchProject): string | null {
  if (project.mode !== "live" || project.status !== "complete" || !project.research || !project.conclusion) {
    return "Only completed live reports can be improved.";
  }
  if (!project.reppo) return "Request an independent review first.";
  if (project.reppo.status !== "settled") return "The independent review hasn't returned its verdict yet.";
  if (!project.reppo.critiques.length) return "The review returned no critiques to act on.";
  return null;
}

function formatCritiques(critiques: Critique[]): string {
  return critiques.map((c, i) => `[R${i + 1}] ${c.dimension}: ${c.critique}`).join("\n");
}

function formatConclusion(c: Conclusion): string {
  return [
    `Statement: ${c.final_statement}`,
    `Confidence: ${c.confidence} (${c.confidence_rationale})`,
    `Uncertainties:\n${c.uncertainties.map((u) => `- ${u}`).join("\n") || "- (none)"}`,
  ].join("\n");
}

export function measure(before: Research, after: Research, beforeConfidence: Conclusion["confidence"], afterConfidence: Conclusion["confidence"], responses: CritiqueResponse[]): RevisionMetrics {
  const against = (r: Research) => r.claims.filter((c) => c.stance === "challenges").length;
  const flagged = (r: Research) => r.claims.filter((c) => c.unmatched_numbers.length > 0).length;
  // Research, official and industry sources that at least one fact rests on.
  const strong = (r: Research) => {
    const used = new Set(r.claims.flatMap((c) => c.source_ids));
    return r.sources.filter((s) => used.has(s.id) && sourceRank(s.kind) === 0).length;
  };
  const count = (status: CritiqueResponse["status"]) => responses.filter((r) => r.status === status).length;
  return {
    facts: { before: before.claims.length, after: after.claims.length },
    facts_against: { before: against(before), after: against(after) },
    flagged_figures: { before: flagged(before), after: flagged(after) },
    strong_sources: { before: strong(before), after: strong(after) },
    confidence: { before: beforeConfidence, after: afterConfidence },
    critiques: { total: responses.length, addressed: count("addressed"), partly: count("partly_addressed"), not_addressed: count("not_addressed") },
  };
}

export async function reviseWithFeedback(
  original: ResearchProject,
  deps: { reasoning: ReasoningProvider; search: SearchProvider },
): Promise<ResearchProject> {
  const blocker = revisionBlocker(original);
  if (blocker) throw new Error(blocker);
  const research = original.research!;
  const conclusion = original.conclusion!;
  const review = original.reppo!;
  const critiques: Critique[] = review.critiques.slice(0, MAX_CRITIQUES).map((c) => ({ dimension: c.dimension, critique: c.critique }));
  const warnings: string[] = [];
  const { question } = original;

  // 1. One focused search per critique.
  const plan = await deps.reasoning.reason<RawPlan>({
    step: "revision_plan",
    system: REVISION_PLAN_SYSTEM,
    user: `Research question: ${question}\n\nReport conclusion:\n${formatConclusion(conclusion)}\n\nReviewer's critiques:\n${formatCritiques(critiques)}`,
    schema: REVISION_PLAN_SCHEMA,
  });
  const queryFor = critiques.map((_, i) => plan.output.items.find((it) => it.critique_number === i + 1)?.research_query?.trim() ?? "");
  critiques.forEach((c, i) => {
    if (!queryFor[i]) warnings.push(`No follow-up search was planned for critique R${i + 1} (${c.dimension}).`);
  });

  // 2. Run them, keeping only sources the report doesn't already use; fact-check the new facts.
  const found = await collectResearch(question, deps.reasoning, deps.search, {
    queries: queryFor.filter(Boolean),
    excludeUrls: new Set(research.sources.map((s) => s.url)),
    firstSourceNumber: nextNumber(research.sources.map((s) => s.id)),
    firstClaimNumber: nextNumber(research.claims.map((c) => c.id)),
    maxSources: MAX_NEW_SOURCES,
    focus: `This is follow-up research on an independent review's critiques of an existing report:\n${formatCritiques(critiques)}\nExtract the facts that bear on these critiques.`,
    allowEmpty: true,
  });
  warnings.push(...found.warnings);
  const merged: Research = {
    queries: [...research.queries, ...found.research.queries],
    sources: [...research.sources, ...found.research.sources],
    claims: [...research.claims, ...found.research.claims],
    fact_check: {
      extracted: research.fact_check.extracted + found.research.fact_check.extracted,
      dropped: research.fact_check.dropped + found.research.fact_check.dropped,
      merged: (research.fact_check.merged ?? 0) + (found.research.fact_check.merged ?? 0),
      flagged: research.fact_check.flagged + found.research.fact_check.flagged,
    },
  };

  // 3. Revise the conclusion against all the evidence, answering every critique.
  const revised = await deps.reasoning.reason<RawRevision>({
    step: "revision",
    system: REVISION_SYSTEM,
    user: [
      formatEvidence(question, merged),
      `New facts from the follow-up searches: ${found.research.claims.map((c) => c.id).join(", ") || "none"}`,
      `Original thesis:\n${formatThesis(original.thesis!)}`,
      `Stress test:\n${formatStressTest(original.stress_test!)}`,
      `Re-evaluation:\n${formatReevaluation(original.reevaluation!)}`,
      `Original conclusion:\n${formatConclusion(conclusion)}`,
      `Independent reviewer's critiques:\n${formatCritiques(critiques)}`,
    ].join("\n\n"),
    schema: REVISION_SCHEMA,
  });
  const out = revised.output;
  const claimIds = new Set(merged.claims.map((c) => c.id));
  const known = (ids: string[], where: string) => {
    const unknown = ids.filter((id) => !claimIds.has(id));
    if (unknown.length) warnings.push(`${where} cited unknown ${unknown.join(", ")}; removed.`);
    return [...new Set(ids.filter((id) => claimIds.has(id)))];
  };

  // Exactly one response per critique, in order; a missing one is recorded as not addressed.
  const responses: CritiqueResponse[] = critiques.map((c, i) => {
    const r = out.responses.find((x) => x.critique_number === i + 1);
    if (!r) warnings.push(`The revision did not answer critique R${i + 1}; marked not addressed.`);
    return {
      dimension: c.dimension,
      critique: c.critique,
      research_query: queryFor[i],
      status: r?.status ?? "not_addressed",
      response: r?.response ?? "Not answered by the revision.",
      claim_ids: r ? known(r.claim_ids, `Response to R${i + 1}`) : [],
    };
  });

  const newConclusion: Conclusion = {
    final_statement: out.final_statement,
    confidence: out.confidence,
    confidence_rationale: out.confidence_rationale,
    key_supporting_claim_ids: known(out.key_supporting_claim_ids, "Revised conclusion"),
    key_challenging_claim_ids: known(out.key_challenging_claim_ids, "Revised conclusion"),
    uncertainties: out.uncertainties,
    next_validation_steps: out.next_validation_steps,
  };

  const revision: Revision = {
    of: original.id,
    created_at: new Date().toISOString(),
    review: { eval_id: review.eval_id, decision: review.decision, score: review.score },
    responses,
    changes: out.changes.map((c, i) => ({ ...c, claim_ids: known(c.claim_ids, `Change ${i + 1}`) })),
    new_claim_ids: found.research.claims.map((c) => c.id),
    new_source_ids: found.research.sources.map((s) => s.id),
    metrics: measure(research, merged, conclusion.confidence, newConclusion.confidence, responses),
    original_conclusion: { final_statement: conclusion.final_statement, confidence: conclusion.confidence },
    warnings,
  };

  // The reasoning record (thesis, stress test, re-evaluation, what changed) is the
  // original's; the evidence and the conclusion are revised. The revision's own changes
  // live in `revision`, so they never mix with the stress test's.
  return {
    id: randomUUID(),
    question,
    status: "complete",
    created_at: revision.created_at,
    mode: "live",
    research: merged,
    thesis: original.thesis,
    stress_test: original.stress_test,
    reevaluation: original.reevaluation,
    conclusion: newConclusion,
    what_changed: original.what_changed,
    revision,
    audit: original.audit,
    error: null,
  };
}
