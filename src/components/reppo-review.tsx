"use client";

import { useState } from "react";
import type { ResearchProject } from "@/lib/types";
import type { ReppoReview } from "@/lib/reppo/types";

/** Reppo review is optional: users must opt in to submitting their research. */
export function ReppoReviewPanel({ project, available }: { project: ResearchProject; available: boolean }) {
  const [review, setReview] = useState<ReppoReview | null>(project.reppo ?? null);
  const [consent, setConsent] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<string | null>(null);
  const path = "/api/research/" + project.id + "/review";

  async function refresh() {
    if (!accessToken.trim()) { setError("Enter the review access key."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(path, { cache: "no-store", headers: { "x-crux-review-token": accessToken } });
      const data = await response.json() as { review?: ReppoReview | null; error?: string; warning?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to load review.");
      setReview(data.review ?? null);
      setWarning(data.warning ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "Review refresh failed."); }
    finally { setBusy(false); }
  }
  async function checkRequest() {
    if (!accessToken.trim()) { setError("Enter the owner access key."); return; }
    setBusy(true); setError(null); setPreflight(null);
    try {
      const response = await fetch(path + "?preflight=1", {
        cache: "no-store", headers: { "x-crux-review-token": accessToken },
      });
      const data = await response.json() as {
        diagnostics?: { payload_bytes: number; max_payload_bytes: number; criteria_count: number };
        error?: string;
        existing_review?: boolean;
      };
      if (!response.ok || !data.diagnostics) throw new Error(data.error ?? "Request check failed.");
      setPreflight(
        "Request prepared: " + data.diagnostics.payload_bytes.toLocaleString() +
        " bytes (limit " + data.diagnostics.max_payload_bytes.toLocaleString() +
        "). Criteria included: " + data.diagnostics.criteria_count + ". No evaluation submitted." +
        (data.existing_review ? " A review is already stored for this report." : "")
      );
    } catch (err) { setError(err instanceof Error ? err.message : "Request check failed."); }
    finally { setBusy(false); }
  }

  // Without server storage (e.g. production) a review can't be requested, so show nothing.
  if (project.mode !== "live" || project.status !== "complete" || (!available && !review)) return null;

  async function submit() {
    if (!consent || !available) return;
    if (!accessToken.trim()) { setError("Enter the review access key."); return; }
    setBusy(true); setError(null); setWarning(null);
    try {
      const response = await fetch(path, {
        method: "POST", headers: { "Content-Type": "application/json", "x-crux-review-token": accessToken },
        body: JSON.stringify({ consent: true }),
      });
      const data = await response.json() as { review?: ReppoReview; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Reppo submission failed.");
      setReview(data.review ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "Reppo submission failed."); }
    finally { setBusy(false); }
  }
  return (
    <section id="independent-review" className="mt-6 scroll-mt-24 rounded-xl border border-line p-4 sm:p-5" aria-label="Independent research review">
      <h2 className="text-lg font-semibold">Independent review</h2>
      <p className="mt-2 text-sm text-muted">Powered by Reppo. An independent evaluation of the research and its reasoning—not proof that every fact is correct.</p>
      {!available ? (
        <p className="mt-3 text-sm text-muted">This report was not saved on the server. Enable durable storage to request an external review.</p>
      ) : (
        <label className="mt-3 block max-w-sm text-sm">
          <span className="text-muted">Owner review access key</span>
          <input type="password" autoComplete="off" value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2"
            placeholder="Enter review key" />
        </label>
      )}
      {available && (review ? (
        <div className="mt-4 space-y-2 text-sm">
          <p><strong>Status:</strong> {review.status === "pending" ? "Awaiting review (minimum 10-minute settlement)" : "Settled"}</p>
          {review.decision && <p><strong>Decision:</strong> {review.decision}{review.score !== undefined ? " · score " + review.score + "/100" : ""}{review.confidence ? " · " + review.confidence + " confidence" : ""}</p>}
          {review.route && <p><strong>Suggested action:</strong> {review.route}</p>}
          {review.critiques.map((c, i) => <div key={i} className="border-t border-line pt-2"><strong>{c.dimension}</strong><p className="mt-1 text-muted">{c.critique}</p></div>)}
          {review.status === "pending" && <button type="button" className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface disabled:opacity-50" disabled={busy || !accessToken.trim()} onClick={() => void refresh()}>{busy ? "Checking…" : "Check for verdict"}</button>}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I agree to send a concise research and evidence trace to Reppo for external review. The submission may be visible to Reppo network participants; do not submit confidential information.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-40" disabled={!accessToken.trim() || busy} onClick={() => void checkRequest()}>
              {busy ? "Checking…" : "Check request (no charge)"}
            </button>
            <button type="button" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40" disabled={!consent || !accessToken.trim() || busy} onClick={() => void submit()}>
              {busy ? "Working…" : "Request Reppo review"}
            </button>
          </div>
        </div>
      ))}
      {preflight && <p className="mt-3 text-sm text-muted" role="status">{preflight}</p>}
      {warning && <p className="mt-3 text-sm text-muted" role="status">{warning}</p>}
      {error && <p className="mt-3 text-sm text-bad" role="alert">{error}</p>}
    </section>
  );
}
