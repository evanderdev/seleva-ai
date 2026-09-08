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
  startScan: NonNullable<NativeLibraryModule['startScan']>;
  stopScan: NonNullable<NativeLibraryModule['stopScan']>;
  addListener: NonNullable<NativeLibraryModule['addListener']>;
} | null {
  const native = getNativeLibraryModule();
  if (!native?.startScan || !native.stopScan || !native.addListener) return null;
  return {
    startScan: native.startScan.bind(native),
    stopScan: native.stopScan.bind(native),
    addListener: native.addListener.bind(native),
  };
}
