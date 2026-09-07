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
