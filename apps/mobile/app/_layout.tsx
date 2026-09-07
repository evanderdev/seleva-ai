import { Tabs } from 'expo-router';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { theme } from '@seleva/ui';
import i18n from '../src/i18n';
import { DatabaseProvider } from '../src/services/database';

function Navigation() {
  const { t } = useTranslation();
  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          tabBarIcon: () => null,
          tabBarActiveTintColor: theme.colors.primary,
          headerStyle: { backgroundColor: theme.colors.surface },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: t('home'), headerTitle: t('brand') }}
        />
        <Tabs.Screen name="search" options={{ title: t('search') }} />
        <Tabs.Screen name="clean" options={{ title: t('clean') }} />
        <Tabs.Screen name="library" options={{ title: t('library') }} />
        <Tabs.Screen name="settings" options={{ title: t('settings') }} />
      </Tabs>
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
