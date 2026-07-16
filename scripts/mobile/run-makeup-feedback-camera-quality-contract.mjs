import {spawnSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const sourceRoot = join(repositoryRoot, 'apps/mobile/src');
const outputDirectory = mkdtempSync(
  join(tmpdir(), 'aura-makeup-feedback-camera-quality-'),
);
const tscPath = join(repositoryRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const testPath = join(
  sourceRoot,
  'features/face-capture/services/makeupFeedbackRealtimeQuality.test.ts',
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  tscPath,
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--jsx',
  'react',
  '--esModuleInterop',
  '--skipLibCheck',
  '--rootDir',
  sourceRoot,
  '--outDir',
  outputDirectory,
  testPath,
]);

run(process.execPath, [
  join(
    outputDirectory,
    'features/face-capture/services/makeupFeedbackRealtimeQuality.test.js',
  ),
]);

console.log(
  'Makeup feedback camera contract verified: strict live evidence is isolated to makeup_feedback.',
);
