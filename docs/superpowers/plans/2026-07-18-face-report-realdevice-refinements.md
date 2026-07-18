# Face Report 실기기 피드백 Round 2 — Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** report_RN 보고서 화면(S1–S7)의 실기기 테스트 피드백 6건을 우선순위대로 고쳐, 각 섹션의 의미·인터랙션·정직성을 실사용에 맞게 다듬는다.

**Architecture:** 전부 **프론트엔드 전용** 라운드다. 측정→Bedrock→보고서 파이프라인은 그대로 두고, 어댑터(`fromFaceAnalysisReport.ts`)·순수 로직(`reportFormat.ts`, `bodyProfile.ts`, `regionVisualsBuilder.ts`)·섹션 컴포넌트만 손댄다. 성별은 이미 리포트 화면이 로드하는 사용자 프로필(`getUserProfile()`)에서 끌어와 빌더로 배선한다(백엔드 무변경).

**Tech Stack:** Expo/React Native, react-native-reanimated(기존 패턴), react-native-svg(GuideOverlay/일러스트), 순수 로직 계약 테스트(`.test.ts` + `scripts/mobile/run-*-contract.mjs`).

## Global Constraints

- **Path A only** — V2 파이프라인 OFF 유지, 이번 라운드 백엔드/Bedrock/프롬프트/스키마(서버) 무변경. 전부 프론트.
- **정직성 원칙** — 측정값 vs AI 판단 구분 라벨 유지. 정규화 비율만 노출(백분위·mm 금지). 실루엣 일러스트·체형 문구는 "설문 기반 참고용(측정 아님)" 고지 유지.
- **성별 값** — `profile.gender`는 `'여성' | '남성' | '선택 안 함'`(+ 미설정 `''`/`undefined`). `'여성'→women`, `'남성'→men`, 그 외 전부 `neutral`.
- **regionVisuals 하위호환** — `measurements` v1의 optional 키. schemaVersion은 문자열 일치만 검사하므로 **버전 올리지 말 것**. 구버전 보고서/미측정은 항상 폴백(고정 가이드/전체 사진). 새 필드도 optional로 추가.
- **컴포넌트 재사용·디자인 통일** — 새 UI는 `reportTokens`(color/font/radius)와 기존 비주얼(Card/Pill/RiseIn/SwatchRow 등) 재사용. accent(청록)+magenta 팔레트 유지, feature-local(shared/theme 미변경).
- **커밋·푸시 규율** — 각 태스크 통과 시 컨트롤러가 path-scoped `git add`로 커밋. **사용자 명시 지시 전까지 push/pull/merge 절대 금지.**
- **테스트 관행** — 순수 로직은 throw 기반 `.test.ts` + 해당 `scripts/mobile/run-*-contract.mjs`(tsc 컴파일→node). 컴포넌트는 `npm run typecheck` + 실기기 시각 확인.

**우선순위(태스크 순서 = 실행 순서):** 빠른 정정(T1–T3) → 인터랙션(T4–T5) → 체형(T6–T7) → 최대 작업(T8).

---

### Task 1: (#5) Styling 멘트 재구성 — "강도만" 프레임 제거

**Files:**
- Modify: `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` (buildS7, :560-583 부근)
- Modify: `apps/mobile/src/features/face-report/sections/S7Styling.tsx:55`

**Interfaces:**
- Consumes: 기존 `S7Data`(title/noteParts/naturalLabel/glamLabel 등). 타입 변경 없음.
- Produces: 없음(문구만).

현재 3곳이 "강도만/두 가지 방향" 프레임: 섹션 sub(`noteParts` = "두 룩 모두 같은 분석 결과를 강도만 다르게 풀어낸 AI 제안이에요."), 우측 인라인 태그("강도만 다른 두 방향", S7Styling.tsx:55), 섹션 제목("같은 얼굴, 두 가지 방향"). 유저가 원하는 프레임: **"분석 결과를 내추럴·글램 두 스타일에 맞추어 풀어낸 AI 제안"**.

- [ ] **Step 1: buildS7의 sub 문구 교체**

`buildS7`에서 `noteParts`(SectionHeader sub로 전달되는 값)를 다음으로 교체:
```
분석 결과를 내추럴·글램 두 가지 스타일에 맞추어 풀어낸 AI 제안이에요.
```
(기존 "강도만 다르게 풀어낸" 표현 제거. noteParts가 배열/부분강조 구조라면 동일 의미로 재구성하되 "강도만" 어휘 삭제.)

- [ ] **Step 2: 인라인 태그 교체**

S7Styling.tsx:55의 `강도만 다른 두 방향` → `두 스타일 제안` (또는 우측 태그 자체를 제거). "강도만" 어휘가 화면에서 완전히 사라지게 한다.

- [ ] **Step 3: typecheck**

Run: `cd apps/mobile && npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts apps/mobile/src/features/face-report/sections/S7Styling.tsx
git commit -m "fix(report): S7 스타일링 멘트를 '강도만'→'두 스타일에 맞춰 풀어낸 AI 제안'으로"
```

**Acceptance:** 화면 어디에도 "강도만"이 없고, sub가 새 문구로 표시된다.

---

### Task 2: (#1) Proportion 길이비 게이지 범례 + "나" 표식

**Files:**
- Modify: `apps/mobile/src/features/face-report/visuals/ThirdsRatioReadout.tsx:45-85`

**Interfaces:**
- Consumes: 기존 `band`(loFrac/hiFrac/position/verdictLabel/inBand). 타입 변경 없음.
- Produces: 없음.

"빨간 선"의 정체 = 이 게이지의 magenta 세로 눈금(내 얼굴 길이비 위치). 청록 띠(평균 범위)와 눈금(내 위치)의 관계가 무설명이라 정체불명으로 읽힌다.

- [ ] **Step 1: 눈금 → 라벨 달린 핀으로**

magenta 세로 눈금(:64-75) 위/옆에 작은 "나" 라벨(Pill 또는 텍스트)을 붙여 "이게 내 위치"임을 명시. 핀은 magenta 유지(브랜드색)하되 라벨로 의미를 준다.

- [ ] **Step 2: 게이지 아래 한 줄 범례 추가**

`band.kind === 'band'` 블록 하단(verdictLabel 텍스트 근처)에 범례 한 줄 추가:
```
청록 띠 = 사람들 평균 범위 · 표식 = 내 얼굴 길이비 위치
```
`font(10.5, '400')`, `color.faint` 수준의 캡션 톤. 기존 "얼굴 길이비 · {verdictLabel}" 텍스트와 시각적으로 겹치지 않게 배치.

- [ ] **Step 3: typecheck + Commit**

Run: `cd apps/mobile && npm run typecheck` → 0 errors.
```bash
git add apps/mobile/src/features/face-report/visuals/ThirdsRatioReadout.tsx
git commit -m "fix(report): S2 길이비 게이지에 '나' 표식 라벨+범례 추가(빨간 선 의미 명확화)"
```

**Acceptance:** 게이지를 보면 magenta 표식이 "내 위치"이고 청록 띠가 "평균 범위"임을 텍스트로 알 수 있다.

---

### Task 3: (#2a) S3 캐러셀 스냅 정렬 버그 수정

**Files:**
- Modify: `apps/mobile/src/features/face-report/sections/S3Features.tsx:101-110`

**Interfaces:**
- Consumes/Produces: 없음(FlatList props만).

`pagingEnabled`(전체 화면폭 단위 스냅)와 `snapToInterval={CARD_W+GAP}`(카드폭 단위 스냅)를 **동시 사용** → iOS에서 서로 다른 기준으로 스냅해 카드가 어긋나 옆 카드가 겹쳐 보임.

- [ ] **Step 1: `pagingEnabled` 제거**

FlatList에서 `pagingEnabled` prop 삭제. `snapToInterval={CARD_W + CARD_GAP}` + `decelerationRate="fast"`만 남긴다. 필요 시 `disableIntervalMomentum`(한 번에 한 장만 넘어가게) 추가.

- [ ] **Step 2: `onMomentumScrollEnd` 인덱스 계산 정합 확인**

`Math.round(offsetX / (CARD_W + CARD_GAP))` 이 snapToInterval과 동일 기준인지 확인(현재 일치). 첫/마지막 카드가 좌우 20px 패딩 안에서 중앙 정렬되는지 확인.

- [ ] **Step 3: typecheck + Commit**

Run: `cd apps/mobile && npm run typecheck` → 0 errors.
```bash
git add apps/mobile/src/features/face-report/sections/S3Features.tsx
git commit -m "fix(report): S3 캐러셀 pagingEnabled+snapToInterval 충돌 제거(카드 겹침 수정)"
```

**Acceptance:** 실기기에서 카드를 옆으로 넘길 때 한 장씩 깔끔히 스냅되고, 인접 카드가 겹쳐 보이지 않으며, dot 인디케이터가 정확히 따라온다.

---

### Task 4: (#4) Impression 맵 — 드래그 실시간 해석 + 리셋

**Files:**
- Modify: `apps/mobile/src/features/face-report/reportFormat.ts` (순수 함수 추가)
- Modify: `apps/mobile/src/features/face-report/reportFormat.test.ts` (테스트 추가)
- Modify: `apps/mobile/src/features/face-report/visuals/ImpressionMap.tsx`

**Interfaces:**
- Produces: `describeImpressionExploration(axes, x, y): string` — 드래그 정규화 좌표(0..1)를 축 라벨로 해석한 한 줄.
- Consumes: `ImpressionAxis`(leftLabel/rightLabel/value).

드래그 점은 이동은 되나 payoff(해석)·리셋이 없어 "옮겨도 변화 없음 + 못 돌아옴". 세로축은 top=+1=rightLabel, bottom=-1=leftLabel(curY=(1-value)/2 규칙과 일치).

- [ ] **Step 1: 실패 테스트 작성**

`reportFormat.test.ts`에 추가:
```ts
import {describeImpressionExploration} from './reportFormat';

const AX = [
  {leftLabel: '내추럴', rightLabel: '세련됨', value: 0, key: 'x'},
  {leftLabel: '부드러움', rightLabel: '또렷함', value: 0, key: 'y'},
];

// 우상단(x 큰=세련됨, y 작은=또렷함)
assertEqual(
  describeImpressionExploration(AX, 0.9, 0.1),
  "이 위치라면 '세련됨 + 또렷함'에 가까운 인상",
  'upper-right quadrant',
);
// 좌하단(x 작은=내추럴, y 큰=부드러움)
assertEqual(
  describeImpressionExploration(AX, 0.1, 0.9),
  "이 위치라면 '내추럴 + 부드러움'에 가까운 인상",
  'lower-left quadrant',
);
// 중앙 근처 → 균형 문구
assertEqual(
  describeImpressionExploration(AX, 0.5, 0.5),
  '중앙 — 어느 쪽으로도 치우치지 않은 균형 인상',
  'center balanced',
);
// 축 부족 시 빈 문자열
assertEqual(describeImpressionExploration([], 0.5, 0.5), '', 'empty axes');
```
(파일의 기존 assert 헬퍼 관례를 따를 것. 없으면 throw 기반으로.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `node scripts/mobile/run-face-report-contract.mjs`
Expected: FAIL(함수 미정의).
※ 이 러너가 reportFormat.test.ts를 포함하는지 먼저 확인. 미포함이면 러너에 등록하거나 reportFormat 테스트를 포함하는 러너를 사용.

- [ ] **Step 3: 순수 함수 구현**

`reportFormat.ts`에 추가:
```ts
/** S6 인상 맵 드래그 해석 — 정규화 좌표(0..1)를 두 축 라벨로 풀어 한 줄로.
 *  세로축은 top(y=0)=rightLabel(+1), bottom(y=1)=leftLabel(-1) 규칙(curY=(1-value)/2)과 일치.
 *  중앙 근처(양축 치우침<0.15)는 균형 문구로 폴백. 축이 없으면 빈 문자열. */
export function describeImpressionExploration(
  axes: {leftLabel: string; rightLabel: string}[],
  x: number,
  y: number,
): string {
  const ax = axes[0];
  const ay = axes[1];
  if (!ax || !ay) return '';
  const hStrength = Math.abs(x - 0.5) * 2;
  const vStrength = Math.abs(y - 0.5) * 2;
  if (hStrength < 0.15 && vStrength < 0.15) {
    return '중앙 — 어느 쪽으로도 치우치지 않은 균형 인상';
  }
  const h = x < 0.5 ? ax.leftLabel : ax.rightLabel;
  const v = y < 0.5 ? ay.rightLabel : ay.leftLabel;
  return `이 위치라면 '${h} + ${v}'에 가까운 인상`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node scripts/mobile/run-face-report-contract.mjs`
Expected: PASS.

- [ ] **Step 5: ImpressionMap에 실시간 텍스트 배선**

- 드래그 위치를 React state로도 추적: `onPanResponderMove`/`Grant`에서 `setFromLocation` 계산값(0..1)을 `setDrag({x,y})`로 저장(공유값은 점 렌더용으로 유지). 과도한 리렌더 방지를 위해 값 변화가 유의미할 때만 setState 하거나 그대로 두되 컴포넌트가 가벼우므로 매 이동 setState 허용.
- 맵 아래에 해석 텍스트 표시: `describeImpressionExploration(axes, drag.x, drag.y)`. 드래그 전 초기값은 현재(AI) 위치(curX/curY)로 계산해 자연스러운 시작 문구를 보여준다.

- [ ] **Step 6: 리셋 도입**

- "기본 위치로" 작은 버튼(또는 현재 AI 점 탭) 추가 → `dragX.value=curX; dragY.value=curY`(withTiming 부드럽게) + `setDrag({x:curX,y:curY})`.
- 접근성 라벨 부여.

- [ ] **Step 7: typecheck + Commit**

Run: `cd apps/mobile && npm run typecheck` → 0 errors.
```bash
git add apps/mobile/src/features/face-report/reportFormat.ts apps/mobile/src/features/face-report/reportFormat.test.ts apps/mobile/src/features/face-report/visuals/ImpressionMap.tsx
git commit -m "feat(report): S6 인상 맵 드래그 실시간 해석 + 기본위치 리셋"
```

**Acceptance:** 점을 끌면 맵 아래 문구가 위치에 맞게 실시간으로 바뀌고, "기본 위치로"로 AI 위치에 정확히 복귀한다.

---

### Task 5: (#3) 퍼스널컬러 드레이프 — 조명 제거 + 얼굴 확대 + 색 밀착

**Files:**
- Modify: `apps/mobile/src/features/face-report/sections/S4PersonalColor.tsx`
- Modify: `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` (buildS4, :267-333)
- Modify: `apps/mobile/src/features/face-report/reportTypes.ts` (S4Data.drape에서 `dial` 관련 필드 제거)
- (조건부) Delete: `apps/mobile/src/features/face-report/visuals/VerticalLightSlider.tsx` — **다른 참조가 없을 때만.**

**Interfaces:**
- Consumes: `S4Data.drape`(photo/goodSwatches/badSwatches/goodTag/badTag/goodCaption/badCaption/…).
- Produces: `S4Data.drape`에서 `dial`(heading/warm/cool/warmCaption/coolCaption/neutralCaption) 제거.

문제: 얼굴이 74×74 원으로 작고, 색이 배경/링이라 볼에 밀착이 아니며, 조명 슬라이더 용도가 불명확.

- [ ] **Step 1: 조명 슬라이더·틴트 제거**

S4PersonalColor.tsx에서:
- `VerticalLightSlider` import·렌더(:124-132) 제거.
- `light` 공유값(:70)과 `DrapeStage`의 warm/cool 오버레이 Animated.View(:42-43), `warmStyle`/`coolStyle`(:29-30), `light` prop 제거.

- [ ] **Step 2: 얼굴 확대 + 색 밀착 레이아웃**

- `DrapeStage`의 얼굴 원 74×74 → 크게(예: 120×120). 스테이지 패딩/최대폭 재조정.
- 선택 스와치 색을 얼굴에 **밀착**시키는 방식으로: 스테이지 배경색(bestColor/worstColor) 유지하되, 얼굴 원 한쪽 가장자리에 **solid 색 띠(swatch band)**가 원에 닿게 배치(예: 원 하단에 색 블록, 또는 원 좌우 반쪽 색면). "얼굴 바로 옆에 색"이 체감되게. 두 스테이지는 픽셀 대칭 유지(대비가 핵심).

- [ ] **Step 3: buildS4 문구·타입 정리**

- `buildS4`에서 `drape.sub`의 "· 슬라이더로 조명도 바꿔 보세요" 제거 → "잘 어울리는 색과 피할 색을 얼굴 옆에 나란히 대보면 차이가 바로 보여요"로 축약.
- `drape.dial`(heading/warm/cool/warmCaption/coolCaption/neutralCaption) 생성 제거.
- `reportTypes.ts`의 `S4Data.drape`에서 `dial` 필드 타입 제거.

- [ ] **Step 4: VerticalLightSlider 참조 정리**

Run: `grep -rn "VerticalLightSlider" apps/mobile/src`
- 참조가 S4 외에 없으면 파일 삭제. 있으면(예: 다른 섹션) 파일 유지하고 S4에서만 제거.

- [ ] **Step 5: typecheck + Commit**

Run: `cd apps/mobile && npm run typecheck` → 0 errors.
```bash
git add apps/mobile/src/features/face-report/sections/S4PersonalColor.tsx apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts apps/mobile/src/features/face-report/reportTypes.ts
# (삭제 시) git add -u apps/mobile/src/features/face-report/visuals/VerticalLightSlider.tsx
git commit -m "fix(report): S4 드레이프 조명 슬라이더 제거+얼굴 확대+색 밀착"
```

**Acceptance:** 조명 슬라이더가 사라지고, 얼굴이 눈에 띄게 커졌으며, 좋은색/피할색이 얼굴에 밀착돼 대비가 즉시 체감된다. typecheck에서 `dial` 잔여 참조 없음.

---

### Task 6: (#6a) 체형 스타일링 — 성별 인지 문구(스커트 오추천 제거)

**Files:**
- Modify: `apps/mobile/src/features/ar/stencil/src/composer/bodyProfile.ts`
- Create: `apps/mobile/src/features/ar/stencil/src/composer/bodyProfile.test.ts`
- Modify: `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` (FaceReportAdapterInput, buildReport, buildS5)
- Modify: `apps/mobile/src/features/face-report/screens/FaceAnalysisReportPreviewScreen.tsx` (프로필 gender 전달)
- (러너) `scripts/mobile/run-face-report-contract.mjs` 또는 신규 러너에 bodyProfile.test.ts 등록

**Interfaces:**
- Produces: `resolveStyleGender(profileGender): StyleGender`; `analyzeBody(p, gender?: StyleGender)` — gender 선택적(기본 `'neutral'`), 기존 호출부([BodyPanel.tsx:122](apps/mobile/src/features/ar/stencil/src/components/BodyPanel.tsx#L122)) 무변경 유지.
- Consumes: `profile.gender: '여성'|'남성'|'선택 안 함'|''|undefined`.

근본 원인: 설문은 성별 미수집, 문구는 여성복 편향("랩 원피스/A라인 스커트/퍼프 소매/엠파이어 라인/리본·셔링·프릴"). 남성이 스커트를 추천받음. 성별은 이미 프로필에 있으니 배선 + 성별별 문구만 있으면 됨.

- [ ] **Step 1: 성별 매핑 + 타입**

`bodyProfile.ts`에 추가:
```ts
export type StyleGender = 'women' | 'men' | 'neutral';
export const resolveStyleGender = (g: string | null | undefined): StyleGender =>
  g === '여성' ? 'women' : g === '남성' ? 'men' : 'neutral';
```

- [ ] **Step 2: 성별별 콘텐츠 세트 구조화**

`SILHOUETTE_STYLES`/`FRAME_STYLES`를 성별별로 확장:
```ts
export const SILHOUETTE_STYLES_BY_GENDER: Record<StyleGender, Record<Silhouette, TypeStyle>> = {
  women: { /* 기존 SILHOUETTE_STYLES 그대로 */ },
  men:   { /* 아래 규칙으로 남성복 문구 신규 작성 */ },
  neutral: { /* 성별 중립(품목 언급 없이 실루엣 원리로) */ },
};
export const FRAME_STYLES_BY_GENDER: Record<StyleGender, Record<Frame, TypeStyle>> = { women, men, neutral };
```
**문구 작성 규칙(리뷰 기준):**
- 남성(men): 성별 특정 품목을 남성복으로 치환 — 스커트/원피스/퍼프소매/엠파이어 라인/리본·셔링·프릴 **금지**. 대신 재킷/셔츠/니트/팬츠/코트/레이어링/핏(오버/슬림/테일러드)·소재 표현으로. 조언의 **원리는 여성 세트와 등가**(예: pear형 = 상체 시선 유도·하체 볼륨 흘리기)를 남성복 어휘로.
- 중립(neutral): 특정 품목 대신 원리 위주("상하 대비로 리듬", "세로 라인으로 시선 분산", "허리 지점 강조" 등) — 어느 성별에도 안전.
- 각 타입 `label`/`tagline`은 공통 재사용 가능(성별 무관). `points`(3개)·`avoid`(1–2개)만 성별별.
- 기존 `SILHOUETTE_STYLES`/`FRAME_STYLES` 상수는 `...BY_GENDER.women`을 가리키는 별칭으로 유지하거나, `analyzeBody` 기본 neutral로 대체(하위 호환 확인).

- [ ] **Step 3: analyzeBody/summarizeBody 성별 인자(선택)**

```ts
export const analyzeBody = (p: BodyProfile, gender: StyleGender = 'neutral'): BodyReport => {
  const silhouette = classifySilhouette(p.frameWidth, p.waist, p.volume);
  const frame = classifyFrame(p.wrist, p.collar, p.flesh, p.balance);
  return {
    silhouette, frame,
    silhouetteStyle: SILHOUETTE_STYLES_BY_GENDER[gender][silhouette],
    frameStyle: FRAME_STYLES_BY_GENDER[gender][frame],
    caveat: CAVEAT,
  };
};
```
`summarizeBody`도 gender 선택 인자 추가(라벨은 성별 무관이라 결과 동일). **[BodyPanel.tsx:122/230](apps/mobile/src/features/ar/stencil/src/components/BodyPanel.tsx#L122) 호출은 인자 없이 그대로 동작해야 함(기본 neutral).**

- [ ] **Step 4: 실패 테스트 작성 (`bodyProfile.test.ts`)**

```ts
import {analyzeBody, resolveStyleGender, SILHOUETTE_STYLES_BY_GENDER} from './bodyProfile';

// 성별 매핑
assertEqual(resolveStyleGender('남성'), 'men', 'male maps');
assertEqual(resolveStyleGender('여성'), 'women', 'female maps');
assertEqual(resolveStyleGender('선택 안 함'), 'neutral', 'optout neutral');
assertEqual(resolveStyleGender(undefined), 'neutral', 'undefined neutral');

// 남성 세트에 여성복 품목이 없어야 한다(스커트 오추천 방지)
const banned = ['스커트', '원피스', '퍼프', '엠파이어', '리본', '셔링', '프릴'];
for (const sil of Object.keys(SILHOUETTE_STYLES_BY_GENDER.men)) {
  const text = [
    ...SILHOUETTE_STYLES_BY_GENDER.men[sil].points,
    ...SILHOUETTE_STYLES_BY_GENDER.men[sil].avoid,
  ].join(' ');
  for (const w of banned) {
    assert(!text.includes(w), `men/${sil} must not contain '${w}'`);
  }
}

// 남성 프로필 → 남성 문구
const maleProfile = {frameWidth:'hip',waist:'straight',volume:'lower',wrist:'bony',collar:'sharp',flesh:'sinewy',balance:'frame',createdAt:0} as const;
const men = analyzeBody(maleProfile, 'men');
assert(!men.silhouetteStyle.points.join(' ').includes('스커트'), 'pear male no skirt');
```

- [ ] **Step 5: 테스트 러너 등록 + 실패 확인**

`bodyProfile.test.ts`를 실행할 러너 확인/등록(`run-face-report-contract.mjs`에 추가하거나 신규 `run-body-profile-contract.mjs` 생성 — 기존 러너 패턴 복제).
Run: 해당 러너 → FAIL(구조 미완성).

- [ ] **Step 6: 남성/중립 문구 작성 → 테스트 통과**

Step 2 규칙대로 men/neutral 콘텐츠 완성. Run: 러너 → PASS.

- [ ] **Step 7: 어댑터·화면 배선**

- `fromFaceAnalysisReport.ts`: `FaceReportAdapterInput`에 `gender?: string | null` 추가. `buildReportDataFromFaceAnalysisReport`에서 `resolveStyleGender(input.gender)` 계산 → `buildS5(bodyProfile, styleGender)`. `buildS5`가 `analyzeBody(bodyProfile, styleGender)` 호출.
- `FaceAnalysisReportPreviewScreen.tsx`: `buildReportDataFromFaceAnalysisReport({...})` 호출(:142)에 `gender: loadState.status === 'success' ? loadState.profile?.gender : undefined` 추가. `useMemo` deps에 gender 소스 추가.

- [ ] **Step 8: typecheck + 러너 + Commit**

Run: `cd apps/mobile && npm run typecheck` → 0 errors. 러너 PASS.
```bash
git add apps/mobile/src/features/ar/stencil/src/composer/bodyProfile.ts apps/mobile/src/features/ar/stencil/src/composer/bodyProfile.test.ts apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts apps/mobile/src/features/face-report/screens/FaceAnalysisReportPreviewScreen.tsx scripts/mobile/run-*-contract.mjs
git commit -m "feat(report): S5 체형 스타일링 성별 인지(남성 스커트 오추천 제거)"
```

**Acceptance:** 남성 프로필로 보면 스커트/원피스 등 여성복 추천이 사라지고 남성복 문구가 나온다. BodyPanel 등 기존 호출부 무회귀(typecheck green).

---

### Task 7: (#6b) 체형 실루엣 일러스트 (플레이스홀더 대체)

**Files:**
- Create: `apps/mobile/src/features/face-report/visuals/BodySilhouette.tsx`
- Modify: `apps/mobile/src/features/face-report/sections/S5Body.tsx:31-37`
- Modify: `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` (buildS5 → 실루엣 key/gender 전달)
- Modify: `apps/mobile/src/features/face-report/reportTypes.ts` (S5Data에 `silhouetteKind`/`styleGender` 추가)

**Interfaces:**
- Consumes: `Silhouette`('hourglass'|'inverted'|'pear'|'apple'|'rect'), `StyleGender`.
- Produces: `<BodySilhouette kind={Silhouette} gender={StyleGender} />` — react-native-svg 라인아트.

현재 실루엣 칸은 빗금 박스 + "실루엣 일러스트" 텍스트(가짜). 타입 다이어그램(유저별 아님)이라 정직성 OK.

- [ ] **Step 1: BodySilhouette 컴포넌트 작성**

`react-native-svg`로 5개 실루엣 타입의 단순 라인아트(어깨-허리-골반 비율을 타입별로 다르게). 성별별로 실루엣 외형(예: 남성 어깨 넓은 프레임 vs 여성 곡선)을 다르게 하되, 최소한 **성별 무관 중립 실루엣**은 반드시 제공(neutral fallback). 토큰 색(`color.outline8`/`color.accent`) 사용, 96×128 프레임에 맞춤.

- [ ] **Step 2: S5Data에 타입 전달**

`reportTypes.ts` `S5Data`에 `silhouetteKind?: Silhouette` + `styleGender?: StyleGender` 추가(optional — 미답변/구버전 폴백). `buildS5`에서 `analyzed.silhouette`와 styleGender를 채운다(미답변 상태면 미설정→컴포넌트가 중립/빈 상태 처리).

- [ ] **Step 3: S5Body에서 플레이스홀더 교체**

S5Body.tsx:31-37의 Hatch+텍스트 박스를 `data.silhouetteKind ? <BodySilhouette kind gender/> : <기존 빗금 플레이스홀더>`로. 미답변 시 기존 "설문에 답하면…" 안내 유지.

- [ ] **Step 4: typecheck + Commit**

Run: `cd apps/mobile && npm run typecheck` → 0 errors.
```bash
git add apps/mobile/src/features/face-report/visuals/BodySilhouette.tsx apps/mobile/src/features/face-report/sections/S5Body.tsx apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts apps/mobile/src/features/face-report/reportTypes.ts
git commit -m "feat(report): S5 실루엣 일러스트(타입별 SVG) — 플레이스홀더 대체"
```

**Acceptance:** 설문 완료 시 실루엣 칸에 타입에 맞는 실제 일러스트가 뜨고(성별 반영), 미답변 시 기존 안내가 유지된다.

---

### Task 8: (#2b) S3 부위 카드 세부가이드 — 상안부에 이마·눈썹·눈 표시

**Files:**
- Modify: `apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.ts`
- Modify: `apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.ts`
- Modify: `apps/mobile/src/features/face-analysis/services/faceAnalysisMeasurements.ts` (encode/decode 하위호환)
- Modify: `apps/mobile/src/features/face-report/visuals/GuideOverlay.tsx` (다중 가이드 렌더)
- Modify: `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` (buildS3 다중 가이드 매핑)
- Modify: `apps/mobile/src/features/face-report/reportTypes.ts` (다중 가이드 타입)

**Interfaces:**
- Produces: `RegionVisual.guides: {points: NormPoint[]; label: string}[]`(복수) — 기존 단수 `guide`를 배열로 확장(하위호환 유지).
- Consumes(빌더): landmark 인덱스(BROW/EYE, 기존 상수).

유저 불만: 상안부 카드 제목은 "이마·눈썹·눈"인데 실제론 눈("눈가") 선 하나만 보임. 그룹 카드를 **채워서** 눈썹·눈(가능하면 이마) 가이드를 다 보여준다. 세부 스와이프는 없음(그룹 카드 유지).

- [ ] **Step 1: 빌더 다중 가이드 — 실패 테스트 갱신**

`regionVisualsBuilder.test.ts`에 upper 리전이 **여러 라벨 가이드**(최소 눈썹+눈)를 내는 케이스 추가. 각 가이드가 crop 프레임 재정규화 전 원본 정규화 좌표인지, 퇴화(빈 points) 필터되는지 검증. 기존 단수 가이드 소비 케이스도 하위호환(배열 length≥1) 확인.

- [ ] **Step 2: 실패 확인**

Run: `node scripts/mobile/run-face-geometry-contract.mjs`
Expected: FAIL.

- [ ] **Step 3: 빌더에 다중 가이드 구현**

`RegionVisual`을 `{cropRect, guides: {points,label}[]}`로 확장(단수 `guide` 유지가 필요하면 `guides[0]` 별칭). upper: 눈 라인("눈매") + 눈썹 라인("눈썹", `availablePts(BROW_CORE_*)` ≥2점일 때) + (이마 점 가용 시 "이마" 마커). mid/lower/jaw는 기존 단일 가이드를 `guides:[...]` 배열로 감싸 유지. 퇴화 가이드(2점 미만) 제외.

- [ ] **Step 4: 테스트 통과**

Run: `node scripts/mobile/run-face-geometry-contract.mjs` → PASS.

- [ ] **Step 5: 코덱 하위호환 (measurements v1)**

`faceAnalysisMeasurements.ts`의 regionVisuals encode/decode를 `guides[]` 형태로 확장. **버전 미변경**(문자열 일치). 구버전 payload(단수 `guide`)를 decode 시 `guides:[guide]`로 흡수, 신규 `guides` 없으면 폴백. `run-face-analysis-measurements-contract.mjs`에 라운드트립 케이스 추가.
Run: `node scripts/mobile/run-face-analysis-measurements-contract.mjs` → PASS.

- [ ] **Step 6: GuideOverlay 다중 렌더**

`FeatureGuide`(polyline)와 별개로, buildS3가 내려주는 **가이드 배열**을 각각 라벨과 함께 렌더하도록 GuideOverlay 확장(또는 카드가 가이드 배열을 map해 GuideOverlay N개). 각 폴리라인 옆 작은 라벨(눈썹/눈매/이마). 라벨 겹침 방지 위치 규칙.

- [ ] **Step 7: buildS3 다중 가이드 매핑**

`buildS3`에서 `rv.guides` 각각을 crop 프레임으로 재정규화(`(p - cropRect.x)/cropRect.w`)해 카드에 배열로 전달. `reportTypes.ts` `RegionCardData`에 다중 가이드 타입 반영. 폴백(regionVisuals 없음)은 기존 고정 단일 가이드 유지.

- [ ] **Step 8: typecheck + 전체 관련 러너 + Commit**

Run: `cd apps/mobile && npm run typecheck` → 0 errors. 관련 러너 3종 PASS.
```bash
git add apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.ts apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.test.ts apps/mobile/src/features/face-analysis/services/faceAnalysisMeasurements.ts apps/mobile/src/features/face-report/visuals/GuideOverlay.tsx apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts apps/mobile/src/features/face-report/reportTypes.ts scripts/mobile/run-*-contract.mjs
git commit -m "feat(report): S3 상안부 카드에 눈썹·눈(·이마) 다중 세부가이드 표시"
```

**Acceptance:** (재촬영으로 새 regionVisuals 생성 시) 상안부 카드에 눈썹·눈 가이드가 라벨과 함께 나타나 제목 "이마·눈썹·눈"과 내용이 일치한다. 구버전 보고서는 폴백으로 무회귀.

---

## Self-Review (작성자 체크)

- **Spec coverage:** 6개 피드백 전부 매핑 — #1(T2) #2a(T3) #2b(T8) #3(T5) #4(T4) #5(T1) #6a(T6) #6b(T7). ✅
- **Placeholder scan:** 순수 함수(T4 describeImpressionExploration, T6 resolveStyleGender/analyzeBody)는 완전 코드 제공. UI/콘텐츠 태스크는 변경 위치·규칙·수용기준 명시(콘텐츠 문구는 규칙+예시로 구현자 작성 — 리뷰가 금칙어로 검증). 
- **Type consistency:** `analyzeBody(p, gender?)` 선택 인자 → BodyPanel 기존 호출 무변경. `RegionVisual.guides[]` 확장은 코덱 하위호환으로 구버전 흡수. `S4Data.drape.dial` 제거는 buildS4·컴포넌트·타입 3곳 동시.
- **미해결 확인거리(실행 중 처리):** ① reportFormat.test.ts / bodyProfile.test.ts가 어느 러너에 물리는지(T4 Step2, T6 Step5) — 실행 시 러너 등록 확인. ② VerticalLightSlider 타 참조(T5 Step4 grep). ③ T8 코덱 라운드트립 케이스 위치.

## Execution Handoff

이 플랜은 **subagent-driven-development**로 태스크별 실행 예정(순수 로직=계약 테스트, 컴포넌트=typecheck+실기기). 각 태스크 커밋 후 사용자가 실기기로 확인 → 다음 태스크. **push는 사용자 지시 전까지 금지.**
