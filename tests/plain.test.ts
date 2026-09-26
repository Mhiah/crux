import { describe, expect, it } from "vitest";
import { refsIn, stripRefs } from "../src/lib/plain";

describe("stripRefs", () => {
  it.each([
    // Real sentences from saved runs.
    ["The pain is real and well evidenced (C1, C2, C11).", "The pain is real and well evidenced."],
    [
      "Transaction-based lending (C12) is an early pilot, not yet a substitute at scale, so X4 weakens urgency without removing the need.",
      "Transaction-based lending is an early pilot, not yet a substitute at scale, so the stress test weakens urgency without removing the need.",
    ],
    ["the stress test correctly notes there is no direct evidence (X1, X6, X7, X8).", "The stress test correctly notes there is no direct evidence."],
    ["Assumption A2 fails because claims C3 and C4 show low willingness to pay.", "This assumption fails because these claims show low willingness to pay."],
    ["Pricing is thin [C9] and competition is crowded (see C6).", "Pricing is thin and competition is crowded."],
    ["X2 shows the market is small.", "The stress test shows the market is small."],
    ["Adoption barriers weaken the broad SME assumption (C21; X3).", "Adoption barriers weaken the broad SME assumption."],
    ["Nothing to remove here, 2025 figures and A-grade sources included.", "Nothing to remove here, 2025 figures and A-grade sources included."],
  ])("%s", (input, expected) => {
    expect(stripRefs(input)).toBe(expected);
  });
});

describe("stripDashes (via stripRefs)", () => {
  it.each([
    ["Yes—there is enough evidence to support launching.", "Yes, there is enough evidence to support launching."],
    ["The market — especially micro firms — is price-sensitive.", "The market, especially micro firms, is price-sensitive."],
    ["Interview 15–20 owners across 3–4 sectors.", "Interview 15-20 owners across 3-4 sectors."],
    ["The UK–Nigeria corridor is large – but crowded.", "The UK-Nigeria corridor is large, but crowded."],
    ["It survived — .", "It survived."],
    ["Well-known, low-cost tools stay hyphenated.", "Well-known, low-cost tools stay hyphenated."],
  ])("%s", (input, expected) => {
    expect(stripRefs(input)).toBe(expected);
  });
});

describe("refsIn", () => {
  it("finds each cited ID once, in order", () => {
    expect(refsIn("evidenced (C1, C2), so X4 weakens A2; see C1")).toEqual(["C1", "C2", "X4", "A2"]);
    expect(refsIn("no ids in 2025, COVID-19 or A-grade")).toEqual([]);
  });
});
