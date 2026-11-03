import { loadProject, saveProject, storageAvailable, acquireReviewLock, releaseReviewLock } from "@/lib/store";
import { submitReppo, getReppoReview, ReppoApiError } from "@/lib/reppo/client";
import { inspectReppoPayload } from "@/lib/reppo/payload";
import { authorizedReview } from "@/lib/reppo/access";
import type { ReppoReview } from "@/lib/reppo/types";

const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Disabled by default so anonymous traffic cannot incur evaluation charges. */
const reviewEnabled = () => process.env.REPPO_REVIEW_ENABLED === "1" && Boolean(process.env.REPPO_API_KEY);

/** Explicit opt-in: submitted research may be viewed by members of Reppo's network. */
export async function POST(req: Request, ctx: RouteContext<"/api/research/[id]/review">) {
  if (!authorizedReview(req)) return reply({ error: "Review access denied." }, 403);
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
    const preflight = inspectReppoPayload(project);
    console.info("Reppo submission size:", {
      payload_bytes: preflight.payload_bytes,
      request_bytes: preflight.request_bytes,
    });
    const evalId = await submitReppo(project, process.env.REPPO_API_KEY!);
    const review: ReppoReview = {
      eval_id: evalId, status: "pending", submitted_at: new Date().toISOString(), critiques: [],
    };
    project.reppo = review;
    await saveProject(project);
    return reply({ review }, 201);
  } catch (error) {
    if (error instanceof ReppoApiError) {
      console.error("Reppo rejected request:", { status: error.status, reason: error.reason ?? "No detail provided" });
      return reply({
        error: "Reppo returned HTTP " + error.status +
          (error.reason ? ": " + error.reason : ".": ". See runtime logs."),
      }, 502);
    }
    console.error("Reppo submission failed:", error instanceof Error ? error.message : "Unexpected error");
    return reply({ error: "Unable to submit to Reppo. Inspect logs before retrying." }, 502);
  } finally {
    await releaseReviewLock(id).catch((error) => console.error("Could not release review lock:", error));
  }
}

/** User-triggered refresh; never block the original SERV research request. */
export async function GET(req: Request, ctx: RouteContext<"/api/research/[id]/review">) {
  if (!authorizedReview(req)) return reply({ error: "Review access denied." }, 403);
  const { id } = await ctx.params;
  const project = await loadProject(id).catch(() => null);
  if (!project) return reply({ error: "Report not found." }, 404);
  if (new URL(req.url).searchParams.get("preflight") === "1") {
    try {
      return reply({ diagnostics: inspectReppoPayload(project), existing_review: Boolean(project.reppo) });
    } catch (err) {
      return reply({ error: err instanceof Error ? err.message : "Invalid report." }, 422);
    }
  }
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
