import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const shaderSource = readFileSync(
  join(
    repoRoot,
    'apps/unity/MakeupAR/Assets/Resources/ScreenSpaceFoundation.shader',
  ),
  'utf8',
);
const unityBridgeSource = readFileSync(
  join(repoRoot, 'apps/mobile/src/features/ar/services/unityMakeupBridge.ts'),
  'utf8',
);

assert.match(
  shaderSource,
  /float highStrength = smoothStrength \* smoothStrength \* smoothStrength;/,
  '피부 결 보정은 슬라이더 후반부를 위한 cubic 강도 항을 가져야 한다',
);
assert.match(
  shaderSource,
  /float radiusScale = 0\.8 \+ 2\.4 \* smoothStrength \+ 2\.0 \* highStrength;/,
  '최대 피부 결 보정 반경은 약 5.2배까지 확장되어야 한다',
);
assert.match(
  unityBridgeSource,
  /params\.skinSmoothing = 0\.45;/,
  '파운데이션 선택 직후의 기본 피부 보정을 한 단계 강화해야 한다',
);
assert.match(
  shaderSource,
  /float3 ClampFoundationToRosyReference\(float3 cameraColor, float3 candidateColor\)/,
  '파운데이션 후보색은 로지 기준 휘도 보호 함수를 거쳐야 한다',
);
assert.match(
  shaderSource,
  /const float rosyStrength = 0\.3;/,
  '사용자가 적절하다고 확인한 로지 톤업 0.3을 기준으로 사용해야 한다',
);
assert.match(
  shaderSource,
  /return ClampFoundationToRosyReference\(cameraColor, mixedColor\);/,
  '최종 파운데이션 혼합색에 로지 기준 휘도 상한을 적용해야 한다',
);

const oldRadius = strength => 0.7 + 2.3 * strength;
const newRadius = strength => 0.8 + 2.4 * strength + 2.0 * strength ** 3;
assert.ok(newRadius(0.55) >= oldRadius(0.55) * 1.15);
assert.ok(newRadius(1) >= oldRadius(1) * 1.7);

const luma = color => color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114;
const clampToRosyReference = (cameraColor, candidateColor) => {
  const rosyStrength = 0.3;
  const rosyReference = cameraColor.map(channel =>
    Math.min(1, channel * (1 + 0.18 * rosyStrength) + 0.04 * rosyStrength),
  );
  const scale = Math.min(1, luma(rosyReference) / Math.max(luma(candidateColor), 1e-4));
  return candidateColor.map(channel => Math.min(1, channel * scale));
};
const cameraSample = [0.52, 0.38, 0.31];
const tooBrightFoundation = [0.82, 0.72, 0.68];
const protectedFoundation = clampToRosyReference(cameraSample, tooBrightFoundation);
const rosyReference = cameraSample.map(channel =>
  Math.min(1, channel * (1 + 0.18 * 0.3) + 0.04 * 0.3),
);
assert.ok(luma(protectedFoundation) <= luma(rosyReference) + 1e-6);
assert.ok(luma(protectedFoundation) < luma(tooBrightFoundation));

console.log('AR skin and look-scope runner passed');
