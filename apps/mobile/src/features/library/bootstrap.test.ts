import { createLibraryBootstrap, type LibraryInsights } from './bootstrap';
import type { ScanCallbacks } from '../../services/scanner';
import type { EngineResult, PhotoPermission, ScanJob } from '@seleva/core';

const insights: LibraryInsights = {
  total: 4,
  knownBytes: 1000,
  unknownSizes: 0,
  pending: 4,
  fastPending: 4,
  screenshots: 0,
  blurry: 0,
  largeVideos: 0,
  largeVideoBytes: 0,
  duplicateBytes: 0,
  duplicateCopies: 0,
};
const completed: ScanJob = {
  id: 'test',
  status: 'completed',
  processed: 4,
  total: 4,
  startedAt: 1,
  updatedAt: 2,
};
function setup(permission: PhotoPermission = 'not-determined', saved?: string) {
  let current = permission;
  const getPermission = jest.fn(
    async (): Promise<EngineResult<PhotoPermission>> => ({
      ok: true,
      value: current,
    }),
  );
  const requestPermission = jest.fn(
    async (): Promise<EngineResult<PhotoPermission>> => {
      current = 'authorized';
      return { ok: true, value: current };
    },
  );
  const scan = jest.fn<Promise<ScanJob>, [ScanCallbacks]>(
    async ({ metadataOnly }) => {
      if (!metadataOnly)
        getInsights.mockResolvedValue({ ...insights, pending: 0 });
      return completed;
    },
  );
  const getInsights = jest.fn(async () => insights);
  const preferences = new Map<string, string>(
    saved ? [['library-metadata-v1', saved]] : [],
  );
  const getPreference = jest.fn(async (key: string) => preferences.get(key));
  const setPreference = jest.fn(async (key: string, value: string) => {
    preferences.set(key, value);
  });
  const stop = jest.fn(async () => true);
  const controller = createLibraryBootstrap({
    access: { getPermission, requestPermission },
    repository: { getInsights, getPreference, setPreference },
    scan,
    stop,
  });
  return {
    controller,
    preferences,
    getPermission,
    requestPermission,
    scan,
    getInsights,
    stop,
  };
}
it('requests permission once and runs metadata before analysis, deduplicating callers', async () => {
  const { controller, requestPermission, scan } = setup();
  await Promise.all([controller.start(), controller.start()]);
  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(scan.mock.calls.map(([options]) => options.metadataOnly)).toEqual([
    true,
    false,
  ]);
  expect(controller.getSnapshot().phase).toBe('ready');
  await controller.start();
  expect(scan).toHaveBeenCalledTimes(2);
});
it.each(['denied', 'restricted'] as const)(
  'never scans or re-prompts after %s',
  async (permission) => {
    const { controller, requestPermission, scan } = setup(permission);
    await controller.start();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe('permission');
  },
);
it('indexes limited access and avoids analysis when indexed analyses are current', async () => {
  const { controller, getInsights, scan } = setup('limited');
  getInsights.mockResolvedValue({ ...insights, pending: 0 });
  await controller.start();
  expect(scan).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().permission).toBe('limited');
});
it('does not start work while backgrounded', async () => {
  const { controller, scan } = setup('authorized');
  controller.setActive(false);
  await controller.start();
  expect(scan).not.toHaveBeenCalled();
});
it('reports failure without automatically retrying in a loop', async () => {
  const { controller, scan } = setup('authorized');
  scan.mockRejectedValue(new Error('native'));
  await controller.start();
  expect(controller.getSnapshot().phase).toBe('error');
  expect(scan).toHaveBeenCalledTimes(1);
});

it('reopens a complete fresh index without native scanning', async () => {
  const saved = JSON.stringify({
    completedAt: Date.now(),
    permission: 'authorized',
  });
  const { controller, scan, getInsights } = setup('authorized', saved);
  getInsights.mockResolvedValue({ ...insights, pending: 0 });
  await controller.start();
  expect(scan).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    insights: { total: 4 },
  });
  await controller.refresh();
  expect(scan.mock.calls.map(([options]) => options.metadataOnly)).toEqual([
    true,
  ]);
});
it('resumes pending analysis after reopening without repeating metadata', async () => {
  const { controller, scan } = setup(
    'authorized',
    JSON.stringify({ completedAt: Date.now(), permission: 'authorized' }),
  );
  await controller.start();
  expect(scan.mock.calls.map(([options]) => options.metadataOnly)).toEqual([
    false,
  ]);
});
it.each([
  'invalid',
  JSON.stringify({ completedAt: 1, permission: 'authorized' }),
  JSON.stringify({
    completedAt: Date.now() + 3600000,
    permission: 'authorized',
  }),
])('refreshes expired or invalid metadata cache: %s', async (saved) => {
  const { controller, scan } = setup('authorized', saved);
  await controller.start();
  expect(scan.mock.calls.map(([options]) => options.metadataOnly)).toEqual([
    true,
    false,
  ]);
});
it('keeps completed metadata and saved insights when analysis fails', async () => {
  const { controller, scan, preferences } = setup('authorized');
  scan.mockImplementation(async ({ metadataOnly }) =>
    metadataOnly ? completed : { ...completed, status: 'failed' },
  );
  await controller.start();
  expect(preferences.get('library-metadata-v1')).toBeDefined();
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'error',
    insights: { total: 4 },
  });
  scan.mockClear();
  await controller.retry();
  expect(scan.mock.calls.map(([options]) => options.metadataOnly)).toEqual([
    false,
  ]);
});
it('reconciles limited access even when the persisted cache is fresh', async () => {
  const { controller, scan } = setup(
    'limited',
    JSON.stringify({ completedAt: Date.now(), permission: 'limited' }),
  );
  await controller.start();
  expect(scan.mock.calls[0]?.[0].metadataOnly).toBe(true);
});

it('releases metadata while native analysis remains pending', async () => {
  const { controller, scan } = setup('authorized');
  let finish: ((job: ScanJob) => void) | undefined;
  scan.mockImplementation(({ metadataOnly, fastOnly }) =>
    metadataOnly || !fastOnly
      ? Promise.resolve(completed)
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  const work = controller.start();
  for (let i = 0; i < 30 && !finish; i++) await Promise.resolve();
  expect(controller.getSnapshot().phase).toBe('analysis');
  expect(finish).toBeDefined();
  finish?.(completed);
  await work;
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'error',
    error: 'ANALYSIS_PENDING',
  });
});
it('opens Home after a successful analysis finishes and persists its results', async () => {
  const { controller } = setup('authorized');
  const phases: string[] = [];
  controller.subscribe(() => phases.push(controller.getSnapshot().phase));
  await controller.start();
  expect(phases).toContain('metadata');
  expect(phases).toContain('analysis');
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    insights: { pending: 0 },
  });
});

it('releases saved batches during analysis and keeps them available after a later failure', async () => {
  const { controller, scan, getInsights } = setup('authorized');
  let finish: ((job: ScanJob) => void) | undefined;
  let committed: (() => void) | undefined;
  scan.mockImplementation((options) =>
    options.metadataOnly
      ? Promise.resolve(completed)
      : new Promise((resolve) => {
          finish = resolve;
          committed = options.onCommitted;
        }),
  );
  const work = controller.start();
  for (let i = 0; i < 40 && !finish; i++) await Promise.resolve();
  expect(controller.getSnapshot().resultsAvailable).toBe(true);
  getInsights.mockResolvedValue({ ...insights, pending: 2 });
  committed?.();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'analysis',
    resultsAvailable: true,
  });
  finish?.({ ...completed, status: 'failed' });
  await work;
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'error',
    resultsAvailable: true,
  });
});
it('makes cached analyzed items available before resuming remaining work', async () => {
  const { controller, scan, getInsights } = setup(
    'authorized',
    JSON.stringify({ completedAt: Date.now(), permission: 'authorized' }),
  );
  getInsights.mockResolvedValue({ ...insights, pending: 2 });
  scan.mockImplementation(async () => {
    expect(controller.getSnapshot().resultsAvailable).toBe(true);
    return { ...completed, status: 'failed' };
  });
  await controller.start();
  expect(scan.mock.calls[0]?.[0].metadataOnly).toBe(false);
});

it('coalesces batch notifications while an insights query is in flight', async () => {
  const { controller, scan, getInsights } = setup('authorized');
  let finish: ((job: ScanJob) => void) | undefined;
  let committed: (() => void) | undefined;
  scan.mockImplementation((options) =>
    options.metadataOnly
      ? Promise.resolve(completed)
      : new Promise((resolve) => {
          finish = resolve;
          committed = options.onCommitted;
        }),
  );
  const work = controller.start();
  for (let i = 0; i < 40 && !finish; i++) await Promise.resolve();
  expect(committed).toBeDefined();
  let resolveInsights: ((value: LibraryInsights) => void) | undefined;
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
  getInsights.mockClear();
  getInsights.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveInsights = resolve;
      }),
  );
  for (let i = 0; i < 100; i++) committed?.();
  expect(getInsights).toHaveBeenCalledTimes(1);
  resolveInsights?.({ ...insights, pending: 2 });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(getInsights).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().resultsAvailable).toBe(true);
  for (let i = 0; i < 100; i++) committed?.();
  expect(getInsights).toHaveBeenCalledTimes(1);
  getInsights.mockResolvedValue({ ...insights, pending: 0 });
  finish?.(completed);
  await work;
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    insights: { pending: 0 },
  });
});

afterEach(() => jest.restoreAllMocks());
it('runs fast before deep and keeps results available during OCR', async () => {
  const { controller, scan, getInsights } = setup('authorized');
  const stages: string[] = [];
  scan.mockImplementation(async ({ metadataOnly, fastOnly }) => {
    stages.push(metadataOnly ? 'metadata' : fastOnly ? 'fast' : 'deep');
    if (!metadataOnly && !fastOnly) {
      expect(controller.getSnapshot()).toMatchObject({
        resultsAvailable: true,
        analysisStage: 'deep',
      });
      getInsights.mockResolvedValue({ ...insights, pending: 0 });
    }
    return completed;
  });
  await controller.start();
  expect(stages).toEqual(['metadata', 'fast', 'deep']);
  expect(controller.getSnapshot().phase).toBe('ready');
});

it('explains an empty limited selection and rescans when selection changes', async () => {
  const { controller, getInsights, scan } = setup('limited');
  getInsights.mockResolvedValue({
    ...insights,
    total: 0,
    pending: 0,
    fastPending: 0,
  });
  await controller.start();
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'permission',
    error: 'LIMITED_ACCESS_EMPTY',
    resultsAvailable: false,
  });
  getInsights.mockResolvedValue({ ...insights, pending: 0, fastPending: 0 });
  await controller.start();
  expect(scan).toHaveBeenCalledTimes(2);
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    resultsAvailable: true,
  });
});
it('reconciles a changed limited selection in the same process', async () => {
  const { controller, getInsights, scan } = setup('limited');
  getInsights.mockResolvedValue({ ...insights, pending: 0, fastPending: 0 });
  await controller.start();
  await controller.start();
  expect(scan.mock.calls.map(([options]) => options.metadataOnly)).toEqual([
    true,
    true,
  ]);
});
