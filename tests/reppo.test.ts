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
      expect(JSON.parse(String(init?.body)).type).toBe("trace");
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
