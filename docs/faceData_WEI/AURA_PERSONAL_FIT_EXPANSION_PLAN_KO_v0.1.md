# AURA 맞춤핏 확장 기획 v0.2 — 요인 전수 반영·분석별 재생성·레인 일원화

상태: 기획 확정(2026-07-24 대화 합의). 구현 전 — 단계별 착수 순서는 §8. 자동 δ 안전 계층은 §11(2026-07-25 신설).
작성: 2026-07-24, 저장소 정찰 기반. 선행 문서: [AR맞춤핏 계약 v0.2](AR맞춤핏-계약초안-v0.md), [테크닉 테이블 v0](AURA_MAKEUP_TECHNIQUE_TABLE_KO_v0.md), [특징 프로파일 계획 v0.1](AURA_FACE_FEATURE_PROFILE_PLAN_KO_v0.1.md).
v0.1→v0.2 개정(2026-07-24, dev 병합 5d8e986a9 반영): 눈썹 `browThickness`(전체 굵기)·`browLength`(꼬리 방향 가로 길이) 축 신설됨 — 핏 소비를 위해 **gold 승격 결정**(§4-1, 룩/핏 경계 논점 기록). 눈썹 규칙에 두 축 배선(§3-3). "아이라이너 길이"는 기존 gold `eyelinerWingLength`+하부 테일 축으로 충족 — 신설 불요 확인.
v0.2 보강(2026-07-25, 자동 δ 안전): 실기기에서 두 증상 발견 — ① 새 분석이 사용자가 켠 수동 핏 시트의 ★를 빼앗음, ② 자동 δ에 의미적 상한이 없어 언더아이 블러셔가 눈두덩으로 올라가는 등 해부학 침범. 다중 에이전트 진단으로 원인 확정 후 자동 δ 안전 계층 신설 — §11.

**1단계 구현 완료(2026-07-24)** — 구현 중 확정된 정정 4건: ① `browThickness` gold 승격은 **보류**(lookStore `migrateBrowCoverageFitSheets`가 핏 룰의 browThickness를 레거시로 간주해 로드마다 이관·삭제 — 마이그레이션 버전 가드 은퇴가 선행 조건; `browLength`만 승격). ② 얼굴형·블러셔 **각도** 규칙(C-2~5)은 절대 목표라 δ 도메인과 부정합 — 위치·퍼짐 성분만 핏 규칙으로, 각도·마스크 선택은 레시피 층으로 이관(§3-1). ③ W-3′는 intensity 축이 비-gold라 `eyelinerThickness`를 대비 프록시로 구현. ④ `eyeScale`은 기존 저장 지표 합성(eyeWidthRatio×interCanthalRatio)으로 파생 — 신규 캡처 코드 불요, 과거 리포트에도 소급. E-9(눈사이 가까움)는 그라데이션 시작점이 핏 축이 아니라 미구현 — E-10과 함께 3단계 `eyelinerInnerExtension`에서.
목적: 세로3분할(상·중·하안부) 개별 밴드, 꼬막눈, 돌출·함몰눈, 눈썹-눈 거리, 눈꼬리 개폐 등 요인 전수를 맞춤핏에 반영하고, 분석할 때마다 핏이 새로 생성되게 한다.

핵심 결정(합의 완료):

1. **분석 완료 시마다 핏 재생성** — 생성 트리거를 AR 화면 마운트에서 분석 완료 지점으로 이동. AR 화면 로드는 화해(reconcile) 경로로 강등.
2. **시트는 1장, 레인은 시트의 속성** — 레인별 시트 3장 구체화는 하지 않는다. `deriveFitDeltas`가 순수·결정론이므로 레인 전환 = 즉석 재계산으로 같은 슬롯 덮어쓰기.
3. **규칙 카테고리 신설** — `reshaping`(형태 보정, 레인 게이트) / `clarity`(결점·선명도 보정, 레인 무관). accent 레인 = reshaping δ만 0, clarity는 유지로 재정의.
4. **새 분석 핏 자동 ★(메인) ON** — 사용자가 직접 껐던 기록이 있으면 존중. ⚠ 계약 v0.2 D-4/D-5("자동 적용 기본 OFF")의 개정 지점 — §7-4.
5. **근거 게이트 유지** — 방향·부호는 B급 이상 교차검증 행만 엔진 진입. 미검증 후보는 리서치 태스크(§9)로 묶고 통과분만 `fit-map-v1.x` 증분 반영.

---

## 1. 현재 상태 진단 — 왜 지금 그 요인들이 반영 안 되나

| 원하는 요인 | 막힌 지점 |
|---|---|
| 상·하안부 좁음/김 | 세로3분할 측정은 있으나 밴드가 "가장 우세한 부위 하나"(`verticalBalance`)로만 뭉개짐. 부위별 김/짧음 밴드 부재 |
| 중안부 짧음 | 테이블 C-1에 "짧음 → 블러셔 저배치" 조건 분기가 있으나 엔진엔 "김 → 고배치"만 구현 |
| 꼬막눈(전체적으로 작은 눈) | 눈 지표가 비율(aspect·눈사이)뿐 — 얼굴 대비 눈 크기 지표 부재 |
| 돌출·함몰눈 | 측정·관찰 모두 부재. 2D 랜드마크 불가, VLM enum에도 없음 |
| 눈사이 거리 멂/가까움 | 밴드(`eye.spacing`)·근거(E-9/10, B급) 모두 있는데 **매핑 규칙만 미구현** |
| 얼굴형별 셰이딩·블러셔 | `contour.faceShape` 밴드 있음, F-1~F-4는 **A급** — 통째로 미구현 |
| 눈매 대비 낮음 | `eyeContrast` VLM 있음, W-3 **A급** — 미구현 |
| 눈썹 전 요인 | `slope`/`apex`/`eyeGap` 밴드·`browExpandUpper/Lower`·`browArch` 축 전부 있는데 규칙 0건. v0.2: `browThickness`·`browLength` 축 추가 확보(dev 병합) — 단 gold 미지정이라 핏 규칙 소비엔 승격 필요(§4-1) |

구현 완료 행(유지): E-1(처진 눈꼬리 — 단 눈썹 δ 부분 미구현), E-3(hooded), E-4(무쌍), E-7/E-8(개방도), 애교살 present, C-1(중안부 김), L-1(얇은 입술), E-7 확장(하부 테일 디태치).

## 2. 프로파일(1층) 확장 — 판정 재료

### 2-1. 결정론 측정(자기참조 우선)

| 신설 | 정의 | 밴드 | 비고 |
|---|---|---|---|
| `contour.thirds` | upper/middle/lower 각각을 세 부위 평균 대비 판정 | 각 `low(짧음)/balanced/high(김)` | 자기참조, 기존 데드존 0.06 재사용. 기존 `verticalBalance`는 호환 유지. **upper(트리키온) null 시 middle↔lower 쌍대비 폴백** — 중안부 짧음은 헤어라인 없이도 판정 |
| `eyeScale` | 눈 가로폭 / 얼굴폭 (faceWidth는 jawWidthRatio 계산에 기사용 — 랜드마크 추가 없음) | `low(꼬막)/balanced/high` | provisional-population. openness(aspect)와 직교 — "작고 둥근"/"작고 가는" 구분 |
| `eyeCornerApertureDeg` | 눈꼬리에서 윗·아랫눈꺼풀 라인이 이루는 개방각 | `open(트임)/neutral/closed(닫힘)` | 자기참조. E-K4 입력 — 방향 규칙 확정 전에도 측정은 선구현 가능 |
| `philtrumRatio` | 비하점~윗입술 / 하안부 | `low/balanced/high(김)` | 랜드마크 즉시 계산. `nosePhiltrumLips` 인사이트는 참고 재료 |

### 2-2. VLM 관찰 신설(백엔드 `FEATURE_OBSERVATION_ENUMS` + 프론트 계약·빌더)

| 키 | enum | 소비 규칙 |
|---|---|---|
| `eyeDepth` | `protruding / neutral / deepSet / unclear` | E-K2/K3. 장기: FACE3D 깊이 측정으로 승격(계약 `source:'depth'` 슬롯 기존재) |
| `darkCircles` | `none / mild / pronounced / unclear` | T-1(삼각존 커버). 피부 룩 개편(잡티·코렉터 부분 커버)과 정합 |

## 3. 매핑 규칙 신설 — 근거 등급 포함

카테고리: **R**=reshaping(레인 게이트) / **C**=clarity(레인 무관). §6 참조.

### 3-1. 세로3분할·윤곽 (V·F계열)

| # | 발동 | 효과 | 카테고리 | 근거 |
|---|---|---|---|---|
| V-1/2 | `thirds.upper` high/low | 헤어라인 셰이드 ±δ(부호 반전 단일 축, 신설 `hairlineShade`) | R | **A** (F-5) |
| V-3 | `thirds.middle` low | `blushLift −δ`(저배치·전통 능선) — 기존 C-1의 조건 분기 완성 | R | B/C (C-1) |
| V-4 | `thirds.lower` high | 턱끝·광대아래 셰이딩 +δ(신설 `chinShade`), 블러셔 각도 가로(0°) | R | **A**/B (F-2+C-2) |
| V-5 | `thirds.lower` low | 턱끝 하이라이트 +δ(`chinShade` 음수) | R | B (F-2 반전 외삽 — 주석 필수) |
| F-1~4 | `contour.faceShape` (둥근/긴/각진/하트) | 셰이딩·하이라이트 배치 = contour·highlighter lift/spread/affine | R | **A** (Milady Table 19-5 원문) |
| C-2~5 | 〃 | 블러셔 각도·마스크: 긴→가로 0°, 둥근→사선 위, 각진→사선 아래·미세 하향, 하트→**사선 금기**·둥근 발색 하향 | R | B (C-5는 B/C) |

### 3-2. 눈 (E계열)

| # | 발동 | 효과 | 카테고리 | 근거 |
|---|---|---|---|---|
| E-9/10 | `eye.spacing` close/wide | close: 그라데이션 시작 outer·`eyelinerInnerExtension 0` / wide: 시작 inner·`eyelinerInnerExtension +δ` | R | **B** (테이블 기존 행 — 구현만) |
| E-K1 | `eyeScale` low (꼬막눈) | `eyelinerWingLength +δ`(라이너 길이) + `eyelinerLowerTailTrace/Len +δ`(하부 테일 — 구현 완료 축 재사용) + `eyeshadowHeight +δ` + 보조 `mascaraLength +δ`(C급). 근거 확인 시 `browThickness −δ` 보조 후보 | R | A(W-3 기제) — Milady 눈모양 교정표 대조 후 확정 |
| E-K2 | `eyeDepth=protruding` | 눈두덩 매트 음영 intensity +δ, 중앙 하이라이트 억제. 매트 마감 자체는 **레시피 층**(finish=matte 제안) — 핏=형태/배치, 레시피=색/질감 경계 유지 | R | 리서치 §9 (Milady 유력) |
| E-K3 | `eyeDepth=deepSet` | 눈꺼풀 중앙 밝게 +δ(신설 `eyeshadowCenterHighlight`), 어두운 크리스 감쇠 −δ | R | 리서치 §9 |
| E-K4 | `eyeCornerAperture` open/closed | 라이너 꼬리 방향 분기(위 리프트 vs 하강 평행) — **부호 미확정, 양방향 가설 기록**. 축은 `eyeCornerLift`(부호 허용 확인)·`eyelinerWingLength`·`eyelinerLowerTailTrace/Len` 재사용 | R | 리서치 §9. ⚠ 기각된 E-2(올라간 눈꼬리) 뒷문 재유입 금지 — tilt와 aperture는 별개 속성임을 검증 단계에서 분리 |
| W-3′ | `eyeContrast=low` | 라이너·어두운 섀도 intensity +δ(래시라인 대비 상향) | **C** | **A** (W-3) |
| 홍채 노출 | `irisExposure` 인사이트 낮음 | 라이너 밀착·얇게 + 중앙 강조로 또렷 | C | 리서치 신설 행 필요(E-3 인접·별개) |

### 3-3. 눈썹 (B계열)

| # | 발동 | 효과 | 카테고리 | 근거 |
|---|---|---|---|---|
| B-E11 | `brow.eyeGap` 좁음/넓음 | 좁음: `browExpandLower −δ`·`browArch +δ`·`browThickness −δ`(슬림으로 눈두덩 확보) / 넓음: `browExpandLower +δ` | R | **공백** — Milady Ch.8 확보 선행(§9). 축·밴드 완비라 통과 즉시 배선 |
| E-1′ | `eye.canthalTilt=down` | 기존 E-1에 눈썹 δ 추가: 꼬리 직선/사선 재작도(`browArch`) + 꼬리 연장(`browLength +δ`)으로 리프트 라인 지지 | R | B (E-1 미구현 부분) |
| B-1′ | `eye.spacing` × brow | 미간 좁음 → 앞머리 간격↑·바깥 연장(`browLength +δ` — 꼬리 방향 축이라 바깥 연장 즉시 가능) / 넓음 → 안쪽으로(⚠ `browLength`는 눈썹머리 고정이라 **안쪽 연장 불가** — 앞머리 위치 축은 여전히 후순위 신설 후보) | R | A(구조)/세부 공백 |
| B-F1 | `contour.faceShape` × brow | 긴 얼굴 → 수평 일자·가로 강조(`browLength +δ`·`browArch −δ`) / 둥근 → 아치 상향(`browArch +δ`) — B-1 얼굴형별 처방의 축 배선 | R | A(구조)/본문 공백 — Milady 본문 확보 시 활성(§9-2) |
| B-3′ | `browDensity=sparse` | 스트로크형 텍스처 + 앞머리 감쇠 — **레시피 층**. `browThickness`는 밀도 아닌 형태 축이라 여기 미사용 | — | B/C |

### 3-4. 입·눈밑 (L·T계열)

| # | 발동 | 효과 | 카테고리 | 근거 |
|---|---|---|---|---|
| L-P1 | `philtrumRatio=high`(인중 김) | 큐피드 보우 오버립 +δ — L-1과 같은 축, 발동 조건만 다름 | R | 리서치 §9 (K-뷰티 정례) |
| L-B1 | `lip.thicknessBalance` 불균형 | 얇은 쪽만 오버라인 — 상/하 분리 가중 축 신설(`lipOverlineUpper/Lower`) | R | L-1 계열 확장 — 대조 필요 |
| **L-2** | `lip.fullness=thin` × `cornerAsymmetry` | 규칙이 아닌 **교차 클램프**: 입꼬리 처짐 밴드에서 아랫입술 오버립 감쇠/0 | 제약 | **B** — 엔진에 "규칙 간 제약" 구조 1호 |
| T-1 | `darkCircles` mild/pronounced | 삼각존 커버 intensity +δ | **C** | 교과서 정례 — B급 유력(§9) |
| E-12′ | `aegyoSal=absent` | 애교 생성 δ(현재는 present→강조만) | R | 공백 — K-뷰티 원문(§9) |

### 3-5. 횡단(레시피 층 — 핏 시트 밖)

- W-4(A급) "눈>베이스>립" 지각 가중 — 부위별 intensity 기본 배분을 대비 관찰로 조정.
- 퍼스널컬러 색 축은 기존 `makeupColors` 경로 유지 — 핏과 분리.

## 4. 조절 축 신설 (Unity 셰이더+브리지+골드 축 등록, 프레임워크 재수출 필요)

| 축 | 범위 | 소비 규칙 | 우선순위 |
|---|---|---|---|
| `hairlineShade` | [-1,1] (+어둡게/−밝게) | V-1/2 — F-5 "부호 반전 단일 파라미터" 그대로 | 1 (A급) |
| `chinShade` | [-1,1] | V-4/5 | 2 |
| `eyelinerInnerExtension` | [0,1] | E-10 — 계약 v0.2 D-2/D-5 기정의 축 | 3 |
| `eyeshadowCenterHighlight` | [0,1] | E-8(가는 눈)·E-K3(함몰눈) 공유 | 4 |
| `lipOverlineUpper/Lower` | [0,1]×2 | L-B1·L-P1 (기존 `lipOverline` 분해) | 5 |
| `eyelinerVerticalOffset` | — | E-4 floating liner(테이블 기지목 신설 후보) | 후순위 |
| `eyeCornerLift` 부호 개방 | [0,x]→[-x,x] | E-K4 하강 꼬리 — 신설 아닌 범위 확장 | E-K4 확정 시 |

기존 축 재사용으로 충분한 규칙(V-3, F-1~4 일부, C-2~5, E-9, E-K1, W-3′, T-1, B-E11, L-P1)은 Unity 무변경.

### 4-1. gold 승격 (v0.2 신설 — Unity 무변경, RN 플래그만)

dev 병합(5d8e986a9)으로 `browThickness`(0.75~1.6)·`browLength`(0.65~1.6, 눈썹머리 고정·꼬리 방향)가 축으로 존재하나 **BROW_SHAPE_AXIS(룩 소관, gold 없음)** 에 있다. `applyFitToLayers`의 룰 델타는 gold 화이트리스트 강제라, 핏 규칙(B-E11·E-1′·B-1′·B-F1)이 쓰려면 gold 승격이 필요.

- **결정(구현 시 정정): `browLength`만 gold 승격.** `browThickness`는 lookStore `migrateBrowCoverageFitSheets`가 핏 룰의 browThickness를 레거시 대칭 굵기로 간주해 로드·저장마다 browExpand로 이관·삭제하므로, 승격 시 사용자 굵기 핏 델타가 조용히 증발한다 — 그 마이그레이션의 버전 가드 은퇴가 선행 조건. 룩/핏 경계("모양·굵기는 룩, 덮기는 내 핏") 논점은 다음으로 해소 — 핏 δ는 룩 파라미터 위 **가산+클램프**라 룩 선택을 대체하지 않고 미세 보정만 하며, 배수 축(fallback 1)이라 δ=0이면 완전 무변조. 사용자 수동 핏이 자동 시트를 이기는 기존 우선순위도 그대로.
- 아이라이너 길이는 승격 불요: `eyelinerWingLength`·`eyelinerLowerTailTrace/Len` 모두 이미 gold.
- ⚠ `eyelinerInnerLift`는 임시 디버그(계약 v0.2에서 deprecated) — 신규 매핑 사용 금지 유지.

## 5. 시트 수명주기 — 분석별 재생성

현행 문제: 생성이 AR 화면 마운트 시 1회뿐 — 분석 직후 무반응, AR 화면 체류 중 재분석 시 미갱신.

1. **트리거 이동**: 분석 잡 완료 → 리포트 매핑 성공 직후 `buildAnalysisFitSheet(report, lane)` 직접 호출(추가 fetch 없음) → 핏 라이브러리 저장. 시트에 `sourceReportId`·`styleLane`·`mappingVersion` 기록.
2. **단일 슬롯 유지**: id `fit-analysis` 고정, 이름에 분석 날짜("맞춤핏 · 7/24 분석"). 이전 핏 보존은 기존 시트 복제 경로로.
3. **AR 로드는 화해로 강등**: 저장 시트의 `sourceReportId` ≠ 최신 리포트 id일 때만 재생성. 실패·오프라인 시 마지막 시트 유지.
4. **자동 ★ ON**: 새 분석 핏 생성 시 메인 설정. 단 사용자가 분석 핏을 직접 껐던 명시 기록이 있으면 존중. → §7-4 계약 개정.

## 6. 레인 설계 — 시트 1장 + 레인 속성 + 규칙 카테고리

- **레인별 시트 3장 생성 안 함.** 근거: ① 시트는 (리포트, 레인)의 순수 파생물 — 3장 저장은 비정규화, 전환은 즉석 재계산(밀리초)로 충분. ② accent 시트는 현 정의상 텅 빔 — "핏 끔"과 구분 안 되는 혼란. ③ ★ 의미론이 3지선다로 쪼개지고 화해 로직 3배.
- **UI**: 핏 카드에 레인 세그먼트 칩(균형|동안|개성) + ★ 토글. 칩 전환 = 같은 슬롯 재계산 덮어쓰기. 추천룩 칩 패턴과 일관.
- **레인 선택은 사용자 취향으로 기억**(리포트 종속 아님) — 다음 분석 재생성도 마지막 레인으로.
- **규칙 카테고리**: `reshaping`(형태 보정 — 레인 게이트: balance=1, youthful=중안부 계열 1.6, accent=0) / `clarity`(다크서클 커버·대비 상향 등 결점·선명도 — 레인 무관 적용). **accent 재정의** = reshaping δ만 0, clarity 유지 — 세 레인이 "핏 둘 + 끔 하나"가 아닌 진짜 3선택지가 된다. `PersonalFitEntry.basis`에 category 필드 추가.

## 7. 버전·계약 정리

1. `FACE_FEATURE_BAND_MAPPING_VERSION` → `bands-v1` (thirds·eyeScale·aperture·philtrum 신설).
2. `PERSONAL_FIT_MAPPING_VERSION` → `fit-map-v1` 이후 리서치 통과분마다 `v1.x` 증분.
3. 시트 스키마에 `styleLane`·`category` 추가 — 기존 시트는 lane='balance'·category='reshaping'으로 마이그레이션.
4. **계약 v0.2 D-4/D-5 개정**: "자동 적용 기본 OFF"는 δ 크기 미검증 시절의 안전장치. 규칙 확장 후엔 "생성됐는데 무변화"가 더 큰 혼란 — 자동 ★ ON + 사용자 OFF 기록 존중으로 대체. δ 크기 자체는 여전히 실기기 튜닝 대상(방향·부호만 문헌 근거 원칙 불변).

## 8. 구현 단계 (의존성 순)

- **1단계 (Unity 무변경, 빠른 효과)**: §2-1 측정·밴드 신설 + F-1~4·C-2~5(얼굴형) + W-3′(대비) + V-3(중안부 짧음) + E-9 + E-K1(기존 축분) + §4-1 gold 승격(`browThickness`·`browLength`) + E-1′ 눈썹 δ + §5 재생성 배선 + §6 레인·카테고리 구조. 계약 러너 테스트 확장, `bands-v1`/`fit-map-v1`.
- **2단계 (백엔드)**: `eyeDepth`·`darkCircles` VLM enum + 프롬프트 + 프론트 계약·빌더. T-1 배선.
- **3단계 (Unity 축 신설)**: §4 우선순위 순(hairlineShade → chinShade → innerExtension → centerHighlight → lipOverline 분해). 셰이더+브리지+골드 축+재수출.
- **리서치 병행**: §9 통과분만 증분 반영.

## 9. 리서치 태스크 (검증 게이트 — 통과 전 엔진 진입 금지)

1. Milady Standard Makeup 눈모양 교정표 — 돌출눈(E-K2)·함몰눈(E-K3)·작은 눈(E-K1 보강). 교과서 정례라 B급 이상 유력.
2. Milady Ch.8 — 눈썹-눈 거리(B-E11), 눈썹 세부(B-1′), 얼굴형별 눈썹 처방 본문(B-F1 — `browLength`/`browArch` 배선 대기).
3. K-뷰티 아티스트 교육서 — 애교살(E-12′), 눈꼬리 개폐(E-K4 방향 부호), 인중 오버립(L-P1).
4. 다크서클 커버 처방의 교과서 근거(T-1).
5. 홍채 노출 → 라이너 처방 문헌.
6. E-K4 검증 시 canthal tilt(방향)와 corner aperture(개폐)의 속성 분리 명시 — E-2 재유입 방지.

## 10. 기각 유지 (재유입 방지)

- E-2 올라간 눈꼬리, L-3 입 폭, E-6 하안검 처짐 구분 처방, C-6 광대 랜드마크 규칙 — 테이블 §3 기각·공백 기록 존중, 본 확장에서 제외.
- 모든 δ 크기는 여전히 실기기 슬라이더 튜닝 — 문헌은 방향·부호까지만.

## 11. 자동 δ 안전 계층 (2026-07-25 신설)

실기기 증상 2건을 다중 에이전트 진단(재생성 배선·적용 의미론·필드 범위·Unity 렌더 4영역 병렬 + 회의적 반증)으로 원인 확정하고 고쳤다.

### 11-1. 자동 ★가 사용자 메인 시트를 빼앗던 문제 (확정·수정)
- **원인**: `persistAnalysisFitSheet`가 새 분석(sourceReportId 변경)일 때 이전 `store.mainId`를 보지 않고 무조건 `fit-analysis`를 메인으로 세웠다 — 사용자가 자기 수동 핏 시트를 ★로 켜뒀어도 새 분석이 그 선택을 빼앗아, 사용자 눈엔 "기존 핏이 덮어씌워진" 것으로 보였다(mainId는 단일 선택 + 미적용시 null).
- **수정**([personalFitLoad.ts](../../apps/mobile/src/features/ar/services/personalFitLoad.ts)): 자동 ★는 **메인 자리가 비어 있을 때만**(`store.mainId == null || === fit-analysis`) 들어간다. §5-4 정정 — 자동 ON의 대상은 "핏 미적용 상태"이지 "사용자의 다른 선택"이 아니다.

### 11-2. 자동 δ 의미적 상한 부재 (확정·수정)
- **원인**: `applyFitToLayers`의 필드 [min,max] 클램프만으로는 부족 — **슬라이더 범위 자체가 해부학 안전선을 넘는다**. 언더아이 블러셔 마스크는 lift 0에서 이미 눈 개구부(캐노니컬 v0.594)에 닿아, 슬라이더 최대 +0.08이면 마스크가 눈두덩~눈썹(v0.72)까지 올라간다("눈 위 섀도"). 또 판정 소스가 독립인 규칙들이 같은 필드에 누적된다 — `eyelinerLowerTailTrace`는 E-7(둥근 눈 +0.55)+E-K1(작은 눈 +0.4)이 "작고 둥근 눈"에서 함께 터져 0.95(슬라이더 95%)에 달해 룩 값을 삼킨다. `eyeshadowHeight`도 3규칙(hooded·openness low·scale low) 독립 동시 발동 +0.3.
- **수정**([autoFitBudget.ts](../../apps/mobile/src/features/ar/services/autoFitBudget.ts)): 부위별 합산 δ에 **필드별·방향별 예산(AUTO_FIT_BUDGET)**을 씌우는 순수 계층 신설. `buildPersonalFitBaseDeltas`가 `toFitEntries` 직후 `clampAutoFitEntries` 통과. 상한은 Unity 렌더 좌표 계산(FaceMakeup.shader·MaskGenerator·IrisRenderer·LowerLid) 기반 — 예: 블러셔 up 0.02/down 0.05(비대칭), tailTrace 0.55·tailLen 0.45(스택 봉인, 단일 규칙 효과는 보존), eyeshadowHeight 0.2. **눈-눈썹 간격 좁음**(`brow.eyeGap.band==='low'`)이면 눈썹 침범 위험이 커져 eyeshadowHeight 상한을 0.1로 재차등. 수동 핏은 이 경로를 안 타므로 WYSIWYG 불변. 계약 러너 테스트 `autoFitBudget.test.ts` 신설.

### 11-3. 반박된 가설 (재유입 방지 기록)
- 캐스케이드 덮어쓰기: `resolveLeafFit`은 필드별 first-match라 **다른 필드를 절대 지우지 않는다** — "새 축이 기존 축을 덮어쓴다"의 원인이 아니다(실코드 실행 확인). 실제 체감 원인은 11-1(★ 강탈)과 절대값 축 스택(11-2).
- `_BlushAffine.dy` 이중 누적(lift 0.15+dy 0.15=0.30): `REGION_FIT_TRAITS.blush`가 positionY를 affine이 아닌 `blushLift`로 배정해 블러셔 dy·sy는 구조적으로 0 강제 — 계약 밖 수제 페이로드로만 가능, 라이브 경로 도달 불가.
- blushShape 전환 시 lift/spread 시드: 카탈로그 값이 전부 0이라 캡 우회 불가 + "새 마스크가 옛 배치 안 물려받기"는 의도된 계약(테스트 존재).

### 11-4. 미해결 (후속 — 자동 채널 분리 전제)
- **shape 의존 완전 봉인**: 언더아이 등 잎의 `blushShape`를 알아야 하는 봉인(undereye면 up δ=0)은 순수 계층이 프로파일만 봐서 불가. 지금은 up 상한 0.02로 근사(0.08→0.02, "눈두덩 섀도"의 실질 원인 제거) — 완전 봉인은 자동/수동 채널 분리(계약 baseDeltas 경로 부활) 후 apply 층에서. C-1(중안부 김→고배치)의 완전한 시각 강도도 이 봉인 후에야 안전하게 키운다.
- **절대값 축 fill 시맨틱**: fallback 0 축(tailTrace 등)에서 "룩이 값을 정했으면 δ를 더하지 말고 채우기(max)"도 자동 채널 분리가 전제 — 지금은 스택 상한으로 완화만. 룩이 해당 축을 명시하는 경우가 드물어 실사용 영향은 낮음.
