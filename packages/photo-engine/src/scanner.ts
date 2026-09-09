import { z } from 'zod';
import {
  photoAnalysisSchema,
  scanOptionsSchema,
  type EngineResult,
  type ScanOptions,
} from '@seleva/core';
import { libraryAssetSchema } from './library';

const scanBatchSchema = z.strictObject({
  jobId: z.string().min(1),
  assets: z.array(libraryAssetSchema).max(200),
  processed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  cursor: z.string().min(1).nullable(),
  requiresAnalysis: z.boolean().default(false),
  analyses: z.array(photoAnalysisSchema).max(200).default([]),
});
const scanStateSchema = z.strictObject({
  jobId: z.string().min(1),
  processed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  cursor: z.string().min(1).nullable(),
});
const scanProgressSchema = scanStateSchema.extend({
  progress: z.number().min(0).max(1),
});
const scanFailureSchema = z.strictObject({
  jobId: z.string().min(1),
  error: z.string().min(1),
});

export type ScanBatch = z.infer<typeof scanBatchSchema>;
export type ScanState = z.infer<typeof scanStateSchema>;
export type ScanProgress = z.infer<typeof scanProgressSchema>;
export type ScanFailure = z.infer<typeof scanFailureSchema>;
export type ScanEventName =
  | 'scanBatch'
  | 'scanProgress'
  | 'scanCompleted'
  | 'scanPaused'
  | 'scanCancelled'
  | 'scanFailed';
export type ScanEventListener = (payload: unknown) => void;
export interface ScanSubscription {
  remove(): void;
}
export interface NativeScanTransport {
  startScan(
    jobId: string,
    batchSize: number,
    cursor: string | null,
  ): Promise<unknown>;
  startFastScan?(
    jobId: string,
    batchSize: number,
    cursor: string | null,
  ): Promise<unknown>;
  startIncrementalScan?(
    jobId: string,
    batchSize: number,
    cursor: string | null,
  ): Promise<unknown>;
  selectScanAssets?(jobId: string, ids: string[]): Promise<unknown>;
  acknowledgeScanBatch?(jobId: string): Promise<unknown>;
  startMetadataScan?(
    jobId: string,
    batchSize: number,
    cursor: string | null,
  ): Promise<unknown>;
  stopScan(jobId: string, mode: 'paused' | 'cancelled'): Promise<unknown>;
  addListener(
    eventName: ScanEventName,
    listener: ScanEventListener,
  ): ScanSubscription;
}

export function parseScanBatch(payload: unknown): ScanBatch {
  return scanBatchSchema.parse(payload);
}
export function parseScanState(payload: unknown): ScanState {
  return scanStateSchema.parse(payload);
}
export function parseScanProgress(payload: unknown): ScanProgress {
  return scanProgressSchema.parse(payload);
}
export function parseScanFailure(payload: unknown): ScanFailure {
  return scanFailureSchema.parse(payload);
}

export function createPhotoScanner(native: NativeScanTransport | null) {
  function unavailable<T>(): EngineResult<T> {
    return { ok: false, error: 'DEVICE_UNSUPPORTED' };
  }
  return {
    async selectAssets(jobId: string, ids: string[]) {
      if (!native?.selectScanAssets) throw new Error('DEVICE_UNSUPPORTED');
      await native.selectScanAssets(
        jobId,
        z.array(z.string().min(1)).max(200).parse(ids),
      );
    },
    async acknowledgeBatch(jobId: string) {
      await native?.acknowledgeScanBatch?.(jobId);
    },
    addListener(
      eventName: ScanEventName,
      listener: ScanEventListener,
    ): ScanSubscription | undefined {
      return native?.addListener(eventName, listener);
    },
    async startScan(
      jobId: string,
      options: ScanOptions,
      cursor?: string,
      metadataOnly = false,
      fastOnly = false,
    ): Promise<EngineResult<unknown>> {
      if (
        !native ||
        !native.acknowledgeScanBatch ||
        (fastOnly && !native.startFastScan) ||
        (metadataOnly
          ? !native.startMetadataScan
          : !native.startIncrementalScan || !native.selectScanAssets)
      )
        return unavailable();
      try {
        const request = scanOptionsSchema.parse(options);
        return {
          ok: true,
          value: await (
            fastOnly && native.startFastScan
              ? native.startFastScan.bind(native)
              : metadataOnly && native.startMetadataScan
                ? native.startMetadataScan.bind(native)
                : native.startIncrementalScan!.bind(native)
          )(jobId, request.batchSize, cursor ?? null),
        };
      } catch {
        return { ok: false, error: 'UNKNOWN' };
      }
    },
    async stopScan(
      jobId: string,
      mode: 'paused' | 'cancelled',
    ): Promise<EngineResult<unknown>> {
      if (!native) return unavailable();
      try {
        return { ok: true, value: await native.stopScan(jobId, mode) };
      } catch {
        return { ok: false, error: 'UNKNOWN' };
      }
    },
  };
}
