import {
  withAndroidManifest,
  withInfoPlist,
  type ConfigPlugin,
} from 'expo/config-plugins';

export const withPhotoPermissions: ConfigPlugin = (config) => {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSPhotoLibraryUsageDescription =
      'SelevaAI analyzes your photo library on your phone. Your photos are never uploaded.';
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    const names = [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    ];
    const existing = mod.modResults.manifest['uses-permission'] ?? [];
    mod.modResults.manifest['uses-permission'] = [
      ...existing.filter((entry) => !names.includes(entry.$['android:name'])),
      ...names.map((name) => ({
        $: {
          'android:name': name,
          ...(name.endsWith('READ_EXTERNAL_STORAGE')
            ? { 'android:maxSdkVersion': '32' }
            : {}),
        },
      })),
    ];
    return mod;
  });
};
