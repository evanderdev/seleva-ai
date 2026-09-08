import {
  createPhotoScanner,
  parseScanBatch,
  type NativeScanTransport,
} from './scanner';

const batch = {
  jobId: 'scan-1',
  assets: [
    {
      id: 'android:1:p',
      mediaType: 'photo' as const,
      createdAt: 100,
      width: 100,
      height: 100,
    },
  ],
  processed: 1,
  total: 1,
  cursor: null,
  analyses: [],
};

it('validates bounded native scan batches', () => {
  expect(parseScanBatch(batch)).toEqual(batch);
  expect(() => parseScanBatch({ ...batch, assets: new Array(201).fill(batch.assets[0]) })).toThrow();
});

it('forwards scan start and stop requests', async () => {
  const native: NativeScanTransport = {
    startScan: jest.fn(async () => ({ status: 'completed' })),
    stopScan: jest.fn(async () => ({ mode: 'paused' })),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  const scanner = createPhotoScanner(native);
  expect(await scanner.startScan('scan-1', { batchSize: 10, incremental: true })).toEqual({
    ok: true,
    value: { status: 'completed' },
  });
  expect(await scanner.stopScan('scan-1', 'paused')).toEqual({
    ok: true,
    value: { mode: 'paused' },
  });
  expect(native.startScan).toHaveBeenCalledWith('scan-1', 10, null);
  expect(native.stopScan).toHaveBeenCalledWith('scan-1', 'paused');
});
