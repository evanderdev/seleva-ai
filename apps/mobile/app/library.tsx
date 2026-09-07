import { LibraryScreen } from '../src/screens/LibraryScreen';
import { useLocalSearchParams } from 'expo-router';
export default function Library() {
  const params = useLocalSearchParams<{ category?: string; before?: string }>();
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
  return (
    <LibraryScreen
      initialCategory={category}
      initialBefore={Number.isFinite(before) ? before : undefined}
    />
  );
}
