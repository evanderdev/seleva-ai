import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, theme } from '@seleva/ui';
import { usePreferences } from '../stores/preferences';
import type { Messages } from '../i18n/messages';
import { useState } from 'react';
import { usePhotoRepository } from '../services/database';
import type { Locale } from '../i18n';
import { LibraryPermissionCard } from '../components/LibraryPermissionCard';
import { router } from 'expo-router';

export type ScreenName = 'home' | 'search' | 'clean' | 'library' | 'settings';
const descriptions: Record<Exclude<ScreenName, 'settings'>, keyof Messages> = {
  home: 'foundation',
  search: 'searchHint',
  clean: 'cleanHint',
  library: 'libraryHint',
};
export function FoundationScreen({ screen }: { screen: ScreenName }) {
  const { t } = useTranslation();
  const { locale, setLocale, themeMode, setThemeMode } = usePreferences();
  const repository = usePhotoRepository();
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  async function changeLocale(value: Locale) {
    if (saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await repository.setPreference('locale', value);
      setLocale(value);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.background}
    >
      <Text accessibilityRole="header" style={styles.title}>
        {t(screen === 'home' ? 'welcome' : screen)}
      </Text>
      {screen === 'home' && <Text style={styles.body}>{t('tagline')}</Text>}
      {screen === 'home' && (
        <>
          <Button
            label={t('browseLibrary')}
            onPress={() => router.push('/library')}
          />
          <Button label={t('search')} onPress={() => router.push('/search')} />
          <Button label={t('clean')} onPress={() => router.push('/clean')} />
        </>
      )}
      {(screen === 'home' || screen === 'library') && <LibraryPermissionCard />}
      {screen === 'settings' ? (
        <Card>
          <Text style={styles.subtitle}>{t('appearance')}</Text>
          <Button
            label={t('lightTheme')}
            selected={themeMode === 'light'}
            onPress={() => {
              setThemeMode('light');
              void repository.setPreference('themeMode', 'light');
            }}
          />
          <Button
            label={t('darkTheme')}
            selected={themeMode === 'dark'}
            onPress={() => {
              setThemeMode('dark');
              void repository.setPreference('themeMode', 'dark');
            }}
          />
          <Text style={styles.subtitle}>{t('language')}</Text>
          <Button
            label={t('english')}
            selected={locale === 'en'}
            onPress={() => {
              void changeLocale('en');
            }}
          />
          <Button
            label={t('portuguese')}
            selected={locale === 'pt-BR'}
            onPress={() => {
              void changeLocale('pt-BR');
            }}
          />
          <Button
            label={t('spanish')}
            selected={locale === 'es'}
            onPress={() => {
              void changeLocale('es');
            }}
          />
          {saveError && <Text accessibilityRole="alert">{t('saveError')}</Text>}
        </Card>
      ) : (
        <Card>
          <Text style={styles.body}>{t(descriptions[screen])}</Text>
        </Card>
      )}
      <Card>
        <Text style={styles.subtitle}>{t('privacyTitle')}</Text>
        <Text style={styles.body}>{t('privacy')}</Text>
      </Card>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  background: { backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  title: { fontSize: 32, fontWeight: '700', color: theme.colors.text },
  subtitle: { fontSize: 20, fontWeight: '600', color: theme.colors.text },
  body: { fontSize: 17, lineHeight: 26, color: theme.colors.muted },
});
