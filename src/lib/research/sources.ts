/**
 * Source quality, in plain code (no model calls): what kind of publisher a source is, judged
 * from its web address, and whether it's weak evidence. It's a best guess from the domain;
 * the point is to surface social posts and stale pages, not to rank publishers finely.
 */

export type SourceKind = "research" | "government" | "industry_report" | "news" | "reference" | "company_or_blog" | "social" | "mock";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  research: "research",
  government: "government / official",
  industry_report: "industry report",
  news: "news",
  reference: "reference",
  company_or_blog: "company / blog",
  social: "social / forum",
  mock: "mock",
};

/** Older than this (when a date is known) is flagged as possibly out of date. */
export const STALE_AFTER_YEARS = 3;

// Matched against the hostname and its parent domains ("m.facebook.com" matches "facebook.com").
const DOMAINS: Partial<Record<SourceKind, string[]>> = {
  social: [
    "facebook.com", "fb.com", "instagram.com", "x.com", "twitter.com", "linkedin.com", "tiktok.com", "youtube.com",
    "reddit.com", "quora.com", "pinterest.com", "threads.net", "nairaland.com", "t.me", "whatsapp.com",
  ],
  research: [
    "researchgate.net", "academia.edu", "semanticscholar.org", "ssrn.com", "arxiv.org", "doi.org", "sciencedirect.com",
    "springer.com", "link.springer.com", "wiley.com", "tandfonline.com", "mdpi.com", "jstor.org", "ncbi.nlm.nih.gov",
    "nber.org", "scholar.google.com", "emerald.com", "sagepub.com", "frontiersin.org", "plos.org", "nature.com",
    "rsisinternational.org", "abjournals.org", "ajol.info", "iiste.org",
  ],
  government: [
    "worldbank.org", "imf.org", "oecd.org", "un.org", "undp.org", "who.int", "afdb.org", "wto.org", "ilo.org", "bis.org",
    "europa.eu", "cbn.gov.ng", "nigerianstat.gov.ng",
  ],
  industry_report: [
    "mordorintelligence.com", "6wresearch.com", "statista.com", "grandviewresearch.com", "marketsandmarkets.com",
    "imarcgroup.com", "fortunebusinessinsights.com", "researchandmarkets.com", "alliedmarketresearch.com", "gartner.com",
    "forrester.com", "idc.com", "mckinsey.com", "bcg.com", "pwc.com", "deloitte.com", "kpmg.com", "ey.com",
    "accenture.com", "bain.com", "tracxn.com", "crunchbase.com", "cbinsights.com", "agustoresearch.com", "gsma.com",
  ],
  news: [
    "reuters.com", "bloomberg.com", "ft.com", "wsj.com", "nytimes.com", "bbc.com", "bbc.co.uk", "theguardian.com",
    "cnbc.com", "forbes.com", "economist.com", "apnews.com", "aljazeera.com", "techcrunch.com", "theverge.com",
    "wired.com", "businessinsider.com", "techcabal.com", "techpoint.africa", "punchng.com", "guardian.ng",
    "vanguardngr.com", "premiumtimesng.com", "thecable.ng", "businessday.ng", "nairametrics.com", "channelstv.com",
    "thisdaylive.com", "dailytrust.com", "leadership.ng", "tribuneonlineng.com", "africanews.com", "qz.com",
  ],
  reference: ["wikipedia.org", "britannica.com", "investopedia.com"],
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const matches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function classifySource(url: string): SourceKind {
  const host = hostOf(url);
  if (!host) return "company_or_blog";
  if (host === "example.org" || host.endsWith(".example.org")) return "mock";
  for (const kind of ["social", "research", "government", "industry_report", "news", "reference"] as const) {
    if (DOMAINS[kind]!.some((d) => matches(host, d))) return kind;
  }
  // Public-sector and academic suffixes, including country forms like .gov.ng, .edu.ng, .ac.uk.
  if (/(^|\.)(gov|gouv|gob|mil)(\.[a-z]{2})?$/.test(host) || host.endsWith(".int")) return "government";
  if (/(^|\.)(edu|ac)(\.[a-z]{2})?$/.test(host) || /^(ir|repository|eprints|scholar|journals?)\./.test(host)) return "research";
  if (/(^|\.)(news|times|herald|tribune|gazette|post|guardian)\b/.test(host)) return "news";
  return "company_or_blog";
}

/** Why a source is weak evidence, if it is: user-generated content, or out of date. */
export function sourceFlags(kind: SourceKind, publishedDate: string | null, now = new Date()): string[] {
  const flags: string[] = [];
  if (kind === "social") flags.push("user-generated, unverified");
  if (publishedDate) {
    const published = new Date(publishedDate);
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - STALE_AFTER_YEARS);
    if (!Number.isNaN(published.getTime()) && published < cutoff) flags.push(`published ${published.getFullYear()}, may be out of date`);
  }
  return flags;
}
