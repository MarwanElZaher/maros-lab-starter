import { z } from 'zod';

export const RedFlagSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  description: z.string(),
});

export const SimilarBidSchema = z.object({
  title: z.string(),
  outcome: z.enum(['won', 'lost', 'withdrawn']),
  relevance: z.string(),
});

export const RecommendationSchema = z.object({
  decision: z.enum(['GO', 'CONDITIONAL GO', 'NO-GO']),
  confidence: z.number().int().min(0).max(100),
  justifications: z.array(z.string()).min(3).max(5),
  redFlags: z.array(RedFlagSchema),
  similarBids: z.array(SimilarBidSchema).min(0).max(3),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

export const RequirementsSchema = z.object({
  requirements: z.array(z.string()),
  buyerName: z.string(),
  deadline: z.string().optional(),
  budget: z.string().optional(),
  summary: z.string(),
});

export type Requirements = z.infer<typeof RequirementsSchema>;

export const BlockerAnalysisSchema = z.object({
  blockers: z.array(z.object({
    description: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.string(),
  })),
  hasCriticalBlocker: z.boolean(),
});

export type BlockerAnalysis = z.infer<typeof BlockerAnalysisSchema>;

export interface GraphInput {
  pdfUrl: string;
}

export interface KbResults {
  products: string;
  pricing: string;
  pastBids: string;
}
