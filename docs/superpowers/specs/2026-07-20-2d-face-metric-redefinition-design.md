# 얼굴분석 2D 특성 재정의 + 측정 검증 오버레이 — 설계

- **날짜**: 2026-07-20
- **브랜치**: `feature/WEI/얼굴분서_2D/fix`
- **상태**: 설계 승인 대기(브레인스토밍 산출물)
- **범위 원칙**: feature-local (`features/face-geometry`, `features/face-3d`, 새 검증 화면). shared/theme 미변경.

---

## 1. 배경 — 무엇이 문제였나

진단(코드) + deep research(22/25 claim 검증)로 확인된 것:

1. **눈꼬리(canthal)**: 현재 `canthalTilt` = 내안각→외안각 직선의 수평 대비 각(= 해부학 *palpebral fissure inclination*). 리서치 결과 이건 **"올라감/처짐(upturned/downturned)" 축엔 표준·정답**. 다만 사용자가 원한 "눈매 형태(뾰족/둥긆)"는 **별개 축** — 외안각에서 상·하 눈꺼풀이 이루는 **수렴각(outer canthal angle)** 이며 현재 앱엔 없음.
2. **눈썹(browSlope)**: 상+하연 10점을 한 직선에 최소자승 피팅한 "기울기" 하나 → 형태 정보를 버림. 리서치 권장 = **아치 봉우리(apex) 위치**(눈썹 길이 대비 비율 + 외안각/외측홍채 정렬)로 특성화, **상연 edge**에서.
3. **턱폭(jawWidth)**: 현재 172↔397 가로폭. 리서치: 진짜 턱폭 = **bigonial(하악각 gonion↔gonion)**, 기준 분모 = **bizygomatic(zygion↔zygion)**. 그러나 **gonion은 정면 2D 실루엣에서 근사만 가능** → 현재 값은 신뢰 낮음(사용자 의심 적중).
4. **좌표 정합**: 리서치 1순위 권고 "픽셀 공간(x·W, y·H)에서 계산"은 앱이 이미 충족(`toPixelLandmarkMap`).
5. **roll 보정 부호 미검증 버그**: `angleDeg = -rollDeg`(homuler 행렬)의 방향을 작성자 본인이 "실기기 1회 검증할 것"이라 남겨뒀고 테스트 0. 부호가 틀리면 모든 각도 지표가 반대로 회전(최대 ~10°).
6. **시각적 접지 부재**: `faceGeometryMath`가 각 지표를 `{unit,value,warnings}` 숫자로 줄이고 **측정 끝점을 폐기** → 측정점을 얼굴 위에 그려 검증할 수단이 전무.

---

## 2. 목표 / 비목표

**목표**
- G1. 눈꼬리에 **수렴각(round/almond)** 신규 지표 추가. tilt는 유지.
- G2. 눈썹을 **아치 봉우리 위치**로 재정의. 기존 slope는 대체.
- G3. 2D 지표를 **포즈 보정 좌표**(roll 보정 + 부호 검증)에서 측정 — 왜곡 제거. 전(全)정면화(yaw+pitch)는 선택적 확장.
- G4. **개발·QA 검증 오버레이**(전용 화면): 측정에 실제 쓰인 점/축을 촬영 얼굴 위에 렌더. 신규 후보 인덱스의 **실기기 검증 도구**를 겸함.

**비목표(이번 spec 아님)**
- N1. **턱 3D(bigonial) 측정** — 별도 트랙(§7), gonion 신뢰도 de-risking 스파이크 선행.
- N2. 사용자-facing 리포트 UI 개편(검증 오버레이는 dev 게이트).
- N3. 얼굴형 분류(oval/round/…) 크로스워크 — 리서치가 검증된 cutoff 없음(open question).
- N4. hooded/monolid 판정, 아치 높이·구간각·형태 분류(직선/아치/각진) — 리서치 검증 소스 없음(open question).

---

## 3. 결정 — 재정의된 지표 정의

### 3.1 눈꼬리 (2개 축)
- **tilt(유지)**: `atan2(-(ex.y-en.y), |ex.x-en.x|)`, 포즈 보정 좌표. 양수=upturned. 소스: PMC3482776, Qoves 외.
- **수렴각(신규)**: 외안각(ex)에서 **상 눈꺼풀 접선**과 **하 눈꺼풀 접선**의 사잇각. 상/하 각각 ex 근방 2~3점으로 접선 피팅 후 각도차. round=넓음, almond=좁음. ⚠ 접선 표본점은 검증 소스 없음 → 후보(§4) + 실기기 검증.
- (보조) **개방도**: (ps-pi)/(en-ex). 기존 점 유지.

### 3.2 눈썹 (봉우리)
- **apex 위치**: **상연 edge** 폴리라인의 최고점을 apex로 잡아, ① 눈썹 길이 대비 **비율**(0=앞머리, 1=꼬리; 전통 이상 ≈0.67), ② **외안각/외측홍채 대비 수평 정렬**로 보고.
- 🇰🇷 아시아 선호 apex ≈ 외안각 바로 위(연구 n=76, Aesthetic Plastic Surgery 2024) — 정렬 기준에 반영.
- ⚠ 이상적 "값"은 논쟁적(경쟁 3주장 검증서 기각). **방법(최고점→비율/정렬)만 robust**하게 채택, 단일 정답값 하드코딩 금지.

### 3.3 턱폭 → §7로 이관(3D 트랙)
- 현재 2D jawWidth(172↔397)는 **"근사·저신뢰"로 명시 표기**만 유지하고, 정식 대체는 3D 스파이크 결과에 따름.

---

## 4. 랜드마크 매핑 (후보)

> ⚠ 리서치 결론: **웹에 떠도는 인덱스는 커뮤니티 관행 — 실기기 검증 필수**(인덱스 단정 claim은 검증서 기각됨). 아래 🔵는 진단에서 공식 topology 대조로 이미 검증됨, ⚠는 canonical 링에서 뽑은 **후보**이며 오버레이로 검증 후 확정.

| 지표 | 점 | 우(subject) | 좌(subject) | 상태 |
|---|---|---|---|---|
| 눈꼬리 tilt | 내안각·외안각 | 133·33 | 362·263 | 🔵 검증됨 |
| 눈꼬리 수렴각 | 외안각 + 상/하 접선 | 33 / 상246·161 / 하7·163 | 263 / 상466·388 / 하249·390 | ⚠ 검증필요 |
| 눈 개방도 | ps·pi | 159·145 | 386·374 | 🔵 검증됨 |
| 눈썹 봉우리 | 상연 edge→최고점 | 107·66·105·63·70 | 336·296·334·293·300 | ⚠ 상연만·검증필요 |
| 봉우리 정렬기준 | 외안각/외측홍채 | 33 / iris 468–472 | 263 / iris 473–477 | ⚠ 홍채 검증필요 |

- 좌표는 전부 **포즈 보정(roll) 후** 픽셀 스케일(x·W, y·H). 앱은 478(iris 포함) 랜드마크 보유 확인됨.

---

## 5. 아키텍처 — 왜 2D 포즈 보정인가 (3D 전면통일 반려 근거)

TrueDepth 조사 결과:
- ARKit ARFaceGeometry(1220정점, 미터)는 존재하나 **모델핏 blendshape** — 눈꺼풀·눈썹 미세부위는 MediaPipe 이미지핏보다 거침. 원시 depth map은 **읽지도 않음**(플래그만).
- **iOS 전용**(ARKit) — 앱은 android도 타깃. 현재 2D(RGB)는 크로스플랫폼.
- **라이브 캡처 전용** — 현재 측정은 저장 JPEG에서도 동작.
- 3D 메시는 **JS로 넘어오지 않음**(스칼라 11개만). 부위별 지표는 큰 신규 작업.

→ **결론**: 미세 2D 특성은 MediaPipe 유지 + **포즈 보정**으로 왜곡 제거(크로스플랫폼·저장사진 유지).

**baseline = roll 보정(부호 검증)**: 촬영 게이트가 yaw/pitch를 이미 소각(≤5–8°)으로 제한하고, tilt·수렴각·봉우리는 수평 대비 각이라 **roll이 지배적 왜곡**. 최소 실현안 = 현 roll 보정을 유지하되 **행렬→회전 부호를 합성행렬 단위테스트로 고정 + 실기기 1회 검증**(§1-5 버그 해소). ARKit `facialTransformationMatrix`(현 `faceRatioPoseNormalization`) 재사용.

**선택적 확장**: yaw+pitch까지 포함한 전(全)정면화 — 2D 랜드마크를 3D 행렬로 정면 투영하는 근사라 별도 검증 필요. 이번 spec 필수 아님.

---

## 6. 검증 오버레이 (개발·QA 도구, 이번 spec의 핵심 산출물)

- **형태**: 전용 화면. `VerticalThirdsOverlay`의 full-face `PhotoStage`(Image + SVG/Skia overlay) 패턴 재사용. 리포트 화면에 `__DEV__` 진입 버튼.
- **그리는 것**: 촬영(원본) 얼굴 위에 — 눈꼬리 tilt선·수렴각 접선/호, 눈썹 상연 edge + apex + 정렬선, 개방도 세로선, (턱은 3D 트랙 전까지 근사선 + "저신뢰" 라벨). 각 마크에 측정값 + 후보 인덱스 라벨.
- **데이터 경로(승인안 A)**: `faceGeometryMath`가 측정에 쓴 끝점(정규화 좌표)을 **별도 순수 함수**로 함께 산출 → 인메모리 `FaceGeometryResult`의 **로컬 전용 필드**(`debugAnchors`)로만 부착. `buildFaceAnalysisMeasurementsPayload`(화이트리스트)에 **추가 안 함** → 서버 계약·privacy 무오염. 측정과 동일 좌표라 divergence 0.
- **겸용 가치**: ⚠ 후보 인덱스가 실제 얼굴에서 제대로 찍히는지, roll 부호가 맞는지(수평 기준선이 반대로 안 기우는지)를 **눈으로 검증** → 이 오버레이가 §4 확정과 §5 부호검증의 도구.
- **roll 노출**: 촬영(원본) 얼굴 위에 "측정이 0°로 가정한 수평 기준선"을 원본 좌표로 되돌려 그려, 부호가 틀리면 기준선이 머리 기울기와 반대로 시각적으로 드러나게(정면화된 이미지에 그리면 오차가 숨으므로 원본에 그림).

---

## 7. 별도 트랙 — 턱 3D bigonial (follow-up spec)

이번 spec 밖. 착수 순서(조사 권고):
1. **de-risking 스파이크**: 기존 `E7SynchronizedCaptureExporter`(전체 메시를 `arface_export.json`으로 이미 덤프)로 실기기 얼굴 다수 수집 → 오프라인에서 gonion/zygion 후보 정점 식별 + bigonial **반복성/정확도** 검증.
2. 통과 시에만: 시맨틱맵에 gonion/zygion 그룹 추가 → `Face3DMetricEvaluator`에 bigonial/bizygomatic + 비율(mm 이미 산출) → 브리지 스칼라 추가 → v3 promotion 게이트 해제 → JS 지표/그리드 노출.
3. 실패 시(blendshape 메시로 gonion 불안정) → 진짜 blocker = 원시 `capturedDepthData` 샘플링(신규 네이티브 경로).

---

## 8. 열린 질문 / caveat (리서치)

- 수렴각의 정확한 상/하 눈꺼풀 접선 표본점 — 검증 소스 없음(후보+검증).
- 눈썹 apex 이상값 논쟁적 — 방법만 채택.
- 아치 높이·구간각·형태 분류(직선/아치/각진/S) 계산법 — 소스 없음(비목표).
- 얼굴형 라벨 cutoff 크로스워크 — 검증 소스 없음(비목표).
- gonion 2D/3D 신뢰도 — 스파이크로 판정.
- 정면화 기준축(image-horizontal vs bi-endocanthion vs Frankfort) — 코드에서 하나로 고정·명시.

---

## 9. 테스트

- `faceGeometryMath` 순수함수: 수렴각·apex 비율의 합성 입력 단위테스트(계약 러너).
- **roll/정면화 부호 pin 테스트**: 합성 회전행렬 주입 → 보정 후 각도가 올바른 방향으로 이동하는지 고정.
- `debugAnchors`가 `buildFaceAnalysisMeasurementsPayload` 출력에 **새어나가지 않음**을 검증하는 테스트.
- 오버레이는 실기기 시각 검증(스파이크 성격) — 자동화 대상 아님.

---

## 10. 영향 파일(예상)

- `features/face-geometry/services/faceGeometryCore/faceGeometryMath.ts` — 수렴각·apex 계산 + debugAnchors 산출.
- `.../faceGeometryCore/landmarkIndices.ts` — 신규 후보 인덱스(수렴각 접선·상연 edge·iris).
- `features/face-geometry/services/faceGeometryService.ts` — 정면화 좌표 적용, debugAnchors 부착.
- `features/face-geometry/types.ts` — 신규 지표 키 + 로컬 debugAnchors 타입.
- 신규: 검증 오버레이 화면/컴포넌트(+ 리포트 `__DEV__` 진입).
- (트랙2) `features/face-3d/*`, Unity/iOS — §7.
