import { createLibraryAccess } from './access';

it('keeps Expo Go safe when the custom module is absent', async () => {
  expect(await createLibraryAccess(null).requestPermission()).toEqual({
    ok: false,
    error: 'DEVICE_UNSUPPORTED',
  });
});
it('validates native responses and preserves limited access', async () => {
  const access = createLibraryAccess({
    getPermission: async () => 'limited',
    requestPermission: async () => 'everything',
    getCapabilities: async () => ({ photoLibrary: true }),
  });
  expect(await access.getPermission()).toEqual({ ok: true, value: 'limited' });
  expect(await access.requestPermission()).toEqual({
    ok: false,
    error: 'UNKNOWN',
  });
  expect(await access.getCapabilities()).toEqual({
    ok: false,
    error: 'UNKNOWN',
  });
});
it('contains native failures without leaking private error contents', async () => {
  const access = createLibraryAccess({
    getPermission: async () => {
      throw new Error('private path');
    },
    requestPermission: async () => 'denied',
    getCapabilities: async () => ({}),
  });
  expect(await access.getPermission()).toEqual({ ok: false, error: 'UNKNOWN' });
});
