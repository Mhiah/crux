/** An external verdict is feedback, never a factual guarantee. */
export type ReppoDecision = "accept" | "revise" | "reject";
export type ReppoReview = {
  eval_id: string;
  status: "pending" | "settled";
  submitted_at: string;
  checked_at?: string;
  decision?: ReppoDecision;
  score?: number;
  confidence?: "low" | "medium" | "high";
  route?: string;
  critiques: { dimension: string; critique: string; score?: number }[];
  peer_assessment_count?: number;
  /** Reppo's own status word from the last check (e.g. "pending"), shown so a slow review is visible. */
  reppo_status?: string;
  /** When Reppo says it's finished but the verdict can't be read: the field names it sent. */
  unread_fields?: string[];
};
