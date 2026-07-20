# 2D 얼굴 지표 측정 코어 (Plan 1/2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 눈꼬리 수렴각·눈썹 아치 봉우리 지표를 추가하고, roll 보정 방향을 회귀 테스트로 고정하며, 오버레이가 소비할 로컬 전용 debugAnchors를 산출한다(순수 로직, UI 없음).

**Architecture:** `faceGeometryCore`(순수 함수) + `types.ts` + `faceGeometryService.ts`만 변경. 신규 지표는 기존 `computeFaceGeometryMetrics` 파이프라인에 추가하고, 계약 러너(`npm run test:face-geometry`)로 합성 랜드마크 단위테스트. UI(오버레이)는 Plan 2.

**Tech Stack:** TypeScript, plain-script 계약 러너(tsc→node, `scripts/mobile/run-face-geometry-contract.mjs`), MediaPipe FaceMesh 478 인덱스.

## Global Constraints

- 실행 디렉토리: `apps/mobile`. 테스트 명령: `npm run test:face-geometry`.
- 지표 값 계약: `FaceGeometryMetric = {unit:'ratio'|'deg', value:number|null, warnings:string[]}`. 산출 불가는 결과 전체가 아니라 **지표 단위 null + warning**으로 격리.
- 각도 부호 규약: 양수 = 꼬리/외측이 올라감(mirror 정규화). 좌표는 **포즈 보정(roll) 후 픽셀**(x·W, y·H).
- 신규 랜드마크 인덱스는 **후보(실기기 검증 필요)** — `FACE_GEOMETRY_REQUIRED_INDICES`에 **넣지 않는다**(없으면 그 지표만 null, 전체 blocked 아님).
- `debugAnchors`는 **로컬 전용** — `buildFaceAnalysisMeasurementsPayload`(서버 wire) 출력에 절대 포함 금지.
- 각 태스크 끝에 커밋. DRY/YAGNI/TDD.

---

## File Structure

- `apps/mobile/src/features/face-geometry/services/faceGeometryCore/landmarkIndices.ts` — 신규 후보 인덱스 그룹(수렴각 접선점, 눈썹 상연 edge).
- `apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.ts` — `outerCanthalAngleDeg`, `browApexRatioMetric`, `collectFaceGeometryDebugAnchors`, `computeFaceGeometryMetrics` 확장.
- `apps/mobile/src/features/face-geometry/types.ts` — 신규 metric key 4개 + `FaceGeometryDebugAnchors` 타입 + `FaceGeometryResult.debugAnchors`.
- `apps/mobile/src/features/face-geometry/services/faceGeometryService.ts` — debugAnchors 부착 + roll 부호 주석/검증 참조.
- `apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.test.ts` — 신규 테스트 블록.
- `apps/mobile/src/features/face-analysis/services/faceAnalysisMeasurements.test.ts`(또는 계약) — debugAnchors 누출 방지 테스트(Task 5).

---

## Task 1: roll 보정 방향 회귀 고정 (correctness foundation)

**Files:**
- Test: `apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.test.ts`
- Modify: `apps/mobile/src/features/face-geometry/services/faceGeometryService.ts:124-144` (주석만)

**Interfaces:**
- Consumes: `rotatePixelLandmarkMap(map, angleDeg, center)`, `computeFaceGeometryMetrics`, `buildBaseMap()`(테스트 내부).
- Produces: 없음(회귀 가드). 회전 부호 규약을 코드로 고정.

- [ ] **Step 1: 회전 방향 pin 테스트 작성** — `faceGeometryMath.test.ts` 끝에 블록 추가:

```typescript
// ── 6. 회전 부호 규약 pin: +90°는 이미지 좌표계 시계방향(오른쪽 점→아래) ──────
{
  const center: PixelPoint = {x: 500, y: 500};
  const map: PixelLandmarkMap = new Map([[0, {x: 600, y: 500}]]); // 중심 오른쪽 100px
  const rotated = rotatePixelLandmarkMap(map, 90, center).get(0)!;
  expectClose(rotated.x, 500, 'rot+90 x'); // 오른쪽 점이
  expectClose(rotated.y, 600, 'rot+90 y'); // 아래로 (이미지 y는 아래로 증가)
}

// ── 7. roll 보정 왕복: +R 회전한 얼굴을 -R로 보정하면 원래 tilt 복원 ─────────
{
  const R = 8;
  const center: PixelPoint = {x: 500, y: 500};
  const rolled = rotatePixelLandmarkMap(buildBaseMap(), R, center);   // 카메라/머리 +R 기울임 모사
  const corrected = rotatePixelLandmarkMap(rolled, -R, center);       // service의 angleDeg=-rollDeg
  const metrics = computeFaceGeometryMetrics({map: corrected, rollCorrectionApplied: true});
  expectClose(metrics.canthalTiltLeftDeg.value, 0, 'roll round-trip L', 0.01);
  expectClose(metrics.canthalTiltRightDeg.value, 0, 'roll round-trip R', 0.01);
}
```

- [ ] **Step 2: 실패(또는 통과) 확인 실행**

Run: `cd apps/mobile && npm run test:face-geometry`
Expected: PASS (두 불변식이 현재 구현과 일치해야 함). FAIL 나면 `rotatePixelLandmarkMap` 부호가 규약과 어긋난 것 → 구현을 규약에 맞춰 수정 후 재실행.

- [ ] **Step 3: service에 부호 규약 + 실기기 검증 참조 주석 추가** — `faceGeometryService.ts`의 roll 보정 분기(현재 line 135 `const angleDeg = -rollDeg;`) 바로 위에:

```typescript
    // 부호 규약(TS pin: faceGeometryMath.test.ts §6-7): rollDeg>0 = 머리가 이미지에서
    // 시계방향으로 기운 상태여야 하며, angleDeg=-rollDeg 로 되돌린다. rollDeg의 네이티브
    // 의미(StillFaceLandmarkService.cs: roll=atan2(m.m10,m.m00))는 TS로 검증 불가이므로,
    // 실기기에서 "머리를 시계방향으로 기울여 촬영 → canthalTilt 부호가 올바른지" 1회 검증할 것.
```

- [ ] **Step 4: 테스트 재실행**

Run: `cd apps/mobile && npm run test:face-geometry`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.test.ts \
        apps/mobile/src/features/face-geometry/services/faceGeometryService.ts
git commit -m "test(face-geometry): pin roll-correction rotation sign + device-validation note"
```

---

## Task 2: 후보 랜드마크 인덱스 추가 (수렴각 접선 · 눈썹 상연 edge)

**Files:**
- Modify: `apps/mobile/src/features/face-geometry/services/faceGeometryCore/landmarkIndices.ts`
- Test: `apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.test.ts`

**Interfaces:**
- Produces: `CANTHAL_TANGENT_INDICES`, `BROW_UPPER_EDGE_RIGHT_INDICES`, `BROW_UPPER_EDGE_LEFT_INDICES`.

- [ ] **Step 1: 멤버십 sanity 테스트 작성** — `faceGeometryMath.test.ts`에 블록 추가:

```typescript
// ── 8. 신규 후보 인덱스: 눈썹 상연 edge 는 좌우 5점, 기존 brow core 부분집합 ──
{
  expectEqual(BROW_UPPER_EDGE_RIGHT_INDICES.length, 5, 'brow upper edge R len');
  expectEqual(BROW_UPPER_EDGE_LEFT_INDICES.length, 5, 'brow upper edge L len');
  for (const i of BROW_UPPER_EDGE_RIGHT_INDICES) {
    expectEqual(BROW_CORE_RIGHT_INDICES.includes(i), true, `R edge ${i} in core`);
  }
  for (const i of BROW_UPPER_EDGE_LEFT_INDICES) {
    expectEqual(BROW_CORE_LEFT_INDICES.includes(i), true, `L edge ${i} in core`);
  }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/mobile && npm run test:face-geometry`
Expected: FAIL — `BROW_UPPER_EDGE_RIGHT_INDICES is not defined` (import 미존재).

- [ ] **Step 3: 인덱스 추가** — `landmarkIndices.ts` 끝(라인 61 FOREHEAD 아래)에:

```typescript
// ⚠ 후보(실기기 검증 필요) — 외안각 수렴각용 상/하 눈꺼풀 접선 표본점.
// 외안각(33/263) 근방 상연·하연 링에서 1점씩. round/almond 구분용.
export const CANTHAL_TANGENT_INDICES = {
  upperRight: 161,
  lowerRight: 163,
  upperLeft: 388,
  lowerLeft: 390,
} as const;

// ⚠ 후보 — 눈썹 상연 edge (medial→lateral 순). apex(최고점) 탐색·호길이 비율용.
// BROW_CORE 의 상연 5점을 medial→lateral 로 재배열한 것.
export const BROW_UPPER_EDGE_RIGHT_INDICES = [107, 66, 105, 63, 70] as const;
export const BROW_UPPER_EDGE_LEFT_INDICES = [336, 296, 334, 293, 300] as const;
```

그리고 테스트 상단 import에 추가:

```typescript
import {
  BROW_CORE_LEFT_INDICES,
  BROW_CORE_RIGHT_INDICES,
  BROW_UPPER_EDGE_LEFT_INDICES,
  BROW_UPPER_EDGE_RIGHT_INDICES,
  CANTHAL_TANGENT_INDICES,
  FACE_GEOMETRY_LANDMARK_INDICES,
  FACE_GEOMETRY_REQUIRED_INDICES,
} from './landmarkIndices';
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/mobile && npm run test:face-geometry`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/mobile/src/features/face-geometry/services/faceGeometryCore/landmarkIndices.ts \
        apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.test.ts
git commit -m "feat(face-geometry): add candidate landmark indices for canthal-tangent + brow-upper-edge"
```

---

## Task 3: 눈꼬리 수렴각(outer canthal angle) 지표

**Files:**
- Modify: `apps/mobile/src/features/face-geometry/types.ts` (metric key 2개)
- Modify: `apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.ts`
- Test: `faceGeometryMath.test.ts`

**Interfaces:**
- Consumes: `CANTHAL_TANGENT_INDICES`, `IDX.eyeOuterRight/Left`.
- Produces: metric keys `outerCanthalAngleLeftDeg`, `outerCanthalAngleRightDeg`. 함수 `outerCanthalAngleDeg(outer, upper, lower): FaceGeometryMetric`. **회전 불변 → roll 게이트 무관**.

- [ ] **Step 1: metric key 추가** — `types.ts`의 `FACE_GEOMETRY_METRIC_KEYS` 배열에 (알파벳 순 유지):

```typescript
  'mouthWidthRatio',
  'outerCanthalAngleLeftDeg',
  'outerCanthalAngleRightDeg',
] as const;
```

- [ ] **Step 2: 실패 테스트 작성** — `faceGeometryMath.test.ts`에:

```typescript
// ── 9. 수렴각: 상/하 접선 사잇각. 대칭 예각/둔각 케이스 + 회전 불변 ───────────
{
  const map = buildBaseMap();
  // 외안각(우) 33=(380,400): 상접선점 161 위-안쪽, 하접선점 163 아래-안쪽 → 90° 코너
  map.set(CANTHAL_TANGENT_INDICES.upperRight, {x: 420, y: 360}); // (+40,-40)
  map.set(CANTHAL_TANGENT_INDICES.lowerRight, {x: 420, y: 440}); // (+40,+40)
  const m = computeFaceGeometryMetrics({map, rollCorrectionApplied: true});
  expectClose(m.outerCanthalAngleRightDeg.value, 90, 'convergence 90deg', 0.01);

  // 회전 불변: 전체를 33° 돌려도 같은 값
  const rotated = rotatePixelLandmarkMap(map, 33, {x: 500, y: 500});
  const m2 = computeFaceGeometryMetrics({map: rotated, rollCorrectionApplied: true});
  expectClose(m2.outerCanthalAngleRightDeg.value, 90, 'convergence rot-invariant', 0.01);

  // roll 미보정에서도 산출됨(회전 불변 → 게이트 무관)
  const m3 = computeFaceGeometryMetrics({map, rollCorrectionApplied: false});
  expectClose(m3.outerCanthalAngleRightDeg.value, 90, 'convergence without roll gate', 0.01);
}
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/mobile && npm run test:face-geometry`
Expected: FAIL — `outerCanthalAngleRightDeg` 값이 없음/undefined.

- [ ] **Step 4: 구현** — `faceGeometryMath.ts` import에 `CANTHAL_TANGENT_INDICES` 추가, `canthalTiltDeg` 아래에 함수 추가:

```typescript
// 외안각 수렴각(도): 외안각에서 상·하 눈꺼풀 접선 벡터의 사잇각. atan2(|cross|,dot)로
// [0,180]. 두 상대벡터의 각이라 전역 회전에 불변 → roll 보정과 무관하게 산출한다.
function outerCanthalAngleDeg(
  outer: PixelPoint,
  upper: PixelPoint,
  lower: PixelPoint,
): FaceGeometryMetric {
  const ux = upper.x - outer.x;
  const uy = upper.y - outer.y;
  const lx = lower.x - outer.x;
  const ly = lower.y - outer.y;
  if (!(Math.hypot(ux, uy) > GEOMETRY_EPSILON) || !(Math.hypot(lx, ly) > GEOMETRY_EPSILON)) {
    return unavailable('deg', 'canthal_tangent_degenerate');
  }
  const cross = ux * ly - uy * lx;
  const dot = ux * lx + uy * ly;
  const deg = (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI;
  return metric('deg', round(deg, 2));
}
```

`computeFaceGeometryMetrics`의 roll 게이트(`if (!rollCorrectionApplied)`) **위쪽**(회전 불변 지표 구간)에 추가 — 예: 입술 두께 계산 뒤:

```typescript
  // 눈꼬리 수렴각(회전 불변, roll 게이트 무관)
  const canthalUpperR = get(CANTHAL_TANGENT_INDICES.upperRight);
  const canthalLowerR = get(CANTHAL_TANGENT_INDICES.lowerRight);
  if (eyeOuterR && canthalUpperR && canthalLowerR) {
    metrics.outerCanthalAngleRightDeg = outerCanthalAngleDeg(eyeOuterR, canthalUpperR, canthalLowerR);
  }
  const canthalUpperL = get(CANTHAL_TANGENT_INDICES.upperLeft);
  const canthalLowerL = get(CANTHAL_TANGENT_INDICES.lowerLeft);
  if (eyeOuterL && canthalUpperL && canthalLowerL) {
    metrics.outerCanthalAngleLeftDeg = outerCanthalAngleDeg(eyeOuterL, canthalUpperL, canthalLowerL);
  }
```

- [ ] **Step 5: 통과 확인 + 커밋**

```bash
cd apps/mobile && npm run test:face-geometry   # Expected: PASS
git add apps/mobile/src/features/face-geometry/types.ts \
        apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.ts \
        apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.test.ts
git commit -m "feat(face-geometry): add rotation-invariant outer canthal (convergence) angle metric"
```

---

## Task 4: 눈썹 아치 봉우리(apex) 비율 지표

**Files:**
- Modify: `types.ts` (metric key 2개), `faceGeometryMath.ts`
- Test: `faceGeometryMath.test.ts`

**Interfaces:**
- Consumes: `BROW_UPPER_EDGE_RIGHT_INDICES`, `BROW_UPPER_EDGE_LEFT_INDICES`, `getRing`, `distance`.
- Produces: metric keys `browApexRatioLeft`, `browApexRatioRight` (unit 'ratio'). 함수 `browApexRatioMetric(edge: PixelPoint[]): FaceGeometryMetric`. **roll 민감(최고점=min y)** → 게이트 안쪽 + `ROLL_SENSITIVE_KEYS`.

- [ ] **Step 1: metric key + roll-sensitive 등록** — `types.ts` 배열 맨 앞(알파벳 순)에 `browApexRatioLeft`, `browApexRatioRight` 추가:

```typescript
export const FACE_GEOMETRY_METRIC_KEYS = [
  'browApexRatioLeft',
  'browApexRatioRight',
  'browSlopeLeftDeg',
```

`faceGeometryMath.ts`의 `ROLL_SENSITIVE_KEYS`에 추가:

```typescript
const ROLL_SENSITIVE_KEYS: readonly FaceGeometryMetricKey[] = [
  'browApexRatioLeft',
  'browApexRatioRight',
  'browSlopeLeftDeg',
  'browSlopeRightDeg',
  'canthalTiltLeftDeg',
  'canthalTiltRightDeg',
  'eyeBrowGapLeft',
  'eyeBrowGapRight',
  'mouthCornerAsymmetry',
];
```

- [ ] **Step 2: 실패 테스트 작성** — `faceGeometryMath.test.ts`에:

```typescript
// ── 10. 눈썹 봉우리 비율: 중앙(3/5 지점)이 최고점이면 호길이 비율 0.5 ───────────
{
  const map = buildBaseMap();
  // 상연 edge medial→lateral 5점을 등간격 x + 가운데가 최고(min y)로 세팅
  // 우: medial 107 x=460 → lateral 70 x=380 (medial x 큼). 가운데(105)만 y 낮게.
  const edgeR = BROW_UPPER_EDGE_RIGHT_INDICES; // [107,66,105,63,70]
  const xsR = [460, 440, 420, 400, 380];       // medial→lateral 등간격 20px
  const ysR = [360, 355, 340, 355, 360];       // 가운데 최고점
  edgeR.forEach((idx, i) => map.set(idx, {x: xsR[i], y: ysR[i]}));
  const m = computeFaceGeometryMetrics({map, rollCorrectionApplied: true});
  // 등간격이므로 가운데(index 2)의 호길이 비율 = 2/4 = 0.5 (y 편차는 x 간격 대비 작아 근사)
  expectClose(m.browApexRatioRight.value, 0.5, 'brow apex ratio center', 0.02);

  // roll 미보정이면 null
  const m2 = computeFaceGeometryMetrics({map, rollCorrectionApplied: false});
  expectEqual(m2.browApexRatioRight.value, null, 'brow apex null without roll');
}
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/mobile && npm run test:face-geometry`
Expected: FAIL — `browApexRatioRight` undefined.

- [ ] **Step 4: 구현** — `faceGeometryMath.ts` import에 `BROW_UPPER_EDGE_LEFT_INDICES, BROW_UPPER_EDGE_RIGHT_INDICES` 추가, `browSlopeDeg` 아래에 함수 추가:

```typescript
// 눈썹 상연 edge(medial→lateral)에서 최고점(y 최소)을 apex 로, 그 지점의 호길이 비율
// (0=medial, 1=lateral)을 반환. slope 한 개보다 형태(어디서 솟는가)를 보존한다.
function browApexRatioMetric(edge: PixelPoint[]): FaceGeometryMetric {
  if (edge.length < 3) {
    return unavailable('ratio', 'brow_edge_insufficient');
  }
  const cum: number[] = [0];
  for (let i = 1; i < edge.length; i++) {
    cum.push(cum[i - 1] + distance(edge[i - 1], edge[i]));
  }
  const total = cum[cum.length - 1];
  if (!(total > GEOMETRY_EPSILON)) {
    return unavailable('ratio', 'brow_length_degenerate');
  }
  let apex = 0;
  for (let i = 1; i < edge.length; i++) {
    if (edge[i].y < edge[apex].y) {
      apex = i;
    }
  }
  return metric('ratio', round(cum[apex] / total, 4));
}
```

`computeFaceGeometryMetrics`의 roll 게이트 **안쪽**(browSlope 계산 근처)에 추가:

```typescript
  const browEdgeRight = getRing(BROW_UPPER_EDGE_RIGHT_INDICES);
  if (browEdgeRight) {
    metrics.browApexRatioRight = browApexRatioMetric(browEdgeRight);
  }
  const browEdgeLeft = getRing(BROW_UPPER_EDGE_LEFT_INDICES);
  if (browEdgeLeft) {
    metrics.browApexRatioLeft = browApexRatioMetric(browEdgeLeft);
  }
```

- [ ] **Step 5: 통과 확인 + 커밋**

```bash
cd apps/mobile && npm run test:face-geometry   # Expected: PASS
git add apps/mobile/src/features/face-geometry/types.ts \
        apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.ts \
        apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.test.ts
git commit -m "feat(face-geometry): add brow arch-apex ratio metric (replaces slope-only shape signal)"
```

---

## Task 5: debugAnchors 산출 + 서버 누출 방지

**Files:**
- Modify: `types.ts` (`FaceGeometryDebugAnchors` + `FaceGeometryResult.debugAnchors`), `faceGeometryMath.ts`(수집 함수), `faceGeometryService.ts`(부착)
- Test: `faceGeometryMath.test.ts` + `faceAnalysisMeasurements` 계약(누출 방지)

**Interfaces:**
- Produces: `collectFaceGeometryDebugAnchors(map: PixelLandmarkMap, imageWidth: number, imageHeight: number): FaceGeometryDebugAnchors`. `FaceGeometryDebugAnchor = {label:string; kind:'segment'|'polyline'; points:{x:number;y:number}[]}` (정규화 0..1). `FaceGeometryResult.debugAnchors?`.

- [ ] **Step 1: 타입 추가** — `types.ts`에:

```typescript
// 오버레이 검증 전용(로컬). 측정에 실제 쓴 점을 정규화(0..1)로 담는다.
// ⚠ buildFaceAnalysisMeasurementsPayload(서버 wire)에 절대 포함하지 않는다.
export type FaceGeometryDebugAnchor = {
  label: string;
  kind: 'segment' | 'polyline';
  points: {x: number; y: number}[];
};
export type FaceGeometryDebugAnchors = FaceGeometryDebugAnchor[];
```

`FaceGeometryResult`에 필드 추가(schemaVersion 위):

```typescript
  // 로컬 전용 검증 앵커(직렬화 금지). 없을 수 있음.
  debugAnchors?: FaceGeometryDebugAnchors;
  schemaVersion: 'aura-face-geometry-v1';
```

- [ ] **Step 2: 수집 함수 실패 테스트** — `faceGeometryMath.test.ts`에:

```typescript
// ── 11. debugAnchors: tilt/수렴각 앵커가 정규화 좌표로 담긴다 ──────────────────
{
  const anchors = collectFaceGeometryDebugAnchors(buildBaseMap(), 1000, 1000);
  const tiltR = anchors.find(a => a.label === 'canthalTiltRight');
  if (!tiltR) fail('debugAnchors', 'canthalTiltRight anchor missing');
  expectEqual(tiltR.kind, 'segment', 'tilt kind');
  // 내안각(460,400)·외안각(380,400) → 정규화
  expectClose(tiltR.points[0].x, 0.38, 'tilt p0 x');
  expectClose(tiltR.points[0].y, 0.40, 'tilt p0 y');
}
```

import에 `collectFaceGeometryDebugAnchors` 추가.

- [ ] **Step 3: 실패 확인**

Run: `cd apps/mobile && npm run test:face-geometry`
Expected: FAIL — `collectFaceGeometryDebugAnchors` 미정의.

- [ ] **Step 4: 수집 함수 구현** — `faceGeometryMath.ts`에(타입 import: `FaceGeometryDebugAnchor, FaceGeometryDebugAnchors`):

```typescript
export function collectFaceGeometryDebugAnchors(
  map: PixelLandmarkMap,
  imageWidth: number,
  imageHeight: number,
): FaceGeometryDebugAnchors {
  if (!(imageWidth > 0) || !(imageHeight > 0)) {
    return [];
  }
  const anchors: FaceGeometryDebugAnchor[] = [];
  const norm = (p: PixelPoint) => ({x: p.x / imageWidth, y: p.y / imageHeight});
  const seg = (label: string, a: number, b: number): void => {
    const pa = map.get(a);
    const pb = map.get(b);
    if (pa && pb) {
      anchors.push({label, kind: 'segment', points: [norm(pa), norm(pb)]});
    }
  };
  seg('canthalTiltRight', IDX.eyeInnerRight, IDX.eyeOuterRight);
  seg('canthalTiltLeft', IDX.eyeInnerLeft, IDX.eyeOuterLeft);
  seg('eyeOpennessRight', IDX.eyeUpperLidRight, IDX.eyeLowerLidRight);
  seg('eyeOpennessLeft', IDX.eyeUpperLidLeft, IDX.eyeLowerLidLeft);
  // 수렴각: 외안각→상접선, 외안각→하접선 (2 segment)
  seg('canthalUpperRight', IDX.eyeOuterRight, CANTHAL_TANGENT_INDICES.upperRight);
  seg('canthalLowerRight', IDX.eyeOuterRight, CANTHAL_TANGENT_INDICES.lowerRight);
  seg('canthalUpperLeft', IDX.eyeOuterLeft, CANTHAL_TANGENT_INDICES.upperLeft);
  seg('canthalLowerLeft', IDX.eyeOuterLeft, CANTHAL_TANGENT_INDICES.lowerLeft);
  // 눈썹 상연 edge polyline
  const browEdge = (label: string, indices: readonly number[]): void => {
    const pts: {x: number; y: number}[] = [];
    for (const i of indices) {
      const p = map.get(i);
      if (p) pts.push(norm(p));
    }
    if (pts.length >= 2) anchors.push({label, kind: 'polyline', points: pts});
  };
  browEdge('browEdgeRight', BROW_UPPER_EDGE_RIGHT_INDICES);
  browEdge('browEdgeLeft', BROW_UPPER_EDGE_LEFT_INDICES);
  return anchors;
}
```

- [ ] **Step 5: service 부착** — `faceGeometryService.ts`의 최종 성공 return(현재 line 163-175)에서, `computeFaceGeometryMetrics` 뒤에 수집 후 결과에 부착:

```typescript
  const debugAnchors = collectFaceGeometryDebugAnchors(
    correctedMap,
    detected.imageWidth,
    detected.imageHeight,
  );
```

그리고 return 객체에 `...(debugAnchors.length ? {debugAnchors} : {}),` 추가. import: `collectFaceGeometryDebugAnchors`.

- [ ] **Step 6: 누출 방지 테스트** — `faceAnalysisMeasurements` 계약(`run-face-analysis-measurements-contract` 대상 test 파일)에 블록 추가: `buildFaceAnalysisMeasurementsPayload`에 `debugAnchors`를 실은 `faceGeometry2d`를 넣고, 반환 JSON에 `debugAnchors`가 **없음**을 단언:

```typescript
{
  const payload = buildFaceAnalysisMeasurementsPayload({
    captureId: 'c1',
    face3d: null,
    faceVerticalThirds: null,
    personalColor: null,
    faceGeometry2d: {
      // 최소 유효 결과 + debugAnchors 오염
      ...minimalGeometryResult(),
      debugAnchors: [{label: 'x', kind: 'segment', points: [{x: 0, y: 0}, {x: 1, y: 1}]}],
    } as any,
  });
  const json = JSON.stringify(payload ?? {});
  expectEqual(json.includes('debugAnchors'), false, 'debugAnchors must NOT serialize');
}
```

(`minimalGeometryResult()`는 해당 계약 파일의 기존 헬퍼 또는 `full_success` 상태의 최소 result. 없으면 기존 fixture 재사용.)

- [ ] **Step 7: 실행 + 커밋**

```bash
cd apps/mobile && npm run test:face-geometry && npm run test:face-analysis-measurements
# Expected: 둘 다 PASS (누출 방지 통과 = encode 화이트리스트가 debugAnchors 미포함)
git add apps/mobile/src/features/face-geometry/types.ts \
        apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.ts \
        apps/mobile/src/features/face-geometry/services/faceGeometryService.ts \
        apps/mobile/src/features/face-geometry/services/faceGeometryCore/faceGeometryMath.test.ts
git commit -m "feat(face-geometry): emit local-only debugAnchors for verification overlay (never serialized)"
```

> ⚠ Step 6이 FAIL(=debugAnchors가 직렬화됨)이면 `encodeFaceGeometry`가 필드를 명시적으로 제외하도록 수정(화이트리스트 유지). 이는 Task 5의 일부다.

---

## Self-Review (spec 대비)

- **G1 수렴각**: Task 3 ✓ (회전 불변, roll 무관). **G2 봉우리**: Task 4 ✓ (상연 edge, 호길이 비율). **G3 포즈 보정/roll 부호**: Task 1 ✓ (pin + 실기기 검증 참조). **G4 오버레이 데이터**: Task 5 debugAnchors ✓ (오버레이 UI 자체는 Plan 2).
- **비목표 준수**: 턱 3D·아치 높이·형태 분류·얼굴형 라벨 미포함 ✓.
- **후보 인덱스 검증 플래그**: Task 2 주석 + REQUIRED에 미포함 ✓.
- **누출 방지**: Task 5 Step 6 ✓.
- **Placeholder 스캔**: 모든 step에 실제 코드/명령 존재. `minimalGeometryResult()`만 기존 fixture 참조(계약 파일 내 존재 가정) — 구현자는 해당 파일의 기존 헬퍼를 재사용.
- **타입 일관성**: metric key(`outerCanthalAngle{Left,Right}Deg`, `browApexRatio{Left,Right}`)가 Task 3/4/자기리뷰 전반에서 동일. `collectFaceGeometryDebugAnchors` 시그니처가 Task 5 전반 일치.

## Plan 2 예고 (별도 문서)

검증 오버레이 UI: `VerticalThirdsOverlay`의 full-face `PhotoStage` 패턴 재사용, `FaceGeometryResult.debugAnchors` 소비, `__DEV__` 진입. 후보 인덱스·roll 부호를 실기기에서 눈으로 확정.
