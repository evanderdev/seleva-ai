import { Stack, router } from 'expo-router';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { theme } from '@seleva/ui';
import { Button } from 'react-native';
import i18n from '../src/i18n';
import { DatabaseProvider } from '../src/services/database';

function Navigation() {
  const { t } = useTranslation();
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: t('brand'),
            headerRight: () => (
              <Button title="⚙" onPress={() => router.push('/settings')} />
            ),
          }}
        />
        <Stack.Screen name="library" options={{ title: t('results') }} />
        <Stack.Screen name="settings" options={{ title: t('settings') }} />
        <Stack.Screen name="search" options={{ title: t('search') }} />
        <Stack.Screen name="clean" options={{ title: t('clean') }} />
      </Stack>
    </>
  );
}
export default function Layout() {
  return (
    <I18nextProvider i18n={i18n}>
      <DatabaseProvider>
        <Navigation />
      </DatabaseProvider>
    </I18nextProvider>
  );
}
