import { createLibraryReader, type LibraryTransport } from './library';

const asset = {
  id: 'android:1:p',
  mediaType: 'photo',
  createdAt: 1,
  width: 100,
  height: 100,
};
function transport(page: unknown): LibraryTransport {
  return {
    listAssets: jest.fn(async () => page),
    getThumbnail: jest.fn(async () => 'file:///cache/thumb.jpg'),
  };
}
it('rejects unbounded requests before calling native code', async () => {
  const native = transport({ assets: [] });
  await expect(
    createLibraryReader(native).listAssets({ limit: 50000 }),
  ).rejects.toThrow();
  expect(native.listAssets).not.toHaveBeenCalled();
});
it('forwards cursors and accepts bounded metadata pages', async () => {
  const native = transport({ assets: [asset], nextCursor: '1' });
  expect(
    await createLibraryReader(native).listAssets({ limit: 1, cursor: '2' }),
  ).toEqual({ ok: true, value: { assets: [asset], nextCursor: '1' } });
  expect(native.listAssets).toHaveBeenCalledWith(1, '2');
});
it('rejects duplicate IDs and oversized native pages', async () => {
  expect(
    (
      await createLibraryReader(
        transport({ assets: [asset, asset] }),
      ).listAssets({ limit: 2 })
    ).ok,
  ).toBe(false);
  expect(
    (
      await createLibraryReader(
        transport({ assets: [asset, { ...asset, id: '2' }] }),
      ).listAssets({ limit: 1 })
    ).ok,
  ).toBe(false);
});
it('preserves expired snapshot errors without native details', async () => {
  const native = transport({ assets: [] });
  native.listAssets = async () => {
    throw { code: 'INVALID_CURSOR', message: 'private details' };
  };
  expect(await createLibraryReader(native).listAssets({})).toEqual({
    ok: false,
    error: 'INVALID_CURSOR',
  });
});
it('bounds thumbnails and rejects remote URLs', async () => {
  const native = transport({ assets: [] });
  const reader = createLibraryReader(native);
  await expect(
    reader.getThumbnail({ id: asset.id, size: 4096 }),
  ).rejects.toThrow();
  expect(native.getThumbnail).not.toHaveBeenCalled();
  native.getThumbnail = async () => 'https://example.com/photo.jpg';
  expect((await reader.getThumbnail({ id: asset.id })).ok).toBe(false);
});
it('returns unavailable in Expo Go', async () => {
  expect(await createLibraryReader(null).listAssets({})).toEqual({
    ok: false,
    error: 'DEVICE_UNSUPPORTED',
  });
});

it('requires explicit confirmation and validates trash responses', async () => {
  const native = {
    ...transport({ assets: [] }),
    trashAssets: jest.fn(async () => ({
      trashedIds: [asset.id],
      cancelled: false,
    })),
  };
  const reader = createLibraryReader(native);
  await expect(reader.trashAssets?.({ ids: [], userConfirmed: true })).rejects.toThrow();
  expect(native.trashAssets).not.toHaveBeenCalled();
  expect(
    await reader.trashAssets?.({ ids: [asset.id], userConfirmed: true }),
  ).toEqual({ ok: true, value: { trashedIds: [asset.id], cancelled: false } });
});

it('validates filters before native queries and forwards date boundaries', async () => {
  const native = {
    ...transport({ assets: [] }),
    queryAssets: jest.fn(async () => ({ assets: [asset] })),
  };
  const reader = createLibraryReader(native);
  await expect(
    reader.listAssets({ filter: { category: 'photos', before: -1 } }),
  ).rejects.toThrow();
  await expect(
    reader.listAssets({ filter: { category: 'photos', before: Infinity } }),
  ).rejects.toThrow();
  expect(native.queryAssets).not.toHaveBeenCalled();
  expect(
    await reader.listAssets({
      limit: 20,
      cursor: 'photos:100:2',
      filter: { category: 'photos', before: 100 },
    }),
  ).toEqual({ ok: true, value: { assets: [asset] } });
  expect(native.queryAssets).toHaveBeenCalledWith(
    20,
    'photos:100:2',
    'photos',
    100,
  );
  expect(native.listAssets).not.toHaveBeenCalled();
});

it('requires a new native build instead of silently ignoring filters', async () => {
  const native = transport({ assets: [asset] });
  expect(
    await createLibraryReader(native).listAssets({
      filter: { category: 'screenshots' },
    }),
  ).toEqual({ ok: false, error: 'DEVICE_UNSUPPORTED' });
  expect(native.listAssets).not.toHaveBeenCalled();
});

it('applies page validation and typed failures to filtered queries', async () => {
  const native = {
    ...transport({ assets: [] }),
    queryAssets: jest.fn<Promise<unknown>, []>(async () => ({
      assets: [asset, asset],
    })),
  };
  const reader = createLibraryReader(native);
  expect((await reader.listAssets({ filter: { category: 'videos' } })).ok).toBe(
    false,
  );
  native.queryAssets.mockRejectedValue({
    code: 'INVALID_CURSOR',
    message: 'private',
  });
  expect(
    await reader.listAssets({
      filter: { category: 'favorites' },
      cursor: 'wrong',
    }),
  ).toEqual({ ok: false, error: 'INVALID_CURSOR' });
});
