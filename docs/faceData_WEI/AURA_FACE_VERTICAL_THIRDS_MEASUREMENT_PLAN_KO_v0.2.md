# AURA 얼굴 세로 비율 측정 기획서 v0.2

작성일: 2026-07-04 KST  
상태: 구현 기획 / 개발자 전달용 / 측정 기술 설계 보강  
범위: **상안부 · 중안부 · 하안부 세로 비율 측정만** 다룬다.

---

## 0. 한 줄 목표

사용자가 정면 얼굴을 촬영하면 앱이 얼굴 세로 기준선을 검출하고, 촬영 사진 위에 **상안부 / 중안부 / 하안부 분석 오버레이 이미지**를 생성한다. 동시에 Mac 개발 환경에서 구조화 로그로 분석 성공 여부와 실패 원인을 추적할 수 있어야 한다.

```text
촬영
→ 품질 gate
→ 얼굴 landmark / 헤어라인 검출
→ H / G / Sn / Me 기준선 계산
→ 상안부·중안부·하안부 비율 계산
→ 분석 오버레이 이미지 저장/표시
→ Mac 로그에서 success / blocked / failed 추적
```

---

## 1. 이번 문서의 범위

### 1.1 포함

```text
- 촬영 후 단일 정면 사진 기준 얼굴 세로 3분할 측정
- 상안부 / 중안부 / 하안부 비율 계산
- 헤어라인이 보이는 경우에만 상안부 계산
- 헤어라인이 가려진 경우 partial result 또는 재촬영 안내
- 분석 결과 JSON 생성
- 촬영 사진 위 분석 오버레이 이미지 생성
- Mac에서 볼 수 있는 구조화 로그 생성
- 성공/실패 판정 기준 정의
```


이번 기능 이름은 내부적으로 `FaceRatioThreeParts`로 고정한다.

---

## 2. 사용자 경험

### 2.1 기본 플로우

```text
1. 사용자가 얼굴 비율 분석 진입
2. 카메라에서 정면 얼굴 촬영
3. 앱이 품질을 검사
4. 분석 성공 시 촬영 사진 위에 3분할 오버레이 표시
5. 사용자는 상안부 / 중안부 / 하안부 비율과 간단한 해석을 본다
6. 분석 실패 또는 신뢰도 낮음이면 재촬영 안내를 본다
```

### 2.2 화면 출력

분석 성공 화면은 업로드 예시처럼 **촬영 사진 자체 위에 기준선과 반투명 영역**이 보여야 한다.

필수 표시 요소:

```text
- 원본 촬영 사진
- 얼굴 중앙 세로 기준선 선택 사항
- H: 헤어라인 기준선
- G: 미간/눈썹 기준선
- Sn: 코밑 기준선
- Me: 턱끝 기준선
- 상안부 영역: H → G
- 중안부 영역: G → Sn
- 하안부 영역: Sn → Me
- 각 영역 오른쪽 또는 내부에 비율 숫자 표시
- 하단에 평균 기준과 내 비율 표시
```

예시 문구:

```text
얼굴 세로 비율
상안부가 약간 강조된 얼굴

평균 비율 1.0 : 1.0 : 0.8
나의 비율 1.04 : 1.00 : 1.01
```

주의:

```text
- 얼굴형, 좌우 비대칭, 길쭉한 얼굴 같은 다른 분석 문구를 섞지 않는다.
- 이 화면의 제목은 “얼굴형 분석”이 아니라 “얼굴 세로 비율 분석” 또는 “상·중·하안 비율 분석”으로 둔다.
```

---

## 3. 측정 기준

### 3.1 기준점

| 기호 | 이름 | 의미 | 필수 여부 |
|---|---|---|---|
| `H` | Hairline Center | 중앙 헤어라인 | full success에 필수 |
| `G` | Glabella / Brow Line | 미간 또는 눈썹 기준선 | 필수 |
| `Sn` | Subnasale | 코밑점 | 필수 |
| `Me` | Menton | 턱끝 | 필수 |

세로 3분할은 아래처럼만 계산한다.

```text
상안부 = H → G
중안부 = G → Sn
하안부 = Sn → Me
```

코끝은 기준점으로 쓰지 않는다.

```text
금지: 상안부 / 중안부 / 하안부를 헤어라인 → 눈썹 → 코끝 → 턱끝으로 계산
허용: 헤어라인 → 미간/눈썹선 → 코밑 → 턱끝
```

### 3.2 비율 계산

이미지 좌표계에서 y는 아래로 증가한다고 가정한다.

```ts
upperPx = G.y - H.y;
middlePx = Sn.y - G.y;
lowerPx = Me.y - Sn.y;

// “중안부 = 1.00” 기준 표시용
upperDisplayRatio = upperPx / middlePx;
middleDisplayRatio = 1.0;
lowerDisplayRatio = lowerPx / middlePx;

// 전체 얼굴 높이 기준 저장용
totalPx = Me.y - H.y;
upperNormalized = upperPx / totalPx;
middleNormalized = middlePx / totalPx;
lowerNormalized = lowerPx / totalPx;
```

UI에는 사용자가 이해하기 쉬운 `upperDisplayRatio : 1.00 : lowerDisplayRatio`를 우선 표시한다. 내부 JSON에는 normalized ratio와 raw pixel height를 모두 저장한다.

---

## 4. 실제 측정 기술 설계

이 섹션은 `H / G / Sn / Me`를 실제로 어떻게 잡을지 정의한다.  
핵심은 **MediaPipe로 얼굴 기준점(G/Sn/Me)을 잡고, Apple hair/skin matte 또는 face parsing으로 헤어라인(H)을 잡는 하이브리드 방식**이다.

```text
정면 촬영 사진
→ MediaPipe FaceLandmarker
   - G: 미간/눈썹 기준선
   - Sn: 코밑점
   - Me: 턱끝
   - pose / expression gate
→ Apple AVSemanticSegmentationMatte 또는 face parsing
   - hair mask
   - skin mask
   - forehead ROI
   - H: 중앙 헤어라인
→ H/G/Sn/Me 순서와 confidence 검증
→ 상안부·중안부·하안부 비율 계산
```

### 4.1 기술 선택 결론

| 기술 | 이번 기능에서의 역할 | 우선순위 |
|---|---|---|
| MediaPipe FaceLandmarker | 얼굴 landmark, G/Sn/Me, pose/expression gate | 필수 |
| Apple AVFoundation Semantic Segmentation Matte | hair/skin matte로 H 헤어라인 추출 | iOS 실기기 우선 |
| Face parsing fallback, 예: BiSeNet 계열 | Apple hair/skin matte가 없을 때 헤어라인 추출 보조 | fallback |
| ARKit / TrueDepth | 이번 정면 사진 1장 MVP에는 필수 아님. 이후 3D projection/회전 캡처 보정에 사용 | V2 |
| 단순 image heuristic | segmentation이 없을 때 참고만 가능. full_success 근거로 쓰지 않음 | 최후 fallback |

주의:

```text
MediaPipe는 눈, 코, 입, 턱 같은 의미 landmark에 강하지만,
실제 헤어라인은 직접 제공하지 않는다.

따라서 H는 MediaPipe landmark만으로 만들지 않는다.
H는 hair/skin segmentation 또는 face parsing으로 검출한다.
```

---

### 4.2 MediaPipe로 잡는 기준점

MediaPipe FaceLandmarker는 단일 이미지에서도 얼굴 landmark를 반환할 수 있다. 이번 기능에서는 정면 사진 1장을 `running_mode = IMAGE`로 처리한다.

#### 4.2.1 G: Glabella / Brow Line

`G`는 미간 또는 눈썹 기준선이다. MediaPipe에서 직접 `glabella`라는 단일 공식 출력이 있는 것은 아니므로, 아래 후보를 조합해 만든다.

권장 후보:

```ts
// 후보 landmark group, 실제 index는 구현 시 한 번 더 overlay로 검증한다.
const GLABELLA_CANDIDATES = [9, 151];          // 미간/이마 하단 근처 후보
const LEFT_INNER_BROW = [107, 55, 65];         // 왼쪽 안쪽 눈썹 후보
const RIGHT_INNER_BROW = [336, 285, 295];      // 오른쪽 안쪽 눈썹 후보
```

권장 계산:

```ts
G.x = medianX([
  landmarks[9],
  landmarks[151],
  average(LEFT_INNER_BROW),
  average(RIGHT_INNER_BROW),
]);

G.y = medianY([
  landmarks[9],
  landmarks[151],
  average(LEFT_INNER_BROW),
  average(RIGHT_INNER_BROW),
]);
```

실무 기준:

```text
- G는 “눈썹 시작선”에 너무 치우치지 않게 미간/눈썹선 평균으로 둔다.
- 눈썹이 짙거나 눈썹 모양이 특이해도 landmark 기준은 안정적이어야 한다.
- overlay debug에서 G 선이 양쪽 눈썹 안쪽~미간 부근을 지나야 한다.
```

---

#### 4.2.2 Sn: Subnasale / 코밑점

`Sn`은 코와 인중이 만나는 하단 중앙점이다. 코끝이 아니라 **코밑점**이다.

권장 후보:

```ts
const SUBNASALE_CANDIDATES = [2, 97, 326];
```

권장 계산:

```ts
Sn.x = medianX(SUBNASALE_CANDIDATES.map(i => landmarks[i]));
Sn.y = medianY(SUBNASALE_CANDIDATES.map(i => landmarks[i]));
```

실무 기준:

```text
- Sn 선은 콧구멍 하단/인중 시작부 근처를 지나야 한다.
- 코끝 landmark를 쓰면 중안부가 과도하게 길어지거나 짧아질 수 있으므로 금지한다.
- Sn 후보가 코끝 쪽으로 올라가 보이면 index set을 다시 조정한다.
```

---

#### 4.2.3 Me: Menton / 턱끝

`Me`는 턱끝이다.

권장 후보:

```ts
const MENTON_INDEX = 152;
```

권장 계산:

```ts
Me = landmarks[152];
```

실무 기준:

```text
- Me 선은 얼굴 윤곽 최하단 턱끝을 지나야 한다.
- 입을 벌린 사진에서는 하안부 기준이 흔들릴 수 있으므로 blocked 또는 low confidence 처리한다.
```

---

### 4.3 Apple hair/skin matte로 H 추출

`H`는 중앙 헤어라인이다. MediaPipe만으로는 실제 헤어라인을 알 수 없으므로, iOS 실기기에서는 Apple의 semantic segmentation matte를 우선 사용한다.

Apple path의 목적:

```text
AVCapturePhotoOutput
→ hair matte / skin matte 요청
→ 촬영 사진과 같은 orientation/size로 matte 정렬
→ forehead ROI에서 hair와 skin의 경계 검출
→ 중앙 헤어라인 H 계산
```

#### 4.3.1 iOS Native capture 설정

iOS Native camera에서 지원되는 matte type을 확인한다.

```swift
let availableTypes = photoOutput.availableSemanticSegmentationMatteTypes

let desiredTypes: [AVSemanticSegmentationMatte.MatteType] = [
  .hair,
  .skin
].filter { availableTypes.contains($0) }

photoOutput.enabledSemanticSegmentationMatteTypes = desiredTypes

let settings = AVCapturePhotoSettings()
settings.enabledSemanticSegmentationMatteTypes = desiredTypes
settings.embedsSemanticSegmentationMattesInPhoto = true
```

주의:

```text
- availableSemanticSegmentationMatteTypes에 hair/skin이 없으면 Apple matte path를 사용하지 않는다.
- 기기/카메라/설정에 따라 matte가 항상 반환된다고 가정하지 않는다.
- semantic matte 요청은 처리 시간을 늘릴 수 있으므로 촬영 UX에 로딩 상태를 둔다.
```

---

#### 4.3.2 matte 정렬

Apple matte는 원본 사진과 orientation/scale이 다를 수 있으므로, 분석 전에 반드시 정렬한다.

```text
1. source image의 EXIF orientation 확인
2. hair matte / skin matte에 동일 orientation 적용
3. source image 기준 width/height로 resize
4. mask alpha를 0~1 float로 정규화
5. overlay debug에서 hair/skin mask가 얼굴과 맞는지 확인
```

저장 artifact:

```text
face-vertical-thirds/<sessionId>/
  source.jpg
  apple-hair-matte.png      // debug mode
  apple-skin-matte.png      // debug mode
  hairline-debug.png        // debug mode
```

---

#### 4.3.3 forehead ROI 정의

헤어라인은 전체 이미지에서 찾지 않고, MediaPipe 기준점으로 제한한 이마 ROI에서만 찾는다.

권장 ROI:

```ts
faceCenterX = (landmarks[234].x + landmarks[454].x) / 2;
faceWidth = distanceX(landmarks[234], landmarks[454]);

roiX0 = faceCenterX - faceWidth * 0.28;
roiX1 = faceCenterX + faceWidth * 0.28;

// G보다 위쪽만 본다.
roiY0 = max(0, landmarks[10].y - faceWidth * 0.35);
roiY1 = G.y - faceWidth * 0.03;
```

의미:

```text
- 얼굴 중앙 50~60% 폭만 사용한다.
- 관자놀이/옆머리 경계가 중앙 헤어라인으로 오인되는 것을 막는다.
- 눈썹선보다 아래는 보지 않는다.
```

---

#### 4.3.4 H 후보 검출

중앙 ROI 안에서 column별로 hair→skin 경계를 찾는다.

```ts
function detectHairlineCandidates(hairMask, skinMask, roi) {
  const candidates = [];

  for (const x of sampleColumns(roi.x0, roi.x1, step = 2)) {
    for (let y = roi.y0; y < roi.y1; y++) {
      const hairAbove = meanAlpha(hairMask, x, y - 3, y) > 0.45;
      const skinBelow = meanAlpha(skinMask, x, y, y + 6) > 0.35;
      const gradient = abs(hairMask[x, y - 2] - skinMask[x, y + 2]);

      if (hairAbove && skinBelow && gradient > 0.25) {
        candidates.push({ x, y, gradient });
        break;
      }
    }
  }

  return candidates;
}
```

후처리:

```ts
// outlier 제거
const ys = candidates.map(p => p.y);
const yMedian = median(ys);
const filtered = candidates.filter(p => Math.abs(p.y - yMedian) < faceWidth * 0.08);

// 중앙 x 주변에 더 높은 가중치
H.y = weightedMedian(filtered, weightByCenterAndGradient);
H.x = faceCenterX;
```

---

#### 4.3.5 hairline visible 판단

상안부를 계산하려면 H가 있어야 하지만, 앞머리/모자/그림자 때문에 H가 불확실할 수 있다. 아래 조건 중 하나라도 강하면 `hairlineVisible = false` 또는 low confidence로 둔다.

```text
- forehead ROI 중앙에 skin 영역이 거의 없음
- hair mask가 눈썹 가까이까지 내려옴
- hair/skin 경계 후보가 여러 줄로 갈라짐
- 후보 y 분산이 큼
- 모자/강한 그림자/앞머리로 중앙 이마가 덮임
- H가 G에 너무 가까움
```

confidence 계산 예시:

```ts
hairlineConfidence =
  0.35 * boundarySharpness +
  0.25 * candidateConsistency +
  0.20 * foreheadSkinVisibility +
  0.10 * poseQuality +
  0.10 * lightingQuality;
```

판정:

```text
hairlineConfidence >= 0.70 → H 사용, full_success 가능
0.45 <= hairlineConfidence < 0.70 → partial_success 또는 low confidence
hairlineConfidence < 0.45 → H 사용 금지
```

---

### 4.4 Apple matte가 없을 때: Velog식 face parsing fallback

Apple hair/skin matte가 없거나 simulator/Android/web에서 동작해야 하면, Velog 방식처럼 **face parsing/segmentation + MediaPipe를 조합**한다.

Velog식 핵심 아이디어:

```text
- 헤어라인 위치 → BiSeNet 같은 face parsing segmentation으로 추출
- 미간/코/턱/광대 등 정밀 좌표 → MediaPipe FaceMesh로 측정
```

fallback pipeline:

```text
source image
→ face parsing model
   - hair class
   - skin/face class
→ forehead ROI
→ hair/skin boundary 검출
→ H 후보 산출
→ MediaPipe G/Sn/Me와 결합
```

BiSeNet/face parsing fallback의 장점:

```text
- Apple semantic matte가 없어도 헤어라인 후보를 만들 수 있다.
- Velog 사례처럼 hair segmentation과 MediaPipe landmark를 역할 분리할 수 있다.
```

한계:

```text
- 앞머리, 모자, 진한 그림자에서는 hairline이 부정확하다.
- 모델/weights 라이선스와 앱 번들링 가능 여부를 별도 확인해야 한다.
- 앱 내 실시간이 아니라 촬영 후 분석으로 제한하는 편이 안전하다.
```

fallback 판정 원칙:

```text
face parsing으로 H를 찾았더라도 confidence가 낮으면 full_success로 올리지 않는다.
헤어라인이 애매하면 H를 추정하지 말고 partial_success를 반환한다.
```

---

### 4.5 segmentation도 없을 때: heuristic fallback

Apple matte와 face parsing이 모두 없으면, H는 안정적으로 측정하지 않는다.

허용되는 것:

```text
- MediaPipe G/Sn/Me 기반 중안부:하안부 비율 계산
- partial_success 반환
- “헤어라인 측정 불가” 안내
```

금지되는 것:

```text
- landmark 10 또는 얼굴 bbox top을 실제 헤어라인으로 단정
- 앞머리 아래선을 헤어라인으로 단정
- H confidence 없이 full_success 처리
```

최후 heuristic은 debug 참고로만 쓴다.

```ts
// debug only, full_success 근거로 사용 금지
approxForeheadTop = landmarks[10].y;
```

---

### 4.6 Optional: ARKit / TrueDepth 사용 범위

이번 `FaceRatioThreeParts` MVP는 촬영 사진 1장 기반이므로 ARKit/TrueDepth는 필수 경로가 아니다.

사용 가능한 V2 범위:

```text
- 짧은 정면 안정 프레임 20~40개 집계
- pose/yaw/pitch/roll 보정
- TrueDepth depth noise 기반 quality gate
- 얼굴 3D projection 분석
- 장두/단두 같은 측면/두상 proxy 분석
```

이번 기능에서 ARKit/TrueDepth를 H/G/Sn/Me 기준점의 primary source로 쓰지 않는 이유:

```text
- ARKit face mesh는 얼굴 앞면 중심이며 실제 헤어라인/머리카락 경계를 제공하지 않는다.
- TrueDepth는 헤어라인 semantic label을 주지 않는다.
- 세로 3분할은 semantic 기준점이 중요하므로 MediaPipe + hair/skin segmentation이 더 직접적이다.
```

---

### 4.7 최종 provider 우선순위

```text
Provider A: iOS 실기기 권장
AVFoundation photo + Apple hair/skin matte + MediaPipe FaceLandmarker

Provider B: cross-platform fallback
Face parsing, 예: BiSeNet 계열 + MediaPipe FaceLandmarker

Provider C: partial-only fallback
MediaPipe FaceLandmarker only
```

상태 매핑:

| Provider 상태 | 결과 |
|---|---|
| MediaPipe G/Sn/Me 성공 + Apple/Parsing H 성공 | full_success |
| MediaPipe G/Sn/Me 성공 + H 불확실 | partial_success |
| MediaPipe 얼굴/기준점 실패 | blocked |
| native/model/runtime 오류 | failed |

---

### 4.8 keypoint 계산 함수 설계

```ts
type VerticalThirdsKeypointProvider =
  | 'mediapipe'
  | 'apple_semantic_matte'
  | 'face_parsing'
  | 'heuristic_debug';

type VerticalThirdsKeypoint = {
  x: number;
  y: number;
  confidence: number;
  provider: VerticalThirdsKeypointProvider;
  method: string;
};

type VerticalThirdsKeypoints = {
  H: VerticalThirdsKeypoint | null;
  G: VerticalThirdsKeypoint | null;
  Sn: VerticalThirdsKeypoint | null;
  Me: VerticalThirdsKeypoint | null;
  hairlineVisible: boolean;
  warnings: string[];
};
```

권장 orchestration:

```ts
async function computeVerticalThirdsKeypoints(input, landmarks, masks): Promise<VerticalThirdsKeypoints> {
  const G = computeGlabellaBrowLine(landmarks);
  const Sn = computeSubnasale(landmarks);
  const Me = computeMenton(landmarks);

  let H: VerticalThirdsKeypoint | null = null;

  if (masks.appleHair && masks.appleSkin) {
    H = computeHairlineFromHairSkinMatte(input, landmarks, masks.appleHair, masks.appleSkin);
  }

  if (!isReliable(H) && masks.faceParsing) {
    H = computeHairlineFromFaceParsing(input, landmarks, masks.faceParsing);
  }

  if (!isReliable(H)) {
    H = null;
  }

  return validateKeypointOrder({ H, G, Sn, Me });
}
```

검증:

```ts
function validateKeypointOrder(points) {
  if (!points.G || !points.Sn || !points.Me) return blocked;

  if (!(points.G.y < points.Sn.y && points.Sn.y < points.Me.y)) {
    return blocked('invalid_keypoint_order');
  }

  if (points.H && !(points.H.y < points.G.y)) {
    points.H = null;
    warnings.push('hairline_invalid_order');
  }

  return points;
}
```

---

### 4.9 로그 보강

기존 로그에 provider와 method를 추가한다.

```jsonl
{"tag":"[aura:face-ratio]","event":"landmark:ready","provider":"mediapipe_face_landmarker","runningMode":"IMAGE","landmarkCount":478,"faceCount":1}
{"tag":"[aura:face-ratio]","event":"matte:ready","provider":"apple_avsemanticsegmentationmatte","types":["hair","skin"],"hairAvailable":true,"skinAvailable":true}
{"tag":"[aura:face-ratio]","event":"hairline:ready","method":"apple_hair_skin_boundary","visible":true,"confidence":0.78,"candidateCount":84,"boundaryStdPx":5.2}
{"tag":"[aura:face-ratio]","event":"keypoint:ready","H":{"provider":"apple_semantic_matte","y":214,"confidence":0.78},"G":{"provider":"mediapipe","y":356,"confidence":0.93},"Sn":{"provider":"mediapipe","y":492,"confidence":0.91},"Me":{"provider":"mediapipe","y":630,"confidence":0.95}}
```

---

### 4.10 개발 수용 기준 추가

기존 기능 수용 기준에 아래를 추가한다.

```text
- MediaPipe provider로 G/Sn/Me가 실제 landmark에서 계산된다.
- Apple hair/skin matte가 지원되는 기기에서는 H가 segmentation boundary로 계산된다.
- Apple matte가 없으면 face parsing fallback 또는 partial_success로 내려간다.
- H가 불확실한데 full_success가 나오면 실패다.
- overlay debug에서 H/G/Sn/Me provider와 confidence가 보인다.
- analysis-log.jsonl에 landmark/matte/hairline provider가 남는다.
```

---

### 4.11 참고 근거

```text
MediaPipe FaceLandmarker
- 단일 이미지, 영상, live stream 입력을 지원한다.
- 3D face landmarks, blendshape scores, facial transformation matrix를 출력할 수 있다.
- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker

MediaPipe FaceMesh
- 468개 3D face landmarks를 실시간으로 추정하는 솔루션이다.
- refine landmarks 사용 시 iris 포함 478 landmark를 사용할 수 있다.
- https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md

Apple AVSemanticSegmentationMatte
- hair matte는 이미지 안 사람의 머리카락을 segment한다.
- skin matte는 이미지 안 사람의 피부를 segment한다.
- AVCapturePhotoOutput.availableSemanticSegmentationMatteTypes로 지원 여부를 확인한다.
- https://developer.apple.com/documentation/avfoundation/avsemanticsegmentationmatte/mattetype-swift.struct/hair
- https://developer.apple.com/documentation/avfoundation/avcapturephotooutput/availablesemanticsegmentationmattetypes

Apple WWDC19 Photo Segmentation Mattes
- AVCapture와 Core Image에서 hair, skin, teeth segmentation matte를 활용하는 흐름을 설명한다.
- https://developer.apple.com/videos/play/wwdc2019/260/

Velog 얼굴형 분석 사례
- 헤어라인은 segmentation, 광대/턱/눈/입은 MediaPipe FaceMesh로 처리하는 하이브리드 구조를 제안한다.
- https://velog.io/@dreamjob/얼굴형-분석을-위한-AI-활용-단계-中-4편-총-5편
```

---

## 5. 입력과 품질 Gate

### 4.1 입력

MVP 입력은 촬영 후 정면 사진 1장이다.

```ts
type FaceVerticalThirdsInput = {
  sessionId: string;
  captureId: string;
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  createdAt: string;
};
```

권장 확장 입력:

```ts
type FaceVerticalThirdsOptionalInput = {
  mediaPipeLandmarks?: NormalizedLandmark[];
  hairMask?: PixelMask;
  skinMask?: PixelMask;
  captureMeta?: {
    yaw?: number;
    pitch?: number;
    roll?: number;
    blurScore?: number;
    lightingScore?: number;
    exposureScore?: number;
  };
};
```

### 4.2 정면 품질 Gate

분석 전 최소 gate:

```text
- 얼굴 1개만 검출
- 얼굴 bbox가 이미지 중앙 근처
- 얼굴 bbox가 너무 작지 않음
- |yaw| <= 8도 권장
- |pitch| <= 8도 권장
- |roll| <= 5도 권장
- blurScore 기준 통과
- 과노출/역광/너무 어두움 제외
- 입 크게 벌림 제외
- 눈 감음/깜빡임 제외
```

MVP에서는 모든 점수를 완벽하게 구현하지 않아도 된다. 단, 로그에는 gate 결과가 반드시 남아야 한다.

### 4.3 헤어라인 Gate

상안부 측정은 헤어라인이 보여야 full success다.

```text
full_success:
- H, G, Sn, Me 모두 검출
- hairlineVisible = true
- 각 기준점 confidence 통과

partial_success:
- G, Sn, Me는 검출
- H가 불확실하거나 hairlineVisible = false
- 중안부:하안부만 계산 가능

blocked:
- 얼굴 검출 실패
- 정면 품질 실패
- G/Sn/Me 중 하나라도 검출 실패
```

헤어라인 가림 사용자 문구:

```text
이마 또는 헤어라인이 가려져 상안부 비율은 정확히 계산하기 어려워요.
이마가 보이도록 앞머리를 넘기고 다시 촬영해주세요.
```

---

## 6. 분석 결과 데이터 계약

```ts
type FaceVerticalThirdsStatus =
  | 'full_success'
  | 'partial_success'
  | 'blocked'
  | 'failed';

type FaceVerticalThirdsResult = {
  schemaVersion: 'aura-face-vertical-thirds-v1';
  sessionId: string;
  captureId: string;
  status: FaceVerticalThirdsStatus;

  sourceImage: {
    uri: string;
    width: number;
    height: number;
  };

  quality: {
    usable: boolean;
    yaw?: number;
    pitch?: number;
    roll?: number;
    blurScore?: number;
    lightingScore?: number;
    warnings: string[];
  };

  keypoints: {
    H?: { x: number; y: number; confidence: number } | null;
    G: { x: number; y: number; confidence: number } | null;
    Sn: { x: number; y: number; confidence: number } | null;
    Me: { x: number; y: number; confidence: number } | null;
  };

  verticalThirds?: {
    upperPx: number | null;
    middlePx: number;
    lowerPx: number;
    totalPx: number | null;

    upperNormalized: number | null;
    middleNormalized: number | null;
    lowerNormalized: number | null;

    displayRatio: {
      upper: number | null;
      middle: 1.0;
      lower: number;
    };

    confidence: number;
    warnings: string[];
  };

  interpretation: {
    title: string;
    summary: string;
    dominantPart?: 'upper' | 'middle' | 'lower' | 'balanced' | 'unknown';
  };

  artifacts: {
    overlayImageUri?: string;
    resultJsonUri?: string;
    logJsonlUri?: string;
  };

  createdAt: string;
};
```

---

## 7. 분석 오버레이 이미지 요구사항

### 6.1 파일 생성

분석 성공 또는 partial success 시 다음 파일을 생성한다.

```text
face-vertical-thirds/<sessionId>/
  source.jpg
  overlay.png
  result.json
  analysis-log.jsonl
```

`overlay.png`는 앱 화면에 그대로 표시할 수 있어야 하고, Mac에서 파일로도 확인 가능해야 한다.

### 6.2 오버레이 구성

```text
- 원본 사진을 기준으로 1:1 또는 화면 카드 비율로 crop
- H/G/Sn/Me y 위치에 수평선 표시
- 상안부, 중안부, 하안부 영역에 반투명 band 표시
- 각 band에 ratio label 표시
- 기준점 이름은 debug mode에서만 표시 가능
- production UI에서는 사용자가 이해하는 라벨만 표시
```

Debug mode 표시 예:

```text
H  y=214  conf=0.76
G  y=356  conf=0.93
Sn y=492  conf=0.91
Me y=630  conf=0.95
upper=142px middle=136px lower=138px
ratio=1.04:1.00:1.01
```

### 6.3 화면 카피 규칙

좋은 카피:

```text
상안부가 약간 강조된 비율이에요.
상안부, 중안부, 하안부가 전체적으로 균형에 가까워요.
중안부가 상대적으로 긴 편이에요.
하안부가 상대적으로 긴 편이에요.
```

금지 카피:

```text
당신은 긴 얼굴형입니다.
당신은 비대칭입니다.
광대가 넓습니다.
턱이 각졌습니다.
```

---

## 8. Mac 로그 추적 설계

### 7.1 로그 원칙

Mac에서 다음을 바로 확인할 수 있어야 한다.

```text
- 촬영이 시작됐는지
- 품질 gate를 통과했는지
- landmark 검출이 됐는지
- 헤어라인 검출이 됐는지
- 비율 계산이 됐는지
- overlay 이미지가 저장됐는지
- 최종 status가 full_success / partial_success / blocked / failed 중 무엇인지
- 실패했다면 실패 이유가 무엇인지
```

모든 로그 prefix는 아래로 고정한다.

```text
[aura:face-ratio]
```

### 7.2 필수 로그 이벤트

| 이벤트 | 시점 | 필수 필드 |
|---|---|---|
| `capture:start` | 촬영 시작 | sessionId, captureId |
| `capture:ready` | 사진 저장 완료 | imageUri, width, height |
| `quality:gate` | 품질 판정 | usable, yaw, pitch, roll, blurScore, warnings |
| `landmark:start` | landmark 분석 시작 | provider, imageUri |
| `landmark:ready` | landmark 분석 성공 | provider, landmarkCount, faceCount |
| `hairline:ready` | 헤어라인 판정 | visible, confidence, method |
| `ratio:computed` | 비율 계산 완료 | H/G/Sn/Me y, upperPx, middlePx, lowerPx, displayRatio |
| `overlay:saved` | 분석 이미지 저장 | overlayImageUri, width, height |
| `analysis:success` | full success | status, confidence |
| `analysis:partial` | 부분 성공 | status, warnings |
| `analysis:blocked` | 사용자 재촬영 필요 | reason, warnings |
| `analysis:failed` | 구현/런타임 오류 | errorCode, message |

### 7.3 로그 예시

```jsonl
{"tag":"[aura:face-ratio]","event":"capture:ready","sessionId":"fvt_20260704_001","captureId":"cap_001","imageUri":"file:///.../source.jpg","width":1170,"height":2532,"ts":"2026-07-04T12:00:01+09:00"}
{"tag":"[aura:face-ratio]","event":"quality:gate","sessionId":"fvt_20260704_001","usable":true,"yaw":2.1,"pitch":-1.7,"roll":0.8,"blurScore":0.91,"warnings":[],"ts":"2026-07-04T12:00:02+09:00"}
{"tag":"[aura:face-ratio]","event":"landmark:ready","sessionId":"fvt_20260704_001","provider":"mediapipe","landmarkCount":478,"faceCount":1,"ts":"2026-07-04T12:00:02+09:00"}
{"tag":"[aura:face-ratio]","event":"ratio:computed","sessionId":"fvt_20260704_001","H":214,"G":356,"Sn":492,"Me":630,"upperPx":142,"middlePx":136,"lowerPx":138,"displayRatio":{"upper":1.04,"middle":1.0,"lower":1.01},"confidence":0.88,"ts":"2026-07-04T12:00:03+09:00"}
{"tag":"[aura:face-ratio]","event":"overlay:saved","sessionId":"fvt_20260704_001","overlayImageUri":"file:///.../overlay.png","ts":"2026-07-04T12:00:03+09:00"}
{"tag":"[aura:face-ratio]","event":"analysis:success","sessionId":"fvt_20260704_001","status":"full_success","confidence":0.88,"ts":"2026-07-04T12:00:03+09:00"}
```

### 7.4 Mac에서 확인하는 방법

Metro 또는 RN 로그:

```bash
npm --prefix apps/mobile start
# 다른 터미널에서 iOS 실행 후
npx react-native log-ios | grep "\[aura:face-ratio\]"
```

Xcode Console:

```text
Xcode → Window → Devices and Simulators → 대상 iPhone 선택 → Open Console
검색어: [aura:face-ratio]
```

로컬 파일 확인:

```text
앱 Documents 또는 cache 아래 face-vertical-thirds/<sessionId>/
- source.jpg
- overlay.png
- result.json
- analysis-log.jsonl
```

MVP에서는 `console.info()`와 `analysis-log.jsonl` 둘 다 남긴다. 콘솔 로그는 실시간 추적용이고, JSONL 파일은 나중에 실패 케이스 재현용이다.

---

## 9. 내부 모듈 설계

### 8.1 추천 파일 구조

```text
apps/mobile/src/features/face-ratio/
  screens/FaceVerticalThirdsScreen.tsx
  services/faceVerticalThirdsService.ts
  services/faceVerticalThirdsOverlayService.ts
  services/faceVerticalThirdsLogger.ts
  services/faceVerticalThirdsQualityGate.ts
  types.ts
```

### 8.2 모듈 책임

| 모듈 | 책임 |
|---|---|
| `FaceVerticalThirdsScreen` | 촬영 후 분석 화면, 결과 이미지 표시, 재촬영 UI |
| `faceVerticalThirdsService` | 전체 분석 orchestration |
| `faceVerticalThirdsQualityGate` | 정면/흔들림/조명 gate |
| `faceVerticalThirdsOverlayService` | overlay.png 생성 |
| `faceVerticalThirdsLogger` | console + JSONL 로그 |
| `types.ts` | 입력/결과/로그 타입 |

### 8.3 처리 함수 예시

```ts
async function analyzeFaceVerticalThirds(input: FaceVerticalThirdsInput): Promise<FaceVerticalThirdsResult> {
  log('capture:ready', input);

  const quality = await runFaceVerticalThirdsQualityGate(input);
  log('quality:gate', quality);

  if (!quality.usable) {
    return blocked('quality_gate_failed', quality.warnings);
  }

  const landmarks = await extractFaceLandmarks(input.imageUri);
  log('landmark:ready', summarizeLandmarks(landmarks));

  const keypoints = await computeVerticalThirdsKeypoints(input, landmarks);
  log('hairline:ready', summarizeHairline(keypoints.H));

  const result = computeVerticalThirdsRatio(input, quality, keypoints);
  log('ratio:computed', summarizeRatio(result));

  const overlayImageUri = await renderVerticalThirdsOverlay(input, result);
  log('overlay:saved', { overlayImageUri });

  const finalResult = await saveVerticalThirdsResult(result, overlayImageUri);
  logFinalStatus(finalResult);

  return finalResult;
}
```

---

## 10. 성공 판정 기준

### 9.1 기능 성공

```text
- 촬영 후 3초 이내 분석 결과 화면 표시
- full_success 시 overlay.png 생성
- overlay.png에 H/G/Sn/Me 기준선 표시
- UI에 나의 비율 표시
- result.json 저장
- analysis-log.jsonl 저장
- Mac console에서 [aura:face-ratio] 로그 확인 가능
```

### 9.2 측정 성공

```text
- 정면 사진에서 H/G/Sn/Me가 합리적인 위치에 표시됨
- upperPx, middlePx, lowerPx가 모두 양수
- H < G < Sn < Me 순서 유지
- displayRatio가 비정상 범위가 아님
- confidence >= 0.7이면 full_success 가능
```

초기 비정상 범위:

```text
upperDisplayRatio < 0.5 또는 > 1.8 → blocked 또는 low confidence
lowerDisplayRatio < 0.5 또는 > 1.8 → blocked 또는 low confidence
```

### 9.3 로그 성공

Mac 로그에서 최소 아래 순서가 보여야 한다.

```text
capture:ready
quality:gate
landmark:ready
hairline:ready
ratio:computed
overlay:saved
analysis:success 또는 analysis:partial
```

실패 케이스에서는 반드시 `analysis:blocked` 또는 `analysis:failed`가 마지막에 찍혀야 한다. 무한 로딩은 실패로 본다.

---

## 11. 단계별 구현 계획

### Phase 1. 단일 사진 분석 골격

```text
- FaceVerticalThirdsScreen 생성
- imageUri 입력으로 분석 시작
- logger 생성
- result.json / analysis-log.jsonl 저장
- 임시 mock keypoint로 overlay.png 생성
```

완료 기준:

```text
- mock 좌표로도 업로드 예시와 같은 분석 이미지가 생성됨
- Mac에서 capture:start → overlay:saved 로그 확인
```

### Phase 2. MediaPipe landmark 연결

```text
- 기존 native MediaPipe FaceLandmarker 호출 재사용
- G/Sn/Me 추출
- 얼굴 1개 gate
- landmarkCount / provider 로그
```

완료 기준:

```text
- 실제 촬영 사진에서 G/Sn/Me 선이 얼굴에 맞게 표시됨
- H 없이 partial_success 가능
```

### Phase 3. 헤어라인 검출

```text
- hair/skin mask가 있으면 boundary로 H 추출
- 없으면 forehead ROI + 피부/머리카락 경계 heuristic
- 헤어라인 가림 판단
- hairlineVisible / confidence 로그
```

완료 기준:

```text
- 이마가 보이는 사진에서 full_success
- 앞머리/모자 사진에서 partial_success 또는 blocked + 재촬영 안내
```

### Phase 4. UI 문구와 결과 카드

```text
- 상안부/중안부/하안부 결과 카드
- 평균 비율/나의 비율 표시
- dominantPart 해석
- 재촬영 안내 문구
```

완료 기준:

```text
- 얼굴형/좌우비대칭 등 다른 분석 요소가 화면에 섞이지 않음
```

### Phase 5. 실기기 검증과 로그 회수

```text
- iPhone 실기기 촬영 10건 이상
- 성공/부분성공/blocked 케이스 수집
- overlay.png와 analysis-log.jsonl를 Mac에서 확인
- threshold 조정
```

완료 기준:

```text
- full_success 케이스의 overlay가 육안으로 합리적
- 실패 케이스의 reason이 로그와 UI에 일치
```

---

## 12. 개발자에게 줄 최종 작업 지시문

```text
기존 AURA 통합 얼굴 비율 측정 문서를 확장하지 말고,
FaceVerticalThirds 전용 기능으로 분리한다.

이번 작업의 목표는 얼굴형/이목구비/3D 분석이 아니라
촬영 사진 1장 기준 상안부·중안부·하안부 세로 비율 분석이다.

반드시 구현해야 할 것:
1. 촬영 사진 기반 분석 실행
2. H/G/Sn/Me 기준선 계산
3. 상안부/중안부/하안부 비율 계산
4. 촬영 사진 위 분석 오버레이 이미지 overlay.png 생성
5. result.json 저장
6. analysis-log.jsonl 저장
7. Mac console에서 [aura:face-ratio] 로그 확인 가능
8. full_success / partial_success / blocked / failed 상태 구분

하지 말아야 할 것:
1. 얼굴형 label 출력
2. 좌우 비대칭 분석 섞기
3. 얼굴 길이/폭, 광대, 턱선 분석 섞기
4. 메이크업 추천 섞기
5. 코끝을 세로 3분할 기준점으로 사용하기
6. 헤어라인이 가려졌는데 상안부를 추정해서 단정하기
```

---

## 13. 최종 요약

```text
이 기능은 “얼굴형 분석”이 아니라 “상·중·하안 세로 비율 분석”이다.

성공한 결과물은 숫자 JSON만이 아니다.
촬영 사진 위에 기준선과 3개 영역이 그려진 overlay.png가 반드시 나와야 한다.

개발 성공 여부는 Mac에서 [aura:face-ratio] 로그로 추적 가능해야 한다.
최종 success 로그와 overlay 파일이 없으면 완료가 아니다.
```
