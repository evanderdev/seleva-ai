import { useEffect, useState } from 'react';
import { AppState, Linking, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '@seleva/ui';
import { libraryAccess } from '@seleva/photo-engine';
import type { PhotoPermission } from '@seleva/core';

export function LibraryPermissionCard() {
  const { t } = useTranslation();
  const [permission, setPermission] = useState<PhotoPermission>();
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const result = await libraryAccess.getPermission();
      if (!active) return;
      if (result.ok) {
        setPermission(result.value);
        setUnavailable(false);
        setFailed(false);
      } else {
        setUnavailable(result.error === 'DEVICE_UNSUPPORTED');
        setFailed(result.error !== 'DEVICE_UNSUPPORTED');
      }
    };
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  async function request() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await libraryAccess.requestPermission();
    if (result.ok) setPermission(result.value);
    else setFailed(true);
    setBusy(false);
  }
  return (
    <Card>
      <Text>{t('permissionIntro')}</Text>
      {unavailable ? (
        <Text>{t('libraryHint')}</Text>
      ) : (
        <>
          {permission && <Text>{t(`permission_${permission}`)}</Text>}
          {(permission === 'not-determined' ||
            permission === 'limited' ||
            failed) && (
            <Button
              label={t('connectLibrary')}
              disabled={busy}
              onPress={() => {
                void request();
              }}
            />
          )}
          {(permission === 'denied' || permission === 'restricted') && (
            <Button
              label={t('openSettings')}
              onPress={() => {
                void Linking.openSettings().catch(() => setFailed(true));
              }}
            />
          )}
          {permission === 'authorized' && <Text>{t('indexingPending')}</Text>}
        </>
      )}
      {failed && <Text accessibilityRole="alert">{t('permissionError')}</Text>}
    </Card>
  );
}
