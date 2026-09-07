import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { libraryReader, type LibraryPage } from '@seleva/photo-engine';
import { Button, theme } from '@seleva/ui';
import { LibraryPermissionCard } from '../components/LibraryPermissionCard';

function Thumbnail({ asset }: { asset: LibraryPage['assets'][number] }) {
  const { t } = useTranslation();
  const [uri, setUri] = useState<string>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void libraryReader
      .getThumbnail({ id: asset.id, size: 256 })
      .then((result) => {
        if (!active) return;
        if (result.ok) setUri(result.value);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [asset.id]);
  return (
    <View style={styles.tile}>
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          onError={() => setUri(undefined)}
          accessibilityLabel={t(
            asset.mediaType === 'video' ? 'videoThumbnail' : 'photoThumbnail',
          )}
        />
      ) : loading ? (
        <ActivityIndicator />
      ) : (
        <Text style={styles.placeholder}>{t('thumbnailUnavailable')}</Text>
      )}
    </View>
  );
}

/** Bounded native preview. Indexing will feed SQLite in the scanner phase. */
export function LibraryScreen() {
  const { t } = useTranslation();
  const [page, setPage] = useState<LibraryPage>({ assets: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async (cursor?: string) => {
    const request = ++generation.current;
    setBusy(true);
    setError(false);
    setPage({ assets: [] });
    const result = await libraryReader.listAssets({ limit: 60, cursor });
    if (request !== generation.current) return;
    if (result.ok) setPage(result.value);
    else setError(true);
    setBusy(false);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
      const subscription = AppState.addEventListener('change', (state) => {
        ++generation.current;
        setPage({ assets: [] });
        if (state === 'active') void load();
      });
      return () => {
        ++generation.current;
        subscription.remove();
        setPage({ assets: [] });
      };
    }, [load]),
  );
  return (
    <View style={styles.screen}>
      <FlatList
        data={page.assets}
        numColumns={3}
        keyExtractor={(asset) => asset.id}
        renderItem={({ item }) => <Thumbnail asset={item} />}
        initialNumToRender={12}
        maxToRenderPerBatch={6}
        windowSize={3}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <LibraryPermissionCard />
            <Button
              label={t('refreshLibrary')}
              disabled={busy}
              onPress={() => {
                void load();
              }}
            />
          </View>
        }
        ListEmptyComponent={
          busy ? (
            <ActivityIndicator />
          ) : (
            <Text accessibilityRole={error ? 'alert' : undefined}>
              {t(error ? 'libraryReadError' : 'libraryEmpty')}
            </Text>
          )
        }
        ListFooterComponent={
          page.nextCursor ? (
            <Button
              label={t('nextPhotos')}
              disabled={busy}
              onPress={() => {
                void load(page.nextCursor);
              }}
            />
          ) : null
        }
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 8 },
  header: { gap: 12, marginBottom: 16 },
  tile: {
    width: '33.333%',
    aspectRatio: 1,
    padding: 2,
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%', borderRadius: 8 },
  placeholder: { color: theme.colors.muted, textAlign: 'center', fontSize: 12 },
});
