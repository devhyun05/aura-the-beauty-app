# AURA 얼굴 비율 왜곡 방지·보정 기획서 v1.0

작성일: 2026-07-05 KST  
상태: 최종 결정사항 반영 / 개발자 전달용  
범위: 얼굴 세로 비율, 즉 상안부·중안부·하안부 측정 시 발생하는 촬영 왜곡을 줄이는 방법만 다룬다.

---

## 0. 한 줄 결론

얼굴 비율 왜곡은 촬영 후 복잡하게 보정하는 것보다, **촬영 단계에서 좋은 입력만 받는 것**이 핵심이다.

```text
촬영 전:
ARKit 각도 gate
+ FaceAnchor 거리 gate
+ Sn-principal point 정렬
+ 타원 프레이밍 확인

촬영 후:
raw camera frame 사용
+ orientation / mirroring 정리
+ ARKit roll만 소폭 보정
```

---

## 1. 해결하려는 문제

MediaPipe 또는 이미지 좌표만으로 얼굴 세로 비율을 측정하면 얼굴 기울기와 촬영 거리 때문에 비율이 흔들린다.

대표 문제:

```text
고개를 숙임
→ 턱·하안부가 짧아 보임

고개를 치켜듦
→ 턱·하안부가 길어 보임

너무 가까운 셀카 거리
→ 원근 왜곡이 커짐

폰이 위/아래로 기울어짐
→ 중안부·하안부 비율이 달라 보임
```

따라서 이 기능은 “나쁜 사진을 보정해서 살리는 것”이 아니라, **측정에 적합한 촬영 조건을 만족한 프레임만 사용**해야 한다.

---

## 2. 최종 결정사항 요약

| 항목 | 최종 결정 |
|---|---|
| 각도 기준 | ARKit FaceAnchor transform |
| 거리 기준 | ARKit FaceAnchor distance |
| 렌즈와 얼굴 높이 정렬 | 코밑점 Sn을 camera principal point dot에 맞춤 |
| 타원 역할 | 거리 판단이 아니라 헤어라인·턱끝 프레이밍 보조 |
| 촬영 후 보정 | ARKit roll만 소폭 적용 |
| pitch/yaw 보정 | MVP 제외, gate로 차단 |
| 최소 허용 거리 | 35cm |
| 사용자 거리 문구 | “조금 더 멀리서 촬영해주세요.” |

---

## 3. 촬영 중 왜곡 방지

### 3.1 각도 gate

각도는 **ARKit FaceAnchor transform**으로만 판단한다.

```text
MediaPipe 각도:
- primary로 사용하지 않음
- fallback도 이번 버전에서는 사용하지 않음

눈 라인:
- roll 보정 기준으로 사용하지 않음
- sanity check로도 사용하지 않음
```

허용 기준:

```text
pitch: ±5도 이내
yaw: ±6도 이내
roll: ±3도 이내
```

판정:

```ts
const poseOk =
  Math.abs(faceAnchorPitchDeg) <= 5 &&
  Math.abs(faceAnchorYawDeg) <= 6 &&
  Math.abs(faceAnchorRollDeg) <= 3;
```

기준 밖이면 촬영하지 않는다.

사용자 문구:

```text
고개를 더 위로 들어주세요
고개를 아래로 더 내려주세요
```

---

### 3.2 렌즈와 얼굴 높이 정렬

렌즈와 얼굴 높이는 실제 cm로 재지 않는다.  
대신 **카메라가 정면으로 보는 중심점**에 얼굴의 기준점을 맞춘다.

이번 기능의 기준점:

```text
얼굴 점:
Sn, 코밑점, 인중 시작점

화면 점:
camera principal point를 preview 좌표로 변환한 점
```

사용자 안내:

```text
코밑, 인중 시작점을 점에 맞춰주세요.
```

기술 조건:

```ts
const snPoint = computeSubnasale(landmarks);
const targetPoint = cameraPrincipalPointInPreview;

const snCenterOk =
  Math.abs(snPoint.x - targetPoint.x) <= previewWidth * 0.025 &&
  Math.abs(snPoint.y - targetPoint.y) <= previewHeight * 0.035;
```

주의:

```text
- preview 중앙점이 아니라 principal point dot을 바로 구현한다.
```

---

### 3.3 principal point dot 표시

프리뷰에 표시할 점은 단순 화면 중앙이 아니라, **카메라 principal point를 preview 좌표로 변환한 위치**다.

구현 개념:

```text
ARCamera.intrinsics 또는 native camera calibration
→ principal point, ox/oy 획득
→ camera image coordinate
→ preview coordinate로 변환
→ 해당 위치에 dot 표시
```

UI:

```text
- principal point dot 표시
- Sn, 코밑점이 dot 근처에 오면 위치 OK
```

---

### 3.4 거리 gate

거리는 **FaceAnchor distance**로 판단한다.

FaceAnchor distance 의미:

```text
카메라 위치 ↔ ARKit 얼굴 anchor 위치 사이의 거리
```

최종 거리 기준:

```text
< 0.35m
→ 촬영 차단

0.35m ~ 0.45m
→ 촬영 허용, 일반 confidence

0.45m 이상
→ 더 안정적
```

사용자 문구:

```text
조금만 더 멀리서 촬영해주세요.
```

구현:

```ts
const distanceOk = faceAnchorDistanceMeters >= 0.35;

const distanceConfidence =
  faceAnchorDistanceMeters >= 0.45
    ? 'stable'
    : 'normal';
```

---

### 3.5 타원 프레이밍

타원은 거리를 어느정도 유지하도록 하면서 얼굴을 중앙에 두도록 하고, 헤어라인과 턱끝이 잘리지 않도록 안내하는 프레이밍 가이드다.

타원 초기값:

```text
타원 높이:
preview height의 50~58%

타원 폭:
타원 높이의 0.62~0.68

Sn 위치:
타원 높이 기준 위에서 62~66% 지점

**위의 값은 예시로 구현시 직접 검토하여 적합하게 설정한다.**
```

중요:

```text
- 턱 끝과 정수리가 타원에 딱 맞아야 촬영이 가능하도록 한다
타원 위아래의 작은 점으로 표현한다. (계획과 함께 첨부한 이미지를 참고)
```

사용자 문구:

```text
얼굴을 타원에 맞춰주세요
```

---

## 4. 촬영 성공 조건

촬영은 아래 조건이 모두 통과해야 한다.

```ts
const captureOk =
  poseOk &&
  snCenterOk &&
  distanceOk &&
  framingOk &&
  stableForMs >= 800;
```

**위의 조건은 예시로, 구현시 직접 검토하여 적합하게 설정한다.**

조건별 역할:

| 조건 | 판단 기준 | 실패 문구 |
|---|---|---|
| poseOk | ARKit pitch/yaw/roll | 고개를 정면으로 맞춰주세요. |
| snCenterOk | Sn이 principal point dot 근처 | 코밑, 인중 시작점을 점에 맞춰주세요. |
| distanceOk | FaceAnchor distance >= 0.35m | 조금만 더 멀리서 촬영해주세요. |
| framingOk | 헤어라인/턱끝/가장자리 | 헤어라인과 턱끝이 모두 보이도록 맞춰주세요. |
| stableForMs | 조건 유지 800ms 이상 | 잠시만 정면을 유지해주세요. |

---

## 5. 촬영 후 보정

촬영 후 보정은 최소화한다.  
이번 버전에서 촬영 후 보정은 **ARKit roll 소폭 보정만 적용**한다.

### 5.1 필수 전처리

아래는 “보정”이라기보다 기본 전제다.

```text
1. raw camera frame 기준으로 분석
2. orientation 정리
3. front camera mirroring 정리
```

필수 이유:

```text
- UI preview 캡처는 crop/scale/mirror가 섞일 수 있다.
- 측정은 반드시 실제 카메라 이미지 좌표계를 기준으로 해야 한다.
- overlay 생성 시에도 같은 좌표계를 사용해야 한다.
```

---

### 5.2 ARKit roll correction

촬영 당시 ARKit FaceAnchor roll 값을 사용해 좌표를 소폭 회전 보정한다.

사용 조건:

```text
- 촬영 gate에서 roll ±3도 이내를 통과한 프레임만 사용
- 보정량은 작은 값이어야 함
- 큰 roll을 보정해서 살리지 않음
```

구현 개념:

```ts
const correctedLandmarks = rotateLandmarksAroundPoint({
  landmarks,
  angleDeg: -faceAnchorRollDeg,
  center: principalPointInImage,
});
```

적용 대상:

```text
- MediaPipe landmark 좌표
- H/G/Sn/Me 계산에 쓰는 좌표
- overlay 기준선 좌표
```

눈 라인은 사용하지 않는다.

```text
금지:
양쪽 눈 높이를 맞추는 방식의 roll correction
```

이유:

```text
사람마다 실제 양쪽 눈 높이가 다를 수 있기 때문에,
눈 라인을 기준으로 보정하면 실제 비대칭을 카메라 기울기로 오해할 수 있다.
```

---

## 6. 이번 버전에서 제외하는 보정

### 6.1 lens distortion correction 제외

이번 버전에서는 렌즈 왜곡 보정을 넣지 않는다.

제외 이유:

```text
- 이번 기능의 큰 왜곡 원인은 lens distortion보다 거리와 고개 각도에 의한 perspective distortion이다.
- FaceAnchor 거리 gate, Sn-principal point 정렬, 중앙 프레이밍으로 lens distortion 영향을 줄인다.
- 구현 대비 우선순위가 낮다.
```

주의:

```text
효과가 없어서 제외하는 것이 아니다.
MVP에서 우선순위가 낮아서 제외한다.
```

향후 검토 조건:

```text
허용 촬영 조건 안에서도 raw vs undistorted ratio 차이가 반복적으로 2~3% 이상이면 추가 검토한다.
```

---

### 6.2 pitch/yaw pose correction 제외

이번 버전에서는 pitch/yaw 보정을 하지 않는다.

제외 이유:

```text
- pitch/yaw가 큰 사진은 2D/3D로 보정해도 실제 비율 복원이 어렵다.
- 잘못 보정하면 가짜 정확도를 만들 수 있다.
- 이번 기능은 보정이 아니라 촬영 gate로 해결한다.
```

원칙:

```text
pitch/yaw가 기준 밖이면 blocked.
보정해서 full_success 처리하지 않는다.
```

---

### 6.3 TrueDepth depth correction 제외

이번 버전에서는 TrueDepth depth 보정을 하지 않는다.

제외 이유:

```text
- 거리 판단은 FaceAnchor distance로 충분히 처리한다.
- depth map 정렬과 노이즈 처리가 추가 구현 부담을 만든다.
- 이번 기능의 MVP 범위에는 과하다.
```

---

## 7. H/G/Sn/Me 측정과의 연결

이 문서는 왜곡 방지·보정만 다룬다.  
실제 비율 측정은 기존 `FaceVerticalThirds` 기준을 따른다.

```text
H:
Apple hair/skin matte 또는 face parsing으로 검출

G:
MediaPipe 미간/눈썹 기준선

Sn:
MediaPipe 코밑점

Me:
MediaPipe 턱끝
```

촬영 후 roll correction은 H/G/Sn/Me 좌표 계산 전에 적용한다.

흐름:

```text
raw camera frame
→ orientation / mirroring 정리
→ MediaPipe landmark 추출
→ Apple hair/skin matte 또는 face parsing
→ ARKit roll 소폭 좌표 보정
→ H/G/Sn/Me 계산
→ upper/middle/lower ratio 계산
```

---

## 8. 로그 설계

필수 로그 prefix:

```text
[aura:face-ratio]
```

### 8.1 촬영 중 gate 로그

```json
{
  "tag": "[aura:face-ratio]",
  "event": "capture_gate:evaluated",
  "faceAnchorPitchDeg": 1.8,
  "faceAnchorYawDeg": -2.1,
  "faceAnchorRollDeg": 0.9,
  "faceAnchorDistanceMeters": 0.42,
  "snToPrincipalPointPx": {
    "x": 5.2,
    "y": -8.4
  },
  "poseOk": true,
  "snCenterOk": true,
  "distanceOk": true,
  "framingOk": true,
  "stableForMs": 920,
  "captureOk": true
}
```

### 8.2 촬영 후 보정 로그

```json
{
  "tag": "[aura:face-ratio]",
  "event": "post_correction:applied",
  "sourceFrame": "raw_camera_frame",
  "orientationNormalized": true,
  "mirroringNormalized": true,
  "rollCorrectionMethod": "arkit_faceanchor_roll",
  "rollCorrectionDeg": -0.9,
  "lensCorrectionApplied": false,
  "poseCorrectionApplied": false,
  "trueDepthCorrectionApplied": false
}
```

### 8.3 실패 로그

```json
{
  "tag": "[aura:face-ratio]",
  "event": "capture_gate:blocked",
  "reason": "distance_too_close",
  "faceAnchorDistanceMeters": 0.31,
  "message": "조금만 더 멀리서 촬영해주세요."
}
```

---

## 9. 사용자 문구

문구는 짧게 유지한다.

```text
코밑, 인중 시작점을 점에 맞춰주세요.
고개를 정면으로 맞춰주세요.
조금만 더 멀리서 촬영해주세요.
헤어라인과 턱끝이 모두 보이도록 맞춰주세요.
잠시만 정면을 유지해주세요.
```

사용하지 않을 문구:

```text
60cm 이상 떨어져 주세요.
렌즈 높이를 맞춰주세요.
카메라 principal point에 맞춰주세요.
얼굴 좌표계를 정면화합니다.
```

---

## 10. 최종 개발 지시문

```text
FaceVerticalThirds 왜곡 방지·보정은 촬영 gate 중심으로 구현한다.

각도:
ARKit FaceAnchor pitch/yaw/roll만 사용한다.
눈 라인은 사용하지 않는다.

높이:
Sn, 코밑점/인중 시작점을 camera principal point dot에 맞춘다.
principal point dot은 바로 구현한다.

거리:
FaceAnchor distance를 사용한다.
35cm 미만은 촬영 차단한다.
35cm 이상은 각도/정렬/프레이밍이 맞으면 촬영 허용한다.

타원:
거리 판단에 쓰지 않는다.
헤어라인과 턱끝이 잘리지 않도록 하는 프레이밍 가이드로만 쓴다.

촬영 후:
raw camera frame을 기준으로 orientation/mirroring을 정리한다.
ARKit roll만 소폭 보정한다.
lens distortion correction, pitch/yaw pose correction, TrueDepth correction은 하지 않는다.
```

---

## 11. 최종 요약

```text
각도 = ARKit FaceAnchor pitch/yaw/roll
높이 = Sn을 principal point dot에 맞춤
거리 = FaceAnchor distance, 최소 35cm
타원 = 프레이밍 보조
촬영 후 보정 = orientation/mirroring + ARKit roll correction
제외 = 눈 라인, lens correction, pitch/yaw correction, TrueDepth correction
```
