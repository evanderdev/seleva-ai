import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  libraryReader,
  type LibraryPage,
  type LibraryFilter,
} from '@seleva/photo-engine';
import {
  Button,
  Icon,
  IconButton,
  layout,
  useTheme,
  type Palette,
} from '@seleva/ui';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { usePromptInterpreter } from '../features/search/usePromptInterpreter';
import { LibraryStatus } from '../features/library/LibraryStatus';
import { usePhotoRepository } from '../services/database';
import type { QueryPlan } from '@seleva/core';
import { LibraryGridItem } from '../features/library/components/LibraryGridItem';
import { Thumbnail } from '../features/library/components/Thumbnail';

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
  initialPrompt = '',
  initialQuery,
  initialQueryInvalid = false,
  initialIntentNotice = false,
}: {
  mode?: 'library' | 'search' | 'clean';
  initialCategory?: LibraryFilter['category'];
  initialBefore?: number;
  initialMinFileSize?: number;
  initialDuplicate?: boolean;
  initialSimilar?: boolean;
  initialMinBlur?: number;
  initialOcrTerms?: string[];
  initialPrompt?: string;
  initialQuery?: QueryPlan;
  initialQueryInvalid?: boolean;
  initialIntentNotice?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const colors = useTheme();
  const styles = createStyles(colors);
  const repository = usePhotoRepository();
  const [category, setCategory] =
    useState<LibraryFilter['category']>(initialCategory);
  const [before, setBefore] = useState<number | undefined>(initialBefore);
  const [minFileSize, setMinFileSize] = useState<number | undefined>(
    initialMinFileSize,
  );
  const [duplicate, setDuplicate] = useState(initialDuplicate);
  const [similar, setSimilar] = useState(initialSimilar);
  const [minBlur, setMinBlur] = useState<number | undefined>(initialMinBlur);
  const [ocrTerms, setOcrTerms] = useState<string[] | undefined>(
    initialOcrTerms,
  );
  const [preview, setPreview] = useState<LibraryPage['assets'][number]>();
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState<LibraryPage>({ assets: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [searchVersion, setSearchVersion] = useState(0);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [draft, setDraft] = useState(initialPrompt);
  const [editing, setEditing] = useState(false);
  const { interpret, interpreting, intentError, clearIntentError } =
    usePromptInterpreter();
  const [intentQuery, setIntentQuery] = useState(initialQuery);
  const [queryInvalid, setQueryInvalid] = useState(initialQueryInvalid);
  const [intentNotice, setIntentNotice] = useState(initialIntentNotice);
  const trashInFlight = useRef(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  function editSearch() {
    setDraft(prompt);
    setEditing(true);
  }
  async function applySearch() {
    const result = await interpret(draft);
    if (!result) return;
    setCategory('all');
    setBefore(undefined);
    setMinFileSize(undefined);
    setDuplicate(false);
    setSimilar(false);
    setMinBlur(undefined);
    setOcrTerms(undefined);
    setIntentQuery(result.query);
    setQueryInvalid(false);
    setIntentNotice(result.notice);
    setSearchVersion((value) => value + 1);
    setPrompt(draft.trim());
    setEditing(false);
  }
  function clearFilter() {
    setIntentQuery(undefined);
    setQueryInvalid(false);
    setIntentNotice(false);
    setCategory('all');
    setBefore(undefined);
    setMinFileSize(undefined);
    setDuplicate(false);
    setSimilar(false);
    setMinBlur(undefined);
    setOcrTerms(undefined);
    setSearchVersion((value) => value + 1);
    setPrompt('');
  }
  const toggle = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }, []);
  const openPreview = useCallback(
    (asset: LibraryPage['assets'][number]) => setPreview(asset),
    [],
  );
  const renderItem = useCallback(
    ({ item }: { item: LibraryPage['assets'][number] }) => (
      <LibraryGridItem
        asset={item}
        selected={selectedSet.has(item.id)}
        onOpen={openPreview}
        onToggle={toggle}
      />
    ),
    [openPreview, selectedSet, toggle],
  );
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
        if (queryInvalid) {
          setError('DEVICE_UNSUPPORTED');
          setBusy(false);
          return;
        }
        const summary = await repository.getSummary();
        if (request !== generation.current) return;

        const canUseIndex =
          summary.photos + summary.videos > 0 &&
          (minFileSize === undefined || summary.photos + summary.videos > 0);
        const requiresAnalysis =
          Boolean(intentQuery) ||
          duplicate ||
          similar ||
          minBlur !== undefined ||
          minFileSize !== undefined ||
          Boolean(ocrTerms?.length);
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
                intentQuery ?? {
                  filters,
                  exclusions: { favorites: false },
                },
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
      searchVersion,
      intentQuery,
      queryInvalid,
    ],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
      const subscription = AppState.addEventListener('change', (state) => {
        // System trash confirmation temporarily backgrounds the Activity.
        if (trashInFlight.current) return;
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
    <SafeAreaView style={styles.screen}>
      <ScreenHeader title={t('results')} onSearch={editSearch} />
      {intentNotice && (
        <Text style={{ color: colors.muted, paddingHorizontal: 16 }}>
          {t('intentReviewNotice')}
        </Text>
      )}
      <FlatList
        data={page.assets}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        keyExtractor={(asset) => asset.id}
        renderItem={renderItem}
        extraData={selectedSet}
        removeClippedSubviews={false}
        initialNumToRender={12}
        maxToRenderPerBatch={6}
        windowSize={3}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[layout.eyebrow, { color: colors.muted }]}>
              {t('smartSelection')}
            </Text>
            <Text style={[layout.title, { color: colors.text }]}>
              {t('foundTitle')}
            </Text>
            <Text style={[layout.body, { color: colors.muted }]}>
              {t('foundDescription')}
            </Text>
            <View style={styles.filterBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('editFilter')}
                accessibilityState={{ expanded: editing }}
                onPress={editSearch}
                style={({ pressed }) => [
                  styles.filterEdit,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Icon name="search" size={18} color={colors.selectionBorder} />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    {t('editFilter')}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={{
                      color: colors.text,
                      fontSize: 14,
                      lineHeight: 20,
                      fontWeight: '500',
                    }}
                  >
                    {prompt ||
                      t(
                        duplicate
                          ? 'findDuplicates'
                          : similar
                            ? 'similarPhotos'
                            : minBlur !== undefined
                              ? 'findBlurry'
                              : minFileSize !== undefined
                                ? 'largeVideos'
                                : before
                                  ? 'olderThanYear'
                                  : 'filter_' + category,
                      )}
                  </Text>
                </View>
                <View style={styles.filterAffordance}>
                  <Icon name="arrow" color={colors.text} size={16} />
                </View>
              </Pressable>
              {prompt ||
              category !== 'all' ||
              before !== undefined ||
              minFileSize !== undefined ||
              duplicate ||
              similar ||
              minBlur !== undefined ||
              ocrTerms?.length ? (
                <View style={styles.filterClear}>
                  <IconButton
                    name="close"
                    label={t('removeFilter')}
                    onPress={clearFilter}
                  />
                </View>
              ) : null}
            </View>
            <View style={[layout.row, { justifyContent: 'space-between' }]}>
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.text, fontSize: 14 }}>
                  {t('itemsOnPage', { count: page.assets.length })}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {t('selectionCount', { count: selected.length })}
                </Text>
              </View>
              <Button
                variant="outline"
                label={t(
                  selected.length === page.assets.length && selected.length > 0
                    ? 'clearSelection'
                    : 'selectAll',
                )}
                disabled={busy || !page.assets.length}
                onPress={() =>
                  setSelected(
                    selected.length === page.assets.length
                      ? []
                      : page.assets.map((asset) => asset.id),
                  )
                }
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          busy ? (
            <ActivityIndicator />
          ) : (
            <Text
              style={{ color: colors.muted }}
              accessibilityRole={error ? 'alert' : undefined}
            >
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
          <View style={{ gap: 12, paddingTop: 18, paddingBottom: 24 }}>
            {selected.length > 0 && (
              <Button
                label={t('reviewSelection')}
                onPress={() =>
                  setPreview(
                    page.assets.find((asset) => selected.includes(asset.id)),
                  )
                }
              />
            )}
            <Button
              variant="outline"
              label={t('refreshLibrary')}
              disabled={busy}
              onPress={() => void load()}
            />
            {page.nextCursor && (
              <Button
                label={t('nextPhotos')}
                disabled={busy}
                onPress={() => void load(page.nextCursor)}
              />
            )}
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
              {t('reviewOnly')}
            </Text>
            {error && <LibraryStatus />}
          </View>
        }
      />
      <Modal
        visible={editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: colors.overlay,
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
            onPress={() => setEditing(false)}
          />
          <SafeAreaView
            edges={['bottom']}
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 30,
              borderTopRightRadius: 30,
              marginHorizontal: 16,
            }}
          >
            <View
              accessibilityViewIsModal
              style={[layout.content, { padding: 20, gap: 16 }]}
            >
              <View
                style={{
                  width: 40,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.border,
                  alignSelf: 'center',
                  marginBottom: 6,
                }}
              />
              <View style={[layout.row, { justifyContent: 'space-between' }]}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '600',
                    color: colors.text,
                  }}
                >
                  {t('adjustSearch')}
                </Text>
                <IconButton
                  name="close"
                  label={t('cancel')}
                  onPress={() => setEditing(false)}
                />
              </View>
              <View
                style={[
                  layout.row,
                  {
                    borderColor: colors.selectionBorder,
                    borderWidth: 1,
                    borderRadius: 18,
                    paddingHorizontal: 16,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <Icon name="search" />
                <TextInput
                  autoFocus
                  value={draft}
                  onChangeText={(value) => {
                    setDraft(value);
                    clearIntentError();
                  }}
                  maxLength={500}
                  onSubmitEditing={() => void applySearch()}
                  returnKeyType="search"
                  accessibilityLabel={t('adjustSearch')}
                  placeholder={t('assistantPlaceholder')}
                  placeholderTextColor={colors.muted}
                  style={{ flex: 1, minHeight: 50, color: colors.text }}
                />
              </View>
              {(intentError || interpreting) && (
                <Text accessibilityRole="alert" style={{ color: colors.text }}>
                  {t(intentError ?? 'intentInterpreting')}
                </Text>
              )}
              <Button
                label={t('updateResults')}
                onPress={() => void applySearch()}
                disabled={interpreting}
              />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={preview !== undefined}
        animationType="slide"
        onRequestClose={() => {
          if (!trashInFlight.current) setPreview(undefined);
        }}
      >
        <SafeAreaProvider>
          <SafeAreaView style={styles.screen}>
            {preview && (
              <>
                <View style={styles.reviewHeader}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.reasonTitle}>
                      {t('reviewSelection')}
                    </Text>
                    <Text style={{ color: colors.muted }}>
                      {t('selectionCount', { count: selected.length })}
                    </Text>
                  </View>
                  <IconButton
                    name="close"
                    label={t('closePreview')}
                    onPress={() => {
                      if (!trashInFlight.current) setPreview(undefined);
                    }}
                  />
                </View>
                <ScrollView
                  contentContainerStyle={styles.reviewContent}
                  style={styles.modal}
                >
                  {selected.length > 0 && (
                    <ScrollView
                      horizontal
                      style={{ flexGrow: 0 }}
                      contentContainerStyle={{ gap: 8 }}
                    >
                      {page.assets
                        .filter((asset) => selected.includes(asset.id))
                        .map((asset) => (
                          <Pressable
                            key={asset.id}
                            accessibilityRole="button"
                            accessibilityLabel={t('openPreview')}
                            accessibilityState={{
                              selected: asset.id === preview.id,
                            }}
                            onPress={() => setPreview(asset)}
                            style={{
                              width: 64,
                              height: 76,
                              borderWidth: 2,
                              borderColor:
                                asset.id === preview.id
                                  ? colors.selectionBorder
                                  : 'transparent',
                            }}
                          >
                            <Thumbnail asset={asset} />
                          </Pressable>
                        ))}
                    </ScrollView>
                  )}
                  <Thumbnail asset={preview} expanded />
                  <Text style={{ color: colors.text }}>
                    {new Date(preview.createdAt).toLocaleDateString(
                      i18n.language,
                    )}
                  </Text>
                  <Text style={{ color: colors.text }}>
                    {t('dimensions', {
                      width: preview.width,
                      height: preview.height,
                    })}
                  </Text>
                  {preview.fileSize !== undefined && (
                    <Text style={{ color: colors.text }}>
                      {t('sizeMB', {
                        size: (preview.fileSize / 1048576).toLocaleString(
                          i18n.language,
                          { maximumFractionDigits: 1 },
                        ),
                      })}
                    </Text>
                  )}
                  {preview.duration !== undefined && (
                    <Text style={{ color: colors.text }}>
                      {t('durationSeconds', {
                        seconds: Math.round(preview.duration),
                      })}
                    </Text>
                  )}
                  {preview.isFavorite && (
                    <Text style={{ color: colors.text }}>
                      {t('filter_favorites')}
                    </Text>
                  )}
                  {(category === 'screenshots' ||
                    duplicate ||
                    similar ||
                    minBlur !== undefined ||
                    minFileSize !== undefined ||
                    before !== undefined ||
                    Boolean(ocrTerms?.length)) && (
                    <View style={styles.reasons}>
                      <Text style={styles.reasonTitle}>{t('whySelected')}</Text>
                      {category === 'screenshots' && (
                        <Text style={{ color: colors.text }}>
                          {t('reasonScreenshot')}
                        </Text>
                      )}
                      {duplicate && (
                        <Text style={{ color: colors.text }}>
                          {t('reasonDuplicate')}
                        </Text>
                      )}
                      {similar && (
                        <Text style={{ color: colors.text }}>
                          {t('reasonSimilar')}
                        </Text>
                      )}
                      {minBlur !== undefined && (
                        <Text style={{ color: colors.text }}>
                          {t('reasonBlurry')}
                        </Text>
                      )}
                      {minFileSize !== undefined && (
                        <Text style={{ color: colors.text }}>
                          {t('reasonLargeMedia')}
                        </Text>
                      )}
                      {before !== undefined && (
                        <Text style={{ color: colors.text }}>
                          {t('reasonOldMedia')}
                        </Text>
                      )}
                      {ocrTerms?.length ? (
                        <Text style={{ color: colors.text }}>
                          {t('reasonOcr')}
                        </Text>
                      ) : null}
                    </View>
                  )}
                  {
                    <Button
                      variant="outline"
                      disabled={busy}
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
                  }
                  <Text style={styles.placeholder}>{t('previewHint')}</Text>
                </ScrollView>
                <View style={styles.reviewFooter}>
                  {selected.length > 0 && (
                    <>
                      <Button
                        label={t('moveToTrash')}
                        disabled={busy}
                        onPress={() => {
                          const ids = [...selected];

                          Alert.alert(
                            t('confirmMoveToTrashTitle'),
                            t('confirmMoveToTrashMessage', {
                              count: ids.length,
                            }),
                            [
                              { text: t('cancel'), style: 'cancel' },
                              {
                                text: t('moveToTrash'),
                                style: 'destructive',
                                onPress: () => {
                                  if (trashInFlight.current) return;
                                  trashInFlight.current = true;
                                  void (async () => {
                                    setBusy(true);
                                    setError(undefined);
                                    try {
                                      const result =
                                        await libraryReader.trashAssets?.({
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
                                      if (result.value.cancelled) return;
                                      await repository.removeAssets(
                                        result.value.trashedIds,
                                      );
                                      await repository.recordCleanup(
                                        result.value.trashedIds,
                                        page.assets
                                          .filter((asset) =>
                                            result.value.trashedIds.includes(
                                              asset.id,
                                            ),
                                          )
                                          .reduce(
                                            (sum, asset) =>
                                              sum + (asset.fileSize ?? 0),
                                            0,
                                          ),
                                        result.value.cancelled
                                          ? 'cancelled'
                                          : 'trashed',
                                      );
                                      setSelected([]);
                                      setPreview(undefined);
                                      setBusy(false);
                                      void load();
                                    } catch {
                                      setError('UNKNOWN');
                                    } finally {
                                      trashInFlight.current = false;
                                      setBusy(false);
                                    }
                                  })();
                                },
                              },
                            ],
                          );
                        }}
                      />
                      <Text style={styles.placeholder}>
                        {t('trashSafetyNote')}
                      </Text>
                    </>
                  )}
                  {error && (
                    <Text
                      accessibilityRole="alert"
                      style={{ color: colors.text }}
                    >
                      {t(
                        error === 'DEVICE_UNSUPPORTED'
                          ? 'trashUnavailable'
                          : 'trashError',
                      )}
                    </Text>
                  )}
                </View>
              </>
            )}
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </SafeAreaView>
  );
}
const createStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { ...layout.content, paddingTop: 24, gap: 10 },
    header: { gap: 14, marginBottom: 16 },
    filterBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      marginTop: 6,
      marginBottom: 12,
    },
    filterEdit: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 72,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    filterAffordance: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.selected,
      borderRadius: 10,
      transform: [{ rotate: '90deg' }],
    },
    filterClear: {
      borderLeftWidth: 1,
      borderColor: colors.border,
      marginRight: 4,
    },
    title: { fontSize: 28, color: colors.text, fontWeight: '700' },
    filters: { gap: 8 },
    modal: {
      flex: 1,
      backgroundColor: colors.background,
    },
    reviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    reviewContent: { padding: 20, gap: 14 },
    reviewFooter: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 16,
      gap: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    placeholder: { color: colors.muted, textAlign: 'center', fontSize: 12 },
    reasons: {
      gap: 4,
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
    },
    reasonTitle: { color: colors.text, fontWeight: '700' },
  });
