import { createLibraryBootstrap, type LibraryInsights } from './bootstrap';
import type { ScanCallbacks } from '../../services/scanner';
import type { EngineResult, PhotoPermission, ScanJob } from '@seleva/core';

const insights: LibraryInsights = {
  total: 4,
  knownBytes: 1000,
  unknownSizes: 0,
  pending: 4,
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
function setup(permission: PhotoPermission = 'not-determined') {
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
  const scan = jest.fn<Promise<ScanJob>, [ScanCallbacks]>(async () => completed);
  const getInsights = jest.fn(async () => insights);
  const stop = jest.fn(async () => true);
  const controller = createLibraryBootstrap({
    access: { getPermission, requestPermission },
    repository: { getInsights },
    scan,
    stop,
  });
  return {
    controller,
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
