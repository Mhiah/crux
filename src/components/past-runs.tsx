import Link from "next/link";
import type { ProjectSummary } from "@/lib/store";
import { Badge, ConfidenceBadge, THESIS_TONE } from "./badges";

/** Recent runs, newest first, each linking to its saved report. */
export function PastRuns({ runs, error }: { runs: ProjectSummary[]; error?: string }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Past runs</h2>
      {error ? (
        <p className="mt-3 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>
      ) : runs.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No runs yet. Ask a question above to start one.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/research/${r.id}`} className="block p-3 hover:bg-surface">
                <p className="text-sm font-medium">{r.question}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <time dateTime={r.created_at}>
                    {new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
                  </time>
                  {r.status === "failed" && <Badge tone="bad">failed</Badge>}
                  {r.status === "running" && <Badge tone="info">incomplete</Badge>}
                  {r.confidence && <ConfidenceBadge level={r.confidence} />}
                  {r.verdict && <Badge tone={THESIS_TONE[r.verdict]}>thesis {r.verdict}</Badge>}
                  {r.mode === "mock" && <Badge tone="neutral">mock</Badge>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
