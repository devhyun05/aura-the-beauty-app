import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const srcRoot = join(repoRoot, 'apps/mobile/src');
const outDir = mkdtempSync(join(tmpdir(), 'aura-ar-guide-all-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const selectionTest = join(
  srcRoot,
  'features/ar/stencil/src/composer/stencilSelection.test.ts',
);

const guideSource = readFileSync(
  join(srcRoot, 'features/ar/stencil/src/components/GuideMode.tsx'),
  'utf8',
);
const appSource = readFileSync(
  join(srcRoot, 'features/ar/stencil/StencilARApp.tsx'),
  'utf8',
);

assert.doesNotMatch(
  appSource,
  /maskStencilByKeys|availableStencilKeysRef/,
  '전체 가이드 payload를 현재 룩의 부위로 다시 제한하면 안 된다',
);
assert.match(
  guideSource,
  /enableAllStencilRegions\(value\)/,
  '전체 카드는 모든 지원 가이드를 켜야 한다',
);
assert.match(
  appSource,
  /const allGuides = enableAllStencilRegions\(stencilRef\.current\);[\s\S]*?setStencilState\(allGuides\);[\s\S]*?pushStencil\(allGuides, true\);/,
  '가이드 레인 진입 시 전체 선택 상태와 Unity payload가 일치해야 한다',
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
  selectionTest,
], {cwd: repoRoot, stdio: 'inherit'});

if (result.status !== 0) process.exit(result.status ?? 1);

const testResult = spawnSync(process.execPath, [
  join(outDir, 'features/ar/stencil/src/composer/stencilSelection.test.js'),
], {cwd: repoRoot, stdio: 'inherit'});

if (testResult.status !== 0) process.exit(testResult.status ?? 1);

console.log('AR all-guide contract passed');
