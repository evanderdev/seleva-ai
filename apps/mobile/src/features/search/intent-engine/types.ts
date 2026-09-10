import { queryPlanSchema, selectionOperationSchema, type ActionIntent, type QueryPlan, type SelectionContext } from '@seleva/core';
import { z } from 'zod';

export const promptSchema = z.string().trim().min(1).max(500);
export const intentSchema = z.strictObject({
  action: z.enum([
    'find',
    'select',
    'review',
    'keep',
    'delete',
    'organize',
    'compare',
    'refine',
    'favorite',
    'unfavorite',
    'share',
  ]),
  query: queryPlanSchema,
  concepts: z
    .array(
      z.enum([
        'bank_receipt',
        'receipt',
        'invoice',
        'document',
        'conversation',
        'delivery_tracking',
        'temporary_information',
        'otp',
        'qr_code',
        'social_media',
        'shopping',
        'ticket',
      ]),
    )
    .default([]),
  cleanupCandidate: z.boolean().default(false),
  freeSpace: z.boolean().default(false),
  destructive: z.boolean().default(false),
  bestShot: z.boolean().default(false),
  operation: selectionOperationSchema.default('new'),
});
export type SelevaIntent = z.infer<typeof intentSchema>;
export interface IntentContext {
  locale?: string;
  /** Dates use the device's local timezone, with an injectable clock. */
  now?: Date;
  previousIntent?: SelevaIntent;
  selectionContext?: SelectionContext;
}
export interface NormalizedIntentInput {
  originalText: string;
  originalLanguage?: string;
  canonicalText?: string;
  canonicalLanguage?: 'en' | 'original';
  normalizationStrategy: 'passthrough' | 'multilingual' | 'translation';
  normalizedOriginalText?: string;
  detectedLanguage?: string;
  languageConfidence?: number;
  translationStatus?: 'not-needed' | 'translated' | 'unavailable' | 'failed';
}
export interface IntentNormalizer {
  normalize(
    text: string,
    context: IntentContext,
  ): Promise<NormalizedIntentInput>;
}
export interface DeterministicResult {
  intent: SelevaIntent;
  confidence: number;
  unresolved: boolean;
  evidence?: Array<{ matcher: string; text: string }>;
  residual?: string;
}
export interface DeterministicIntentProvider {
  interpret(
    input: NormalizedIntentInput,
    context: IntentContext,
  ): Promise<DeterministicResult>;
}
export interface NaturalDateParser {
  parse(
    text: string,
    context: IntentContext,
  ): {
    before?: number;
    after?: number;
    remaining: string;
    ambiguous?: boolean;
  };
}
export interface SemanticEmbeddingProvider {
  initialize(): Promise<void>;
  warmup(): Promise<void>;
  embed(text: string): Promise<readonly number[]>;
  dispose(): Promise<void>;
}
export interface SemanticMatch {
  concept: string;
  similarity: number;
  intent: unknown;
}
export interface SemanticMatcher {
  match(text: string): Promise<SemanticMatch[]>;
  dispose(): Promise<void>;
}
export type PlanNotice =
  | 'cleanupRankingUnavailable'
  | 'spaceTargetUnavailable'
  | 'bestShotUnavailable'
  | 'actionUnavailable'
  | 'filterUnavailable'
  | 'ambiguousOperation';
export interface IntentExecutionPlan {
  status: 'ready' | 'clarification' | 'unsupported';
  query?: QueryPlan;
  action?: ActionIntent;
  notices: PlanNotice[];
  requiresReview: true;
}
export interface IntentPlanner {
  createPlan(intent: SelevaIntent): Promise<IntentExecutionPlan>;
}
export interface IntentInterpretation {
  normalized: NormalizedIntentInput;
  interpretation: { intent: SelevaIntent; confidence: number };
  plan: IntentExecutionPlan;
  selectionContext?: SelectionContext;
  /** Returned only when explicitly enabled; never logged or persisted. */
  debug?: {
    semanticUsed: boolean;
    degraded: boolean;
    matches: Array<{ concept: string; similarity: number }>;
    durations: Record<string, number>;
  };
}
export interface IntentEngine {
  interpret(input: {
    text: string;
    context?: IntentContext;
  }): Promise<IntentInterpretation>;
  dispose(): Promise<void>;
}
