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

const regionsSource = readFileSync(
  join(srcRoot, 'features/ar/stencil/src/composer/regions.ts'),
  'utf8',
);
const lookVariantsSource = readFileSync(
  join(srcRoot, 'features/ar/stencil/src/composer/lookVariants.ts'),
  'utf8',
);

assert.match(
  regionsSource,
  /type:\s*'slider',\s*label:\s*'윤광',\s*key:\s*'skinGlow'/,
  '피부결 상세의 윤광은 독립 슬라이더여야 한다(양자택일 세그 해체)',
);
assert.match(
  regionsSource,
  /type:\s*'segments',\s*key:\s*'glowShape',\s*options:\s*GLOW_ZONE_SHAPES/,
  '윤광 존 세그(glowShape)가 있어야 T존 매트+볼 윤광이 성립한다',
);
assert.ok(
  !regionsSource.includes("label: '윤광 프라이머' }"),
  '모공/윤광 프라이머 양자택일 세그 옵션은 해체되어야 한다',
);
assert.match(
  lookVariantsSource,
  /'skin-tier',\s*'natural',\s*'내추럴 보정'/,
  '피부결 리터치 티어 룩(내추럴 보정)이 있어야 한다',
);
assert.match(
  lookVariantsSource,
  /corrector2Intensity:\s*0\.4/,
  '코렉터 색 중첩(슬롯 2 동시 적용) 룩이 있어야 한다',
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
