import { LibraryProvider } from '../src/features/library/LibraryProvider';
import { Stack } from 'expo-router';
import { I18nextProvider } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@seleva/ui';
import i18n from '../src/i18n';
import { DatabaseProvider } from '../src/services/database';
import { usePreferences } from '../src/stores/preferences';
function Navigation() {
  const colors = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
function ThemedApp() {
  const mode = usePreferences((s) => s.themeMode);
  return (
    <ThemeProvider mode={mode}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <DatabaseProvider>
        <LibraryProvider>
          <Navigation />
        </LibraryProvider>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
export default function Layout() {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemedApp />
    </I18nextProvider>
  );
}
