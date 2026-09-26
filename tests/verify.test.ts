import { describe, expect, it } from "vitest";
import { numbersIn, quoteFound, unmatchedNumbers } from "../src/lib/research/verify";

const SOURCE =
  "Illustrative data. In a survey of 1,200 small businesses, 68% said they still keep records in paper ledgers or notebooks. [...] Mobile data prices rose in 2025 — and intermittent connectivity remains common.";

describe("quoteFound", () => {
  it("accepts exact quotes regardless of case, spacing, curly quotes and dashes", () => {
    expect(quoteFound("68% said they still keep records in paper ledgers or notebooks", SOURCE)).toBe(true);
    expect(quoteFound("  IN A SURVEY OF 1,200   small businesses ", SOURCE)).toBe(true);
    expect(quoteFound("Mobile data prices rose in 2025 - and intermittent connectivity", SOURCE)).toBe(true);
  });

  it("accepts ellipses that skip words, only in order", () => {
    expect(quoteFound("In a survey of 1,200 small businesses ... paper ledgers or notebooks", SOURCE)).toBe(true);
    expect(quoteFound("paper ledgers or notebooks … In a survey of 1,200 small businesses", SOURCE)).toBe(false);
  });

  it("rejects paraphrases, changed figures and quotes too short to mean anything", () => {
    expect(quoteFound("68% said they keep paper records", SOURCE)).toBe(false);
    expect(quoteFound("78% said they still keep records in paper ledgers or notebooks", SOURCE)).toBe(false);
    expect(quoteFound("68% said", SOURCE)).toBe(false);
    expect(quoteFound("small businesses ... 68%", SOURCE)).toBe(false);
    expect(quoteFound("", SOURCE)).toBe(false);
  });
});

describe("figures", () => {
  it("reads figures without thousands separators or trailing zeros", () => {
    expect([...numbersIn("₦3,000 a month, 45.2% CAGR, 2.0x, 1,200 firms in 2025")]).toEqual(["3000", "45.2", "2", "1200", "2025"]);
  });

  it("lists claim figures that no quote contains", () => {
    expect(unmatchedNumbers("68% of 1,200 firms", ["In a survey of 1,200 small businesses, 68% said"])).toEqual([]);
    expect(unmatchedNumbers("80% of 1200 firms in 2026", ["In a survey of 1,200 small businesses, 68% said"])).toEqual(["80", "2026"]);
    expect(unmatchedNumbers("Two startups raised seed rounds", ["Two startups raised seed rounds"])).toEqual([]);
  });
});
