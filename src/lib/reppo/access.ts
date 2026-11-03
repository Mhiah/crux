import { timingSafeEqual } from "node:crypto";

/** Owner-only evaluation control for the S2 pilot. Replace with account auth before public launch. */
export function authorizedReview(request: Request): boolean {
  const expected = process.env.CRUX_REVIEW_ACCESS_TOKEN;
  const provided = request.headers.get("x-crux-review-token");
  if (!expected || !provided || expected.length < 24) return false;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
