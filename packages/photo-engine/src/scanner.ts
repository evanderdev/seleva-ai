import { z } from 'zod';
import {
  photoAnalysisSchema,
  scanOptionsSchema,
  type EngineResult,
  type ScanOptions,
  AnalysisComposition,
  CapabilityResolver,
  createCapabilityRegistry,
  type AnalysisBatch,
  type Analyzer,
  type CapabilityId,
  type Metric,
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

export type NativeAnalysisStage = 'fast' | 'deep';
export interface NativeAnalysisCoordinator {
  getPendingAnalysisIds(ids: readonly string[], fastOnly: boolean): Promise<string[]>;
  selectAssets(ids: readonly string[]): Promise<void>;
}

const fastAnalysisCapabilities: readonly CapabilityId[] = [
  'content.screenshot',
  'quality.visual',
  'similarity.perceptual',
];
const deepAnalysisCapabilities: readonly CapabilityId[] = [
  ...fastAnalysisCapabilities,
  'duplicate.exact',
  'text.ocr',
];

/**
 * Adapts the native batch protocol to AnalysisComposition. Pixel processing
 * remains in Kotlin; these providers only resolve cache and dispatch IDs.
 */
export function createNativeAnalysisComposition(
  stage: NativeAnalysisStage,
  coordinator: NativeAnalysisCoordinator,
  metric?: Metric,
): { composition: AnalysisComposition; capabilities: readonly CapabilityId[]; hasDispatched: () => boolean } {
  const registry = createCapabilityRegistry();
  const capabilities = stage === 'fast' ? fastAnalysisCapabilities : deepAnalysisCapabilities;
  let selectionDispatched = false;
  const dispatch = async (ids: readonly string[]): Promise<void> => {
    if (selectionDispatched) return;
    selectionDispatched = true;
    await coordinator.selectAssets(ids);
  };
  for (const capabilityId of capabilities) {
    const analyzer: Analyzer = {
      id: `android-native-${stage}`,
      capabilityId,
      version: stage === 'fast' ? 'android-fast-2' : 'android-heuristic-2',
      priority: 100,
      batchSize: 20,
      requirements: { nativeApis: ['media-store', 'photo-analysis'] },
      pending: async (batch: AnalysisBatch) => ({
        assetIds: await coordinator.getPendingAnalysisIds(batch.assetIds, stage === 'fast'),
      }),
      analyzeBatch: async (batch: AnalysisBatch) => {
        await dispatch(batch.assetIds);
      },
    };
    registry.registerProvider(capabilityId, analyzer);
  }
  return {
    composition: new AnalysisComposition(new CapabilityResolver(registry), metric),
    capabilities,
    hasDispatched: () => selectionDispatched,
  };
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
