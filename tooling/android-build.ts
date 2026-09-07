import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';

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
const drive = 'S:';
if (process.platform === 'win32') {
  let existing = false;
  try {
    execFileSync('subst', [drive], { stdio: 'ignore' });
    existing = true;
  } catch {
    // `subst S:` exits non-zero when the drive is free.
  }
  if (existing)
    throw new Error(
      `Drive ${drive} is already assigned; choose another drive.`,
    );
  execFileSync('subst', [drive, root]);
}
const buildRoot = process.platform === 'win32' ? `${drive}\\` : root;
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
      JAVA_HOME:
        process.platform === 'win32' ? jdk.replace(root, buildRoot) : jdk,
      ANDROID_HOME:
        process.platform === 'win32' ? sdk.replace(root, buildRoot) : sdk,
      // Keep transformed React Native headers below Windows' path limit.
      GRADLE_USER_HOME: join(buildRoot, '.g'),
    },
  },
);
child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  if (process.platform === 'win32') execFileSync('subst', [drive, '/d']);
  process.exitCode = code ?? 1;
});
