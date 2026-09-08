import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { libraryAccess } from '@seleva/photo-engine';
import { usePhotoRepository } from '../../services/database';
import { runLibraryScan, stopLibraryScan } from '../../services/scanner';
import { createLibraryBootstrap } from './bootstrap';

const Context = createContext<ReturnType<typeof createLibraryBootstrap> | null>(
  null,
);
export function LibraryProvider({ children }: PropsWithChildren) {
  const repository = usePhotoRepository();
  const [controller] = useState(() =>
    createLibraryBootstrap({
      repository,
      access: libraryAccess,
      scan: (callbacks) => runLibraryScan(repository, undefined, callbacks),
      stop: (id) => stopLibraryScan(id, 'paused'),
    }),
  );
  useEffect(() => {
    controller.setActive(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) =>
      controller.setActive(state === 'active'),
    );
    return () => {
      subscription.remove();
      controller.setActive(false);
    };
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useLibrary() {
  const controller = useContext(Context);
  if (!controller) throw new Error('LIBRARY_PROVIDER_REQUIRED');
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return {
    ...state,
    synchronize: controller.start,
    retry: controller.retry,
    refresh: controller.refresh,
  };
}
