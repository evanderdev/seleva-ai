import { withAppBuildGradle, type ConfigPlugin } from 'expo/config-plugins';

const marker = '// SelevaAI: shorter Windows CMake staging path';

export const withWindowsNativeBuild: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('Windows native build configuration requires Groovy.');
    }
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `
${marker}
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
    android.externalNativeBuild.cmake.buildStagingDirectory = rootProject.file('../../../.tools/cxx')
}
`;
    }
    return mod;
  });
