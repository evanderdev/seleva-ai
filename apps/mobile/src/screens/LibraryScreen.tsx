import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  libraryReader,
  type LibraryPage,
  type LibraryFilter,
} from '@seleva/photo-engine';
import { Button, theme } from '@seleva/ui';
import { LibraryPermissionCard } from '../components/LibraryPermissionCard';
import { usePhotoRepository } from '../services/database';
import type { QueryPlan } from '@seleva/core';

function Thumbnail({
  asset,
  expanded = false,
}: {
  asset: LibraryPage['assets'][number];
  expanded?: boolean;
}) {
  const { t } = useTranslation();
  const [uri, setUri] = useState<string>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setUri(undefined);
    setLoading(true);
    void libraryReader
      .getThumbnail({ id: asset.id, size: expanded ? 512 : 256 })
      .then((result) => {
        if (!active) return;
        if (result.ok) setUri(result.value);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [asset.id, expanded]);
  return (
    <View style={expanded ? styles.preview : styles.thumbnail}>
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode={expanded ? 'contain' : 'cover'}
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
export function LibraryScreen({
  mode = 'library',
  initialCategory = mode === 'clean' ? 'screenshots' : 'all',
  initialBefore,
  initialMinFileSize,
  initialDuplicate = false,
  initialSimilar = false,
  initialMinBlur,
  initialOcrTerms,
}: {
  mode?: 'library' | 'search' | 'clean';
  initialCategory?: LibraryFilter['category'];
  initialBefore?: number;
  initialMinFileSize?: number;
  initialDuplicate?: boolean;
  initialSimilar?: boolean;
  initialMinBlur?: number;
  initialOcrTerms?: string[];
}) {
  const { t, i18n } = useTranslation();
  const repository = usePhotoRepository();
  const [category, setCategory] =
    useState<LibraryFilter['category']>(initialCategory);
  const [before, setBefore] = useState<number | undefined>(initialBefore);
  const [minFileSize] = useState<number | undefined>(initialMinFileSize);
  const [duplicate] = useState(initialDuplicate);
  const [similar] = useState(initialSimilar);
  const [minBlur] = useState<number | undefined>(initialMinBlur);
  const [ocrTerms] = useState<string[] | undefined>(initialOcrTerms);
  const [preview, setPreview] = useState<LibraryPage['assets'][number]>();
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState<LibraryPage>({ assets: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [indexedAssets, setIndexedAssets] = useState(0);
  const generation = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const request = ++generation.current;
      setBusy(true);
      setError(undefined);
      setPage({ assets: [] });
      setSelected([]);
      setPreview(undefined);
      try {
        const summary = await repository.getSummary();
        if (request !== generation.current) return;
        setIndexedAssets(summary.photos + summary.videos);
        const canUseIndex =
          summary.photos + summary.videos > 0 &&
          (minFileSize === undefined || summary.photos + summary.videos > 0);
        const requiresAnalysis =
          duplicate || similar || minBlur !== undefined || Boolean(ocrTerms?.length);
        if (!canUseIndex && requiresAnalysis) {
          setError('DEVICE_UNSUPPORTED');
          setBusy(false);
          return;
        }
        const result = canUseIndex
          ? await (async () => {
            const filters: NonNullable<QueryPlan['filters']> = {};
            if (category === 'photos') filters.mediaTypes = ['photo'];
            if (category === 'videos') filters.mediaTypes = ['video'];
            if (category === 'screenshots') filters.screenshot = true;
            if (category === 'favorites') filters.favorite = true;
            if (before !== undefined) filters.before = before;
            if (minFileSize !== undefined) filters.minFileSize = minFileSize;
            if (duplicate) filters.duplicate = true;
            if (similar) filters.similar = true;
            if (minBlur !== undefined) filters.minBlur = minBlur;
            if (ocrTerms?.length) filters.ocrTerms = ocrTerms;
              const page = await repository.query(
                { filters, exclusions: { favorites: false } },
                { limit: 60, cursor },
              );
              return { ok: true as const, value: page };
            })()
          : await libraryReader.listAssets({
              limit: 60,
              cursor,
              filter: { category, before },
            });
        if (request !== generation.current) return;
        if (result.ok) setPage(result.value);
        else setError(result.error);
        setBusy(false);
      } catch {
        if (request === generation.current) {
          setError('UNKNOWN');
          setBusy(false);
        }
      }
    },
    [
      category,
      before,
      minFileSize,
      duplicate,
      similar,
      minBlur,
      ocrTerms,
      repository,
    ],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
      const subscription = AppState.addEventListener('change', (state) => {
        ++generation.current;
        setPage({ assets: [] });
        setPreview(undefined);
        setSelected([]);
        if (state === 'active') void load();
      });
      return () => {
        ++generation.current;
        subscription.remove();
        setPage({ assets: [] });
        setPreview(undefined);
        setSelected([]);
      };
    }, [load]),
  );
  return (
    <View style={styles.screen}>
      <FlatList
        data={page.assets}
        numColumns={3}
        keyExtractor={(asset) => asset.id}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.tile, selected.includes(item.id) && styles.selected]}
            accessibilityRole="button"
            accessibilityLabel={t('openPreview')}
            onPress={() => setPreview(item)}
            onLongPress={() => {
              if (mode !== 'clean') return;
              setSelected((current) =>
                current.includes(item.id)
                  ? current.filter((id) => id !== item.id)
                  : [...current, item.id],
              );
            }}
          >
            <Thumbnail asset={item} />
            <Text style={styles.placeholder}>
              {t(
                item.mediaType === 'video' ? 'filter_videos' : 'filter_photos',
              )}
              {selected.includes(item.id) ? ' ✓' : ''}
            </Text>
          </Pressable>
        )}
        initialNumToRender={12}
        maxToRenderPerBatch={6}
        windowSize={3}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{t(mode)}</Text>
            {indexedAssets > 0 && (
              <Text style={styles.placeholder}>
                {t('indexedCount', { count: indexedAssets })}
              </Text>
            )}
            <LibraryPermissionCard />
            <ScrollView horizontal contentContainerStyle={styles.filters}>
              {(
                ['all', 'photos', 'videos', 'screenshots', 'favorites'] as const
              ).map((value) => (
                <Button
                  key={value}
                  label={t(`filter_${value}`)}
                  selected={category === value}
                  onPress={() => setCategory(value)}
                />
              ))}
            </ScrollView>
            <Button
              label={t(before ? 'showAllDates' : 'olderThanYear')}
              selected={before !== undefined}
              onPress={() => {
                const date = new Date();
                date.setFullYear(date.getFullYear() - 1);
                setBefore(before === undefined ? date.getTime() : undefined);
              }}
            />
            {category === 'screenshots' && (
              <Text style={styles.placeholder}>{t('screenshotHint')}</Text>
            )}
            {minFileSize !== undefined && (
              <Text style={styles.placeholder}>{t('largeMediaHint')}</Text>
            )}
            {(duplicate || similar || minBlur !== undefined || ocrTerms?.length) && (
              <Text style={styles.placeholder}>{t('analysisFilterHint')}</Text>
            )}
            {mode === 'clean' && <Text>{t('reviewOnly')}</Text>}
            {selected.length > 0 && (
              <Text>{t('selectedOnPage', { count: selected.length })}</Text>
            )}
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
              {t(
                error === 'DEVICE_UNSUPPORTED'
                  ? 'queryUnavailable'
                  : error === 'INVALID_CURSOR'
                    ? 'refreshResults'
                    : error
                      ? 'libraryReadError'
                      : 'libraryEmpty',
              )}
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
      <Modal
        visible={preview !== undefined}
        animationType="slide"
        onRequestClose={() => setPreview(undefined)}
      >
        {preview && (
          <ScrollView
            contentContainerStyle={styles.header}
            style={styles.modal}
          >
            <Button
              label={t('closePreview')}
              onPress={() => setPreview(undefined)}
            />
            <Thumbnail asset={preview} expanded />
            <Text>
              {new Date(preview.createdAt).toLocaleDateString(i18n.language)}
            </Text>
            <Text>
              {t('dimensions', {
                width: preview.width,
                height: preview.height,
              })}
            </Text>
            {preview.fileSize !== undefined && (
              <Text>
                {t('sizeMB', {
                  size: (preview.fileSize / 1048576).toLocaleString(
                    i18n.language,
                    { maximumFractionDigits: 1 },
                  ),
                })}
              </Text>
            )}
            {preview.duration !== undefined && (
              <Text>
                {t('durationSeconds', {
                  seconds: Math.round(preview.duration),
                })}
              </Text>
            )}
            {preview.isFavorite && <Text>{t('filter_favorites')}</Text>}
            {(category === 'screenshots' ||
              duplicate ||
              similar ||
              minBlur !== undefined ||
              minFileSize !== undefined ||
              before !== undefined ||
              Boolean(ocrTerms?.length)) && (
              <View style={styles.reasons}>
                <Text style={styles.reasonTitle}>{t('whySelected')}</Text>
                {category === 'screenshots' && <Text>{t('reasonScreenshot')}</Text>}
                {duplicate && <Text>{t('reasonDuplicate')}</Text>}
                {similar && <Text>{t('reasonSimilar')}</Text>}
                {minBlur !== undefined && <Text>{t('reasonBlurry')}</Text>}
                {minFileSize !== undefined && <Text>{t('reasonLargeMedia')}</Text>}
                {before !== undefined && <Text>{t('reasonOldMedia')}</Text>}
                {ocrTerms?.length ? <Text>{t('reasonOcr')}</Text> : null}
              </View>
            )}
            {mode === 'clean' && (
              <Button
                label={t(
                  selected.includes(preview.id)
                    ? 'deselectPhoto'
                    : 'selectPhoto',
                )}
                onPress={() => {
                  setSelected((current) =>
                    current.includes(preview.id)
                      ? current.filter((id) => id !== preview.id)
                      : [...current, preview.id],
                  );
                }}
              />
            )}
            {mode === 'clean' && selected.length > 0 && (
              <>
                <Button
                  label={t('moveToTrash')}
                  disabled={busy}
                  onPress={() => {
                    const ids = [...selected];
                    const bytes = page.assets
                      .filter((asset) => ids.includes(asset.id))
                      .reduce((sum, asset) => sum + (asset.fileSize ?? 0), 0);
                    Alert.alert(
                      t('confirmMoveToTrashTitle'),
                      t('confirmMoveToTrashMessage', { count: ids.length }),
                      [
                        { text: t('cancel'), style: 'cancel' },
                        {
                          text: t('moveToTrash'),
                          style: 'destructive',
                          onPress: () => {
                            void (async () => {
                              setBusy(true);
                              const result = await libraryReader.trashAssets?.({
                                ids,
                                userConfirmed: true,
                              });
                              if (!result || !result.ok) {
                                setError(
                                  result && !result.ok
                                    ? result.error
                                    : 'DEVICE_UNSUPPORTED',
                                );
                                setBusy(false);
                                return;
                              }
                              await repository.removeAssets(result.value.trashedIds);
                              await repository.recordCleanup(
                                result.value.trashedIds,
                                bytes,
                                result.value.cancelled ? 'cancelled' : 'trashed',
                              );
                              setSelected([]);
                              setPreview(undefined);
                              setBusy(false);
                              void load();
                            })();
                          },
                        },
                      ],
                    );
                  }}
                />
                <Text style={styles.placeholder}>{t('trashSafetyNote')}</Text>
              </>
            )}
            <Text style={styles.placeholder}>{t('previewHint')}</Text>
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, gap: 8 },
  header: { gap: 12, marginBottom: 16 },
  title: { fontSize: 28, color: theme.colors.text, fontWeight: '700' },
  filters: { gap: 8 },
  modal: {
    padding: 24,
    paddingTop: 48,
    backgroundColor: theme.colors.background,
  },
  preview: { width: '100%', height: 400, justifyContent: 'center' },
  thumbnail: { flex: 1, justifyContent: 'center' },
  selected: {
    borderWidth: 3,
    borderColor: theme.colors.primary,
    borderRadius: 8,
  },
  tile: {
    width: '33.333%',
    aspectRatio: 1,
    padding: 2,
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%', borderRadius: 8 },
  placeholder: { color: theme.colors.muted, textAlign: 'center', fontSize: 12 },
  reasons: { gap: 4, padding: 12, backgroundColor: theme.colors.surface, borderRadius: 12 },
  reasonTitle: { color: theme.colors.text, fontWeight: '700' },
});
