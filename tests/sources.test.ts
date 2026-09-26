import { describe, expect, it } from "vitest";
import { formatClaims, formatEvidence } from "../src/lib/reasoning/prompts";
import { collectResearch } from "../src/lib/research/collect";
import type { SearchProvider, SearchResult } from "../src/lib/research/search";
import { classifySource, sourceFlags } from "../src/lib/research/sources";
import type { ReasoningProvider, ReasonRequest } from "../src/lib/reasoning/provider";

describe("classifySource", () => {
  // Sources from the first live run.
  it.each([
    ["https://www.facebook.com/guardianng/posts/the-2025-nigeria-fintech-survey", "social"],
    ["https://m.facebook.com/some/post", "social"],
    ["https://www.researchgate.net/publication/391788130_Barriers_to_Cloud_Accounting", "research"],
    ["https://www.academia.edu/35808342/ICT_and_accounting_system_of_SMEs_in_Nigeria", "research"],
    ["https://ir.uitm.edu.my/125204/1/125204.pdf", "research"],
    ["https://pdfs.semanticscholar.org/6173/eaab.pdf", "research"],
    ["https://www.pwc.com/ng/en/assets/pdf/pwc-msme-survey-report-2024.pdf", "industry_report"],
    ["https://www.mordorintelligence.com/industry-reports/ai-in-accounting-market", "industry_report"],
    ["https://tracxn.com/d/explore/sme-business-management-software-startups-in-nigeria", "industry_report"],
    ["https://www.cbn.gov.ng/out/2024/report.pdf", "government"],
    ["https://www.firs.gov.ng/vat", "government"],
    ["https://data.worldbank.org/indicator", "government"],
    ["https://techcabal.com/2025/01/01/story", "news"],
    ["https://en.wikipedia.org/wiki/Test", "reference"],
    ["https://hrpayhub.com/pricing", "company_or_blog"],
    ["https://useflexfinance.com/blog/best-accounting-software-in-nigeria", "company_or_blog"],
    ["https://example.org/mock/sme-digitisation-survey", "mock"],
    ["not a url", "company_or_blog"],
  ])("%s → %s", (url, kind) => {
    expect(classifySource(url)).toBe(kind);
  });

  it("doesn't match look-alike domains", () => {
    expect(classifySource("https://notfacebook.com/page")).toBe("company_or_blog");
    expect(classifySource("https://facebook.com.evil.example/page")).toBe("company_or_blog");
  });
});

describe("sourceFlags", () => {
  const now = new Date("2026-09-26");
  it("flags social posts and sources older than three years, but not undated or recent ones", () => {
    expect(sourceFlags("social", null, now)).toEqual(["user-generated, unverified"]);
    expect(sourceFlags("news", "2021-05-01", now)).toEqual(["published 2021, may be out of date"]);
    expect(sourceFlags("news", "2024-05-01", now)).toEqual([]);
    expect(sourceFlags("research", null, now)).toEqual([]);
    expect(sourceFlags("research", "not a date", now)).toEqual([]);
  });
});

const hit = (url: string, score: number, content = `Content for ${url}, long enough to quote from in a test.`): SearchResult => ({
  url,
  title: url,
  content,
  score,
  published_date: null,
});

describe("source selection", () => {
  it("keeps weak sources only when there's room, and tags claims resting only on them", async () => {
    // 20 ordinary results plus one very relevant Facebook post: the post is the one left out.
    const results = [hit("https://www.facebook.com/post/1", 0.99), ...Array.from({ length: 20 }, (_, i) => hit(`https://site${i}.com/page`, 0.5))];
    const search: SearchProvider = { mode: "mock", search: async () => results };
    const reasoning: ReasoningProvider = {
      mode: "mock",
      async reason<T>(req: ReasonRequest) {
        const output = req.step === "query_plan" ? { queries: ["q"] } : { claims: [{ text: "A claim.", quotes: [{ source_id: "S1", text: "Content for https://site0.com/page" }], category: "other", stance: "neutral" }] };
        return { output: output as T, model: "mock" };
      },
    };
    const { research } = await collectResearch("Question?", reasoning, search);
    expect(research.sources).toHaveLength(20);
    expect(research.sources.some((s) => s.kind === "social")).toBe(false);

    // With room to spare, the post is kept but sorted last and flagged.
    const few: SearchProvider = { mode: "mock", search: async () => results.slice(0, 3) };
    const small = (await collectResearch("Question?", reasoning, few)).research;
    expect(small.sources.map((s) => s.kind)).toEqual(["company_or_blog", "company_or_blog", "social"]);
    expect(small.sources[2].flags).toEqual(["user-generated, unverified"]);

    const claim = { ...small.claims[0], source_ids: ["S3"] };
    expect(formatClaims([claim], small.sources)).toContain("S3 social / forum");
    expect(formatClaims([claim], small.sources)).toContain("[weak evidence: rests only on social posts or out-of-date sources]");
    expect(formatClaims([small.claims[0]], small.sources)).not.toContain("weak evidence");
  });
});

describe("balanced research", () => {
  const reasoningWith = (plan: unknown, claims: unknown, sources?: unknown): ReasoningProvider => ({
    mode: "mock",
    async reason<T>(req: ReasonRequest) {
      return { output: (req.step === "query_plan" ? plan : { claims, ...(sources ? { sources } : {}) }) as T, model: "mock" };
    },
  });
  const claim = (text: string, sourceId: string, quote: string, stance = "supports") => ({
    text,
    quotes: [{ source_id: sourceId, text: quote }],
    category: "other",
    stance,
  });

  it("recognises crypto and payments publishers", () => {
    expect(classifySource("https://www.coindesk.com/business/2025/01/01/x")).toBe("news");
    expect(classifySource("https://cointelegraph.com/news/x")).toBe("news");
    expect(classifySource("https://www.chainalysis.com/blog/2025-geography-of-crypto")).toBe("industry_report");
    expect(classifySource("https://www.fca.org.uk/news/x")).toBe("government");
  });

  it("gives the challenging queries their share of sources despite lower relevance", async () => {
    const pro = Array.from({ length: 20 }, (_, i) => hit(`https://pro${i}.com/page`, 0.95));
    const con = Array.from({ length: 3 }, (_, i) => hit(`https://con${i}.com/page`, 0.3));
    const search: SearchProvider = { mode: "mock", search: async (q) => (q.startsWith("why") ? con : pro) };
    const plan = { supporting_queries: ["demand for it"], challenging_queries: ["why it fails"] };
    const { research } = await collectResearch("Question?", reasoningWith(plan, [claim("A claim.", "S1", "Content for https://con0.com/page")]), search);
    expect(research.queries).toEqual(["why it fails", "demand for it"]);
    expect(research.sources).toHaveLength(20);
    expect(research.sources.filter((s) => s.url.startsWith("https://con"))).toHaveLength(3);
  });

  it("uses SERV's publisher label only for sites the address list doesn't know", async () => {
    const results = [hit("https://someobscurecryptonews.io/story", 0.9), hit("https://www.coindesk.com/story", 0.8), hit("https://unknown-vendor.com/x", 0.7)];
    const search: SearchProvider = { mode: "mock", search: async () => results };
    const labels = [
      { source_id: "S1", kind: "news" },
      { source_id: "S2", kind: "company_or_blog" }, // wrong, but CoinDesk is known: ignored
      { source_id: "S3", kind: "not-a-kind" }, // invalid: ignored
    ];
    const { research } = await collectResearch(
      "Question?",
      reasoningWith({ queries: ["q"] }, [claim("A claim.", "S1", "Content for https://someobscurecryptonews.io/story")], labels),
      search,
    );
    expect(research.sources.map((s) => s.kind)).toEqual(["news", "news", "company_or_blog"]);
  });

  it("warns, and tells the later stages, when no counter-evidence was found", async () => {
    const search: SearchProvider = { mode: "mock", search: async () => [hit("https://a.com/x", 0.9)] };
    const oneSided = await collectResearch("Question?", reasoningWith({ queries: ["q"] }, [claim("Yes.", "S1", "Content for https://a.com/x")]), search);
    expect(oneSided.warnings.some((w) => w.includes("No evidence against"))).toBe(true);
    expect(oneSided.warnings.some((w) => w.includes("no queries aimed at evidence against"))).toBe(true);
    expect(formatEvidence("Question?", oneSided.research)).toContain("Treat that as a gap in the evidence");

    const balanced = await collectResearch(
      "Question?",
      reasoningWith({ supporting_queries: ["a"], challenging_queries: ["b"] }, [claim("No.", "S1", "Content for https://a.com/x", "challenges")]),
      search,
    );
    expect(balanced.warnings).toEqual([]);
    expect(formatEvidence("Question?", balanced.research)).not.toContain("gap in the evidence");
  });
});
