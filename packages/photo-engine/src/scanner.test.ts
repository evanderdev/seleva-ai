import {
  createNativeAnalysisComposition,
  createPhotoScanner,
  parseScanBatch,
  type NativeScanTransport,
} from './scanner';

const analysisRuntime = {
  platform: 'android' as const,
  osVersion: 36,
  permissions: ['photo-library'],
  models: ['ml-kit-ocr'],
  nativeApis: ['media-store', 'photo-analysis'],
  resources: 'normal' as const,
};

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

it('requires the metadata entry point instead of silently running heavy analysis', async () => {
  const native: NativeScanTransport = {
    startScan: jest.fn(),
    stopScan: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  const scanner = createPhotoScanner(native);
  expect(
    await scanner.startScan(
      'quick',
      { batchSize: 100, incremental: true },
      undefined,
      true,
    ),
  ).toEqual({ ok: false, error: 'DEVICE_UNSUPPORTED' });
  expect(native.startScan).not.toHaveBeenCalled();
});

it('resolves native analyzers once and dispatches a single bounded selection', async () => {
  const pending = jest.fn(async (ids: readonly string[]) => [...ids]);
  const select = jest.fn(async (ids: readonly string[]) => { void ids; });
  const native = createNativeAnalysisComposition('fast', {
    getPendingAnalysisIds: (ids) => pending(ids),
    selectAssets: select,
  });
  const result = await native.composition.process(
    { assetIds: ['android:1:p', 'android:2:p'] },
    native.capabilities,
    { runtime: analysisRuntime },
  );
  expect(result).toEqual({
    completed: native.capabilities,
    unavailable: [],
    failed: [],
  });
  expect(pending).toHaveBeenCalledTimes(3);
  expect(select).toHaveBeenCalledTimes(1);
  expect(select).toHaveBeenCalledWith(['android:1:p', 'android:2:p']);
});

it('dispatches metadata scanning and acknowledges committed batches', async () => {
  const native: NativeScanTransport = {
    startScan: jest.fn(),
    startMetadataScan: jest.fn(async () => ({ status: 'completed' })),
    acknowledgeScanBatch: jest.fn(async () => undefined),
    stopScan: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  const scanner = createPhotoScanner(native);
  await scanner.startScan(
    'quick',
    { batchSize: 100, incremental: true },
    undefined,
    true,
  );
  await scanner.acknowledgeBatch('quick');
  expect(native.startMetadataScan).toHaveBeenCalledWith('quick', 100, null);
  expect(native.acknowledgeScanBatch).toHaveBeenCalledWith('quick');
});

it('validates bounded native scan batches', () => {
  expect(parseScanBatch(batch)).toEqual({ ...batch, requiresAnalysis: false });
  expect(() =>
    parseScanBatch({ ...batch, assets: new Array(201).fill(batch.assets[0]) }),
  ).toThrow();
});

it('forwards scan start and stop requests', async () => {
  const native: NativeScanTransport = {
    startScan: jest.fn(),
    startIncrementalScan: jest.fn(async () => ({ status: 'completed' })),
    selectScanAssets: jest.fn(),
    acknowledgeScanBatch: jest.fn(),
    stopScan: jest.fn(async () => ({ mode: 'paused' })),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  const scanner = createPhotoScanner(native);
  expect(
    await scanner.startScan('scan-1', { batchSize: 10, incremental: true }),
  ).toEqual({
    ok: true,
    value: { status: 'completed' },
  });
  expect(await scanner.stopScan('scan-1', 'paused')).toEqual({
    ok: true,
    value: { mode: 'paused' },
  });
  expect(native.startIncrementalScan).toHaveBeenCalledWith('scan-1', 10, null);
  expect(native.stopScan).toHaveBeenCalledWith('scan-1', 'paused');
});

it('refuses an older native engine that would ignore the analysis cache', async () => {
  const native: NativeScanTransport = {
    startScan: jest.fn(),
    acknowledgeScanBatch: jest.fn(),
    stopScan: jest.fn(),
    addListener: jest.fn(),
  };
  expect(
    await createPhotoScanner(native).startScan('test', {
      batchSize: 100,
      incremental: true,
    }),
  ).toEqual({ ok: false, error: 'DEVICE_UNSUPPORTED' });
  expect(native.startScan).not.toHaveBeenCalled();
});

it('requires the fast API and never falls back to full OCR', async () => {
  const native: NativeScanTransport = {
    startScan: jest.fn(),
    startIncrementalScan: jest.fn(),
    selectScanAssets: jest.fn(),
    acknowledgeScanBatch: jest.fn(),
    stopScan: jest.fn(),
    addListener: jest.fn(),
  };
  const scanner = createPhotoScanner(native);
  const options = { batchSize: 20, incremental: true };
  expect(
    await scanner.startScan('fast', options, undefined, false, true),
  ).toEqual({ ok: false, error: 'DEVICE_UNSUPPORTED' });
  expect(native.startIncrementalScan).not.toHaveBeenCalled();
  native.startFastScan = jest.fn();
  expect(
    (await scanner.startScan('fast', options, undefined, false, true)).ok,
  ).toBe(true);
  expect(native.startFastScan).toHaveBeenCalledWith('fast', 20, null);
});
