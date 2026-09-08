import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, theme } from '@seleva/ui';
import { usePhotoRepository } from '../services/database';
import { runLibraryScan } from '../services/scanner';
import type { ScanJob } from '@seleva/core';

export function LibraryIndexCard() {
  const { t } = useTranslation();
  const repository = usePhotoRepository();
  const [job, setJob] = useState<ScanJob>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void repository.getLatestScanJob().then((latest) => {
      if (active && latest && latest.status !== 'completed') setJob(latest);
    });
    return () => {
      active = false;
    };
  }, [repository]);

  async function indexLibrary() {
    setBusy(true);
    try {
      const result = await runLibraryScan(repository, job?.id, {
        onProgress: setJob,
      });
      if (result) setJob(result);
    } finally {
      setBusy(false);
    }
  }

  const progress = job?.total
    ? Math.min(1, job.processed / job.total)
    : undefined;
  return (
    <Card>
      <View style={styles.content}>
        <Text style={styles.title}>{t('indexLibrary')}</Text>
        <Text style={styles.description}>
          {job?.status === 'completed'
            ? t('indexComplete', { count: job.processed })
            : job?.status === 'failed'
              ? t('indexFailed')
              : job?.status === 'paused'
                ? t('indexPaused', { count: job.processed })
                : t('indexDescription')}
        </Text>
        {progress !== undefined && (
          <Text style={styles.progress}>
            {t('indexProgress', {
              processed: job?.processed ?? 0,
              total: job?.total ?? 0,
              percent: Math.round(progress * 100),
            })}
          </Text>
        )}
        <Button
          label={t(job?.status === 'paused' ? 'resumeIndexing' : 'startIndexing')}
          disabled={busy || job?.status === 'completed'}
          onPress={() => {
            void indexLibrary();
          }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.sm },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: '700' },
  description: { color: theme.colors.muted, lineHeight: 20 },
  progress: { color: theme.colors.primary, fontWeight: '700' },
});
