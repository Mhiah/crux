import { afterEach, describe, expect, it } from "vitest";
import { authorizedReview } from "../src/lib/reppo/access";
const previous = process.env.CRUX_REVIEW_ACCESS_TOKEN;
afterEach(() => {
  if (previous === undefined) delete process.env.CRUX_REVIEW_ACCESS_TOKEN;
  else process.env.CRUX_REVIEW_ACCESS_TOKEN = previous;
});
describe("Reppo review owner authorization", () => {
  it("denies requests when token is not configured", () => {
    delete process.env.CRUX_REVIEW_ACCESS_TOKEN;
    expect(authorizedReview(new Request("https://example.test"))).toBe(false);
  });
  it("denies missing, short and incorrect credentials", () => {
    process.env.CRUX_REVIEW_ACCESS_TOKEN = "long-secret-owner-token-12345";
    expect(authorizedReview(new Request("https://example.test"))).toBe(false);
    expect(authorizedReview(new Request("https://example.test", {
      headers: { "x-crux-review-token": "short" },
    }))).toBe(false);
    process.env.CRUX_REVIEW_ACCESS_TOKEN = "short";
    expect(authorizedReview(new Request("https://example.test", {
      headers: { "x-crux-review-token": "short" },
    }))).toBe(false);
  });
  it("accepts the exact owner token", () => {
    process.env.CRUX_REVIEW_ACCESS_TOKEN = "long-secret-owner-token-12345";
    expect(authorizedReview(new Request("https://example.test", {
      headers: { "x-crux-review-token": "long-secret-owner-token-12345" },
    }))).toBe(true);
  });
});
