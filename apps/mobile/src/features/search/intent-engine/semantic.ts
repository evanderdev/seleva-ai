import { prototypes } from './prototypes';
import type { SemanticEmbeddingProvider, SemanticMatcher } from './types';

export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (
    !a.length ||
    a.length !== b.length ||
    [...a, ...b].some((n) => !Number.isFinite(n))
  )
    throw new Error('INVALID_EMBEDDING');
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    aa += x * x;
    bb += y * y;
  }
  if (!aa || !bb) throw new Error('EMPTY_EMBEDDING');
  return dot / Math.sqrt(aa * bb);
}
export interface PrototypeVector {
  concept: string;
  vector: number[];
}
export function createSemanticMatcher(
  provider: SemanticEmbeddingProvider,
  vectors: readonly PrototypeVector[],
  threshold = 0.48,
): SemanticMatcher {
  return {
    async match(text) {
      const embedding = await provider.embed(text);
      const scores = prototypes
        .map((prototype) => ({
          prototype,
          similarity: Math.max(
            -1,
            ...vectors
              .filter((v) => v.concept === prototype.concept)
              .map((v) => cosineSimilarity(embedding, v.vector)),
          ),
        }))
        .sort((a, b) => b.similarity - a.similarity);
      const best = scores[0];
      if (
        !best ||
        best.similarity < threshold ||
        best.prototype.concept === 'out_of_domain'
      )
        return [];
      const rejection = scores.find(
        (s) => s.prototype.concept === 'out_of_domain',
      )!;
      return scores
        .filter(
          ({ prototype, similarity }) =>
            prototype.concept !== 'out_of_domain' &&
            similarity >= threshold &&
            similarity >= best.similarity - 0.08 &&
            similarity > rejection.similarity + 0.08,
        )
        .slice(0, 4)
        .map(({ prototype, similarity }) => ({
          concept: prototype.concept,
          similarity,
          intent: {
            action: 'find',
            query: {
              filters: 'filters' in prototype ? prototype.filters : {},
              exclusions: { favorites: false },
            },
            concepts: 'category' in prototype ? [prototype.category] : [],
            ...('patch' in prototype ? prototype.patch : {}),
          },
        }));
    },
    dispose: () => provider.dispose(),
  };
}
