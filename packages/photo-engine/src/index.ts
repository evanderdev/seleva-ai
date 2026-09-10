import {
  getNativeLibraryModule,
  getNativeScannerModule,
} from '@seleva/native-photo-engine';
import { createLibraryAccess } from './access';
import { createLibraryReader } from './library';
import { createPhotoScanner } from './scanner';
export const libraryReader = createLibraryReader(getNativeLibraryModule());
export type { LibraryPage } from './library';
export { libraryFilterSchema } from './library';
export type { LibraryFilter } from './library';
export const libraryAccess = createLibraryAccess(getNativeLibraryModule());
export const photoScanner = createPhotoScanner(getNativeScannerModule());
export { createLibraryAccess } from './access';
export type { PhotoEngine, PhotoEngineError, EngineResult } from '@seleva/core';
export {
  createPhotoScanner,
  createNativeAnalysisComposition,
  parseScanBatch,
  parseScanFailure,
  parseScanProgress,
  parseScanState,
} from './scanner';
export type {
  NativeScanTransport,
  ScanBatch,
  ScanEventListener,
  ScanEventName,
  ScanFailure,
  ScanProgress,
  ScanState,
  ScanSubscription,
  NativeAnalysisCoordinator,
  NativeAnalysisStage,
} from './scanner';
