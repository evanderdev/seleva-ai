import { PhotoRepository, type SqlDatabase } from '@seleva/database';
import {
  photoScanner,
  type ScanEventName,
  type ScanEventListener,
} from '@seleva/photo-engine';
import { runLibraryScan } from './scanner';
import type { ScanJob } from '@seleva/core';

jest.mock('@seleva/photo-engine', () => ({
  ...jest.requireActual('../../../../packages/photo-engine/src/scanner'),
  photoScanner: {
    addListener: jest.fn(),
    startScan: jest.fn(),
    selectAssets: jest.fn(),
    acknowledgeBatch: jest.fn(),
  },
}));

it.each([false, true])(
  'commits each batch before acknowledgement and preserves cache (paused=%s)',
  async (paused) => {
    const db: SqlDatabase = {
      execAsync: jest.fn(),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(),
      withExclusiveTransactionAsync: jest.fn(),
    };
    const repository = new PhotoRepository(db);
    let job: ScanJob = {
      id: 'job',
      processed: 0,
      total: 2,
      startedAt: 1,
      updatedAt: 1,
      status: 'running',
    };
    jest.spyOn(repository, 'createScanJob').mockResolvedValue(job);
    jest.spyOn(repository, 'getScanJob').mockImplementation(async () => job);
    jest
      .spyOn(repository, 'updateScanJob')
      .mockImplementation(async (_id, update) => {
        job = {
          ...job,
          ...update,
          checkpoint: update.checkpoint ?? undefined,
          error: undefined,
        };
      });
    const order: string[] = [];
    jest.spyOn(repository, 'upsertAssets').mockImplementation(async () => {
      order.push('metadata');
    });
    jest
      .spyOn(repository, 'upsertAnalyses')
      .mockImplementation(async (analyses) => {
        if (analyses.length) order.push('analysis');
      });
    jest
      .spyOn(repository, 'getPendingAnalysisIds')
      .mockResolvedValue(['android:2:p']);
    jest.spyOn(repository, 'rebuildClusters').mockImplementation(async () => {
      order.push('clusters');
    });
    const prune = jest
      .spyOn(repository, 'removeAssetsNotIndexedSince')
      .mockResolvedValue();
    const listeners = new Map<ScanEventName, ScanEventListener>();
    const remove = jest.fn();
    jest
      .mocked(photoScanner.addListener)
      .mockImplementation((name, listener) => {
        listeners.set(name, listener);
        return { remove };
      });
    jest.mocked(photoScanner.startScan).mockImplementation(async () => {
      const payload = {
        jobId: 'job',
        processed: 0,
        total: 2,
        cursor: null,
        analyses: [],
        assets: [1, 2].map((id) => ({
          id: `android:${id}:p`,
          mediaType: 'photo',
          createdAt: 1,
          width: 10,
          height: 10,
        })),
      };
      await new Promise<void>((resolve) => {
        jest
          .mocked(photoScanner.selectAssets)
          .mockImplementation(async (_id, ids) => {
            expect(ids).toEqual(['android:2:p']);
            order.push('select');
            resolve();
          });
        listeners.get('scanBatch')?.({ ...payload, requiresAnalysis: true });
      });
      await new Promise<void>((resolve) => {
        jest
          .mocked(photoScanner.acknowledgeBatch)
          .mockImplementation(async () => {
            order.push('ack');
            resolve();
          });
        listeners.get('scanBatch')?.({
          ...payload,
          processed: 2,
          analyses: [
            {
              photoId: 'android:2:p',
              analysisVersion: 1,
              modelVersion: 'android-heuristic-1',
              analyzedAt: 10,
            },
          ],
        });
      });
      listeners.get(paused ? 'scanPaused' : 'scanCompleted')?.({
        jobId: 'job',
        processed: 2,
        total: 2,
        cursor: null,
      });
      return { ok: true, value: null };
    });
    const result = await runLibraryScan(repository);
    expect(order.slice(0, 6)).toEqual([
      'metadata',
      'select',
      'metadata',
      'analysis',
      'clusters',
      'ack',
    ]);
    expect(result?.status).toBe(paused ? 'paused' : 'completed');
    expect(prune).toHaveBeenCalledTimes(paused ? 0 : 1);
    expect(remove).toHaveBeenCalledTimes(6);
  },
);
