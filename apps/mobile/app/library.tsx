import { LibraryScreen } from '../src/screens/LibraryScreen';
import { useLocalSearchParams } from 'expo-router';
import { queryPlanSchema, type QueryPlan } from '@seleva/core';
export default function Library() {
  const params = useLocalSearchParams<{
    prompt?: string;
    category?: string;
    before?: string;
    minFileSize?: string;
    duplicate?: string;
    similar?: string;
    minBlur?: string;
    ocrTerms?: string;
    query?: string;
    notice?: string;
  }>();
  const categories = [
    'all',
    'photos',
    'videos',
    'screenshots',
    'favorites',
  ] as const;
  const category = categories.includes(
    params.category as (typeof categories)[number],
  )
    ? (params.category as (typeof categories)[number])
    : 'all';
  const before = params.before ? Number(params.before) : undefined;
  const minFileSize = params.minFileSize
    ? Number(params.minFileSize)
    : undefined;
  const minBlur = params.minBlur ? Number(params.minBlur) : undefined;
  const ocrTerms = params.ocrTerms
    ? params.ocrTerms.split(',').filter((term) => term.length >= 1)
    : undefined;
  let query: QueryPlan | undefined;
  let invalidQuery = false;
  if (params.query) {
    try {
      query = queryPlanSchema.parse(JSON.parse(params.query));
    } catch {
      invalidQuery = true;
    }
  }
  return (
    <LibraryScreen
      key={JSON.stringify(params)}
      initialQuery={query}
      initialQueryInvalid={invalidQuery}
      initialIntentNotice={params.notice === '1'}
      initialPrompt={params.prompt}
      initialCategory={category}
      initialBefore={Number.isFinite(before) ? before : undefined}
      initialMinFileSize={
        Number.isFinite(minFileSize) && (minFileSize ?? 0) > 0
          ? minFileSize
          : undefined
      }
      initialDuplicate={params.duplicate === '1'}
      initialSimilar={params.similar === '1'}
      initialMinBlur={Number.isFinite(minBlur) ? minBlur : undefined}
      initialOcrTerms={ocrTerms}
    />
  );
}
