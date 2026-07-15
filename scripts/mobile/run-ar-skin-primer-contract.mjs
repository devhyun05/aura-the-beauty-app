import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const srcRoot = join(repoRoot, 'apps/mobile/src');
const outDir = mkdtempSync(join(tmpdir(), 'aura-ar-skin-primer-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const contractTest = join(
  srcRoot,
  'features/ar/stencil/src/composer/skinPrimerContract.test.ts',
);

const composerSource = readFileSync(
  join(srcRoot, 'features/ar/stencil/src/components/ComposerSheet.tsx'),
  'utf8',
);

assert.match(
  composerSource,
  /leaf\.region === 'skin'[\s\S]*?skinGlow[\s\S]*?'윤광 프라이머'[\s\S]*?'모공 프라이머'/,
  '상세 트리의 프라이머 이름은 skinGlow 선택과 일치해야 한다',
);

const result = spawnSync(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--esModuleInterop',
  '--skipLibCheck',
  '--rootDir',
  srcRoot,
  '--outDir',
  outDir,
  contractTest,
], {cwd: repoRoot, stdio: 'inherit'});

if (result.status !== 0) process.exit(result.status ?? 1);

const testResult = spawnSync(process.execPath, [
  join(outDir, 'features/ar/stencil/src/composer/skinPrimerContract.test.js'),
], {cwd: repoRoot, stdio: 'inherit'});

if (testResult.status !== 0) process.exit(testResult.status ?? 1);

console.log('AR skin-primer contract passed');
