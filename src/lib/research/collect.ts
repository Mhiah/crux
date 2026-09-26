import type { ReasoningProvider } from "../reasoning/provider";
import { CLAIMS_SCHEMA, QUERY_PLAN_SCHEMA } from "../reasoning/schemas";
import { QUERY_PLAN_SYSTEM, CLAIMS_SYSTEM, formatSources } from "../reasoning/prompts";
import type { Claim, Research, Source } from "../types";
import type { SearchProvider } from "./search";
import { classifySource, sourceFlags } from "./sources";
import { quoteFound, unmatchedNumbers } from "./verify";

const RESULTS_PER_QUERY = 5;
const MAX_SOURCES = 20;
// Tavily's advanced depth returns ~3 relevant chunks per result (typically 1.2k-2.4k chars);
// cutting shorter drops the figures that live past the page intro.
const MAX_EXCERPT_CHARS = 2500;

export type CollectResult = { research: Research; models: string[]; warnings: string[] };

type RawClaim = Pick<Claim, "text" | "category" | "stance" | "quotes">;

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
      const kind = classifySource(hit.url);
      byUrl.set(hit.url, {
        url: hit.url,
        title: hit.title,
        publisher: publisherOf(hit.url),
        published_date: hit.published_date,
        excerpt: hit.content.slice(0, MAX_EXCERPT_CHARS),
        relevance: hit.score,
        kind,
        flags: sourceFlags(kind, hit.published_date),
      });
    }
  });
  if (byUrl.size === 0) throw new Error("Research found no sources. Check the search provider and try a different question.");

  const sources: Source[] = [...byUrl.values()]
    // Weak sources (social posts, stale pages) only fill slots the rest leave open.
    .sort((a, b) => Number(a.flags.length > 0) - Number(b.flags.length > 0) || b.relevance - a.relevance)
    .slice(0, MAX_SOURCES)
    .map((s, i) => ({ id: `S${i + 1}`, ...s }));
  const byId = new Map(sources.map((s) => [s.id, s]));

  const extracted = await reasoning.reason<{ claims: RawClaim[] }>({
    step: "claims",
    system: CLAIMS_SYSTEM,
    user: `Research question: ${question}\n\nSources:\n${formatSources(sources)}`,
    schema: CLAIMS_SCHEMA,
  });
  models.push(extracted.model);

  const claims: Claim[] = [];
  let dropped = 0;
  for (const c of extracted.output.claims) {
    const label = `"${c.text.slice(0, 60)}…"`;
    const quotes: Claim["quotes"] = [];
    for (const q of c.quotes ?? []) {
      const source = byId.get(q.source_id);
      if (!source) warnings.push(`Claim ${label} quoted unknown source ${q.source_id}; removed it.`);
      else if (!quoteFound(q.text, source.excerpt)) warnings.push(`Claim ${label}: its quote isn't in ${q.source_id}'s text; removed that source.`);
      else if (!quotes.some((v) => v.source_id === q.source_id && v.text === q.text)) quotes.push({ source_id: q.source_id, text: q.text });
    }
    if (quotes.length === 0) {
      dropped++;
      warnings.push(`Dropped claim ${label}: no quote for it was found in any source.`);
      continue;
    }
    const id = `C${claims.length + 1}`;
    const unmatched = unmatchedNumbers(c.text, quotes.map((q) => q.text));
    if (unmatched.length) warnings.push(`${id}: figures ${unmatched.join(", ")} aren't in its quoted source text; flagged.`);
    claims.push({
      id,
      text: c.text,
      source_ids: [...new Set(quotes.map((q) => q.source_id))],
      category: c.category,
      stance: c.stance,
      quotes,
      unmatched_numbers: unmatched,
    });
  }
  if (claims.length === 0) throw new Error("No claims could be verified against the sources.");

  const fact_check = { extracted: extracted.output.claims.length, dropped, flagged: claims.filter((c) => c.unmatched_numbers.length).length };
  return { research: { queries, sources, claims, fact_check }, models, warnings };
}
