import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, theme } from '@seleva/ui';
import { usePhotoRepository } from '../services/database';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function LibrarySummaryCard() {
  const { t, i18n } = useTranslation();
  const repository = usePhotoRepository();
  const [summary, setSummary] = useState({ photos: 0, videos: 0, knownBytes: 0 });
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void repository.getSummary().then((value) => {
        if (active) setSummary(value);
      });
      return () => {
        active = false;
      };
    }, [repository]),
  );
  const total = summary.photos + summary.videos;
  if (total === 0) return null;
  return (
    <Card>
      <View style={styles.content}>
        <Text style={styles.title}>{t('librarySummary')}</Text>
        <Text style={styles.total}>
          {total.toLocaleString(i18n.language)} {t('indexedMedia')}
        </Text>
        <View style={styles.row}>
          <Text style={styles.detail}>{t('photosCount', { count: summary.photos })}</Text>
          <Text style={styles.detail}>{t('videosCount', { count: summary.videos })}</Text>
        </View>
        <Text style={styles.detail}>
          {t('knownStorage', { size: formatBytes(summary.knownBytes) })}
        </Text>
        <Button label={t('openLibrary')} onPress={() => router.push('/library')} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.sm },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: '700' },
  total: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
  row: { flexDirection: 'row', gap: theme.spacing.md },
  detail: { color: theme.colors.muted },
});
