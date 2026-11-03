"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ResearchProject } from "@/lib/types";
import type { ReppoReview } from "@/lib/reppo/types";

/** Reppo review is optional: users must opt in to submitting their research. */
export function ReppoReviewPanel({ project, available }: { project: ResearchProject; available: boolean }) {
  const router = useRouter();
  const [review, setReview] = useState<ReppoReview | null>(project.reppo ?? null);
  const [consent, setConsent] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
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
  // Without server storage (e.g. production) a review can't be requested, so show nothing.
  if (project.mode !== "live" || project.status !== "complete" || (!available && !review)) return null;

  const improved = project.revisions?.at(-1);
  async function improve() {
    if (!accessToken.trim()) { setError("Enter the review access key."); return; }
    setBusy(true); setError(null); setWarning(null);
    try {
      const response = await fetch("/api/research/" + project.id + "/revise", {
        method: "POST", headers: { "x-crux-review-token": accessToken },
      });
      const data = await response.json() as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error ?? "Improving the report failed.");
      router.push("/research/" + data.id + "#after-review");
    } catch (err) { setError(err instanceof Error ? err.message : "Improving the report failed."); setBusy(false); }
  }

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
      <p className="mt-2 text-sm text-muted">Powered by Reppo. An independent evaluation of the research and its reasoning, not proof that every fact is correct.</p>
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
          {review.status === "settled" && review.critiques.length > 0 && (
            <div className="border-t border-line pt-3">
              {improved ? (
                <a href={"/research/" + improved + "#after-review"} className="inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
                  Open the improved report →
                </a>
              ) : (
                <>
                  <p className="text-muted">Crux can learn from these critiques: it runs a focused search for each one, checks the new facts against their sources, and revises the answer. The original report stays as it is. Uses SERV and Tavily credits and takes about a minute.</p>
                  <button type="button" className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40" disabled={busy || !accessToken.trim()} onClick={() => void improve()}>
                    {busy ? "Improving… about a minute" : "Improve with this feedback"}
                  </button>
                </>
              )}
            </div>
          )}
          {review.status === "pending" && review.checked_at && (
            <p className="text-muted" role="status">
              Last checked {new Date(review.checked_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              {review.reppo_status ? `. Reppo says: ${review.reppo_status}` : ""}. No verdict yet; Reppo&apos;s evaluators can take longer than 10 minutes, so check again later.
            </p>
          )}
          {review.status === "pending" && <button type="button" className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface disabled:opacity-50" disabled={busy || !accessToken.trim()} onClick={() => void refresh()}>{busy ? "Checking…" : "Check for verdict"}</button>}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I agree to send a concise research and evidence trace to Reppo for external review. The submission may be visible to Reppo network participants; do not submit confidential information.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40" disabled={!consent || !accessToken.trim() || busy} onClick={() => void submit()}>
              {busy ? "Working…" : "Request Reppo review"}
            </button>
          </div>
        </div>
      ))}
      {warning && <p className="mt-3 text-sm text-muted" role="status">{warning}</p>}
      {error && <p className="mt-3 text-sm text-bad" role="alert">{error}</p>}
    </section>
  );
}
