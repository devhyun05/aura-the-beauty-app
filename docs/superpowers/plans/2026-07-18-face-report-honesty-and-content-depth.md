# Face Report 정직화 + 콘텐츠 깊이 복원 Implementation Plan (Round 2 개정판)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
> **이 플랜은 `2026-07-18-face-report-realdevice-refinements.md`(라운드2)를 대체한다.** 라운드2에서 완료된 T1·T2·T3는 아래에 승계/재작업 표기. 미완 T4·T5·T6·T7은 그 플랜의 태스크 본문을 그대로 사용(여기서 참조).

**Goal:** 보고서 S2의 거짓 프레임("평균/이상 1:1:1")을 정직한 서술로 바꾸고, 이식 중 잘려나간 리치 콘텐츠(부위별 측정 스펙트럼 축+내러티브, 스타일링 근거 태그)를 Bedrock 출력에서 복원한다.

**Architecture:** 세 워크스트림.
- **A. S2 정직 재설계** — 프론트 전용. 3분할=자기 내부 서술+1:1:1 교육 맥락, 길이비=카테고리 뱃지+자기 비주얼+방향 라벨, 두 지표 분리.
- **B. 콘텐츠 깊이 복원** — 백엔드(Bedrock 프롬프트+스키마) + 어댑터 매핑. 프론트 렌더러(`SpectrumRail`/`WhatIfRail`/`BlendBar`/`EvidenceBadge`)는 이미 존재하므로 신규 렌더는 최소.
- **C. 잔여 프론트** — T4 인상맵·T5 드레이프·T6 체형 성별문구·T7 실루엣(라운드2 본문 사용).

**Tech Stack:** Expo/RN, react-native-svg, react-native-reanimated; Python FastAPI + Bedrock Claude(`openai_analysis.py`); 순수 로직 계약 테스트 + backend pytest.

## Global Constraints

- **정직성(최우선)** — 측정값과 AI 판단을 구분 라벨. 없는 통계("평균")·외부 이상치("이상 1:1:1")를 사실처럼 제시 금지. 스펙트럼 축 위치는 **AI가 실측 메타데이터를 해석해 배치한 인상**임을 명시(measured 근거 태그는 실제 측정에서 파생될 때만). 측정 불가 축은 `withheld`+사유+다시찍기.
- **숫자 노출 규칙 유지** — mm·백분위·confidence% 비노출. 정규화 비율·자기 내부 비율(%)만.
- **하위호환** — 구버전 보고서(리치 필드 없음)는 기존 폴백. 백엔드 normalizer는 신규 필드 없으면 빈/기본으로 강제(조용한 생성 금지).
- **Bedrock 라이브 스모크** — 백엔드 프롬프트/스키마 변경은 실제 Bedrock 호출로 1회 이상 검증(APAC inference profile). ValidationException·빈 필드 확인.
- **커밋·푸시 규율** — 컨트롤러가 path-scoped 커밋, subagent는 코드만. **push 금지.**
- **테스트** — 순수 로직 `.test.ts`+`scripts/mobile/run-*-contract.mjs`; 백엔드 pytest; 컴포넌트 typecheck+실기기.
- **gazeOrder 복원 금지** — 옛 리치 모델의 시선순서는 사용자가 명시 거부(인상맵으로 대체). 되살리지 않는다.

---

## 승계 상태 (라운드2)

- ✅ **T1** (#5 스타일링 멘트) — 0c314c14. **단, "강도만" 프레임은 백엔드 프롬프트에도 있음([openai_analysis.py:1378]) → 워크스트림 B에서 뿌리 수정.**
- ⚠️ **T2** (#1 길이비 게이지 '나' 표식+범례) — 8bc4cb08. **거짓 "평균" 라벨을 강화한 셈 → 워크스트림 A에서 되물러 재작업.**
- ✅ **T3** (#2a 캐러셀 스냅) — 1e88e9f8. 유지.

---

## 워크스트림 A — S2 정직 재설계 (프론트)

**Files (공통):**
- `apps/mobile/src/features/face-report/reportFormat.ts` (+ `.test.ts`)
- `apps/mobile/src/features/face-report/visuals/ThirdsRatioReadout.tsx`
- `apps/mobile/src/features/face-report/sections/S2Proportion.tsx`
- `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` (buildS2)
- `apps/mobile/src/features/face-report/reportTypes.ts` (S2Data)

### Task A1: 3분할 — "이상 1:1:1" 제거, 자기 내부 서술 + 교육 맥락

**Interfaces:** `formatThirdsRatio` 반환에서 `idealLabel`을 제거하거나 의미 전환. 신규 순수함수 `describeThirdsInternally(ratio): string`.

- [ ] **Step 1: 실패 테스트** — `reportFormat.test.ts`에 `describeThirdsInternally({upper:0.75,middle:1,lower:0.98})` → `'상안부가 중안부보다 25% 짧아, 이마~눈 구간이 상대적으로 짧아요'`(가장 큰 편차 부위를 자기 내부 비교로 서술). 균형(모두 ±8% 이내)이면 `'세 구획이 고르게 나뉘어 있어요'`. null upper 처리.
- [ ] **Step 2: 실패 확인** — `node scripts/mobile/run-face-report-contract.mjs`
- [ ] **Step 3: 구현** — `describeThirdsInternally` 순수함수(중안부=1.0 기준, |편차|>0.08만 유의, 코드 `faceVerticalThirdsMath`의 self-comparison 철학과 정합). `formatThirdsRatio`의 `idealLabel`을 `'균등 1:1:1은 고전 미학 기준일 뿐, 실제 얼굴 대부분이 벗어나요 — 개성이에요'` 톤의 **교육 캡션**으로 교체(또는 별도 필드).
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: ThirdsRatioReadout 반영** — 상단 3숫자 유지, 그 아래 `describeThirdsInternally` 문장 + 교육 맥락 한 줄. "이상 기준" 문구 삭제.
- [ ] **Step 6: typecheck + Commit** — `fix(report): S2 3분할 '이상 1:1:1' 제거→자기 내부 서술+교육 맥락`

### Task A2: 길이비 — 게이지 폐기, 카테고리 뱃지 + 자기 비주얼 + 방향 라벨 (T2 재작업)

**Interfaces:** `resolveFaceLengthBand`를 카테고리 중심으로 재구성 또는 신규 `describeFaceLength(input): {categoryLabel, sentence, caution}`.

- [ ] **Step 1: 실패 테스트** — verdict별 카테고리 문장 매핑: `wide`→"가로형에 가까운 얼굴", `long`→"세로로 긴 얼굴", `average`→"세로·가로가 균형", 경계 2종, `indeterminate`→보류. "평균" 단어 미포함 검증.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** — 게이지(막대+마젠타 눈금+"평균 범위") 로직 제거. 대신 **카테고리 뱃지**(가로형/균형/세로형) + **방향 스케일 라벨**("가로형 ←→ 세로형") + 한 문장. **참고선 = 성별 문헌값(남 ≈1.35 / 여 ≈1.31, 프로필 성별 사용)**, "성형외과 문헌 참고선 · 절대 기준 아님" 표기. 황금비 1.6은 "흔히 인용되나 실제 얼굴 대부분이 못 미침" 교육 각주. `FACE_LENGTH_REFERENCE`를 성별별로(face-ratio/constants.ts). **"평균" 어휘 전면 삭제.**
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 자기 비주얼(선택적, 데이터 있으면)** — S2 사진과 **분리된** 작은 얼굴 도식에 세로 길이선+가로 폭선(이 비율이 뭘 재는지). 랜드마크 없으면 도식만/생략. `S2Data`에 필요한 필드 추가.
- [ ] **Step 6: 8bc4cb08의 '나' 표식/범례 제거** — 거짓 평균 전제이므로 되돌린다.
- [ ] **Step 7: typecheck + Commit** — `fix(report): S2 길이비 게이지→카테고리 뱃지+방향라벨('평균' 거짓 프레임 제거)`

### Task A3: 3분할 · 길이비 블록 분리 + 문단 정리

- [ ] **Step 1:** S2Proportion에서 `paragraph`(현재 3분할 해석)가 길이비 밑에 섞이는 배치 수정 — 3분할 블록 / 길이비 블록을 각자 설명과 함께 시각적으로 분리.
- [ ] **Step 2:** typecheck + Commit — `fix(report): S2 3분할·길이비 블록 분리로 혼동 제거`

**Acceptance(A):** 화면에 "평균"·"이상 기준 1:1:1"이 없다. 3분할은 자기 내부 비율을 사실대로, 길이비는 방향 라벨 붙은 카테고리로, 두 지표가 분리돼 설명된다.

---

## 워크스트림 B — 콘텐츠 깊이 복원 (백엔드 + 어댑터)

**타깃 리치 형태:** `.superpowers/worktrees/face-report-r0-r1/packages/face-report-contract/fixtures/synthetic-summer-muted-v1.json` + 프론트 `SpectrumAxisData`/`RailState`/`EvidenceKind`(이미 존재).

**Files:**
- `services/backend/app/services/openai_analysis.py` (프롬프트 1368-1380, normalizers `_ensure_region_notes`/`_ensure_styling_look`/`_ensure_impression_notes`, field guide 745-760)
- `services/backend/` 해당 pytest
- `apps/mobile/src/shared/types/faceAnalysis.ts`(또는 상응 타입) — regionNotes/stylingLooks 타입 확장
- `apps/mobile/src/features/face-report/services/fromFaceAnalysisReport.ts` (buildS3, toLookCard)
- `apps/mobile/src/features/face-geometry/services/faceGeometryCore/regionVisualsBuilder.ts` (+ `.test.ts`) — 크롭 확대

### Task B1: 백엔드 regionNotes 확장 — 부위별 측정 스펙트럼 축 + 내러티브

**타깃 스키마(부위별):**
```
regionNotes[upper|mid|lower|jaw] = {
  insight, evidence, recommendation,      # 유지
  narrative: str,                          # NEW: 2문장
  axes: [                                  # NEW: 1~2개 측정 스펙트럼
    { key, leftLabel, rightLabel,
      state: 'point'|'boundary'|'withheld',
      position: float(0..1)|null,          # withheld면 null
      caption: str,                        # 축 한 줄 해석(숫자 없이)
      reason?: str, retryLabel?: str }     # withheld일 때만
  ]
}
```

- [ ] **Step 1: normalizer 실패 테스트(pytest)** — `_ensure_region_notes`가 `narrative`(str, 기본 "")·`axes`(list, 기본 [])를 좌표계와 함께 강제하는지; 각 axis가 `state` enum·`position` 0..1 clamp·withheld면 position=null+reason 보존; 잘못된 shape 방어.
- [ ] **Step 2: 실패 확인** — 해당 pytest.
- [ ] **Step 3: `_ensure_region_notes` 구현** — 위 스키마로 coerce. 기존 insight/evidence/recommendation 유지 + narrative/axes 추가. axes 각 항목 검증(레이블 str, state enum, position clamp/None, withheld 사유).
- [ ] **Step 4: 프롬프트 확장(1368-1372 + field guide 745-749)** — 각 부위에 "**해당 부위의 이목구비를 1~2개의 측정 스펙트럼 축**으로 배치(예: 상안부=눈꼬리 방향·눈 사이 간격, 중안부=콧대 흐름·볼 볼륨, 하안부=입술 두께·E라인, 외곽=광대·턱선). 각 축은 leftLabel↔rightLabel, 위치는 제공된 실측 지표를 **해석**해 정하고 숫자는 노출 금지. 측정 불가 축(예: E라인=측면 각도 필요)은 state=withheld + reason + retryLabel. 그리고 2문장 narrative로 그 부위 인상을 서술." 명시.
- [ ] **Step 5: pytest 통과 + Bedrock 라이브 스모크** — 실제 호출로 axes/narrative가 채워지고 withheld가 작동하는지 1회 검증(로그).
- [ ] **Step 6: Commit** — `feat(backend): regionNotes에 부위별 측정 스펙트럼 축+내러티브 복원`

### Task B2: 백엔드 stylingLooks 확장 — 근거 태그 + 근거문 + 전략 차이

**타깃:** rows에 `basis: 'measurement'|'artist'` + `rationale`(=why 승계) 추가. natural/glam은 "강도만"이 아니라 **전략**이 다르게(예: glam은 색이 아니라 대비/광으로 포인트).

- [ ] **Step 1: normalizer 실패 테스트(pytest)** — `_ensure_styling_look` row가 `basis` enum(기본 'artist')·`rationale` 보존; natural/glam 필수.
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: `_ensure_styling_look` 구현** — row `{category, note, why, basis}` 로 확장(basis 기본 'artist').
- [ ] **Step 4: 프롬프트 확장(1377-1380 + guide 753-760)** — "**natural/glam은 강도가 아니라 전략을 달리** 한다(무엇을 강조/생략하는지). 각 row에 basis: 실측 지표에서 직접 나온 조언이면 'measurement', 아티스트 휴리스틱이면 'artist'. why는 이 사용자에게 왜 어울리는지." "강도만" 문구 삭제.
- [ ] **Step 5: pytest + Bedrock 라이브 스모크** — basis가 measurement/artist로 갈리는지 확인.
- [ ] **Step 6: Commit** — `feat(backend): stylingLooks에 근거 태그(측정/아티스트)+전략 차이 복원`

### Task B3: 어댑터 매핑 — 백엔드 리치 필드 → 프론트 렌더

- [ ] **Step 1: 타입 확장** — 모바일 `FaceAnalysisRegionNotes`/`FaceAnalysisStylingLooks` 타입에 narrative/axes/basis 추가(백엔드와 정합).
- [ ] **Step 2: buildS3** — `regionNotes[key].axes`를 `RegionCardData.axes`(`SpectrumAxisData`)로 매핑: state point→`{kind:'point',position}`, boundary→statusChip '경계 유보', withheld→`{kind:'withheld'}`+caption에 reason/retryLabel. `narrative`를 `paragraph`로. 기존 insight/evidence/recommendation 유지. **axes 없으면 [] 폴백(무회귀).**
- [ ] **Step 3: toLookCard** — 하드코딩 제거: `row.basis==='measurement' ? {evidence:'measured', evidenceLabel:'측정 근거'} : {evidence:'artist', evidenceLabel:'AI 제안'}`. why→rationale.
- [ ] **Step 4: 계약 테스트** — `run-face-report-contract.mjs`에 리치 regionNotes/stylingLooks fixture 매핑 케이스 추가(axes/withheld/basis 라운드트립).
- [ ] **Step 5: typecheck + Commit** — `feat(report): 어댑터가 리치 regionNotes 축·내러티브·스타일링 근거를 렌더로 매핑`

### Task B4: S3 크롭 확대 — 상안부에 이마·눈썹·눈 다 보이게

**문제:** [regionVisualsBuilder:100-113] 상안부 크롭이 눈+눈썹 bbox라 이마가 잘리고, 눈썹 점 결측 시 눈만.

- [ ] **Step 1: 실패 테스트 갱신(`regionVisualsBuilder.test.ts`)** — upper 크롭이 이마 랜드마크(예: 10/151/9/8 등 상단 점)를 포함해 눈썹 위까지 커버; 세로 padding 상향; 결측 방어.
- [ ] **Step 2: 실패 확인** — `node scripts/mobile/run-face-geometry-contract.mjs`
- [ ] **Step 3: 구현** — 상안부 bbox에 이마 상단 랜드마크 추가 + padFracY 상향(이마~눈썹~눈 포함). 타 부위도 잘림 있으면 padding 점검.
- [ ] **Step 4: 통과 확인 + Commit** — `fix(report): S3 상안부 크롭에 이마 포함(눈만 보이던 문제)`

### Task B5: 백엔드 proportionInsight — S2 3분할·길이비 맞춤 해석 (확정 2026-07-18)

S2 비율의 맞춤 rich text(각 구획 의미 + 사용자 패턴 + 스타일링 함의)를 Bedrock이 생성. 신규 top-level `proportionInsight: {thirds: str(2문장), faceShape: str(1~2문장)}`. 프롬프트에 측정 3분할 비율 + 길이비 + 성별 주입, **숫자·'이상'·'평균' 표현 금지**(정직성). normalizer `_ensure_proportion_insight`(신규 필드 없으면 빈 문자열). 어댑터가 S2Data로 매핑, 없으면 A1/A2의 정적 self-desc 폴백(무회귀). pytest + Bedrock 스모크. Commit `feat(backend): S2 proportionInsight 맞춤 해석 필드(3분할·얼굴형)`.
- 정적 레이어(A1 교육/측정, A2 카테고리/참고선)는 프론트, **맞춤 해석 문단만 이 필드**. 둘은 공존(정적 뼈대 + 리치 문단).

**Acceptance(B):** 부위 카드에 측정 스펙트럼 축(SpectrumRail)이 뜨고, withheld 부위는 사유+다시찍기, 내러티브가 2문장으로 나온다. 스타일링 행마다 '측정 근거'/'AI 제안'이 정직하게 갈리고 natural/glam이 전략적으로 다르다. 상안부 크롭에 이마가 보인다. 구버전 보고서는 폴백 무회귀.

---

## 워크스트림 C — 잔여 프론트 (라운드2 본문 사용)

라운드2 플랜 `2026-07-18-face-report-realdevice-refinements.md`의 아래 태스크를 **그대로** 실행(변경 없음):
- **T4** (#4 인상맵 실시간 해석+리셋) — 라운드2 Task 4.
- **T5** (#3 드레이프 조명 제거+얼굴 확대+색 밀착) — 라운드2 Task 5.
- **T6** (#6a 체형 성별 문구 세트 A+배선) — 라운드2 Task 6.
- **T7** (#6b 실루엣 일러스트) — 라운드2 Task 7.

**참고:** 라운드2의 옛 **T8**(다중 세부가이드)은 워크스트림 B(B1 축 복원 + B4 크롭)로 흡수·대체된다.

---

## 실행 순서 (권장)

1. **A (S2 정직화)** — 프론트, 빠르고 명료, T2 거짓 라벨 되물림. 먼저.
2. **C 프론트 인터랙션 T4·T5** — 독립적, 실기기 확인 가능.
3. **B (콘텐츠 깊이)** — 가장 큰 가치·가장 큰 작업(백엔드+Bedrock 반복). B1→B2→B3→B4.
4. **C 체형 T6·T7.**

각 태스크 커밋 후 사용자 실기기 확인(B는 Bedrock 라이브 스모크 병행). **push는 사용자 지시 전까지 금지.**

## Self-Review

- **커버리지:** S2 정직화(A1-A3), S3 크롭(B4)+콘텐츠(B1,B3), S7 콘텐츠(B2,B3), 잔여 프론트(C). 사용자 피드백 6영역 + 정직성 지적 전부 매핑. ✅
- **하위호환:** 백엔드 신규 필드는 normalizer 기본값, 어댑터 axes:[] 폴백 — 구보고서 무회귀. ✅
- **정직성:** 스펙트럼 축 위치=AI 해석(measured 태그는 실측 파생일 때만), withheld=측정 불가, "평균/이상" 삭제. ✅
- **실행 중 확인:** ① 모바일 regionNotes/stylingLooks 타입 파일 정확 위치(B3 Step1) ② Bedrock APAC profile 스모크 경로 ③ 이마 랜드마크 인덱스 확정(B4).
