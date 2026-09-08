import { useLibrary } from '../features/library/LibraryProvider';
import { LibraryStatus } from '../features/library/LibraryStatus';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Icon, layout, useTheme, type IconName } from '@seleva/ui';
import { libraryReader, type LibraryPage } from '@seleva/photo-engine';
import { ScreenHeader } from '../components/ScreenHeader';
import { Thumbnail } from './LibraryScreen';
import { planPrompt, promptSchema } from '../features/search/prompt';
const suggestions: {
  label: string;
  hint: string;
  icon: IconName;
  params: Record<string, string>;
}[] = [
  {
    label: 'freeSpace',
    hint: 'reviewLarge',
    icon: 'space',
    params: { category: 'videos', minFileSize: String(500 * 1024 * 1024) },
  },
  {
    label: 'similarPhotos',
    hint: 'exploreGroups',
    icon: 'similar',
    params: { similar: '1' },
  },
  {
    label: 'filter_screenshots',
    hint: 'exploreGroups',
    icon: 'screenshots',
    params: { category: 'screenshots' },
  },
  {
    label: 'findBlurry',
    hint: 'exploreGroups',
    icon: 'space',
    params: { minBlur: '0.55' },
  },
  {
    label: 'findDuplicates',
    hint: 'exploreGroups',
    icon: 'similar',
    params: { duplicate: '1' },
  },
];
export function AssistantScreen() {
  const { t, i18n } = useTranslation();
  const colors = useTheme();
  const [prompt, setPrompt] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [assets, setAssets] = useState<LibraryPage['assets']>([]);
  const { synchronize, refresh, phase, permission, insights } = useLibrary();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void synchronize();
      if (permission !== 'authorized' && permission !== 'limited') {
        setAssets([]);
        return;
      }
      void libraryReader.listAssets({ limit: 3 }).then((result) => {
        if (active) setAssets(result.ok ? result.value.assets : []);
      });
      return () => {
        active = false;
        setAssets([]);
      };
    }, [permission, phase, synchronize]),
  );
  function submit() {
    const parsed = promptSchema.safeParse(prompt);
    setInvalid(!parsed.success);
    if (!parsed.success) return;
    const p = planPrompt(parsed.data);
    router.push({
      pathname: '/library',
      params: {
        prompt: parsed.data,
        category: p.category,
        before: p.before?.toString(),
        minFileSize: p.minFileSize?.toString(),
        duplicate: p.duplicate ? '1' : undefined,
        similar: p.similar ? '1' : undefined,
        minBlur: p.minBlur?.toString(),
        ocrTerms: p.ocrTerms?.join(','),
      },
    });
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader home />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          layout.content,
          { flexGrow: 1, paddingTop: 24, paddingBottom: 24 },
        ]}
      >
        <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 10 }}>
          {new Date().toLocaleDateString(i18n.language, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
        <Text style={[layout.title, { color: colors.text, marginBottom: 38 }]}>
          {t('greeting')}
        </Text>
        <Text
          style={[layout.eyebrow, { color: colors.muted, marginBottom: 10 }]}
        >
          {t('searchLabel')}
        </Text>
        <View
          style={[
            layout.row,
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 20,
              paddingHorizontal: 16,
              minHeight: 62,
              boxShadow: '0 6px 22px rgba(32,55,35,0.04)',
            },
          ]}
        >
          <Icon name="search" />
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            onSubmitEditing={submit}
            returnKeyType="search"
            maxLength={500}
            placeholder={t('assistantPlaceholder')}
            accessibilityLabel={t('searchLabel')}
            placeholderTextColor={colors.muted}
            style={{ flex: 1, color: colors.text, fontSize: 14, minHeight: 58 }}
          />
          <Pressable
            onPress={submit}
            accessibilityRole="button"
            accessibilityLabel={t('findPhotos')}
            style={{
              width: 34,
              height: 34,
              borderRadius: 13,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="arrow" color={colors.accent} size={18} />
          </Pressable>
        </View>
        {invalid && (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.text, marginTop: 8 }}
          >
            {t('invalidPrompt')}
          </Text>
        )}
        <View
          style={[
            layout.row,
            {
              justifyContent: 'space-between',
              marginTop: 40,
              marginBottom: 14,
            },
          ]}
        >
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>
            {t('startHere')}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {t('tapExplore')}
          </Text>
        </View>
        <ScrollView
          horizontal
          style={{ flexGrow: 0 }}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {suggestions.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/library',
                  params: {
                    ...item.params,
                  },
                })
              }
              style={({ pressed }) => ({
                width: 150,
                minHeight: 135,
                padding: 16,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.subtle,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{ alignSelf: 'flex-start', marginBottom: 22 }}>
                <Icon name={item.icon} size={18} />
              </View>
              <Text
                style={{ color: colors.text, fontSize: 13, marginBottom: 5 }}
              >
                {t(item.label)}
              </Text>
              <Text
                style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}
              >
                {insights && item.label !== 'similarPhotos'
                  ? t('insightItems', {
                      count:
                        item.label === 'filter_screenshots'
                          ? insights.screenshots
                          : item.label === 'findBlurry'
                            ? insights.blurry
                            : item.label === 'findDuplicates'
                              ? insights.duplicateCopies
                              : item.label === 'freeSpace'
                                ? insights.largeVideos
                                : 0,
                    })
                  : t(item.hint)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <LibraryStatus />
        <View style={{ marginTop: 24, gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/library')}
          >
            <Text
              style={{ fontSize: 18, fontWeight: '600', color: colors.text }}
            >
              {t('yourLibrary')}
            </Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {t('calmLibrary')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refresh()}
            disabled={phase === 'metadata' || phase === 'analysis'}
          >
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {t('refreshIndex')}
            </Text>
          </Pressable>
          {assets.length > 0 ? (
            <View style={[layout.row, { gap: 10, marginTop: 6 }]}>
              {assets.map((asset) => (
                <Pressable
                  key={asset.id}
                  accessibilityRole="button"
                  accessibilityLabel={t('openLibrary')}
                  onPress={() => router.push('/library')}
                  style={{
                    flex: 1,
                    height: 150,
                    borderRadius: 18,
                    overflow: 'hidden',
                  }}
                >
                  <Thumbnail asset={asset} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minHeight: 64 }} />
        <View style={[layout.row, { gap: 8, paddingTop: 20 }]}>
          <Icon name="lock" size={14} />
          <Text style={{ flex: 1, color: colors.muted, fontSize: 11 }}>
            {t('privateFooter')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
