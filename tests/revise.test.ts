import { describe, expect, it } from "vitest";
import { MockReasoning, MockSearch } from "../src/lib/mock/providers";
import { runResearch } from "../src/lib/pipeline";
import type { ReasoningProvider, ReasonRequest } from "../src/lib/reasoning/provider";
import type { SearchProvider } from "../src/lib/research/search";
import { reviseWithFeedback, revisionBlocker } from "../src/lib/revise";
import type { ResearchProject } from "../src/lib/types";

process.env.CRUX_MOCK_DELAY_MS = "0";

async function reviewedReport(): Promise<ResearchProject> {
  const project = await runResearch("Should we launch AI bookkeeping for Nigerian SMEs?", { reasoning: new MockReasoning(), search: new MockSearch() });
  return {
    ...project,
    mode: "live",
    reppo: {
      eval_id: "eval_1",
      status: "settled",
      submitted_at: "2026-11-03T00:00:00Z",
      decision: "revise",
      score: 62,
      critiques: [
        { dimension: "Evidence", critique: "Willingness-to-pay rests on one study." },
        { dimension: "Counter-evidence", critique: "Free bundled tools are not weighed." },
      ],
    },
  };
}

const newSource = {
  url: "https://example.org/mock/new-pricing-survey",
  title: "[Mock] New pricing survey",
  content: "Illustrative data. In a 2026 survey, 41% of micro businesses said they would pay for software that helps them get credit.",
  score: 0.9,
  published_date: "2026-05-01",
};

/** SERV stand-in: plans a search per critique, extracts one new fact, then revises. */
function reviser(overrides: { responses?: unknown[] } = {}): ReasoningProvider & { calls: string[] } {
  const calls: string[] = [];
  return {
    mode: "live",
    calls,
    async reason<T>(req: ReasonRequest) {
      calls.push(req.step);
      const outputs: Record<string, unknown> = {
        revision_plan: { items: [{ critique_number: 1, research_query: "micro business software willingness to pay survey 2026" }, { critique_number: 2, research_query: "free bookkeeping in POS apps adoption" }] },
        claims: {
          claims: [{ text: "41% of micro businesses would pay for software that helps them get credit.", quotes: [{ source_id: req.user.match(/\[(S\d+)\]/)?.[1] ?? "S1", text: "41% of micro businesses said they would pay for software that helps them get credit" }], category: "pricing", stance: "supports" }],
        },
        revision: {
          responses: overrides.responses ?? [
            { critique_number: 1, status: "addressed", response: "A second survey now supports willingness to pay.", claim_ids: ["C17", "C99"] },
          ],
          final_statement: "A credit-linked product is viable; a broad subscription is not.",
          confidence: "medium",
          confidence_rationale: "Two surveys now agree.",
          key_supporting_claim_ids: ["C17"],
          key_challenging_claim_ids: [],
          uncertainties: ["Conversion beyond trials."],
          next_validation_steps: [{ step: "Pilot with a lender.", resolves: "Who pays." }],
          changes: [{ from: "Willingness to pay is thin.", to: "Credit-linked willingness exists.", reason: "R1 and C17.", claim_ids: ["C17"] }],
        },
      };
      return { output: outputs[req.step] as T, model: "serv-test" };
    },
  };
}
const searchWith = (hits: typeof newSource[]): SearchProvider => ({ mode: "live", search: async () => hits });

describe("improving a report with its review", () => {
  it("adds fact-checked new evidence, answers every critique, and leaves the original untouched", async () => {
    const original = await reviewedReport();
    const before = JSON.stringify(original);
    const reasoning = reviser();
    const revised = await reviseWithFeedback(original, { reasoning, search: searchWith([newSource]) });

    expect(JSON.stringify(original)).toBe(before);
    expect(reasoning.calls).toEqual(["revision_plan", "claims", "revision"]);
    expect(revised.id).not.toBe(original.id);
    expect(revised.revision?.of).toBe(original.id);

    // New sources and facts are numbered after the original's.
    expect(revised.revision?.new_source_ids).toEqual(["S9"]);
    expect(revised.revision?.new_claim_ids).toEqual(["C17"]);
    expect(revised.research?.claims).toHaveLength(original.research!.claims.length + 1);

    // One response per critique; the one SERV skipped is recorded as not addressed.
    const responses = revised.revision!.responses;
    expect(responses.map((r) => r.status)).toEqual(["addressed", "not_addressed"]);
    expect(responses[0].claim_ids).toEqual(["C17"]);
    expect(responses[1].research_query).toMatch(/POS/);
    expect(revised.revision?.warnings.some((w) => w.includes("C99"))).toBe(true);

    // Counted in code.
    expect(revised.revision?.metrics).toMatchObject({
      facts: { before: 16, after: 17 },
      critiques: { total: 2, addressed: 1, partly: 0, not_addressed: 1 },
      confidence: { before: original.conclusion!.confidence, after: "medium" },
    });
    expect(revised.conclusion?.final_statement).toMatch(/credit-linked/);
    expect(revised.what_changed).toEqual(original.what_changed);
    expect(revised.reppo).toBeUndefined();
  });

  it("doesn't reuse sources the report already has, and still revises when nothing new is found", async () => {
    const original = await reviewedReport();
    const known = { ...newSource, url: original.research!.sources[0].url };
    const revised = await reviseWithFeedback(original, { reasoning: reviser(), search: searchWith([known]) });
    expect(revised.revision?.new_source_ids).toEqual([]);
    expect(revised.revision?.warnings.some((w) => /found no sources/.test(w))).toBe(true);
  });

  it("only revises completed live reports with a settled review", async () => {
    const original = await reviewedReport();
    expect(revisionBlocker(original)).toBeNull();
    expect(revisionBlocker({ ...original, mode: "mock" })).toMatch(/live/);
    expect(revisionBlocker({ ...original, reppo: undefined })).toMatch(/review first/);
    expect(revisionBlocker({ ...original, reppo: { ...original.reppo!, status: "pending" } })).toMatch(/verdict/);
    expect(revisionBlocker({ ...original, reppo: { ...original.reppo!, critiques: [] } })).toMatch(/no critiques/);
    await expect(reviseWithFeedback({ ...original, reppo: undefined }, { reasoning: reviser(), search: searchWith([newSource]) })).rejects.toThrow();
  });
});

describe("follow-up source quality", () => {
  it("leaves out company blogs when research, official, industry or news sources were found", async () => {
    const original = await reviewedReport();
    const blog = { ...newSource, url: "https://someblog.example.com/crypto-stats", title: "Crypto stats" };
    const study = { ...newSource, url: "https://www.sciencedirect.com/science/article/x", title: "A study" };
    const revised = await reviseWithFeedback(original, { reasoning: reviser(), search: searchWith([blog, study]) });
    const added = revised.research!.sources.filter((s) => revised.revision!.new_source_ids.includes(s.id));
    expect(added.map((s) => s.kind)).toEqual(["research"]);
  });
});
