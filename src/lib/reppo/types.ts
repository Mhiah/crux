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
};
