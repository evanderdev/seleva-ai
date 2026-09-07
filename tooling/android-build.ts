import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

// Invoked from apps/mobile by the root build:android:local script.
const root = resolve(process.cwd(), '../..');
const jdkRoot = join(root, '.tools', 'jdk');
const jdk = existsSync(jdkRoot)
  ? readdirSync(jdkRoot)
      .map((name) => join(jdkRoot, name))
      .find((directory) => existsSync(join(directory, 'bin', 'java.exe')))
  : undefined;
const sdk = join(root, '.tools', 'android-sdk');
if (
  process.platform !== 'win32' ||
  !jdk ||
  !existsSync(join(sdk, 'platforms', 'android-36'))
) {
  throw new Error(
    'Local Windows JDK/SDK unavailable. See docs/android-local.md.',
  );
}
// Keep the project and node_modules on the same Windows root. React Native
// codegen compares canonical paths and fails when the project is staged on a
// temporary drive (S:) while dependencies remain on C:.
const buildRoot = root;
const child = spawn(
  'cmd.exe',
  [
    '/d',
    '/s',
    '/c',
    'gradlew.bat :app:assembleDebug --no-daemon --console=plain --max-workers=2 -PreactNativeArchitectures=arm64-v8a',
  ],
  {
    cwd: join(buildRoot, 'apps', 'mobile', 'android'),
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      JAVA_HOME: jdk,
      ANDROID_HOME: sdk,
      GRADLE_USER_HOME: join(buildRoot, '.g'),
    },
  },
);
child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
