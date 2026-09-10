import { withGradleProperties, type ConfigPlugin } from 'expo/config-plugins';

/** Compresses native libraries so APKs remain installable on 16 KB page-size devices. */
export const withAndroid16kPackaging: ConfigPlugin = (config) =>
  withGradleProperties(config, (mod) => {
    const properties = mod.modResults;
    const existing = properties.find(
      (property) => property.type === 'property' && property.key === 'expo.useLegacyPackaging',
    );
    if (existing && existing.type === 'property') existing.value = 'true';
    else properties.push({ type: 'property', key: 'expo.useLegacyPackaging', value: 'true' });
    return mod;
  });
