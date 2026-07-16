# 얼굴 측정·분석 개선 계획 (2026-07-16)

상태: 초안 — 팀 검토 대기
브랜치: `fix/face-analysis-report-0716` (Phase 0 구현 대상)
작성 배경: 얼굴 길이/비율 측정의 정확도 검토 세션(2026-07-16) 결론 종합

---

## 0. 문제 정의 — 현재 상태 진단

현 측정 파이프라인을 검토한 결과, 문제는 측정 자체보다 **기준값과 표현 계층**에 있다.

| # | 발견 | 위치 | 심각도 |
|---|---|---|---|
| 1 | `FACE_LENGTH_REFERENCE`(1.351/1.455/1.506) 출처 불명 — 스펙 문서에도 "하드코딩"으로만 기록 | `FaceVerticalThirdsScreen.tsx:53`, 스펙 §4.5 | 높음 |
| 2 | 게이지 눈금 라벨과 마커 좌표가 **서로 다른 상수 세트**(1.351/1.455 vs 1.28/1.56)로 렌더링 — 한쪽 수정 시 어긋남 | `FaceVerticalThirdsScreen.tsx:131` | 높음 |
| 3 | `AVERAGE_DISPLAY_RATIO`(1:1:0.8)도 출처 주석 없음 | `faceVerticalThirdsMath.ts:10` | 중간 |
| 4 | pitch는 게이트(≤12°)만 있고 보정 없음 — 문서화된 잔여 오차 2~4%p가 세로 3분할 기준으로만 평가됨. 얼굴 길이비(세로÷가로)는 약분이 안 되어 이 오차가 그대로 실리는데 게이지 눈금 폭(0.28) 대비 유의미 | `facePoseGates.ts` 주석 | 높음 |
| 5 | MediaPipe가 주는 z좌표를 비율 계산에서 버리고 있음 (pitch/yaw 3D 정렬 미사용) | `faceRatioAnalyzerNative.ts:22` | 중간 |
| 6 | 측정 내부값(무차원 비율, px, Lab 등)이 범위·방향·단위 설명 없이 노출 — 팀 내부에서도 해석 불가 | `MeasurementDetailSection.tsx` | 중간 |
| 7 | 신고전 캐논(3분할 균등)은 문헌상 규범 기준으로 무효 — 한국계 표본에서 충족률 4.2% (Choe 2004) | 제품 전제 | 높음 |

측정이 견고한 부분: 세로 3분할(동일 축 비율이라 스케일 약분), roll 보정(게이트+보정 완비), Face3D Tier-2(3D 정점 거리 + 30프레임 median/MAD — 원근·포즈 왜곡 원리적 부재).

## 1. 설계 원칙

1. **측정과 해석의 분리.** 측정 계층은 "정확하고 재현되는 물리량"만 책임진다. 사용자에게 말을 거는 것은 전부 지각 번역 계층이다.
2. **3D(TrueDepth)가 측정의 신뢰 축.** 원근·포즈 왜곡이 원리적으로 개입 불가. 2D는 z좌표 포즈 정규화로 보강한 폴백.
3. **지각이 해석의 축.** 메이크업은 실제 기하가 아니라 지각을 바꾸는 기술(shape-from-shading 응용)이므로, 최종 출력은 "실측 대비 편차 판정"이 아니라 "지각적 특징 서술 → 기법 추천".
4. **측정 수치는 사용자 비노출.** mm·비율 원시값은 내부 저장·검증 전용.
5. **기준값 의존 최소화.** 자기 얼굴 내부의 상대 비교를 기본으로 하고, 인구 기준은 한국인 실측 분포로만(신고전 캐논·황금비 금지).
6. **근거 없는 인상 서술 금지.** 지각 번역 매핑의 모든 행에 근거 등급(§5)을 달고, 등급에 따라 어조를 강제한다.

## 2. 목표 아키텍처

```
[촬영] → [측정 계층] → [지각 번역 계층] → [보고서/추천]
          · TrueDepth 3D 우선        · 측정값 → 인상 서술        · 숫자 비공개
          · 2D+z 포즈 정규화 폴백    · → 기법 추천 매핑          · 특징+기법 언어
          · mm 내부 저장(검증용)     · 근거 등급별 어조 규칙      · 경계값 히스테리시스
```

## 3. 단계별 계획

### Phase 0 — 표현 정직화 (이번 브랜치, 측정 로직 무변경)

1. **기준 상수 3벌 통합**: `FACE_LENGTH_REFERENCE` + 게이지 마커 min/max + `AVERAGE_DISPLAY_RATIO`를 `face-ratio/constants.ts` 단일 모듈로. 게이지 라벨·마커가 같은 스케일에서 파생되도록 렌더링 수정. 각 값에 "출처 불명 잠정값 — Phase 4에서 교체" 주석.
2. **판정 완화**: 경계 버퍼(현 ±0.02)를 pitch 12° 허용이 만드는 오차폭 기준으로 재산정. 경계 구간은 단정 대신 유보 표현("평균~세로형 사이"). 소수 3자리 노출 제거.
3. **문구 구조 전환 1차**: 판정형 제목("평균보다 하안부가 긴 얼굴") → 특징 서술형("하안부에 시선 비중이 실리는 인상") 매핑 테이블 자리 마련. 문구 확정은 팀 검토 후.
4. **회귀 테스트**: `calculateVerticalThirdsRatio`·게이지 로직 커버 추가 (현재 없음).

**관문**: 사용자 화면의 모든 숫자에 출처 또는 유보가 있다.

### Phase 1 — 2D 측정 강화: z좌표 포즈 정규화

1. MediaPipe 478점 `{x,y,z}` + pose 행렬 역회전으로 랜드마크를 정면 자세로 3D 정렬 후 H/G/Sn/Me·얼굴 길이 계산. 현행 roll 2D 회전을 pitch/yaw 포함 3D 정렬로 대체. (MediaPipe z는 스케일 추정치지만 비율 계산에서 약분되므로 충분.)
2. 보정 후 잔여 포즈 각도를 confidence에 반영 → Phase 0의 경계 유보와 연결.
3. **촬영 거리 문제 인지**: 30cm 셀피는 1.5m 대비 코 밑너비를 ~30% 과장(Selfie Effect, §5 A-8). 포즈 정렬로는 원근(거리) 왜곡이 완전 제거되지 않으므로, 거리 가이드 UX 또는 TrueDepth 거리 보정을 Phase 2와 연계 검토.

**관문(핵심 검증)**: 팀원 3~5명 × 다양한 각도·거리 10회 촬영 → 동일인 측정값 분산(MAD)이 보정 전 대비 감소. *정답 일치가 아니라 test-retest 재현성이 1차 지표.*

### Phase 2 — TrueDepth 확장: 신뢰 축 이동

1. **Face3D 파이프라인에 얼굴 길이비·세로 3분할 대응 지표 추가** — 기존 semantic map 승인 파이프라인(후보 map → 오프라인 진단 → 승격) 그대로 통과.
2. **헤어라인 예외**: 머리카락은 IR 흡수로 TrueDepth가 못 잡음 → H만 Apple hair matte와 융합하는 하이브리드.
3. **mm 병렬 저장**: `faceScale` 정규화 전 원시 거리를 `unit: 'mm'`로 내부 저장(스키마 `unit` 필드 기존재, 하위 호환). 사용자 비노출.
4. **오차 프로파일**: 캘리퍼/자 실측 대비 부위별 오차 측정(눈 사이 거리·얼굴 폭 등 큰 치수부터). 산출물 = 부위별 신뢰 가능/불가 목록. 문헌 기대치: 표면 편차 ~0.4mm, 거리 측정 오차 0.88~9.07%(각도 의존) (§5 C-1).
5. **2D/3D 이중 경로 정책**: 동일 지표 충돌 시 TrueDepth 우선, 폴백은 confidence 하향, 결과에 `source` 명시.

**관문**: 부위별 mm 오차 프로파일 문서 존재.

**mm 응용 로드맵(검증 후)**: PD 기반 안경 맞춤(문헌상 최우수 앱 오차 ~0.51mm로 임상 허용 범위, §5 C-2) → 렌즈 직경(HVID: RGB 측정 + depth 스케일 하이브리드) → 뷰러 곡률(요구 정밀도 최고, 실측 검증 선행). mm 노출 시 지역별 의료기기 규제 경계 확인.

### Phase 3 — 지각 번역 계층 (제품의 본체)

1. **매핑 테이블**: `측정 특징 → 지각 서술 → 메이크업 기법` 3열 + `근거 등급` 열. 근거 없는 행 금지.
2. **근거 등급별 어조 규칙** (§5의 강도 평가에 따름):
   - **A급(strong)** — 단정 서술 허용: 음영→깊이 지각(컨투어링 원리), 눈 메이크업 착시(정량 ~5%, Morikawa), 페이셜 컨트라스트→나이·성별 지각(Russell 연구군), 이목구비 배치→매력 지각(Pallett 2010)
   - **B급(medium)** — 조건부 서술("~해 보일 수 있어요"): 앞머리→이마 노출 감소, 명도 대비→시선 유도
   - **C급(업계 관행)** — 제안형 서술("아티스트들은 ~을 권해요"): 블러셔 위치→얼굴형 인상 (직접 검증 논문 not found — §5 A-6)
3. **착시 효과의 정직한 스케일**: 문헌상 얼굴 기하 착시의 최대 크기는 ~5% 수준(Morikawa). "극적 변화" 서술 금지, "미세하지만 지각 가능한 조정"으로.
4. **정면 한정 명시**: 컨투어링 효과는 주로 정면 뷰에 국한(§5 A-2) — 추천 문구에 반영.
5. **표준 관찰 거리 재투영** (후순위): 3D 메쉬를 1.5m 관찰 거리 투영으로 렌더링해 "타인이 보는 비율" 산출. Selfie Effect 간극을 메우는 장치. Phase 2 안정 후.
6. **지각 타당성 검증**: 매핑 분류와 사람 지각의 상관 확인(팀 내부 → 베타).

**관문**: 모든 인상 서술 행에 근거 링크와 등급이 있다.

### Phase 4 — 기준값: 한국인 문헌으로 부트스트랩, 자체 분포로 수렴

당초 "외부 norm 배제" 방침을 수정한다 — 리서치 결과 한국인 계측 자원이 실재함이 확인됨:

1. **부트스트랩(단기)**: 한국인 계측 연구(Choe 2004, 한국 성인 두부계측·3D 사진계측 연구군, §5 B) + **Size Korea**(국가 인체치수조사 — 머리·얼굴 3D 계측 데이터 공개, 8차 조사까지 갱신)에서 잠정 기준 밴드 도출. 단, 각 자원의 랜드마크 정의가 우리 파이프라인(MediaPipe/ARKit 인덱스)과 일치하는지 **항목별 매핑 검증 필수** — 불일치 항목은 도입하지 않는다.
2. **수렴(장기)**: 우리 파이프라인으로 측정된 사용자 분포 축적 → 백분위 기반 상대 위치로 전환. 측정 조건이 동일하므로 계통 편향 없는 유일한 기준.
3. **이론적 뒷받침**: "매력적 비율 = 모집단 평균 비율"(Pallett 2010) + "한국인 얼굴은 서구 캐논 불충족"(Choe 2004)의 결합이 "한국인 실측 분포를 기준으로 삼는다"는 결정의 근거 사슬. 서구 기준·황금비·신고전 캐논은 도입 금지.

## 4. 순서·의존성

- Phase 0: 즉시 (이번 브랜치).
- Phase 1 ↔ 2: 독립적이라 병렬 가능하나 단일 인력이면 1 먼저 — 전 기기 효과 + 검증 프로토콜(재현성 측정)을 2에서 재사용.
- Phase 3 매핑 테이블: 코드 독립적 — 기획이 지금부터 병렬 시작 가능. 근거 자료는 §5 완비.
- Phase 4-1(부트스트랩): Phase 3 매핑에 기준 밴드가 필요해지는 시점에. 4-2는 데이터 축적 시간.

## 5. 근거 자료 (2026-07-16 리서치, 근거 강도 평가 포함)

### A. 지각 효과·메이크업 착시

| # | 주장 | 핵심 출처 | 강도 |
|---|---|---|---|
| A-1 | 음영 패턴만으로 3D 형태·깊이를 지각(어두움=후퇴, 밝음=돌출) — 컨투어링의 원리 | Todd & Mingolla 계열, shape-from-shading 심리물리학 ([Springer](https://link.springer.com/content/pdf/10.3758/BF03206757.pdf), [JoV](https://jov.arvojournals.org/article.aspx?articleid=2513380)) | strong |
| A-2 | 컨투어/하이라이트가 지각된 얼굴 형태 변화 — 단 효과는 주로 정면 뷰 | [Plastic Surgery Key 챕터](https://plasticsurgerykey.com/the-effects-of-contour-and-highlighting-makeup-on-the-perception-of-facial-form/) | weak~medium |
| A-3 | 눈 메이크업은 델뵈프 동화 착시로 지각 눈 크기 ~5%↑, 얼굴 착시 최대 규모도 ~5% | Morikawa et al. 2015 ([Frontiers](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2015.00139/full)), 2019 시점불변 재현 | strong |
| A-4 | 앞머리→이마 가시 면적 감소→세로 비중 낮아 보임 (정량화 논문 not found) | [인상 형성 연구 2024](https://www.researchgate.net/publication/387571268) + 기하학적 가림 논리 | medium |
| A-5 | 이목구비 배치만 바꿔도 매력 지각 변화; **이상 비율 = 모집단 평균 비율** | Pallett, Link & Lee 2010, Vision Research ([ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0042698909005045)) | strong |
| A-6 | 블러셔 위치→얼굴형 인상 (직접 검증 논문 **not found** — 업계 관행) | [Newsweek 데모](https://www.newsweek.com/blush-placement-changes-face-shape-1886096), 간접: [지역 대비 연구](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.02448/full) | weak |
| A-7 | 페이셜 컨트라스트(눈·입·눈썹 대비)↑ → 더 여성적·젊게 지각, 교차문화 재현. 화장품이 이 대비를 증폭 | Russell 2009 ([Perception](https://journals.sagepub.com/doi/10.1068/p6331)), Porcheron 2013·2017 | strong |
| A-8 | **Selfie Effect**: 30cm 셀피는 1.5m 대비 코 밑너비 ~30% 과장 (기하 모델) | Ward, Ward, Fried & Paskhover, JAMA Facial Plast Surg 2018;20(4):333-335 ([PubMed](https://pubmed.ncbi.nlm.nih.gov/29494735/)) | medium~strong |
| A-9 | 수직-수평 착시(수직선 ~30% 과대지각)·fat-face illusion 존재. 메이크업 라인 방향 적용 검증은 not found | [Sun 2012](https://pubmed.ncbi.nlm.nih.gov/22611669/), Tomonaga 2015 | 착시 자체 strong / 적용 not found |

### B. 한국인 계측 norm

| # | 주장 | 핵심 출처 | 강도 |
|---|---|---|---|
| B-1 | 한국계 여성의 신고전 캐논(중안=하안) 충족률 4.2% — 서구 템플릿 부적합 | Choe et al. 2004, Arch Facial Plast Surg | strong~medium |
| B-2 | 한국 성인 facial index·연조직 계측 norm 연구군 존재 (남>여 세로 경향 등) | [1989 두부계측](https://pubmed.ncbi.nlm.nih.gov/2750721/), [2013](https://pubmed.ncbi.nlm.nih.gov/23714934/), [2021 3D 사진계측](https://pmc.ncbi.nlm.nih.gov/articles/PMC7875215/) | strong |
| B-3 | **Size Korea에 머리·얼굴 3D 계측 데이터 실재** (8차 조사까지), 통합분석 논문도 존재 | [sizekorea.kr/measurement-data/head](https://sizekorea.kr/measurement-data/head), [전은경·문지현 2018](https://koreascience.kr/article/JAKO201811459665553.pdf) | strong |

### C. 깊이 센서 정확도

| # | 주장 | 핵심 출처 | 강도 |
|---|---|---|---|
| C-1 | ARKit 얼굴 거리 오차 0.88~9.07%(각도 의존); TrueDepth 표면 편차 평균 0.387±0.361mm | [Sensors 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10181530/), [EM3D vs CBCT 2024](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11592646/) | medium~strong |
| C-2 | 스마트폰 PD 측정 최우수 앱 오차 ~0.51mm — 단초점 안경 임상 허용 범위 | [Cureus 2023](https://pubmed.ncbi.nlm.nih.gov/37529827/) | medium |

## 6. 리스크·미해결

1. **ARKit 메쉬의 모델 피팅 편향** — 애플 메쉬는 형태 모델 피팅 결과라 개인별 계통 편향 가능성(미검증 가설). Phase 2 오차 프로파일에서 간접 확인. 재현성 관점에선 사진 대비 우위 확실.
2. **정점 앵커링** — "정점 15 = nasion"류 대응은 17캡처 검수 기반, 얼굴형 분포 꼬리에서 미검증. 임상 캘리퍼도 측정자 간 mm 편차가 있는 영역(계측 내재 한계).
3. **헤어라인** — TrueDepth로 원리적 미해결(IR 흡수). hair matte 융합 품질이 얼굴 길이비의 병목으로 남음.
4. **원격 브랜치 겹침** — `feature/WEI/얼굴분석보고서` 브랜치가 원격에 존재. 착수 전 작업 범위 겹침 확인 필요.
5. **AURAFaceRatioHairline.m의 pitch 정규화 8° 잔존** — 게이트 12°와 불일치로 8~12° 촬영의 헤어라인 confidence 저평가 (스펙 주석의 "별도 검토" 항목).
