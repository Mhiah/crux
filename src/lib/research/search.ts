export type SearchResult = {
  url: string;
  title: string;
  content: string;
  score: number;
  published_date: string | null;
};

export interface SearchProvider {
  readonly mode: "live" | "mock";
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}

type TavilyResponse = {
  results: { url: string; title: string; content: string; score: number; published_date?: string }[];
};

/** Tavily returns LLM-ready excerpts per result, which is what the claim extractor needs. */
export class TavilySearch implements SearchProvider {
  readonly mode = "live" as const;

  constructor(private apiKey: string) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query, max_results: maxResults, search_depth: "advanced", topic: "general" }),
    });
    if (!res.ok) throw new Error(`Tavily search failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as TavilyResponse;
    return data.results.map((r) => ({
      url: r.url,
      title: r.title,
      content: r.content,
      score: r.score,
      published_date: r.published_date ?? null,
    }));
  }
}
