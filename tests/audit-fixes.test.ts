import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Every route here runs on local file storage in a temp folder, with fake keys and a stubbed
// fetch, so no request ever leaves the test.
const dataDir = mkdtempSync(path.join(tmpdir(), "crux-audit-"));
const saved = { ...process.env };
beforeAll(() => {
  process.env.CRUX_DATA_DIR = dataDir;
  delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
});
afterEach(() => { process.env = { ...saved, CRUX_DATA_DIR: dataDir }; vi.unstubAllGlobals(); });

const ID = "bbbbbbbb-0000-4000-8000-000000000001";
function savePending(checkedAgoMs: number | null) {
  writeFileSync(path.join(dataDir, ID + ".json"), JSON.stringify({
    id: ID, question: "Is this a test question?", status: "complete", mode: "live", created_at: new Date().toISOString(),
    audit: [], error: null,
    reppo: { eval_id: "eval-123", status: "pending", submitted_at: new Date().toISOString(), critiques: [],
      ...(checkedAgoMs === null ? {} : { checked_at: new Date(Date.now() - checkedAgoMs).toISOString() }) },
  }));
}
const ctx = { params: Promise.resolve({ id: ID }) } as never;

describe("research runs have a daily allowance (cost protection)", () => {
  it("refuses a live run once the visitor's allowance is used, before any SERV or Tavily call", async () => {
    process.env.SERV_API_KEY = "fake-serv"; process.env.TAVILY_API_KEY = "fake-tavily"; delete process.env.CRUX_MOCK;
    process.env.CRUX_RUNS_PER_VISITOR = "0";
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await import("../src/app/api/research/route");
    const res = await POST(new Request("https://x.test/api/research", {
      method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.9" },
      body: JSON.stringify({ question: "Are small businesses willing to accept crypto?" }),
    }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/free research runs/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still rejects invalid questions before counting anything", async () => {
    const { POST } = await import("../src/app/api/research/route");
    const res = await POST(new Request("https://x.test/api/research", { method: "POST", body: JSON.stringify({ question: "short" }) }));
    expect(res.status).toBe(400);
  });
});

describe("visitor identity prefers the platform-set address", () => {
  it("ignores a spoofed x-forwarded-for when x-real-ip is present", async () => {
    const { visitorKey } = await import("../src/lib/reppo/limits");
    const a = visitorKey(new Request("https://x.test", { headers: { "x-real-ip": "198.51.100.1", "x-forwarded-for": "1.1.1.1" } }));
    const b = visitorKey(new Request("https://x.test", { headers: { "x-real-ip": "198.51.100.1", "x-forwarded-for": "2.2.2.2" } }));
    expect(a).toBe(b);
  });
});

describe("verdict checks are throttled (anyone can call them)", () => {
  it("does not call Reppo again within 20 seconds of the last check", async () => {
    process.env.REPPO_REVIEW_ENABLED = "1"; process.env.REPPO_API_KEY = "fake-reppo";
    savePending(5_000);
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await import("../src/app/api/research/[id]/review/route");
    const res = await GET(new Request("https://x.test/api/research/" + ID + "/review"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).review.status).toBe("pending");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks Reppo when the last check is older than that", async () => {
    process.env.REPPO_REVIEW_ENABLED = "1"; process.env.REPPO_API_KEY = "fake-reppo";
    savePending(60_000);
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ status: "pending" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await import("../src/app/api/research/[id]/review/route");
    const res = await GET(new Request("https://x.test/api/research/" + ID + "/review"), ctx);
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("search results only become links when they are web URLs", () => {
  it("accepts http(s) and rejects script, data and relative URLs", async () => {
    const { isWebUrl } = await import("../src/lib/research/search");
    expect(isWebUrl("https://example.com/a")).toBe(true);
    expect(isWebUrl("http://example.com")).toBe(true);
    for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<b>x</b>", "/relative", "", null]) expect(isWebUrl(bad)).toBe(false);
  });
});

describe("the improvement lock outlives the improvement", () => {
  it("revise holds the report lock for longer than its maximum run time", async () => {
    const src = (await import("node:fs")).readFileSync("src/app/api/research/[id]/revise/route.ts", "utf8");
    expect(src).toMatch(/acquireReviewLock\(id, maxDuration \+ 30\)/);
  });
});
