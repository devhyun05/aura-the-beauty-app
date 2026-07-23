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

// ── 피부 룩 개편(0724) — 윤광 존 곱 + 코렉터 3슬롯 엔진 계약 ──
const stencilTypesSource = readFileSync(
  join(repoRoot, 'apps/mobile/src/features/ar/stencil/src/bridge/types.ts'),
  'utf8',
);
const bridgeMessagesSource = readFileSync(
  join(
    repoRoot,
    'apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Bridge/BridgeMessages.cs',
  ),
  'utf8',
);

assert.match(
  faceMakeupSource,
  /float _GlowShape;/,
  '윤광 존 uniform(_GlowShape)이 선언되어야 한다',
);
assert.match(
  faceMakeupSource,
  /float glowLuma = dot\(original, fixed3\(0\.299, 0\.587, 0\.114\)\);/,
  '윤광 판정은 보정 후가 아니라 원본 피드 루마 기준이어야 한다(발광 피드백 차단)',
);
assert.match(
  faceMakeupSource,
  /float glowAmt = _SkinGlow \* glowZone;/,
  '윤광은 존 곱 게이트를 거쳐야 한다(T존 매트+볼 윤광 성립)',
);
assert.match(
  faceMakeupSource,
  /\* glowAmt \* \(1\.0 - col\)\);/,
  '윤광은 가산이 아니라 스크린 혼합(1-col 스케일)이어야 한다(화이트 블로우아웃 방지)',
);
assert.match(
  faceMakeupSource,
  /if \(_GlowShape > 2\.5\)\s+glowZone = smoothstep\(PWD_CHEEK_LO, PWD_CHEEK_HI, faceDx\);/,
  '윤광 존 3=볼만은 볼 제외 마스크의 반전이어야 한다',
);
assert.match(
  faceMakeupSource,
  /fixed3 ApplyCorrectorSlot\(fixed3 col, fixed3 original, fixed3 neighborhood,/,
  '코렉터는 슬롯 함수로 분리되어 다중 적용 가능해야 한다',
);
assert.match(
  faceMakeupSource,
  /_Corrector2Color, _Corrector2Intensity\);[\s\S]*_Corrector3Color, _Corrector3Intensity\);/,
  '코렉터 슬롯 2·3이 순차 적용되어야 한다(색별 강도 중첩)',
);
assert.match(
  makeupControllerSource,
  /mat\.SetFloat\(GlowShapeId, p\.glowShape\);/,
  '브리지 glowShape가 셰이더 윤광 존으로 배선되어야 한다',
);
assert.match(
  makeupControllerSource,
  /mat\.SetFloat\(Corrector2IntensityId, Mathf\.Clamp01\(p\.corrector2Intensity\)\);/,
  '코렉터 슬롯 2 강도가 배선되어야 한다',
);
assert.match(
  makeupControllerSource,
  /mat\.SetFloat\(Corrector3IntensityId, Mathf\.Clamp01\(p\.corrector3Intensity\)\);/,
  '코렉터 슬롯 3 강도가 배선되어야 한다',
);
// wire 키 이름은 RN(types.ts)과 C#(BridgeMessages.cs)이 JsonUtility로 일치해야 한다.
for (const key of ['glowShape', 'corrector2Color', 'corrector2Intensity', 'corrector3Color', 'corrector3Intensity']) {
  assert.ok(
    stencilTypesSource.includes(`${key}?:`),
    `RN FilterParams에 ${key} 키가 있어야 한다`,
  );
  assert.ok(
    new RegExp(`public (float|int|string) ${key}`).test(bridgeMessagesSource),
    `Unity FilterParams에 ${key} 필드가 있어야 한다`,
  );
}
assert.match(
  bridgeMessagesSource,
  /corrector2Intensity = 0f,[\s\S]*corrector3Intensity = 0f,/,
  '코렉터 슬롯 강도는 wire 기본값 중화 목록에 있어야 한다(스테일 유출 방지)',
);

// ── 헤어라인 안정화(0724) — 세그 마스크 EMA + 페더 밴드 완화 ──
const segmentationSource = readFileSync(
  join(
    repoRoot,
    'apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/SegmentationSource.cs',
  ),
  'utf8',
);
assert.match(
  segmentationSource,
  /SegMaskEmaNewWeight/,
  '세그 마스크는 EMA 시간 안정화를 거쳐 업로드되어야 한다(헤어라인 울렁임 방지)',
);
assert.match(
  segmentationSource,
  /_maskTexture\.LoadRawTextureData\(_emaRgba\);/,
  '업로드는 원시 프레임이 아니라 EMA 버퍼여야 한다',
);
assert.match(
  segmentationSource,
  /_emaRgba = null; \/\/ 카메라 전환/,
  '카메라 전환 시 EMA 이력을 리셋해야 한다(이전 카메라 마스크 혼입 방지)',
);
assert.match(
  cameraFeedSource,
  /#define SEG_SMOOTH_SKIN_HI 0\.55\b/,
  '확장 스무딩 페더 밴드는 지터 민감도를 낮춘 0.10~0.55여야 한다',
);

console.log('AR skin and look-scope runner passed');
