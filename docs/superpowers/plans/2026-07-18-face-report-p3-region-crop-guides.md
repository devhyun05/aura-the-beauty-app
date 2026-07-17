# 얼굴 보고서 P3 — 부위 크롭 + 실측 가이드라인 + 캐러셀 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** S3 이목구비 카드를 (1.1) 가로 캐러셀로, (1.2) 각 부위만 **확대 크롭**해서, (1.3) 코드에 박힌 가짜 타원 대신 **실제 랜드마크로 만든 가이드라인**을 얹어 보여준다.

**Architecture:** 분석 시점(478점 메시가 손에 있는 순간) 순수 함수 `regionVisualsBuilder`가 부위별 **크롭 rect + 가이드 폴리라인**(정규화 0..1)만 산출한다. 원본 메시는 저장하지 않고 이 파생 기하만 measurements v1 **optional 키 `regionVisuals`**로 저장(스키마 버전 불변 — :1225 체크는 문자열만 봄). 보고서 열 때 복원해 `buildS3`가 부위별 크롭·실가이드를 emit하고, 없으면 기존 고정 `S3_REGION_META`로 폴백(구버전 무결). S3는 `VerticalThirdsOverlay`의 viewBox 패턴으로 크롭+SVG 가이드를 그린다.

**Tech Stack:** RN + TS. 순수 코어(regionVisualsBuilder, 코덱)는 `faceGeometryMath.ts`/`faceAnalysisMeasurements.ts`에서 throw 기반 계약 테스트로 검증. 렌더/캐러셀은 typecheck + 실기기.

## Global Constraints

- **정직성/파생 기하만 저장:** 478점 원본 미저장 — 부위별 rect + 선 몇 개만 저장(프라이버시 원칙 정합). regionVisuals는 정규화 0..1, `uri` 없음.
- **좌표 프레임(v2계획 B4):** `computeFaceGeometryMetrics`가 받는 **roll-corrected 픽셀 맵(correctedMap)** 과 동일 좌표계로 산출한다(기존 VerticalThirds 오버레이가 roll-corrected 좌표를 raw 이미지 위에 그리는 관례와 일치 — `fromFaceAnalysisReport.ts:108-111`). 출력은 imageW/imageH로 나눈 정규화값.
- **하위호환/부재=숨김:** `regionVisuals`가 없으면(구버전·저신뢰 landmark) 해당 부위는 기존 고정 `S3_REGION_META` 가이드로 폴백. 크롭·가이드를 지어내지 않음. 스키마 버전 bump 금지.
- **인덱스 검증:** 신규 랜드마크 인덱스(코 능선·외곽 립 링·하악 실루엣)는 MediaPipe topology 대조 + 실기기 육안으로 위치 확인. 각도/폭 지표처럼 roll>±5°면 landmark 신뢰 저하 가능 — builder는 필수 인덱스 부재/비-finite면 해당 부위 시각 생략(빈 결과).
- **디자인 토큰:** S3 렌더는 reportTokens color/font/radius만. 기존 컴포넌트(PhotoSlot·GuideOverlay·Card) 재사용.
- **커밋:** 서브에이전트는 코드+테스트만, git 금지. 컨트롤러가 경로 지정 커밋, **푸시 없음**.
- **검증:** 순수 = `cd apps/mobile && npm run test:face-report`(신규 테스트 러너에 추가) 또는 face-geometry 러너; 타입 = `npm run typecheck`.

---

## File Structure

- **Modify** `apps/mobile/src/features/face-geometry/services/faceGeometryCore/landmarkIndices.ts` — 코 능선·외곽 립 링·하악 실루엣 인덱스 추가.
- **Create** `apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.ts` — 순수 함수 + 타입. (RN 무의존)
- **Create** `apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.ts` — throw 기반 계약 테스트.
- **Modify** `scripts/mobile/run-face-report-contract.mjs` — 위 테스트 컴파일·실행 추가.
- **Modify** `apps/mobile/src/features/face-geometry/types.ts` — `FaceGeometryResult.regionVisuals?`.
- **Modify** `apps/mobile/src/features/face-geometry/services/faceGeometryService.ts` — builder 호출·결과 부착.
- **Modify** `apps/mobile/src/features/face-analysis/services/faceAnalysisMeasurements.ts` — envelope 타입 + encode(lift) + decode + `encode/decodeRegionVisuals`.
- **Modify** `apps/mobile/src/features/face-report/reportTypes.ts` — `FeatureGuide` polyline 변형 + `RegionCardData.cropRect`/`PhotoSlotData.cropRect`.
- **Modify** `apps/mobile/src/features/face-report/visuals/GuideOverlay.tsx` — polyline 그리기.
- **Modify** `apps/mobile/src/features/face-report/visuals/PhotoSlot.tsx` — `cropRect` 적용(퍼센트 크롭).
- **Modify** `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — `FaceReportAdapterInput.regionVisuals` + `buildS3`가 크롭·polyline emit(폴백).
- **Modify** `apps/mobile/src/features/face-report/screens/FaceAnalysisReportPreviewScreen.tsx` — `effectiveRegionVisuals` 복원·전달.
- **Modify** `apps/mobile/src/features/face-report/sections/S3Features.tsx` — 가로 캐러셀(FlatList) + 크롭 렌더.

---

## Task 1: 랜드마크 인덱스 추가 + `regionVisualsBuilder` 순수 함수 (TDD)

**Files:**
- Modify: `apps/mobile/src/features/face-geometry/services/faceGeometryCore/landmarkIndices.ts`
- Create: `apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.ts`
- Create: `apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.ts`
- Modify: `scripts/mobile/run-face-report-contract.mjs`

**Interfaces:**
- Produces:
  - `type RegionKey = 'upper' | 'mid' | 'lower' | 'jaw'`
  - `type NormPoint = { x: number; y: number }`
  - `type RegionVisual = { cropRect: { x: number; y: number; w: number; h: number }; guide: { points: NormPoint[]; label: string } }`
  - `type RegionVisuals = Partial<Record<RegionKey, RegionVisual>>`
  - `regionVisualsBuilder(map: Map<number,{x:number;y:number}>, imageW: number, imageH: number): RegionVisuals` — 입력은 픽셀 좌표 맵, 출력은 정규화 0..1. 필수 인덱스가 없거나 imageW/H≤0이면 해당 부위 생략(키 자체를 넣지 않음).

- [ ] **Step 1: 랜드마크 인덱스 추가**

Modify `apps/mobile/src/features/face-geometry/services/faceGeometryCore/landmarkIndices.ts` — 파일 끝(`FACE_GEOMETRY_REQUIRED_INDICES` 정의 앞)에 추가:

```ts
// 부위 크롭·가이드 폴리라인용 인덱스(P3). MediaPipe face_mesh topology 기준, 피사체 L/R.
// 콧대 중심선(nasion→코끝): 168·6·197·195·5·4·1.
export const NOSE_BRIDGE_MIDLINE_INDICES = [168, 6, 197, 195, 5, 4, 1] as const;
// 콧볼(alare) 좌우 — 중안부 크롭 폭.
export const NOSE_ALAE_INDICES = [98, 327] as const;
// 외곽 입술 링(윗입술 좌→우, 아랫입술 우→좌) — 입술 라인 가이드 + 하안부 크롭.
export const OUTER_LIP_RING_INDICES = [61, 40, 39, 37, 0, 267, 269, 270, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146] as const;
// 하악 실루엣(피사체 오른턱→턱끝152→왼턱) — 턱 곡선 가이드 + 외곽 크롭.
export const JAW_SILHOUETTE_INDICES = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397] as const;
```

- [ ] **Step 2: 계약 러너에 테스트 등록**

Modify `scripts/mobile/run-face-report-contract.mjs` — `entries` 배열에 추가(경로는 features 기준):

```js
  'face-geometry/services/faceGeometryCore/regionVisualsBuilder.ts',
  'face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.ts',
```

그리고 파일 하단 실행부에 추가(기존 `run(process.execPath, [join(outDir, 'face-report/reportFormat.test.js')]);` 아래):

```js
run(process.execPath, [join(outDir, 'face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.js')]);
```

- [ ] **Step 3: 실패하는 테스트 작성**

Create `apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.ts`:

```ts
import {regionVisualsBuilder} from './regionVisualsBuilder';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

// 합성 랜드마크: 필요한 인덱스에 픽셀 좌표를 심는다(1000x1000 이미지).
function synthMap(): Map<number, {x: number; y: number}> {
  const m = new Map<number, {x: number; y: number}>();
  const put = (i: number, x: number, y: number) => m.set(i, {x, y});
  // 눈/눈썹(상): outer 33/263, inner 133/362, lids 159/145/386/374
  [[33, 380, 400], [263, 620, 400], [133, 450, 400], [362, 550, 400],
   [159, 440, 380], [145, 440, 420], [386, 560, 380], [374, 560, 420]].forEach(([i,x,y]) => put(i,x,y));
  // 눈썹 코어(상) 최저 y 근사 — 몇 점만
  [[46,380,340],[300,620,340]].forEach(([i,x,y]) => put(i,x,y));
  // 코 능선(중) 168..1
  [[168,500,410],[6,500,440],[197,500,470],[195,500,500],[5,500,530],[4,500,560],[1,500,590]].forEach(([i,x,y]) => put(i,x,y));
  [[98,470,600],[327,530,600]].forEach(([i,x,y]) => put(i,x,y)); // alae
  // 얼굴 폭 234/454
  put(234, 300, 500); put(454, 700, 500);
  // 외곽 립(하) — 대표 몇 점
  [[61,430,700],[291,570,700],[0,500,670],[17,500,740]].forEach(([i,x,y]) => put(i,x,y));
  // 하악(외곽) 172/152/397 등
  [[172,340,650],[148,420,820],[152,500,870],[377,580,820],[397,660,650]].forEach(([i,x,y]) => put(i,x,y));
  return m;
}

// 정상 입력 → 4부위 모두 산출, 정규화 범위, crop가 부위 점들을 포함
{
  const rv = regionVisualsBuilder(synthMap(), 1000, 1000);
  (['upper','mid','lower','jaw'] as const).forEach(k => {
    const r = rv[k];
    assert(!!r, `${k} present`);
    if (r) {
      assert(r.cropRect.x >= 0 && r.cropRect.y >= 0, `${k} rect origin >=0`);
      assert(r.cropRect.w > 0 && r.cropRect.w <= 1, `${k} rect w in (0,1]`);
      assert(r.cropRect.h > 0 && r.cropRect.h <= 1, `${k} rect h in (0,1]`);
      assert(r.cropRect.x + r.cropRect.w <= 1.0001, `${k} rect within right edge`);
      assert(r.guide.points.length >= 2, `${k} guide has a line`);
      r.guide.points.forEach(p => assert(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${k} guide pt normalized`));
    }
  });
}
// mid 가이드는 콧대 중심선(세로) — 첫/끝 점의 x가 거의 같음
{
  const rv = regionVisualsBuilder(synthMap(), 1000, 1000);
  const mid = rv.mid!;
  const xs = mid.guide.points.map(p => p.x);
  assert(Math.max(...xs) - Math.min(...xs) < 0.05, 'mid guide is a vertical midline');
}
// 필수 인덱스 부재 → 그 부위 생략(키 없음), 다른 부위는 유지
{
  const m = synthMap(); m.delete(168); m.delete(6); m.delete(197); m.delete(195); m.delete(5); m.delete(4); m.delete(1);
  const rv = regionVisualsBuilder(m, 1000, 1000);
  assert(rv.mid === undefined, 'mid omitted when nose indices missing');
  assert(!!rv.lower, 'lower still present');
}
// 잘못된 이미지 크기 → 빈 결과
{
  assert(Object.keys(regionVisualsBuilder(synthMap(), 0, 1000)).length === 0, 'imageW<=0 -> empty');
}

// eslint-disable-next-line no-console
console.log('regionVisualsBuilder.test.ts OK');
```

- [ ] **Step 4: 실패 확인**

Run: `cd apps/mobile && npm run test:face-report`
Expected: FAIL — `regionVisualsBuilder` 모듈 부재로 tsc 컴파일 에러.

- [ ] **Step 5: 구현 작성**

Create `apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.ts`:

```ts
// 분석 시점 순수 함수 — 픽셀 랜드마크 맵에서 부위별 크롭 rect + 가이드 폴리라인을
// 정규화 0..1로 산출한다. RN·토큰 무의존(계약 러너가 plain node로 실행).
// 원본 메시는 저장하지 않고 이 파생 기하만 measurements에 얹는다.

import {
  BROW_CORE_LEFT_INDICES,
  BROW_CORE_RIGHT_INDICES,
  FACE_GEOMETRY_LANDMARK_INDICES as IDX,
  JAW_SILHOUETTE_INDICES,
  NOSE_ALAE_INDICES,
  NOSE_BRIDGE_MIDLINE_INDICES,
  OUTER_LIP_RING_INDICES,
} from './landmarkIndices';

export type RegionKey = 'upper' | 'mid' | 'lower' | 'jaw';
export type NormPoint = {x: number; y: number};
export type RegionVisual = {
  cropRect: {x: number; y: number; w: number; h: number};
  guide: {points: NormPoint[]; label: string};
};
export type RegionVisuals = Partial<Record<RegionKey, RegionVisual>>;

type PxMap = Map<number, {x: number; y: number}>;

function pts(map: PxMap, indices: readonly number[]): {x: number; y: number}[] | null {
  const out: {x: number; y: number}[] = [];
  for (const i of indices) {
    const p = map.get(i);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return null;
    }
    out.push(p);
  }
  return out;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// 픽셀 점들의 bbox를 padFrac(부위 크기 대비)만큼 키워 정규화 rect로.
function bbox(
  points: {x: number; y: number}[],
  imageW: number,
  imageH: number,
  padFracX: number,
  padFracY: number,
): {x: number; y: number; w: number; h: number} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const px = w * padFracX;
  const py = h * padFracY;
  const x0 = clamp01((minX - px) / imageW);
  const y0 = clamp01((minY - py) / imageH);
  const x1 = clamp01((maxX + px) / imageW);
  const y1 = clamp01((maxY + py) / imageH);
  return {x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0)};
}

function norm(points: {x: number; y: number}[], imageW: number, imageH: number): NormPoint[] {
  return points.map(p => ({x: clamp01(p.x / imageW), y: clamp01(p.y / imageH)}));
}

export function regionVisualsBuilder(map: PxMap, imageW: number, imageH: number): RegionVisuals {
  if (!(imageW > 0) || !(imageH > 0)) {
    return {};
  }
  const out: RegionVisuals = {};

  // 상안부: 눈썹 코어 + 눈 외/내안각 + 눈꺼풀 → 크롭. 가이드 = 눈 라인(외안각 연결).
  const brow = pts(map, [...BROW_CORE_RIGHT_INDICES, ...BROW_CORE_LEFT_INDICES]);
  const eyes = pts(map, [IDX.eyeOuterRight, IDX.eyeInnerRight, IDX.eyeInnerLeft, IDX.eyeOuterLeft, IDX.eyeUpperLidRight, IDX.eyeLowerLidRight, IDX.eyeUpperLidLeft, IDX.eyeLowerLidLeft]);
  if (brow && eyes) {
    out.upper = {
      cropRect: bbox([...brow, ...eyes], imageW, imageH, 0.25, 0.45),
      guide: {
        points: norm([map.get(IDX.eyeOuterRight)!, map.get(IDX.eyeInnerRight)!, map.get(IDX.eyeInnerLeft)!, map.get(IDX.eyeOuterLeft)!], imageW, imageH),
        label: '눈가',
      },
    };
  }

  // 중안부: 코 능선 + 콧볼 + 볼 폭 → 크롭. 가이드 = 콧대 중심선.
  const nose = pts(map, NOSE_BRIDGE_MIDLINE_INDICES);
  const alae = pts(map, NOSE_ALAE_INDICES);
  const cheeks = pts(map, [IDX.faceWidthRight, IDX.faceWidthLeft]);
  if (nose && alae && cheeks) {
    out.mid = {
      cropRect: bbox([...nose, ...alae, ...cheeks], imageW, imageH, 0.08, 0.18),
      guide: {points: norm(nose, imageW, imageH), label: '콧대 중심선'},
    };
  }

  // 하안부: 외곽 립 링 → 크롭 + 가이드(입술 라인).
  const lip = pts(map, OUTER_LIP_RING_INDICES);
  if (lip) {
    out.lower = {
      cropRect: bbox(lip, imageW, imageH, 0.4, 0.5),
      guide: {points: norm(lip, imageW, imageH), label: '입술 라인'},
    };
  }

  // 외곽: 하악 실루엣 → 크롭 + 가이드(턱 곡선).
  const jaw = pts(map, JAW_SILHOUETTE_INDICES);
  if (jaw) {
    out.jaw = {
      cropRect: bbox(jaw, imageW, imageH, 0.15, 0.15),
      guide: {points: norm(jaw, imageW, imageH), label: '턱 곡선'},
    };
  }

  return out;
}
```

- [ ] **Step 6: 통과 확인**

Run: `cd apps/mobile && npm run test:face-report`
Expected: PASS — `regionVisualsBuilder.test.ts OK` (그리고 기존 `reportFormat.test.ts (Task 1) OK`도 유지).

(커밋은 컨트롤러.)

---

## Task 2: 측정 파이프라인 배선 — FaceGeometryResult + analyzeFaceGeometry2d

**Files:**
- Modify: `apps/mobile/src/features/face-geometry/types.ts:57-68` (`FaceGeometryResult`)
- Modify: `apps/mobile/src/features/face-geometry/services/faceGeometryService.ts:145-172`

**Interfaces:**
- Consumes: Task 1 `regionVisualsBuilder`, `RegionVisuals`.
- Produces: `FaceGeometryResult.regionVisuals?: RegionVisuals` (transient carrier; 코덱이 top-level로 lift).

- [ ] **Step 1: 타입 추가**

Modify `apps/mobile/src/features/face-geometry/types.ts` — `FaceGeometryResult`에 `regionVisuals?: RegionVisuals;` 추가하고 상단에 `import type {RegionVisuals} from './services/faceGeometryCore/regionVisualsBuilder';` (import 경로가 순환이면 타입을 regionVisualsBuilder에서 re-export). 

- [ ] **Step 2: 서비스에서 산출·부착**

Modify `apps/mobile/src/features/face-geometry/services/faceGeometryService.ts` — `computeFaceGeometryMetrics({map: correctedMap, ...})`(약 :145-148) 직후에 추가:

```ts
  const regionVisuals = regionVisualsBuilder(correctedMap, detected.imageWidth, detected.imageHeight);
```
import 추가: `import {regionVisualsBuilder} from './faceGeometryCore/regionVisualsBuilder';`
그리고 `return {...}`(약 :161-172)에 `regionVisuals,` 추가(빈 객체면 그대로 저장돼도 무해하지만, `Object.keys(regionVisuals).length ? regionVisuals : undefined`로 부재 시 생략).

- [ ] **Step 3: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

---

## Task 3: measurements 코덱 — regionVisuals 저장/복원 (TDD)

**Files:**
- Modify: `apps/mobile/src/features/face-analysis/services/faceAnalysisMeasurements.ts` (envelope 타입 :63-70, encode :108-133, decode :1217-1253)
- Create/extend test: 기존 `run-face-analysis-measurements-contract.mjs` 대상 테스트 또는 신규 케이스

**Interfaces:**
- Produces: `FaceAnalysisReportMeasurements.regionVisuals?: RegionVisuals`; encode가 `faceGeometry2d.regionVisuals`를 **top-level로 lift**하고 nested에서는 제거; decode가 top-level `regionVisuals` 복원.

- [ ] **Step 1: 실패 테스트 추가**

Modify `apps/mobile/src/features/face-analysis/services/faceAnalysisMeasurements.test.ts` — round-trip 케이스 추가:

```ts
// regionVisuals round-trip (measurements v1 optional key)
{
  const rv = {upper: {cropRect: {x:0.1,y:0.2,w:0.3,h:0.2}, guide: {points: [{x:0.2,y:0.3},{x:0.5,y:0.3}], label: '눈가'}}};
  const payload = buildFaceAnalysisMeasurementsPayload({
    captureId: 'c1',
    faceGeometry2d: {...MIN_GEOMETRY_FIXTURE, regionVisuals: rv} as any,
  });
  if (!payload) throw new Error('payload undefined');
  if (!(payload as any).regionVisuals) throw new Error('regionVisuals not lifted to top-level');
  const parsed = parseFaceAnalysisMeasurements(payload, {imageUrl: undefined});
  if (!parsed?.regionVisuals?.upper) throw new Error('regionVisuals not decoded');
  if (parsed.regionVisuals.upper.guide.label !== '눈가') throw new Error('guide label lost');
  // schemaVersion 불변 확인
  if ((payload as any).schemaVersion !== 'aura-face-analysis-measurements-v1') throw new Error('schema version changed');
}
```
(`MIN_GEOMETRY_FIXTURE`는 파일에 이미 있는 최소 geometry fixture; 없으면 기존 테스트가 쓰는 fixture 명을 사용.)

- [ ] **Step 2: 실패 확인**

Run: `cd apps/mobile && npm run test:face-analysis-measurements`
Expected: FAIL — regionVisuals가 encode/decode되지 않음.

- [ ] **Step 3: 구현**

Modify `apps/mobile/src/features/face-analysis/services/faceAnalysisMeasurements.ts`:

(a) `FaceAnalysisReportMeasurements`(:63-70)에 `regionVisuals?: RegionVisuals;` 추가(+ `BuildFaceAnalysisMeasurementsInput` :97-103은 변경 불필요 — geometry에 실려 옴). `import type {RegionVisuals} from '../../face-geometry/services/faceGeometryCore/regionVisualsBuilder';`.

(b) `encodeRegionVisuals`/`decodeRegionVisuals` 헬퍼 추가(방어적 idiom — `isRecord`/`readFiniteNumber` 사용, 부재/오류 시 undefined):

```ts
function encodeRegionVisuals(rv: RegionVisuals | undefined): RegionVisuals | undefined {
  if (!rv || Object.keys(rv).length === 0) return undefined;
  return rv; // 이미 정규화·직렬화 가능한 순수 값(숫자/문자열)
}

function decodeRegionVisuals(value: unknown): RegionVisuals | undefined {
  if (!isRecord(value)) return undefined;
  const out: RegionVisuals = {};
  for (const key of ['upper', 'mid', 'lower', 'jaw'] as const) {
    const r = value[key];
    if (!isRecord(r) || !isRecord(r.cropRect) || !isRecord(r.guide)) continue;
    const cr = r.cropRect;
    const g = r.guide;
    const rawPts = Array.isArray(g.points) ? g.points : [];
    const points = rawPts
      .filter(isRecord)
      .map(p => ({x: readFiniteNumber(p.x), y: readFiniteNumber(p.y)}))
      .filter((p): p is {x: number; y: number} => p.x !== null && p.y !== null) as {x: number; y: number}[];
    if (points.length < 2) continue;
    out[key] = {
      cropRect: {
        x: readFiniteNumber(cr.x) ?? 0, y: readFiniteNumber(cr.y) ?? 0,
        w: readFiniteNumber(cr.w) ?? 0, h: readFiniteNumber(cr.h) ?? 0,
      },
      guide: {points, label: typeof g.label === 'string' ? g.label : ''},
    };
  }
  return Object.keys(out).length ? out : undefined;
}
```
(`readFiniteNumber` 반환형에 맞춰 null 처리 — 파일의 기존 시그니처 확인 후 정확히 맞춘다.)

(c) encode(:125-132)에서 geometry의 regionVisuals를 top-level로 lift, nested에서는 제거:
```ts
    ...(faceGeometry2d ? {faceGeometry2d} : {}),
    ...(input.faceGeometry2d?.regionVisuals && encodeRegionVisuals(input.faceGeometry2d.regionVisuals)
      ? {regionVisuals: encodeRegionVisuals(input.faceGeometry2d.regionVisuals)} : {}),
```
그리고 `encodeFaceGeometry`(:155-162)가 `regionVisuals`를 **포함하지 않도록**(sourceImage.uri처럼 strip) 확인/조정 — nested 중복 방지.

(d) decode(:1245-1252 return spread)에 추가:
```ts
    ...(decodeRegionVisuals(value.regionVisuals) ? {regionVisuals: decodeRegionVisuals(value.regionVisuals)} : {}),
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/mobile && npm run test:face-analysis-measurements`
Expected: PASS.

---

## Task 4: reportTypes(polyline·cropRect) + GuideOverlay(polyline) + PhotoSlot(크롭)

**Files:**
- Modify: `apps/mobile/src/features/face-report/reportTypes.ts:6, 89-92, 94-111`
- Modify: `apps/mobile/src/features/face-report/visuals/GuideOverlay.tsx`
- Modify: `apps/mobile/src/features/face-report/visuals/PhotoSlot.tsx:16-29`

**Interfaces:**
- Produces: `FeatureGuide` union에 `{kind:'polyline'; points:{x:number;y:number}[]; label?:string}`; `PhotoSlotData.cropRect?`; `RegionCardData.cropRect?`. GuideOverlay가 polyline 렌더, PhotoSlot이 cropRect 크롭.

- [ ] **Step 1: 타입 추가**

Modify `apps/mobile/src/features/face-report/reportTypes.ts`:
- `PhotoSlotData`(:6)에 `cropRect?: {x:number;y:number;w:number;h:number}` 추가.
- `FeatureGuide` union(:89-92)에 추가: `| { kind: 'polyline'; points: { x: number; y: number }[] }`.
- `RegionCardData`(:94-111)에 `cropRect?: {x:number;y:number;w:number;h:number}` 추가.

- [ ] **Step 2: GuideOverlay polyline 렌더**

Modify `apps/mobile/src/features/face-report/visuals/GuideOverlay.tsx` — SVG 내부 브랜치에 polyline 추가(기존 `size.w/size.h` 곱셈 방식):

```tsx
{guide.kind === 'polyline' && guide.points.length >= 2 && (
  <Polyline
    points={guide.points.map(p => `${p.x * size.w},${p.y * size.h}`).join(' ')}
    fill="none"
    stroke={color.lineWhiteStrong}
    strokeWidth={2}
    strokeDasharray="5 4"
  />
)}
```
import 추가: `Polyline`을 `react-native-svg`에서. (좌표는 **크롭된 뷰 기준**이 아니라 원본 정규화이므로 — Step 4에서 cropRect에 맞춘 좌표 변환을 buildS3가 수행하거나, GuideOverlay가 cropRect를 받아 viewBox로 처리. 여기서는 buildS3가 crop 기준으로 재정규화한 points를 넘긴다 — Task 5 참조.)

- [ ] **Step 3: PhotoSlot 크롭(퍼센트)**

Modify `apps/mobile/src/features/face-report/visuals/PhotoSlot.tsx` — `slot.uri` 렌더 분기에서 `slot.cropRect`가 있으면 오버플로우 숨김 컨테이너 + 확대·이동 이미지로 크롭:

```tsx
if (slot.uri) {
  const c = slot.cropRect;
  if (c && c.w > 0 && c.h > 0) {
    return (
      <View style={[style, {overflow: 'hidden'}]}>
        <Image
          source={{uri: slot.uri}}
          contentFit="cover"
          style={{
            position: 'absolute',
            width: `${100 / c.w}%`,
            height: `${100 / c.h}%`,
            left: `${(-c.x * 100) / c.w}%`,
            top: `${(-c.y * 100) / c.h}%`,
          }}
        />
      </View>
    );
  }
  // 기존 전체 렌더 경로 유지
  ...
}
```
(정확한 기존 Image props/스타일은 현재 파일에 맞춰 이식. shape="circle" 경로는 그대로.)

- [ ] **Step 4: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: 실기기 확인(크롭·polyline 시각)** — S3 카드에서 한 부위라도 크롭 + polyline이 대략 맞는 위치에 뜨는지(정밀 정렬은 Task 5 좌표 변환 후).

---

## Task 5: 어댑터 — regionVisuals 복원·전달 + buildS3 크롭/가이드(폴백)

**Files:**
- Modify: `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts:46-52, 424-458, 570-591`
- Modify: `apps/mobile/src/features/face-report/screens/FaceAnalysisReportPreviewScreen.tsx:118-143`

**Interfaces:**
- Consumes: Task 3 `measurements.regionVisuals`, Task 4 타입.
- Produces: `FaceReportAdapterInput.regionVisuals?`; buildS3 카드가 부위별 `cropRect` + `guide{kind:'polyline'}`(crop 기준 재정규화) 채움, 없으면 기존 `S3_REGION_META` 고정 가이드 폴백.

- [ ] **Step 1: 어댑터 입력 + buildS3**

Modify `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts`:
- `FaceReportAdapterInput`(:46-52)에 `regionVisuals?: RegionVisuals | null;` 추가(+ import 타입).
- `buildReportDataFromFaceAnalysisReport`(:570-591)에서 `buildS3(report.regionNotes, featurePhoto, input.regionVisuals ?? null)`로 전달.
- `buildS3(regionNotes, photo, regionVisuals)`(:424-458)에서 각 부위 카드 생성 시:
  - `const rv = regionVisuals?.[key];` (key는 'upper'|'mid'|'lower'|'jaw'; S3_REGION_META의 'jaw'와 매핑 일치)
  - `rv`가 있으면:
    - `photo: {...photo, cropRect: rv.cropRect}` (크롭 적용)
    - `cropRect: rv.cropRect`
    - `guide: {kind: 'polyline', points: rv.guide.points.map(p => ({x: (p.x - rv.cropRect.x)/rv.cropRect.w, y: (p.y - rv.cropRect.y)/rv.cropRect.h}))}` — **crop 기준 재정규화**(폴리라인을 크롭된 뷰 좌표계로).
    - `guideLabel: rv.guide.label`
  - `rv`가 없으면 기존 `meta.guide`/`meta.guideLabel`/`photo`(전체) 그대로(폴백).

- [ ] **Step 2: 화면 복원·전달**

Modify `apps/mobile/src/features/face-report/screens/FaceAnalysisReportPreviewScreen.tsx` — :127-130 근처에 추가:
```tsx
  const effectiveRegionVisuals =
    (useSessionMeasurements ? regionVisuals : null) ?? measurements?.regionVisuals ?? null;
```
(session-fresh 경로용 `regionVisuals` prop은 verticalThirds/personalColor와 동일 패턴으로 화면 prop에 추가; 세션 경로가 없으면 `measurements?.regionVisuals ?? null`만으로 충분.)
그리고 `buildReportDataFromFaceAnalysisReport({... , regionVisuals: effectiveRegionVisuals})` 전달(:136-142).

- [ ] **Step 3: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: 실기기 확인** — 실제 보고서에서 상/중/하/외곽 카드가 **각 부위로 확대**되고 **콧대 중심선·입술 라인·턱 곡선·눈가**가 실제 위치에 얹히는지(가짜 타원 사라짐). 구버전 보고서는 기존 고정 가이드로 폴백.

---

## Task 6: S3 가로 캐러셀 (1.1)

**Files:**
- Modify: `apps/mobile/src/features/face-report/sections/S3Features.tsx:44-58`

**Interfaces:**
- Consumes: 기존 `S3Data.cards`.

- [ ] **Step 1: 캐러셀로 교체**

Modify `apps/mobile/src/features/face-report/sections/S3Features.tsx` — `data.cards.map(...)` 세로 스택을 가로 `FlatList`(pagingEnabled 또는 snap)로 교체하고 페이지 인디케이터(도트) 추가. 카드 폭은 화면 폭 - 좌우 패딩. `onCardLayout`(S2→S3 스크롤 연동)은 캐러셀 인덱스 스크롤로 대체하거나 유지(스크롤 대신 `scrollToIndex`).

```tsx
import { FlatList, Dimensions } from 'react-native';
// ...
const CARD_W = Dimensions.get('window').width - 40;
// ...
<FlatList
  data={data.cards}
  keyExtractor={c => c.key}
  horizontal
  pagingEnabled
  showsHorizontalScrollIndicator={false}
  snapToInterval={CARD_W + 12}
  decelerationRate="fast"
  contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
  renderItem={({item}) => (
    <View style={{ width: CARD_W }}>
      <RiseIn><RegionCard card={item} /></RiseIn>
    </View>
  )}
/>
```
(페이지 도트: `useState` current index + `onMomentumScrollEnd`로 계산. 기존 `SectionHeader`는 유지.)

- [ ] **Step 2: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: 실기기 확인** — 부위 카드를 옆으로 넘길 수 있고, 각 카드가 크롭+실가이드로 보이는지.

---

## Task 7: P3 통합 검증

- [ ] **Step 1: 순수 계약 테스트** — `cd apps/mobile && npm run test:face-report && npm run test:face-analysis-measurements` → PASS.
- [ ] **Step 2: 타입** — `cd apps/mobile && npm run typecheck` → 0 errors.
- [ ] **Step 3: 실기기 회귀** — 새 촬영으로 보고서 생성 → S3 캐러셀·크롭·실가이드 확인 → 구버전 보고서 폴백 확인. (좌표 정렬 미세 조정은 실기기 디버깅 패스에서.)

---

## Self-Review (작성자 체크)

- **Spec 커버리지:** 1.1 캐러셀=Task 6 · 1.2 크롭=Task 4/5 · 1.3 실가이드=Task 1/4/5. regionVisuals 산출=Task 1, 저장/복원=Task 2/3, UI=Task 4/5/6.
- **Placeholder 스캔:** 각 스텝 실제 코드/명령. (코덱 헬퍼는 파일의 기존 `readFiniteNumber`/`isRecord` 시그니처에 맞춰 구현 — 구현자가 파일 확인 후 정확히 맞춘다.)
- **타입 일관성:** `RegionVisuals`/`RegionVisual`이 builder(Task1)·geometry type(Task2)·codec(Task3)·adapter(Task5)에서 일치. `FeatureGuide` polyline·cropRect가 reportTypes(Task4)·GuideOverlay(Task4)·buildS3(Task5)에서 일치.
- **하위호환:** regionVisuals 부재 시 S3_REGION_META 폴백; 스키마 버전 불변; 구 measurements decode 무결.
- **좌표계:** correctedMap 기반 산출 + crop 기준 polyline 재정규화(Task5) — 실기기 정렬 검증 필요(명시).

## 후속 (P4)
- **P4**: 인상 좌표 맵 — 백엔드 impressionNotes.axes 출력 + 타입/어댑터 + S6 2D 맵 UI(드래그). 시선 순서(gaze) 제거.
