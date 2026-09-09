import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Button, Icon, layout, useTheme } from '@seleva/ui';
import { useLibrary } from './LibraryProvider';

export function formatStorage(bytes: number, locale: string) {
  const gb = bytes / 1_000_000_000;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: gb >= 1 ? 'gigabyte' : 'megabyte',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(gb >= 1 ? gb : bytes / 1_000_000);
}
export function LibraryStatus() {
  const { t, i18n } = useTranslation();
  const colors = useTheme();
  const {
    phase,
    analysisStage,
    permission,
    job,
    insights,
    error,
    retry,
    refresh,
  } = useLibrary();
  const busy = ['opening', 'metadata', 'analysis'].includes(phase);
  const denied = phase === 'permission';
  return (
    <View
      style={{
        gap: 12,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={layout.row}>
        {busy ? (
          <ActivityIndicator color={colors.selectionBorder} />
        ) : (
          <Icon name="sparkles" color={colors.selectionBorder} />
        )}
        <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>
          {t(
            denied
              ? 'libraryAccessTitle'
              : phase === 'error'
                ? 'preparationFailed'
                : phase === 'ready'
                  ? insights?.pending
                    ? 'scanPartial'
                    : 'scanReady'
                  : phase === 'paused'
                    ? 'scanPaused'
                    : phase === 'analysis'
                      ? analysisStage === 'deep'
                        ? 'deepAnalysis'
                        : 'fastAnalysis'
                      : 'preparingLibrary',
          )}
        </Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
        {t(
          denied
            ? 'libraryAccessHint'
            : busy
              ? 'preparationHint'
              : 'scanCounts',
          { count: insights?.total ?? 0 },
        )}
      </Text>
      {busy && job && (
        <>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: job.total, now: job.processed }}
            style={{
              height: 4,
              borderRadius: 4,
              backgroundColor: colors.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: 4,
                width: `${job.total ? Math.min(100, (job.processed / job.total) * 100) : 0}%`,
                backgroundColor: colors.selectionBorder,
              }}
            />
          </View>
          <Text style={{ fontSize: 11, color: colors.muted }}>
            {t('scanWork', { processed: job.processed, total: job.total })}
          </Text>
        </>
      )}
      {permission === 'limited' && (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {t('limitedLibrary')}
        </Text>
      )}
      {insights && (
        <>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            {t('preanalysisSummary')}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {t('metadataAvailable', { count: insights.total })}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {t('stagedAnalysisAvailable', {
              count: Math.max(0, insights.total - insights.fastPending),
              pending: insights.pending,
            })}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
            {t('savedAnalysisHint')}
          </Text>
          <Button
            variant="outline"
            label={t('openLibrary')}
            onPress={() => router.push('/library')}
          />

          <Pressable
            accessibilityRole="button"
            disabled={!insights.duplicateCopies}
            onPress={() =>
              router.push({ pathname: '/library', params: { duplicate: '1' } })
            }
          >
            <Text
              style={{ fontSize: 20, fontWeight: '600', color: colors.text }}
            >
              {insights.duplicateBytes > 0
                ? t('savingsEstimate', {
                    size: formatStorage(insights.duplicateBytes, i18n.language),
                  })
                : t(busy ? 'savingsPending' : 'savingsNone')}
            </Text>
          </Pressable>
          {insights.duplicateBytes > 0 && (
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
              {t('savingsHint')}
            </Text>
          )}
          {insights.largeVideoBytes > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/library',
                  params: { category: 'videos', minFileSize: '524288000' },
                })
              }
            >
              <Text style={{ color: colors.text, fontSize: 13 }}>
                {t('largeReviewBytes', {
                  size: formatStorage(insights.largeVideoBytes, i18n.language),
                })}
              </Text>
            </Pressable>
          )}
          {insights.unknownSizes > 0 && (
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {t('partialSizes')}
            </Text>
          )}
        </>
      )}
      {!busy && !denied && (
        <Button
          variant="outline"
          label={t('refreshIndex')}
          onPress={() => void refresh()}
        />
      )}
      {(denied || permission === 'limited') && (
        <Button
          label={t('openSettings')}
          onPress={() => {
            void Linking.openSettings().catch(() => retry());
          }}
        />
      )}
      {phase === 'error' && (
        <>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {t(
              error === 'DEVICE_UNSUPPORTED'
                ? 'libraryHint'
                : error === 'ANALYSIS_PENDING'
                  ? 'initialPreparationPending'
                  : 'permissionError',
            )}
          </Text>
          <Button
            variant="outline"
            label={t('retry')}
            onPress={() => void retry()}
          />
        </>
      )}
    </View>
  );
}
