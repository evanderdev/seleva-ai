import { searchRequestSchema, type SearchRequest } from './search-expression';
export * from './search-expression';
export * from './capabilities';
export * from './composition';
export * from './capability-catalog';
import { z } from 'zod';

export interface PhotoAsset {
  id: string;
  mediaType: 'photo' | 'video';
  createdAt: number;
  modifiedAt?: number;
  width: number;
  height: number;
  duration?: number;
  fileSize?: number;
  isFavorite?: boolean;
  latitude?: number;
  longitude?: number;
}

/** Platform-independent entities used by the selection and search layers. */
export interface Person { id: string; displayName?: string; confidence?: number; }
export interface Place { id: string; name?: string; latitude?: number; longitude?: number; }
export interface Label { name: string; confidence?: number; }
export interface OCRText { text: string; language?: string; confidence?: number; }
export type QualitySignalKind = 'blur' | 'brightness' | 'contrast' | 'face' | 'resolution' | 'noise' | 'composition';
export interface QualitySignal { kind: QualitySignalKind; score: number; }
export interface Selection { id: string; name: string; assetIds: string[]; query?: SearchRequest; context?: SelectionContext; createdAt: number; updatedAt: number; }
export type SelectionOperation = 'new' | 'add' | 'restrict' | 'exclude' | 'remove' | 'replace' | 'broaden';
export interface SelectionContext { query: SearchRequest; operations: SelectionOperation[]; }
export interface SearchIntent { kind: 'search' | 'refine'; query: SearchRequest; operation?: SelectionOperation; }
export type GalleryAction = 'trash' | 'share' | 'favorite' | 'unfavorite' | 'save-selection';
export interface ActionIntent { action: GalleryAction; selectionId?: string; requiresConfirmation: true; }

const boundedConfidence = z.number().min(0).max(1);
export const personSchema = z.strictObject({ id: z.string().min(1), displayName: z.string().min(1).optional(), confidence: boundedConfidence.optional() });
export const placeSchema = z.strictObject({ id: z.string().min(1), name: z.string().min(1).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() });
export const labelSchema = z.strictObject({ name: z.string().min(1), confidence: boundedConfidence.optional() });
export const ocrTextSchema = z.strictObject({ text: z.string(), language: z.string().min(1).optional(), confidence: boundedConfidence.optional() });
export const qualitySignalSchema = z.strictObject({ kind: z.enum(['blur', 'brightness', 'contrast', 'face', 'resolution', 'noise', 'composition']), score: boundedConfidence });
export const analysisCapabilityResultSchema = z.strictObject({
  capabilityId: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/),
  status: z.enum(['completed', 'failed']),
  error: z.string().min(1).optional(),
});
export type AnalysisCapabilityResult = z.infer<typeof analysisCapabilityResultSchema>;

export interface PhotoAnalysis {
  photoId: string;
  analysisVersion: number;
  modelVersion?: string;
  analyzedAt: number;
  blurScore?: number;
  qualityScore?: number;
  brightnessScore?: number;
  faceCount?: number;
  ocrText?: string;
  isScreenshot?: boolean;
  isDocument?: boolean;
  isMeme?: boolean;
  perceptualHash?: string;
  contentHash?: string;
  capabilityResults?: AnalysisCapabilityResult[];
}

export const photoAnalysisSchema = z.strictObject({
  photoId: z.string().min(1),
  analysisVersion: z.number().int().positive(),
  modelVersion: z.string().min(1).optional(),
  analyzedAt: z.number().int().nonnegative(),
  blurScore: z.number().min(0).max(1).optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  brightnessScore: z.number().min(0).max(1).optional(),
  faceCount: z.number().int().nonnegative().optional(),
  ocrText: z.string().optional(),
  isScreenshot: z.boolean().optional(),
  isDocument: z.boolean().optional(),
  isMeme: z.boolean().optional(),
  perceptualHash: z.string().min(1).optional(),
  contentHash: z.string().min(1).optional(),
  capabilityResults: z.array(analysisCapabilityResultSchema).max(15).optional(),
});

export interface PhotoQuality {
  overall: number;
  blur: number;
  brightness: number;
  faceQuality?: number;
}
export interface PhotoCluster {
  id: string;
  kind: 'exact' | 'visual' | 'similar';
  representativeId: string;
  assetCount: number;
}
export type ScanStatus =
  'pending' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
export interface ScanProgressEvent {
  jobId: string;
  processed: number;
  total: number;
  progress: number;
}

export interface DeviceCapabilities {
  platform: 'ios' | 'android';
  photoLibrary: boolean;
  ocr: boolean;
  faceDetection: boolean;
  imageClassification: boolean;
  embeddings: boolean;
  nativeLLM: boolean;
  backgroundIndexing: boolean;
  performanceTier: 'low' | 'medium' | 'high';
}

export type PhotoPermission =
  'not-determined' | 'authorized' | 'limited' | 'denied' | 'restricted';
export const photoPermissionSchema = z.enum([
  'not-determined',
  'authorized',
  'limited',
  'denied',
  'restricted',
]);
export const deviceCapabilitiesSchema = z.strictObject({
  platform: z.enum(['ios', 'android']),
  photoLibrary: z.boolean(),
  ocr: z.boolean(),
  faceDetection: z.boolean(),
  imageClassification: z.boolean(),
  embeddings: z.boolean(),
  nativeLLM: z.boolean(),
  backgroundIndexing: z.boolean(),
  performanceTier: z.enum(['low', 'medium', 'high']),
});
export type PhotoEngineError =
  | 'PERMISSION_DENIED'
  | 'LIMITED_ACCESS'
  | 'ASSET_NOT_FOUND'
  | 'INVALID_CURSOR'
  | 'SCAN_CANCELLED'
  | 'DEVICE_UNSUPPORTED'
  | 'OUT_OF_MEMORY'
  | 'UNKNOWN';
export type EngineResult<T> =
  { ok: true; value: T } | { ok: false; error: PhotoEngineError };

export interface ScanJob {
  id: string;
  processed: number;
  total: number;
  startedAt: number;
  updatedAt: number;
  status:
    'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  checkpoint?: string;
  error?: PhotoEngineError;
}

export const scanOptionsSchema = z.strictObject({
  batchSize: z.number().int().min(1).max(200).default(100),
  incremental: z.boolean().default(true),
});
export type ScanOptions = z.infer<typeof scanOptionsSchema>;

const timestamp = z.number().int().nonnegative();
export const selectionOperationSchema = z.enum(['new', 'add', 'restrict', 'exclude', 'remove', 'replace', 'broaden']);
export const searchIntentSchema = z.strictObject({ kind: z.enum(['search', 'refine']), query: searchRequestSchema, operation: selectionOperationSchema.optional() });
export const selectionContextSchema = z.strictObject({ query: searchRequestSchema, operations: z.array(selectionOperationSchema) });
export const selectionSchema = z.strictObject({ id: z.string().min(1), name: z.string().trim().min(1).max(120), assetIds: z.array(z.string().min(1)), query: searchRequestSchema.optional(), context: selectionContextSchema.optional(), createdAt: timestamp, updatedAt: timestamp });
export { createSelectionContext, reduceSelectionContext } from './selection-context';
export const actionIntentSchema = z.strictObject({ action: z.enum(['trash', 'share', 'favorite', 'unfavorite', 'save-selection']), selectionId: z.string().min(1).optional(), requiresConfirmation: z.literal(true) });
export type CleanupReason =
  | 'screenshot'
  | 'duplicate'
  | 'similar'
  | 'blurry'
  | 'large-media'
  | 'old-media';

export interface CleanupCandidate {
  photoId: string;
  confidence: number;
  reasons: Array<
    | 'screenshot'
    | 'duplicate'
    | 'similar'
    | 'blurry'
    | 'large-media'
    | 'old-media'
  >;
  recoverableBytes?: number;
}

export const pageRequestSchema = z.strictObject({
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
});
export type PageRequest = z.infer<typeof pageRequestSchema>;
export interface AssetPage {
  assets: PhotoAsset[];
  nextCursor?: string;
}
export type PaginatedPhotos = AssetPage;
export interface PhotoQuery {
  plan: SearchRequest;
  page: PageRequest;
}
export interface ThumbnailOptions {
  width: number;
  height: number;
}
export interface TrashResult {
  trashedIds: string[];
  cancelled: boolean;
}
export interface TrashRequest {
  ids: string[];
  userConfirmed: true;
}

export interface PhotoEngine {
  getCapabilities(): Promise<EngineResult<DeviceCapabilities>>;
  requestPermission(): Promise<EngineResult<PhotoPermission>>;
  startScan(options: ScanOptions): Promise<EngineResult<ScanJob>>;
  getScanJob(id: string): Promise<EngineResult<ScanJob>>;
  pauseScan(id: string): Promise<EngineResult<ScanJob>>;
  resumeScan(id: string): Promise<EngineResult<ScanJob>>;
  cancelScan(id: string): Promise<EngineResult<ScanJob>>;
  getAssets(
    query: SearchRequest,
    page: PageRequest,
  ): Promise<EngineResult<AssetPage>>;
  getThumbnail(
    id: string,
    options: ThumbnailOptions,
  ): Promise<EngineResult<string>>;
  trashAssets(request: TrashRequest): Promise<EngineResult<TrashResult>>;
}

export interface IntentProvider {
  parse(prompt: string, locale: string): Promise<SearchRequest>;
}
