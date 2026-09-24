/* eslint-disable @typescript-eslint/no-explicit-any -- overrides patch loosely-typed fixture output */
import { describe, expect, it } from "vitest";
import { MockReasoning, MockSearch } from "../src/lib/mock/providers";
import { MOCK_CLAIMS } from "../src/lib/mock/fixtures";
import { runResearch } from "../src/lib/pipeline";
import type { ReasoningProvider, ReasonRequest } from "../src/lib/reasoning/provider";
import type { PipelineEvent } from "../src/lib/types";

process.env.CRUX_MOCK_DELAY_MS = "0";
const QUESTION = "Should we launch an AI bookkeeping SaaS for Nigerian SMEs?";

/** Mock reasoning with per-step overrides. */
function reasoningWith(overrides: Record<string, (base: any) => unknown>): ReasoningProvider {
  const base = new MockReasoning();
  return {
    mode: "mock",
    async reason<T>(req: ReasonRequest) {
      const res = await base.reason<any>(req);
      const override = overrides[req.step];
      return { ...res, output: (override ? override(res.output) : res.output) as T };
    },
  };
}

describe("runResearch", () => {
  it("runs every stage in order and assembles What Changed", async () => {
    const events: PipelineEvent[] = [];
    const project = await runResearch(QUESTION, {
      reasoning: new MockReasoning(),
      search: new MockSearch(),
      onEvent: (e) => events.push(e),
    });

    expect(project.status).toBe("complete");
    expect(project.mode).toBe("mock");
    expect(events.filter((e) => e.type === "stage_completed").map((e) => (e as { stage: string }).stage)).toEqual([
      "research",
      "thesis",
      "stress_test",
      "reevaluation",
      "conclusion",
      "what_changed",
    ]);
    expect(events.at(-1)?.type).toBe("done");

    expect(project.research!.sources.map((s) => s.id)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]);
    expect(project.research!.claims).toHaveLength(MOCK_CLAIMS.claims.length);
    expect(project.thesis!.assumptions.map((a) => a.id)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(project.stress_test!.challenges[0].id).toBe("X1");

    const wc = project.what_changed!;
    expect(wc.initial.statement).toBe(project.thesis!.statement);
    expect(wc.final.statement).toBe(project.conclusion!.final_statement);
    expect(wc.verdict).toBe("weakened");
    expect(wc.challenged[0].severity).toBe("critical");
    expect(wc.assumptions.find((a) => a.assumption_id === "A2")?.verdict).toBe("weakened");

    expect(project.audit.map((a) => a.stage)).toHaveLength(6);
    expect(project.audit.every((a) => a.warnings.length === 0)).toBe(true);
  });

  it("strips citations to IDs that don't exist and records a warning", async () => {
    const project = await runResearch(QUESTION, {
      reasoning: reasoningWith({
        thesis: (t) => ({ ...t, supporting_claim_ids: [...t.supporting_claim_ids, "C999"] }),
        claims: (c) => ({ claims: [...c.claims, { text: "Invented", source_ids: ["S42"], category: "other", stance: "neutral" }] }),
      }),
      search: new MockSearch(),
    });

    expect(project.status).toBe("complete");
    expect(project.thesis!.supporting_claim_ids).not.toContain("C999");
    expect(project.research!.claims.some((c) => c.text === "Invented")).toBe(false);
    const warnings = project.audit.flatMap((a) => a.warnings);
    expect(warnings.some((w) => w.includes("C999"))).toBe(true);
    expect(warnings.some((w) => w.includes("ungrounded"))).toBe(true);
  });

  it("marks assumptions the re-evaluation skipped as unresolved", async () => {
    const project = await runResearch(QUESTION, {
      reasoning: reasoningWith({ reevaluation: (r) => ({ ...r, assessments: r.assessments.slice(0, 2) }) }),
      search: new MockSearch(),
    });

    const assessments = project.reevaluation!.assessments;
    expect(assessments.map((a) => a.assumption_id)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(assessments[2].verdict).toBe("unresolved");
  });

  it("fails the project with the failing stage when a step throws", async () => {
    const events: PipelineEvent[] = [];
    let saved = false;
    const project = await runResearch(QUESTION, {
      reasoning: reasoningWith({
        stress_test: () => {
          throw new Error("SERV unavailable");
        },
      }),
      search: new MockSearch(),
      onEvent: (e) => events.push(e),
      save: async () => {
        saved = true;
      },
    });

    expect(project.status).toBe("failed");
    expect(project.error).toBe("SERV unavailable");
    expect(project.thesis).not.toBeNull();
    expect(events).toContainEqual({ type: "error", stage: "stress_test", message: "SERV unavailable" });
    expect(saved).toBe(true);
  });
});
