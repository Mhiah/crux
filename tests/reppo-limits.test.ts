import { afterEach, describe, expect, it } from "vitest";
import { allowancesFor, takeAllowance, visitorKey } from "../src/lib/reppo/limits";

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });
const from = (ip: string, headers: Record<string, string> = {}) =>
  new Request("https://example.test", { headers: { "x-forwarded-for": ip + ", 10.0.0.1", ...headers } });

describe("daily review and improvement allowances", () => {
  it("defaults to 3 per visitor and 20 for the whole site, and reads overrides", () => {
    expect(allowancesFor("review")).toEqual({ perVisitor: 3, perDay: 20 });
    process.env.CRUX_IMPROVES_PER_VISITOR = "1";
    process.env.CRUX_IMPROVES_PER_DAY = "nonsense";
    expect(allowancesFor("improve")).toEqual({ perVisitor: 1, perDay: 20 });
  });

  it("stops a visitor after their allowance, without blocking others", async () => {
    const day = new Date("2031-01-01T12:00:00Z");
    for (let i = 0; i < 3; i++) expect(await takeAllowance(from("1.1.1.1"), "review", day)).toBeNull();
    expect(await takeAllowance(from("1.1.1.1"), "review", day)).toMatch(/today's 3 free reviews/);
    expect(await takeAllowance(from("2.2.2.2"), "review", day)).toBeNull();
    // A new day starts fresh.
    expect(await takeAllowance(from("1.1.1.1"), "review", new Date("2031-01-02T00:00:01Z"))).toBeNull();
  });

  it("stops everyone once the site's daily cap is reached", async () => {
    process.env.CRUX_IMPROVES_PER_DAY = "2";
    const day = new Date("2031-02-01T12:00:00Z");
    expect(await takeAllowance(from("3.3.3.1"), "improve", day)).toBeNull();
    expect(await takeAllowance(from("3.3.3.2"), "improve", day)).toBeNull();
    expect(await takeAllowance(from("3.3.3.3"), "improve", day)).toMatch(/limit of 2 improvements for everyone/);
  });

  it("lets the owner key skip the allowances", async () => {
    process.env.CRUX_REVIEW_ACCESS_TOKEN = "long-secret-owner-token-12345";
    process.env.CRUX_REVIEWS_PER_VISITOR = "0";
    const day = new Date("2031-03-01T12:00:00Z");
    expect(await takeAllowance(from("4.4.4.4"), "review", day)).toMatch(/today's 0 free reviews/);
    expect(await takeAllowance(from("4.4.4.4", { "x-crux-review-token": "long-secret-owner-token-12345" }), "review", day)).toBeNull();
  });

  it("identifies visitors by a hash of the first forwarded address, never the address itself", () => {
    const key = visitorKey(from("5.5.5.5"));
    expect(key).toHaveLength(20);
    expect(key).not.toContain("5.5.5.5");
    expect(visitorKey(from("5.5.5.5"))).toBe(key);
    expect(visitorKey(from("6.6.6.6"))).not.toBe(key);
  });
});

describe("refunds", () => {
  it("gives a failed attempt back to the visitor and the site", async () => {
    const { refundAllowance } = await import("../src/lib/reppo/limits");
    process.env.CRUX_REVIEWS_PER_VISITOR = "1";
    process.env.CRUX_REVIEWS_PER_DAY = "1";
    const day = new Date("2031-04-01T12:00:00Z");
    expect(await takeAllowance(from("7.7.7.7"), "review", day)).toBeNull();
    await refundAllowance(from("7.7.7.7"), "review", day);
    expect(await takeAllowance(from("7.7.7.7"), "review", day)).toBeNull();
    expect(await takeAllowance(from("7.7.7.7"), "review", day)).toMatch(/today's 1 free reviews/);
  });
});
