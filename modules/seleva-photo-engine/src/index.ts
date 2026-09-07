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
}
export function getNativeLibraryModule(): NativeLibraryModule | null {
  return requireOptionalNativeModule<NativeLibraryModule>('SelevaPhotoEngine');
}
