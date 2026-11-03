import { loadProject, saveProject, storageAvailable, acquireReviewLock, releaseReviewLock } from "@/lib/store";
import { submitReppo, getReppoReview } from "@/lib/reppo/client";
import type { ReppoReview } from "@/lib/reppo/types";

const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Disabled by default so anonymous traffic cannot incur evaluation charges. */
const reviewEnabled = () => process.env.REPPO_REVIEW_ENABLED === "1" && Boolean(process.env.REPPO_API_KEY);

/** Explicit opt-in: submitted research may be viewed by members of Reppo's network. */
export async function POST(req: Request, ctx: RouteContext<"/api/research/[id]/review">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null) as { consent?: unknown } | null;
  if (body?.consent !== true) return reply({ error: "Explicit consent is required." }, 400);
  if (!reviewEnabled()) return reply({ error: "Reppo reviews are not enabled on this server." }, 503);
  if (!storageAvailable) return reply({ error: "Durable storage is required for reviews." }, 503);
  const locked = await acquireReviewLock(id).catch(() => false);
  if (!locked) return reply({ error: "A review submission is already in progress." }, 409);
  try {
    const project = await loadProject(id);
    if (!project) return reply({ error: "Report not found." }, 404);
    if (project.reppo) return reply({ review: project.reppo });
    if (project.status !== "complete" || project.mode !== "live") {
      return reply({ error: "Only completed live reports can be reviewed." }, 409);
    }
    const evalId = await submitReppo(project, process.env.REPPO_API_KEY!);
    const review: ReppoReview = {
      eval_id: evalId, status: "pending", submitted_at: new Date().toISOString(), critiques: [],
    };
    project.reppo = review;
    await saveProject(project);
    return reply({ review }, 201);
  } catch (error) {
    console.error("Reppo submission failed:", error);
    return reply({ error: "Unable to submit to Reppo. Check API access, credits, and logs." }, 502);
  } finally {
    await releaseReviewLock(id).catch((error) => console.error("Could not release review lock:", error));
  }
}

/** User-triggered refresh; never block the original SERV research request. */
export async function GET(_req: Request, ctx: RouteContext<"/api/research/[id]/review">) {
  const { id } = await ctx.params;
  const project = await loadProject(id).catch(() => null);
  if (!project) return reply({ error: "Report not found." }, 404);
  if (!project.reppo) return reply({ review: null });
  if (project.reppo.status === "settled") return reply({ review: project.reppo });
  if (!reviewEnabled()) return reply({ review: project.reppo, warning: "Reppo review refresh disabled." });
  try {
    const updated = await getReppoReview(project.reppo, process.env.REPPO_API_KEY!);
    project.reppo = updated;
    await saveProject(project);
    return reply({ review: updated });
  } catch (error) {
    console.error("Reppo verdict refresh failed:", error);
    return reply({ review: project.reppo, warning: "Could not refresh verdict. Last saved status shown." });
  }
}
