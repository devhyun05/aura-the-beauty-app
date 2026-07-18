import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const srcRoot = join(repoRoot, 'apps/mobile/src');

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
  /enableAllStencilRegions/,
  '가이드 진입 시 정본에 없는 전체 부위 강제 활성화를 하면 안 된다',
);
assert.match(
  guideSource,
  /maskStencilByKeys\([\s\S]*available/,
  '전체 카드는 현재 룩에 실제 있는 정본 가이드 부위만 켜야 한다',
);
assert.match(
  appSource,
  /availableStencilKeysRef[\s\S]*maskStencilByKeys\(p, availableStencilKeysRef\.current\)/,
  'Unity 가이드 payload도 현재 룩의 정본 부위 집합으로 제한해야 한다',
);
console.log('AR all-guide contract passed');
