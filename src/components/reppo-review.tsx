"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResearchProject } from "@/lib/types";
import type { ReppoReview } from "@/lib/reppo/types";

/** Reppo review is optional: users must opt in to submitting their research. */
export function ReppoReviewPanel({ project, available }: { project: ResearchProject; available: boolean }) {
  const [review, setReview] = useState<ReppoReview | null>(project.reppo ?? null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const path = "/api/research/" + project.id + "/review";

  const refresh = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(path, { cache: "no-store" });
      const data = await response.json() as { review?: ReppoReview | null; error?: string; warning?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to load review.");
      setReview(data.review ?? null);
      setWarning(data.warning ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "Review refresh failed."); }
    finally { setBusy(false); }
  }, [path]);

  useEffect(() => { if (available) void refresh(); }, [available, refresh]);
  if (project.mode !== "live" || project.status !== "complete") return null;

  async function submit() {
    if (!consent || !available) return;
    setBusy(true); setError(null); setWarning(null);
    try {
      const response = await fetch(path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const data = await response.json() as { review?: ReppoReview; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Reppo submission failed.");
      setReview(data.review ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "Reppo submission failed."); }
    finally { setBusy(false); }
  }
  return (
    <section className="mt-6 rounded-xl border border-line p-4 sm:p-5" aria-label="Independent research review">
      <h2 className="text-lg font-semibold">Independent review</h2>
      <p className="mt-2 text-sm text-muted">Reppo independently evaluates this research. Its verdict is feedback, not proof that every fact is correct.</p>
      {!available ? (
        <p className="mt-3 text-sm text-muted">This report was not saved on the server. Enable durable storage to request an external review.</p>
      ) : review ? (
        <div className="mt-4 space-y-2 text-sm">
          <p><strong>Status:</strong> {review.status === "pending" ? "Awaiting review (minimum 10-minute settlement)" : "Settled"}</p>
          {review.decision && <p><strong>Decision:</strong> {review.decision}{review.score !== undefined ? " · score " + review.score + "/100" : ""}{review.confidence ? " · " + review.confidence + " confidence" : ""}</p>}
          {review.route && <p><strong>Suggested action:</strong> {review.route}</p>}
          {review.critiques.map((c, i) => <div key={i} className="border-t border-line pt-2"><strong>{c.dimension}</strong><p className="mt-1 text-muted">{c.critique}</p></div>)}
          {review.status === "pending" && <button type="button" className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface disabled:opacity-50" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking…" : "Check for verdict"}</button>}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I agree to send a concise research and evidence trace to Reppo for external review. The submission may be visible to Reppo network participants; do not submit confidential information.</span>
          </label>
          <button type="button" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40" disabled={!consent || busy} onClick={() => void submit()}>{busy ? "Submitting…" : "Request Reppo review"}</button>
        </div>
      )}
      {warning && <p className="mt-3 text-sm text-muted" role="status">{warning}</p>}
      {error && <p className="mt-3 text-sm text-bad" role="alert">{error}</p>}
    </section>
  );
}
