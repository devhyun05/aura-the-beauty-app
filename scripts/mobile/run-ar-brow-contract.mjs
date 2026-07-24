import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const srcRoot = join(repoRoot, 'apps/mobile/src');
const unityRoot = join(repoRoot, 'apps/unity/MakeupAR/Assets');
const outDir = mkdtempSync(join(tmpdir(), 'aura-ar-brow-contract-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const contractTest = join(
  srcRoot,
  'features/ar/stencil/src/composer/browTree.test.ts',
);

const readMobile = relative => readFileSync(join(srcRoot, relative), 'utf8');
const readUnity = relative => readFileSync(join(unityRoot, relative), 'utf8');

const basicMode = readMobile(
  'features/ar/stencil/src/components/BasicMode.tsx',
);
assert.match(
  basicMode,
  /slot === '눈썹'[\s\S]*REGION_MAP\.browConceal,\s*REGION_MAP\.brow/,
  '기본 눈썹 중분류는 지우개와 눈썹만 노출해야 한다',
);
assert.doesNotMatch(
  basicMode,
  /BROW_COLOR_LABELS/,
  '눈썹 색상 라벨은 색상과 분리된 인덱스 배열로 관리하면 안 된다',
);

const presets = readMobile('features/ar/stencil/src/presets.ts');
for (const label of ['라이트 브라운', '퍼플', '와인', '옐로우', '핑크']) {
  assert.ok(presets.includes(`label: '${label}'`), `${label} 눈썹 색상이 누락됐다`);
}

const bridge = readUnity(
  'Scripts/MediaPipeGraft/ARwithFable/Bridge/BridgeMessages.cs',
);
assert.ok(
  bridge.includes('5..9=레퍼런스 알파 마스크 1..5'),
  'Unity 브리지의 레퍼런스 눈썹 템플릿 계약이 누락됐다',
);
assert.ok(
  !bridge.includes('browReplacementIntensity'),
  '눈썹 선택이 자동 지우개 필드를 만들면 안 된다',
);

const controller = readUnity(
  'Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs',
);
assert.match(
  controller,
  /StyleRenderer\.Instance\.ApplyStyleParams\([\s\S]*p\.browStyleTemplate/,
  'MakeupController가 browStyleTemplate을 StyleRenderer로 전달해야 한다',
);
const styleRenderer = readUnity(
  'Scripts/MediaPipeGraft/ARwithFable/Face/StyleRenderer.cs',
);
assert.match(
  styleRenderer,
  /"EyebrowMasks\/reference_brow_01"[\s\S]*"EyebrowMasks\/reference_brow_05"/,
  'StyleRenderer가 레퍼런스 눈썹 마스크 5종을 순서대로 로드해야 한다',
);
const browRenderer = readUnity(
  'Scripts/MediaPipeGraft/ARwithFable/Face/BrowRenderer.cs',
);
assert.match(
  browRenderer,
  /_conceal\.intensity = Mathf\.Clamp01\(p\.browConcealIntensity\)/,
  'BrowRenderer 지우개는 명시적인 browConcealIntensity만 사용해야 한다',
);

for (let index = 1; index <= 5; index += 1) {
  const name = `reference_brow_0${index}.png`;
  assert.ok(
    existsSync(join(unityRoot, 'Resources/EyebrowMasks', name)),
    `${name} 알파 마스크가 누락됐다`,
  );
  assert.ok(
    existsSync(join(unityRoot, 'Resources/EyebrowMasks', `${name}.meta`)),
    `${name}.meta가 누락됐다`,
  );
}

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
  join(outDir, 'features/ar/stencil/src/composer/browTree.test.js'),
], {cwd: repoRoot, stdio: 'inherit'});

if (testResult.status !== 0) process.exit(testResult.status ?? 1);

console.log('AR eyebrow UI, composer, bridge, and asset contracts verified.');
