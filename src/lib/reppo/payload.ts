import type { Claim, ResearchProject } from "../types";

/** Keep an evidence-linked sample well under Reppo's published 50 KB text cap. */
const MAX_PAYLOAD_BYTES = 18_000;

/** Reppo's currently deployed gateway requires 1-10 criteria as plain strings.
 * A Reppo-maintained legacy lease fixture confirms the string[] shape.
 * Keep these specific to Crux's evidence-first research, not generic "accuracy" grades.
 */
export const CRUX_REVIEW_CRITERIA = [
  "Do the cited source quotations support the report's key factual claims, without unsupported leaps?",
  "Does the stress test address the strongest counter-evidence, risks, and alternative explanations fairly?",
  "Does the final conclusion logically follow from the evidence, challenges, and re-evaluation?",
  "Is the stated confidence calibrated to evidence quality, missing data, and unresolved uncertainties?",
  "Are the suggested validation steps specific and relevant to the remaining uncertainties?",
] as const;
const bytes = (text: string) => new TextEncoder().encode(text).length;
const cut = (text: string, n: number) => text.slice(0, n);

function balancedSample(claims: Claim[]) {
  return (["supports", "challenges", "neutral"] as const)
    .flatMap((stance) => claims.filter((c) => c.stance === stance).slice(0, 10));
}

export function buildReppoPayload(project: ResearchProject) {
  if (project.mode !== "live" || project.status !== "complete" ||
      !project.research || !project.thesis || !project.stress_test ||
      !project.reevaluation || !project.conclusion) {
    throw new Error("Only completed live reports can be reviewed.");
  }
  const { research, thesis, stress_test, reevaluation, conclusion } = project;
  const sources = research.sources.slice(0, 20).map((s) => ({
    id: s.id, title: cut(s.title, 110), url: cut(s.url, 220),
    flags: s.flags.slice(0, 3),
  }));
  let claims = balancedSample(research.claims).map((c) => ({
    id: c.id, stance: c.stance, text: cut(c.text, 250),
    source_ids: c.source_ids,
    quotes: c.quotes.slice(0, 2).map((q) => ({
      source_id: q.source_id, text: cut(q.text, 150),
    })),
    unmatched_numbers: c.unmatched_numbers.slice(0, 3),
  }));
  const summary = {
    research_question: cut(project.question, 500),
    original_thesis: {
      statement: cut(thesis.statement, 1000), confidence: thesis.confidence,
      assumptions: thesis.assumptions.slice(0, 8).map((a) => ({
        id: a.id, text: cut(a.text, 200), claim_ids: a.supporting_claim_ids,
      })),
    },
    challenges: stress_test.challenges.slice(0, 8).map((c) => ({
      id: c.id, text: cut(c.text, 250), severity: c.severity, claim_ids: c.claim_ids,
    })),
    reevaluation: {
      verdict: reevaluation.thesis_verdict,
      revised_statement: cut(reevaluation.revised_statement, 900),
      unresolved: reevaluation.unresolved.slice(0, 6).map((x) => cut(x, 180)),
    },
    conclusion: {
      text: cut(conclusion.final_statement, 1200),
      confidence: conclusion.confidence,
      rationale: cut(conclusion.confidence_rationale, 600),
      supporting_claim_ids: conclusion.key_supporting_claim_ids,
      challenging_claim_ids: conclusion.key_challenging_claim_ids,
      uncertainties: conclusion.uncertainties.slice(0, 6).map((x) => cut(x, 180)),
    },
    fact_check: research.fact_check,
    sources,
    audit: project.audit.map((a) => ({
      stage: a.stage, input_refs: a.input_refs.slice(0, 20),
      warnings: a.warnings.slice(0, 3).map((w) => cut(w, 120)),
    })),
  };
  let payload = JSON.stringify({ ...summary, claims });
  while (bytes(payload) > MAX_PAYLOAD_BYTES && claims.length) {
    claims = claims.slice(0, -1);
    payload = JSON.stringify({ ...summary, claims, truncated: true });
  }
  if (bytes(payload) > MAX_PAYLOAD_BYTES) {
    throw new Error("The compressed research trace is still too large.");
  }
  return {
    type: "trace" as const,
    payload,
    criteria: [...CRUX_REVIEW_CRITERIA],
    context: "Independent review of a Crux research decision using SERV Reasoning V2. Evaluate whether the conclusion follows from cited evidence, considers counter-evidence, justifies confidence, and acknowledges limitations. Quotes were matched to source excerpts, but are not independently fact-verified. This is a compact summary; Crux preserves the original report.",
    settlementMinutes: 10 as const,
  };
}

/** Owner-only local validation; does not contact Reppo or consume credits. */
export function inspectReppoPayload(project: ResearchProject) {
  const request = buildReppoPayload(project);
  return {
    ready: true,
    payload_bytes: bytes(request.payload),
    request_bytes: bytes(JSON.stringify(request)),
    max_payload_bytes: MAX_PAYLOAD_BYTES,
    criteria_count: request.criteria.length,
    source_count: project.research?.sources.length ?? 0,
  };
}
