# 얼굴 측정·분석 개선 계획 (2026-07-16)

상태: v5 — Phase 1∥2 PR #27 적대 리뷰 hardening과 **남은 Phase 3∥4 계획** 반영(2026-07-17). **실기기 MAD·MAE·mm 오차 프로파일과 calibration 제품 승격은 PENDING/UNVERIFIED이며 보정 기본값은 OFF.** 구현·fixture 테스트·이중 리뷰·dev PR은 로컬 워크플로로 수행하며, 실기기·캘리퍼·사람 품질 관문을 완료로 대체하지 않는다.
형상: 계획 정본은 dev(PR #20·#26), Phase 0 구현은 PR #21 머지. Phase 1∥2 구현과 후속 적대 리뷰 hardening은 dev PR #27에 포함하며 본 v5 현행화도 같은 브랜치에 추가한다. PR은 현재 **OPEN** — 머지 완료나 최종 이중 GO를 선기록하지 않는다.
작성 배경: 얼굴 길이/비율 측정의 정확도 검토 세션(2026-07-16) 결론 종합

**제품 오너 결정 로그 (2026-07-16, 모순 해결 세션)**:

1. **세로 3분할** — '평균' 라벨 제거 + 자기내부 서술 (0.8은 성형광고 관행값, 실측 아님 §0-3/§5 D-3·D-4)
2. **길이비 상수** — 자체 촬영셋 mean±SD로 교체 (1.351/1.455/1.506은 1차 출처 부재, avg 과대 §0-1/§5 D-1·D-2)
3. **숫자 노출** — 원칙 4(전면 비노출)로 단일화, 정본 §9보다 우선 (§10.7-3)
4. **법률(BIPA/GDPR)** — 현 스코프 과설계로 판단해 제외, 실서비스 출시 시 재검토 (§6-10)
5. **무규준 locale UI** — 모집단 밴드와 길이형 판정 게이지를 숨기고 자기이력 변화와 자기내부 부위 비교만 제공. locale norm은 승인 데이터가 생길 때까지 OFF
6. **body profile** — 보고서에는 연결하되 외부 AI prompt에서는 기본 제외
7. **R5 AR 맞춤** — 스텐실 레인만 우선, 사용자 opt-in 토글 기본 OFF, `PersonalFitEntry.provenance`만 신설하고 기존 생성 계약은 변경하지 않음
8. **R5 신규 축** — `eyelinerInnerExtension`을 스텐실 계약에 신설하되 δ와 자동 적용은 승인 전 0/OFF. 라이브 레인 지원은 후속
9. **누락 정본 대체** — 미반입 HTML 2종 대신 본 v5의 스키마·어조·안전 기본값을 이번 구현 정본으로 사용. 원본이 나중에 들어오면 delta review만 수행
참고 문서: `docs/faceData_WEI/얼굴형분류기제안서.md`, `engine_제안서.md`(§3–4만 유효), `AURA_FACE_RATIO_DISTORTION_CORRECTION_PLAN_KO_v1.0.md` — §7~9와 §6 리스크 8·9에 반영
**정본 설계**: 계획 이력상 `docs/faceData_WEI/얼굴분석-설계.html` v1과 제2 정본 `메이크업-분류체계-정의.html`을 가리키지만, **2026-07-17 현재 worktree에는 두 파일 모두 없다.** 이번 구현은 본 v5가 정리한 대체 계약을 정본으로 사용하고, 원본이 나중에 반입되면 별도 delta review로 차이만 반영한다(§10.10, §11.2). (`docs/superpowers/plans/2026-07-15-s1-face-analysis-ai-pipeline.md`는 폐기 — 사용자 확정 2026-07-16)

---

## 0. 문제 정의 — 현재 상태 진단

현 측정 파이프라인을 검토한 결과, 문제는 측정 자체보다 **기준값과 표현 계층**에 있다.

| # | 발견 | 위치 | 심각도 |
|---|---|---|---|
| 1 | `FACE_LENGTH_REFERENCE`(1.351/1.455/1.506) 출처 불명 — **리서치로 1차 출처 부재 확정**(형태학 얼굴지수 가설 기각: 그 지수는 비율 0.80~0.95, 앱은 헤어라인→턱끝/광대폭인 physiognomic 비율). 앱과 동일 정의의 한국 여성 실측 앵커는 **1.37**(187.05mm/136.6mm), 임상 균형 기준 1.33~1.43 — **avg 1.455는 0.05~0.08 과대 → 한국 사용자 '가로형' 오분류 위험** | `FaceVerticalThirdsScreen.tsx:53`, 스펙 §4.5 | 높음 |
| 2 | 게이지 눈금 라벨과 마커 좌표가 **서로 다른 상수 세트**(1.351/1.455 vs 1.28/1.56)로 렌더링. 게다가 라벨 x좌표는 스타일에 `'28%'/'47%'`로 제3의 하드코딩 — 마커 스케일 기준 1.455의 실위치는 62.5%라 **이미 화면에서 어긋나 있음**. 색 세그먼트 경계(균등 3분할)·판정 임계까지 합치면 **4중 불일치** | `FaceVerticalThirdsScreen.tsx:131` | 높음 |
| 3 | `AVERAGE_DISPLAY_RATIO`(1:1:0.8) 출처 주석 없음 — **리서치로 정체 규명**: 실측 평균이 아니라 **한국 성형광고 파생 관행값**(성형외과 전문의가 "선풍기 괴담"으로 규정, 코메디닷컴). 실측은 정반대로 하안부가 중안부와 같거나 김(한국 20대 여성 0.85:1:**1.0**, Farkas 백인 여성 하안부 최대, 앱과 같은 G-Sn/Sn-Me 임상 관행 45:55) — **어떤 인구 실측과도 배치** | `faceVerticalThirdsMath.ts:10` | 높음 |
| 4 | pitch는 게이트(≤12°)만 있고 보정 없음 — 문서화된 잔여 오차 2~4%p가 세로 3분할 기준으로만 평가됨. 얼굴 길이비(세로÷가로)는 약분이 안 되어 이 오차가 그대로 실리는데 게이지 눈금 폭(0.28) 대비 유의미 | `facePoseGates.ts` 주석 | 높음 |
| 5 | MediaPipe가 주는 z좌표를 비율 계산에서 버리고 있음 (pitch/yaw 3D 정렬 미사용) | `faceRatioAnalyzerNative.ts:22` | 중간 |
| 6 | 측정 내부값(무차원 비율, px, Lab 등)이 범위·방향·단위 설명 없이 노출 — 팀 내부에서도 해석 불가 | `MeasurementDetailSection.tsx` | 중간 |
| 7 | 신고전 캐논(3분할 균등)은 한국인 표본에서 규범 기준으로 부적합 — 한국계 미국인 여성 표본 충족률 4.2% (Choe 2004, 단일 연구) | 제품 전제 | 높음 |
| 8 | keypoint confidence가 하드코딩 합성값(현행 소비자 기준 G .82 / Sn .82 / Me .84 — `hApprox .40`은 07-16 커밋에서 소비자 제거 완료, 타입/네이티브 방출만 잔존) — `ratio.confidence`·어조 게이트(§9.2)·Phase 1 confidence 반영이 전부 이 위에 쌓임 | `faceVerticalThirdsService.ts:58`, 스펙 §7 | 높음 |

**Phase 1∥2 구현 후 진단표 상태(2026-07-17, v5 PR #27 hardening 반영)**: #2(게이지 불일치)·#3(0.8 기준)은 **해소**. #1(기준 상수)은 **완화** — 출처 고지·단일 정의처·동적 유보로 정직해졌을 뿐 값 자체는 잠정 하드코딩 그대로(교체는 Phase 4). #6(수치 노출)은 **잔존 — R4 이관**, #7은 **규범 캐논 의존 해소**로 범위 한정한다. #4(pitch 무보정)·#5(z 미사용)는 478점 z+4x4 행렬 정규화와 paired replay 배관이 구현되어 **검증 가능 상태로 완화**됐지만, 정확한 `validation-only` 플래그에서만 동작하고 제품 저장·backend·AI에는 차단되므로 실기기 MAD·MAE 관문 전에는 **해소 아님**. PR #27 적대 리뷰에서 affine bottom row와 shear/non-uniform scale/reflection을 fail-closed 처리하고 R/Rᵀ 수치 왕복 진단을 추가했다. 이 왕복값은 행렬과 랜드마크의 독립적인 correspondence 증거가 아니다. #8은 제품 기본 경로의 `LEGACY_UNCALIBRATED_KEYPOINT_CONFIDENCE`(.82/.82/.84)가 그대로여서 **잔존** — 보정 진단 경로가 confidence 0·`indeterminate`로 강등하는 것은 실제 confidence 실측화가 아니다.

측정이 상대적으로 견고한 부분: 세로 3분할(동일 축 비율이라 전역 스케일 약분 — 단 pitch foreshortening은 비균일하므로 위 #4의 2~4%p 잔여 오차는 바로 이 측정에 대한 값), roll 보정(게이트+보정 완비), Face3D Tier-2(3D 정점 거리 + median/MAD 집계).

**Face3D 현행 3계층(v5, 2026-07-17)**: ① **현행 제품 기본 = 레거시 v1 프로필 20-valid/30-target** — 변경 없음. v1/no-schema의 임의 `.mm`와 raw/receipt/provenance는 fail-closed 또는 모델 입력에서 제거한다. ② **레거시 v2 = 역사 증거 전용** — 기존 v2 프로필은 호환 파싱하되 새 trust/mm/receipt 의미를 소급 적용하지 않고 분석 승격을 항상 차단한다. ③ **v3 제품 후보 = 500ms micro-burst 5-of-8 + exact-30 진단 모드** — `valueMm` 독립 집계·sensor provenance·immutable policy/gate·HMAC receipt·one-time consumption 배관까지 구현됐지만 mobile/backend promotion flag가 기본 false이고 signing-key/approval-artifact 승인값과 backend secret이 비어 있으며 `FACE3D_GATE_STATUS.json`은 `pending/not_run/off`; 자기선언 calibrated 프로필은 계속 차단된다. exact-30 evidence logger/adaptor와 1/3/5/8/12/30 repeatability·Gate 6B dry-run 도구는 준비됐으나 실기기 증거는 없다. 따라서 "TrueDepth 신뢰 축 이동"은 구현 준비 GO일 뿐 제품 승격 완료가 아니다.

## 1. 설계 원칙

1. **측정과 해석의 분리.** 측정 계층은 "정확하고 재현되는 물리량"만 책임진다. 사용자에게 말을 거는 것은 전부 지각 번역 계층이다.
2. **3D(TrueDepth)가 측정의 신뢰 축.** 3D 정점 계측은 원근·포즈 왜곡에 원리적으로 강건하다. **단 "원리적 부재"라는 단정은 금지**(리서치 검증): ARKit face tracking은 iOS 14+/A12+ 기기에서 **TrueDepth 없이도 동작**하고(mesh API 동일, `capturedDepthData`만 센서 차이), Apple은 정확도 동일성을 보증하지 않는다. v5에서 `.mm` provider의 `trueDepthHardware`/`depthDataObservedRatio`/`faceTrackingSupported`/기기모델 provenance 기록과 v3 trust 계약은 구현됐지만, 신뢰 축 채택은 여전히 (a) Gate 6B 독립 validation, (b) calibration receipt 실제 발급·승격, (c) 기기군별 mm 오차 자체 검증을 선결로 한다. 2D는 z좌표 포즈 정규화로 보강한 폴백 후보이며 관문 전 기본 OFF다.
3. **지각이 해석의 축.** 메이크업은 실제 기하가 아니라 지각을 바꾸는 기술(shape-from-shading 응용)이므로, 최종 출력은 "실측 대비 편차 판정"이 아니라 "지각적 특징 서술 → 기법 추천".
4. **측정 수치는 사용자 비노출 (제품 오너 확정 2026-07-16).** mm·비율 원시값은 내부 저장·검증 전용. **이 원칙이 정본 §9(민감도 태그 필터 — 무표기 항목은 자유 노출)보다 우선한다** — 노출 정책 3파전(원칙 4 vs 정본 §9 vs 현행 3-반영 규칙)은 원칙 4로 단일화(§10.7-3). 귀결: 현행 `MeasurementDetailSection`의 px·Lab·확률 노출은 **제거 대상**이며 이 작업이 Phase 0 관문의 실제 범위다. (전환 시점: 화면 숫자의 실제 제거는 Phase 3의 번역 계층 완성과 함께 — Phase 0은 과도기로 노출 중인 숫자에 출처·유보만 강제하되, 신규 숫자 노출은 금지.)
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

### Phase 완료 프로토콜 (전 Phase 공통 — 2026-07-17 확정, Phase 0에서 실증한 절차의 표준화)

각 Phase는 아래 3단계를 통과해야 "완료"다. 자매 문서(보고서 재구성 계획)의 R 단계에도 동일 적용.

1. **이중 GO 게이트 → PR**: Codex 적대 리뷰와 Claude 셀프 적대 리뷰(반박 지향, 독립 실행)가 **둘 다 GO**를 낼 때까지 [리뷰 → 발견 코드 검증 → 반영 → 재판정] 루프를 돌린다. NO-GO 발견은 전건 검증 후 반영(맹목 수용 금지 — 틀린 지적은 근거와 함께 반박). 두 GO 확보 후 dev로 PR. (Phase 0 실적: Codex 4라운드 + 셀프 1회, 발견 17건 전건 반영 후 GO.)
2. **계획 현행화**: 완료 순서는 항상 `Codex GO + Claude claude-fable-5 high GO(동일 SHA) → dev PR 생성/갱신 → 같은 PR에서 다음 계획 버전 현행화 → 종료`다. PR 번호 확보 직후 이 문서를 구현 현실에 맞게 갱신한다 — ① PR 상태·판정·검증 근거 명령, ② §0 진단표의 해소/완화/잔존 재판정(과대 표기 금지 — "정직해진 것"과 "해소된 것"을 구분), ③ 다음 Phase가 이번 산출물과 맺을 연동·선행 배관 명시, ④ 낡아진 서술 정정. PR이 열려 있으면 `OPEN`으로 기록하고 머지 완료를 선기록하지 않는다. Claude 리뷰는 first-party Claude Pro OAuth만 사용하고 **Bedrock 또는 Sonnet으로 fallback하지 않는다**. 플러그인/MCP는 비활성화하지 않으며 리뷰 artifact에 model·effort·활성 plugin/MCP·SHA를 기록한다.
3. **다음 Phase 착수**: 갱신된 계획의 선행 배관·관문 정의를 유일한 입력으로 **새 세션에서** 착수한다(맥락 마모 방지 — 계획 문서가 자기완결이어야 하는 이유).

### Phase 0 — 표현 정직화 (측정 로직 무변경) ✅ 완료 2026-07-17

**완료 기록**: PR #21 머지 — **측정 트랙 소유 산출물 완료**(숫자 전면 철거는 R4 소유로 이관, hApprox wire/네이티브 잔존은 수용·Phase 1 이관), Codex 적대 리뷰 4라운드+셀프 리뷰 1회(발견 17건 전건 반영) 후 GO 판정. **관문 분리**: 측정 트랙 관문(판정형 화면 숫자에 출처·유보 + 이번 diff에 신규 노출 없음)은 통과, 제품 전체 숫자 비노출 관문은 R4 대기. 검증 근거: `npm --prefix apps/mobile run test:face-ratio-distortion` + `run-face-analysis-measurements-contract.mjs` + backend `pytest tests/test_face_analysis_{rules,measurements}.py tests/test_analysis_measurements_payload.py tests/test_prompt_payload_judgment.py`. 구현 정본: `face-ratio/constants.ts`(FACE_LENGTH_REFERENCE·judgeFaceLength·FACE_RATIO_JUDGMENT_VERSION), 판정 스냅샷 `faceLengthJudgment`, 서버 정본 추종(`face_analysis_rules.py`)·sanitizer 보존(`openai_analysis.py`). 유일 잔여: 실기기 게이지 렌더 확인(UNVERIFIED). 아래 항목 서술은 착수 당시 기준의 역사 기록.

1. **기준 상수 4벌 통합 — 정정: 5벌**: `FACE_LENGTH_REFERENCE`(1.351/1.455/1.506) + 게이지 마커 min/max(1.28/1.56) + **색 세그먼트 경계**(균등 3분할) + **판정 임계**([getFaceLengthTitle](../../../apps/mobile/src/features/face-ratio/screens/FaceVerticalThirdsScreen.tsx#L125-L135))를 `face-ratio/constants.ts` 단일 모듈로. **제5의 상수 세트(2026-07-17 셀프 검증 발견 및 해소)**: 서버 `face_analysis_rules.py`의 legacy 임계(1.38/1.2·0.025)는 저장된 모바일 판정 스냅샷이 없는 구 payload 폴백에만 사용하고, 신규 보고서는 모바일 스냅샷을 정본으로 따른다. 게이지 라벨·마커·세그먼트·판정이 **모두 같은 스케일에서 파생**되도록 렌더링 수정(현재 비율 1.467~1.486이 '세로형' 색 위에 앉는데 제목은 '평균'인 모순 해소). 각 값에 "1차 출처 부재 잠정값 — Phase 4 mean±SD 교체" 주석. `AVERAGE_DISPLAY_RATIO`의 0.8은 '평균' 라벨 제거(아래 3번).
2. **판정 완화 — 방향성(비대칭) 버퍼**: 고정 ±0.02는 오차 모델이 틀렸다(pitch는 세로를 압축해 비율을 **하향**, yaw는 가로를 압축해 **상향** 편향 — 대칭 노이즈 아님). `quality.pitch/yaw`가 이미 측정되므로 **샷별 동적 유보 구간** `[measured×cos(yaw), measured/cos(pitch)]`을 산출해, 이 구간이 판정 임계를 걸치면 단정 대신 유보("평균~세로형 사이"), 아니면 단정. 최악(pitch12°/yaw8°) 폭 −1.0%~+2.2%, 정면 근접 시 구간이 좁아져 단정 회복(usability도 개선). **측정 로직 무변경 — 표현 계층에서만 판정.** 소수 3자리 노출 제거.
3. **'평균' 라벨 제거 + 자기내부 서술 (제품 오너 확정)**: 0.8은 실측 평균이 아니라 성형광고 관행값(§0-3)이므로 화면에서 "평균 비율" 기준선·눈금을 제거. 판정형 제목("평균보다 하안부가 긴 얼굴") → **내 얼굴 안의 상대 서술**("하안부가 중안부보다 약간 긴 편이에요")로 매핑 테이블 자리 마련(기준선 없이 부위 간 비교만). 문구 확정은 팀 검토 후.
4. **회귀 테스트 — 게이지 로직 추출 선행**: `calculateVerticalThirdsRatio`·`deriveDominantPart`·`buildInterpretation`은 [faceVerticalThirdsMath.test.ts](../../../apps/mobile/src/features/face-ratio/services/faceVerticalThirdsMath.test.ts)로 **이미 커버됨**(초안의 "현재 없음"은 오류). 실제 공백은 화면 로컬·미export 함수 `getFaceLengthTitle`/`getGaugeMarkerPercent`뿐 → **`constants.ts`로 추출 후 테스트 추가**가 작업. 4중 불일치·비대칭 버퍼 케이스 포함.
5. **판정 버저닝 결정**: 기준 상수에 버전 태그를 부여하고 결과 저장 시 판정 스냅샷(또는 상수 버전)을 함께 저장. (근거 정정: 주 앱 판정 **문구**는 이미 저장·복원되나, Lab 화면·게이지 제목은 렌더 시 상수로 **재계산**되므로 상수 개정 시 조용한 재판정 위험은 이 렌더 경로에 실재 — 버저닝 유지.)
6. **노출 숫자 제거 착수 (원칙 4)**: `MeasurementDetailSection.tsx`의 px·Lab/LCh·gain·확률 노출을 제거 대상으로 확정(원칙 4가 정본 §9보다 우선, 제품 오너 확정). Phase 0에서는 최소한 신규 숫자 노출 차단 + 제거 계획 확정, 실제 철거는 §10.7-3 단일 결정에 따라. **이 항목이 관문("모든 숫자에 출처·유보")의 실제 범위**임을 명시.
7. **스펙 동기화**: `AURA_FACE_CAPTURE_LAB_SPEC` §4.3(사후 pitch 8°로 기술 — 코드는 12°)·§5(제거된 CocoaPods MediaPipe 경로를 현행으로 기술) 낡은 서술 갱신. `hApprox 0.40` 잔존 타입/네이티브 방출 정리(현행은 G/Sn/Me 3상수, hairline은 실계산 — 오늘 커밋 0ffa1011에서 hApprox 제거됨).

**관문**: 사용자 화면의 모든 숫자에 출처 또는 유보가 있다 + 신규 숫자 노출 없음.

### Phase 1 — 2D 측정 강화: z좌표 포즈 정규화 🟡 구현·수집 준비 GO (PR #27 OPEN, 실기기 관문 PENDING)

**구현·검토 기록**: commit `31515d84`에서 Unity→mobile 478점 `{x,y,z}`+row-major 4x4 행렬, 전체 랜드마크 정면화, H/G/Sn/Me 재계산, exact ordered canonical 10-shot replay, 로컬 가명 raw artifact·보존/삭제 정책을 구현했다. `FACE_RATIO_JUDGMENT_VERSION`은 보정 저장 최초 커밋에서 `face-length-judgment/v3-pose-normalization-validation-20260717`로 상향됐다. Codex 적대 리뷰는 10-shot 전체 tuple 순서 검증 등 발견 4건을 반영한 뒤 GO, Claude `claude-fable-5` high 독립 리뷰(session `8519bd29-96ae-4098-898d-c9494ea9f28d`)는 blocker 0으로 GO. 검증 근거: `npm run mobile:test:face-ratio-phase1`, `npm run mobile:test:face-ratio-distortion`, `npm run mobile:test:face-analysis-measurements`, `npm run mobile:test:unity-bridge`, Objective-C++ syntax 검사, `git diff --check`. **관문 분리**: 코드는 검증 가능 상태지만 플래그는 정확히 `validation-only`만 허용하고 기본 OFF이며, `diagnostic_only_unvalidated` 보정 결과는 제품 저장·backend·AI에서 차단된다. 실기기 paired MAD·MAE, Unity 행렬 convention 런타임, 8°/12°/잔여-pose confidence 비교는 **UNVERIFIED**.

1. **구현됨 — 478점+행렬 정면화**: MediaPipe 478점 `{x,y,z}`와 `output_facial_transformation_matrixes` 4x4 행렬을 Unity에서 직렬화하고 mobile에서 affine bottom row `[0,0,0,1]`, reflection/singular/orthogonality/shear/non-uniform scale을 fail-closed 검증한 뒤, 키포인트 추출 전에 전체 점을 정면 좌표로 역변환한다. 동일 R/Rᵀ를 쓴 왕복 RMS는 구현의 수치 안정성 진단일 뿐 행렬↔랜드마크 correspondence를 독립 검증하지 않으며, 실제 convention·효과는 paired 실기기 관문으로만 판정한다. 정규화→픽셀은 `x_px=x×W, y_px=y×H, z_px=z×W`; z는 카메라 절대 깊이가 아니라 weak-perspective 상대 깊이이므로 같은 프레임의 3D 비율·정면화에만 사용한다. 기존 roll 보정은 기본 제품 경로에 유지되고, 새 경로는 검증 플래그 안에서만 비교된다.
2. **MediaPipe z 품질은 가설로 취급**: 역회전 시 y' ≈ y·cosθ − z·sinθ 이므로 z의 오차·스케일 불일치가 sin(pitch)에 비례해 세로 거리로 **직접 유입**되며 비율에서 약분되지 않는다(약분되는 것은 전역 스케일뿐). Phase 1 관문(재현성 + 정면 수렴)이 이 가설의 검증 장치 — 개선이 없으면 cos 근사 보정으로 후퇴.
3. **keypoint confidence 실측화 (§0-8) — 미완료, 후속 관문 유지**: MediaPipe FaceLandmarker는 per-landmark confidence를 제공하지 않는다. 제품 기본 경로는 `LEGACY_UNCALIBRATED_KEYPOINT_CONFIDENCE`(G .82/Sn .82/Me .84)를 계속 사용한다. v5 구현은 미검증 정규화 결과를 confidence 0·`indeterminate`로 강등하고 비강체 행렬을 fail-closed해 과신을 막았을 뿐, confidence를 실측화하지 않았다. 후보군 산포 방식은 해부학적 정점 차이를 검출 노이즈로 오인하므로 계속 기각한다. 후속 후보는 (a) 셔터 직전 동일 랜드마크 멀티프레임 지터, (b) 3D 정렬 reprojection residual이며 실제 표본에서 검증해야 한다.
4. **촬영 거리 문제 인지**: 30cm 셀피는 1.5m 대비 코 밑너비를 ~30% 과장(Selfie Effect, §5 A-8). 포즈 정렬로는 원근(거리) 왜곡이 완전 제거되지 않으므로, 거리 가이드 UX 또는 TrueDepth 거리 보정을 Phase 2와 연계 검토(정본 거리 게이트 = §10.2).

**Phase 0 산출물과의 연동(2026-07-17, Codex 정합 검토로 보강)**:
- **판정 버전 상향 의무 — 충족**: 보정 결과 저장 최초 커밋 `31515d84`에서 `FACE_RATIO_JUDGMENT_VERSION` v3 상향. 스냅샷 렌더·버전 불일치 안내가 과거 결과를 보호한다. 서버 normalizer의 `judgmentVersion` 미보존은 기존 의도대로이며, 제품 승격 시 규칙·증거 추적 요구와 함께 재검토한다.
- **band·confidence 처리 순서 — 검증 레인 결정**: `faceLengthJudgment.band`는 pose **편향** 구간, confidence는 검출 **노이즈**로 별개 축이다. 현재 미검증 정규화 경로는 보정 후 잔여 pose 정보를 보존하되 판정과 confidence를 각각 `indeterminate`·0으로 강등한다. 실기기 오차 모델이 생기기 전에는 band 축소를 제품 의미로 사용하지 않으며, 승격 시 강등 유지와 검증된 band 확대 중 하나를 재결정한다.
- **§6-5 hairline 8° — 단순 상향 금지**: 이 8°는 차단 게이트가 아니라 **confidence의 poseQuality 정규화 분모**다(`AURAFaceRatioHairline.m:44`) — 12°로 올리면 같은 촬영의 신뢰도가 인위적으로 상승한다. Phase 1 실기기 검증에서 8/12/잔여-pose 세 모델을 비교해 결정한다.
- **재사용 자산 — 배관 완료**: `StillFaceLandmarkService`의 478점 x/y/z + transformation matrix를 더 이상 Euler로만 축약하지 않고 validation payload에 직렬화한다. 제품 wire와 분리된 검증 경로다.
- **실시간 지터 제약(§3-a 전제 수정)**: 실시간 캡처 계약은 478점이 아니라 **축약 10점 + 최신 단일 프레임**만 방출 — 멀티프레임 G/Sn/Me 지터 기록에는 네이티브 ring buffer(또는 별도 진단 payload)가 선행 배관.
- **원시 랜드마크 저장 정책 — 구현 완료**: paired replay용 478점·행렬은 제품 payload와 분리된 `__DEV__` 로컬 스키마에만 저장한다. subject/capture/cohort/session ID는 가명 패턴을 강제하고 보존기한 1~30일·prune/delete·`sourceImagesIncluded:false`·Git 제외를 적용한다.

**관문(핵심 검증) — PENDING/UNVERIFIED, 2축**: 준비된 canonical exact ordered 10-shot 스크립트로 팀원 **다양성 확보 표본**(§6-11: 성별·연령·인구집단 편향 회피, 3~5명은 최소 하한이지 목표 아님)을 촬영한다. 동일 raw 입력을 보정 전/후 재실행해 (1) 동일인 MAD 감소, (2) 정면·표준거리 기준 MAE 수렴을 함께 확인한다. MAD만 개선되고 MAE가 개선되지 않으면 z 가설을 기각하고 cos 근사 후보로 후퇴한다. 이번 PR은 수집 스크립트 준비까지만 수행했으며 이 관문을 통과했다고 주장하지 않는다.

### Phase 2 — TrueDepth 확장: 신뢰 축 이동 🟡 검증·승격 배관 GO (PR #27 OPEN, calibration PENDING/OFF)

**구현·검토 기록**: commit `31515d84`에서 `valueMm` 독립 robust 집계와 전용 confidence/frameCount/MAD, native→Unity→mobile→backend sensor provenance, unified exact-30 evidence adaptor, 1/3/5/8/12/30 repeatability, Gate 6B dry-run promotion, approved immutable policy/gate+Gate-selected-frame binding, profile hash·app/build·사용자/보고서 문맥 HMAC receipt, expiry·nonce·원자적 one-time consumption을 구현했다. mm/sensitivity-3와 receipt 내부 증거는 외부 모델 입력·consulting cache hash·사용자 응답에서 제거한다. Codex는 provenance/product tuple parity·consulting 필터/hash·selected-frame policy binding 수정 후 GO, Claude Fable high는 blocker 0 GO. 검증 근거: focused backend `47 passed`, consulting privacy `10 passed`, `npm run mobile:test:face3d`, `npm run face3d:test:calibration` 21/21, `npm run face3d:test:repeatability` 12/12, `git diff --check`. **관문 분리**: Unity는 calibrated receipt를 방출하지 않고, mobile/backend promotion flag는 false, signing-key/approval-artifact 승인값과 backend secret은 비어 있으며 gate status는 `pending/not_run/off`. 실기기 Gate 6B cohort·실측 mm 오차 프로파일·실제 승인 artifact/HMAC receipt는 **미수행**.

0. **[배관 구현·승격 PENDING] Face3D confidence calibration 워크스트림** — v3 제품 후보의 검증·서명·소비 계약은 구현됐지만 Unity는 계속 `uncalibrated`를 방출하고 제품 flag가 OFF이므로 "신뢰 축" 승격 전에는 Phase 2 지표가 제품에 못 실린다. 3요소의 현행 상태:
   - **(a) 합격선 = Gate 6B 사전 등록 기준 전문을 따른다 — 재기술 금지.** 본 계획 초안이 기준을 요약하며 "median bias ≤ between-subject spread"로 적어 **원문("spread의 10%")을 10배 완화**하고 p95 bias ≤ 25%·실패율 5%p·p95 capture window 500ms·독립 validation cohort 조건을 누락했다(리뷰 확인). 정본은 [AURA_UNIFIED_FACE_CAPTURE_IMPLEMENTATION_PLAN_KO.md](../../face3d/AURA_UNIFIED_FACE_CAPTURE_IMPLEMENTATION_PLAN_KO.md) §Phase 6B — 이 문서가 유일 기준이며 본 계획은 참조만 한다.
   - **(b) calibration = confidence 함수 자체의 재보정 — 구조 분리 구현, 데이터 재보정 미수행.** completion과 quality를 분리하고 valueMm 품질도 독립 집계하도록 바꿨지만, Gate 6B 실기기 validation으로 함수가 보정된 것은 아니다. 상태 문자열만 바꾸는 승격은 계속 금지한다.
   - **(c) 서버측 강제 — 구현 완료·승격 OFF.** promotion 도구는 Gate 6B가 선택한 frame 수가 immutable product policy tuple과 일치하는지 확인하고 그 tuple·증거 bundle·calibration model을 approval artifact에 묶는다. profile hash는 선택된 profile 본문(sensor provenance·valueMm 품질 포함)을 canonical hash하고, receipt가 이 hash와 policy/gate·approval artifact SHA·`receiptId`·capture nonce·발급/만료·사용자/보고서 문맥을 함께 HMAC 서명한다. backend는 report insert 트랜잭션에서 receipt를 원자적으로 한 번만 소비한다. mobile의 signing-key/approval-artifact 승인 set은 비어 있고 backend approval artifact/key/secret은 미설정이며 promotion flag가 OFF라 calibrated 자기선언은 fail-closed 차단된다.
   - **선행 배관 — 구현 완료**: `unified_face_capture_completed` logger/adaptor가 exact-30 결과를 repeatability manifest로 변환한다.
   - **증거 파이프라인 — dry-run 준비 완료, 실제 증거 없음**: `promote-face3d-calibration.mjs`와 계약 테스트가 `repeatability-{1,3,5,8,12,30}.json`·독립 cohort·Gate 6B 기준·approval artifact·receipt chain을 검증한다. `FACE3D_GATE_STATUS.json`은 의도적으로 `receiptPath:null`, `receiptSha256:null`, `validationStatus:not_run`, `featureFlagDefault:off`다.
1. **Face3D 파이프라인에 얼굴 길이비·세로 3분할 대응 지표 추가** — 위 0의 승격 통과 후.
2. **헤어라인 예외 — 동일 샷 융합 경로 부재(2026-07-16 리뷰 확인)**: 머리카락은 IR 흡수로 TrueDepth가 못 잡음 → H만 Apple hair matte와 융합하는 하이브리드. **단 현재 아키텍처에서 같은 샷의 Face3D+matte를 동시에 얻을 수 없다** — Face3D는 Unity ARKit이 카메라를 소유하고, matte 캡처는 Unity를 pause시킨 뒤 네이티브가 카메라를 인수하는 구조(카메라 배타 소유). 선결 결정: (a) **별도 샷 폴백** — matte 샷을 따로 찍고 시차·정렬 오차를 수용, vs (b) **ARFrame 동기 네이티브 브리지** — Unity ARFrame에서 matte를 생성(Unity 측 작업 수반). 정본 S5 캡처(헤어 올린 정면)가 이 문제 자체를 우회하는 상위 해법(§10.2) — S5 채택 시 matte 융합은 S5 없는 사용자의 폴백으로만 남는다.
3. **mm 병렬 저장 — 전 구간 계약 구현 완료, 제품 비노출**: Unity evaluator가 `(normalized, rawMeters)`를 함께 계산하고 `Face3DProfileCollector`가 rawMeters를 별도 robust 집계한다. **v3 wire/RN/backend만** `valueMm`과 전용 confidence/frameCount/MAD를 신뢰 후보로 보존하며 backend가 `face3d.{key}.mm` sensitivity-3 엔벨로프를 만든다. v1/no-schema와 레거시 v2는 이 승격 경로를 탈 수 없다. 외부 모델과 consulting cache/model payload에서는 `valueMm`·receipt·nonce·profile binding·서버 검증 상태를 제거하고, 사용자 response에서는 `.mm` suffix 내부 필드를 재귀적으로 제거한다. R3 `regionBboxes`는 Phase 1 정렬 전 원본 픽셀 좌표를 유지해야 하는 B2/B4 계약을 계속 따른다.
4. **오차 프로파일**: 캘리퍼/자 실측 대비 부위별 오차 측정(눈 사이 거리·얼굴 폭 등 큰 치수부터). 산출물 = 부위별 신뢰 가능/불가 목록. 문헌 기대치: 표면 편차 ~0.4mm, 거리 측정 오차 0.88~9.07%(각도 의존) (§5 C-1).
4-b. **홍채 스케일 병행(정본 §7-1) — 오차 전제 정정(리서치)**: 홍채 가로 지름(HVID) ~11.7mm·개인차 ±0.5mm는 안과 문헌 확인이나 **두 정정 필수**: (1) "인구집단 편차 작다"는 **반박** — 동아시아 HVID는 ~11.1~11.3mm로 11.7mm 가정 시 **+4~5% 체계(방향성) 편향**(한국 사용자 대상 앱은 지역 보정 HVID 사용 또는 사용자 캘리브레이션 권고), (2) 홍채 4.3%는 **거리 추정** 오차이지 얼굴 길이 mm 오차가 아니다 — 얼굴 mm 환산 실측은 별도로 존재(수평 MAPE 2.9%/수직 4.3%, PMC10447546). 귀결: 홍채와 **같은 정면 평면의 수평 거리**만 ~3%로 신뢰, **깊이가 다른 부위(코높이·턱길이)는 단일평면 스케일로 환산 시 편향 누적** → confidence 하향. "리포트 용도 충분"은 부위별 실측 검증 전까지 **가설로 강등**. 3단 폴백: 홍채(전 기기, 정면 수평) → TrueDepth(지원 기기, 입체) → 미지원 항목 AI 추정 표기.
5. **2D/3D 이중 경로 정책**: 동일 지표 충돌 시 TrueDepth 우선, 폴백은 confidence 하향, 결과에 `source` 명시.

**관문 — PENDING/OFF**: (0) 실제 Gate 6B 증거·제품 오너 승인 artifact·유효 HMAC calibration receipt가 존재하고 calibrated 프로필이 backend를 통과, (4) 캘리퍼/자 실측 기반 부위별 mm 오차 프로파일 문서가 존재해야 한다. 현재는 배관/dry-run만 GO이며 두 관문 모두 미통과다.

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

1. **기본값(모든 사용자)**: 자기 얼굴 내부의 상대 비교 + 지각 특징 서술 — 인구 기준 자체가 불필요한 서술 구조(§9)가 1차 방어선. 이것만으로 제품이 성립해야 한다. **단 얼굴 길이비는 스칼라 1개라 자기내부 비교 대상이 없다**(세로 3분할은 부위 3개라 가능). 따라서 기준 밴드 없는 locale에서는 모집단 게이지와 길이형 판정을 숨기고, 동일 사용자·동일 측정 계약의 자기이력이 2건 이상일 때만 방향성 변화 서술을 제공한다. 이 결정은 데이터 승인 전 기본값이며 norm feature flag는 OFF다.
2. **상수 교체 = 자체 촬영셋 mean±SD (제품 오너 확정 2026-07-16)**: 1.351/1.455/1.506은 1차 출처 부재(§0-1). 문헌 인용 대신 **앱과 동일한 2랜드마크**(헤어라인 idx10·턱끝 / 볼 idx234-454)로 자체 촬영셋의 `mean±SD`를 산출해 `avg=mean, wide<mean−1SD, long>mean+1SD`로 재정의 — 측정 조건·랜드마크 정의가 완전 일치하는 유일한 방법. 즉시 인용 앵커(수집 전 잠정): 한국 여성 실측 1.37(187.05/136.6)·임상 균형 1.33~1.43(현 avg 1.455는 과대). **캐비엇**: 볼폭(idx234-454)이 완전 광대폭(zy-zy)보다 좁으면 측정비율이 올라가므로 반드시 실측 캘리브레이션으로 확정. 세로 3분할 0.8은 기준 자체를 폐기(§0-3, 자기내부 서술로 대체).
3. **locale별 부트스트랩(옵션, 후순위)**: 사용자 자기선택 locale에 해당하는 실측 문헌이 있을 때만 잠정 기준 밴드 제공. 한국 locale은 Choe 2004·한국 계측 연구군·Size Korea(§5 B)가 후보 — 랜드마크 정의의 파이프라인 일치 검증 필수. 타 locale은 Farkas 국제 데이터 등 해당 인구 문헌 확보 전까지 기준 밴드 미제공(자기상대 서술만). **얼굴에서 인종 추론 금지 — locale은 자기선택만.**
4. **수렴(장기)**: 우리 파이프라인으로 측정된 자체 사용자 분포를 locale 세그먼트로 축적 → 백분위 기반 상대 위치로 전환. 측정 조건 동일 + 모집단 일치라는 두 조건을 모두 만족하는 유일한 기준.
5. **이론적 뒷받침**: "매력적 비율 = 모집단 평균 비율"(Pallett 2010)은 글로벌 맥락에서 오히려 강해진다 — 기준은 보편 상수가 아니라 **모집단의 함수**라는 뜻이므로, locale별 분리가 원리적으로 정당하다. 단 Pallett 2010은 백인 여성 얼굴 자극 기반 — 원리의 외삽이지 각 모집단 직접 검증이 아님을 명시. 서구 기준·황금비·신고전 캐논은 도입 금지.

## 4. 순서·의존성

- Phase 0: ✅ 완료(PR #21·GO). 관문 실범위 재조정 기록은 유지: **관문 실범위 재조정(트랙 경계 B1, 2026-07-17)**: 게이지 로직 추출 + 상수 통합(서버 임계 포함 여부는 Phase 0-1 결정)까지가 측정 트랙 소유. **`MeasurementDetailSection` 철거와 `FaceAnalysisReportDetailScreen`의 숫자 정리는 보고서 재구성 트랙(R4)에 위임** — 측정 Phase 0은 해당 화면들에 "신규 숫자 노출 차단"만 책임진다(두 트랙이 같은 파일을 고치는 충돌 방지 — 재구성 계획 §2-B1).
- Phase 1 ↔ 2: **병렬 구현 배관 완료(PR #27 OPEN), 실기기 관문은 별도 PENDING** — 공통 충돌면 5파일(`FaceCaptureLabApp.tsx`·`unityMakeupBridge.ts`·`faceAnalysisMeasurements.ts`·백엔드 `face_analysis_measurements.py`·`openai_analysis.py`)을 단일 커밋/소유 경로에서 통합해 좌표·행렬, profile/valueMm, privacy filter 충돌을 해소했다. 준비된 세션 순서는 **"Phase 1 canonical 다각도 10-shot → 별도 diagnostics exact-30 정면 반복"**이며 캡처 통합이 아니라 방문만 통합한다. 정면 exact-30은 Phase 1의 정면 기준 샷으로만 재사용 가능하다. 다음 수집 작업은 **새 세션에서 본 v5를 유일한 시작 입력**으로 삼고, v5가 `docs/face3d/FACE_MEASUREMENT_PHASE1_PHASE2_COLLECTION_RUNBOOK_KO.md`와 `scripts/face3d/prepare-face-measurement-collection.mjs`로 라우팅한다. 이번 로컬 작업은 이 스크립트와 fixture 준비까지만 수행하며 실제 촬영을 자동 완료로 기록하지 않는다. Phase 2 제품 소비는 calibration 승격 전 계속 차단한다.
- Phase 3 매핑 테이블: 코드 독립적 — 기획이 지금부터 병렬 시작 가능. 근거 자료는 §5 완비. 미반입 제2 정본은 이번 구현을 막지 않으며 본 v5의 근거 등급·어조·3채널 안전 기본값을 대체 정본으로 사용한다.
- Phase 4-1(부트스트랩): Phase 3 매핑에 기준 밴드가 필요해지는 시점에. 4-2는 데이터 축적 시간. **Phase 0의 상수 잠정값은 Phase 4에서 자체 촬영셋 mean±SD로 교체(§4 Phase 4-2)**.
- **법률 검토(§6-10): 현재 스코프 제외** — 미국/EU 실서비스 출시 시 재활성화(선행 조건 아님).

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

### D. 얼굴 길이비·세로 3분할 기준값 (2026-07-16 워크플로 리서치)

| # | 주장 | 핵심 출처 | 강도 |
|---|---|---|---|
| D-1 | 얼굴 길이비 상수 1.351/1.455/1.506은 **1차 출처 부재** — 형태학 얼굴지수(비율 0.80~0.95) 아님(앱은 physiognomic 헤어라인→턱끝/광대폭). 미용 얼굴형 heuristic(oval≈1.5:1)에 근사한 임의 하드코딩 추정 | 완전일치 검색 0건; [pocketdentistry](https://pocketdentistry.com/evaluation-of-the-face/)(광대폭=총얼굴높이 70~75% → 1.33~1.43) | medium |
| D-2 | 앱 정의(헤어라인/광대폭)의 한국 여성 실측 앵커 ≈ **1.37**(전체길이 187.05±8.20mm / 광대폭 136.6±4.9mm) — avg 1.455는 과대 | [Kim 2003 Ind Health 41:8-18](https://www.jstage.jst.go.jp/article/indhealth1963/41/1/41_1_8/_pdf), [Ann Dermatol 2021 PMC7875215](https://pmc.ncbi.nlm.nih.gov/articles/PMC7875215/) | strong(실측)/medium(교차조합) |
| D-3 | **1:1:0.8은 실측 아님 — 한국 성형광고 파생 관행값**(1:1:0.9→0.85→0.8 광고 경쟁, 전문의가 "선풍기 괴담"으로 규정) | [코메디닷컴 2022](https://kormedi.com/1416709/) | strong(정체 규명) |
| D-4 | 실측 세로 3분할은 하안부가 중안부와 **같거나 김** — Farkas 백인 여성 29.6:33.6:36.7(하안부 최대), 한국 20대 여성 0.85:1:**1.0**·60대 0.84:1:1.06, 앱 G-Sn/Sn-Me 임상관행 45:55, 아랍 중:하=1:1.13~1.20 | [Qoves/Farkas](https://www.qoves.com/insights/measurements/facial-thirds), 김애경·이경희 2010 감성과학 13(3), [PMC4369102](https://pmc.ncbi.nlm.nih.gov/articles/PMC4369102/) | strong |

### E. 홍채 스케일 mm 환산 (2026-07-16 워크플로 리서치)

| # | 주장 | 핵심 출처 | 강도 |
|---|---|---|---|
| E-1 | HVID 개인 내 SD ≈ 0.4~0.5mm이나 **동아시아 평균은 백인 대비 ~0.5mm 작음**(백인 11.75 / 중국 11.26 / 일본 11.10mm) → 11.7mm 고정 시 한국 사용자 mm 스케일 **+4~5% 체계 편향** | [PMC4877715](https://pmc.ncbi.nlm.nih.gov/articles/PMC4877715/)(n=4787), [PubMed 25325762](https://pubmed.ncbi.nlm.nih.gov/25325762/) | strong |
| E-2 | MediaPipe Iris 4.3%는 **거리(depth) 추정** 평균상대오차(SD 2.4%)이지 얼굴 길이 mm 오차가 아님 | [Google Research MediaPipe Iris](https://research.google/blog/mediapipe-iris-real-time-iris-tracking-depth-estimation/) | strong(1차) |
| E-3 | 홍채 스케일로 얼굴 길이 mm 환산 실측: 수평 MAPE 2.9% / 수직 MAPE 4.3%(정면 한정), 깊이 다른 부위는 미보정 시 추가 오차. IPD(동일 깊이)는 최우수 앱 MAE 0.51mm | [PMC10447546](https://pmc.ncbi.nlm.nih.gov/articles/PMC10447546/), [PMC10389117](https://pmc.ncbi.nlm.nih.gov/articles/PMC10389117/) | medium~strong |

### F. 센서·좌표 계약 (2026-07-16 워크플로 리서치)

| # | 주장 | 핵심 출처 | 강도 |
|---|---|---|---|
| F-1 | ARKit face tracking은 iOS 14+/A12+에서 **TrueDepth 없이 동작**, mesh API 동일(`capturedDepthData`만 센서 차이), Apple은 정확도 동일성 미보증. 런타임 provenance는 `builtInTrueDepthCamera` 존재 + `capturedDepthData` 관측 비율 조합으로 기록(내부 센서 사용 판별 공식 API 없음) | [ARFaceTrackingConfiguration](https://developer.apple.com/documentation/arkit/arfacetrackingconfiguration/) | strong(공식) |
| F-2 | MediaPipe z는 머리 중심 원점 상대 깊이(weak-perspective), 픽셀 복원은 **z×width**(x와 동일 스케일). per-landmark confidence는 **미제공**(Pose Landmarker에만 존재) | [MediaPipe Face Mesh 계약](https://chuoling.github.io/mediapipe/solutions/face_mesh.html) | strong(공식) |

## 6. 리스크·미해결

1. **ARKit 메쉬의 모델 피팅 편향** — 애플 메쉬는 형태 모델 피팅 결과라 개인별 계통 편향 가능성(미검증 가설). Phase 2 오차 프로파일에서 간접 확인. 재현성 관점에선 사진 대비 우위 확실.
2. **정점 앵커링** — "정점 15 = nasion"류 대응은 17캡처 검수 기반, 얼굴형 분포 꼬리에서 미검증. 임상 캘리퍼도 측정자 간 mm 편차가 있는 영역(계측 내재 한계).
3. **헤어라인** — TrueDepth로 원리적 미해결(IR 흡수). hair matte 융합 품질이 얼굴 길이비의 병목으로 남음.
4. **브랜치 형상 — PR #27 OPEN**: Phase 1∥2 구현은 `feature/WEI/face-measurement-phase1-phase2-0717` commit `31515d84`에서 시작했고, 2026-07-17 로컬 확인 기준 `origin/dev`는 `ecaba62e`다. PR #27 적대 리뷰 hardening과 본 v5를 같은 PR에 포함한다. 아직 머지 전이므로 dev 반영 완료로 간주하지 않으며, 최종 push 뒤 exact head SHA·mergeability·CI·dev drift를 다시 기록한다.
5. **AURAFaceRatioHairline.m의 pitch 정규화 8° 잔존** — 8~12° 촬영의 헤어라인 confidence 저평가. **주의(Codex 정합 검토)**: 이 8°는 게이트가 아니라 confidence 분모라 단순 12° 상향은 신뢰도 인위 상승 — Phase 1 실기기 검증에서 8/12/잔여-pose 모델 비교로 결정(연동 문단 참조).
6. **MediaPipe z·행렬 runtime 품질 미검증** — 정렬 코드·reflection/singular/orthogonality fail-closed 검사는 구현됐지만 실기기에서 Unity 행렬 convention과 z 노이즈가 개선을 만드는지는 미확인이다. paired MAD·MAE 관문 미달 시 제품 flag를 열지 않고 cos 근사 후보로 후퇴한다.
7. **플랫폼 범위** — 현재 앱은 iOS 전용. Phase 1의 "폴백"은 non-TrueDepth iOS 기기 대상이며, Android 확장 시 Phase 2의 "TrueDepth = 신뢰 축" 전제는 전면 재검토 사안.
8. **왜곡 보정 기획서 v1.0과의 결정 충돌 — 검증 레인만 승인, 제품 승격 미승인.** `AURA_FACE_RATIO_DISTORTION_CORRECTION_PLAN_KO_v1.0.md` §6.2의 pitch/yaw 보정 제외 결정과 충돌하므로 v5 구현은 정확한 `validation-only`·기본 OFF·제품 payload 차단으로 한정했다. 제품 경로 활성화는 paired MAD·MAE가 모두 개선되고 제품 오너가 별도로 재결정할 때만 가능하다.
9. **왜곡 방지 게이트의 기획-구현 드리프트** — 기획서는 ARKit FaceAnchor 게이트(±5/6/3°) + 거리 35cm 게이트 + Sn–principal point 정렬을 확정했으나, ARKit 취소로 현재는 MediaPipe 게이트(8/12/5°)이고 미터 단위 거리 게이트는 미구현(타원 프레이밍이 간접 대용), principal point는 "ARKit 재도입 대비" 코드로만 잔존. **Selfie Effect(§5 A-8) 방어가 기획 의도보다 약한 상태** — Phase 1 §4의 거리 가이드 검토와 직결.
10. **글로벌 생체정보 규제 — 현재 스코프 제외 (제품 오너 판단 2026-07-16), 단 범위 한정 재기술(외부 리뷰 반영).** 얼굴 기하 측정치는 원리적으로 GDPR 특수범주·미국 주법(일리노이 BIPA 등) 규율 대상이 될 수 있으나, 제품 오너가 현 단계(부트캠프 최종 프로젝트, 미국 상용 출시 아님)에서 **법률 검토 게이트**를 과설계로 판단해 착수 선행 조건에서 제외한다. **단 이 제외의 범위는 "법률 검토"에 한정되며 다음 둘은 면제되지 않는다**(2026-07-16 외부 리뷰 이의 반영): (a) **Apple 스토어 요건** — ARKit 얼굴 추적 사용 자체가 얼굴 데이터 사용을 설명하는 개인정보처리방침을 요구([Apple ARKit 문서](https://developer.apple.com/documentation/arkit/arfacetrackingconfiguration/)) — 이는 법역과 무관한 앱 제출 게이트다. (b) **의도된 기술 가드** — 현행 계약의 `longTermRawFrameStored: false` 리터럴 강제·삭제 파이프라인·privacy-strip 테스트는 법률 회피용이 아니라 의도된 제품 결정이므로, 완화는 "법률 스코프 제외"의 자동 귀결이 아니라 **별도 제품 오너 명시 결정 + 처리방침 문구 갱신**을 요구한다(§10.7-1). BIPA §15(b) 서면 동의·§15(a) 보존 정책 공개·GDPR Art.28/Chapter V 체크리스트는 §5 리서치 원자료에 보존(미국/EU 실서비스 출시 시 활성화).
11. **측정 파이프라인의 인구집단 편향** — MediaPipe·ARKit 모두 학습/설계 분포가 공개되지 않아 인구집단별 정확도 차이가 미검증(홍채 HVID 동아시아 편향 §5 E-1이 실증 사례). Phase 1·2의 재현성/오차 검증 표본을 팀 내부 소수로만 잡으면 이 편향을 못 본다 — **검증 표본의 성별·연령·인구집단 다양성 확보를 관문 설계에 명문화**(Phase 1 관문의 "3~5명"은 최소 하한이지 목표 아님). *§6-11이 요구한 다양성을 Phase 1 관문이 무시하던 자기모순 해소.*
12. **PR #27 적대 리뷰 hardening** — legacy v1/no-schema의 외부 모델 sanitizer, v1 `.mm` 승격 차단, 레거시 v2와 신규 v3 분리, 사용자 응답의 재귀 `.mm` 제거, pose 행렬 affine bottom row·shear·non-uniform scale·reflection fail-closed와 수치 왕복 진단, validation source/tmp artifact 정리, 불완전 shot 재촬영 보장, Unity 임베디드 v3 preflight, CI에 Phase 1·calibration·Unity 정적 계약 suite 편입을 반영했다. 수치 왕복은 correspondence 증거로 과대해석하지 않는다. 잔여 비차단 후보(TS 키포인트 native clamp 차이, 구 Unity serializer z 결측 호환성, RN requestId 기반 nonce, receipt 최대 수명 상한)는 최종 이중 GO에서 다시 판정하고 제품 승격 전 해소한다.

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

Tier-2(3D) 미가용 기기용 `noseLengthRatio`/`noseWidthRatio` 2D 근사. Phase 1의 validation-only 구현 존재만으로는 신뢰할 수 없으므로 paired MAD·MAE 실기기 관문 통과 후에만 착수한다.

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

관찰 항목마다 `{attribute, value, confidence, visualEvidence}` — `visualEvidence`는 "무엇을 보고 판단했는지" 한 줄 서술을 **필수**로 하여 환각을 구조적으로 억제한다. confidence 낮은 관찰은 해석 융합에서 자동 제외. **구현 간극(리서치 + 2026-07-16 리뷰 반영)**: 현행 `Insight` 스키마(백엔드 [face_analysis_v2.py](../../../services/backend/app/schemas/face_analysis_v2.py):84-89 5필드 / 모바일 `faceAnalysisV2.ts` 동일)에 **`visualEvidence`가 없다**. 초안의 "`str|None` 추가 + 프롬프트로 필수화"는 자기모순(Optional 타입은 구조적 강제가 아님)이라 **철회** — 올바른 설계: `Insight`는 규칙 기반 `DerivedResult`와 공유되므로 **`PerceptionInsight`를 분리**하고 거기에만 **non-empty `visualEvidence`를 스키마 레벨 필수 검증**(빈 문자열 거부 validator). + `PERCEPTION_PROMPT_VERSION` 버전업(캐시 자동 미스).

### 8.3-b AI 호출 구조 (정본 설계 §10 확정 사항 채택)

단일 거대 호출 금지 — **3단 분리 호출**: ① 질감·외관(사진 위주) → ② 인상 종합+퍼스널컬러(①결과+온디바이스 수치 동봉) → ③ 컨설팅(①②결과). 각 단계 구조화 출력(스키마 강제, 산문 금지). 분리해야 부분 재분석이 성립한다(드레이핑 후 퍼컬만 재판정, 취향 변경 시 컨설팅만 재생성). 현재 로컬 실행 범위는 provider가 `disabled`인 deterministic fixture runner이며, 이미지는 프로세스 내부에서 한 번 읽어 stage 간 재사용하고 외부 업로드를 하지 않는다. 실제 외부 provider의 file 참조·비용 최적화는 사용자가 별도로 provider와 전송 범위를 승인한 뒤의 후속 작업이다. Bedrock adapter·AWS 전송·cloud 실행은 이번 계획 범위에서 제외한다.

### 8.4 융합 규칙

1. 기하학적 사실은 **측정이 항상 우선**. AI 관찰이 측정과 충돌하면 해당 관찰 폐기 + conflict 로그(프롬프트 개선 신호).
2. AI는 측정 공백(정성 속성)만 채운다 — 역할 중첩 금지.
3. 저장 시 `measurements`와 `aiObservations`를 분리 필드로 — 모든 최종 서술은 출처(측정/관찰/융합)를 추적 가능해야 한다.
4. 사진의 외부 AI 전송은 개인정보 처리 — 동의 정책은 앱 전역 포괄동의로 확정(기능별 게이트 미도입, 정본과 일치). **간극(리서치)**: 현행 AI 경로(analysis.py → face_analysis_pipeline → face_analysis_ai → openai_analysis)에는 **consent 조회·전달이 0건**이고 `user_consents` 테이블은 상품 개인화 전용 2종만 적재(face-analysis용 consent_type 없음). 법률 스코프 제외(§6-10) 하에 기능별 게이트는 만들지 않는다. 초안의 "`input_hash`에 `consentVersion` 포함 = 감사 추적" 기술은 **정정**(2026-07-16 리뷰): input_hash는 단방향 SHA-256이라 동의 버전·시각·사용자를 복원·입증할 수 없다 — 그것은 **캐시 무효화 수단**일 뿐이다. 감사 추적이 필요해지는 시점(실서비스 출시)에는 **별도 consent snapshot 레코드**(버전·시각·사용자·정책 문서 참조를 평문 컬럼으로)가 정답 — 현 스코프에서는 실행 항목 아님, 설계 노트로만 보존.

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

## 10. 정본 설계(얼굴분석-설계.html v1) 정합 — 본 계획에 없던 보충 항목

정본 설계는 신규 파이프라인의 전체 그림이고, 본 계획(Phase 0~4)은 **기존 구현의 개선 + 정본으로 가는 가교**다. 아래는 정본에 있고 본 계획에 빠져 있던 것들의 채택 기록.

### 10.1 계층 어휘 채택 — L0~L3

본 계획의 "측정/해석" 2층을 정본의 4층으로 세분해 사용한다. 판별 기준이 명확해 항목이 섞이지 않는다:

| 계층 | 정의 | 판별법 | 본 계획 대응 |
|---|---|---|---|
| L0 측정 | 단위 있는 숫자 | "각도 −3°, 비율 1.08"로 쓸 수 있으면 측정 | 측정 계층 |
| L1 1차 분석 | 규칙 라벨 | 임계값 표만으로 사람 없이 계산 (얼굴형, 웜/쿨) | §7 스코어러 |
| L2 2차 분석 | 지각 판단 | "~해 보이는지"로 끝나는 문장 (인상, 분위기) | §8 AI 관찰 + §9 |
| L3 컨설팅 | 처방 | "그래서 뭘 하라" (메이크업/헤어/패션) | Phase 3 기법 추천 |

특히 정본의 **"실측 vs 시각 인상 괴리" 항목화**(예: 실측 눈꼬리 각도(L0)를 동봉하고 "보이는 인상의 눈꼬리는?"(L2)을 묻기)는 본 계획 원칙 3(지각이 해석의 축)의 구체 실행법이므로 그대로 채택.

### 10.2 멀티샷 캡처 프로토콜 — 본 계획의 단일 정면 샷 전제를 대체

정본은 S1(정면 무표정)~S7(전신) 가이드 플로우 + 건너뛰기 허용 + 미측정 표기. 본 계획에 특히 중요한 것:

- **S5 헤어 올린/넘긴 정면** — 헤어라인·이마 전체·얼굴 외곽 **실측**. 본 계획 리스크 §6-3(헤어라인이 TrueDepth·matte의 병목)의 가장 단순한 해법이 캡처 프로토콜에 이미 있었다. matte 융합(Phase 2 §2)은 S5 없는 사용자의 폴백으로 재위치.
- **S3/S4 회전 스윕** — 측면 실루엣·E-line·코 높이. 정지 측면 샷 불가(게이트를 못 봄) 문제의 확정 해법. yaw 한계(~60–75°) 폴백 포함.
- **S2 스마일** — 동적 측정(입꼬리 벡터, 웃을 때 비대칭 델타). 본 계획에 동적 축이 전무했다.
- **품질 게이트에 거리 게이트(얼굴 크기 밴드) 포함** — 본 계획 §6-9에서 "미구현"으로 지적한 거리 통제가 정본에는 설계되어 있음. Phase 1 §4는 이 게이트 구현으로 수렴.

### 10.3 렌즈 왜곡 언디스토트 — 본 계획의 왜곡 논의에 빠져 있던 절반

본 계획은 원근(거리) 왜곡만 다뤘다. 정본 §7-0a: 전면 카메라 배럴 왜곡을 ARKit 인트린식·왜곡 계수로 **언디스토트 후 랜드마크 산출**(+중앙 배치 게이트로 잔여 최소화, 샷마다 카메라·렌즈·배율 기록). 원근과 렌즈는 원인·보정법이 다른 별개 문제 — Phase 1 작업 범위에 언디스토트 추가. Android는 인트린식 미제공 기기 폴백(생략+confidence 하향).

### 10.4 Confidence 봉투 + 민감도 노출 정책

- 모든 측정치를 `{value, unit, confidence, source(landmark|pixel|depth|ai|draping), shots, sensitivity, derivedFrom}` 봉투로 저장 — 본 계획 §8.4의 출처 추적·Phase 0 §5의 판정 버저닝이 이 스키마로 수렴한다. **센서 provenance 필드 추가(§1 원칙 2)**: `{trueDepthHardware, depthDataObserved(비율), faceTrackingSupported, deviceModel}` — depth source의 신뢰 축 자격 판정용.
- **민감도 태그(무표기/민1 표현조정/민2 기본 비노출/민3 내부전용)** — 저장·내부 파이프라인 구조로는 채택(측정은 전 항목 수행, 컨설팅 근거로 사용). **단 사용자 노출은 원칙 4(숫자 전면 비노출)가 태그와 무관하게 우선**(제품 오너 확정) — 정본 §9의 "무표기=자유 노출"은 채택하지 않는다(§10.7-3). 즉 태그는 "컨설팅에서 근거로 쓸 수 있는가"만 통제하고, "화면에 숫자로 뜨는가"는 원칙 4가 일괄 차단. 필터는 L2→L3 경계와 리포트 렌더 직전 2곳.
- "값 없음(unmeasured)"과 "신뢰도 낮음"의 구분 — 샷 건너뛰기 허용의 귀결.

### 10.5 드레이핑 시뮬레이션 — 제3의 분석 수단

관찰(사진)·계측(랜드마크)에 이은 **실험**: AR로 축별 대비 색 페어를 같은 프레임에 번갈아 렌더링해 반응을 판정(AI 비교/사용자 선택/교차 검증). 퍼스널컬러 민감도 축은 관찰이 아니라 실험으로 판정한다는 원칙. 본 계획에 전무했던 수단 — §9 서술 축의 퍼스널컬러 신뢰도를 올리는 경로로 채택.

### 10.6 항목 카탈로그 — §7 확장의 상위 집합

본 계획 §7은 engine 1군 잔여분만 다뤘다. 정본 §4의 카탈로그(**원본 테이블 실측 개수 — 초안 3곳 오기 정정**: 눈 기하 11항, 눈썹 4항, 코·인중 6항, 입 5항, 윤곽·비대칭 8항, 색 8항, 깊이 **16항**〈초안 17 오기〉, 동적 6항, 신체 4항 + L1 라벨 **19종**〈초안 18 오기〉 + L2 **6그룹**〈초안 5 오기: 질감·선과면·눈인상·인상종합·볼륨하강·퍼스널컬러〉)가 측정 요소의 정본이다. §7은 "기존 구현과의 매핑" 역할로 유지하고, 신규 항목 추가는 정본 카탈로그 기준으로.

### 10.7 정본과의 충돌 3건 (2026-07-16 제품 오너 결정 반영)

1. **원본 샷 전량 저장 vs 프라이버시 계약 → 조건부 보류(2026-07-16 외부 리뷰 반영으로 재기술)**: 정본은 "원본 샷·프로필·AI 응답 전량 저장", 현행 personalColor 계약([contracts.ts](../../../apps/mobile/src/features/personal-color/services/personalColorCore/contracts.ts):149-153)은 `longTermRawFrameStored: false`를 **리터럴 타입으로 강제**(true 대입 시 컴파일 에러)하고 삭제 파이프라인([personalColorArtifacts.ts](../../../apps/mobile/src/features/personal-color/services/personalColorArtifacts.ts):80)과 함께 립/브로우/풀페이스·iOS·Unity(RNBridge throw)에 복제돼 있다. 초안의 "법률 스코프 제외 → 전량 저장의 유일 장애 해소" 논리는 **철회** — 이 가드는 법률 회피용이 아니라 의도된 제품 결정이며, Apple 스토어의 ARKit 얼굴 데이터 처리방침 요건(§6-10-a)은 법률 검토와 무관하게 적용된다. 전환 조건: ① 제품 오너의 저장 정책 명시 결정(§6-10 스코프 결정과 별건), ② 개인정보처리방침 문구 갱신, ③ 그 후에야 리터럴 완화 + `deleteSourceImage` 조건화 + 복제 지점 정리(기술 작업). 그 전까지 **현행 false 유지**. privacy-strip 테스트(wire 계약)는 저장 정책과 무관하게 영구 유지.
2. **황금비 편차 항목 → 제거 권고**: 정본 L0-E·L1에 황금비 편차(민3 내부전용)가 있으나, 본 계획 원칙 5는 황금비를 근거 없는 기준으로 도입 금지(§5 — 황금비 규범성 부정). 민3(비노출)이라도 컨설팅 **근거**로 쓰이면 같은 문제 — 항목 제거 또는 "Pallett식 모집단 평균 편차"로 대체 권고. (§0-1의 mean±SD 재정의와 동일 원칙.)
3. **[신규] 숫자 노출 정책: 원칙 4 vs 정본 §9 → 원칙 4 채택(제품 오너 확정)**: 정본 §9는 "측정·저장 전 항목 + 출시 모드에서 민감도 태그 필터, **무표기 항목은 자유 노출**"이고, 본 계획 원칙 4는 "숫자 전면 비노출", 현행 코드([MeasurementDetailSection.tsx](../../../apps/mobile/src/features/face-analysis/components/MeasurementDetailSection.tsx))는 3-반영 규칙으로 px·Lab 전량 노출 — **3파전**. 제품 오너가 **원칙 4로 단일화**: 측정·저장·태그는 정본 §9대로 하되 **사용자 화면 숫자 노출은 원칙 4가 일괄 차단**(무표기라도 노출 안 함). 귀결: 현행 MeasurementDetailSection의 px·Lab·확률 제거(Phase 0 §6). 이 결정으로 초안 §0-6 진단(수치 노출)이 "결함"이 아니라 "번복된 제품 결정"임이 확정.

### 10.8 페이즈 정합

정본 P1(기하 관통)~P5(깊이·측면)와 본 계획 Phase 0~4는 트랙이 다르다: 본 계획은 **기존 구현 개선**(Phase 0 표현 정직화 → Phase 1 z보정 검증 레인), 정본은 **신규 파이프라인 구축**. 접점: Phase 1∥2에서 canonical 10-shot, exact-30 evidence adaptor, repeatability/Gate 6B tooling까지 준비했으며 실제 MAD·MAE·mm 오차 프로파일은 아직 없다. 이 검증 프로토콜과 향후 실기기 결과를 정본 P1·P5의 수용 기준으로 재사용하고, 본 계획 Phase 3~4(지각 번역·기준값)는 정본 L2~L3 구현 시의 원칙으로 흡수한다.

### 10.9 정본 채택 항목 → 실행 연결표 (계약 간극 명시, 2026-07-16 리서치)

정본 §10 채택 항목이 현행 계약 밖이라 "채택 기록"만으로는 실행 불가 — 각 항목의 담당 Phase·계약 변경·리스크를 못박는다.

| 정본 항목 | 현행 계약 상태 | 실행 위치 | 계약 변경 |
|---|---|---|---|
| S2~S7 멀티샷 | 백엔드 `MeasurementShot` = `S1\|FACE3D`뿐, `validate_provenance`가 S1 고정 | Phase 2(S3/S4·S5 depth) + Phase 3(S2 동적) | enum 확장 + provenance 규칙 재작성 + wire 스키마 버전업 + shot별 normalize + 프롬프트/캐시 키 개정 + 파이프라인 다중 shot 입력맵([face_analysis_v2.py](../../../services/backend/app/schemas/face_analysis_v2.py):25-63 외 5지점) |
| `visualEvidence` | `Insight` 5필드에 없음 | Phase 3 | 백엔드/모바일 스키마 필드 추가 + perception 프롬프트 필수화(§8.3) |
| 로컬 이미지 1회 읽기·stage 재사용 | 미구현 | Phase 3 선행 | provider-disabled fixture runner에서 bytes를 메모리 재사용하고 외부 업로드 0건을 테스트 |
| 드레이핑 시뮬레이션 | 전무 | Phase 3(§10.5) | AR 색페어 렌더 + 판정 경로 신설, `source:'draping'` 봉투 |
| 센서 provenance | native→Unity→mobile→backend 기록·fail-closed 검증 구현, 실제 기기 표본 미수집 | Phase 2(PR #27) | `trueDepthHardware`·`depthDataObservedRatio`·`faceTrackingSupported`·기기모델 봉투 구현; Gate 6B 전 제품 OFF |
| 거리 게이트 | 미구현(타원 프레이밍 간접) | Phase 1 §4 | 얼굴 크기 밴드 게이트(§10.2) |
| 멀티샷 UX 마찰 | — | 리스크 | S1~S7 촬영 단계 증가의 이탈률·완주율 리스크를 §6에 등재(pitch 8°→12° usability 완화 이력보다 큰 결정) |

### 10.10 미반입 정본의 처리

- **제1 정본 `얼굴분석-설계.html` 미반입** — 계획 이력과 링크는 존재하지만 2026-07-17 worktree 실사에서 파일이 없다. 본 v5의 L0~L3·S1 기준·근거/어조 계약을 이번 구현 정본으로 사용하고, 원본 반입 시 delta review를 수행한다.
- **제2 정본 `메이크업-분류체계-정의.html` 미반입** — 메이크업 출력 3채널은 본 v5와 보고서 계획의 안전 기본값(핏 시트/색·제품/내추럴·글램 룩)으로 구현한다. 원본 반입은 착수 선결이 아니다.
- **정본 §9 "민0" 용어 미정의** — 시작 기본값에 등장하나 태그 체계(무표기/민1/민2/민3)에 정의 없음. "무표기"의 오기로 추정 — 정본 반영 시 정정.
