import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResearchProject } from "./types";

/** Local JSON in development; durable Upstash Redis REST in Vercel Preview.
 * The Vercel Marketplace integration creates KV_REST_API_* variable names,
 * whereas direct Upstash accounts use UPSTASH_REDIS_REST_*.
 * Choose a complete pair; never mix a URL from one provider with another token.
 */
const directUrl = process.env.UPSTASH_REDIS_REST_URL;
const directToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const integratedUrl = process.env.KV_REST_API_URL;
const integratedToken = process.env.KV_REST_API_TOKEN;
const directConfigured = Boolean(directUrl && directToken);
const redisUrl = directConfigured ? directUrl : integratedUrl;
const redisToken = directConfigured ? directToken : integratedToken;
const useRedis = Boolean(redisUrl && redisToken);
export const storageAvailable = useRedis || !process.env.VERCEL || Boolean(process.env.CRUX_DATA_DIR);
const DATA_DIR = process.env.CRUX_DATA_DIR || path.join(process.cwd(), ".data", "projects");
const localLocks = new Set<string>();
function valid(id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid project ID.");
  return id;
}
const file = (id: string) => path.join(DATA_DIR, valid(id) + ".json");
const key = (id: string) => "crux:s2:project:" + valid(id);

async function redis<T>(args: Array<string | number>): Promise<T> {
  if (!redisUrl || !redisToken) throw new Error("Redis not configured.");
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: { Authorization: "Bearer " + redisToken, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Storage returned HTTP " + response.status);
  const body = await response.json() as { result?: T; error?: string };
  if (body.error) throw new Error(body.error);
  return body.result as T;
}

export async function saveProject(project: ResearchProject): Promise<void> {
  if (useRedis) {
    await redis(["SET", key(project.id), JSON.stringify(project), "EX", 90 * 24 * 60 * 60]);
    return;
  }
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(file(project.id), JSON.stringify(project, null, 2));
}
export async function loadProject(id: string): Promise<ResearchProject | null> {
  if (useRedis) {
    const content = await redis<string | null>(["GET", key(id)]);
    return content ? JSON.parse(content) as ResearchProject : null;
  }
  try { return JSON.parse(await readFile(file(id), "utf8")) as ResearchProject; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Guard against two submits for the same run. Global limits still apply at Reppo. */
export async function acquireReviewLock(id: string): Promise<boolean> {
  valid(id);
  if (useRedis) {
    return (await redis<string | null>(["SET", "crux:s2:reviewlock:" + id, "busy", "NX", "EX", 90])) === "OK";
  }
  if (localLocks.has(id)) return false;
  localLocks.add(id);
  return true;
}
export async function releaseReviewLock(id: string): Promise<void> {
  valid(id);
  if (useRedis) await redis(["DEL", "crux:s2:reviewlock:" + id]);
  else localLocks.delete(id);
}


const localCounts = new Map<string, number>();
/**
 * Adds `by` (default one) to a usage counter and returns the new count. The counter expires after `ttlSeconds`
 * (set when it is first created), so daily allowances reset on their own.
 */
export async function countUse(name: string, ttlSeconds: number, by = 1): Promise<number> {
  if (useRedis) {
    const count = await redis<number>(["INCRBY", name, by]);
    if (count === by) await redis(["EXPIRE", name, ttlSeconds]);
    return count;
  }
  const count = (localCounts.get(name) ?? 0) + by;
  localCounts.set(name, count);
  return count;
}

/** Read-only Redis health probe: PING uses no project data and writes no keys. */
export async function checkStorageConnection(): Promise<"connected" | "missing" | "unreachable"> {
  if (!useRedis) return "missing";
  try {
    return (await redis<string>(["PING"])) === "PONG" ? "connected" : "unreachable";
  } catch {
    return "unreachable";
  }
}
