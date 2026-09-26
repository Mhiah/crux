import type { ReactNode } from "react";
import type { Confidence, Reevaluation } from "@/lib/types";

/**
 * Status badges shared by server and client components. Deliberately not "use client":
 * a server component importing a plain value (like THESIS_TONE) from a client module gets
 * a reference stub instead of the object, so these live in a neutral module.
 */

export type Tone = "good" | "warn" | "bad" | "neutral" | "info";

const TONE: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-surface text-muted",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[tone]}`}>{children}</span>;
}

export const THESIS_TONE: Record<Reevaluation["thesis_verdict"], Tone> = { strengthened: "good", survived: "good", weakened: "warn", overturned: "bad" };

const CONFIDENCE_TONE: Record<Confidence, Tone> = { high: "good", medium: "warn", low: "bad" };

export function ConfidenceBadge({ level }: { level: Confidence }) {
  return <Badge tone={CONFIDENCE_TONE[level]}>{level} confidence</Badge>;
}
