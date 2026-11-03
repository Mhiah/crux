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
  const message = candidate.replace(/[\r\n\t]/g, " ").trim();
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

// Reppo's settled replies have used different field names; read every likely one.
const SETTLED_WORDS = /^(settled|complete|completed|done|finished|finalized|finalised|resolved|closed)$/i;
const DECISIONS: Record<string, ReppoDecision> = {
  accept: "accept", accepted: "accept", approve: "accept", approved: "accept", pass: "accept", passed: "accept",
  revise: "revise", revision: "revise", needs_revision: "revise", "needs revision": "revise", revise_and_resubmit: "revise",
  reject: "reject", rejected: "reject", fail: "reject", failed: "reject",
};
const first = <T,>(...values: (T | undefined)[]) => values.find((v) => v !== undefined);
const text = (v: Record<string, unknown>, keys: string[]) => first(...keys.map((k) => str(v[k])))?.trim() || undefined;

/** Field names (never values) of Reppo's reply, two levels deep, shown when a settled verdict can't be read. */
function fieldNames(data: Record<string, unknown>): string[] {
  return Object.entries(data).slice(0, 25).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}[${Object.keys(obj(v[0])).slice(0, 8).join(", ")}]`;
    const inner = Object.keys(obj(v));
    return inner.length ? `${k}{${inner.slice(0, 10).join(", ")}}` : k;
  });
}

export function normalizeReppoResponse(body: Record<string, unknown>, previous: ReppoReview): ReppoReview {
  const data = Object.keys(obj(body.data)).length ? obj(body.data) : body;
  const result = obj(data.result);
  const verdict = Object.keys(obj(data.verdict)).length ? obj(data.verdict) : Object.keys(obj(result.verdict)).length ? obj(result.verdict) : result;
  const action = obj(data.action);
  const reppoStatus = (str(data.status) ?? str(data.state) ?? str(result.status))?.slice(0, 40);

  const choice = first(text(verdict, ["decision", "outcome", "result", "verdict", "label"]), text(data, ["decision", "outcome"]), str(data.verdict))?.toLowerCase();
  const decision = choice ? DECISIONS[choice] : undefined;
  const confidence = (["low", "medium", "high"] as const).find((x) => x === (text(verdict, ["confidence"]) ?? text(data, ["confidence"]))?.toLowerCase());
  const score = first(...["score", "finalScore", "final_score", "averageScore", "avgScore", "overallScore"].map((k) => num(verdict[k]) ?? num(data[k])));

  const lists = ["verdicts", "critiques", "assessments", "peerAssessments", "results", "criteria", "dimensions", "evaluations", "feedback"];
  const items = first(...lists.map((k) => (Array.isArray(data[k]) ? data[k] : Array.isArray(verdict[k]) ? verdict[k] : undefined) as unknown[] | undefined)) ?? [];
  const critiques = items.map(obj).map((v, index) => ({
    dimension: text(v, ["dimension", "criterion", "name", "title", "label"]) ?? "Reviewer " + (index + 1),
    critique: text(v, ["critique", "rationale", "feedback", "comment", "reasoning", "explanation", "summary", "text"]) ?? "No written critique returned.",
    ...(num(v.score) !== undefined ? { score: num(v.score) } : {}),
  })).filter((c) => c.critique !== "No written critique returned." || c.score !== undefined);
  const mainCritique = text(verdict, ["critique", "rationale", "feedback", "summary", "reasoning", "explanation"]) ?? text(data, ["critique", "rationale", "feedback", "summary"]);
  if (!critiques.length && mainCritique) critiques.push({ dimension: "Overall", critique: mainCritique });

  // Reppo saying it has finished is enough to stop waiting, even if the verdict's shape is new.
  const settled = Boolean(decision) || (reppoStatus !== undefined && SETTLED_WORDS.test(reppoStatus));
  const unread = settled && !decision && !critiques.length;
  return {
    ...previous,
    checked_at: new Date().toISOString(),
    status: settled ? "settled" : "pending",
    ...(decision ? { decision } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(confidence ? { confidence } : {}),
    ...(str(action.route) ? { route: str(action.route) } : {}),
    critiques: critiques.length ? critiques : previous.critiques,
    ...(num(data.peerAssessmentCount) !== undefined ? { peer_assessment_count: num(data.peerAssessmentCount) } : {}),
    ...(reppoStatus ? { reppo_status: reppoStatus } : {}),
    ...(unread ? { unread_fields: fieldNames(data) } : { unread_fields: undefined }),
  };
}

export async function getReppoReview(previous: ReppoReview, key: string, transport: Fetcher = fetch): Promise<ReppoReview> {
  const response = await send("/" + encodeURIComponent(previous.eval_id), key, {}, transport);
  // Field names and status only, never the review's contents, so an unexpected shape can be diagnosed.
  const data = Object.keys(obj(response.data)).length ? obj(response.data) : response;
  console.info("Reppo verdict check:", {
    keys: Object.keys(data).slice(0, 20),
    verdict_keys: Object.keys(obj(data.verdict)).slice(0, 20),
    status: str(data.status) ?? str(data.state) ?? null,
  });
  return normalizeReppoResponse(response, previous);
}
