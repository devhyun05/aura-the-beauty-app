import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face-analysis-measurements-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const featuresDir = join(repoRoot, 'apps/mobile/src/features');

// 진입 파일만 나열 — 순수(RN 무의존) 전이 import(face-ratio/face-3d/face-geometry
// 타입, personalColorCore 계약)는 tsc 가 자동으로 끌어와 컴파일한다.
const entries = [
  'face-analysis/services/faceAnalysisMeasurements.ts',
  'face-analysis/services/faceAnalysisMeasurements.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
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
  '--esModuleInterop',
  '--strict',
  '--skipLibCheck',
  '--rootDir',
  featuresDir,
  '--outDir',
  outDir,
  ...entries.map(file => join(featuresDir, file)),
]);

run(process.execPath, [
  join(outDir, 'face-analysis/services/faceAnalysisMeasurements.test.js'),
]);
