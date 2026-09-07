import { getNativeLibraryModule } from '@seleva/native-photo-engine';
import { createLibraryAccess } from './access';
import { createLibraryReader } from './library';
export const libraryReader = createLibraryReader(getNativeLibraryModule());
export type { LibraryPage } from './library';
export const libraryAccess = createLibraryAccess(getNativeLibraryModule());
export { createLibraryAccess } from './access';
export type { PhotoEngine, PhotoEngineError, EngineResult } from '@seleva/core';
