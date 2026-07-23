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
const cameraFeedSource = readFileSync(
  join(repoRoot, 'apps/unity/MakeupAR/Assets/Resources/CameraFeed.shader'),
  'utf8',
);
const faceMakeupSource = readFileSync(
  join(repoRoot, 'apps/unity/MakeupAR/Assets/Resources/FaceMakeup.shader'),
  'utf8',
);
const makeupControllerSource = readFileSync(
  join(
    repoRoot,
    'apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/MakeupController.cs',
  ),
  'utf8',
);
const stencilGuideSource = readFileSync(
  join(
    repoRoot,
    'apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/StencilGuideRenderer.cs',
  ),
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

assert.match(
  makeupControllerSource,
  /Mathf\.Max\(\s*Mathf\.Clamp01\(p\.skinSmoothingExtended\),\s*Mathf\.Clamp01\(p\.skinSmoothing\)\)/,
  '일반 피부결 보정도 얼굴 메시 밖 턱밑·목 상단 확장 경로를 켜야 한다',
);
assert.match(
  cameraFeedSource,
  /#define SEG_SMOOTH_SKIN_LO 0\.10\b/,
  '목 body-skin의 낮은 신뢰도 전이대도 피부결 보정에 포함해야 한다',
);
assert.match(
  cameraFeedSource,
  /float chinRelease = NeckRelease\(src\);/,
  '파운데이션 오벌 제외는 턱 방향에서 비대칭으로 풀려야 한다',
);
assert.match(
  cameraFeedSource,
  /max\(1\.0 - insideOval, chinRelease\)/,
  '턱 아래는 대칭 오벌 페더가 아니라 목 연결 게이트가 우선해야 한다',
);
assert.match(
  stencilGuideSource,
  /Shader\.SetGlobalVector\(FndChinAxisId,/,
  '턱 위치와 얼굴 세로축을 매 프레임 목 연결 게이트에 공급해야 한다',
);
assert.match(
  faceMakeupSource,
  /float nostrilProtect = 1\.0 - smoothstep\(FEAT_NOS_LUMA_LO, FEAT_NOS_LUMA_HI,\s*dot\(original,/,
  '콧구멍 제외는 고정 원이 아니라 실제 어두운 픽셀에만 적용해야 한다',
);
assert.match(
  faceMakeupSource,
  /max\(lipEyeFeat, noseFeat \* nostrilProtect\)/,
  '콧볼 피부는 보호 타원에서 제외하고 실제 콧구멍만 보호해야 한다',
);

console.log('AR skin and look-scope runner passed');
