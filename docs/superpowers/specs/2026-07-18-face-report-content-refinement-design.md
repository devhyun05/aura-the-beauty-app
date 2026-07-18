# 얼굴 보고서 내용·레이아웃 개선 설계 (실기기 발견 기반) — 2026-07-18

상태: **설계 확정 대기 (brainstorming 산출물)**
작성 계기: 실기기에서 배포본 보고서(report_RN, `apps/mobile/src/features/face-report`)를 직접 테스트해 발견한 5개 영역 문제.
정본/자매 문서:
- 상위 재구성 계획 — [2026-07-16-face-report-redesign-plan.md](../plans/2026-07-16-face-report-redesign-plan.md) (이하 "v2 계획"). 본 설계는 그 계획의 **부분 구현 + 실기기 기반 발산(divergence)** 이며, 겹치는 배관은 재사용한다.
- 데이터 원칙 참조 — `apps/mobile/src/features/face-report/reportTypes.ts`, `apps/mobile/src/shared/types/faceAnalysis.ts`

---

## 0. 이 설계가 서 있는 자리 (Positioning)

- 지금 배포본 보고서는 백엔드 **Bedrock Claude** 분석 호출(`services/backend/app/services/openai_analysis.py` — 파일명은 옛 이름, 실 경로는 Bedrock)이 만든 `regionNotes` / `impressionNotes` / `stylingLooks`를 `fromFaceAnalysisReport.ts` 어댑터가 S1–S7 UI로 변환해 렌더한다.
- **핵심 사실 (조사로 확정):** "측정 → 가공 → LLM → 보고서" 파이프라인은 **이미 끝에서 끝까지 존재**한다.
  - MediaPipe 478점 풀 메시가 분석 시점에 JS로 넘어오고(네이티브 변경 불필요), 부위별 지표 엔진(`faceGeometryCore/faceGeometryMath.ts`)이 이미 `faceGeometry2d`를 계산한다.
  - 그 수치(`faceVerticalThirds`, `face3d`, `faceGeometry2d`, `measuredPersonalColor`)가 **이미 Bedrock 프롬프트 메타데이터로 전달**되고 있으며(`_safe_analysis_prompt_metadata`), 프롬프트는 이미 *"수치를 나열하지 말고 실측 지표를 근거로 풀어 써라"* 라고 지시받고 있다(`openai_analysis.py:1358-1361`).
- 따라서 병목은 **"측정값이 없다"가 아니라 "출력 그릇이 좁다 + 시각 근거가 가짜다"** 이다:
  1. `regionNotes`가 부위당 **한 문장 string** — 근거·조언을 담을 칸이 없다.
  2. S3 이목구비 카드의 가이드라인이 실제 랜드마크가 아니라 **코드에 박힌 고정 타원**(`S3_REGION_META`)이라 얼굴과 어긋난다.
- **데이터 소스 결정(확정): Path A** — 현행 Bedrock `analyze_text` 호출의 **출력 스키마만 확장**한다. 잠들어 있는 `FaceAnalysisV2` 파이프라인은 켜지 않는다(별도 wave·사람/실기기 관문 필요). 단 신규 타입·스키마는 V2로의 후속 승격이 쉽도록 **V2 호환을 지향**해 설계한다.

### 0.1 v2 계획과의 정합·발산

| 항목 | v2 계획 | 본 설계 | 관계 |
|---|---|---|---|
| 부위 확대 crop + 가이드선 | §4.1: SVG viewBox 확대, 분석 시점 좌표 산출·저장(`regionBboxes`, measurements v1 optional 키), 배관 6건 | 동일 방식 채택 | **재사용** |
| 내추럴/글램 2종 | §1-⑦, §7: recommendedLook 단수 → 2종 | 이미 `stylingLooks.natural/glam` 존재. 슬라이더 제거·나란히 표시 | **재사용 + UI 발산** |
| 수치 노출 | 원칙 4: **측정 수치·confidence % 비노출** | 세로 3분할 **정규화 비율 + 평균 밴드**를 숫자로 노출 | **의도적 발산 (영역 1 · 정직성 참조)** |
| 시선 순서(gaze) | §4.3-5: 재현 대상 상태로 유지 | **제거**하고 2D 인상 좌표 맵으로 대체 | **의도적 발산 (§4 참조)** |
| 데이터 소스 | V2 파이프라인 승격 지향 | 현행 Bedrock 호출 확장(Path A) | **범위 축소, V2 호환 유지** |

---

## 1. 목표 / 비목표

**목표 (실기기 발견 5영역 해소):**
1. **Features** — 상/중/하안부 부위를 (1.1) 가로로 넘겨 보고, (1.2) 부위만 확대 크롭하며, (1.3) 실제 랜드마크로 가이드라인을 그리고, (1.4) 평균 대비 위치를 보이고, (1.5) 비율을 숫자로 표기. 그리고 **실측값을 근거로 한 인사이트 + 실행 조언**("턱이 부각되는 편 → 근거 X → 립은 약하게")을 읽기 쉽게.
2. **퍼스널 컬러** — (2.1) 봄 라이트 확신도를 직관적으로, (2.2) 조명 다이얼 → 세로 슬라이더, (2.3) "직접 입혀 보세요"의 가치·문구 재정의.
3. **Impression** — 가짜 시선 순서 제거 → **도움되고 즐거운 2D 인상 좌표 맵**.
4/5. **Styling/글램** — 두 룩을 **나란히 항상 완전 표시**(글램 흐림 버그 동시 해소).

**비목표 (이번 범위 밖 — 명시):**
- `FaceAnalysisV2` 파이프라인 제품 활성화(`FACE_ANALYSIS_V2_ENABLED`는 OFF 유지).
- AR 맞춤 핏(v2 계획 §5), body profile 프롬프트 유입.
- 네이티브/Unity 변경(478점 메시는 이미 접근 가능하므로 불필요).
- 새 face3d/geometry **지표 자체**의 신설(기존 지표로 충분 — §2.2). 지표의 모집단 백분위·mm 노출은 금지.

---

## 2. 공유 아키텍처 — 근거→인사이트→조언 체인

데이터 흐름(아래 → 위)과 각 지점의 소유·변경 범위:

```
[측정] faceGeometry2d / face3d / faceVerticalThirds / measuredPersonalColor  (이미 계산·전송됨)
   │  + (신규) 부위별 crop rect + 가이드 폴리라인   ← 분석 시점 산출·저장
   ▼
[LLM] Bedrock analyze_text  (측정값 이미 프롬프트에 포함)
   │  regionNotes: string        → {insight, evidence, recommendation}   (그릇 확장)
   │  impressionNotes: +axes      → 2D 인상 맵용 축 점수 추가
   │  stylingLooks: natural/glam  → 변경 없음(이미 2종)
   ▼
[타입·어댑터] faceAnalysis.ts 타입 확장 → fromFaceAnalysisReport.ts 소비 (+ 구버전 폴백)
   ▼
[UI] S2(비율 숫자) · S3(캐러셀+크롭+실가이드+근거/조언) · S4(게이지+슬라이더) · S6(인상 맵) · S7(두 룩 나란히)
```

### 2.1 부위별 실측 근거 매핑 (이미 존재하는 지표 → 부위 카드)

각 부위 카드의 `evidence`는 아래 기존 지표를 근거로 삼는다(모델이 문장으로 해석; 숫자·백분위 비노출).

| 부위(key) | 근거 지표 (기존) | 예시 인사이트 |
|---|---|---|
| 상안부 `upper` (이마·눈썹·눈) | `faceGeometry2d`: eyeWidth/openness, interCanthalRatio, canthalTilt(도), eyeBrowGap, browSlope(도) | "눈매가 큰 편, 눈꼬리가 살짝 올라간 인상" |
| 중안부 `mid` (코·인중·볼) | `face3d`: noseTipProjection, noseLength, nasalBridgeStraightness, alarWidth, malarProjectionL/R, centralProjectionScore | "코가 입체적이고 앞광대가 또렷" |
| 하안부 `lower` (입술) | `face3d`: upperLipToELine, lowerLipToELine · `faceGeometry2d`: mouthWidthRatio, lipThicknessRatio, mouthCornerAsymmetry | "입술이 도톰하고 입가 곡선이 자연스러움" |
| 외곽 `jaw` (광대·턱) | `face3d`: chinProjection, malarProjectionL/R · `faceGeometry2d`: jawWidthRatio, lowerJawWidthRatio, lowerFaceWidthRatio | "턱이 부각되는 편, 하관이 넓은 편 → 립 약하게" (사용자 예시) |

**정직성 규칙:** 지표가 null(미측정) 또는 roll>±5°로 각도 지표가 무효화되면 그 부위 evidence는 **사진 관찰 근거로 폴백**하고 근거 문구를 조건부로 완화한다. 모델이 특정 축을 "측정했다"고 단정하지 않는다.

### 2.2 부위 크롭 rect + 가이드 폴리라인 (v2 계획 §4.1 배관 재사용)

분석 시점 478점 메시(이미 손에 있음)에서 순수함수로 산출·저장한다. **원본 메시가 아니라 파생 기하만 저장**(프라이버시·용량 — 478점 미저장 원칙과 정합).

산출 대상(부위별):
- **crop rect** — 해당 부위 랜드마크 그룹의 bounding box + 패딩(정규화 0..1).
- **가이드 폴리라인** — 실제 측정선 1~2개:
  - upper: 눈 라인(좌우 눈꺼풀 상단 점 연결) 또는 눈썹 코어 링
  - mid: **콧대 중심선**(콧대 midline 점 연결 — 지금의 가짜 세로선을 실선으로 대체)
  - lower: **입술 아웃라인**(외곽 립 링)
  - jaw: **턱 곡선**(하악 윤곽 172·148·152·377·397 연결)

랜드마크 인덱스는 기존 `faceGeometryCore/landmarkIndices.ts`에 이미 정의된 그룹을 사용하고, 없는 그룹(예: 콧대 midline·외곽 립 링)만 TS로 추가한다(들어오는 배열에 이미 존재 — 네이티브 변경 0).

**좌표 프레임 계약(v2 계획 B4):** crop/가이드는 **roll 보정 이전 원본 픽셀 좌표**로 산출한다(현행 지표는 보정 후 좌표라 혼용 금지). 사진 위에 얹으므로 사진과 같은 프레임이어야 한다.

**저장:** measurements **v1 유지 + 내부 optional 키** `regionVisuals`(encode/decode + 프롬프트 pop + 15,000자 캡 재확인). 버전 업 아님.

**L/R 주의:** `landmarkIndices.ts`는 해부학(subject) 기준 L/R, `AURAPersonalColorAnalyzer.m`은 image 기준 — 인덱스 재사용 시 L/R 매핑을 명시 검증한다.

---

## 3. 영역별 설계

### 영역 1 — Features (S2 구획 + S3 이목구비)

**진단(실기기):** S2 가로 가늠선(이마선/미간/코밑/턱끝)은 실측이라 정상. S3 카드는 (a) 세로 스택이라 못 넘기고, (b) 전신 셀피 전체를 반복 표시(크롭 없음), (c) 고정 타원 가이드가 눈가인데 코·입에 떠 있고, (d) 근거·조언이 없다.

**설계:**
- **1.1 가로 캐러셀** — S3 `data.cards`를 `FlatList horizontal pagingEnabled` + 페이지 인디케이터로. (`onCardLayout` 기반 S2→S3 스크롤 연동은 캐러셀 인덱스 이동으로 대체.)
- **1.2 크롭** — 각 카드가 `regionVisuals[key].cropRect`로 **그 부위만 확대**(SVG viewBox 확대, 픽셀 crop 아님 — §2.2, v2 §4.1).
- **1.3 실가이드** — 고정 타원 제거. `regionVisuals[key].guides`(실측 폴리라인)를 크롭 위에 얹는다. `S3_REGION_META`의 고정 `guide` 좌표는 삭제.
- **1.4 평균 대비 ('평균이 뭔지'를 두 기준으로 정직하게 구분)** —
  - **얼굴 길이비(세로/가로)**: `faceVerticalThirds.faceLengthJudgment.band{lo,hi}`는 **측정·저장된 정상 구간**이다. 이걸 '평균 범위' 띠 게이지로 그리고 내 위치를 점으로 찍어 verdict("평균 범위 안 / 세로로 긴 편")를 보인다. ← 사용자의 "평균적으로 얼마나"에 진짜로 답하는 지표.
  - **세로 3분할(상:중:하)**: 저장된 통계 밴드가 **없다**. 레퍼런스는 미용 **이상 기준 1 : 1 : 1**(측정된 평균이 아님)이며 라벨을 '이상 기준'으로 명확히 구분한다.
  - `verticalThirds.confidence`가 낮거나 `faceLengthJudgment.verdict==indeterminate`면 게이지/판정 대신 "판정 보류" 라벨.
- **1.5 비율 숫자** — S2에 `verticalThirds.displayRatio`(중안부=1.0 기준)를 **상 : 중 : 하 = 1.05 : 1.00 : 0.95** 형태로 표기 + "이상 기준 1 : 1 : 1" 병기(측정 평균 아님).
- **근거·조언** — 각 카드에 `insight`(결론) / `evidence`(근거) / `recommendation`(메이크업 조언) 3단 렌더.

**데이터 소스 / 정직성:**
- 크롭·가이드·비율·밴드 = **측정 기반**(라벨 "측정").
- insight/evidence/recommendation = **AI가 실측 지표를 근거로 생성**(라벨 "AI 제안" — 기존 S3 evidence 규칙 유지, `fromFaceAnalysisReport.ts:487-489` 참조).
- **§1-A 발산 명시:** 1.5의 비율 숫자는 `reportTypes.ts`의 *"수치는 0..1 정규화 기하만"* 원칙과 v2 계획 원칙 4를 **의도적으로 완화**한다. 허용 범위는 **정규화된 비율과 그 평균 밴드에 한정** — 원측정(mm)·모집단 백분위·confidence %는 계속 비노출.

**주요 파일:** `sections/S2Proportion.tsx`, `sections/S3Features.tsx`, `visuals/GuidePhotoOverlay.tsx`(밴드+숫자), 신규 `visuals/RegionCropCard.tsx`, `visuals/RegionGuideOverlay.tsx`; `reportTypes.ts`(S2 ratio 필드·S3 구조체·regionVisuals), `fromFaceAnalysisReport.ts`(buildS2/buildS3), 신규 측정 빌더 `faceGeometryCore/regionVisualsBuilder.ts` + `faceAnalysisMeasurements.ts` codec. `visuals/GuideOverlay.tsx`·`S3_REGION_META` 고정 좌표 제거.

### 영역 2 — 퍼스널 컬러 (S4)

**진단:** BlendBar(봄라이트│단일톤)가 확신도를 직관적으로 못 준다. 조명 다이얼이 조작 의미가 약하다. "직접 입혀 보세요"의 가치가 안 읽힌다(동그란 사진 뒤 배경만 칠해짐).

**설계:**
- **2.1 확신도 게이지** — `tone.typeScore`(0..1)를 "봄 라이트 82%"류 명시 라벨 + 2순위 톤과의 거리 표시. 신규 `visuals/ConfidenceGauge.tsx`. (device-relative 캡션 유지 — v2 §1-④.)
- **2.2 다이얼 → 세로 슬라이더** — `visuals/LightingDial.tsx`를 신규 `visuals/VerticalLightSlider.tsx`로 교체. 기존 `light` sharedValue(-1 웜..1 쿨) 재사용, warm/cool tint 오버레이 로직 그대로. `LightingDial`은 제거(또는 lab 전용 강등).
- **2.3 "직접 입혀 보세요" 재정의** — 문구를 가치 중심으로: 제목 "**어울리는 색, 직접 대보기**", 부제 "잘 어울리는 색과 피할 색을 얼굴 옆에 대보면 인상 차이가 보여요." 기능 보강: good/worst 대비를 더 직접적으로(스와치 탭 시 스테이지 색 + 캡션이 **왜** 어울리는지/가라앉는지 한 줄 근거를 함께). 스코프 유지 — AR 실적용은 별도.

**데이터 소스 / 정직성:** 전부 `measuredPersonalColor`(측정). 조명 슬라이더는 "촬영 조명 기준 상대 진단" 디스클레이머 유지.

**주요 파일:** `sections/S4PersonalColor.tsx`, `visuals/BlendBar.tsx`(게이지 병합 또는 신규 `ConfidenceGauge`), 신규 `visuals/VerticalLightSlider.tsx`, `fromFaceAnalysisReport.ts`(buildS4 문구).

### 영역 3 — Impression (S6) → 2D 인상 좌표 맵

**진단:** 시선 순서 링 2개가 고정 좌표에 순서도 임의(측정 아님). 재생이 눈가 하나만 되고 2점뿐이라 의미가 없다.

**설계:** `GazeReplay` 제거. **2D 인상 좌표 맵**으로 대체:
- 2개 축(모델이 값·라벨 채움): 예 `axisX = 부드러움(-1) ↔ 또렷함(+1)`, `axisY = 차분함(-1) ↔ 화사함(+1)`.
- **현재 위치** 점을 맵에 표시(= AI가 판단한 지금의 인상).
- **드래그 탐색** — 사용자가 목표 점을 끌면, 그 방향에 해당하는 짧은 메이크업 힌트를 표시(모델이 방향별 힌트 4개 제공: up/down/left/right). "이쪽으로 가려면 ○○" — 도움 + 놀이.
- 기존 keywords·paragraph는 맵 아래 유지.

**LLM 출력 확장:** `impressionNotes`에 `axes: [{key, leftLabel, rightLabel, value}]`(2개) + `moves: [{toward, makeupHint}]`(4개) 추가.

**데이터 소스 / 정직성:** 축 위치·힌트 = **AI 판단**(명시 라벨 "AI가 본 인상"). 측정으로 위장하지 않는다. 재생 애니메이션 없음(가짜 순서 개념 폐기).

**주요 파일:** `sections/S6Impression.tsx`, 신규 `visuals/ImpressionMap.tsx`(드래그=reanimated/gesture-handler), `visuals/GazeReplay.tsx` 제거, `reportTypes.ts`(S6 축·moves), `faceAnalysis.ts`(ImpressionNotes 확장), `fromFaceAnalysisReport.ts`(buildS6), 백엔드 프롬프트/스키마.

### 영역 4/5 — Styling + 글램 (S7)

**진단:** 크로스페이드 슬라이더가 용도 불명확(4). 기본값(내추럴)에서 `glamStyle` opacity=0.5로 글램 카드가 흐려져 "안 나온다"고 느껴짐(5) — 원인은 `S7Styling.tsx:126-129`의 opacity 크로스페이드.

**설계:** 슬라이더·`MixFaceMap`·크로스페이드 전부 제거. **두 룩(내추럴/글램)을 항상 완전 불투명으로 나란히 표시.**
- 두 `LookCard`를 세로로 스택(각 full opacity), 상단에 "무엇이 다른가" 한 줄 비교 헤더.
- EvidenceBadge(AI 제안)·rows(base/brow/…)·why 유지.
- `stylingLooks`는 이미 natural/glam 2종 존재 — 백엔드 변경 불필요.

**데이터 소스 / 정직성:** `stylingLooks`(AI 제안, 이미 정직 라벨). 변경 없음.

**주요 파일:** `sections/S7Styling.tsx`(슬라이더/MixFaceMap/크로스페이드 삭제, 두 카드 정적 렌더). `reportTypes.ts` S7의 `mixZones`·`lookSummary` 등 슬라이더 전용 필드 정리(하위호환 위해 optional로 남기고 UI에서 미사용).

---

## 4. 백엔드 변경 (Path A — Bedrock analyze_text 확장)

`services/backend/app/services/openai_analysis.py`:
1. **프롬프트**(`_build_analysis_prompt`, :1359-1367) —
   - `regionNotes` 지시를 "부위당 한 문장"에서 "부위당 `{insight, evidence, recommendation}` — insight=인상 결론, evidence=어떤 실측 지표에서 그렇게 보이는지(숫자 나열 금지, 해석), recommendation=그래서 어떤 메이크업을 어떻게"로 확장.
   - `impressionNotes`에 `axes`(2축 값·라벨)·`moves`(방향별 힌트) 추가 지시.
2. **필드 가이드**(`ANALYSIS_OUTPUT_FIELD_GUIDE`, :729-752) — 위 구조 반영.
3. **정규화**(`_ensure_region_notes` :1660 / `_ensure_impression_notes` :1678) — 구조체 백필 + **하위호환**: 구 문자열이 오면 `{insight: <문자열>, evidence: '', recommendation: ''}`로 승격, 신 필드 누락 시 안전 기본값.
4. **모델(선택):** 기본 `claude-3-5-sonnet`. 구조화 출력 품질이 부족하면 `bedrock_analysis_inference_id`로 상위 모델 지정 가능(설정만, 코드 변경 없음). 이번 범위에서 강제 아님.

**측정 지표 신설 불필요** — 기존 face3d/geometry2d/verticalThirds 지표로 §2.1 근거가 충분. `face_measurement_schema.py` 화이트리스트 변경 없음.

**하위호환:** 구버전 보고서(구 문자열 notes, `regionVisuals` 없음)는 어댑터가 (a) notes를 문자열 폴백으로 렌더, (b) 크롭·가이드 없는 카드는 기존 "부재=섹션/오버레이 숨김" 원칙으로 처리. **없는 값 생성 금지** 유지.

---

## 5. 타입·계약 변경 요약

`apps/mobile/src/shared/types/faceAnalysis.ts`:
- `FaceAnalysisRegionNotes` — 각 부위 `string` → `{ insight: string; evidence: string; recommendation: string }`. **마이그레이션 규칙(단일):** 백엔드는 항상 구조체를 반환하고(§4.3 정규화), 저장된 **구버전 보고서의 문자열 notes만** 어댑터가 `{ insight: <문자열>, evidence: '', recommendation: '' }`로 승격한다. 타입은 신 구조체 하나로 두고 구 문자열은 어댑터 경계에서만 흡수.
- `FaceAnalysisImpressionNotes` — `axes?: {key,leftLabel,rightLabel,value}[]`, `moves?: {toward,makeupHint}[]` 추가.
- 신규 `FaceAnalysisRegionVisuals` (measurements 내부) — 부위별 `cropRect{x,y,w,h}` + `guides: {points:{x,y}[], label}[]`, 정규화 0..1.

`apps/mobile/src/features/face-report/reportTypes.ts`:
- **원칙 완화 주석 갱신** — 정규화 비율·평균 밴드 노출 허용을 명문화(발산 근거 링크).
- `S2Data` — `ratio: {upper:number; middle:1; lower:number|null}`, `ratioBand`, `ratioConfidenceWithheld` 추가.
- `S3Data.cards[]` — `insight/evidence/recommendation` + `cropRect`/`guides`. 고정 `guide` FeatureGuide 제거.
- `S6Data` — `axes`·`moves`(맵), gaze 전용(`rings/markers/stepMs`) 제거.
- `S7Data` — 슬라이더 전용 필드 optional·미사용.

**V2 호환 지향:** `regionVisuals`·구조화 notes·인상 축은 V2의 derived 해석/perception과 매핑 가능한 필드명으로 둔다(후속 승격 시 어댑터만 교체).

---

## 6. 구현 순서 (하나의 스펙, 단계 구현)

데이터 가용성 순 — 눈에 보이는 개선을 먼저, 깊은 배관을 뒤에.

- **P1 (백엔드 무관, 기존 데이터로 즉시):**
  - S7 두 룩 나란히(글램 버그 해소) · S4 다이얼→세로 슬라이더 + 확신도 게이지 · S2 비율 숫자 + 평균 밴드(`verticalThirds`에 이미 저장).
- **P2 (백엔드 스키마 확장):**
  - Bedrock 프롬프트/필드가이드/정규화 확장(regionNotes 구조체 · impression 축) + 하위호환 · 어댑터·타입 반영.
- **P3 (부위 시각 배관):**
  - `regionVisualsBuilder`(순수함수) + measurements codec + 어댑터 + S3 캐러셀·크롭·실가이드·근거/조언.
- **P4 (인상 맵):**
  - S6 `ImpressionMap`(드래그) — P2의 축 출력 소비.

각 단계는 독립 검증 가능(P1은 백엔드 없이 실기기 확인, P3는 fixture 순수함수 테스트부터).

---

## 7. 리스크 / 워치아웃

1. **Unity 상주 의존** — 부위 시각 좌표 산출은 분석 시점 478점 메시에 의존(`unityMakeupBridge.requestFaceLandmarks`). Unity 미상주 빌드에선 landmark=0 → `regionVisuals` 미저장 → 크롭·가이드 폴백(숨김). 기존 측정과 동일 제약이므로 신규 위험은 아님.
2. **L/R 규약 불일치** — subject vs image (§2.2). 인덱스 재사용 시 단위 테스트로 좌우 검증.
3. **roll 각도 게이팅** — 각도 지표는 roll>±5°에서 null. evidence 폴백 필수(§2.1).
4. **모집단 규준 부재** — 유일하게 측정·저장된 정상 구간은 **얼굴 길이비 `faceLengthJudgment.band`** 뿐이다. 그러므로 **"측정된 평균 대비" 게이지는 얼굴 길이비에만** 적용하고, **세로 3분할은 '이상 기준 1:1:1'**(측정 평균 아님, 라벨 구분), 부위별 face3d/geometry2d 근거는 **정성 표현("~한 편")**으로 유지한다. **모집단 분포가 없으므로 백분위("상위 N%")는 지어내기 — 금지.**
5. **원칙 4 발산의 파급** — v2 계획은 numeric-free 전제. 본 발산은 정규화 비율에 국한하되, 스펙·주석·리뷰에 명시해 후속 작업자가 되돌리지 않게 한다.
6. **하위호환** — 구 보고서 다수 존재. 어댑터 승격/숨김 경로를 fixture로 커버.

---

## 8. 테스트 전략

- **백엔드:** `_ensure_region_notes`/`_ensure_impression_notes` 정규화 단위 테스트(신 구조체·축, 구 문자열 승격, 필드 누락 기본값). 프롬프트 출력 계약 스냅샷.
- **모바일 순수함수:** `regionVisualsBuilder`(합성 랜드마크 fixture → 예상 cropRect·폴리라인), L/R·roll 게이팅 경계.
- **어댑터:** buildS2(비율·밴드·confidence 보류), buildS3(신 구조체 vs 구 문자열), buildS6(축/moves 유무), buildS7(두 룩) — 구/신 보고서 양방향.
- **UI 스냅샷:** S2 숫자, S3 캐러셀·크롭·가이드, S4 게이지·슬라이더, S6 맵, S7 두 룩. 390pt 폭.
- **실기기 회귀:** 발견 5영역이 실제로 해소됐는지 동일 셀피로 재확인(캡처).

---

## 9. 미결 사항 (Open Questions)

없음(모든 pivotal 결정 확정: 데이터 소스=Path A, Impression=2D 맵, Styling=두 룩 나란히, 비율 숫자 노출=정규화 한정, 범위=단일 스펙). 세부 문구·정확한 축 라벨은 구현 중 fixture로 조정하며, 프롬프트 최종 문구는 실기기 A/B로 다듬는다.
