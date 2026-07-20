# AURA 얼굴 특징 프로파일 계획 v0.1 — 부위별 유형 판정 + 시각 무게 지도

상태: 초안(v0.2 — 2026-07-21). 방향 합의됨(**전 부위 동시 커버** — 얼굴은 전체 조화이므로 눈만 먼저 보지 않는다는 사용자 결정으로 v0.1의 눈 우선 슬라이스를 대체. VLM 판정 병행, 지식 테이블은 딥리서치 초안 → 검수). δ·밴드 경계·테크닉 행은 전부 미확정.
작성 배경: 보고서 분석 깊이 부족 — 눈만 해도 눈꼬리 방향 외에 상/하안검 처짐 구분, 쌍꺼풀 유형, 눈 세로:가로, 눈썹-눈 거리별 테크닉 분기가 없음. 부위 간 "시각 무게" 합성 레이어도 부재. 인상(impression) 서술이 약한 근본 원인 = 구조화 입력 없이 LLM 자유서술에 의존.
관련 문서: [AR맞춤핏 계약 v0.2](./AR맞춤핏-계약초안-v0.md) · face-geometry 16지표(`apps/mobile/src/features/face-geometry/types.ts`) · 자기참조 축(`apps/mobile/src/features/face-report/reportFeatureAxes.ts`)

---

## 1. 3층 모델

```
1층  부위별 구조화 속성      ── 수치 밴드(기존 16지표) + 사진 판정 enum(VLM, confidence 필수)
2층  시각 무게 지도          ── 부위 간 자기참조 합성: {brow, eye, cheek, lip} 우세 분포 + 근거
3층  전략(테크닉 매핑)        ── 지식 테이블(속성×밴드 → 테크닉/파라미터 방향, 근거 등급) → 보고서 서술 + AR 델타
```

- **자기참조 원칙 유지**: 모집단 norm·절대강도("큰 눈") 금지. 1층 밴드는 방향(수평 0° 대비)·자기 부위 간 비율만, 2층은 내 얼굴 안 상대 우세만. (글로벌 앱 원칙)
- **LLM 역할 축소**: 유형 판정은 1층(수치=결정적, 사진=enum+confidence), 테크닉 선택은 3층 테이블이 하고, LLM은 **선택된 결론을 문장으로 서술**만 한다. 인상 서술도 1·2층 구조화 입력을 받아 근거 기반으로 생성.

## 2. 1층 — 부위별 구조화 속성 (전 부위)

### 2.1 수치 밴드 (기존 faceGeometry2d 16지표 + 세로3분할 + faceAnalysisV2 파생 재사용, 신규 측정 없음)

| 부위 | 속성 | 원천 지표 | 밴드(잠정) |
|---|---|---|---|
| 눈 | 눈꼬리 방향 | `canthalTiltL/R` | 내려감 / 수평 / 올라감 (±기준 각도 잠정) |
| 눈 | 눈 개방(세로) | `eyeOpennessL/R` | 자기 눈 가로 대비 비율 밴드 |
| 눈 | 눈 가로 비중 | `eyeWidthRatioL/R` | 얼굴 폭 대비 자기참조 밴드 |
| 눈 | 눈 사이 거리 | `interCanthalRatio` | 좁음 / 중간 / 넓음 (눈폭 상대) |
| 눈썹 | 눈썹-눈 거리 | `eyeBrowGapL/R` | 좁음 / 중간 / 넓음 |
| 눈썹 | 눈썹 산 위치 | `browApexRatioL/R` | 안쪽 / 중앙 / 바깥 |
| 눈썹 | 눈썹 기울기 | `browSlopeL/RDeg` | 하강 / 수평 / 상승 |
| 립 | 입술 두께 | `lipThicknessRatio` | 얇음 / 중간 / 도톰 (자기 입폭 상대) |
| 립 | 입 폭 | `mouthWidthRatio` | 좁음 / 중간 / 넓음 |
| 립 | 입꼬리 방향 | `mouthCornerAsymmetry` + 방향 | 처짐 / 수평 / 올라감, 좌우 차 |
| 윤곽 | 턱/하관 폭 | `jawWidthRatio` `lowerJawWidthRatio` | 좁음 / 중간 / 넓음 |
| 윤곽 | 세로 비율 | 세로3분할(상/중/하안부) | 각 부 짧음 / 균형 / 김 |
| 윤곽 | 얼굴형 | `faceAnalysisV2.derived.faceShape` | 기존 파생 재사용 |
| 공통 | 좌우 비대칭 | L/R 차이 | 유의 차 있음/없음 (있으면 좌우 개별 서술) |

밴드 경계는 AR맞춤핏 계약 §9와 동일하게 자체 분포(mean±SD) 확정 전까지 잠정 + `mappingVersion` 명시.

### 2.2 사진 판정 enum (VLM — 기존 분석 LLM 호출에 구조화 출력 추가)

| 부위 | 속성 | enum(잠정) | 비고 |
|---|---|---|---|
| 눈 | 쌍꺼풀 유형 | `monolid / inner / outer / hooded / unclear` | 랜드마크로 불가 — 사진 필수 |
| 눈 | 상안검 처짐 | `none / mild / pronounced / unclear` | hooding — 아이라인 기법 분기 핵심 |
| 눈 | 하안검 처짐 | `none / mild / pronounced / unclear` | 상안검과 별개 판정 |
| 눈 | 애교살 | `present / absent / unclear` | |
| 눈썹 | 숱/밀도 | `sparse / medium / dense / unclear` | 채우기 기법 분기 |
| 볼 | 광대 위치 | `high / mid / low / unclear` | 블러셔 위치 분기 |
| 볼 | 볼 볼륨 | `flat / medium / full / unclear` | |
| 립 | 혈색 대비 | `low / medium / high / unclear` | 컬러 강도·질감 분기 |
| 피부 | 질감/윤기 분포 | 기존 `skinPerception` 9부면 재사용 | 신규 판정 아님 — 베이스 마무리 분기 입력 |
| 공통 | 부위 선명도/대비 | 부위별 `low / medium / high` | 2층 시각무게 입력 |

규약: 모든 enum에 `confidence` + `evidence`(한 줄 근거) 필수. `unclear` 또는 낮은 confidence → **해당 속성 생략**(0으로 치지 않음 — AR맞춤핏 §6-3과 동일한 provenance 오염 방지). 정본 원칙(수치 비노출, 없는 값 지어내지 않음) 그대로.

## 3. 2층 — 시각 무게 지도 (신설)

```ts
type VisualWeightMap = {
  version: 'aura-visual-weight.v0';
  // 합계 1.0 정규화 — 내 얼굴 안 상대 우세만 의미
  weights: {brow: number; eye: number; cheek: number; lip: number};
  dominantRegion: 'brow' | 'eye' | 'cheek' | 'lip' | 'balanced';
  contrastLevel: 'low' | 'medium' | 'high';   // 이목구비 전반 대비 → 인상(부드러운↔또렷한) 근거
  basis: string[];                             // 어떤 1층 속성이 기여했는지 추적
};
```

- 산출: 기하 기여분(자기참조 비율 — 입술 두께비, 눈 개방 등)은 결정적 합성, 대비 기여분은 VLM 판정. 합성 가중치는 잠정 → 리서치·검수 후 확정.
- 소비: (a) 보고서 인상 섹션 근거, (b) 추천 LLM에 "강조 배분" 입력(우세 부위 극대화 vs 균형 보정 두 룩 제안), (c) AR 룩 기본 intensity/opacity 배분.

## 4. 3층 — 지식 테이블 (딥리서치 산출물 반영: [측정→테크닉 매핑 테이블 v0](./AURA_MAKEUP_TECHNIQUE_TABLE_KO_v0.md))

형식은 AR맞춤핏 계약 §4 행 추가 규칙 준용: **근거 등급(A: 미용학/교재, B: 저명 아티스트 교육 콘텐츠, C: 업계 통념) 없는 행 금지 · 잠정/확정 상태 표기 · 개정은 mappingVersion 증가로만.** 상충 유파는 테이블 §0.5 캐스케이드(등급 → 측정 밴드 조건 분기 → 보수 기본값+선택지)로 판정.

### 4.1 스타일 레인 3종 (2026-07-21 확정)

매핑 엔진은 `deriveFitDeltas(profile, styleLane)` — 동일 측정 프로파일에서 세 가지 핏을 생성한다:

- `balance` (균형 보정형, 기본값): 본인 최대 편차 완화 방향, δ 소량, 고정 목표비율 없음
- `youthful` (동안형): 중안부 축소 계열 규칙 활성 — K-뷰티 명명 스타일 옵션, 글로벌 기본값 승격 금지
- `accent` (개성 강조형): 2층 `dominantRegion`의 형태 보정 δ = 0(교정하지 않음 — 개성 보존), 대신 해당 부위의 색·대비·intensity를 올리고 타 부위는 절제 (W-4 눈>립 가중·W-5 원포인트 근거. 보정 δ 부호 반전은 금지 — 편차를 인위적으로 키우는 렌더가 되어 위험)

보고서/추천의 룩 제안도 이 3레인 병렬 — 기존 `stylingLooks`(natural/glam 2종) 그릇을 3레인 구조로 확장하거나 병존시킨다(스키마 결정은 구현 시).

| # | 속성 | 밴드 | 보고서 서술 방향 | AR 파라미터 시사점 | 근거 | 상태 |
|---|---|---|---|---|---|---|
| (딥리서치 보고서 확정 후 채움 — 예: hooded × 아이라인 → 골드 축 `eyelinerThickness`/`eyelinerWingLength` 델타 방향) | | | | | | |

## 5. 배선 — 기존 그릇 재사용

- **보고서**: 눈 섹션에 1층 속성 카드(판정 보류 = 섹션 숨김) + 2층 무게 스펙트럼. 기존 S3 자기참조 축 렌더 관례 재사용.
- **AR 핏(모양)**: 3층 테이블 행 → AR맞춤핏 계약 `PersonalFitEntry`(basis에 metric/band/mappingVersion 기록). 잠들어 있는 v0.2 그릇을 그대로 깨움 — 스텐실 레인, 수동 우선, 클램프 규약 무변경.
- **AR 룩(강조)**: 2층 `weights` → 룩 타깃의 부위별 intensity/opacity 기본값 (추천→AR 계약 통일 작업과 합류).
- **추천 LLM**: 1·2층 구조화 프로파일을 프롬프트 입력에 추가 — 인상·가이드라인 서술 품질 개선의 본체.

## 5.5 구현 현황 (2026-07-21)

- ✅ **1층 계약 + 결정론 밴드 판정** — 순수함수, 신규 측정 없음, 테스트 통과.
  - 계약: `apps/mobile/src/shared/contracts/faceFeatureProfile.ts` (밴드 enum, VLM enum, `MeasuredBand`/`VlmObservation` 슬롯, schema/mapping 버전 분리)
  - 판정: `apps/mobile/src/features/face-analysis/services/faceFeatureProfileDerive.ts` (`deriveMeasuredFeatureBands`) — faceGeometry2d 16지표 + 세로3분할 + faceShape 라벨 → 밴드. VLM 슬롯은 전부 null(백엔드가 채움).
  - 테스트/러너: `faceFeatureProfileDerive.test.ts` + `scripts/mobile/run-face-feature-profile-contract.mjs` (`npm run test:face-feature-profile`)
  - 정직성 장치: 지표 없으면 `band=null`(판정 보류), 각 밴드에 `calibration`(`self-referential` vs `provisional-population`) 태그로 아직 모집단 기준선이 필요한 밴드(눈 개방·눈썹-눈 거리·입 폭·하악 폭)를 구분. verticalBalance는 upper 없으면 over-claim 방지로 보류. 입꼬리는 비대칭(좌우)만 판정하고 '전체 처짐'은 지표 부재로 미판정.
- ✅ **VLM enum 백엔드 연결 + 프로파일 조립** — 백엔드·모바일 배선 완료, 테스트 통과.
  - 백엔드: `openai_analysis.py`에 6번째 팬아웃 레그 `feature` 추가 — `featureObservations`(8부면: eyelidType·상/하안검·애교살·눈썹숱·광대위치/볼륨·립대비, 각 `{value, confidence, evidence}`, `unclear` 허용). 스키마·드리프트가드·지시문·머지·필드가이드 배선. 저장은 기존 `result` 패스스루(allowlist 없음). 드리프트가드 import 통과 + 분석 테스트 36개 회귀 없음.
  - 모바일: `FaceAnalysisReport.featureObservations` 타입(순수 계약에 정의, faceAnalysis.ts 재수출로 RN 무의존 유지) + `parseFeatureObservations` 어댑터. `faceFeatureProfileBuilder.ts`의 `buildFaceFeatureProfile`이 측정 밴드 + VLM 슬롯을 조립하며 **생략 규칙**(unclear·enum 밖·confidence<0.5 → 슬롯 null) 적용 — 1층과 연결. 계약 테스트 + 모바일 타입체크 0 에러.
- ✅ **2층 VisualWeightMap 산출** — 부위별 대비 → 부위 간 우세 분포. 테스트 통과.
  - 백엔드: feature 레그에 `eyeContrast`·`cheekContrast` 추가(lip은 lipColorContrast, brow는 browDensity 프록시) — 4부위 대비 완성. 계획 §2.2의 "부위별 대비 = 2층 입력" 이행.
  - 계약: `shared/contracts/visualWeightMap.ts` (weights 합1.0·dominantRegion·contrastLevel·coverage·basis, schema/mapping 버전 분리).
  - 합성: `features/face-analysis/services/visualWeightMap.ts`의 `buildVisualWeightMap(profile)` — 대비 서수(low1/med2/high3)를 근거 있는 부위끼리만 정규화. 미해소 부위는 키 없음(0 아님), 근거<2면 dominant='insufficient'(over-claim 방지), 팽팽하면 'balanced'. 눈썹은 density 프록시라 basis에 명시.
  - 검증: 계약 테스트 3종(derive/builder/visualWeightMap) + 백엔드 36개 + 모바일 타입체크 0 에러.
- ✅ **보고서 반영(S6 인상 섹션에 2층 주입)** — 데이터·프레젠테이션·렌더 배선, 테스트 통과.
  - 어댑터: `buildReportDataFromFaceAnalysisReport`가 geometryMetrics+verticalThirds+featureObservations로 프로파일→무게지도→프레젠테이션을 조립해 S6에 주입. 근거 부족이면 프레젠터가 null → 블록 숨김(조용한 생성 금지).
  - 프레젠터: `face-report/visualWeightPresentation.ts`(순수) — 무게지도 → 부위 막대(정렬·우세 강조) + 대비→인상 문구(W-2). 프레젠테이션 타입은 순수 파일에 두고 reportTypes가 재수출(RN 전이 의존이 계약 러너로 새지 않게).
  - 렌더: `sections/S6Impression.tsx`에 시각 무게 블록(부위별 % 막대 + 우세/대비 문구) 추가.
  - derive의 metrics를 옵셔널화(2층은 관찰만으로도 성립).
  - 검증: 계약 테스트 4종(derive/builder/visualWeightMap/presenter) + face-report 러너 무회귀 + 모바일 타입체크 0 에러. ⚠️ 실기기 시각 렌더는 미검증(분석 플로우 필요).
- ✅ **S3 부위 카드에 1층 상세 반영** — 쌍꺼풀 유형·상/하안검 처짐·애교살·눈썹 숱·볼·입술 대비 등 VLM 판정을 부위별 칩으로. 판정된 것만(unclear·저confidence·'무난/없음'은 생략). `face-report/regionFeatureDescriptors.ts`(순수) + `sections/S3Features.tsx` 렌더. 계약 테스트 통과.
- ◻️ **매핑 엔진 `deriveFitDeltas(profile, styleLane)` — 순수 코어 완료, 라이브 배선 미완**.
  - 계약: `shared/contracts/personalFitProfile.ts` (PersonalFitEntry/Profile, StyleLane, `toFitEntries` strip→병합). AR맞춤핏 v0.2 §3.
  - 엔진: `features/ar/services/deriveFitDeltas.ts` — 리서치 테이블 B등급 방향 규칙만(처진 눈꼬리→윙·눈꼬리 리프트, hooded→가짜 크리스 높게+라인 얇게, 무쌍→윙 연장, 둥근/가는 눈→가로/세로 반전, 애교살→강조, 중안부 김→블러셔 고배치). **방향·부호만 문헌 근거, δ 크기는 잠정.**
  - 안전장치: `deltaScale` 기본 0 = **자동 적용 OFF**(계약 D-4/D-5). 구조·근거(basis)는 산출되되 실제 δ=0. accent 레인은 형태 보정 δ=0(개성 보존). 신뢰 밴드 없으면 행 생략(δ=0 아님).
  - 배선 지점: `applyFitToLayers(layers, state, baseDeltas)`의 **`baseDeltas`가 이미 계약이 말한 측정 자동 시트 주입점**(최하위 우선순위·가산·field 범위 클램프). toFitEntries 출력을 여기 넣으면 됨.
  - ⬜ **남은 것(실기기 필요)**: AR 필터 진입점에서 프로파일 조립→deriveFitDeltas→baseDeltas 배선 + 슬라이더 실험으로 축별 non-zero δ 승인(deltaScale>0). 이 저장소에서 시각 검증 불가라 device 작업으로 분리.
  - 검증: 계약 테스트(deriveFitDeltas) + 모바일 타입체크 0 에러.

## 6. 구현 범위 (합의됨 — v0.2에서 전 부위로 확장)

1. **1층 전 부위 동시**: 수치 밴드(§2.1) + VLM enum(§2.2) — 얼굴은 전체 조화이므로 부위별 순차 확장 대신 프로파일은 처음부터 전 부위를 담는다. 지식 테이블도 전 부위 리서치(1/2 눈+시각무게, 2/2 눈썹·립·볼·베이스/윤곽) 기반으로 작성.
2. **2층 무게 지도 v0**: 전 부위 1층 입력으로 산출 — 부위가 다 있어야 의미 있는 층이므로 전 부위 전제와 정합.
3. **보고서**: 부위별 섹션 + 인상 섹션에 반영.
4. **AR 핏 델타는 검증 게이트만 소수 선행**: 계약·직렬화는 전 부위 분이 들어가되, non-zero δ 활성화는 실기기 시각 검증을 통과한 축부터 점진 개방(AR맞춤핏 §7 D-5 관행 준수 — 예: hooded → 아이라인 두께/윙, 얼굴형 → 블러셔 각도).

## 7. 오픈 퀘스천

- VLM enum의 confidence 임계값 — 실측 없이 잠정치로 시작, 오판정 샘플 수집 후 조정
- 2층 합성 가중치(기하 vs 대비) 초기값
- ~~균형 보정형 vs 개성 강조형 병렬/택일~~ → **해소**: §4.1 스타일 레인 3종 병렬 제공으로 확정.
- ~~3레인 생성 시점~~ → **해소(2026-07-21)**: 기본 `balance` 먼저 생성, `youthful`/`accent`는 탭 전환 시 지연 생성.
- 사진 판정을 분석 1회 호출에 합칠지(지연·비용) 별도 경량 호출로 분리할지
