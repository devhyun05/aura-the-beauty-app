# AURA Face Capture Lab — 기능·스택 스펙 (외부 공유용)

- **문서 버전**: v0.1
- **작성일**: 2026-07-06
- **범위**: `face-capture-lab` 실험 앱 **한정** (전체 제품 앱은 대상 아님)
- **대상 독자**: 외부 협업자 / 리뷰어 (얼굴 세로비율 측정 파이프라인 현황 파악용)
- **플랫폼**: iOS 전용 (TrueDepth 전면 카메라 권장)

> 이 문서는 코드로 검증한 "현재 구현된 것"만 기술합니다. 계획 문서(`docs/faceData_WEI/*`)의
> 목표가 아니라 **실제 소스 기준 현황**이며, 무엇이 실제 구현이고 무엇이 휴리스틱·근사·미구현인지
> [§7 구현 상태](#7-구현-상태-정직한-현황)에 명시했습니다.

---

## 1. 한 줄 요약

**Face Capture Lab**은 전체 AURA 앱에서 **"얼굴 촬영 → 얼굴 세로 삼등분(상·중·하안부) 비율 측정"**
한 흐름만 떼어낸 **독립 실험 빌드**입니다. 실제 카메라 세션 위에서 MediaPipe·Apple Vision·Apple
시맨틱 세그멘테이션 매트를 돌려 얼굴을 실측하는 **동작하는 온디바이스 프로토타입**이며, 인증·홈·AR
메이크업·백엔드는 모두 배제되어 있습니다.

---

## 2. Lab의 정체 — 무엇이고, 무엇이 아닌가

### 2.1 실험 앱 선택 구조

같은 모바일 바이너리를 빌드타임 환경변수로 갈아끼웁니다.

```
index.ts → registerRootComponent(App)
App.tsx  → EXPO_PUBLIC_AURA_EXPERIMENT_APP === 'face-capture-lab'
             ? FaceCaptureLabApp   ← 이 문서의 대상
             : AppRoot             ← 전체 제품 앱 (대상 아님)
```

- `EXPO_PUBLIC_*`는 번들에 **빌드타임 인라인**됩니다 → 런타임 토글이 아니라 **재빌드**로 전환.
- Lab 루트는 최소 provider 트리만 마운트: `TamaguiProvider(light 고정) > SafeAreaProvider >
  NavigationContainer > 단일 headerless 스크린`.

### 2.2 2-스크린 파이프라인

```
┌─────────────────────────┐   onCapture(result, greenlightReport)   ┌──────────────────────────────┐
│  CameraFaceCaptureScreen │ ─────────────────────────────────────▶ │  FaceVerticalThirdsScreen    │
│  (Stage 1: 촬영 + 게이팅)│                                          │  (Stage 2: 세로비율 측정, debug)│
│                         │ ◀───────────────── onRetake ──────────── │                              │
└─────────────────────────┘                                          └──────────────────────────────┘
```

- 화면 간 데이터 전달은 **React Navigation param이 아니라 부모 컴포넌트 `useState`** 하나로 처리.
- Lab은 `captureType='face_analysis'`, `debug=true`로 **고정** → 얼굴분석 경로 + 디버그 오버레이만 실행.

### 2.3 전체 앱과의 차이 (Lab이 **하지 않는** 것)

| 항목 | 전체 앱 (`AppRoot`) | Lab (`FaceCaptureLabApp`) |
|---|---|---|
| 인증 / 세션 | `AuthSessionProvider` | ❌ 없음 |
| 딥링킹 / 멀티 라우트 | `RootNavigator` + linking | ❌ 단일 스크린 |
| Unity AR 메이크업 | `prepareUnityMakeupFramework` | ❌ 없음 |
| 이미지 업로드 | 실제 백엔드(presigned→S3→complete→photo-captures) | ⚠️ **로컬 stub** (네트워크 호출 없음) |
| 진입 화면 | 로그인/홈 플로우 | 카메라로 **바로 진입** |

> **핵심 주의**: Lab의 업로드는 `bucket='local-face-capture-lab'`, `objectKey=온디바이스 파일 URI`로
> 결과를 **로컬에서 위조**합니다. 서버에 저장되는 것은 없습니다.

---

## 3. Stage 1 — 얼굴 촬영 (Capture + Greenlight 게이팅)

카메라 프리뷰 위에서 **얼굴이 올바르게 잡힐 때까지 셔터를 막는** 전체화면 촬영 UI입니다.

### 3.1 프리뷰 백엔드 (이중 구조)

- **주 경로 (iOS 네이티브)**: `AURARealtimeFaceCaptureView` — 실제 `AVCaptureSession` 위에서
  MediaPipe FaceLandmarker + Apple Vision을 **매 프레임** 실행, 랜드마크·포즈·카메라 안정도를
  JS로 스트리밍.
- **폴백 (expo-camera)**: 네이티브 뷰가 없으면 `CameraView`(`LiveCameraLayer`)로 폴백 →
  정지영상 폴링(≈450ms) 후 Vision 정지영상 검출.

### 3.2 타원 프레이밍 가이드 (거리 게이트 대체)

- 화면의 타원은 **순수 시각 가이드**입니다. 얼굴을 타원에 맞추라는 안내일 뿐, 거리·정렬 판정은
  Greenlight가 담당합니다.
- 과거 계획의 **ARKit FaceAnchor 거리 게이트 / 턱·정수리 점 매칭 게이트는 취소**되었고, 그 자리를
  `faceWidthRatio` + 센터라인 정렬이 대신합니다. (코드 주석에 명시)

| 타원 튜닝 상수 | 값 | 의미 |
|---|---|---|
| `heightToPreviewHeightRatio` | 0.40 | 타원 높이 = 프리뷰 높이의 40% (크기 마스터 노브) |
| `widthToHeightRatio` | 0.65 | 타원 폭 = 높이의 65% |
| `verticalCenterRatio` | 0.46 | 타원 세로 중심 = 프리뷰 높이의 46% (현재 상시 사용 경로) |
| `snFromTopRatio` | 0.64 | ARKit principal-point 앵커용 — **현재 미사용(dead)** |

### 3.3 Greenlight 게이트 (실시간 촬영 허용 조건)

`finalCaptureGreenlight = mediaPipeAlignmentGreenlight AND cameraStabilityGreenlight`. 둘 다 참일 때만 셔터 허용.

| 파라미터 | 값 | 실패 사유 |
|---|---|---|
| 센터 오프셋 | `≤ 0.12 × 가이드폭` | `not_centered` |
| 센터라인 스프레드 | `≤ 0.10 × 가이드폭` | `not_centered` |
| Yaw | `|yaw| ≤ 10°` | `not_forward` |
| Roll | `|roll| ≤ 8°` | `not_forward` |
| 거리(근접) | `faceWidthRatio ≤ 0.62` | `face_too_close` |
| 거리(원거리) | `faceWidthRatio ≥ 0.30` | `face_too_far` |
| 필수 센터라인 랜드마크 | `forehead, noseBridge, noseTip, chin` 4점 모두 | `landmark_missing` |
| 카메라 안정 | `isStable && stableDurationMs ≥ 400ms` | `camera_unstable` |

- **Pitch 게이트(별도)**: `face_analysis`에서만 `|pitch| ≤ 12°` (MediaPipe pitch, 값 없으면 통과).
  → Greenlight 자체는 yaw/roll만 보는 **2축 정렬 체크**임에 유의.
- 각 실패 사유는 한국어 안내 메시지로 매핑(예: "조금 멀리서 촬영해주세요").

### 3.4 시맨틱 매트 요청

- `face_analysis` 촬영 시 네이티브에 `semanticMatteCapture=true`를 넘겨 **Apple 헤어/스킨 매트를
  사진에 임베드** 요청 → 결과 `{requested, hair, skin}` 플래그가 Stage 2로 전달됨.
- TrueDepth 전면 카메라 + depth delivery + Photo preset이 있어야 실제 매트가 생성됨.

---

## 4. Stage 2 — 얼굴 세로 삼등분 측정 (Vertical Thirds)

정면 얼굴을 **4개 수평 기준점**으로 나눠 **상·중·하안부 세로 비율**을 실측합니다.

### 4.1 기준점(keypoint)과 세그먼트

| 기호 | 이름 | 출처 |
|---|---|---|
| **H** | Hairline / 정수리 앞머리선(trichion) | Apple 시맨틱 매트 경계(휴리스틱) — 실패 시 MediaPipe idx-10 근사 |
| **G** | Glabella / 미간 | MediaPipe (눈썹 그룹 median) |
| **Sn** | Subnasale / 코밑 | MediaPipe (subnasale 그룹 median) |
| **Me** | Menton / 턱끝 | MediaPipe (턱 윤곽 polyline 최하점) |

```
상안부(upper)  = H → G     (헤어라인 → 미간)
중안부(middle) = G → Sn    (미간 → 코밑)   ← 기준(1.0)으로 고정
하안부(lower)  = Sn → Me   (코밑 → 턱끝)
```

### 4.2 비율 계산 (Y좌표만 사용하는 순수 세로 측정)

- `middlePx = Sn.y − G.y` (기준, 항상 1.0으로 정규화)
- `lowerPx = Me.y − Sn.y`, `upperPx = G.y − H.y` (헤어라인 없으면 null)
- `displayRatio = { upper: upperPx/middlePx | null, middle: 1.0, lower: lowerPx/middlePx }`
- **평균(이상) 기준선**: `상 1.0 : 중 1.0 : 하 0.8` — **앱이 정한 미적 기준**이며 고전적 1:1:1이 아님.
- `dominantPart`(우세 부위) 판정: 편차 `> 0.08`이면 해당 부위가 길다/짧다로 해석, 한국어 요약 문구 생성
  (강도: `≥0.22` 뚜렷하게 / `≥0.14` 다소 / else 약간).

### 4.3 촬영 후 보정 & 품질 게이트

- **Roll 보정**: MediaPipe pose `rollDeg` 기준으로 4개 기준점을 이미지 중심 기준 `−roll` 회전.
  품질 게이트 **전에** 적용(회전 좌표로 Y순서 검사). `|roll| > 5°`면 보정 생략.
  (렌즈/원근/TrueDepth 보정은 **하지 않음** — 로그에 `false` 명시)
- **품질 게이트** (실패 시 `status='blocked'`):

| 조건 | 기준 | 실패 사유 |
|---|---|---|
| 얼굴 검출 | 1개 | `face_not_detected` / `multiple_faces_detected` |
| 포즈 | `|yaw|≤8°, |pitch|≤8°, |roll|≤5°` | `pose_gate_failed` |
| 필수 기준점 | G, Sn, Me 존재 | `required_keypoints_missing` |
| Y 순서 | `G.y < Sn.y < Me.y` | `vertical_keypoint_order_invalid` |
| 헤어라인 | `H.y < G.y` (아니면 H를 null 처리, 차단 아님) | 경고만 |

> **게이트가 2단계**입니다: 촬영 전 실시간 **Greenlight**(yaw≤10/roll≤8/거리/안정)와, 촬영 후 정지영상
> **Quality Gate**(yaw·pitch≤8/roll≤5/얼굴수/기준점 순서). 기준치가 서로 다릅니다.

### 4.4 헤어라인 소스 티어링 & 최종 상태

| 티어 | 조건 | 결과 상태 |
|---|---|---|
| `apple_full` | Apple 매트 헤어라인 confidence `≥ 0.70` + 게이트 통과 | `full_success` |
| `apple_low` | Apple 매트 헤어라인 `0.45 ≤ conf < 0.70` | `partial_success` |
| `approx` | Apple 매트 `< 0.45` 또는 불가 → MediaPipe idx-10 근사 | `partial_success` |
| `none` | 헤어라인 없음(상안부는 판정 제외) | `partial_success` |
| — | 네이티브 모듈 없음(Expo Go/미빌드) | `failed` (`native_module_unsupported`) |

### 4.5 부가 산출물

- **얼굴 길이 비율**: `세로(H→Me) / 가로(볼 idx234↔454)` → 게이지 표시(기준 wide 1.351 / avg 1.455 / long 1.506, 하드코딩).
- **디버그 오버레이(SVG)**: 상·중·하 3개 반투명 밴드 + 각 기준점 가이드선 + (debug) 점별 라벨/제공자/포즈 패널,
  `react-native-view-shot`로 `overlay.png` 스냅샷.

---

## 5. 네이티브 계층 (iOS / Objective-C)

`apps/mobile/ios/AURA/` 아래 3개 RN 네이티브 모듈이 Lab을 뒷받침합니다. **얼굴 검출은 실제**입니다.

| 모듈 | 역할 | 핵심 기술 | 상태 |
|---|---|---|---|
| `AURARealtimeFaceCaptureView` | 실시간 카메라 뷰 + 촬영 | AVCaptureSession, MediaPipe(video), Vision(frame), Apple 시맨틱 매트 | ✅ 실제 |
| `AURAFaceLandmarkDetector` | 정지영상 폴백 검출 | Vision `VNDetectFaceLandmarksRequest` | ✅ 실제 |
| `AURAFaceRatioAnalyzer` (+`AURAFaceRatioHairline`) | 세로비율 분석 + 헤어라인 | MediaPipe(image), Apple 매트 경계 스캔 | ✅ 실제 / ⚠️ 헤어라인 휴리스틱 |

- **MediaPipe**: `MPPFaceLandmarker`, 번들 모델 `face_landmarker.task`(≈3.7MB, 478점), pose는
  facial-transformation matrix 분해. (numFaces 1, minConfidence 0.5)
- **Apple 매트**: `AVSemanticSegmentationMatte`(Hair/Skin)를 사진 임베드 후 `ImageIO` aux-data로 read-back.
- **헤어라인 위치 산출**: 매트는 실제지만, 정수리선 **점**은 이마 ROI에서 alpha/gradient 임계값으로 hair→skin
  경계를 **컬럼 스캔**하는 휴리스틱(가중 median). confidence도 가중식(sharpness .40/consistency .30/skin .20/pose .10).
- **미사용**: CoreImage, Metal, **ARKit**(전면 취소).

---

## 6. 기술 스택

| 영역 | 구성 | 버전 |
|---|---|---|
| 런타임 | React Native / React | 0.85.3 / 19.2.3 |
| 프레임워크 | Expo SDK | ~56.0.12 |
| 카메라 | expo-camera(폴백) + 네이티브 뷰(주) | 56.0.8 |
| UI | Tamagui + @tamagui/config | 2.3.2 |
| 그래픽 | react-native-svg / react-native-view-shot | 15.15.4 / 5.1.1 |
| 모션 | react-native-reanimated / worklets | 4.5.0 / 0.10.0 |
| 내비게이션 | @react-navigation native/native-stack | 7.3.4 / 7.17.6 |
| 파일/저장 | expo-file-system(legacy) | 56.0.8 |
| 아이콘 | lucide-react-native | 1.21.0 |
| 언어/빌드 | TypeScript(strict) / Babel | 6.0.3 |
| 네이티브 ML | MediaPipeTasksVision, Apple Vision, AVSemanticSegmentationMatte | — |
| 테스트 | jest/vitest 없음 — tsc 컴파일 + node assert 스크립트(`scripts/mobile/*.mjs`) | — |

---

## 7. 구현 상태 (정직한 현황)

> 외부 공유 시 **과대표기 방지**를 위한 핵심 구분. (독립 검증 패스로 확인)

### ✅ 실제로 동작하는 것
- 실제 `AVCaptureSession` 카메라 + 프리뷰, 노출/WB/포커스 lock·복원, KVO 기반 카메라 안정도 판정
- 실제 **Apple Vision + Google MediaPipe** 얼굴 검출(2엔진), MediaPipe transform matrix 기반 실제 포즈
- 실제 **Apple 헤어/스킨 시맨틱 매트** 임베드 & read-back
- Greenlight/Pitch 게이트가 **실제로 셔터를 차단**, 세로비율은 **실측 랜드마크 Y좌표로 계산**
- Roll 보정 + 품질 게이트(얼굴수·포즈·기준점 순서) 실제 차단, 산출물(source/overlay/result.json/JSONL) 저장

### ⚠️ 휴리스틱·근사·하드코딩 (모델 값 아님)
- **헤어라인 점**: 실제 매트 위의 임계값 컬럼 스캔(휴리스틱), confidence는 수작업 가중식 → "모델 confidence로 표기 금지"
- **keypoint confidence**: 하드코딩 상수(glabella .82 / subnasale .82 / menton .84 / hApprox .40) → 보고되는 `ratio.confidence`는 합성값
- **볼·턱 랜드마크**: Vision 바운딩박스의 고정 비율(실검출 아님). 실제 검출은 눈/코/입 + MediaPipe 메시(G/Sn/Me)뿐
- **faceWidthRatio(거리)**: 눈/입 스팬 × 하드코딩 배수(2.35/2.15), **cm 미보정**
- 기하 포즈 폴백(매트릭스 부재 시): 매직 상수(yaw×42.0 등)

### 🚫 취소 / 미구현 (계획엔 있으나 코드 없음)
- **ARKit FaceAnchor 각도 게이트(±5/±6/±3)·거리 게이트(≥35cm)·ARKit roll 보정** → 전면 취소, 대체물로 운영
- **Sn ↔ principal-point 점 정렬 게이트** → `principalPointInPreview`에 항상 null 전달, 미배선
- `HAIRLINE_TUNING = {}` (JS 런타임 튜닝 채널 미사용, 네이티브 기본값 사용)

### 🧪 미검증 (실기기 필요)
- `full_success`(Apple 매트 conf ≥0.70)는 **TrueDepth 하드웨어 전용** — 시뮬레이터/갤러리는 항상 partial
- 계획 Phase 5의 **10+ 실기기 캡처 기반 임계값 튜닝**·매트 라운드트립(HEIC 폴백) 확인 로그가 저장소에 없음

---

## 8. 실행 방법

```bash
# 네이티브 빌드 (실기기/시뮬레이터) — 실제 사용 경로
npm --prefix apps/mobile run ios:face-capture-lab
# = EXPO_PUBLIC_AURA_EXPERIMENT_APP=face-capture-lab expo run:ios

# Metro 개발 서버만
npm --prefix apps/mobile run start:face-capture-lab

# 자동화 계약 테스트(일부) + 타입체크
npm --prefix apps/mobile run test:face-ratio-distortion   # ellipse/pitch/roll 3종
npm --prefix apps/mobile run typecheck
```

- **요구사항**: iOS 네이티브 빌드 필수(Expo Go 불가). 헤어라인 full 품질은 **TrueDepth 전면 카메라** 기기.
- **실기기 빌드는 사용자가 직접 수행**(장비/서명 필요).

---

## 9. 산출물 & 데이터 계약 (요약)

- **`FaceVerticalThirdsResult`** (`schemaVersion: "aura-face-vertical-thirds-v1"`, `result.json`):
  `status(full_success|partial_success|blocked|failed)`, `keypoints{H,G,Sn,Me}`, `verticalThirds.displayRatio`,
  `faceLength`, `quality{yaw,pitch,roll,warnings}`, `interpretation{dominantPart,summary}`, `artifacts{...Uris}`
- **`FaceVerticalThirdsAnalysisPayload`** (다운스트림/AI용, 성공 시에만): `{confidence, displayRatio, dominantPart, hairline{confidence,provider}, status, summary}` — **원시 좌표는 전송 안 함**
- **로그 이벤트** (`[aura:face-ratio]` JSONL, DEV 한정 파일쓰기): `capture:ready → landmark:ready → matte:ready → post_correction:applied → quality:gate → hairline:ready → keypoint:ready → ratio:computed → analysis:partial|blocked|failed → overlay:saved`
- **저장 위치**: `<documentDirectory>/face-vertical-thirds/<sessionId>/` (source.jpg, overlay.png, result.json, analysis-log.jsonl, +debug 매트 PNG)

---

## 10. 한계 & 다음 단계(제안)

1. **실기기 검증 데이터 확보** — `full_success` 경로 및 임계값 튜닝(계획 Phase 5)을 위한 10+ 캡처/로그 수집.
2. **거리 게이트 보정** — `faceWidthRatio`(단위 없음)를 실제 cm와 매핑하거나 근거 튜닝.
3. **confidence 신뢰도** — 하드코딩 keypoint confidence를 실제 검출 신뢰도로 대체 검토.
4. **헤어라인 견고성** — TrueDepth 미지원 기기 폴백(idx-10 근사)의 품질/표기 정책 정리.
5. **정리 대상** — 미사용 principal-point 타원 분기, 중복된 `VerticalThirdsOverlay` 컴포넌트(dead code).

---

## 부록 A. 파일 맵 (Lab 클로저)

```
apps/mobile/
├─ App.tsx / index.ts                                   # 실험앱 env 게이팅 진입점
├─ src/app/experiments/FaceCaptureLabApp.tsx            # Lab 루트(2-스크린 파이프라인)
├─ src/features/face-capture/                           # Stage 1
│  ├─ screens/CameraFaceCaptureScreen.tsx
│  ├─ components/RealtimeFaceCaptureNativeView.tsx
│  ├─ constants/faceEllipseGuide.ts
│  └─ services/{faceCaptureGreenlight, faceCapturePitchGate,
│               faceLandmarkDetector, faceCaptureValidation,
│               faceCaptureUploadService, faceCaptureGreenlightLogger}.ts
├─ src/features/face-ratio/                             # Stage 2
│  ├─ screens/FaceVerticalThirdsScreen.tsx
│  ├─ components/VerticalThirdsOverlay.tsx
│  └─ services/{faceVerticalThirdsService, faceVerticalThirdsMath,
│               faceVerticalThirdsRollCorrection, faceVerticalThirdsQualityGate,
│               faceVerticalThirdsArtifacts, faceVerticalThirdsAiPayload,
│               faceVerticalThirdsLogger, faceRatioAnalyzerNative}.ts
└─ ios/AURA/                                            # 네이티브
   ├─ AURARealtimeFaceCaptureView.m
   ├─ AURAFaceLandmarkDetector.m
   ├─ AURAFaceRatioAnalyzer.m
   ├─ AURAFaceRatioHairline.{h,m}
   └─ E7Models/face_landmarker.task
```

## 부록 B. 관련 계획 문서 (참고, 목표치)

- `docs/faceData_WEI/AURA_FACE_VERTICAL_THIRDS_MEASUREMENT_PLAN_KO_v0.2.md`
- `docs/faceData_WEI/AURA_FACE_RATIO_DISTORTION_CORRECTION_PLAN_KO_v1.0.md` (ARKit 게이트 → **취소됨**)
- `docs/AURA_FACE_HAIRLINE_APPLE_MATTE_PLAN_KO_v0.1.md`

> 참고: 저장소 루트의 `asset-lab-golden-capture.log`는 이 RN Lab과 **무관**합니다(Unity AR 풀페이스
> 메이크업 에셋 골든 캡처 로그).
