import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { openDatabaseAsync } from 'expo-sqlite';
import { migrate, PhotoRepository } from '@seleva/database';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, theme } from '@seleva/ui';
import { usePreferences } from '../stores/preferences';
import { locales, type Locale } from '../i18n';

const DatabaseContext = createContext<PhotoRepository | null>(null);
let initialization: Promise<PhotoRepository> | undefined;
function initialize() {
  initialization ??= (async () => {
    const db = await openDatabaseAsync('seleva.db');
    try {
      await migrate(db);
      return new PhotoRepository(db);
    } catch (error) {
      await db.closeAsync();
      initialization = undefined;
      throw error;
    }
  })();
  return initialization;
}
export function DatabaseProvider({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const [repository, setRepository] = useState<PhotoRepository>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void initialize()
      .then(async (value) => {
        const locale = await value.getPreference('locale');
        if (!active) return;
        if (locale && locales.includes(locale as Locale))
          usePreferences.getState().setLocale(locale as Locale);
        setRepository(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (!repository)
    return (
      <View
        style={{
          flex: 1,
          padding: theme.spacing.lg,
          justifyContent: 'center',
          gap: theme.spacing.md,
        }}
      >
        {failed ? (
          <>
            <Text>{t('databaseError')}</Text>
            <Button
              label={t('retry')}
              onPress={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            />
          </>
        ) : (
          <>
            <ActivityIndicator />
            <Text>{t('loading')}</Text>
          </>
        )}
      </View>
    );
  return (
    <DatabaseContext.Provider value={repository}>
      {children}
    </DatabaseContext.Provider>
  );
}
export function usePhotoRepository() {
  const repository = useContext(DatabaseContext);
  if (!repository) throw new Error('DATABASE_PROVIDER_REQUIRED');
  return repository;
}
