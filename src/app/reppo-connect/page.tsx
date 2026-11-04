"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import type { ReppoConnectionStatus } from "@/lib/reppo/diagnostics";

type Result = {
  reppo: ReppoConnectionStatus;
  storage: "connected" | "missing" | "unreachable";
};
const summary: Record<ReppoConnectionStatus["state"], string> = {
  connected: "Connected. API key accepted.",
  missing: "Missing server-side REPPO_API_KEY.",
  unauthorized: "Reppo did not accept the configured API key.",
  unreachable: "Reppo could not be reached.",
  error: "Reppo returned an unexpected status.",
};
const storageSummary: Record<Result["storage"], string> = {
  connected: "Connected. Redis PING succeeded.",
  missing: "Redis REST variables are missing or incomplete.",
  unreachable: "Redis did not respond successfully.",
};

export default function ReppoConnectionPage() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function check() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/reppo/connection", {
        headers: { "x-crux-review-token": token },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(response.status === 403
        ? "Owner access key was rejected. Check CRUX_REVIEW_ACCESS_TOKEN in Vercel."
        : "Connection check failed (HTTP " + response.status + ").");
      setResult(await response.json() as Result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not run the connection check.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-5 pt-12 pb-20 sm:pt-20">
        <h1 className="text-2xl font-semibold tracking-tight">Season 2 connection check</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          A private test of the Reppo API key and Redis storage. This checks
          authentication and reads Redis status; it does not submit an evaluation,
          alter research, or change the existing dashboard.
        </p>
        <form className="mt-7 space-y-4 rounded-xl border border-line p-5"
          onSubmit={(event) => { event.preventDefault(); void check(); }}>
          <label className="block text-sm">
            <span>Owner access key</span>
            <input type="password" autoComplete="off" spellCheck={false} value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Enter CRUX_REVIEW_ACCESS_TOKEN"
              className="mt-2 w-full rounded-lg border border-line bg-background px-3 py-2" />
          </label>
          <button type="submit" disabled={!token || busy}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40">
            {busy ? "Checking…" : "Check connections"}
          </button>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          {result && <div role="status" className="space-y-3 border-t border-line pt-4 text-sm">
            <p><strong>Reppo:</strong> {summary[result.reppo.state]}
              {result.reppo.http_status ? " (HTTP " + result.reppo.http_status + ")" : ""}
            </p>
            <p><strong>Redis:</strong> {storageSummary[result.storage]}</p>
          </div>}
        </form>
        <p className="mt-4 text-xs text-muted">
          Never paste this key into chat. It stays in this browser tab and is
          sent only to your Crux deployment for authorization.
        </p>
      </main>
    </>
  );
}
