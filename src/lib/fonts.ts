import { Outfit } from "next/font/google";

/** The wordmark's letters: Outfit Light (R, U) and Bold (X), loaded only for the logo. */
export const outfit = Outfit({ subsets: ["latin"], weight: ["300", "700"], display: "swap" });
