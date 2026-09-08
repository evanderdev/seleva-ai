import { LibraryScreen } from '../src/screens/LibraryScreen';
import { useLocalSearchParams } from 'expo-router';
export default function Library() {
  const params = useLocalSearchParams<{
    category?: string;
    before?: string;
    minFileSize?: string;
    duplicate?: string;
    similar?: string;
    minBlur?: string;
    ocrTerms?: string;
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
  const minFileSize = params.minFileSize ? Number(params.minFileSize) : undefined;
  const minBlur = params.minBlur ? Number(params.minBlur) : undefined;
  const ocrTerms = params.ocrTerms
    ? params.ocrTerms.split(',').filter((term) => term.length >= 1)
    : undefined;
  return (
    <LibraryScreen
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
