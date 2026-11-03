import { describe, expect, it } from "vitest";
import { buildReppoPayload, inspectReppoPayload } from "../src/lib/reppo/payload";
import { normalizeReppoResponse, submitReppo } from "../src/lib/reppo/client";
import type { ResearchProject } from "../src/lib/types";
import type { ReppoReview } from "../src/lib/reppo/types";
import { runResearch } from "../src/lib/pipeline";
import { MockReasoning, MockSearch } from "../src/lib/mock/providers";

process.env.CRUX_MOCK_DELAY_MS = "0";
async function fixture(): Promise<ResearchProject> {
  const result = await runResearch("Should we launch AI bookkeeping for Nigerian SMEs?", {
    reasoning: new MockReasoning(), search: new MockSearch(),
  });
  return { ...result, mode: "live" };
}
describe("S2 independent evaluation", () => {
  it("submits a compact evidence-linked SERV trace", async () => {
    const data = buildReppoPayload(await fixture());
    expect(data.type).toBe("trace");
    expect(data.settlementMinutes).toBe(10);
    expect(data.criteria).toHaveLength(5);
    expect(data.criteria.every((criterion) => typeof criterion === "string" && criterion.length > 15)).toBe(true);
    expect(inspectReppoPayload(await fixture()).criteria_count).toBe(5);
    expect(new TextEncoder().encode(data.payload).length).toBeLessThanOrEqual(18_000);
    expect(inspectReppoPayload(await fixture()).request_bytes).toBeLessThan(20_000);
    const trace = JSON.parse(data.payload);
    expect(trace.audit).toHaveLength(6);
    expect(trace.claims[0].quotes.length).toBeGreaterThan(0);
  });
  it("rejects mock and incomplete runs", async () => {
    const project = await fixture();
    expect(() => buildReppoPayload({ ...project, mode: "mock" })).toThrow();
    expect(() => buildReppoPayload({ ...project, status: "failed" })).toThrow();
  });
  it("sends bearer authorization and parses evaluation ID", async () => {
    const project = await fixture();
    const transport = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
      const submitted = JSON.parse(String(init?.body));
      expect(submitted.type).toBe("trace");
      expect(submitted.criteria).toHaveLength(5);
      expect(submitted.criteria[0]).toMatch(/cited source quotations/);
      expect(submitted.payload).toBeTypeOf("string");
      return new Response(JSON.stringify({ evalId: "eval_1234" }), { status: 200 });
    }) as typeof fetch;
    await expect(submitReppo(project, "test-key", transport)).resolves.toBe("eval_1234");
  });
  it("surfaces a short Reppo HTTP 400 validation message", async () => {
    const project = await fixture();
    const transport = (async () => new Response(JSON.stringify({ error: "payload is invalid" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
    await expect(submitReppo(project, "test-key", transport))
      .rejects.toMatchObject({ status: 400, reason: "payload is invalid" });
  });
  it("does not mark an incomplete response as settled", () => {
    const pending: ReppoReview = { eval_id: "eval_1234", submitted_at: "2026-11-03T00:00:00Z", status: "pending", critiques: [] };
    expect(normalizeReppoResponse({ status: "pending" }, pending).status).toBe("pending");
    const settled = normalizeReppoResponse({
      verdict: { decision: "revise", score: 71, confidence: "high" },
      action: { route: "review" },
      verdicts: [{ dimension: "Evidence", critique: "Needs primary sources", score: 58 }],
      peerAssessmentCount: 3,
    }, pending);
    expect(settled).toMatchObject({ status: "settled", decision: "revise", score: 71, peer_assessment_count: 3 });
    expect(settled.critiques[0].critique).toMatch(/primary sources/);
  });
});

describe("verdict checks", () => {
  const pending: ReppoReview = { eval_id: "eval_1234", submitted_at: "2026-11-03T00:00:00Z", status: "pending", critiques: [] };
  it("keeps Reppo's own status so a slow review is visible", () => {
    const checked = normalizeReppoResponse({ data: { status: "in_review" } }, pending);
    expect(checked).toMatchObject({ status: "pending", reppo_status: "in_review" });
    expect(checked.checked_at).toBeTruthy();
  });
  it("accepts a decision at the top level as well as under verdict", () => {
    expect(normalizeReppoResponse({ status: "settled", decision: "Accept", score: 80 }, pending)).toMatchObject({ status: "settled", decision: "accept" });
  });
});

describe("reading a settled verdict", () => {
  const pending: ReppoReview = { eval_id: "eval_1234", submitted_at: "2026-11-03T00:00:00Z", status: "pending", critiques: [] };
  it("stops waiting when Reppo says SETTLED, and lists the fields it couldn't read", () => {
    const r = normalizeReppoResponse({ data: { status: "SETTLED", evalId: "eval_1234", outcome_blob: { x: 1 } } }, pending);
    expect(r.status).toBe("settled");
    expect(r.unread_fields?.join(" ")).toMatch(/outcome_blob\{x\}/);
  });
  it("reads other common shapes for the decision, score and critiques", () => {
    const r = normalizeReppoResponse({
      status: "SETTLED",
      result: { outcome: "REJECTED", finalScore: 41 },
      assessments: [{ criterion: "Evidence", feedback: "Quotes are thin." }, { criterion: "Confidence", comment: "Overstated." }],
    }, pending);
    expect(r).toMatchObject({ status: "settled", decision: "reject", score: 41 });
    expect(r.critiques.map((c) => c.dimension)).toEqual(["Evidence", "Confidence"]);
    expect(r.unread_fields).toBeUndefined();
  });
  it("keeps waiting while Reppo is still working", () => {
    expect(normalizeReppoResponse({ status: "PENDING" }, pending).status).toBe("pending");
  });
});
