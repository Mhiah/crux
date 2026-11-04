import { connection } from "next/server";
import { storageAvailable } from "@/lib/store";

/**
 * Whether this deployment will run live, for checking a deployment's settings. Reports only
 * whether each variable is set, never its value.
 */
export async function GET() {
  await connection();
  const has = (name: string) => Boolean(process.env[name]?.trim());
  const forceMock = process.env.CRUX_MOCK === "1";
  const live = !forceMock && has("SERV_API_KEY") && has("TAVILY_API_KEY");
  return Response.json({
    mode: live ? "live" : "mock",
    SERV_API_KEY: has("SERV_API_KEY") ? "set" : "missing",
    TAVILY_API_KEY: has("TAVILY_API_KEY") ? "set" : "missing",
    CRUX_MOCK: forceMock ? "on (forces mock mode)" : "off",
    saves_runs: storageAvailable,
    REPPO_REVIEW: process.env.REPPO_REVIEW_ENABLED === "1" && has("REPPO_API_KEY") ? "on" : "off",
    vercel_env: process.env.VERCEL_ENV ?? null,
  });
}
