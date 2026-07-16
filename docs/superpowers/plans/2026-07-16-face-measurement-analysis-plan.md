# 얼굴 측정·분석 개선 계획 (2026-07-16)

상태: 초안 — 팀 검토 대기
브랜치: `fix/face-analysis-report-0716` (Phase 0 구현 대상)
작성 배경: 얼굴 길이/비율 측정의 정확도 검토 세션(2026-07-16) 결론 종합
참고 문서: `docs/faceData_WEI/얼굴형분류기제안서.md`, `engine_제안서.md`(§3–4만 유효), `AURA_FACE_RATIO_DISTORTION_CORRECTION_PLAN_KO_v1.0.md` — §7~9와 §6 리스크 8·9에 반영

---

## 0. 문제 정의 — 현재 상태 진단

현 측정 파이프라인을 검토한 결과, 문제는 측정 자체보다 **기준값과 표현 계층**에 있다.

| # | 발견 | 위치 | 심각도 |
|---|---|---|---|
| 1 | `FACE_LENGTH_REFERENCE`(1.351/1.455/1.506) 출처 불명 — 스펙 문서에도 "하드코딩"으로만 기록 | `FaceVerticalThirdsScreen.tsx:53`, 스펙 §4.5 | 높음 |
| 2 | 게이지 눈금 라벨과 마커 좌표가 **서로 다른 상수 세트**(1.351/1.455 vs 1.28/1.56)로 렌더링. 게다가 라벨 x좌표는 스타일에 `'28%'/'47%'`로 제3의 하드코딩 — 마커 스케일 기준 1.455의 실위치는 62.5%라 **이미 화면에서 어긋나 있음** | `FaceVerticalThirdsScreen.tsx:131` | 높음 |
| 3 | `AVERAGE_DISPLAY_RATIO`(1:1:0.8)도 출처 주석 없음 | `faceVerticalThirdsMath.ts:10` | 중간 |
| 4 | pitch는 게이트(≤12°)만 있고 보정 없음 — 문서화된 잔여 오차 2~4%p가 세로 3분할 기준으로만 평가됨. 얼굴 길이비(세로÷가로)는 약분이 안 되어 이 오차가 그대로 실리는데 게이지 눈금 폭(0.28) 대비 유의미 | `facePoseGates.ts` 주석 | 높음 |
| 5 | MediaPipe가 주는 z좌표를 비율 계산에서 버리고 있음 (pitch/yaw 3D 정렬 미사용) | `faceRatioAnalyzerNative.ts:22` | 중간 |
| 6 | 측정 내부값(무차원 비율, px, Lab 등)이 범위·방향·단위 설명 없이 노출 — 팀 내부에서도 해석 불가 | `MeasurementDetailSection.tsx` | 중간 |
| 7 | 신고전 캐논(3분할 균등)은 한국인 표본에서 규범 기준으로 부적합 — 한국계 미국인 여성 표본 충족률 4.2% (Choe 2004, 단일 연구) | 제품 전제 | 높음 |

측정이 견고한 부분: 세로 3분할(동일 축 비율이라 스케일 약분), roll 보정(게이트+보정 완비), Face3D Tier-2(3D 정점 거리 + 30프레임 median/MAD — 원근·포즈 왜곡 원리적 부재).

## 1. 설계 원칙

1. **측정과 해석의 분리.** 측정 계층은 "정확하고 재현되는 물리량"만 책임진다. 사용자에게 말을 거는 것은 전부 지각 번역 계층이다.
2. **3D(TrueDepth)가 측정의 신뢰 축.** 원근·포즈 왜곡이 원리적으로 개입 불가. 2D는 z좌표 포즈 정규화로 보강한 폴백.
3. **지각이 해석의 축.** 메이크업은 실제 기하가 아니라 지각을 바꾸는 기술(shape-from-shading 응용)이므로, 최종 출력은 "실측 대비 편차 판정"이 아니라 "지각적 특징 서술 → 기법 추천".
4. **측정 수치는 사용자 비노출.** mm·비율 원시값은 내부 저장·검증 전용. (전환 시점: 화면 숫자의 실제 제거는 Phase 3의 번역 계층 완성과 함께 — Phase 0은 과도기로 노출 중인 숫자에 출처·유보만 강제.)
5. **기준값 의존 최소화.** 자기 얼굴 내부의 상대 비교를 기본으로 한다 — **글로벌 서비스에서 인구집단 중립으로 성립하는 유일한 기준**. 인구 기준을 쓸 때는 사용자가 속한 모집단의 실측 분포만(신고전 캐논·황금비·단일 인구 norm의 전역 적용 금지). 얼굴에서 인종·민족을 추론하지 않는다 — 모집단 구분이 필요하면 자기선택(locale/설정)만 사용.
6. **근거 없는 인상 서술 금지.** 지각 번역 매핑의 모든 행에 근거 등급(§5)을 달고, 등급에 따라 어조를 강제한다.

## 2. 목표 아키텍처

```
[촬영] → [측정 계층] ──────────────────┐
          · TrueDepth 3D 우선           │
          · 2D+z 포즈 정규화 폴백       ├→ [해석 융합 계층] → [보고서/추천]
          · mm 내부 저장(검증용)        │    · 측정 × AI 관찰 융합      · 숫자 비공개
          · 얼굴형 feature/scorer (§7)  │    · 인상·타입 다축 서술 (§9) · 특징+기법 언어
[사진] → [AI 정성 관찰 계층 (§8)] ─────┘    · 근거 등급별 어조 규칙    · 경계값 히스테리시스
          · 비전 AI: 측정 불가 속성만
          · 구조화 관찰 + 시각 근거 필수
```

## 3. 단계별 계획

### Phase 0 — 표현 정직화 (이번 브랜치, 측정 로직 무변경)

1. **기준 상수 3벌 통합**: `FACE_LENGTH_REFERENCE` + 게이지 마커 min/max + `AVERAGE_DISPLAY_RATIO`를 `face-ratio/constants.ts` 단일 모듈로. 게이지 라벨·마커가 같은 스케일에서 파생되도록 렌더링 수정. 각 값에 "출처 불명 잠정값 — Phase 4에서 교체" 주석.
2. **판정 완화**: 경계 버퍼(현 ±0.02)를 pitch 12° 허용이 만드는 오차폭 기준으로 재산정. 경계 구간은 단정 대신 유보 표현("평균~세로형 사이"). 소수 3자리 노출 제거.
3. **문구 구조 전환 1차**: 판정형 제목("평균보다 하안부가 긴 얼굴") → 특징 서술형("하안부에 시선 비중이 실리는 인상") 매핑 테이블 자리 마련. 문구 확정은 팀 검토 후.
4. **회귀 테스트**: `calculateVerticalThirdsRatio`·게이지 로직 커버 추가 (현재 없음).
5. **판정 버저닝 결정**: 기준 상수에 버전 태그를 부여하고 결과 저장 시 판정 스냅샷(또는 상수 버전)을 함께 저장 — 상수 개정(Phase 0 버퍼 재산정, Phase 4 기준 밴드 교체) 시 DB에서 복원되는 기존 보고서의 판정 문구가 재렌더에서 조용히 바뀌는 것을 방지.
6. **스펙 동기화**: `AURA_FACE_CAPTURE_LAB_SPEC` §4.3(사후 pitch 8°로 기술 — 코드는 12°)·§5(제거된 CocoaPods MediaPipe 경로를 현행으로 기술) 낡은 서술 갱신.

**관문**: 사용자 화면의 모든 숫자에 출처 또는 유보가 있다.

### Phase 1 — 2D 측정 강화: z좌표 포즈 정규화

1. MediaPipe 478점 `{x,y,z}`를 pose 기준으로 역회전해 정면 자세로 3D 정렬 후 H/G/Sn/Me·얼굴 길이 계산. **선결 결정 2건**: (a) 브리지는 현재 오일러 각 3개만 전달(`pose{pitch,yaw,roll}Deg`) — 회전 행렬 전달 경로를 신설하거나 오일러에서 재구성(Unity 쪽 분해 순서 규약과 일치 필수). (b) 현행 roll 보정은 키포인트 추출 **후** JS 2D 회전인데, 3D 정렬은 추출 **전** 478점 전체에 적용해야 하므로 계산 위치(네이티브 vs JS) 결정 필요 — "대체"가 아니라 계산 위치 이동을 수반하는 리팩터. 정규화 좌표의 종횡비 복원(x×width, y×height)도 회전 전 필수.
2. **MediaPipe z 품질은 가설로 취급**: 역회전 시 y' ≈ y·cosθ − z·sinθ 이므로 z의 오차·스케일 불일치가 sin(pitch)에 비례해 세로 거리로 **직접 유입**되며 비율에서 약분되지 않는다(약분되는 것은 전역 스케일뿐). Phase 1 관문(재현성 MAD)이 이 가설의 검증 장치 — 개선이 없으면 cos 근사 보정으로 후퇴.
3. 보정 후 잔여 포즈 각도를 confidence에 반영 → Phase 0의 경계 유보와 연결.
4. **촬영 거리 문제 인지**: 30cm 셀피는 1.5m 대비 코 밑너비를 ~30% 과장(Selfie Effect, §5 A-8). 포즈 정렬로는 원근(거리) 왜곡이 완전 제거되지 않으므로, 거리 가이드 UX 또는 TrueDepth 거리 보정을 Phase 2와 연계 검토.

**관문(핵심 검증)**: 팀원 3~5명 × 다양한 각도·거리 10회 촬영 → 동일인 측정값 분산(MAD)이 보정 전 대비 감소. *정답 일치가 아니라 test-retest 재현성이 1차 지표.*

### Phase 2 — TrueDepth 확장: 신뢰 축 이동

1. **Face3D 파이프라인에 얼굴 길이비·세로 3분할 대응 지표 추가** — 기존 semantic map 승인 파이프라인(후보 map → 오프라인 진단 → 승격) 그대로 통과.
2. **헤어라인 예외**: 머리카락은 IR 흡수로 TrueDepth가 못 잡음 → H만 Apple hair matte와 융합하는 하이브리드.
3. **mm 병렬 저장**: `faceScale` 정규화 전 원시 거리를 `unit: 'mm'`로 내부 저장. ARKit face mesh 정점은 미터 단위 face-local 좌표라 물리적으로 성립하고, 스키마 `unit` 필드에 `'mm'`이 기존재하며 백엔드는 payload 무필터 JSONB 저장이라 서버 변경 없음. **단 Tier-2 계약 §0("절대 mm가 아니다")의 제품 경계 개정을 수반** — Unity evaluator 산출 추가 + 직렬화 + 계약 문서 + 승인 파이프라인 개정이 작업 범위. mm 실측치의 데이터 분류(생체정보성) 검토 한 줄 포함. 사용자 비노출.
4. **오차 프로파일**: 캘리퍼/자 실측 대비 부위별 오차 측정(눈 사이 거리·얼굴 폭 등 큰 치수부터). 산출물 = 부위별 신뢰 가능/불가 목록. 문헌 기대치: 표면 편차 ~0.4mm, 거리 측정 오차 0.88~9.07%(각도 의존) (§5 C-1).
5. **2D/3D 이중 경로 정책**: 동일 지표 충돌 시 TrueDepth 우선, 폴백은 confidence 하향, 결과에 `source` 명시.

**관문**: 부위별 mm 오차 프로파일 문서 존재.

**mm 응용 로드맵(검증 후)**: PD 기반 안경 맞춤(문헌상 최우수 앱 오차 ~0.51mm로 임상 허용 범위, §5 C-2) → 렌즈 직경(HVID: RGB 측정 + depth 스케일 하이브리드) → 뷰러 곡률(요구 정밀도 최고, 실측 검증 선행). mm 노출 시 지역별 의료기기 규제 경계 확인.

### Phase 3 — 지각 번역 계층 (제품의 본체)

1. **매핑 테이블**: `측정 특징 → 지각 서술 → 메이크업 기법` 3열 + `근거 등급` 열. 근거 없는 행 금지.
2. **근거 등급별 어조 규칙** (§5의 강도 평가에 따름):
   - **A급(strong)** — 단정 서술 허용: 음영→깊이 지각(컨투어링 원리), 눈 메이크업 착시(정량 ~5%, Morikawa), 페이셜 컨트라스트→나이·성별 지각(Russell 연구군), 이목구비 배치→매력 지각(Pallett 2010)
   - **B급(medium)** — 조건부 서술("~해 보일 수 있어요"): 앞머리→이마 노출 감소(A-4), 명도 대비→시선 유도(A-10)
   - **C급(업계 관행)** — 제안형 서술("아티스트들은 ~을 권해요"): 블러셔 위치→얼굴형 인상 (직접 검증 논문 not found — §5 A-6)
3. **착시 효과의 정직한 스케일**: 문헌상 얼굴 내부 특징(눈 크기 등) 기하 착시의 크기는 ~5% 수준(Morikawa — 일반 선분 착시의 ~30%와는 별개 범주). "극적 변화" 서술 금지, "미세하지만 지각 가능한 조정"으로.
4. **정면 한정 명시**: 컨투어링 효과는 주로 정면 뷰에 국한(§5 A-2) — 추천 문구에 반영.
5. **표준 관찰 거리 재투영** (후순위): 3D 메쉬를 1.5m 관찰 거리 투영으로 렌더링해 "타인이 보는 비율" 산출. Selfie Effect 간극을 메우는 장치. Phase 2 안정 후.
6. **지각 타당성 검증**: 매핑 분류와 사람 지각의 상관 확인(팀 내부 → 베타).

**관문**: 모든 인상 서술 행에 근거 링크와 등급이 있다.

### Phase 4 — 기준값: 글로벌 다모집단 전략 (자기상대 비교가 기본, 인구 norm은 locale별 옵션)

**전제: 글로벌 서비스.** 단일 인구(한국인 포함) norm의 전역 적용은 신고전 캐논과 같은 오류의 반복이다 — Farkas 국제 비교 연구가 보여주듯 계측 분포는 인구집단별로 체계적으로 다르다(§5 참조). 따라서:

1. **기본값(모든 사용자)**: 자기 얼굴 내부의 상대 비교 + 지각 특징 서술 — 인구 기준 자체가 불필요한 서술 구조(§9)가 1차 방어선. 이것만으로 제품이 성립해야 한다.
2. **locale별 부트스트랩(옵션, 후순위)**: 사용자 자기선택 locale에 해당하는 실측 문헌이 있을 때만 잠정 기준 밴드 제공. 한국 locale은 Choe 2004·한국 계측 연구군·Size Korea(§5 B)가 후보 — 랜드마크 정의의 파이프라인 일치 검증 필수. 타 locale은 Farkas 국제 데이터 등 해당 인구 문헌 확보 전까지 기준 밴드 미제공(자기상대 서술만). **얼굴에서 인종 추론 금지 — locale은 자기선택만.**
3. **수렴(장기)**: 우리 파이프라인으로 측정된 자체 사용자 분포를 locale 세그먼트로 축적 → 백분위 기반 상대 위치로 전환. 측정 조건 동일 + 모집단 일치라는 두 조건을 모두 만족하는 유일한 기준.
4. **이론적 뒷받침**: "매력적 비율 = 모집단 평균 비율"(Pallett 2010)은 글로벌 맥락에서 오히려 강해진다 — 기준은 보편 상수가 아니라 **모집단의 함수**라는 뜻이므로, locale별 분리가 원리적으로 정당하다. 단 Pallett 2010은 백인 여성 얼굴 자극 기반 — 원리의 외삽이지 각 모집단 직접 검증이 아님을 명시. 서구 기준·황금비·신고전 캐논은 도입 금지.

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
| A-10 | 명도 대비가 높은 영역이 주시를 끈다(시각 saliency) — 단 자연 이미지에서의 인과 기여는 논쟁 | [Attention Percept Psychophys](https://link.springer.com/article/10.3758/APP.71.6.1337), [PubMed](https://pubmed.ncbi.nlm.nih.gov/12653985/) | medium |

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
6. **MediaPipe z 품질 미검증** — Phase 1의 3D 정렬 개선폭은 z 노이즈에 좌우됨(Phase 1 §2). 재현성 관문 미달 시 cos 근사 보정으로 후퇴.
7. **플랫폼 범위** — 현재 앱은 iOS 전용. Phase 1의 "폴백"은 non-TrueDepth iOS 기기 대상이며, Android 확장 시 Phase 2의 "TrueDepth = 신뢰 축" 전제는 전면 재검토 사안.
8. **왜곡 보정 기획서 v1.0과의 결정 충돌 — 제품 오너 승인 필요.** `AURA_FACE_RATIO_DISTORTION_CORRECTION_PLAN_KO_v1.0.md` §6.2는 pitch/yaw 보정을 명시적으로 제외했다("잘못 보정하면 가짜 정확도" — gate로 차단이 원칙). 본 계획 Phase 1은 z기반 3D 정렬을 제안하므로 이 확정 결정의 번복이다. 번복 근거: (a) 결정 당시 전제는 pitch 게이트 ±5°였으나 이후 12°로 완화(2026-07-13 usability 결정)되어 게이트만으로 잔여 왜곡을 막는다는 전제가 무효화됨, (b) Phase 1은 재현성 관문 미달 시 후퇴하는 검증 구조를 내장해 "가짜 정확도" 우려에 대한 방어를 갖춤. 이 논거로 제품 오너 재결정을 받는다.
9. **왜곡 방지 게이트의 기획-구현 드리프트** — 기획서는 ARKit FaceAnchor 게이트(±5/6/3°) + 거리 35cm 게이트 + Sn–principal point 정렬을 확정했으나, ARKit 취소로 현재는 MediaPipe 게이트(8/12/5°)이고 미터 단위 거리 게이트는 미구현(타원 프레이밍이 간접 대용), principal point는 "ARKit 재도입 대비" 코드로만 잔존. **Selfie Effect(§5 A-8) 방어가 기획 의도보다 약한 상태** — Phase 1 §4의 거리 가이드 검토와 직결.
10. **글로벌 생체정보 규제** — 얼굴 기하 측정치(특히 mm 실측·얼굴형 스코어)는 GDPR 특수범주(생체정보) 및 미국 주법(일리노이 BIPA 등)의 규율 대상이 될 수 있다. BIPA는 얼굴 기하 스캔에 대한 사전 서면 동의·보존 정책 공개를 요구하며 사인(私人) 소송이 가능해 실질 리스크가 크다. 포괄동의 문구·보존 정책이 진출 지역 규제를 커버하는지 법률 검토 필요 — mm 저장(Phase 2 §3)과 AI 사진 전송(§8.4) 착수 전 선행.
11. **측정 파이프라인의 인구집단 편향** — MediaPipe·ARKit 모두 학습/설계 분포가 공개되지 않아 인구집단별 정확도 차이가 미검증. Phase 1·2의 재현성/오차 검증 표본을 팀 내부로만 잡으면 이 편향을 못 본다 — 검증 표본의 다양성 확보를 관문 설계에 반영.

## 7. 측정 요소 확장 — 설계 문서 통합

`얼굴형분류기제안서.md`와 `engine_제안서.md` §3의 측정 요소를 현 구현과 대조한 결과, engine 1군 13개 중 상당수는 **이미 구현되어 있다**. 신규는 세 덩어리다.

### 7.1 이미 구현 (재사용)

| engine 1군 요소 | 현 구현 |
|---|---|
| face length-width ratio | `faceLength.ratio` |
| midface/lower-face balance | 세로 3분할 `dominantPart` |
| eye aspect ratio / spacing / tilt | `eyeOpenness` / `interCanthalRatio` / `canthalTiltDeg` |
| brow-eye distance, brow tilt | `eyeBrowGap`, `browSlopeDeg` |
| lip fullness / mouth width / corner tilt | `lipThicknessRatio` / `mouthWidthRatio` / `mouthCornerAsymmetry` |
| jaw balance | `jawWidthRatio`, `lowerJawWidthRatio` |
| nose length/width | Face3D Tier-2 (3D) |
| pose/lighting quality | quality 게이트 체계 |
| lip-skin contrast (2군) | personalColor `relations.dL_skinLip`/`dE00_skinLip` |

### 7.2 신규 ① — 얼굴형 7-class 확률 스코어러 (분류기제안서 채택)

- feature 추가: `foreheadToCheek`(헤어라인 의존 — 가림 시 null), `templeToCheek`, `cheekDominance`, `jawAngleScore`, `chinPointedness`, `contourRoundness`, `chinToCheek`
- 산출: `faceShapeScores`(7종 각 점수) + `top2` + `confidenceGap`. **hard label 단정 금지**(제안서 §15.1), 혼합형 표현 기본.
- 실행 시점: 2D 랜드마크 기반이라 Phase 1과 병렬 가능. rule scorer 우선, Core ML은 데이터 축적 후(제안서 Phase 3 준용). threshold는 다지역 표본 보정 전까지 잠정값으로 명시 — 제안서의 "한국인/동아시아 보정" 단계는 글로벌 전제에 맞춰 **locale 세그먼트별 보정**으로 확장(Phase 4 전략과 동일 원칙).

### 7.3 신규 ② — facial contrast·skin evenness (engine 1군 잔여)

- facial contrast(눈·눈썹·입술 ↔ 피부 명도/색 대비): personalColor Lab 측정치에서 파생 가능 — §5 A-7(Russell)이 근거 축이므로 **지각 번역에서 가장 활용 가치 높은 신규 요소**. 메이크업 강도 추천의 1차 입력.
- skin evenness/redness: personalColor 영역 통계(분산·영역 간 차)에서 부분 파생. 완전판은 별도 ROI 분석 필요 — 후순위.

### 7.4 신규 ③ — 2D 코 비율 폴백

Tier-2(3D) 미가용 기기용 `noseLengthRatio`/`noseWidthRatio` 2D 근사. Phase 1의 포즈 정규화 이후에만 신뢰 가능하므로 Phase 1 완료 후.

## 8. AI 정성 관찰 계층

수치 측정이 원리적으로 못 잡는 속성을 비전 AI가 사진에서 관찰한다. `engine_제안서.md` §3–4의 원칙을 계승한다: **AI는 기하 계산이 아니라 해석·관찰 담당, raw 478 랜드마크 전달 금지, 사진 + 요약 FaceProfile JSON + 품질 metadata를 함께 전달.**

### 8.1 AI가 담당할 것 (측정 불가 영역만)

- 헤어스타일·앞머리 유무(→ 헤어라인 측정 결측의 **맥락** 제공: "앞머리로 가려짐" vs "검출 실패" 구분)
- 눈매 인상(쌍꺼풀 유형, 눈매 분위기), 피부 질감 인상(광/매트/결)
- 전체 분위기·스타일 맥락(현재 메이크업 유무, 안경·액세서리)
- 표정 상태(측정 품질 해석 보조)

### 8.2 AI가 하지 말 것

- 좌표·거리·각도·비율 계산 (측정 계층 소관 — 측정값과 모순되는 기하 주장 금지)
- 인종·나이 단정, 미추(美醜) 평가·점수화
- 측정 JSON에 이미 있는 값의 재추정

### 8.3 구조화 출력과 환각 방지

관찰 항목마다 `{attribute, value, confidence, visualEvidence}` — `visualEvidence`는 "무엇을 보고 판단했는지" 한 줄 서술을 **필수**로 하여 환각을 구조적으로 억제한다. confidence 낮은 관찰은 해석 융합에서 자동 제외.

### 8.4 융합 규칙

1. 기하학적 사실은 **측정이 항상 우선**. AI 관찰이 측정과 충돌하면 해당 관찰 폐기 + conflict 로그(프롬프트 개선 신호).
2. AI는 측정 공백(정성 속성)만 채운다 — 역할 중첩 금지.
3. 저장 시 `measurements`와 `aiObservations`를 분리 필드로 — 모든 최종 서술은 출처(측정/관찰/융합)를 추적 가능해야 한다.
4. 사진의 외부 AI 전송은 개인정보 처리 — 포괄동의 문구가 이 전송을 포함하는지 확인(동의 정책은 앱 전역 포괄동의로 확정되어 있음 — 기능별 게이트를 만들지 않는다).

## 9. 인상·타입 서술 체계 — "최대한 다양하게"의 설계

다양성은 **축의 수**로 확보하고, 각 축의 신뢰성은 어조 게이트로 지킨다.

### 9.1 서술 축 (각 축 독립 산출, 조합으로 다양성)

| 축 | 산출원 | 형태 |
|---|---|---|
| 얼굴형 | §7.2 스코어러 | 7-class 확률 + 혼합형 |
| 세로 비율 특징 | 3분할 dominantPart | 특징 서술 |
| 이목구비 인상 | faceGeometry 지표군 | 축별 경향(눈매 각도·간격, 입술 볼륨 등) |
| 대비 인상 | §7.3 facial contrast | 저대비(soft)↔고대비(clear) |
| 퍼스널 컬러 | 기존 12타입 엔진 | 톤 + 혼합형 |
| 정성 인상 | §8 AI 관찰 | 분위기·스타일 서술 |
| 입체감 | Face3D 11지표 | 부위별 돌출 경향 |

### 9.2 어조 이중 게이트

모든 서술은 두 게이트 중 **낮은 쪽**을 따른다:
1. **통계 확신도** (분류기제안서 §10.3 준용): `confidenceGap ≥ 0.20` 단정형 / `0.10~0.20` 경향형("~에 조금 더 가까워요") / `< 0.10` 혼합형("~과 ~ 특징이 함께 보여요")
2. **근거 등급** (Phase 3 §2): A급 단정 / B급 조건부 / C급 제안형

예: 얼굴형 confidenceGap 0.25(단정 가능)여도 그에 붙는 블러셔 추천이 C급이면 추천 문구는 제안형.

### 9.3 원칙

- **다양성 ≠ 무근거 서술 허가.** 새 축 추가는 근거 행(§5) 추가와 함께만 가능.
- 혼합형 표현이 기본값 — "당신은 X형"이 아니라 "X 특징이 우세하고 Y 특징이 함께 보임".
- **문화권 중립 서술.** 미감·메이크업 관행은 문화권별로 다르다 — C급(업계 관행) 항목은 특히 서구/동아시아 관행이 갈릴 수 있으므로 매핑 테이블에 관행의 출처 문화권을 표기하고, 기법 추천은 locale별 분기 가능한 구조로. 인상 서술 자체는 문화 판단(예쁘다/세련되다)을 배제하고 기술적 특징("대비가 낮은", "곡선적인")만 사용.
- 축 간 조합 서술("긴 얼굴형 + 저대비 + 여름쿨 → …")은 융합 계층이 생성하되, 조합 규칙도 매핑 테이블에 근거와 함께 등재.
- 실행 시점: §9는 Phase 3의 구체화이며, 매핑 테이블 작업과 함께 기획이 병렬 시작 가능.
