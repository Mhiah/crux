/**
 * Fact checking for extracted claims, in plain code (no model calls). SERV must quote the
 * exact words each claim rests on; a quote only counts if it's actually in that source's
 * excerpt, and figures in the claim should appear in its verified quotes.
 */

/** Shorter quotes ("68%", "the market") would match almost anything. */
const MIN_QUOTE_CHARS = 20;
const MIN_PART_CHARS = 8;

/** Case, curly quotes, dashes, markdown and whitespace differ between excerpt and quote without changing the words. */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛`]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[*_#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const trimPart = (part: string) => part.replace(/^[\s"'.,;:!?()-]+|[\s"'.,;:!?()-]+$/g, "");

/**
 * True when every part of `quote` appears in `source`, in order. Parts are separated by an
 * ellipsis, which models use to skip words ("...", "…", or Tavily's own "[...]").
 */
export function quoteFound(quote: string, source: string): boolean {
  const q = normalize(quote);
  const parts = q
    .split(/\[\.\.\.\]|\.\.\.|…/)
    .map(trimPart)
    .filter(Boolean);
  if (parts.length === 0 || parts.join(" ").length < MIN_QUOTE_CHARS || parts.some((p) => p.length < MIN_PART_CHARS)) {
    return false;
  }
  const haystack = normalize(source);
  let from = 0;
  for (const part of parts) {
    const at = haystack.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

/** Figures as written, minus thousands separators: "₦3,000" → "3000", "45.2%" → "45.2". */
export function numbersIn(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/,(?=\d{3}\b)/g, "").replace(/\.0+$/, "")),
  );
}

/** Figures the claim states that none of its verified quotes contain. */
export function unmatchedNumbers(claim: string, quotes: string[]): string[] {
  const quoted = numbersIn(quotes.join(" "));
  return [...numbersIn(claim)].filter((n) => !quoted.has(n));
}
