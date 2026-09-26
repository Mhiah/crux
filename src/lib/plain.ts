import type { ResearchProject } from "./types";

/**
 * SERV cites record IDs inside its prose ("…well evidenced (C1, C2), so X4 weakens it").
 * The report's reading views show plain sentences instead, and turn the IDs into a single
 * "Evidence" link; the IDs themselves stay in the data and the audit trail.
 */

const ID = "[SCAX]\\d{1,3}";
const LIST = `${ID}(?:\\s*(?:,|;|and|&|/|or)\\s*${ID})*`;
const NOUN: Record<string, string> = { C: "the evidence", S: "the sources", A: "an assumption", X: "the stress test" };

export function refsIn(text: string): string[] {
  return [...new Set(text.match(new RegExp(`\\b${ID}\\b`, "g")) ?? [])];
}

/**
 * No em dashes in what we show: a dash used as punctuation becomes a comma, and an en dash
 * inside a range or compound ("3–4", "UK–Nigeria") becomes a plain hyphen.
 */
export function stripDashes(text: string): string {
  return text
    .replace(/(\S)–(\S)/g, "$1-$2")
    .replace(/\s*[—―]\s*|\s+[–-]\s+/g, ", ")
    .replace(/,\s*([,.;:!?)])/g, "$1")
    .replace(/^[,\s]+/, "");
}

export function stripRefs(text: string): string {
  return (
    stripDashes(text)
      // "(C1, C2 and C11)", "[X3]", "(see C4)"
      .replace(new RegExp(`\\s*[([]\\s*(?:see|e\\.g\\.,?|per|via|cf\\.)?\\s*${LIST}\\s*[)\\]]`, "gi"), "")
      // "Assumption A2 fails" → "This assumption fails"; "claims C3 and C4" → "these claims"
      .replace(new RegExp(`\\b(claim|challenge|assumption|source)(s?)\\s+${LIST}\\b`, "gi"), (_m, noun: string, plural: string) =>
        `${plural ? "these" : "this"} ${noun.toLowerCase()}${plural}`,
      )
      // Anything left is an ID used as a word: "so X4 weakens urgency".
      .replace(new RegExp(`\\b${LIST}\\b`, "g"), (m) => NOUN[m[0]])
      .replace(/\s+([,.;:!?)])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase())
      .trim()
  );
}

/**
 * The claims behind any mix of record IDs: claims themselves, the claims a challenge rests
 * on, an assumption's support and its re-evaluation, and the claims drawn from a source.
 */
export function claimsBehind(project: ResearchProject, ids: string[]): string[] {
  const out = new Set<string>();
  const claims = project.research?.claims ?? [];
  const add = (list: string[] = []) => list.forEach((id) => out.add(id));
  for (const id of ids) {
    if (id[0] === "C") out.add(id);
    if (id[0] === "X") add(project.stress_test?.challenges.find((x) => x.id === id)?.claim_ids);
    if (id[0] === "A") {
      add(project.thesis?.assumptions.find((a) => a.id === id)?.supporting_claim_ids);
      add(project.reevaluation?.assessments.find((a) => a.assumption_id === id)?.claim_ids);
    }
    if (id[0] === "S") add(claims.filter((c) => c.source_ids.includes(id)).map((c) => c.id));
  }
  const known = new Set(claims.map((c) => c.id));
  return [...out].filter((id) => known.has(id)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}
