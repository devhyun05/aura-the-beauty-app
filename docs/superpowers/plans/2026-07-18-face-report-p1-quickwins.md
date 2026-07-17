# 얼굴 보고서 P1 — 프론트 단독 즉시 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 백엔드 변경 없이, 이미 저장된 측정 데이터만으로 실기기 발견 중 3건(글램 카드 흐림, 조명 다이얼, 비율 숫자·평균 미표시)을 해소한다.

**Architecture:** 표시용 순수 함수(`reportFormat.ts`, RN 무의존)에 숫자 포매팅·판정 로직을 모으고 throw 기반 계약 테스트로 검증한다. 어댑터(`fromFaceAnalysisReport.ts`)는 이미 저장된 `verticalThirds`/`personalColor` 값을 DTO에 실어 나르고, S2/S4/S7 컴포넌트는 그 순수 함수를 호출해 렌더한다. RN 컴포넌트 변경은 `tsc --noEmit`와 실기기로 검증한다(레포에 RN 컴포넌트 유닛 테스트 인프라 없음).

**Tech Stack:** React Native (Expo), TypeScript, react-native-reanimated, PanResponder. 테스트는 `tsc`로 컴파일 후 `node`로 실행하는 throw 기반 `.test.ts`(레포 관행 — `scripts/mobile/run-*-contract.mjs`).

## Global Constraints

- **정직성 원칙:** 측정값은 "측정", AI 판단은 "AI" 라벨. 세로 3분할 기준은 **이상 기준 1:1:1**(측정 평균 아님), 얼굴 길이비만 **측정된 평균 밴드**(`faceLengthJudgment.band`). **모집단 백분위("상위 N%")·원측정(mm) 금지.**
- **수치 노출 범위:** 정규화된 비율과 그 평균 밴드에 한정(스펙 §3 영역1 · §7-4). `reportTypes.ts`의 "수치 비노출" 원칙을 이 범위에서만 의도적으로 완화.
- **부재=숨김:** 값이 없으면 지어내지 말고 해당 요소를 숨기거나 "판정 보류" 라벨로. 구버전 보고서 하위호환 유지.
- **순수 함수 규칙:** `reportFormat.ts`와 그 테스트는 `react-native`·`reportTokens`(RN 타입 import) 등 RN 런타임 의존을 import하지 않는다(계약 러너가 plain node로 실행하므로).
- **디자인 토큰:** 색·폰트·반경은 `reportTokens.ts`의 `color`/`font`/`radius`만 사용(리터럴 색상 신규 도입 금지).
- **검증 명령:** 순수 로직 = `cd apps/mobile && npm run test:face-report`; 타입 = `cd apps/mobile && npm run typecheck`.

---

## File Structure

- **Create** `apps/mobile/src/features/face-report/reportFormat.ts` — 표시용 순수 함수(비율/밴드/확신도 포매팅). RN 무의존.
- **Create** `apps/mobile/src/features/face-report/reportFormat.test.ts` — throw 기반 계약 테스트.
- **Create** `scripts/mobile/run-face-report-contract.mjs` — 위 테스트 컴파일·실행 러너(기존 `run-face-analysis-measurements-contract.mjs` 패턴).
- **Create** `apps/mobile/src/features/face-report/visuals/VerticalLightSlider.tsx` — 세로 조명 슬라이더(다이얼 대체).
- **Create** `apps/mobile/src/features/face-report/visuals/ConfidenceGauge.tsx` — 봄 라이트 확신도 게이지.
- **Create** `apps/mobile/src/features/face-report/visuals/ThirdsRatioReadout.tsx` — S2 비율 숫자 + 얼굴 길이비 평균 밴드.
- **Modify** `apps/mobile/src/features/face-report/reportTypes.ts` — S2Data/S4Data에 원시 수치 필드 추가, S7Data 슬라이더 전용 필드 optional화, 수치 원칙 주석 갱신.
- **Modify** `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — buildS2/buildS4가 저장된 수치를 DTO에 실어 나름.
- **Modify** `apps/mobile/src/features/face-report/sections/S2Proportion.tsx` — 비율/밴드 렌더.
- **Modify** `apps/mobile/src/features/face-report/sections/S4PersonalColor.tsx` — 게이지 추가 + 다이얼→세로 슬라이더.
- **Modify** `apps/mobile/src/features/face-report/sections/S7Styling.tsx` — 슬라이더/크로스페이드 제거, 두 룩 나란히 완전 표시.
- **Modify** `apps/mobile/package.json` — `test:face-report` 스크립트 추가.
- **Delete (사용처 제거 후)** `apps/mobile/src/features/face-report/visuals/LightingDial.tsx` — VerticalLightSlider로 대체(참조 0 확인 후 삭제).

---

## Task 1: 순수 포매터 — 세로 3분할 비율 + 얼굴 길이비 밴드

**Files:**
- Create: `apps/mobile/src/features/face-report/reportFormat.ts`
- Test: `apps/mobile/src/features/face-report/reportFormat.test.ts`
- Create: `scripts/mobile/run-face-report-contract.mjs`
- Modify: `apps/mobile/package.json`

**Interfaces:**
- Produces:
  - `formatThirdsRatio(r: { upper: number | null; middle: number; lower: number }): ThirdsRatioView` where `ThirdsRatioView = { upperLabel: string; middleLabel: string; lowerLabel: string; idealLabel: string }`
  - `resolveFaceLengthBand(input: { ratio: number | null; band: { lo: number; hi: number } | null; verdict: string | null; confidence: number | null }): FaceLengthBandView` where `FaceLengthBandView = { kind: 'withheld'; label: string } | { kind: 'band'; position: number; loFrac: number; hiFrac: number; verdictLabel: string; inBand: boolean }`

- [ ] **Step 1: 계약 러너 작성**

Create `scripts/mobile/run-face-report-contract.mjs`:

```js
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const outDir = mkdtempSync(join(tmpdir(), 'aura-face-report-'));
const tscPath = join(repoRoot, 'apps/mobile/node_modules/typescript/bin/tsc');
const featuresDir = join(repoRoot, 'apps/mobile/src/features');

// 순수(RN 무의존) 파일만 나열한다.
const entries = [
  'face-report/reportFormat.ts',
  'face-report/reportFormat.test.ts',
];

function run(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [
  tscPath,
  '--ignoreConfig',
  '--module', 'commonjs',
  '--target', 'ES2020',
  '--esModuleInterop',
  '--strict',
  '--skipLibCheck',
  '--rootDir', featuresDir,
  '--outDir', outDir,
  ...entries.map(file => join(featuresDir, file)),
]);

run(process.execPath, [join(outDir, 'face-report/reportFormat.test.js')]);
```

- [ ] **Step 2: package.json 스크립트 추가**

Modify `apps/mobile/package.json` — `scripts`에 아래 줄 추가(기존 `test:face-analysis-measurements` 아래 등 알파벳/그룹 위치):

```json
"test:face-report": "node ../../scripts/mobile/run-face-report-contract.mjs",
```

- [ ] **Step 3: 실패하는 테스트 작성**

Create `apps/mobile/src/features/face-report/reportFormat.test.ts`:

```ts
import {formatThirdsRatio, resolveFaceLengthBand} from './reportFormat';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
}

// formatThirdsRatio — 소수 둘째자리, 이상 기준 병기
{
  const v = formatThirdsRatio({upper: 1.05, middle: 1.0, lower: 0.95});
  assert(v.upperLabel === '1.05', 'upper 1.05');
  assert(v.middleLabel === '1.00', 'middle 1.00');
  assert(v.lowerLabel === '0.95', 'lower 0.95');
  assert(v.idealLabel.includes('1 : 1 : 1'), 'ideal label has 1:1:1');
}
// formatThirdsRatio — 상안부 결측(헤어라인 미확인)은 대시
{
  const v = formatThirdsRatio({upper: null, middle: 1.0, lower: 0.9});
  assert(v.upperLabel === '—', 'upper missing -> dash');
  assert(v.lowerLabel === '0.90', 'lower 0.90');
}
// resolveFaceLengthBand — 평균 범위 안
{
  const v = resolveFaceLengthBand({ratio: 1.4, band: {lo: 1.3, hi: 1.5}, verdict: 'average', confidence: 0.9});
  assert(v.kind === 'band', 'average -> band');
  if (v.kind === 'band') {
    assert(v.inBand === true, 'inBand true');
    assert(v.position > 0 && v.position < 1, 'position in (0,1)');
    assert(v.loFrac < v.hiFrac, 'loFrac < hiFrac');
    assert(v.verdictLabel === '평균 범위', 'verdict label average');
  }
}
// resolveFaceLengthBand — 세로로 긴 편(밴드 밖)
{
  const v = resolveFaceLengthBand({ratio: 1.9, band: {lo: 1.3, hi: 1.5}, verdict: 'long', confidence: 0.9});
  assert(v.kind === 'band' && v.inBand === false, 'long -> out of band');
}
// resolveFaceLengthBand — indeterminate는 보류
{
  const v = resolveFaceLengthBand({ratio: 1.4, band: null, verdict: 'indeterminate', confidence: 0.9});
  assert(v.kind === 'withheld', 'indeterminate -> withheld');
}
// resolveFaceLengthBand — 저신뢰도는 보류
{
  const v = resolveFaceLengthBand({ratio: 1.4, band: {lo: 1.3, hi: 1.5}, verdict: 'average', confidence: 0.2});
  assert(v.kind === 'withheld', 'low confidence -> withheld');
}

// eslint-disable-next-line no-console
console.log('reportFormat.test.ts (Task 1) OK');
```

- [ ] **Step 4: 실패 확인**

Run: `cd apps/mobile && npm run test:face-report`
Expected: FAIL — `tsc`가 `reportFormat.ts` 부재로 "Cannot find module './reportFormat'" 컴파일 에러로 비정상 종료.

- [ ] **Step 5: 최소 구현 작성**

Create `apps/mobile/src/features/face-report/reportFormat.ts`:

```ts
// 표시용 순수 함수 — RN·토큰 무의존(계약 러너가 plain node로 실행).
// 정직성: 세로 3분할 기준은 '이상 1:1:1'(측정 평균 아님), 길이비만 측정된 평균 밴드.

export interface ThirdsRatioView {
  upperLabel: string;
  middleLabel: string;
  lowerLabel: string;
  idealLabel: string;
}

function num2(n: number | null): string {
  return n == null || !Number.isFinite(n) ? '—' : n.toFixed(2);
}

export function formatThirdsRatio(r: {
  upper: number | null;
  middle: number;
  lower: number;
}): ThirdsRatioView {
  return {
    upperLabel: num2(r.upper),
    middleLabel: num2(r.middle),
    lowerLabel: num2(r.lower),
    idealLabel: '이상 기준 1 : 1 : 1',
  };
}

export type FaceLengthBandView =
  | {kind: 'withheld'; label: string}
  | {
      kind: 'band';
      position: number; // 내 위치 0..1
      loFrac: number;    // 밴드 시작 0..1
      hiFrac: number;    // 밴드 끝 0..1
      verdictLabel: string;
      inBand: boolean;
    };

const VERDICT_LABEL: Record<string, string> = {
  wide: '가로 폭이 있는 편',
  borderline_wide: '가로가 경계선',
  average: '평균 범위',
  borderline_long: '세로가 경계선',
  long: '세로로 긴 편',
  indeterminate: '판정 보류',
};

export function resolveFaceLengthBand(input: {
  ratio: number | null;
  band: {lo: number; hi: number} | null;
  verdict: string | null;
  confidence: number | null;
}): FaceLengthBandView {
  const {ratio, band, verdict, confidence} = input;
  const lowConfidence = confidence != null && confidence < 0.5;
  if (
    ratio == null ||
    band == null ||
    verdict == null ||
    verdict === 'indeterminate' ||
    lowConfidence
  ) {
    return {kind: 'withheld', label: VERDICT_LABEL.indeterminate};
  }
  const pad = (band.hi - band.lo) * 0.8 || 0.1;
  const min = band.lo - pad;
  const max = band.hi + pad;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return {
    kind: 'band',
    position: clamp01((ratio - min) / (max - min)),
    loFrac: clamp01((band.lo - min) / (max - min)),
    hiFrac: clamp01((band.hi - min) / (max - min)),
    verdictLabel: VERDICT_LABEL[verdict] ?? verdict,
    inBand: ratio >= band.lo && ratio <= band.hi,
  };
}
```

- [ ] **Step 6: 통과 확인**

Run: `cd apps/mobile && npm run test:face-report`
Expected: PASS — 마지막 줄 `reportFormat.test.ts (Task 1) OK`.

- [ ] **Step 7: 커밋**

```bash
git add apps/mobile/src/features/face-report/reportFormat.ts \
  apps/mobile/src/features/face-report/reportFormat.test.ts \
  scripts/mobile/run-face-report-contract.mjs \
  apps/mobile/package.json
git commit -m "feat(face-report): 비율·길이비 밴드 표시용 순수 포매터 + 계약 테스트"
```

---

## Task 2: 순수 포매터 — 퍼스널 컬러 확신도

**Files:**
- Modify: `apps/mobile/src/features/face-report/reportFormat.ts`
- Modify: `apps/mobile/src/features/face-report/reportFormat.test.ts`

**Interfaces:**
- Consumes: Task 1의 `reportFormat.ts` 모듈.
- Produces: `formatSeasonConfidence(input: { topLabel: string; secondaryLabel: string | null; typeScore: number }): SeasonConfidenceView` where `SeasonConfidenceView = { percentLabel: string; gapLabel: string | null }`

- [ ] **Step 1: 실패하는 테스트 추가**

Modify `apps/mobile/src/features/face-report/reportFormat.test.ts` — import 줄을 갱신하고 파일의 `console.log` 직전에 블록 추가:

import 줄 교체:

```ts
import {formatSeasonConfidence, formatThirdsRatio, resolveFaceLengthBand} from './reportFormat';
```

`console.log(...)` 직전에 추가:

```ts
// formatSeasonConfidence — 확신도 %, 2순위 라벨
{
  const v = formatSeasonConfidence({topLabel: '봄 라이트', secondaryLabel: '가을 뮤트', typeScore: 0.82});
  assert(v.percentLabel === '봄 라이트 82%', 'percent label 82');
  assert(v.gapLabel === '2순위 가을 뮤트', 'gap label secondary');
}
// formatSeasonConfidence — 1.0 초과 클램프, 2순위 없음
{
  const v = formatSeasonConfidence({topLabel: '봄 라이트', secondaryLabel: null, typeScore: 1.2});
  assert(v.percentLabel === '봄 라이트 100%', 'clamp to 100');
  assert(v.gapLabel === null, 'no secondary -> null gap');
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/mobile && npm run test:face-report`
Expected: FAIL — `formatSeasonConfidence` export 부재 컴파일 에러.

- [ ] **Step 3: 구현 추가**

Modify `apps/mobile/src/features/face-report/reportFormat.ts` — 파일 끝에 추가:

```ts
export interface SeasonConfidenceView {
  percentLabel: string;
  gapLabel: string | null;
}

export function formatSeasonConfidence(input: {
  topLabel: string;
  secondaryLabel: string | null;
  typeScore: number;
}): SeasonConfidenceView {
  const clamped = Math.max(0, Math.min(1, input.typeScore));
  const pct = Math.round(clamped * 100);
  return {
    percentLabel: `${input.topLabel} ${pct}%`,
    gapLabel: input.secondaryLabel ? `2순위 ${input.secondaryLabel}` : null,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/mobile && npm run test:face-report`
Expected: PASS — `reportFormat.test.ts (Task 1) OK` (동일 로그, 신규 assert 포함 통과).

- [ ] **Step 5: 커밋**

```bash
git add apps/mobile/src/features/face-report/reportFormat.ts \
  apps/mobile/src/features/face-report/reportFormat.test.ts
git commit -m "feat(face-report): 퍼스널 컬러 확신도 표시용 포매터"
```

---

## Task 3: DTO 확장 + 어댑터 배선 (buildS2/buildS4)

**Files:**
- Modify: `apps/mobile/src/features/face-report/reportTypes.ts`
- Modify: `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts:112-194` (buildS2), `:245-306` (buildS4)

**Interfaces:**
- Consumes: `verticalThirds`(`FaceVerticalThirdsResult`)의 `verticalThirds.displayRatio`·`faceLength`·`faceLengthJudgment`; `personalColor.tone`.
- Produces (DTO 필드, 컴포넌트가 소비):
  - `S2Data.ratioNumbers?: { upper: number | null; middle: number; lower: number }`
  - `S2Data.faceLength?: { ratio: number | null; band: { lo: number; hi: number } | null; verdict: string | null; confidence: number | null }`
  - `S4Data.seasonConfidence?: { topLabel: string; secondaryLabel: string | null; typeScore: number }`

- [ ] **Step 1: reportTypes.ts 필드 추가 + 원칙 주석 갱신**

Modify `apps/mobile/src/features/face-report/reportTypes.ts`:

파일 상단 주석(1-2행) 교체:

```ts
// reportTypes.ts — typed props/DTO model for the face-analysis report.
// 원칙(2026-07-18 완화): 원측정(mm)·모집단 백분위·confidence %는 계속 비노출.
// 단 세로 3분할의 정규화 비율과 얼굴 길이비의 측정된 평균 밴드는 노출을 허용한다
// (spec 2026-07-18-face-report-content-refinement-design.md §3 영역1 · §7-4).
```

`S2Data` 인터페이스 안, `paragraph: string;` 줄 바로 위에 추가:

```ts
  // 세로 3분할 정규화 비율(중안부=1.0 기준). 상안부는 헤어라인 미확인 시 null.
  ratioNumbers?: { upper: number | null; middle: number; lower: number };
  // 얼굴 세로/가로 길이비 + 측정된 정상 구간(평균 밴드) 판정 스냅샷.
  faceLength?: { ratio: number | null; band: { lo: number; hi: number } | null; verdict: string | null; confidence: number | null };
```

`S4Data` 인터페이스 안, `axes: SpectrumAxisData[];` 줄 바로 위에 추가:

```ts
  // 봄 라이트 확신도 게이지용(typeScore 0..1).
  seasonConfidence?: { topLabel: string; secondaryLabel: string | null; typeScore: number };
```

- [ ] **Step 2: buildS2 배선**

Modify `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — `buildS2`의 `return { ... }` 객체에서 `paragraph:` 줄 바로 위에 추가:

```ts
    ratioNumbers: vt.verticalThirds
      ? {
          upper: vt.verticalThirds.displayRatio.upper,
          middle: vt.verticalThirds.displayRatio.middle,
          lower: vt.verticalThirds.displayRatio.lower,
        }
      : undefined,
    faceLength: {
      ratio: vt.faceLength?.ratio ?? null,
      band: vt.faceLengthJudgment?.band ?? null,
      verdict: vt.faceLengthJudgment?.verdict ?? null,
      confidence: vt.verticalThirds?.confidence ?? null,
    },
```

- [ ] **Step 3: buildS4 배선**

Modify `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` — `buildS4`의 `return { ... }` 객체에서 `axes: axesData,` 줄 바로 위에 추가:

```ts
    seasonConfidence: {
      topLabel: TYPE_LABEL_KO[tone.top],
      secondaryLabel: tone.secondary ? TYPE_LABEL_KO[tone.secondary] : null,
      typeScore: Math.min(1, Math.max(0, tone.typeScore)),
    },
```

- [ ] **Step 4: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS — 신규 필드가 옵셔널이라 기존 fixture/호출부 파손 없음.

- [ ] **Step 5: 커밋**

```bash
git add apps/mobile/src/features/face-report/reportTypes.ts \
  apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts
git commit -m "feat(face-report): S2 비율·길이비, S4 확신도 DTO 배선(어댑터)"
```

---

## Task 4: S2 비율·평균 밴드 UI (`ThirdsRatioReadout` + S2Proportion)

**Files:**
- Create: `apps/mobile/src/features/face-report/visuals/ThirdsRatioReadout.tsx`
- Modify: `apps/mobile/src/features/face-report/sections/S2Proportion.tsx`

**Interfaces:**
- Consumes: Task 1의 `formatThirdsRatio`/`resolveFaceLengthBand`; Task 3의 `S2Data.ratioNumbers`/`S2Data.faceLength`.
- Produces: `<ThirdsRatioReadout ratio={...} faceLength={...} />` — 두 DTO 필드를 받아 비율 3열 + 밴드 게이지 렌더.

- [ ] **Step 1: ThirdsRatioReadout 작성**

Create `apps/mobile/src/features/face-report/visuals/ThirdsRatioReadout.tsx`:

```tsx
import React from 'react';
import {Text, View} from 'react-native';
import {color, font, pct, radius} from '../reportTokens';
import type {S2Data} from '../reportTypes';
import {formatThirdsRatio, resolveFaceLengthBand} from '../reportFormat';

interface Props {
  ratio: NonNullable<S2Data['ratioNumbers']> | undefined;
  faceLength: S2Data['faceLength'];
}

/** S2 비율 판독 — 세로 3분할 정규화 비율(이상 1:1:1 병기) + 얼굴 길이비 평균 밴드 게이지. */
export function ThirdsRatioReadout({ratio, faceLength}: Props) {
  const r = ratio ? formatThirdsRatio(ratio) : null;
  const band = faceLength ? resolveFaceLengthBand(faceLength) : null;

  if (!r && !band) {
    return null;
  }

  return (
    <View style={{gap: 12, marginTop: 12}}>
      {r && (
        <View style={{gap: 6}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
            {(
              [
                {k: '상안부', v: r.upperLabel},
                {k: '중안부', v: r.middleLabel},
                {k: '하안부', v: r.lowerLabel},
              ] as const
            ).map(cell => (
              <View key={cell.k} style={{alignItems: 'center', flex: 1}}>
                <Text style={[font(11, '600'), {color: color.muted}]}>{cell.k}</Text>
                <Text style={[font(17, '800'), {color: color.ink}]}>{cell.v}</Text>
              </View>
            ))}
          </View>
          <Text style={[font(11, '400'), {color: color.faint, textAlign: 'center'}]}>{r.idealLabel}</Text>
        </View>
      )}
      {band && band.kind === 'band' && (
        <View style={{gap: 6}}>
          <View
            style={{
              height: 10,
              borderRadius: radius.pill,
              backgroundColor: color.rail,
              overflow: 'hidden',
            }}>
            <View
              style={{
                position: 'absolute',
                left: pct(band.loFrac * 100),
                width: pct((band.hiFrac - band.loFrac) * 100),
                top: 0,
                bottom: 0,
                backgroundColor: color.bandActiveSoft,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: pct(band.position * 100),
                top: -2,
                width: 4,
                height: 14,
                borderRadius: 2,
                backgroundColor: color.magenta,
                marginLeft: -2,
              }}
            />
          </View>
          <Text style={[font(11.5, '700'), {color: band.inBand ? color.accentInk : color.body}]}>
            얼굴 길이비 · {band.verdictLabel}
            {band.inBand ? '' : ' (평균 범위 밖)'}
          </Text>
        </View>
      )}
      {band && band.kind === 'withheld' && (
        <Text style={[font(11.5, '600'), {color: color.muted}]}>얼굴 길이비 · {band.label}</Text>
      )}
    </View>
  );
}
```

- [ ] **Step 2: S2Proportion에 배선**

Modify `apps/mobile/src/features/face-report/sections/S2Proportion.tsx`:

import 추가(파일 상단 import 블록):

```tsx
import { ThirdsRatioReadout } from '../visuals/ThirdsRatioReadout';
```

`paragraph`를 렌더하는 `<Text ...>{data.paragraph}</Text>` 바로 위에 추가:

```tsx
      <ThirdsRatioReadout ratio={data.ratioNumbers} faceLength={data.faceLength} />
```

- [ ] **Step 3: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: 실기기/시뮬 확인**

`cd apps/mobile && npx expo run:ios`(또는 개발 클라이언트)로 보고서 S2를 연다.
Expected: 구획 사진 아래에 "상안부 1.05 / 중안부 1.00 / 하안부 0.95" 3열 + "이상 기준 1 : 1 : 1" + 얼굴 길이비 밴드 게이지(내 위치 마젠타 마커)가 보인다. 헤어라인 미확인 fixture에선 상안부가 "—". 길이비 저신뢰/indeterminate면 "판정 보류".

- [ ] **Step 5: 커밋**

```bash
git add apps/mobile/src/features/face-report/visuals/ThirdsRatioReadout.tsx \
  apps/mobile/src/features/face-report/sections/S2Proportion.tsx
git commit -m "feat(face-report): S2 비율 숫자 + 얼굴 길이비 평균 밴드 표시(1.4/1.5)"
```

---

## Task 5: 조명 다이얼 → 세로 슬라이더 (`VerticalLightSlider`)

**Files:**
- Create: `apps/mobile/src/features/face-report/visuals/VerticalLightSlider.tsx`
- Modify: `apps/mobile/src/features/face-report/sections/S4PersonalColor.tsx:76-83`
- Delete: `apps/mobile/src/features/face-report/visuals/LightingDial.tsx` (참조 0 확인 후)

**Interfaces:**
- Consumes: 기존 `light` `SharedValue<number>`(-1 웜 .. 1 쿨), `d.dial` 카피(`heading`/`warm`/`cool`/`warmCaption`/`neutralCaption`/`coolCaption`).
- Produces: `<VerticalLightSlider value={light} heading warmLabel coolLabel captions={{warm,neutral,cool}} />` — LightingDial과 동일 prop 표면, 세로 드래그.

- [ ] **Step 1: VerticalLightSlider 작성**

Create `apps/mobile/src/features/face-report/visuals/VerticalLightSlider.tsx` (LightingDial의 제스처 소유 패턴을 세로 dy로 이식):

```tsx
import React, {useMemo, useRef, useState} from 'react';
import {PanResponder, Text, View} from 'react-native';
import Animated, {SharedValue, useAnimatedStyle} from 'react-native-reanimated';
import {color, font, radius} from '../reportTokens';

interface Props {
  value: SharedValue<number>; // -1 (warm) .. 1 (cool); 0 = 기준 조명
  heading: string;
  warmLabel: string;
  coolLabel: string;
  captions: {warm: string; neutral: string; cool: string};
}

const TRACK_H = 128;

/** S4 세로 조명 슬라이더: 위로 끌면 쿨(+1), 아래로 끌면 웜(-1). 드레이프 tint를 재조정. */
export function VerticalLightSlider({value, heading, warmLabel, coolLabel, captions}: Props) {
  const [zone, setZone] = useState<-1 | 0 | 1>(0);
  const start = useRef(0);

  // ScrollView·iOS swipe-back에 제스처를 뺏기지 않도록 capture + 종료 거부(LightingDial 주석 참조).
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          start.current = value.value;
        },
        onPanResponderMove: (_e, g) => {
          // 위로(dy<0) 드래그 = 쿨(+). 트랙 절반 이동에서 풀스케일.
          const v = Math.max(-1, Math.min(1, start.current - (g.dy / (TRACK_H / 2))));
          value.value = v;
          const z = v < -0.25 ? -1 : v > 0.25 ? 1 : 0;
          setZone(prev => (prev === z ? prev : z));
        },
      }),
    [],
  );

  // 손잡이 세로 위치: value +1(쿨)=상단 0%, -1(웜)=하단 100%.
  const knobStyle = useAnimatedStyle(() => ({
    top: ((1 - value.value) / 2) * (TRACK_H - 22),
  }));

  return (
    <View
      style={{
        width: 92,
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: color.outline8,
        borderRadius: radius.lg,
        paddingVertical: 10,
        paddingHorizontal: 6,
      }}>
      <Text style={[font(10, '800', undefined, 0.8), {color: color.muted}]}>{heading}</Text>
      <Text style={[font(10, '700'), {color: color.accentDeep}]}>{coolLabel}</Text>
      <View
        {...pan.panHandlers}
        hitSlop={{top: 8, bottom: 8, left: 16, right: 16}}
        style={{width: 10, height: TRACK_H, borderRadius: radius.pill, backgroundColor: color.dial, justifyContent: 'flex-start'}}>
        <Animated.View
          style={[
            {position: 'absolute', left: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: color.magenta},
            knobStyle,
          ]}
        />
      </View>
      <Text style={[font(10, '700'), {color: color.warmLabel}]}>{warmLabel}</Text>
      <Text style={[font(9.5, '400', 1.4), {color: color.muted, textAlign: 'center'}]}>
        {zone === -1 ? captions.warm : zone === 1 ? captions.cool : captions.neutral}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: S4PersonalColor에서 교체**

Modify `apps/mobile/src/features/face-report/sections/S4PersonalColor.tsx`:

import 교체 — `import { LightingDial } from '../visuals/LightingDial';` 를:

```tsx
import { VerticalLightSlider } from '../visuals/VerticalLightSlider';
```

`<LightingDial ... />` 블록(약 :76-82)을 교체:

```tsx
            <VerticalLightSlider
              value={light}
              heading={d.dial.heading}
              warmLabel={d.dial.warm}
              coolLabel={d.dial.cool}
              captions={{ warm: d.dial.warmCaption, neutral: d.dial.neutralCaption, cool: d.dial.coolCaption }}
            />
```

- [ ] **Step 3: LightingDial 참조 0 확인 후 삭제**

Run: `cd apps/mobile && grep -rn "LightingDial" src`
Expected: 매치 0건. 매치가 있으면 남은 참조를 먼저 교체.

매치 0건이면 삭제: `git rm apps/mobile/src/features/face-report/visuals/LightingDial.tsx`

- [ ] **Step 4: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: 실기기/시뮬 확인**

보고서 S4 "직접 입혀 보세요" 카드에서 다이얼 대신 세로 슬라이더가 보이고, 위로 끌면 쿨(파랑) tint, 아래로 끌면 웜(주황) tint가 사진에 입혀지며 캡션이 바뀐다. ScrollView가 드래그를 가로채지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add apps/mobile/src/features/face-report/visuals/VerticalLightSlider.tsx \
  apps/mobile/src/features/face-report/sections/S4PersonalColor.tsx
git rm apps/mobile/src/features/face-report/visuals/LightingDial.tsx
git commit -m "feat(face-report): S4 조명 다이얼 → 세로 슬라이더 교체(2.2)"
```

---

## Task 6: 봄 라이트 확신도 게이지 (`ConfidenceGauge`)

**Files:**
- Create: `apps/mobile/src/features/face-report/visuals/ConfidenceGauge.tsx`
- Modify: `apps/mobile/src/features/face-report/sections/S4PersonalColor.tsx:36-40`

**Interfaces:**
- Consumes: Task 2의 `formatSeasonConfidence`; Task 3의 `S4Data.seasonConfidence`.
- Produces: `<ConfidenceGauge data={seasonConfidence} />`.

- [ ] **Step 1: ConfidenceGauge 작성**

Create `apps/mobile/src/features/face-report/visuals/ConfidenceGauge.tsx`:

```tsx
import React from 'react';
import {Text, View} from 'react-native';
import {color, font, pct, radius} from '../reportTokens';
import type {S4Data} from '../reportTypes';
import {formatSeasonConfidence} from '../reportFormat';

/** S4 봄 라이트 확신도 — typeScore를 % 라벨 + 채움 바로. 원측정 아님(상대 진단). */
export function ConfidenceGauge({data}: {data: NonNullable<S4Data['seasonConfidence']>}) {
  const view = formatSeasonConfidence(data);
  const fillPct = Math.round(Math.max(0, Math.min(1, data.typeScore)) * 100);
  return (
    <View style={{gap: 6}}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline'}}>
        <Text style={[font(13, '800'), {color: color.accentInk}]}>{view.percentLabel}</Text>
        {view.gapLabel ? <Text style={[font(11, '600'), {color: color.muted}]}>{view.gapLabel}</Text> : null}
      </View>
      <View style={{height: 8, borderRadius: radius.pill, backgroundColor: color.rail, overflow: 'hidden'}}>
        <View style={{width: pct(fillPct), height: '100%', backgroundColor: color.accentLight}} />
      </View>
    </View>
  );
}
```

- [ ] **Step 2: S4PersonalColor 시즌 카드에 배선**

Modify `apps/mobile/src/features/face-report/sections/S4PersonalColor.tsx`:

import 추가:

```tsx
import { ConfidenceGauge } from '../visuals/ConfidenceGauge';
```

시즌 카드의 `<BlendBar data={data.season.blend} />` 바로 위에 추가:

```tsx
            {data.seasonConfidence ? <ConfidenceGauge data={data.seasonConfidence} /> : null}
```

- [ ] **Step 3: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: 실기기/시뮬 확인**

S4 "봄 라이트 중심이에요" 카드 상단에 "봄 라이트 82% · 2순위 …" 라벨 + 채움 바가 보인다.

- [ ] **Step 5: 커밋**

```bash
git add apps/mobile/src/features/face-report/visuals/ConfidenceGauge.tsx \
  apps/mobile/src/features/face-report/sections/S4PersonalColor.tsx
git commit -m "feat(face-report): S4 봄 라이트 확신도 게이지(2.1)"
```

---

## Task 7: S7 두 룩 나란히 — 슬라이더/크로스페이드 제거 (글램 버그 해소)

**Files:**
- Modify: `apps/mobile/src/features/face-report/sections/S7Styling.tsx` (전면 단순화)
- Modify: `apps/mobile/src/features/face-report/reportTypes.ts` (S7Data 슬라이더 전용 필드 optional화)

**Interfaces:**
- Consumes: 기존 `S7Data.naturalCard`/`glamCard`/`naturalLabel`/`glamLabel`/`noteParts`; `LookCard`(파일 내 로컬 컴포넌트, 유지).
- Produces: 슬라이더·`MixFaceMap`·`mix` sharedValue 없이 두 `LookCard`를 완전 불투명으로 렌더.

- [ ] **Step 1: reportTypes.ts — S7 슬라이더 전용 필드 optional화**

Modify `apps/mobile/src/features/face-report/reportTypes.ts` — `S7Data` 인터페이스에서 아래 두 필드를 optional로:

```ts
  mixZones?: { nearNatural: string; middle: string; nearGlam: string };
  lookSummary?: { natural: { title: string; desc: string }; glam: { title: string; desc: string } };
```

(기존 필수 → optional. 어댑터는 계속 채워도 되지만 UI는 미사용. 하위호환용 잔존.)

- [ ] **Step 2: S7Styling.tsx 단순화**

Modify `apps/mobile/src/features/face-report/sections/S7Styling.tsx` — 파일 전체를 아래로 교체(`MixFaceMap`·`Slider`·`mix`·크로스페이드 제거, `LookCard` 유지·불투명 렌더):

```tsx
import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { LookCardData, S7Data } from '../reportTypes';
import { EvidenceBadge } from '../visuals/Badge';
import { Card } from '../visuals/Card';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

function LookCard({ card }: { card: LookCardData }) {
  const natural = card.variant === 'natural';
  return (
    <RiseIn>
      <Card gap={0}>
        <View style={{ gap: 5, paddingBottom: 13 }}>
          <View style={{
            alignSelf: 'flex-start', backgroundColor: natural ? color.accentTint : color.ink,
            borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12,
          }}>
            <Text style={[font(11.5, '800'), { color: natural ? color.accentInk : color.white }]}>{card.chip}</Text>
          </View>
          <Text style={[font(14, '700'), { color: color.ink, marginTop: 3 }]}>{card.title}</Text>
          <Text style={[font(12.5, '400', 1.55), { color: color.muted }]}>{card.sub}</Text>
        </View>
        {card.rows.map((r, i) => (
          <View key={r.category} style={{
            flexDirection: 'row', gap: 11, paddingTop: 12,
            paddingBottom: i === card.rows.length - 1 ? 2 : 12,
            borderTopWidth: 1, borderTopColor: color.divider,
          }}>
            <Text style={[font(12, '800'), { color: color.ink, width: 52, paddingTop: 2 }]}>{r.category}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <Text style={[font(13, '700'), { color: color.body }]}>{r.title}</Text>
                <EvidenceBadge kind={r.evidence} label={r.evidenceLabel} />
              </View>
              <Text style={[font(12, '400', 1.55), { color: color.muted }]}>{r.why}</Text>
            </View>
          </View>
        ))}
      </Card>
    </RiseIn>
  );
}

/** S7 스타일링 — 내추럴/글램 두 룩을 항상 완전 불투명으로 나란히(세로 스택) 표시. */
export function S7Styling({ data }: { data: S7Data }) {
  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} subParts={data.noteParts} />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
        <Text style={[font(12, '800'), { color: color.accentInk }]}>{data.naturalLabel}</Text>
        <Text style={[font(12, '400'), { color: color.muted }]}>·</Text>
        <Text style={[font(12, '800'), { color: color.ink }]}>{data.glamLabel}</Text>
        <Text style={[font(11.5, '400'), { color: color.muted, flex: 1, textAlign: 'right' }]}>강도만 다른 두 방향</Text>
      </View>
      <LookCard card={data.naturalCard} />
      <LookCard card={data.glamCard} />
    </RiseIn>
  );
}
```

- [ ] **Step 3: 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS — `mixZones`/`lookSummary` optional화로 어댑터가 값을 채워도 무해, UI는 미참조.

- [ ] **Step 4: 사용 안 하는 import 잔존 확인**

Run: `cd apps/mobile && grep -n "Slider\|MixFaceMap\|useSharedValue\|FACE_PATH" src/features/face-report/sections/S7Styling.tsx`
Expected: 매치 0건(전부 제거됨).

- [ ] **Step 5: 실기기/시뮬 확인**

S7 "같은 얼굴, 두 가지 방향"에서 슬라이더가 사라지고 **내추럴·글램 두 카드가 모두 선명하게(불투명) 세로로** 보인다. 글램 카드가 더 이상 흐리지 않다(발견 #5 해소).

- [ ] **Step 6: 커밋**

```bash
git add apps/mobile/src/features/face-report/sections/S7Styling.tsx \
  apps/mobile/src/features/face-report/reportTypes.ts
git commit -m "fix(face-report): S7 두 룩 나란히 표시, 크로스페이드 제거로 글램 흐림 해소(4/5)"
```

---

## Task 8: P1 통합 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 순수 계약 테스트**

Run: `cd apps/mobile && npm run test:face-report`
Expected: PASS.

- [ ] **Step 2: 전체 타입 검증**

Run: `cd apps/mobile && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: 실기기 회귀(발견 항목 확인)**

동일 셀피로 보고서를 열어 확인:
- S2: 상:중:하 비율 숫자 + 이상 1:1:1 + 얼굴 길이비 평균 밴드.
- S4: 봄 라이트 % 게이지 + 세로 조명 슬라이더(다이얼 없음).
- S7: 내추럴·글램 두 룩 모두 선명·나란히(글램 흐림 없음).

- [ ] **Step 4: (선택) 마일스톤 커밋 없음** — 각 Task가 이미 커밋됨.

---

## Self-Review (작성자 체크)

- **Spec 커버리지(P1 범위):** 2.1 확신도=Task 6 · 2.2 다이얼→슬라이더=Task 5 · 1.4 평균 밴드=Task 1/3/4 · 1.5 비율 숫자=Task 1/3/4 · 4/5 글램·두 룩=Task 7. (1.1~1.3 부위 크롭·가이드, 2.3 드레이프 재정의, 3 인상 맵, 근거·조언 = **P2~P4 별도 플랜**.)
- **Placeholder 스캔:** "TBD/적절히 처리" 없음. 각 코드 스텝에 실제 코드 포함.
- **타입 일관성:** `formatThirdsRatio`/`resolveFaceLengthBand`/`formatSeasonConfidence` 시그니처가 Task 1·2 정의와 Task 4·6 소비에서 일치. DTO 필드명(`ratioNumbers`/`faceLength`/`seasonConfidence`)이 Task 3 정의와 Task 4·6 소비에서 일치.
- **정직성:** 백분위/mm 노출 없음. 길이비만 측정 밴드, 3분할은 이상 기준 라벨.

## 후속 플랜 (별도 작성)

- **P2** — 백엔드 Bedrock `analyze_text` 출력 확장(regionNotes 구조체 `{insight,evidence,recommendation}` + impression 축) + 하위호환 정규화 + 어댑터/타입.
- **P3** — 부위 시각 배관(`regionVisualsBuilder` 순수함수 + measurements codec + 어댑터 + S3 캐러셀·크롭·실가이드·근거/조언).
- **P4** — S6 2D 인상 좌표 맵(P2 축 출력 소비).
