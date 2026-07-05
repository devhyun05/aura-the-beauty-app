# AURA AR Makeup Engine SDK 개발 제안서

> **상태 (2026-07-02): 일부만 유효 / 대체됨.** 이 문서는 미추적(untracked) 초안이며, 여기서 제안한 "Adapter Layer" 구조는 이후 세션에서 확정된 결정(계약 워크스페이스 + Unity UPM 임베디드 패키지 + RN 통합 레이어 구조)과 모순된다. 확정된 아키텍처/브랜치 전략/실행 계획은 `docs/unity-ar/AR_MAKEUP_ENGINE_INTEGRATION_PLAN.md`를 따른다. 이 문서는 배경 조사·문제 정의 자료로만 참고할 것.

## 0. 목적

현재 앱에는 간단한 AR 메이크업 엔진이 이미 동작하고 있다. 앞으로의 목표는 이 엔진을 단순 데모가 아니라 **실사용 가능한 AR Makeup Engine / SDK 형태**로 정리하는 것이다.

이 제안서는 다음 문제를 한 번에 다룬다.

* 얼굴 사진을 어떻게 촬영하고 보정할 것인가
* 피부톤과 얼굴 특징을 어떻게 추출해서 AI에게 넘길 것인가
* Unity/ARKit/MediaPipe를 각각 어떤 역할로 쓸 것인가
* 메이크업 에셋을 어떻게 쉽게 만들고 관리할 것인가
* Unity 기반 엔진을 모바일에서 어떻게 최적화할 것인가
* 엔진을 팀원이 기존 앱에 쉽게 통합할 수 있도록 어떤 형태로 제공할 것인가
* 개발 중 계속 검증 가능한 환경을 어떻게 만들 것인가

현재 코드 분석 기준으로, 얼굴 분석용 사진은 iOS Native `AVCapturePhotoOutput` 우선 경로를 사용하고, Expo Camera fallback과 Gallery Picker를 지원한다. AR 마스크 생성용 캡처는 Unity가 `Screen.ReadPixels`로 현재 AR 화면을 저장한 뒤 iOS Native MediaPipe로 분석하는 구조이며, Unity에는 generated region masks와 makeup recipe가 JSON/base64 형태로 전달된다.

---

# 1. 최종 결정 요약

## 1.1 핵심 아키텍처

```text
iOS Native Camera
→ 측정용 얼굴 사진 촬영
→ 노출/화이트밸런스 안정화 및 lock
→ MediaPipe 얼굴 특징 추출
→ 피부톤/얼굴 feature JSON 생성
→ GPT 5.5에 사진 + feature JSON + 품질 metadata 전달
→ MakeupRecipe JSON 생성
→ Unity + ARKit Runtime에서 mask atlas + recipe 렌더링
```

## 1.2 역할 분담

| 영역                   | 담당                                              |
| -------------------- | ----------------------------------------------- |
| 실제 피부톤/퍼스널 컬러 측정용 사진 | iOS Native AVFoundation                         |
| 얼굴 랜드마크/이목구비 경계 추출   | MediaPipe Face Landmarker                       |
| 얼굴 feature 계산        | 앱/네이티브/서버의 Feature Extractor                    |
| 메이크업 추천/설명/recipe 생성 | GPT 5.5                                         |
| AR face tracking     | ARKit                                           |
| 최종 렌더링               | Unity                                           |
| 에셋 제작/편집             | Browser Makeup Asset Lab                        |
| 앱 통합                 | TypeScript SDK + Drop-in Screen + Adapter Layer |

## 1.3 하지 말아야 할 것

```text
X Unity Screen.ReadPixels를 피부톤 측정 원본으로 사용
X MediaPipe raw mesh 478개를 GPT에게 그대로 넘기고 해석을 맡김
X 메이크업 룩마다 색까지 박힌 PNG를 새로 제작
X Unity Editor를 사람이 직접 켜서 에셋을 만들어야 하는 구조
X 완성된 엔진을 한 번에 기존 앱에 병합
X base64 마스크를 장기적으로 계속 대량 전송
X 팀원이 UnitySendMessage, ApplyRecipeJson 등을 직접 호출하게 만들기
```

---

# 2. 얼굴 사진 촬영 및 색 보정 전략

## 2.1 선택한 방향

피부톤/퍼스널 컬러 측정은 Unity가 아니라 **iOS Native AVFoundation 측정용 카메라 모드**에서 처리한다.

Unity는 AR 렌더링과 ARKit face tracking에 집중한다.

## 2.2 이유

사진의 피부색은 다음 요소가 섞인 결과다.

```text
촬영된 피부색
= 실제 피부 반사색
× 조명 색
× 노출
× 화이트밸런스
× 카메라 센서/ISP 처리
× 압축/후처리
```

따라서 “조명 영향을 완벽히 제거”하는 것보다 다음 전략이 현실적이다.

```text
1. 카메라가 자동으로 노출/화이트밸런스를 맞추게 한다.
2. 앱이 안정 상태를 감지한다.
3. 촬영 직전에 현재 노출/화이트밸런스를 잠깐 lock한다.
4. 고품질 사진을 촬영한다.
5. 촬영 metadata와 품질 점수를 함께 저장한다.
6. 나쁜 조명/흔들림/비정면 사진은 분석하지 않고 재촬영을 유도한다.
```

## 2.3 권장 촬영 플로우

```text
FaceCaptureScreen 진입
→ iOS Native Camera preview 시작
→ continuous auto exposure / auto white balance 활성화
→ 얼굴 위치, 밝기, blur, 정면 여부 감시
→ exposure / white balance 안정화 대기
→ 조건이 0.5~1초 유지되면 현재 값 lock
→ 고화질 사진 촬영
→ image + metadata 저장
→ 다시 auto mode로 복귀
```

## 2.4 사용자 UX

사용자가 ISO, 화이트밸런스, 노출을 직접 조절하면 안 된다. 앱이 자동 제어하고, 사용자는 안내만 따른다.

예시 안내:

```text
정면을 봐주세요.
조명이 너무 어둡습니다.
색조명이 강합니다. 자연광이나 흰 조명에서 촬영해주세요.
잠시 움직이지 말아주세요.
좋아요. 지금 촬영합니다.
```

## 2.5 구현 위치

우선 수정 대상:

```text
apps/mobile/ios/AURA/AURARealtimeFaceCaptureView.m
apps/mobile/src/features/face-capture/screens/FaceCaptureScreen.tsx
```

iOS Native 쪽에서 할 일:

```text
- AVCaptureSession preset 확인
- AVCapturePhotoOutput 고품질 설정
- continuousAutoExposure / continuousAutoWhiteBalance 사용
- adjustingExposure / adjustingWhiteBalance 감시
- 촬영 직전 exposure / whiteBalance lock
- 촬영 후 auto mode 복귀
- ISO / exposureDuration / whiteBalanceGains metadata 저장
```

RN 화면 쪽에서 할 일:

```text
- 얼굴 정면 여부 gate
- blur gate
- underexposure / overexposure gate
- 색조명 gate
- 얼굴 크기 gate
- 촬영 가능/불가 UI
- 재촬영 안내
```

---

# 3. 얼굴 특징 추출 및 AI 입력 설계

## 3.1 기본 원칙

MediaPipe가 생성한 raw landmark mesh 전체를 GPT에게 그대로 넘기지 않는다.

추천 구조는 다음과 같다.

```text
MediaPipe raw landmarks
→ Feature Extractor가 거리/각도/비율/품질 점수 계산
→ 구조화된 FaceProfile JSON 생성
→ GPT 5.5에 원본 사진 + FaceProfile JSON 전달
```

GPT는 기하 계산 엔진이 아니라 **해석, 추천, 설명, recipe 생성**에 집중시킨다.

## 3.2 MediaPipe의 역할

MediaPipe는 다음 정보를 뽑는 데 사용한다.

```text
- 얼굴 랜드마크
- 눈, 코, 입, 눈썹, 얼굴 윤곽 위치
- 이목구비 경계
- 얼굴 pose
- 표정/눈깜빡임/입벌림 관련 blendshape
- 피부 ROI 후보
```

## 3.3 GPT에게 넘길 핵심 feature

모든 점을 넘기지 말고, 메이크업 추천에 필요한 feature만 보낸다.

### 1군: 반드시 포함

```text
1. facial contrast
2. skin evenness / redness / yellow hue
3. face length-width ratio
4. midface / lower-face balance
5. cheekbone / jaw / chin balance
6. eye aspect ratio
7. eye spacing
8. eye tilt
9. brow-eye distance
10. lip fullness / mouth width
11. mouth corner tilt
12. nose length / nose width
13. pose / expression / lighting quality
```

### 2군: 있으면 좋음

```text
1. brow tilt
2. eye/brow asymmetry
3. mouth asymmetry
4. cheekbone-jaw ratio
5. nose-midface ratio
6. nose tip-mouth distance
7. lip-skin contrast
```

### 초반에 제외

```text
- 478개 전체 landmark 원본
- 52개 blendshape 전체
- 모든 contour point
- 모든 mask 좌표
- 단정적인 얼굴형 라벨 하나만 제공
```

## 3.4 뷰티 관점 핵심 feature

기술 feature를 그대로 쓰지 말고, 뷰티 추천 관점으로 한 번 더 요약한다.

```json
{
  "beautyCoreFeatures": {
    "facialContrast": {
      "overall": "medium_soft",
      "eyeSkinContrast": 0.42,
      "browSkinContrast": 0.38,
      "lipSkinContrast": 0.46
    },
    "skinEvenness": {
      "toneUniformity": 0.72,
      "redness": 0.31,
      "yellowHue": 0.44
    },
    "faceBalance": {
      "faceLengthWidthRatio": 1.36,
      "midfaceLength": "slightly_long",
      "lowerFaceLength": "balanced",
      "jawSoftness": 0.68,
      "cheekboneToJawRatio": 1.24
    },
    "eyesAndBrows": {
      "eyeAspectRatio": 0.31,
      "eyeSpacing": "balanced",
      "eyeTilt": "slightly_upturned",
      "browEyeDistance": "slightly_close"
    },
    "nose": {
      "noseLengthRatio": 0.32,
      "noseWidthRatio": 0.22,
      "noseMidfaceRatio": 0.48,
      "noseTipMouthDistanceRatio": 0.18
    },
    "mouth": {
      "lipFullness": "medium",
      "mouthWidthRatio": 0.39,
      "upperLowerLipRatio": 0.67,
      "mouthCornerTilt": "slightly_downturned"
    },
    "quality": {
      "isFrontal": true,
      "neutralExpression": true,
      "lightingQuality": 0.81,
      "landmarkConfidence": 0.94
    }
  }
}
```

## 3.5 색과 기하 정보의 역할 차이

```text
색/대비/피부 균일도
→ 어떤 컬러와 어느 정도 강도로 메이크업할지 결정

눈·코·입 위치/비율/얼굴형
→ 어디에, 어떤 모양으로, 어떤 방향으로 메이크업할지 결정
```

예시:

```text
facial contrast 낮음
→ 립/브로우/아이 라인을 통해 또렷함 보완

중안부가 약간 김
→ 블러셔를 광대 바깥보다 코 가까이, 가로 방향으로 배치

눈꼬리가 올라감
→ 아이라인을 더 올리기보다 수평 확장 또는 언더 보완

입꼬리가 내려감
→ 입꼬리 컨실러/라이너 보정

코 길이 비율이 높음
→ 콧대 하이라이트를 길게 잇지 않고 코끝 중심으로 짧게 처리
```

---

# 4. AI 입력/출력 Contract

## 4.1 GPT 입력

GPT 5.5에는 다음 3가지를 함께 전달한다.

```text
1. 원본 얼굴 사진
2. FaceProfile JSON
3. capture quality metadata
```

## 4.2 GPT에게 맡길 일

```text
- 얼굴 특징 해석
- 원하는 분위기와 얼굴 feature를 조합한 메이크업 전략 제안
- 립/치크/아이/노즈/하이라이터/컨투어 recipe 생성
- 추천 이유 설명
- 신뢰도 낮은 경우 재촬영 또는 보수적 추천
```

## 4.3 GPT에게 맡기지 말 일

```text
- 478개 landmark 좌표의 거리/각도 계산
- 정밀한 색 보정
- 노출/화이트밸런스 보정
- raw mesh만 보고 얼굴 특징을 안정적으로 추론
```

## 4.4 GPT 출력: MakeupRecipe

예시:

```json
{
  "version": "1.0",
  "recipeId": "daily_peach_soft_001",
  "styleGoal": {
    "desiredImpression": "soft_daily",
    "makeupIntensity": "medium_light"
  },
  "layers": [
    {
      "id": "lip_main",
      "region": "lip",
      "channel": "R",
      "color": "#C95D6A",
      "opacity": 0.72,
      "blendMode": "normal",
      "finish": "satin",
      "edgeFeather": 0.16
    },
    {
      "id": "cheek_main",
      "region": "cheek",
      "channel": "G",
      "color": "#E99686",
      "opacity": 0.34,
      "blendMode": "softLight",
      "softness": 0.82,
      "placementHint": "horizontal_midface"
    },
    {
      "id": "eye_shadow_main",
      "region": "eye",
      "channel": "B",
      "color": "#B98572",
      "opacity": 0.42,
      "blendMode": "multiply",
      "finish": "fine_shimmer",
      "shimmerStrength": 0.28
    },
    {
      "id": "nose_contour",
      "region": "nose",
      "channel": "A",
      "color": "#8A6A5A",
      "opacity": 0.18,
      "blendMode": "multiply",
      "softness": 0.9
    }
  ]
}
```

---

# 5. Unity / ARKit / MediaPipe 런타임 설계

## 5.1 역할 분담

```text
ARKit
→ 실시간 face tracking, ARFace mesh, pose, UV, light estimation

Unity
→ mask atlas 로드, shader 렌더링, recipe 적용, AR 화면 출력

MediaPipe
→ 이미지/프레임 기반 이목구비 경계 추출, region mask 생성

iOS Native
→ 측정용 촬영, MediaPipe 실행, 파일 처리, metadata
```

## 5.2 Unity CPU Image Capture 사용

Unity의 `TryAcquireLatestCpuImage`와 `TryAcquireHighResolutionCpuImage`는 피부톤 측정보다는 **AR 마스크 생성/정렬 품질 향상**에 사용한다.

권장 fallback:

```text
1. TryAcquireHighResolutionCpuImage
2. TryAcquireLatestCpuImage
3. Screen.ReadPixels
```

단, `Screen.ReadPixels`는 최후 fallback 또는 디버그용으로만 사용한다.

## 5.3 사용 위치

```text
ARMaskGenerationScreen
→ Unity에 ARKit reference frame capture 요청
→ Unity가 high-res/latest CPU image 획득
→ 같은 순간의 ARFace mesh / UV / pose export
→ MediaPipe 분석
→ mask atlas 생성
→ Unity에 적용
```

## 5.4 AR 품질 개선 효과

Unity CPU image capture는 다음 품질을 올린다.

```text
- MediaPipe가 분석하는 기준 이미지 품질
- ARFace mesh와 분석 이미지의 동기화
- 입술/눈/볼 경계 정렬
- mask atlas 생성 정확도
- 디버깅 가능한 reference frame 확보
```

---

# 6. 메이크업 에셋 제작 전략

## 6.1 기본 방향

현재처럼 사람이 에셋을 그리는 방식은 유지한다.
단, 결과물을 “완성 이미지”가 아니라 **마스크/패턴/채널 데이터**로 다룬다.

```text
나쁜 방식:
색까지 칠해진 완성 PNG를 룩마다 제작

좋은 방식:
마스크 템플릿 + 채널 패킹 + recipe JSON으로 룩 생성
```

## 6.2 에셋의 정의

메이크업 에셋은 PNG 한 장이 아니라 다음 묶음이다.

```text
Makeup Asset
= mask/channel texture
+ color parameters
+ opacity
+ blendMode
+ finish
+ softness/feather
+ placement rule
+ recipe JSON
```

## 6.3 Channel-packed Mask

예시:

```text
mask_pack.png

R = lip mask
G = cheek mask
B = eye shadow mask
A = highlight / nose contour / gloss mask
```

부위별 세분화 예시:

```text
lip_pack.png
R = full lip alpha
G = inner lip gradient
B = edge feather
A = gloss area

cheek_pack.png
R = cheek blush alpha
G = high cheek falloff
B = under-eye blush
A = contour/highlight control
```

## 6.4 Browser Makeup Asset Lab

Unity Editor를 사람이 켜서 에셋을 만들 필요는 없다.
대신 브라우저 기반 내부 도구를 만든다.

기능:

```text
- PNG 업로드
- RGBA 채널 미리보기
- region 선택
- color picker
- opacity slider
- blendMode 선택
- softness / feather / spread 조정
- gloss / shimmer / roughness 조정
- 2D 얼굴 preview
- recipe JSON export
- recipe validation
```

## 6.5 제작 흐름

```text
1. 디자이너/팀원이 Photoshop, Procreate, AI tool로 rough mask 제작
2. Browser Makeup Asset Lab에 업로드
3. 채널 확인
4. 색/강도/블렌드/질감 조정
5. 2D preview 확인
6. recipe JSON + mask asset 저장
7. 앱에서 recipe를 Unity에 전달
8. Unity는 렌더링만 수행
```

## 6.6 AI의 역할

AI에게 완성 PNG를 직접 만들게 하기보다 **recipe 초안 생성기**로 사용한다.

예시 입력:

```text
봄웜톤 데일리 코랄 메이크업.
블러셔는 중안부가 짧아 보이게 가로 방향.
립은 촉촉한 코랄.
아이섀도우는 은은한 피치 브라운.
```

AI 출력:

```json
{
  "targetStyle": ["spring_warm", "daily", "coral", "soft"],
  "layers": [
    {
      "region": "cheek",
      "shape": "horizontal_midface",
      "color": "#F19A86",
      "opacity": 0.32,
      "blendMode": "softLight",
      "softness": 0.86
    },
    {
      "region": "lip",
      "mask": "lip_full_soft",
      "color": "#D96F68",
      "opacity": 0.76,
      "finish": "gloss"
    }
  ]
}
```

그 후 validator가 검증한다.

```text
- color 형식 정상 여부
- opacity 0~1 범위
- 지원 blendMode 여부
- 지원 finish 여부
- mask 이름 존재 여부
- channel 충돌 여부
```

---

# 7. Unity 모바일 최적화 전략

## 7.1 최우선 최적화

현재 구조에서 가장 큰 최적화 포인트는 Unity 내부 미세 튜닝보다 **Unity에 들어가는 데이터 양과 로딩 횟수를 줄이는 것**이다.

```text
base64 마스크 여러 개 전송
→ mask atlas file path + recipe JSON 전송
```

## 7.2 권장 데이터 전달 방식

```text
마스크 생성 결과
→ 로컬 파일로 저장
→ Unity에는 file path / atlasId 전달
→ Unity가 한 번 로드하고 cache
→ 이후 recipe만 변경
```

예시:

```json
{
  "maskAtlas": {
    "atlasId": "user_123_capture_456",
    "uri": "file:///var/mobile/.../mask_atlas.png",
    "width": 1024,
    "height": 1024,
    "channels": {
      "R": "lip",
      "G": "cheek",
      "B": "eye",
      "A": "highlight"
    },
    "coordinateSpace": "arkit_uv"
  },
  "recipe": {
    "recipeId": "daily_peach_001",
    "layers": []
  }
}
```

## 7.3 룩 변경은 recipe patch로 처리

```text
립 색 변경
→ texture 재생성 X
→ shader color parameter 변경

블러셔 강도 변경
→ mask 재생성 X
→ opacity 변경

글로시/매트 변경
→ texture 재생성 X
→ gloss/roughness parameter 변경
```

예시:

```json
{
  "updateType": "recipe_patch",
  "patch": {
    "lip.color": "#D65C72",
    "lip.opacity": 0.68,
    "cheek.opacity": 0.31,
    "eye.shimmerStrength": 0.22
  }
}
```

## 7.4 Unity 쪽 최적화 항목

```text
1. Channel-packed mask atlas 사용
2. base64 대신 file path / asset id 전달
3. Texture2D cache 도입
4. 동일 atlasId 재사용
5. CPU image capture는 on-demand
6. AR runtime 중 매 프레임 CPU image capture 금지
7. 가능하면 단일 ARFace renderer / 단일 makeup material 사용
8. shader variant 최소화
9. texture compression 검토
10. Unity lifecycle 관리
11. Debug overlay / Profiler / Memory log 도입
```

## 7.5 CPU Image Capture 사용 규칙

```text
사용:
- AR 마스크 생성 시점
- reference frame capture
- debugging

금지:
- 매 프레임 실시간 사용
- 피부톤 측정 원본 용도
```

## 7.6 Unity lifecycle

```text
앱 시작 시 Unity 무조건 로드 X
AR 화면 진입 시 load/activate
AR 화면 종료 시 ARSession pause + texture cache 정리
자주 왕복하는 UX에서는 warm 상태 유지
메모리 경고 시 cache release
```

---

# 8. 실사용 통합을 위한 SDK 제공 형태

## 8.1 핵심 원칙

엔진을 코드 덩어리로 넘기면 안 된다.
팀원에게는 **Drop-in Screen + TypeScript SDK + JSON Contract** 형태로 제공해야 한다.

팀원이 보는 사용 방식:

```tsx
<AURAMakeupARScreen
  faceProfile={faceProfile}
  maskAtlas={maskAtlas}
  initialRecipe={makeupRecipe}
  onClose={handleClose}
  onError={handleError}
/>
```

## 8.2 SDK 구성

```text
AURA AR Makeup SDK

1. RN Integration Layer
   - TypeScript API
   - 화면 컴포넌트
   - hook
   - bridge wrapper

2. Unity Runtime Layer
   - ARKit face tracking
   - mask rendering
   - shader 처리

3. Native iOS Layer
   - 촬영
   - MediaPipe
   - 파일 처리
   - 권한

4. Contract Layer
   - FaceProfile JSON
   - MaskAtlas JSON
   - MakeupRecipe JSON
   - Error/Event schema

5. Sample App / Test Assets
   - sampleFaceProfile.json
   - sampleMaskAtlas.png
   - sampleRecipe.json
```

## 8.3 두 가지 통합 방식

### 쉬운 방식: Drop-in Screen

```tsx
<AURAMakeupARScreen
  userId={userId}
  faceProfile={faceProfile}
  maskAtlas={maskAtlas}
  initialRecipe={recipe}
  onRecipeChange={setRecipe}
  onCapture={handleCapture}
  onClose={navigation.goBack}
/>
```

### 고급 방식: Headless SDK

```ts
const engine = useAURAMakeupEngine();

await engine.initialize();
await engine.loadMaskAtlas(maskAtlas);
await engine.applyRecipe(recipe);
await engine.updateLayer("lip", { color: "#D85F72", opacity: 0.7 });
await engine.dispose();
```

MVP에서는 Drop-in Screen을 먼저 제공한다.

## 8.4 Adapter Layer

기존 엔진과 새 엔진을 바로 교체하지 않는다.
Adapter를 둔다.

```ts
interface AURAMakeupEngineAdapter {
  initialize(): Promise<void>;
  loadMaskAtlas(maskAtlas: MaskAtlasPackage): Promise<void>;
  applyRecipe(recipe: MakeupRecipe): Promise<void>;
  updateLayer(layerId: string, patch: MakeupLayerPatch): Promise<void>;
  dispose(): Promise<void>;
}
```

구현체:

```text
LegacyUnityEngineAdapter
NewUnityEngineAdapter
```

feature flag:

```ts
const engine =
  flags.useNewMakeupEngine
    ? new NewUnityEngineAdapter()
    : new LegacyUnityEngineAdapter();
```

## 8.5 Error Contract

에러 코드를 고정한다.

```ts
type AURAErrorCode =
  | "UNITY_NOT_READY"
  | "AR_SESSION_FAILED"
  | "CAMERA_PERMISSION_DENIED"
  | "FACE_NOT_TRACKED"
  | "MASK_ATLAS_NOT_FOUND"
  | "MASK_ATLAS_INVALID"
  | "RECIPE_SCHEMA_INVALID"
  | "UNSUPPORTED_BLEND_MODE"
  | "TEXTURE_LOAD_FAILED"
  | "NATIVE_MEDIAPIPE_FAILED"
  | "TIMEOUT"
  | "UNKNOWN";
```

에러 예시:

```json
{
  "code": "RECIPE_SCHEMA_INVALID",
  "message": "Layer cheek_main uses unsupported blendMode: overlayPlus",
  "recoverable": true,
  "source": "recipe-validator",
  "debug": {
    "recipeId": "daily_peach_001",
    "layerId": "cheek_main"
  }
}
```

## 8.6 SDK 제공물

```text
1. INTEGRATION.md
2. API_CONTRACT.md
3. MIGRATION.md
4. TROUBLESHOOTING.md
5. sampleRecipe.json
6. sampleMaskAtlas.png
7. sampleFaceProfile.json
8. AURAMakeupARExampleScreen.tsx
9. aura:doctor script
10. aura:validate-recipe script
```

---

# 9. 개발 환경 및 검증 전략

## 9.1 원칙

기존 앱 안에서 바로 엔진을 개발하지 않는다.
다음 5개 환경으로 나누어 개발한다.

```text
1. Contract Lab
2. Browser Preview Lab
3. Unity Runtime Harness
4. Mobile Sandbox App
5. Existing App Integration
```

## 9.2 추천 repo 구조

```text
apps/
  mobile/
    기존 React Native 앱

  mobile-sandbox/
    AR 엔진만 붙인 최소 RN 테스트 앱

  unity/
    MakeupAR/
      Unity AR runtime

  makeup-asset-lab/
    브라우저 기반 에셋/recipe preview 툴

packages/
  aura-makeup-sdk/
    RN SDK wrapper
    schema validator
    Unity bridge adapter

  aura-makeup-contracts/
    FaceProfile / MaskAtlas / MakeupRecipe 타입과 JSON schema

tools/
  fixtures/
    sampleFaceProfile.json
    sampleMaskAtlas.png
    sampleRecipe.json

  aura-doctor/
    환경 체크 스크립트

  aura-bench/
    성능 측정 스크립트
```

## 9.3 Contract Lab

목적:

```text
- FaceProfile schema 검증
- MaskAtlas schema 검증
- MakeupRecipe schema 검증
- 지원 blendMode 검증
- color/opacity/softness 범위 검증
```

명령어 예시:

```bash
yarn aura:test-contracts
yarn aura:validate-recipe sampleRecipe.json
```

## 9.4 Browser Preview Lab

목적:

```text
- Unity 없이 에셋/recipe 결과 확인
- RGBA 채널 확인
- color/opacity/blendMode preview
- recipe JSON export
- recipe validation
```

## 9.5 Unity Runtime Harness

Unity 안에 RN 없이 동작하는 테스트 씬을 만든다.

```text
Scene: AURA_RuntimeHarness

기능:
- Load sample mask atlas
- Load sample recipe
- Apply lip only
- Apply cheek only
- Apply full look
- Toggle debug mask
- Show FPS/memory
```

검증 항목:

```text
- mask atlas 로드
- channel sample 정상
- recipe 적용
- shader parameter 정상
- ARFace mesh 위 정렬
- texture cache
- FPS
```

## 9.6 Mobile Sandbox App

기존 앱과 분리된 최소 모바일 앱을 둔다.

화면:

```text
1. Permission Check
2. Unity AR Open
3. Apply Sample Recipe
4. Apply User Mask Atlas
5. Performance Debug
```

검증 항목:

```text
- RN → Unity bridge 연결
- Unity ready event 수신
- sample recipe 적용
- sample mask atlas 적용
- ARKit face tracking
- app background/foreground 복귀
- crash 없음
```

## 9.7 Existing App Integration

기존 앱에는 마지막에 feature flag로 연결한다.

허용 변경:

```text
- route 하나 추가
- SDK import
- EngineAdapter 교체
- feature flag 추가
```

금지 변경:

```text
- 기존 FaceCaptureScreen 대규모 수정
- 기존 Unity bridge 함수명 무단 변경
- 기존 recipe 구조 무단 변경
- iOS native module 대규모 직접 수정
```

---

# 10. 디버그 및 진단 도구

## 10.1 Unity Debug Overlay

AR 화면 위에 개발자용 overlay를 둔다.

```text
AURA Debug Overlay

- Unity ready
- AR tracking state
- face detected
- current recipeId
- current maskAtlasId
- texture loaded
- FPS
- texture memory
- last error
- channel view: R/G/B/A
```

버튼:

```text
- Show lip mask
- Show cheek mask
- Show eye mask
- Show final makeup
- Reload recipe
- Clear texture cache
- Export diagnostics
```

## 10.2 Doctor Script

```bash
yarn aura:doctor
```

체크 항목:

```text
- Unity build artifact 존재
- iOS native module 링크 상태
- camera permission 설정
- sample recipe schema 통과
- sample mask atlas 파일 존재
- bridge function 이름 일치
- Unity ready event 수신 가능
```

## 10.3 성능 기준

초기 목표:

```text
AR screen open: 3초 이내
Unity ready event: 5초 이내
sample recipe apply: 300ms 이내
mask atlas load: 500ms 이내
runtime FPS: 50fps 이상
recipe apply failure: 0
crash: 0
```

측정 지표:

```text
- Unity startup time
- AR screen 진입 시간
- Texture memory
- GC allocation
- main thread spike
- render thread time
- CPU image capture time
- Texture2D 생성 횟수
- bridge message size
- base64 decode time
- GPU frame time
- thermal throttling
```

---

# 11. 구현 우선순위

## Phase 0. Baseline 기록

```text
- 현재 AR 화면 진입 시간
- 현재 FPS
- 현재 mask 전송 방식
- 현재 recipe 적용 방식
- 현재 crash/error 로그
```

## Phase 1. Contract 고정

```text
- FaceProfile schema
- MaskAtlasPackage schema
- MakeupRecipe schema
- Error/Event schema
- sample fixtures
- validator
```

## Phase 2. 촬영 품질 개선

```text
- iOS Native camera 측정 모드
- exposure / white balance 안정화
- lock-before-capture
- quality gate
- metadata 저장
```

## Phase 3. 얼굴 feature extractor

```text
- MediaPipe landmark 기반 feature 계산
- facial contrast
- skin evenness
- face balance
- eye/brow/lip/nose feature
- quality metadata
```

## Phase 4. AI recipe 생성

```text
- GPT 입력 포맷 고정
- Structured MakeupRecipe 출력
- recipe validation
- fallback recipe
```

## Phase 5. Browser Makeup Asset Lab

```text
- PNG upload
- RGBA channel preview
- color/opacity/blendMode 조정
- 2D preview
- recipe export
```

## Phase 6. Unity runtime 개선

```text
- mask atlas file path 로딩
- channel-packed mask shader
- texture cache
- recipe patch update
- debug overlay
```

## Phase 7. Mobile Sandbox

```text
- 최소 RN 앱에서 Unity 통합 검증
- sample recipe 적용
- 실기기 테스트
```

## Phase 8. 기존 앱 통합

```text
- Adapter layer
- Drop-in Screen
- feature flag
- legacy/new engine 전환
- doctor script
```

---

# 12. 바이브 코딩 에이전트에게 줄 개발 원칙

엔진 개발 시 에이전트에게 다음 제약을 반드시 준다.

```text
이 엔진은 기존 앱에 한 번에 병합하지 않는다.
반드시 독립 테스트 가능한 harness를 먼저 만든다.

구현 순서:
1. JSON schema
2. fixtures
3. validator
4. browser preview
5. Unity harness
6. mobile sandbox
7. adapter integration

기존 앱 변경은 마지막 단계에서 feature flag로만 연결한다.
기존 bridge 함수명과 기존 recipe 구조는 호환성을 유지한다.
모든 새 기능은 sample fixture로 검증 가능해야 한다.
기존 FaceCaptureScreen, Unity bridge, iOS native module을 대규모로 직접 수정하지 않는다.
```

---

# 13. 최종 목표 형태

최종적으로 팀원이 보는 것은 복잡한 Unity 엔진이 아니라 다음 API여야 한다.

```tsx
<AURAMakeupARScreen
  faceProfile={faceProfile}
  maskAtlas={maskAtlas}
  initialRecipe={makeupRecipe}
  onClose={handleClose}
  onError={handleError}
/>
```

또는:

```ts
await auraMakeup.initialize();
await auraMakeup.loadMaskAtlas(maskAtlas);
await auraMakeup.applyRecipe(recipe);
await auraMakeup.updateLayer("lip", {
  color: "#D85F72",
  opacity: 0.7
});
```

Unity, ARKit, MediaPipe, native camera, mask atlas, shader, bridge는 전부 SDK 내부에 감춘다.

---

# 14. 최종 결론

이 프로젝트의 핵심은 단순히 AR 메이크업을 한 번 보이게 만드는 것이 아니다.
실사용 가능한 엔진으로 만들려면 다음 6가지를 동시에 만족해야 한다.

```text
1. 측정용 사진은 iOS Native 카메라에서 안정적으로 촬영한다.
2. MediaPipe raw mesh는 feature extractor를 거쳐 의미 있는 FaceProfile JSON으로 만든다.
3. GPT 5.5에는 원본 사진 + FaceProfile + 품질 metadata를 함께 넘긴다.
4. 메이크업 에셋은 완성 PNG가 아니라 mask/channel texture + recipe JSON으로 관리한다.
5. Unity에는 base64 대량 전송이 아니라 mask atlas file path + recipe patch를 전달한다.
6. 기존 앱에는 SDK/Adapter/Drop-in Screen/feature flag 형태로 점진 통합한다.
```

개발 환경은 다음 5단계로 나눈다.

```text
Contract Lab
→ 데이터 계약 검증

Browser Preview Lab
→ 에셋/recipe 검증

Unity Runtime Harness
→ Unity 렌더링 검증

Mobile Sandbox App
→ 실기기 RN + Unity 통합 검증

Existing App Integration
→ feature flag로 기존 앱에 점진 적용
```

이 구조로 가면 바이브 코딩으로 개발하더라도, 엔진이 기존 앱에 무리 없이 통합되고, 팀원들이 Unity 내부를 몰라도 안전하게 사용할 수 있다.