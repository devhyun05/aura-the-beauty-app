// 아래 존 마스크 라우팅 계약(하부 베이크드 개편 2026-07-24).
// ① 마스크 우선: eyeshadowLowerMaskImported>0인 하부 잎은 모양 칩(shape) 명시와
//    무관하게 profile 6(마스크 모드)으로 나간다 — 구판의 "명시 shape 존중" 게이트는
//    카탈로그 마스크 탭이 아무 효과 없는 죽은 선택을 만들었다. 역방향(칩 탭 →
//    마스크 해제)은 ComposerSheet 칩 onPress가 마커를 0으로 내려 성립한다.
// ② 캡 마커 보존: region-global 마스크 마커는 8밴드 캡으로 잘린 잎이 들고 있어도
//    compiled.params에 남는다(조용한 마스크 clear 함정 방지).
import {compileLayers, MAX_EYESHADOW_LAYERS_V2, seedLayers} from './model';
import type {ComposerLayer} from './model';
import type {FilterParams} from '../bridge/types';

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

let seq = 0;
function eyeLeaf(params: Partial<FilterParams>, role?: string): ComposerLayer {
  return {id: `t${++seq}`, region: 'eyeshadow', visible: true, params, role};
}

// ① 마스크 우선 — 모양 칩이 명시돼 있어도 마스크가 실루엣 정본.
{
  const compiled = compileLayers([
    eyeLeaf({
      eyeshadowSurface: 1,
      eyeshadowShape: 10, // 와이드 칩 명시
      eyeshadowIntensity: 0.4,
      eyeshadowLowerMaskImported: 1,
    }),
  ]);
  expectEqual(compiled.eyeshadowLayers?.length, 1, '하부 잎 1장 = 밴드 1장');
  expectEqual(compiled.eyeshadowLayers?.[0]?.profile, 6,
    '마스크 임포트 잎은 shape 명시와 무관하게 profile 6(마스크 모드)');
  expectEqual(compiled.eyeshadowLayers?.[0]?.shape, 6, 'shape alias는 profile을 미러');
  expectEqual(compiled.params.eyeshadowLowerMaskImported, 1,
    'region-global 마커가 compiled.params에 남는다');
}

// ① 역방향 — 마커 0이면 칩 실루엣(아틀라스 타일)이 그대로 나간다.
{
  const compiled = compileLayers([
    eyeLeaf({
      eyeshadowSurface: 1,
      eyeshadowShape: 10,
      eyeshadowIntensity: 0.4,
      eyeshadowLowerMaskImported: 0,
    }),
  ]);
  expectEqual(compiled.eyeshadowLayers?.[0]?.profile, 10,
    '마커 해제 시 칩 profile(아틀라스 타일)이 정본');
}

// ① 상부 전용 잎(surface 0)은 하부 마스크 라우팅의 대상이 아니다.
{
  const compiled = compileLayers([
    eyeLeaf({
      eyeshadowSurface: 0,
      eyeshadowShape: 2,
      eyeshadowIntensity: 0.4,
      eyeshadowLowerMaskImported: 1,
    }),
  ]);
  expectEqual(compiled.eyeshadowLayers?.[0]?.profile, 2,
    '상부 전용 잎은 하부 마스크로 재라우팅되지 않는다');
}

// ① 위+아래(surface 2) 잎 + 마스크 → 상/하 두 밴드로 분리(상부 실루엣 보존).
{
  const compiled = compileLayers([
    eyeLeaf({
      eyeshadowSurface: 2,
      eyeshadowShape: 10,
      eyeshadowIntensity: 0.4,
      eyeshadowLowerMaskImported: 1,
    }),
  ]);
  expectEqual(compiled.eyeshadowLayers?.length, 2,
    'surface both + 마스크 = 상/하 두 밴드로 분리');
  expectEqual(compiled.eyeshadowLayers?.[0]?.surface, 0, '첫 밴드 = 상부');
  expectEqual(compiled.eyeshadowLayers?.[0]?.profile, 10,
    '상부 밴드는 칩 모양(와이드)을 유지 — 마스크가 상부 실루엣을 삼키지 않는다');
  expectEqual(compiled.eyeshadowLayers?.[1]?.surface, 1, '둘째 밴드 = 하부');
  expectEqual(compiled.eyeshadowLayers?.[1]?.profile, 6, '하부 밴드 = 마스크 모드');
}

// ② 캡 너머 잎의 마커 보존 — 9번째 잎만 마스크를 들어도 마커는 살아남는다.
{
  const leaves: ComposerLayer[] = [];
  for (let i = 0; i < MAX_EYESHADOW_LAYERS_V2; i++) {
    leaves.push(eyeLeaf({eyeshadowSurface: 0, eyeshadowIntensity: 0.3}));
  }
  leaves.push(eyeLeaf({
    eyeshadowSurface: 1,
    eyeshadowIntensity: 0.3,
    eyeshadowLowerMaskImported: 1,
  }));
  const compiled = compileLayers(leaves);
  expectEqual(compiled.eyeshadowLayers?.length, MAX_EYESHADOW_LAYERS_V2,
    '밴드 배열은 캡(8)까지 유지');
  expectEqual(compiled.params.eyeshadowLowerMaskImported, 1,
    '캡으로 잘린 잎의 region-global 마스크 마커도 보존(조용한 clear 방지)');
}

// ③ 저장→재편집 왕복 안정성 — seedLayers는 하부 마스크 마커를 "마스크 밴드"에
//    붙인다. 밴드 0(칩 밴드)에 고정하면 마스크-우선 라우팅이 재컴파일에서 칩
//    실루엣을 profile 6으로 하이재킹한다(리뷰 확정 회귀).
{
  const first = compileLayers([
    eyeLeaf({eyeshadowSurface: 1, eyeshadowShape: 10, eyeshadowIntensity: 0.4}),
    eyeLeaf({
      eyeshadowSurface: 1,
      eyeshadowIntensity: 0.3,
      eyeshadowLowerMaskImported: 1,
    }),
  ]);
  expectEqual(first.eyeshadowLayers?.map(b => b.profile).join(','), '10,6',
    '1차 컴파일: 칩 밴드 10 + 마스크 밴드 6');
  const reseeded = seedLayers(first.params, [], [], first.eyeshadowLayers ?? []);
  const second = compileLayers(reseeded);
  expectEqual(second.eyeshadowLayers?.map(b => b.profile).join(','), '10,6',
    '재시드 후에도 칩 밴드는 10을 유지(마커가 마스크 밴드에 재부착)');
  expectEqual(second.params.eyeshadowLowerMaskImported, 1,
    '왕복 후에도 region-global 마커 보존');
}

expect(true, 'unreachable');
console.log('eyeshadowLowerMask.test.ts passed');
