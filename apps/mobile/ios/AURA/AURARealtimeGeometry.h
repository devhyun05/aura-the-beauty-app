#ifndef AURARealtimeGeometry_h
#define AURARealtimeGeometry_h

// 실시간 얼굴 좌표 기하 — 순수 함수 전용 (header-only).
//
// 배경: 020cb33 마이그레이션 이후 AURARealtimeFaceCaptureView.m 안에 서로
// 모순되는 좌표 규약 주석이 공존했다 — 화면 투영 변환기는 "Vision 좌표는
// upright portrait" 를, pose 계산부는 실측 근거로 "raw landscape(눈선 수직,
// roll≈-90)" 를 전제했다. 어느 쪽이 실제인지는 기기·iOS 버전·connection
// videoOrientation 적용 여부에 따라 달라질 수 있으므로, 이 모듈은 규약을
// 가정하지 않고 "매 프레임 눈선 축 + 프로브(코/입) 방향으로 판정"한다.
//
// 계약:
// - 모든 점은 정규화 [0,1], 원점 top-left.
// - AURARealtimeFrameRotation 은 "vision 프레임 점 → 정준(upright portrait,
//   unmirrored) 프레임" 변환을 뜻한다.
// - 정준 → captureDevice 변환은 (y,x) 스왑 — 마이그레이션 이전부터 top-level
//   점에서 검증된 앵커. 미러는 여기서 다루지 않는다(preview connection 소유).
// - Vision/AVFoundation 타입 금지: macOS 에서 clang 단독 컴파일되는 골든벡터
//   하니스(scripts/ios/run-realtime-geometry-golden.mjs)와 TS 미러
//   (realtimeFrameGeometry.ts)가 같은 골든 JSON 으로 이 수식을 검증한다.
//   수식을 바꾸면 반드시 세 곳(헤더/TS/JSON)을 함께 바꿀 것.

#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>

typedef NS_ENUM(NSInteger, AURARealtimeFrameRotation) {
  AURARealtimeFrameRotationUnknown = -1,
  AURARealtimeFrameRotationUpright = 0,
  AURARealtimeFrameRotation90CW = 1,   // c = (1-y, x)
  AURARealtimeFrameRotation90CCW = 2,  // c = (y, 1-x)
  AURARealtimeFrameRotation180 = 3,    // c = (1-x, 1-y)
};

// vision 프레임 점 → 정준 프레임 점.
static inline CGPoint AURARealtimeCanonicalPoint(CGPoint p,
                                                 AURARealtimeFrameRotation rotation)
{
  switch (rotation) {
    case AURARealtimeFrameRotation90CW:
      return CGPointMake(1.0 - p.y, p.x);
    case AURARealtimeFrameRotation90CCW:
      return CGPointMake(p.y, 1.0 - p.x);
    case AURARealtimeFrameRotation180:
      return CGPointMake(1.0 - p.x, 1.0 - p.y);
    case AURARealtimeFrameRotationUpright:
    case AURARealtimeFrameRotationUnknown:
    default:
      return p;
  }
}

// 정준 프레임 점 → vision 프레임 점 (역변환, 진단·역투영용).
static inline CGPoint AURARealtimeVisionPointFromCanonical(CGPoint c,
                                                           AURARealtimeFrameRotation rotation)
{
  switch (rotation) {
    case AURARealtimeFrameRotation90CW:
      return CGPointMake(c.y, 1.0 - c.x);
    case AURARealtimeFrameRotation90CCW:
      return CGPointMake(1.0 - c.y, c.x);
    case AURARealtimeFrameRotation180:
      return CGPointMake(1.0 - c.x, 1.0 - c.y);
    case AURARealtimeFrameRotationUpright:
    case AURARealtimeFrameRotationUnknown:
    default:
      return c;
  }
}

// 프레임 회전 자가판정.
//
// 4개 후보 회전을 전부 적용해 (a) 눈선이 수평-우세(|Δx| ≥ |Δy|)이고
// (b) 프로브(코 또는 입 중점)가 눈 중점보다 아래(y 큼)인 후보를 찾는다.
// 만족 후보가 정확히 1개일 때만 그 회전을 반환한다. 엄격 부등식에서 (a)는
// {Upright,180} vs {CW,CCW} 를, (b)는 그 쌍 내부를 가르므로 후보는 최대
// 1개다 — 유일성 검사는 경계 동률(정확한 45° tie)과 퇴화 입력을 Unknown 으로
// 밀어내는 방어다. Unknown 이 나오는 실제 경우: 프로브 없음 / 두 눈이 한 점 /
// 프로브가 정확히 눈높이 / FP-tie. 좌/우 눈 라벨은 신뢰하지 않는다
// (미러 여부와 무관하게 |Δ| 와 중점만 사용).
static inline AURARealtimeFrameRotation AURARealtimeDetectFrameRotation(CGPoint leftEye,
                                                                        CGPoint rightEye,
                                                                        CGPoint probe,
                                                                        BOOL hasProbe)
{
  if (!hasProbe) {
    return AURARealtimeFrameRotationUnknown;
  }

  const AURARealtimeFrameRotation candidates[4] = {
    AURARealtimeFrameRotationUpright,
    AURARealtimeFrameRotation90CW,
    AURARealtimeFrameRotation90CCW,
    AURARealtimeFrameRotation180,
  };

  AURARealtimeFrameRotation match = AURARealtimeFrameRotationUnknown;
  int matchCount = 0;

  for (int i = 0; i < 4; i++) {
    const AURARealtimeFrameRotation rotation = candidates[i];
    const CGPoint l = AURARealtimeCanonicalPoint(leftEye, rotation);
    const CGPoint r = AURARealtimeCanonicalPoint(rightEye, rotation);
    const CGPoint n = AURARealtimeCanonicalPoint(probe, rotation);
    const CGFloat dx = fabs(r.x - l.x);
    const CGFloat dy = fabs(r.y - l.y);

    // 두 눈이 사실상 한 점이면 축 판정 불가 (저신뢰 프레임)
    if (dx < 1e-6 && dy < 1e-6) {
      continue;
    }
    // (a) 눈선 수평-우세
    if (dx < dy) {
      continue;
    }
    // (b) 프로브가 눈 중점 아래 (top-left 원점이므로 y 가 커야 아래)
    const CGFloat eyeMidY = (l.y + r.y) / 2.0;
    if (n.y <= eyeMidY) {
      continue;
    }

    matchCount += 1;
    match = rotation;
  }

  return matchCount == 1 ? match : AURARealtimeFrameRotationUnknown;
}

// 정준(upright portrait, unmirrored) 점 → captureDevice 좌표.
// AVCaptureVideoPreviewLayer 의 pointForCaptureDevicePointOfInterest 가 기대하는
// 입력. (y,x) 스왑은 마이그레이션 전부터 실기기 top-level 점으로 검증된 앵커.
// 미러는 적용하지 않는다 — preview connection 의 videoMirrored 가 소유.
// isFront 는 앞으로 기기별 편차가 관측되면(projectionEyeTilt 로그) 분기할
// 확장점이며 현재 두 카메라 동일.
static inline CGPoint AURARealtimeCaptureDevicePointFromCanonical(CGPoint c, BOOL isFront)
{
  (void)isFront;
  return CGPointMake(c.y, c.x);
}

// 화면(layer) 공간에서 눈선 기울기 계측 — |Δy| / max(|Δx|, eps).
// visionPose roll≈0 인데 이 값이 크면 "정준→device→layer 투영 앵커가 틀렸다"는
// 원격 증거가 된다(스크린샷/로그 기반 검증용, 자동 보정에는 쓰지 않음).
static inline CGFloat AURARealtimeScreenEyeLineTilt(CGPoint leftEyeScreen,
                                                    CGPoint rightEyeScreen)
{
  const CGFloat dx = fabs(rightEyeScreen.x - leftEyeScreen.x);
  const CGFloat dy = fabs(rightEyeScreen.y - leftEyeScreen.y);
  // MAX 매크로 대신 fmax — 인자 이중평가 없이 CGFloat 그대로 처리(자매 파일
  // AURARealtimeFaceCaptureView.m 의 fmax 사용과 일관, gemini 리뷰).
  return dy / fmax(dx, (CGFloat)1e-6);
}

#endif  // AURARealtimeGeometry_h
