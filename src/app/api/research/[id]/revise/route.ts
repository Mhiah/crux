import { refundAllowance, takeAllowance } from "@/lib/reppo/limits";
import { OutOfCredits } from "@/lib/credits";
import { getProviders } from "@/lib/providers";
import { reviseWithFeedback, revisionBlocker } from "@/lib/revise";
import { acquireReviewLock, loadProject, releaseReviewLock, saveProject, storageAvailable } from "@/lib/store";

// Follow-up searches plus two SERV calls; allow well over the default limit.
export const maxDuration = 300;

const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Improve a report with its independent review's critiques. Open to anyone, within daily
 * allowances, because it spends SERV and Tavily credits. Each report is improved once: asking
 * again returns that revision.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/research/[id]/revise">) {
  if (!storageAvailable) return reply({ error: "Durable storage is required to save an improved report." }, 503);
  const { id } = await ctx.params;
  const locked = await acquireReviewLock(id, maxDuration + 30).catch(() => false);
  if (!locked) return reply({ error: "This report is already being worked on. Try again in a minute." }, 409);
  let allowanceTaken = false;
  try {
    const original = await loadProject(id);
    if (!original) return reply({ error: "Report not found." }, 404);
    if (original.revisions?.length) return reply({ id: original.revisions.at(-1) });
    const blocker = revisionBlocker(original);
    if (blocker) return reply({ error: blocker }, 409);

    const { reasoning, search } = getProviders();
    if (reasoning.mode !== "live" || search.mode !== "live") return reply({ error: "SERV and Tavily keys are needed to improve a report." }, 503);
    const limited = await takeAllowance(req, "improve");
    if (limited) return reply({ error: limited }, 429);
    allowanceTaken = true;
    const revised = await reviseWithFeedback(original, { reasoning, search });
    await saveProject(revised);
    original.revisions = [...(original.revisions ?? []), revised.id];
    await saveProject(original);
    return reply({ id: revised.id }, 201);
  } catch (error) {
    if (allowanceTaken) await refundAllowance(req, "improve");
    if (error instanceof OutOfCredits) return reply({ error: error.message }, 402);
    console.error("Improving the report failed:", error instanceof Error ? error.message : error);
    return reply({ error: error instanceof Error ? error.message : "Improving the report failed." }, 502);
  } finally {
    await releaseReviewLock(id).catch(() => {});
  }
}
