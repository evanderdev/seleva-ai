import { requireOptionalNativeModule } from 'expo-modules-core';

/** Unknown native payloads are validated by the adapter before reaching the UI. */
export interface NativeLibraryModule {
  getCapabilities(): Promise<unknown>;
  getPermission(): Promise<unknown>;
  requestPermission(): Promise<unknown>;
  listAssets(limit: number, cursor: string | null): Promise<unknown>;
  queryAssets?(
    limit: number,
    cursor: string | null,
    category: string,
    before: number | null,
  ): Promise<unknown>;
  getThumbnail(id: string, size: number): Promise<unknown>;
  trashAssets?(ids: string[]): Promise<unknown>;
  startScan?(
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
  stopScan?(jobId: string, mode: 'paused' | 'cancelled'): Promise<unknown>;
  addListener?(
    eventName:
      | 'scanBatch'
      | 'scanProgress'
      | 'scanCompleted'
      | 'scanPaused'
      | 'scanCancelled'
      | 'scanFailed',
    listener: (payload: unknown) => void,
  ): { remove(): void };
}
export function getNativeLibraryModule(): NativeLibraryModule | null {
  return requireOptionalNativeModule<NativeLibraryModule>('SelevaPhotoEngine');
}

export function getNativeScannerModule(): {
  startFastScan?: NativeLibraryModule['startFastScan'];
  startIncrementalScan?: NativeLibraryModule['startIncrementalScan'];
  selectScanAssets?: NativeLibraryModule['selectScanAssets'];
  startScan: NonNullable<NativeLibraryModule['startScan']>;
  startMetadataScan?: NativeLibraryModule['startMetadataScan'];
  acknowledgeScanBatch?: NativeLibraryModule['acknowledgeScanBatch'];
  stopScan: NonNullable<NativeLibraryModule['stopScan']>;
  addListener: NonNullable<NativeLibraryModule['addListener']>;
} | null {
  const native = getNativeLibraryModule();
  if (!native?.startScan || !native.stopScan || !native.addListener)
    return null;
  return {
    startFastScan: native.startFastScan?.bind(native),
    startScan: native.startScan.bind(native),
    startIncrementalScan: native.startIncrementalScan?.bind(native),
    selectScanAssets: native.selectScanAssets?.bind(native),
    acknowledgeScanBatch: native.acknowledgeScanBatch?.bind(native),
    startMetadataScan: native.startMetadataScan?.bind(native),
    stopScan: native.stopScan.bind(native),
    addListener: native.addListener.bind(native),
  };
}
