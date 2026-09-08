import { useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon, layout, useTheme } from '@seleva/ui';
import { usePreferences } from '../stores/preferences';
import { usePhotoRepository } from '../services/database';
import { ScreenHeader } from '../components/ScreenHeader';
export function SettingsScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const { locale, themeMode, setLocale, setThemeMode } = usePreferences();
  const repository = usePhotoRepository();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  async function save(key: 'locale' | 'themeMode', value: string) {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      await repository.setPreference(key, value);
      if (
        key === 'locale' &&
        (value === 'en' || value === 'pt-BR' || value === 'es')
      )
        setLocale(value);
      if (key === 'themeMode' && (value === 'light' || value === 'dark'))
        setThemeMode(value);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={t('settings')} />
      <ScrollView
        contentContainerStyle={[
          layout.content,
          { flexGrow: 1, paddingTop: 24, paddingBottom: 28, gap: 34 },
        ]}
      >
        <View
          style={[
            layout.row,
            {
              backgroundColor: colors.primary,
              borderRadius: 22,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={{
              backgroundColor: colors.accent,
              padding: 10,
              borderRadius: 17,
            }}
          >
            <Icon name="sparkles" color={colors.primary} size={24} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text
              style={{
                color: colors.onPrimary,
                fontWeight: '600',
                fontSize: 14,
              }}
            >
              {t('personalize')}
            </Text>
            <Text
              style={{ color: colors.accent, fontSize: 12, lineHeight: 18 }}
            >
              {t('personalizeHint')}
            </Text>
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Text style={[layout.eyebrow, { color: colors.muted }]}>
            {t('appearance')}
          </Text>
          <View
            style={[
              layout.row,
              {
                gap: 4,
                padding: 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 24,
                backgroundColor: colors.surface,
              },
            ]}
          >
            {(['light', 'dark'] as const).map((mode) => (
              <Pressable
                key={mode}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: themeMode === mode,
                  disabled: saving,
                }}
                disabled={saving}
                onPress={() => void save('themeMode', mode)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 16,
                  borderRadius: 18,
                  backgroundColor:
                    themeMode === mode ? colors.selected : 'transparent',
                }}
              >
                <Icon
                  name={mode === 'light' ? 'sun' : 'moon'}
                  color={
                    themeMode === mode
                      ? mode === 'dark'
                        ? colors.accent
                        : colors.primary
                      : colors.muted
                  }
                />
                <Text
                  style={{
                    color: themeMode === mode ? colors.text : colors.muted,
                    fontSize: 14,
                  }}
                >
                  {t(mode === 'light' ? 'lightTheme' : 'darkTheme')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Text style={[layout.eyebrow, { color: colors.muted }]}>
            {t('language')}
          </Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 24,
              overflow: 'hidden',
              backgroundColor: colors.surface,
            }}
          >
            {(
              [
                { value: 'pt-BR', label: 'portuguese' },
                { value: 'en', label: 'english' },
                { value: 'es', label: 'spanish' },
              ] as const
            ).map((item, index) => (
              <Pressable
                key={item.value}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: locale === item.value,
                  disabled: saving,
                }}
                disabled={saving}
                onPress={() => void save('locale', item.value)}
                style={[
                  layout.row,
                  {
                    justifyContent: 'space-between',
                    minHeight: 53,
                    paddingHorizontal: 17,
                    borderTopWidth: index ? 1 : 0,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={{ color: colors.text, fontSize: 14 }}>
                  {t(item.label)}
                </Text>
                {locale === item.value && (
                  <Icon name="check" color={colors.selectionBorder} size={16} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
        {error && (
          <Text accessibilityRole="alert" style={{ color: colors.text }}>
            {t('saveError')}
          </Text>
        )}
        <View style={{ flex: 1 }} />
        <Text
          style={{ textAlign: 'center', fontSize: 12, color: colors.muted }}
        >
          {t('autoSaved')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
