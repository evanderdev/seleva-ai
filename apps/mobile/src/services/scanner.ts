import type { PhotoRepository } from '@seleva/database';
import {
  createNativeAnalysisComposition,
  parseScanBatch,
  parseScanFailure,
  parseScanProgress,
  parseScanState,
  photoScanner,
} from '@seleva/photo-engine';
import type { ScanJob } from '@seleva/core';

export interface ScanCallbacks {
  metadataOnly?: boolean;
  fastOnly?: boolean;
  onCommitted?: () => void;
  onProgress?: (job: ScanJob) => void;
}

function newScanId(): string {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function runLibraryScan(
  repository: PhotoRepository,
  existingJobId?: string,
  callbacks: ScanCallbacks = {},
): Promise<ScanJob | undefined> {
  const existing = existingJobId
    ? await repository.getScanJob(existingJobId)
    : undefined;
  const job =
    existing ?? (await repository.createScanJob(newScanId(), Date.now()));
  if (job.status === 'completed') return job;
  const indexingAt = Date.now();
  let persistenceMs = 0;
  let groupingMs = 0;
  let analysisCount = 0;
  const rebuildClusters = async () => {
    const started = Date.now();
    await repository.rebuildClusters();
    groupingMs += Date.now() - started;
  };
  callbacks.onProgress?.({ ...job, status: 'running' });

  let lastClustersAt = 0;
  let writeQueue = Promise.resolve();
  let writeError: unknown;
  let terminal: ScanJob['status'] | undefined;
  let latestProcessed = job.processed;
  let latestTotal = job.total;
  let latestCheckpoint = job.checkpoint;
  const subscriptions = [
    photoScanner.addListener('scanBatch', (payload) => {
      try {
        const batch = parseScanBatch(payload);
        if (batch.jobId !== job.id) return;
        latestProcessed = batch.processed;
        latestTotal = batch.total;
        latestCheckpoint = batch.cursor ?? undefined;
        writeQueue = writeQueue
          .then(async () => {
            const persistenceStarted = Date.now();
            await repository.upsertAssets(batch.assets, indexingAt);
            await repository.upsertAnalyses(batch.analyses);
            await repository.updateScanJob(job.id, {
              processed: batch.processed,
              total: batch.total,
              status: 'running',
              checkpoint: batch.cursor,
            });
            persistenceMs += Date.now() - persistenceStarted;
            analysisCount += batch.analyses.length;
            if (batch.analyses.length && Date.now() - lastClustersAt >= 5000) {
              await rebuildClusters();
              lastClustersAt = Date.now();
            }
            callbacks.onCommitted?.();
            if (batch.requiresAnalysis) {
              const nativeAnalysis = createNativeAnalysisComposition(
                callbacks.fastOnly ? 'fast' : 'deep',
                {
                  getPendingAnalysisIds: (ids, fastOnly) =>
                    repository.getPendingAnalysisIds([...ids], fastOnly),
                  selectAssets: (ids) => photoScanner.selectAssets(job.id, [...ids]),
                },
                (stage, milliseconds) => {
                  if (typeof __DEV__ !== 'undefined' && __DEV__) {
                    console.debug('[SelevaAI Analysis]', { stage, milliseconds });
                  }
                },
              );
              const analysis = await nativeAnalysis.composition.process(
                { assetIds: batch.assets.map((asset) => asset.id) },
                nativeAnalysis.capabilities,
                {
                  runtime: {
                    platform: 'android',
                    osVersion: 23,
                    permissions: ['photo-library'],
                    models: callbacks.fastOnly ? [] : ['ml-kit-ocr'],
                    nativeApis: ['media-store', 'photo-analysis'],
                    resources: 'normal',
                  },
                },
              );
              if (analysis.failed.length || analysis.unavailable.length) {
                throw new Error('ANALYSIS_UNAVAILABLE');
              }
              if (!nativeAnalysis.hasDispatched()) {
                await photoScanner.selectAssets(job.id, []);
              }
            } else {
              await photoScanner.acknowledgeBatch(job.id);
            }
          })
          .catch((error: unknown) => {
            writeError = error;
          });
      } catch (error) {
        writeError = error;
      }
    }),
    photoScanner.addListener('scanProgress', (payload) => {
      try {
        const progress = parseScanProgress(payload);
        if (progress.jobId === job.id) {
          latestProcessed = progress.processed;
          latestTotal = progress.total;
          latestCheckpoint = progress.cursor ?? undefined;
          callbacks.onProgress?.({
            ...job,
            status: 'running',
            processed: progress.processed,
            total: progress.total,
            updatedAt: Date.now(),
            checkpoint: progress.cursor ?? undefined,
          });
        }
      } catch {
        // Progress is informational; the batch event remains authoritative.
      }
    }),
    photoScanner.addListener('scanCompleted', (payload) => {
      try {
        const state = parseScanState(payload);
        if (state.jobId !== job.id) return;
        latestProcessed = state.processed;
        latestTotal = state.total;
        latestCheckpoint = state.cursor ?? undefined;
        terminal = 'completed';
        writeQueue = writeQueue.then(() =>
          repository.updateScanJob(job.id, {
            processed: state.processed,
            total: state.total,
            status: 'completed',
            checkpoint: null,
          }),
        );
      } catch (error) {
        writeError = error;
      }
    }),
    photoScanner.addListener('scanPaused', (payload) => {
      try {
        const state = parseScanState(payload);
        if (state.jobId !== job.id) return;
        latestProcessed = state.processed;
        latestTotal = state.total;
        latestCheckpoint = state.cursor ?? undefined;
        terminal = 'paused';
        writeQueue = writeQueue.then(() =>
          repository.updateScanJob(job.id, {
            processed: state.processed,
            total: state.total,
            status: 'paused',
            checkpoint: state.cursor,
          }),
        );
      } catch (error) {
        writeError = error;
      }
    }),
    photoScanner.addListener('scanCancelled', (payload) => {
      try {
        const state = parseScanState(payload);
        if (state.jobId !== job.id) return;
        latestProcessed = state.processed;
        latestTotal = state.total;
        latestCheckpoint = state.cursor ?? undefined;
        terminal = 'cancelled';
        writeQueue = writeQueue.then(() =>
          repository.updateScanJob(job.id, {
            processed: state.processed,
            total: state.total,
            status: 'cancelled',
            checkpoint: state.cursor,
          }),
        );
      } catch (error) {
        writeError = error;
      }
    }),
    photoScanner.addListener('scanFailed', (payload) => {
      try {
        const failure = parseScanFailure(payload);
        if (failure.jobId !== job.id) return;
        terminal = 'failed';
        writeQueue = writeQueue.then(() =>
          repository.updateScanJob(job.id, {
            processed: latestProcessed,
            total: latestTotal,
            status: 'failed',
            checkpoint: latestCheckpoint ?? null,
            error: failure.error,
          }),
        );
      } catch (error) {
        writeError = error;
      }
    }),
  ].filter((subscription): subscription is { remove(): void } =>
    Boolean(subscription),
  );

  try {
    const result = await photoScanner.startScan(
      job.id,
      { batchSize: 100, incremental: true },
      undefined, // Restart native enumeration: iOS snapshots do not survive process death.
      callbacks.metadataOnly,
      callbacks.fastOnly,
    );
    await writeQueue;
    if (writeError) throw writeError;
    if (terminal === 'paused' || terminal === 'cancelled')
      await rebuildClusters();
    if (terminal === 'completed') {
      await repository.removeAssetsNotIndexedSince(indexingAt);
      await rebuildClusters();
    }
    if (!result.ok && terminal === undefined) {
      await repository.updateScanJob(job.id, {
        processed: latestProcessed,
        total: latestTotal,
        status: 'failed',
        checkpoint: latestCheckpoint ?? null,
        error: result.error,
      });
    }
  } catch {
    await repository.updateScanJob(job.id, {
      processed: latestProcessed,
      total: latestTotal,
      status: 'failed',
      checkpoint: latestCheckpoint ?? null,
      error: 'UNKNOWN',
    });
  } finally {
    subscriptions.forEach((subscription) => subscription.remove());
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.debug('[SelevaAI Scan]', {
        stage: callbacks.metadataOnly
          ? 'metadata'
          : callbacks.fastOnly
            ? 'fast'
            : 'deep',
        totalMs: Date.now() - indexingAt,
        persistenceMs,
        groupingMs,
        processed: latestProcessed,
        total: latestTotal,
        analyses: analysisCount,
      });
    }
  }
  return repository.getScanJob(job.id);
}

export async function stopLibraryScan(
  jobId: string,
  mode: 'paused' | 'cancelled',
): Promise<boolean> {
  const result = await photoScanner.stopScan(jobId, mode);
  return result.ok;
}
