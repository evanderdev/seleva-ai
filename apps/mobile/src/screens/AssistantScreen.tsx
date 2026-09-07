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
import { Button, Card, theme } from '@seleva/ui';
import { LibraryPermissionCard } from '../components/LibraryPermissionCard';
import { usePreferences } from '../stores/preferences';

type Category = 'all' | 'photos' | 'videos' | 'screenshots' | 'favorites';

function planPrompt(prompt: string): { category: Category; before?: number } {
  const value = prompt.toLocaleLowerCase();
  const category: Category = /screenshot|print|captura/.test(value)
    ? 'screenshots'
    : /video|vídeo/.test(value)
      ? 'videos'
      : /favorite|favorit|favorito/.test(value)
        ? 'favorites'
        : /photo|foto/.test(value)
          ? 'photos'
          : 'all';
  const before = /old|older|antig|velh|año|year|ano/.test(value)
    ? new Date(new Date().setFullYear(new Date().getFullYear() - 1)).getTime()
    : undefined;
  return { category, before };
}

export function AssistantScreen() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const dark = usePreferences((state) => state.themeMode === 'dark');
  const suggestions = useMemo(
    () => ['cleanScreenshots', 'findBlurry', 'largeVideos', 'oldPhotos'],
    [],
  );
  function submit(value = prompt) {
    if (!value.trim()) return;
    const plan = planPrompt(value);
    router.push({
      pathname: '/library',
      params: { category: plan.category, before: plan.before?.toString() },
    });
  }
  return (
    <ScrollView
      style={[styles.screen, dark && styles.darkScreen]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>SELEVA AI</Text>
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
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </View>
      <LibraryPermissionCard />
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
