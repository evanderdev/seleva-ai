import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button, Icon, layout, useTheme } from '@seleva/ui';
import { ScreenHeader } from '../components/ScreenHeader';
import { useLibrary } from '../features/library/LibraryProvider';

export function ProgressScreen() {
  const { t, i18n } = useTranslation();
  const colors = useTheme();
  const { phase, analysisStage, job, insights, retry } = useLibrary();
  const busy = ['opening', 'metadata', 'analysis'].includes(phase);
  const complete = phase === 'ready' && !insights?.pending;
  const total = job?.total ?? 0;
  const processed = Math.min(total, Math.max(0, job?.processed ?? 0));
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
  const stage =
    phase === 'analysis'
      ? analysisStage === 'deep'
        ? 'deepAnalysis'
        : 'fastAnalysis'
      : phase === 'metadata'
        ? 'progressReading'
        : phase === 'opening'
          ? 'progressOpening'
          : phase === 'paused'
            ? 'progressPaused'
            : phase === 'error'
              ? 'preparationFailed'
              : complete
                ? 'progressComplete'
                : 'progressSaved';
  const number = new Intl.NumberFormat(i18n.language);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={t('progressTitle')} />
      <ScrollView
        contentContainerStyle={[
          layout.content,
          { paddingTop: 28, paddingBottom: 32, gap: 24 },
        ]}
      >
        <Icon
          name={complete ? 'check' : 'sparkles'}
          size={32}
          color={colors.selectionBorder}
        />
        <Text
          accessibilityRole="header"
          style={[layout.title, { color: colors.text }]}
        >
          {t(stage)}
        </Text>
        <Text style={[layout.body, { color: colors.muted }]}>
          {t(busy ? 'progressHint' : 'progressSaved')}
        </Text>
        {(busy || phase === 'paused' || phase === 'error') && (
          <View
            style={{
              padding: 20,
              gap: 16,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {t('progressStage')}
            </Text>
            {total > 0 ? (
              <>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 26,
                    fontWeight: '600',
                  }}
                >
                  {t('progressPercent', { percent: number.format(percent) })}
                </Text>
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel={t('progressStage')}
                  accessibilityValue={{ min: 0, max: total, now: processed }}
                  style={{
                    height: 5,
                    borderRadius: 5,
                    backgroundColor: colors.border,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${percent}%`,
                      height: 5,
                      backgroundColor: colors.selectionBorder,
                    }}
                  />
                </View>
                <Text style={{ color: colors.text, fontSize: 14 }}>
                  {t('scanWork', {
                    processed: number.format(processed),
                    total: number.format(total),
                  })}
                </Text>
                <Text style={[layout.body, { color: colors.muted }]}>
                  {t('progressStepHint')}
                </Text>
              </>
            ) : busy ? (
              <View style={layout.row}>
                <ActivityIndicator size="small" color={colors.muted} />
                <Text style={{ color: colors.muted, flex: 1 }}>
                  {t('progressWaiting')}
                </Text>
              </View>
            ) : (
              <Text style={{ color: colors.muted }}>{t('progressSaved')}</Text>
            )}
          </View>
        )}
        {!!insights?.pending && phase !== 'metadata' && phase !== 'opening' && (
          <Text style={[layout.body, { color: colors.muted }]}>
            {t('progressRemaining', { count: insights.pending })}
          </Text>
        )}
        {busy && (
          <Text style={[layout.body, { color: colors.muted }]}>
            {t('progressDetails')}
          </Text>
        )}
        {(phase === 'paused' ||
          phase === 'error' ||
          (phase === 'ready' && !complete)) && (
          <Button
            label={t(phase === 'error' ? 'retry' : 'progressResume')}
            onPress={() => void retry()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
