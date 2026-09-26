import type { ReasoningProvider } from "../reasoning/provider";
import { CLAIMS_SCHEMA, QUERY_PLAN_SCHEMA } from "../reasoning/schemas";
import { QUERY_PLAN_SYSTEM, CLAIMS_SYSTEM, formatSources } from "../reasoning/prompts";
import type { Claim, Research, Source } from "../types";
import type { SearchProvider } from "./search";

const RESULTS_PER_QUERY = 5;
const MAX_SOURCES = 20;
// Tavily's advanced depth returns ~3 relevant chunks per result (typically 1.2k-2.4k chars);
// cutting shorter drops the figures that live past the page intro.
const MAX_EXCERPT_CHARS = 2500;

export type CollectResult = { research: Research; models: string[]; warnings: string[] };

function publisherOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Plan queries with SERV, run them, dedupe sources, then extract claims tied to source IDs. */
export async function collectResearch(
  question: string,
  reasoning: ReasoningProvider,
  search: SearchProvider,
): Promise<CollectResult> {
  const warnings: string[] = [];
  const models: string[] = [];

  const plan = await reasoning.reason<{ queries: string[] }>({
    step: "query_plan",
    system: QUERY_PLAN_SYSTEM,
    user: `Research question: ${question}`,
    schema: QUERY_PLAN_SCHEMA,
  });
  models.push(plan.model);
  const queries = [...new Set(plan.output.queries.map((q) => q.trim()).filter(Boolean))].slice(0, 8);

  const settled = await Promise.allSettled(queries.map((q) => search.search(q, RESULTS_PER_QUERY)));
  const byUrl = new Map<string, Omit<Source, "id">>();
  settled.forEach((r, i) => {
    if (r.status === "rejected") {
      warnings.push(`Search failed for "${queries[i]}": ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      return;
    }
    for (const hit of r.value) {
      const existing = byUrl.get(hit.url);
      if (existing && existing.relevance >= hit.score) continue;
      byUrl.set(hit.url, {
        url: hit.url,
        title: hit.title,
        publisher: publisherOf(hit.url),
        published_date: hit.published_date,
        excerpt: hit.content.slice(0, MAX_EXCERPT_CHARS),
        relevance: hit.score,
      });
    }
  });
  if (byUrl.size === 0) throw new Error("Research found no sources. Check the search provider and try a different question.");

  const sources: Source[] = [...byUrl.values()]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_SOURCES)
    .map((s, i) => ({ id: `S${i + 1}`, ...s }));
  const sourceIds = new Set(sources.map((s) => s.id));

  const extracted = await reasoning.reason<{ claims: Omit<Claim, "id">[] }>({
    step: "claims",
    system: CLAIMS_SYSTEM,
    user: `Research question: ${question}\n\nSources:\n${formatSources(sources)}`,
    schema: CLAIMS_SCHEMA,
  });
  models.push(extracted.model);

  const claims: Claim[] = [];
  for (const c of extracted.output.claims) {
    const valid = c.source_ids.filter((id) => sourceIds.has(id));
    if (valid.length < c.source_ids.length) {
      warnings.push(`Claim "${c.text.slice(0, 60)}…" cited unknown sources ${c.source_ids.filter((id) => !sourceIds.has(id)).join(", ")}; removed them.`);
    }
    if (valid.length === 0) {
      warnings.push(`Dropped ungrounded claim "${c.text.slice(0, 60)}…".`);
      continue;
    }
    claims.push({ ...c, id: `C${claims.length + 1}`, source_ids: valid });
  }
  if (claims.length === 0) throw new Error("No grounded claims could be extracted from the sources.");

  return { research: { queries, sources, claims }, models, warnings };
}
