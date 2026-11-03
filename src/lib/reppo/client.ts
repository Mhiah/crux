import type { ResearchProject } from "../types";
import { buildReppoPayload } from "./payload";
import type { ReppoDecision, ReppoReview } from "./types";

const BASE = "https://eval.reppo.xyz/api/v1/agents/eval-requests";
type Fetcher = typeof fetch;
const obj = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** Bounded upstream validation errors only; never include request contents or authorization values. */
export class ReppoApiError extends Error {
  constructor(readonly status: number, readonly reason?: string) {
    super("Reppo returned HTTP " + status + (reason ? ": " + reason : ""));
    this.name = "ReppoApiError";
  }
}
function safeReason(body: unknown): string | undefined {
  const value = obj(body);
  const error = obj(value.error);
  const candidate = [value.message, value.error, error.message, value.detail]
    .find((item) => typeof item === "string");
  if (typeof candidate !== "string") return undefined;
  const message = candidate.replace(/[\\r\\n\\t]/g, " ").trim();
  if (!message || message.length > 180 || /authorization|bearer|api[_ -]?key|password|sk-[a-z0-9]/i.test(message)) return undefined;
  return message;
}

async function send(path: string, key: string, init: RequestInit, transport: Fetcher): Promise<Record<string, unknown>> {
  if (!key) throw new Error("Reppo API key is missing.");
  const response = await transport(BASE + path, {
    ...init,
    headers: { Authorization: "Bearer " + key, Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ReppoApiError(response.status, safeReason(body));
  }
  return obj(await response.json());
}

export async function submitReppo(project: ResearchProject, key: string, transport: Fetcher = fetch): Promise<string> {
  const result = await send("/submit", key, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildReppoPayload(project)),
  }, transport);
  const id = str(result.evalId) ?? str(result.eval_id) ?? str(result.id)
    ?? str(obj(result.data).evalId) ?? str(obj(result.evalRequest).id);
  if (!id || !/^[\w-]{3,160}$/.test(id)) throw new Error("Reppo returned no usable evaluation ID.");
  return id;
}

export function normalizeReppoResponse(body: Record<string, unknown>, previous: ReppoReview): ReppoReview {
  const data = Object.keys(obj(body.data)).length ? obj(body.data) : body;
  const verdict = obj(data.verdict);
  const action = obj(data.action);
  const choice = str(verdict.decision)?.toLowerCase();
  const decision = (["accept", "revise", "reject"] as const).find((x) => x === choice) as ReppoDecision | undefined;
  const confidence = (["low", "medium", "high"] as const).find((x) => x === str(verdict.confidence)?.toLowerCase());
  const critiques = (Array.isArray(data.verdicts) ? data.verdicts : []).map(obj).map((v, index) => ({
    dimension: str(v.dimension) ?? str(v.name) ?? ("Criterion " + (index + 1)),
    critique: str(v.critique) ?? str(v.rationale) ?? "No written critique returned.",
    ...(num(v.score) !== undefined ? { score: num(v.score) } : {}),
  }));
  const mainCritique = str(verdict.critique) ?? str(verdict.rationale);
  if (!critiques.length && mainCritique) critiques.push({ dimension: "Overall", critique: mainCritique });
  return {
    ...previous,
    checked_at: new Date().toISOString(),
    status: decision ? "settled" : "pending",
    ...(decision ? { decision } : {}),
    ...(num(verdict.score) !== undefined ? { score: num(verdict.score) } : {}),
    ...(confidence ? { confidence } : {}),
    ...(str(action.route) ? { route: str(action.route) } : {}),
    critiques: critiques.length ? critiques : previous.critiques,
    ...(num(data.peerAssessmentCount) !== undefined ? { peer_assessment_count: num(data.peerAssessmentCount) } : {}),
  };
}

export async function getReppoReview(previous: ReppoReview, key: string, transport: Fetcher = fetch): Promise<ReppoReview> {
  const response = await send("/" + encodeURIComponent(previous.eval_id), key, {}, transport);
  return normalizeReppoResponse(response, previous);
}
