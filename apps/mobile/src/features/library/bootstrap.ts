import { z } from 'zod';
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
  resultsAvailable: boolean;
}
interface Dependencies {
  repository: Pick<
    PhotoRepository,
    'getInsights' | 'getPreference' | 'setPreference'
  >;
  access: {
    getPermission(): Promise<EngineResult<PhotoPermission>>;
    requestPermission(): Promise<EngineResult<PhotoPermission>>;
  };
  scan(callbacks: ScanCallbacks): Promise<ScanJob | undefined>;
  stop(id: string): Promise<boolean>;
}

const cacheKey = 'library-metadata-v1';
const cacheSchema = z.object({
  completedAt: z.number().finite().nonnegative(),
  permission: z.enum(['authorized', 'limited']),
});
const cacheLifetime = 6 * 60 * 60 * 1000;

/** One foreground coordinator shared by every route. No asset datasets in state. */
export function createLibraryBootstrap(deps: Dependencies) {
  let state: LibraryState = {
    phase: 'opening',
    revision: 0,
    resultsAvailable: false,
  };
  const listeners = new Set<() => void>();
  let active = true;
  let running: Promise<void> | undefined;
  let metadataDone = false;
  let completed = false;
  let cacheLoaded = false;
  let metadataAt = 0;
  let forceRefresh = false;
  let requested = false;
  let refresh: Promise<void> | undefined;
  const publish = (next: Partial<LibraryState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const updateInsights = async (force = false) => {
    if (refresh) {
      await refresh;
      if (!force) return;
    }
    refresh = deps.repository
      .getInsights()
      .then((insights) =>
        publish({
          insights,
          revision: state.revision + 1,
          resultsAvailable:
            state.resultsAvailable || insights.total > insights.pending,
        }),
      )
      .finally(() => {
        refresh = undefined;
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
        publish({
          phase: 'error',
          error: permission.error,
          resultsAvailable: false,
          permission: undefined,
        });
        return;
      }
      const previous = state.permission;
      publish({ permission: permission.value, error: undefined });
      if (!['authorized', 'limited'].includes(permission.value)) {
        metadataDone = false;
        completed = false;
        await deps.repository.setPreference(cacheKey, '');
        publish({
          phase: 'permission',
          insights: undefined,
          resultsAvailable: false,
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
      if (!cacheLoaded) {
        cacheLoaded = true;
        const raw = await deps.repository.getPreference(cacheKey);
        let cached: z.infer<typeof cacheSchema> | undefined;
        try {
          cached = cacheSchema.parse(JSON.parse(raw ?? 'null'));
        } catch {
          /* Rebuild invalid cache metadata. */
        }
        if (
          !forceRefresh &&
          cached?.permission === permission.value &&
          permission.value === 'authorized'
        ) {
          metadataAt = cached.completedAt;
          metadataDone =
            Date.now() >= metadataAt && Date.now() - metadataAt < cacheLifetime;
        }
      }
      await updateInsights(true);
      if (Date.now() - metadataAt >= cacheLifetime) {
        metadataDone = false;
        completed = false;
      }
      if (completed && metadataDone) {
        publish({ phase: 'ready' });
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
        if (metadataOnly) await deps.repository.setPreference(cacheKey, '');
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
            void updateInsights(true).catch(() =>
              publish({ error: 'UNKNOWN' }),
            );
          },
        });
        await updateInsights(true);
        publish({ job });
        if (job?.status !== 'completed') {
          publish({
            phase: job?.status === 'paused' ? 'paused' : 'error',
            error: job?.error,
          });
          return;
        }
        if (metadataOnly) {
          metadataDone = true;
          forceRefresh = false;
          metadataAt = Date.now();
          await deps.repository.setPreference(
            cacheKey,
            JSON.stringify({
              completedAt: metadataAt,
              permission: permission.value,
            }),
          );
        }
      }
      await updateInsights(true);
      if (state.insights?.pending) {
        publish({ phase: 'error', error: 'ANALYSIS_PENDING' });
        return;
      }
      completed = true;
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
      if (running) return running;
      forceRefresh = true;
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
