import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face-ratio-distortion-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const srcRoot = join(repoRoot, 'apps/mobile/src');

const testPaths = [
  'features/face-capture/constants/faceEllipseGuide.test.ts',
  'features/face-capture/constants/facePoseGates.test.ts',
  'features/face-capture/services/faceCapturePitchGate.test.ts',
  'features/face-capture/services/faceCaptureGreenlight.test.ts',
  'features/face-capture/services/realtimeFrameGeometry.test.ts',
  'features/face-ratio/services/faceVerticalThirdsRollCorrection.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--jsx',
  'react',
  '--esModuleInterop',
  '--skipLibCheck',
  '--rootDir',
  srcRoot,
  '--outDir',
  outDir,
  ...testPaths.map(testPath => join(srcRoot, testPath)),
]);

for (const testPath of testPaths) {
  run(process.execPath, [join(outDir, testPath.replace(/\.ts$/, '.js'))]);
}
