import { deterministicProvider } from './deterministic';
import { normalizer } from './normalizer';
import { planner } from './planner';
import {
  intentSchema,
  promptSchema,
  type DeterministicIntentProvider,
  type IntentEngine,
  type IntentNormalizer,
  type IntentPlanner,
  type SemanticMatcher,
  type SelevaIntent,
} from './types';

export function createIntentEngine(
  config: {
    normalizer?: IntentNormalizer;
    deterministic?: DeterministicIntentProvider;
    semantic?: SemanticMatcher;
    planner?: IntentPlanner;
    debug?: boolean;
  } = {},
): IntentEngine {
  return {
    async interpret({ text, context = {} }) {
      const started = performance.now();
      const durations: Record<string, number> = {};
      let checkpoint = started;
      const measure = (stage: string) => {
        const now = performance.now();
        durations[stage] = now - checkpoint;
        checkpoint = now;
      };
      const input = promptSchema.parse(text);
      let degraded = false;
      let normalized;
      try {
        normalized = await (config.normalizer ?? normalizer).normalize(
          input,
          context,
        );
      } catch {
        degraded = true;
        normalized = await normalizer.normalize(input, context);
      }
      measure('normalizationDuration');
      let deterministic;
      try {
        deterministic = await (
          config.deterministic ?? deterministicProvider
        ).interpret(normalized, context);
      } catch {
        degraded = true;
        deterministic = {
          intent: intentSchema.parse({ action: 'find', query: {} }),
          confidence: 0,
          unresolved: true,
        };
      }
      measure('nlpAndDateDuration');
      const validated = intentSchema.safeParse(deterministic.intent);
      let intent = validated.success
        ? validated.data
        : intentSchema.parse({ action: 'find', query: {} });
      if (!validated.success) degraded = true;
      let confidence = validated.success ? deterministic.confidence : 0;
      let semanticUsed = false;
      let matched = false;
      const matches: Array<{ concept: string; similarity: number }> = [];
      if (config.semantic && (confidence < 0.9 || deterministic.unresolved)) {
        semanticUsed = true;
        try {
          for (const match of await config.semantic.match(
            normalized.originalText,
          )) {
            const candidate = intentSchema.safeParse(match.intent);
            if (
              !candidate.success ||
              !Number.isFinite(match.similarity) ||
              match.similarity < 0.48 ||
              match.similarity > 1
            ) {
              degraded = true;
              continue;
            }
            // Semantic concepts can enrich a query, never invent destructive actions.
            const suggestion = candidate.data;
            const filters = {
              ...suggestion.query.filters,
              ...intent.query.filters,
            };
            intent = intentSchema.parse({
              ...intent,
              query: { ...intent.query, filters },
              concepts: [
                ...new Set([...intent.concepts, ...suggestion.concepts]),
              ],
              cleanupCandidate:
                intent.cleanupCandidate || suggestion.cleanupCandidate,
              freeSpace: intent.freeSpace || suggestion.freeSpace,
              bestShot: intent.bestShot || suggestion.bestShot,
            });
            matched = true;
            matches.push({
              concept: match.concept,
              similarity: match.similarity,
            });
            confidence = Math.max(confidence, match.similarity);
          }
        } catch {
          degraded = true;
        }
      }
      measure('semanticDuration');
      if (intent.cleanupCandidate || intent.destructive)
        intent.query.exclusions.favorites = true;
      // Context only applies to an explicit refine action, never to a fresh search.
      if (intent.action === 'refine' && context.previousIntent) {
        const previous: SelevaIntent = intentSchema.parse(
          context.previousIntent,
        );
        intent.query.filters = {
          ...previous.query.filters,
          ...intent.query.filters,
        };
      }
      intent = intentSchema.parse(intent);
      measure('validationDuration');
      const negativeOrUnion =
        /\b(not|não|nao|except|without|sem|sin|or|ou)\b/i.test(input) &&
        !/\b(favou?rites?|favorit[ao]s?)\b/i.test(input);
      const needsClarification =
        !validated.success ||
        negativeOrUnion ||
        (deterministic.unresolved && !matched);
      const plan = needsClarification
        ? {
            status: 'clarification' as const,
            notices: [],
            requiresReview: true as const,
          }
        : await (config.planner ?? planner).createPlan(intent);
      measure('plannerDuration');
      durations.totalDuration = performance.now() - started;
      return {
        normalized,
        interpretation: { intent, confidence },
        plan,
        ...(config.debug
          ? { debug: { semanticUsed, degraded, matches, durations } }
          : {}),
      };
    },
    async dispose() {
      await config.semantic?.dispose();
    },
  };
}
