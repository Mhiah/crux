import { timingSafeEqual } from "node:crypto";

/** The owner key: required for the connection check, and lets the owner skip the daily review allowances. */
export function authorizedReview(request: Request): boolean {
  const expected = process.env.CRUX_REVIEW_ACCESS_TOKEN;
  const provided = request.headers.get("x-crux-review-token");
  if (!expected || !provided || expected.length < 24) return false;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
