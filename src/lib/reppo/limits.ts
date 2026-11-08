import { createHash } from "node:crypto";
import { countUse } from "../store";
import { authorizedReview } from "./access";

/**
 * Anyone can request a Reppo review or improve a report, but each one spends credits (a Reppo
 * evaluation, or SERV and Tavily calls), so both have daily allowances: a few per visitor and a
 * cap for the whole site. Both reset at midnight UTC and can be changed in the deployment's
 * environment variables. The owner key, if sent, skips the allowances.
 */
export type CostlyAction = "review" | "improve";

const DEFAULTS = { perVisitor: 3, perDay: 20 };
const ACTION_WORDS: Record<CostlyAction, string> = { review: "reviews", improve: "improvements" };

function setting(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function allowancesFor(action: CostlyAction) {
  const prefix = "CRUX_" + action.toUpperCase();
  return {
    perVisitor: setting(prefix + "S_PER_VISITOR", DEFAULTS.perVisitor),
    perDay: setting(prefix + "S_PER_DAY", DEFAULTS.perDay),
  };
}

/** A short, salted hash of the visitor's IP address: enough to count uses, never stored as the IP itself. */
export function visitorKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update((process.env.CRUX_LIMIT_SALT ?? "crux-s2") + ":" + ip).digest("hex").slice(0, 20);
}

const TTL = 2 * 24 * 60 * 60;
function counterKeys(request: Request, action: CostlyAction, now: Date): [string, string] {
  const day = now.toISOString().slice(0, 10);
  return [`crux:s2:limit:${action}:${day}:${visitorKey(request)}`, `crux:s2:limit:${action}:${day}:all`];
}

/**
 * Uses one of today's allowances for this action, or returns why it can't. Call it only right
 * before credits are actually spent, after every other check has passed.
 */
export async function takeAllowance(request: Request, action: CostlyAction, now = new Date()): Promise<string | null> {
  if (authorizedReview(request)) return null;
  const { perVisitor, perDay } = allowancesFor(action);
  const words = ACTION_WORDS[action];
  const [mineKey, allKey] = counterKeys(request, action, now);
  const mine = await countUse(mineKey, TTL);
  if (mine > perVisitor) {
    return `You've used today's ${perVisitor} free ${words}. Please try again tomorrow.`;
  }
  const total = await countUse(allKey, TTL);
  if (total > perDay) {
    return `Crux has reached today's limit of ${perDay} ${words} for everyone. Please try again tomorrow.`;
  }
  return null;
}

/** Gives back an allowance taken by `takeAllowance` when the attempt failed before spending anything useful. */
export async function refundAllowance(request: Request, action: CostlyAction, now = new Date()): Promise<void> {
  if (authorizedReview(request)) return;
  for (const key of counterKeys(request, action, now)) await countUse(key, TTL, -1).catch(() => {});
}
