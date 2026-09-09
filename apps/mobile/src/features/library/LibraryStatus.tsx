import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Button, Icon, layout, useTheme } from '@seleva/ui';
import { useLibrary } from './LibraryProvider';

export function LibraryStatus() {
  const { t } = useTranslation();
  const colors = useTheme();
  const { phase, permission, retry, refresh } = useLibrary();
  const busy = ['opening', 'metadata', 'analysis'].includes(phase);
  const denied = phase === 'permission';
  return (
    <View style={{ paddingTop: 12, gap: 10 }}>
      <View style={[layout.row, { minHeight: 32, gap: 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('viewProgress')}
          onPress={() => router.push('/progress')}
          style={({ pressed }) => [
            layout.row,
            { flex: 1, minHeight: 44, gap: 8, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          {busy && <ActivityIndicator size="small" color={colors.muted} />}
          <Text style={{ color: colors.muted, fontSize: 11, flex: 1 }}>
            {t(
              denied
                ? 'libraryAccessTitle'
                : phase === 'error'
                  ? 'preparationFailed'
                  : busy
                    ? 'quietUpdating'
                    : phase === 'paused'
                      ? 'scanPaused'
                      : 'quietReady',
            )}
          </Text>
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <Icon name="arrow" size={14} />
          </View>
        </Pressable>
        {!busy && !denied && phase !== 'error' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => void (phase === 'paused' ? retry() : refresh())}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {t(phase === 'paused' ? 'retry' : 'refreshIndex')}
            </Text>
          </Pressable>
        )}
      </View>
      {permission === 'limited' && (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {t('limitedLibrary')}
        </Text>
      )}
      {(denied || permission === 'limited') && (
        <Button
          variant="outline"
          label={t('openSettings')}
          onPress={() => {
            void Linking.openSettings().catch(() => retry());
          }}
        />
      )}
      {phase === 'error' && (
        <Button
          variant="outline"
          label={t('retry')}
          onPress={() => void retry()}
        />
      )}
    </View>
  );
}
