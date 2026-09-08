import type { PhotoPermission, ScanJob, EngineResult } from '@seleva/core';
import type { PhotoRepository } from '@seleva/database';
import type { ScanCallbacks } from '../../services/scanner';

export type LibraryInsights = Awaited<
  ReturnType<PhotoRepository['getInsights']>
>;
export interface LibraryState {
  permission?: PhotoPermission;
  phase:
    | 'opening'
    | 'permission'
    | 'metadata'
    | 'analysis'
    | 'ready'
    | 'paused'
    | 'error';
  job?: ScanJob;
  insights?: LibraryInsights;
  error?: string;
  revision: number;
}
interface Dependencies {
  repository: Pick<PhotoRepository, 'getInsights'>;
  access: {
    getPermission(): Promise<EngineResult<PhotoPermission>>;
    requestPermission(): Promise<EngineResult<PhotoPermission>>;
  };
  scan(callbacks: ScanCallbacks): Promise<ScanJob | undefined>;
  stop(id: string): Promise<boolean>;
}

/** One foreground coordinator shared by every route. No asset datasets in state. */
export function createLibraryBootstrap(deps: Dependencies) {
  let state: LibraryState = { phase: 'opening', revision: 0 };
  const listeners = new Set<() => void>();
  let active = true;
  let running: Promise<void> | undefined;
  let metadataDone = false;
  let completed = false;
  let requested = false;
  let refresh: Promise<void> | undefined;
  let lastRefresh = 0;
  const publish = (next: Partial<LibraryState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const updateInsights = async () => {
    if (refresh) return refresh;
    refresh = deps.repository
      .getInsights()
      .then((insights) => publish({ insights, revision: state.revision + 1 }))
      .finally(() => {
        refresh = undefined;
        lastRefresh = Date.now();
      });
    return refresh;
  };
  async function prepare() {
    try {
      let permission = await deps.access.getPermission();
      if (!active) return;
      if (
        permission.ok &&
        permission.value === 'not-determined' &&
        !requested
      ) {
        requested = true;
        publish({ phase: 'permission' });
        permission = await deps.access.requestPermission();
      }
      if (!permission.ok) {
        publish({ phase: 'error', error: permission.error });
        return;
      }
      const previous = state.permission;
      publish({ permission: permission.value, error: undefined });
      if (!['authorized', 'limited'].includes(permission.value)) {
        metadataDone = false;
        completed = false;
        publish({
          phase: 'permission',
          insights: undefined,
          revision: state.revision + 1,
        });
        return;
      }
      if (previous && previous !== permission.value) {
        metadataDone = false;
        completed = false;
      }
      if (!active) {
        publish({ phase: 'paused' });
        return;
      }
      if (completed) {
        await updateInsights();
        return;
      }
      for (const metadataOnly of metadataDone ? [false] : [true, false]) {
        if (!active) {
          publish({ phase: 'paused' });
          return;
        }
        if (
          !metadataOnly &&
          (await deps.repository.getInsights()).pending === 0
        )
          break;
        publish({
          phase: metadataOnly ? 'metadata' : 'analysis',
          job: undefined,
          error: undefined,
        });
        const job = await deps.scan({
          metadataOnly,
          onProgress: (job) => {
            publish({ job });
            if (!active) void deps.stop(job.id);
          },
          onCommitted: () => {
            if (Date.now() - lastRefresh > 1200)
              void updateInsights().catch(() => publish({ error: 'UNKNOWN' }));
          },
        });
        await updateInsights();
        publish({ job });
        if (job?.status !== 'completed') {
          publish({
            phase: job?.status === 'paused' ? 'paused' : 'error',
            error: job?.error,
          });
          return;
        }
        if (metadataOnly) metadataDone = true;
      }
      completed = true;
      await updateInsights();
      publish({ phase: 'ready' });
    } catch {
      publish({ phase: 'error', error: 'UNKNOWN' });
    }
  }
  function start() {
    if (!active) return Promise.resolve();
    if (!running)
      running = prepare().finally(() => {
        running = undefined;
        if (active && state.phase === 'paused') void start();
      });
    return running;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    retry() {
      completed = false;
      return start();
    },
    refresh() {
      metadataDone = false;
      completed = false;
      return start();
    },
    setActive(value: boolean) {
      active = value;
      if (!value && state.job?.status === 'running')
        void deps.stop(state.job.id);
      if (value) void start();
    },
  };
}
