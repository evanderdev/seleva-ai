import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button, Card, theme } from '@seleva/ui';
import { LibraryPermissionCard } from '../components/LibraryPermissionCard';
import { LibraryIndexCard } from '../components/LibraryIndexCard';
import { LibrarySummaryCard } from '../components/LibrarySummaryCard';
import { usePreferences } from '../stores/preferences';

type Category = 'all' | 'photos' | 'videos' | 'screenshots' | 'favorites';
const promptSchema = z.string().trim().min(1).max(500);

function planPrompt(prompt: string): {
  category: Category;
  before?: number;
  minFileSize?: number;
  duplicate?: boolean;
  similar?: boolean;
  minBlur?: number;
  ocrTerms?: string[];
} {
  const value = prompt
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const category: Category = /screenshot|print|captura/.test(value)
    ? 'screenshots'
    : /video/.test(value)
      ? 'videos'
      : /favorite|favorit|favorito/.test(value)
        ? 'favorites'
        : /photo|foto/.test(value)
          ? 'photos'
          : 'all';
  const before = /old|older|antig|velh|year|ano/.test(value)
    ? new Date(new Date().setFullYear(new Date().getFullYear() - 1)).getTime()
    : undefined;
  const minFileSize = /large|grande|pesad/.test(value)
    ? 500 * 1024 * 1024
    : undefined;
  const duplicate = /duplicate|duplicat|repetid|igual/.test(value)
    ? true
    : undefined;
  const similar = /similar|parecid/.test(value) ? true : undefined;
  const minBlur = /blurry|blur|borrad|desfoc/.test(value) ? 0.55 : undefined;
  const ignored = /find|search|show|clean|old|older|photo|photos|foto|fotos|video|large|grande|blurry|blur|borrad|desfoc|duplicate|duplicat|similar|parecid|screenshot|print|captura|antig|velh|year|ano|favorites|favorit|favorito/g;
  const ocrTerms = value
    .replace(ignored, ' ')
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length >= 3)
    .slice(0, 5);
  return {
    category,
    before,
    minFileSize,
    duplicate,
    similar,
    minBlur,
    ocrTerms: ocrTerms.length ? ocrTerms : undefined,
  };
}

export function AssistantScreen() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const dark = usePreferences((state) => state.themeMode === 'dark');
  const suggestions = useMemo(
    () => ['cleanScreenshots', 'findBlurry', 'largeVideos', 'findDuplicates', 'oldPhotos'],
    [],
  );
  function submit(value = prompt) {
    const parsed = promptSchema.safeParse(value);
    if (!parsed.success) return;
    const plan = planPrompt(parsed.data);
    router.push({
      pathname: '/library',
      params: {
        category: plan.category,
        before: plan.before?.toString(),
        minFileSize: plan.minFileSize?.toString(),
        duplicate: plan.duplicate ? '1' : undefined,
        similar: plan.similar ? '1' : undefined,
        minBlur: plan.minBlur?.toString(),
        ocrTerms: plan.ocrTerms?.join(','),
      },
    });
  }
  return (
    <ScrollView
      style={[styles.screen, dark && styles.darkScreen]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{t('brand')}</Text>
        <Text style={styles.title}>{t('assistantTitle')}</Text>
        <Text style={styles.subtitle}>{t('assistantSubtitle')}</Text>
      </View>
      <Card dark={dark}>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          onSubmitEditing={() => submit()}
          returnKeyType="search"
          placeholder={t('assistantPlaceholder')}
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          accessibilityLabel={t('assistantPlaceholder')}
        />
        <Button
          label={t('findPhotos')}
          disabled={!prompt.trim()}
          onPress={() => submit()}
        />
      </Card>
      <Text style={styles.sectionTitle}>{t('suggestions')}</Text>
      <View style={styles.suggestions}>
        {suggestions.map((key) => (
          <Pressable
            key={key}
            style={[styles.suggestion, dark && styles.darkCard]}
            onPress={() => submit(t(key))}
            accessibilityRole="button"
          >
            <Text style={styles.suggestionText}>{t(key)}</Text>
            <Text style={styles.arrow}>â€º</Text>
          </Pressable>
        ))}
      </View>
      <LibraryPermissionCard />
      <LibraryIndexCard />
      <LibrarySummaryCard />
      <View style={styles.privateBadge}>
        <Text style={styles.privateTitle}>{t('privacyTitle')}</Text>
        <Text style={styles.privateText}>{t('privacy')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  darkScreen: { backgroundColor: '#14201D' },
  darkCard: { backgroundColor: '#24332F' },
  content: { padding: 24, gap: 20 },
  hero: { paddingTop: 18, gap: 8 },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    color: theme.colors.text,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
  },
  subtitle: { color: theme.colors.muted, fontSize: 18, lineHeight: 26 },
  input: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    color: theme.colors.text,
    fontSize: 17,
  },
  sectionTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '700' },
  suggestions: { gap: 10 },
  suggestion: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestionText: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  arrow: { color: theme.colors.primary, fontSize: 28 },
  privateBadge: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 18,
    gap: 4,
  },
  privateTitle: { color: theme.colors.text, fontWeight: '700' },
  privateText: { color: theme.colors.muted, lineHeight: 20 },
});
