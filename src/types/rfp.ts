export type Decision = "GO" | "CONDITIONAL GO" | "NO-GO";

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
