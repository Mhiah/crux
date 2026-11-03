import { authorizedReview } from "@/lib/reppo/access";
import { checkReppoConnection } from "@/lib/reppo/diagnostics";
import { checkStorageConnection } from "@/lib/store";

export const runtime = "nodejs";

/** Owner-only, read-only setup check. Never submits or charges an evaluation. */
export async function GET(request: Request) {
  if (!authorizedReview(request)) {
    return Response.json({ error: "Access denied." }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const [reppo, storage] = await Promise.all([
    checkReppoConnection(process.env.REPPO_API_KEY),
    checkStorageConnection(),
  ]);
  return Response.json({ reppo, storage }, {
    headers: { "Cache-Control": "no-store" },
  });
}
