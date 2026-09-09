import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button, Icon, layout, useTheme } from '@seleva/ui';
import { useLibrary } from '../features/library/LibraryProvider';

export function PreparationScreen() {
  const { t } = useTranslation();
  const colors = useTheme();
  const { phase, job, error, permission, retry } = useLibrary();
  const busy = ['opening', 'metadata', 'analysis'].includes(phase);
  const progress = job?.total
    ? Math.min(100, Math.round((job.processed / job.total) * 100))
    : 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[
          layout.content,
          {
            flexGrow: 1,
            justifyContent: 'center',
            gap: 24,
            paddingVertical: 40,
          },
        ]}
      >
        <Icon name="sparkles" size={36} color={colors.selectionBorder} />
        <Text
          accessibilityRole="header"
          style={[layout.title, { color: colors.text }]}
        >
          {t(
            phase === 'permission'
              ? 'libraryAccessTitle'
              : phase === 'error'
                ? 'preparationFailed'
                : phase === 'paused'
                  ? 'scanPaused'
                  : 'initialPreparationTitle',
          )}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 23 }}>
          {t(
            phase === 'permission'
              ? error === 'LIMITED_ACCESS_EMPTY'
                ? 'limitedLibraryEmpty'
                : 'libraryAccessHint'
              : error === 'ANALYSIS_PENDING'
                ? 'initialPreparationPending'
                : error === 'DEVICE_UNSUPPORTED'
                  ? 'queryUnavailable'
                  : phase === 'error'
                    ? 'permissionError'
                    : 'initialPreparationHint',
          )}
        </Text>
        {busy && (
          <ActivityIndicator size="small" color={colors.selectionBorder} />
        )}
        {busy && job && (
          <View style={{ gap: 10 }}>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: progress }}
              style={{
                height: 2,
                borderRadius: 6,
                backgroundColor: colors.border,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: 2,
                  width: `${progress}%`,
                  backgroundColor: colors.selectionBorder,
                }}
              />
            </View>
            <Text style={{ color: colors.muted }}>
              {t('scanWork', { processed: job.processed, total: job.total })}
            </Text>
          </View>
        )}
        {permission === 'limited' && (
          <Text style={{ color: colors.muted }}>{t('limitedLibrary')}</Text>
        )}
        {phase === 'permission' && (
          <Button
            label={t('openSettings')}
            onPress={() => {
              void Linking.openSettings().catch(() => retry());
            }}
          />
        )}
        {(phase === 'error' || phase === 'paused') && (
          <Button label={t('retry')} onPress={() => void retry()} />
        )}
        <View style={layout.row}>
          <Icon name="lock" size={16} />
          <Text style={{ flex: 1, color: colors.muted, fontSize: 12 }}>
            {t('privateFooter')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
