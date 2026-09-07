import { z } from 'zod';
import type { EngineResult } from '@seleva/core';

export const libraryFilterSchema = z.strictObject({
  category: z
    .enum(['all', 'photos', 'videos', 'screenshots', 'favorites'])
    .default('all'),
  before: z.number().int().min(1).max(8640000000000000).optional(),
});
export type LibraryFilter = z.infer<typeof libraryFilterSchema>;

export const libraryPageRequestSchema = z.strictObject({
  limit: z.number().int().min(1).max(200).default(60),
  cursor: z.string().min(1).max(1024).optional(),
  filter: libraryFilterSchema.optional(),
});
const assetSchema = z.strictObject({
  id: z.string().min(1),
  mediaType: z.enum(['photo', 'video']),
  createdAt: z.number().finite().nonnegative(),
  modifiedAt: z.number().finite().nonnegative().optional(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  duration: z.number().nonnegative().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  isFavorite: z.boolean().optional(),
});
export const libraryPageSchema = z.strictObject({
  assets: z.array(assetSchema).max(200),
  nextCursor: z.string().min(1).optional(),
});
export const thumbnailRequestSchema = z.strictObject({
  id: z.string().min(1).max(1024),
  size: z.number().int().min(32).max(512).default(256),
});
export type LibraryPage = z.infer<typeof libraryPageSchema>;
export interface LibraryTransport {
  queryAssets?(
    limit: number,
    cursor: string | null,
    category: string,
    before: number | null,
  ): Promise<unknown>;
  listAssets(limit: number, cursor: string | null): Promise<unknown>;
  getThumbnail(id: string, size: number): Promise<unknown>;
}
export function createLibraryReader(native: LibraryTransport | null) {
  async function invoke<T>(
    operation: (module: LibraryTransport) => Promise<T>,
  ): Promise<EngineResult<T>> {
    if (!native) return { ok: false, error: 'DEVICE_UNSUPPORTED' };
    try {
      return { ok: true, value: await operation(native) };
    } catch (error) {
      const code = z
        .object({
          code: z.enum([
            'PERMISSION_DENIED',
            'ASSET_NOT_FOUND',
            'DEVICE_UNSUPPORTED',
            'INVALID_CURSOR',
          ]),
        })
        .safeParse(error);
      return { ok: false, error: code.success ? code.data.code : 'UNKNOWN' };
    }
  }
  return {
    async listAssets(
      input: z.input<typeof libraryPageRequestSchema>,
    ): Promise<EngineResult<LibraryPage>> {
      const request = libraryPageRequestSchema.parse(input);
      return invoke(async (module) => {
        const page = libraryPageSchema.parse(
          await (request.filter
            ? (() => {
                if (!module.queryAssets) throw { code: 'DEVICE_UNSUPPORTED' };
                return module.queryAssets(
                  request.limit,
                  request.cursor ?? null,
                  request.filter.category,
                  request.filter.before ?? null,
                );
              })()
            : module.listAssets(request.limit, request.cursor ?? null)),
        );
        if (
          page.assets.length > request.limit ||
          new Set(page.assets.map((asset) => asset.id)).size !==
            page.assets.length
        )
          throw new Error('INVALID_PAGE');
        return page;
      });
    },
    async getThumbnail(
      input: z.input<typeof thumbnailRequestSchema>,
    ): Promise<EngineResult<string>> {
      const request = thumbnailRequestSchema.parse(input);
      return invoke(async (module) =>
        z
          .string()
          .startsWith('file://')
          .parse(await module.getThumbnail(request.id, request.size)),
      );
    },
  };
}
