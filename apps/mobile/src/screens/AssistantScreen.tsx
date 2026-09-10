import { useCallback, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Icon, layout, useTheme, type IconName } from '@seleva/ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { Reveal, useReducedMotion } from '../components/Motion';
import { useLibrary } from '../features/library/LibraryProvider';
import { LibraryStatus } from '../features/library/LibraryStatus';
import { usePromptInterpreter } from '../features/search/usePromptInterpreter';
import { usePhotoRepository } from '../services/database';
import type { Selection } from '@seleva/core';

function SummaryCard({
  label,
  detail,
  icon,
  params,
}: {
  label: string;
  detail: string;
  icon: IconName;
  params: Record<string, string>;
}) {
  const colors = useTheme();
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  function animate(toValue: number) {
    Animated.spring(scale, {
      toValue,
      speed: 28,
      bounciness: 3,
      useNativeDriver: true,
    }).start();
  }
  return (
    <Animated.View style={{ width: '48%', transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/library', params })}
        onPressIn={() => {
          if (!reduced) animate(0.97);
        }}
        onPressOut={() => animate(1)}
        style={[
          styles.card,
          { backgroundColor: colors.subtle, borderColor: colors.border },
        ]}
      >
        <Icon name={icon} size={22} color={colors.selectionBorder} />
        <Text
          style={{
            color: colors.text,
            fontSize: 14,
            fontWeight: '500',
            marginTop: 14,
          }}
        >
          {label}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>
          {detail}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function AssistantScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const [prompt, setPrompt] = useState('');
  const { interpret, interpreting, intentError, clearIntentError } =
    usePromptInterpreter();
  const [focused, setFocused] = useState(false);
  const repository = usePhotoRepository();
  const { synchronize, insights } = useLibrary();
  const [savedSelections, setSavedSelections] = useState<Selection[]>([]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void synchronize();
      void repository
        .getSelections()
        .then((selections) => {
          if (active) setSavedSelections(selections);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [repository, synchronize]),
  );
  async function submit() {
    const result = await interpret(prompt);
    if (!result) return;
    router.push({
      pathname: '/library',
      params: {
        prompt: prompt.trim(),
        query: JSON.stringify(result.query),
        notice: result.notice ? '1' : undefined,
      },
    });
  }
  function confirmDeleteSelection(selection: Selection) {
    Alert.alert(
      t('deleteSavedSelectionTitle'),
      t('deleteSavedSelectionMessage', { name: selection.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('deleteSavedSelection'),
          style: 'destructive',
          onPress: () => {
            void repository.deleteSelection(selection.id).then((deleted) => {
              if (deleted) {
                setSavedSelections((current) =>
                  current.filter(({ id }) => id !== selection.id),
                );
              }
            });
          },
        },
      ],
    );
  }
  function sectionHeader(label: string, category: 'photos' | 'videos') {
    return (
      <View style={[layout.row, styles.sectionHeader]}>
        <Text
          accessibilityRole="header"
          style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}
        >
          {label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            category === 'photos' ? 'allPhotos' : 'allVideos',
          )}
          onPress={() =>
            router.push({ pathname: '/library', params: { category } })
          }
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {t('viewAll')}
          </Text>
        </Pressable>
      </View>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader home />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          layout.content,
          { paddingTop: 28, paddingBottom: 36 },
        ]}
      >
        <Reveal>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: colors.text }]}
          >
            {t('greeting')}
          </Text>
          <View
            style={[
              styles.prompt,
              {
                backgroundColor: colors.surface,
                borderColor: focused ? colors.selectionBorder : colors.border,
              },
            ]}
          >
            <View style={layout.row}>
              <Icon name="sparkles" color={colors.selectionBorder} size={24} />
              <TextInput
                value={prompt}
                onChangeText={(value) => {
                  setPrompt(value);
                  clearIntentError();
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onSubmitEditing={() => void submit()}
                returnKeyType="search"
                maxLength={500}
                placeholder={t('assistantPlaceholder')}
                accessibilityLabel={t('greeting')}
                placeholderTextColor={colors.muted}
                style={{
                  flex: 1,
                  color: colors.text,
                  fontSize: 16,
                  minHeight: 64,
                }}
              />
            </View>
            <Pressable
              onPress={() => void submit()}
              disabled={!prompt.trim() || interpreting}
              accessibilityRole="button"
              accessibilityLabel={t('search')}
              accessibilityState={{
                disabled: !prompt.trim() || interpreting,
              }}
              style={({ pressed }) => [
                styles.send,
                {
                  backgroundColor: prompt.trim()
                    ? colors.accent
                    : colors.selected,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
            >
              <Icon
                name="arrow"
                color={prompt.trim() ? colors.primary : colors.muted}
                size={22}
              />
            </Pressable>
          </View>
          {(intentError || interpreting) && (
            <Text
              accessibilityRole="alert"
              style={{ color: colors.text, marginTop: 8 }}
            >
              {t(intentError ?? 'intentInterpreting')}
            </Text>
          )}
        </Reveal>
        <LibraryStatus />
        <Reveal delay={100}>
          {sectionHeader(t('filter_photos'), 'photos')}
          <View style={styles.grid}>
            <SummaryCard
              label={t('filter_screenshots')}
              detail={
                insights
                  ? t('insightItems', { count: insights.screenshots })
                  : t('viewResults')
              }
              icon="screenshots"
              params={{ category: 'screenshots' }}
            />
            <SummaryCard
              label={t('similarPhotos')}
              detail={
                insights
                  ? t('insightItems', { count: insights.similarPhotos })
                  : t('viewResults')
              }
              icon="similar"
              params={{ category: 'photos', similar: '1' }}
            />
            <SummaryCard
              label={t('blurryPhotos')}
              detail={
                insights
                  ? t('insightItems', { count: insights.blurry })
                  : t('viewResults')
              }
              icon="space"
              params={{ category: 'photos', minBlur: '0.55' }}
            />
          </View>
        </Reveal>
        {savedSelections.length > 0 && (
          <Reveal delay={140}>
            <View style={[layout.row, styles.sectionHeader]}>
              <Text
                accessibilityRole="header"
                style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}
              >
                {t('savedSelections')}
              </Text>
            </View>
            <View style={styles.grid}>
              {savedSelections.map((selection) => (
                <View
                  key={selection.id}
                  style={[
                    styles.savedSelection,
                    { backgroundColor: colors.subtle, borderColor: colors.border },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={selection.name}
                    onPress={() =>
                      router.push({
                        pathname: '/library',
                        params: { selectionId: selection.id },
                      })
                    }
                    style={styles.savedSelectionOpen}
                  >
                    <Icon name="check" size={22} color={colors.selectionBorder} />
                    <Text
                      numberOfLines={1}
                      style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginTop: 14 }}
                    >
                      {selection.name}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>
                      {t('savedSelectionItems', { count: selection.assetIds.length })}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('deleteSavedSelection')}
                    onPress={() => confirmDeleteSelection(selection)}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.deleteSelection,
                      { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Icon name="close" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          </Reveal>
        )}
        <Reveal delay={180}>
          {sectionHeader(t('filter_videos'), 'videos')}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/library',
                params: { category: 'videos', minFileSize: '524288000' },
              })
            }
            style={({ pressed }) => [
              styles.videoCard,
              {
                backgroundColor: colors.subtle,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Icon name="space" color={colors.selectionBorder} size={28} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text
                style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}
              >
                {t('largeVideoModule')}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {insights
                  ? t('insightItems', { count: insights.largeVideos })
                  : t('viewResults')}
              </Text>
            </View>
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <Icon name="arrow" size={18} />
            </View>
          </Pressable>
        </Reveal>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  title: {
    fontSize: 32,
    lineHeight: 39,
    letterSpacing: -1.2,
    fontWeight: '600',
    marginBottom: 24,
    maxWidth: 290,
  },
  prompt: { borderWidth: 1, borderRadius: 24, padding: 16, minHeight: 140 },
  send: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  card: { padding: 16, borderRadius: 20, borderWidth: 1, minHeight: 135 },
  savedSelection: {
    width: '48%',
    minHeight: 135,
    borderRadius: 20,
    borderWidth: 1,
    position: 'relative',
  },
  savedSelectionOpen: { flex: 1, padding: 16 },
  deleteSelection: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
});
