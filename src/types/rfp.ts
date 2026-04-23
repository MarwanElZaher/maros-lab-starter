export type Decision = "GO" | "CONDITIONAL GO" | "NO-GO";

export type OverrideDecision = "none" | "go_full" | "go_scoped" | "no_go_confirmed";

export interface OverrideFields {
  overrideDecision: OverrideDecision;
  overrideScope?: string | null;
  overrideRationale?: string | null;
  overrideByUserEmail?: string | null;
  overrideAt?: string | null;
  citedAnalysisIds?: string[];
}

export interface RedFlag {
  severity: "critical" | "high" | "medium" | "low";
  description: string;
}

export interface SimilarBid {
  title: string;
  outcome: "won" | "lost" | "withdrawn";
  relevance: string;
}

export interface RfpReport {
  decision: Decision;
  confidence: number;
  justifications: string[];
  redFlags: RedFlag[];
  similarBids: SimilarBid[];
  rfpId?: string;
}
