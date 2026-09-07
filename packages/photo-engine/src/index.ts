import { getNativeLibraryModule } from '@seleva/native-photo-engine';
import { createLibraryAccess } from './access';
export const libraryAccess = createLibraryAccess(getNativeLibraryModule());
export { createLibraryAccess } from './access';
export type { PhotoEngine, PhotoEngineError, EngineResult } from '@seleva/core';
