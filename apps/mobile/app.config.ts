import 'tsx/cjs';
import type { ExpoConfig } from 'expo/config';
import { withPhotoPermissions } from './plugins/withPhotoPermissions';
import { withWindowsNativeBuild } from './plugins/withWindowsNativeBuild';
import { withAndroid16kPackaging } from './plugins/withAndroid16kPackaging';

const config: ExpoConfig = {
  name: 'SelevaAI',
  slug: 'seleva-ai',
  scheme: 'seleva',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['ios', 'android'],
  ios: { bundleIdentifier: 'com.seleva.app', supportsTablet: true },
  android: {
    package: 'com.seleva.app',
    allowBackup: false,
    blockedPermissions: ['android.permission.WRITE_EXTERNAL_STORAGE'],
  },
  locales: {
    en: './locales/en.json',
    'pt-BR': './locales/pt-BR.json',
    es: './locales/es.json',
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-status-bar',
    'expo-splash-screen',
    'expo-font',
    'expo-asset',
    'onnxruntime-react-native',
    ['expo-sqlite', { enableFTS: true }],
  ],
};
export default withAndroid16kPackaging(
  withWindowsNativeBuild(withPhotoPermissions(config)),
);
