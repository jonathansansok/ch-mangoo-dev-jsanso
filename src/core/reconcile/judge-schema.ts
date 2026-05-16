import { z } from 'zod';

export const JudgeRelation = z.enum(['match', 'partial_quantity', 'extra']);
export type JudgeRelation = z.infer<typeof JudgeRelation>;

export const JudgeDecision = z.object({
  offerItemRef: z.string(),
  relation: JudgeRelation,
  requestItemRef: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rationale_short: z.string().max(280),
});

export const JudgeOutput = z.object({
  decisions: z.array(JudgeDecision).min(1),
});

export type JudgeDecision = z.infer<typeof JudgeDecision>;
export type JudgeOutput = z.infer<typeof JudgeOutput>;
