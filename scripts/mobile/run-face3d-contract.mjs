import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face3d-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const srcRoot = join(repoRoot, 'apps/mobile/src');
const testPaths = [
  'features/face-3d/services/face3DContract.test.ts',
  'features/face-3d/services/face3DSemanticCaptureContract.test.ts',
  'features/face-3d/services/face3DTier2PassThrough.test.ts',
  'features/face-analysis/services/faceAnalysisCaptureGuidance.test.ts',
];

const result = spawnSync(
  process.execPath,
  [
    tscPath,
    '--ignoreConfig',
    '--module',
    'commonjs',
    '--target',
    'ES2020',
    '--strict',
    '--skipLibCheck',
    '--rootDir',
    srcRoot,
    '--outDir',
    outDir,
    ...testPaths.map(testPath => join(srcRoot, testPath)),
  ],
  {cwd: repoRoot, stdio: 'inherit'},
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

for (const testPath of testPaths) {
  const testResult = spawnSync(
    process.execPath,
    [join(outDir, testPath.replace(/\.ts$/, '.js'))],
    {cwd: repoRoot, stdio: 'inherit'},
  );
  if (testResult.status !== 0) {
    process.exit(testResult.status ?? 1);
  }
}

console.log('Face3D profile and semantic capture-set contracts passed.');
