#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <React/RCTBridge.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTUIManager.h>
#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>
#import <Vision/Vision.h>

#import "AURARealtimeGeometry.h"

// 프레임 회전 자가판정 킬스위치. NO 면 항상 Upright(=회전 없음)로 동작한다.
// 주의(정직한 한계): 이는 "종전과 비트 동일"이 아니다 — 버퍼가 실제로 raw
// landscape 였다면 종전 코드는 pose 계산에서 축 스왑을 했으나 OFF(=upright)는
// 스왑을 안 한다. OFF 가 종전과 같아지는 것은 버퍼가 이미 upright 인 경우뿐이며,
// 그 진위는 진단 로그(frameRotation/eyeAxisRatio/projectionEyeTilt)로 실기기에서
// 확인해야 한다. (배경: 파일 내 'Vision 좌표=upright' vs 'raw landscape' 상반된
// 규약 주석이 공존했고 기기/iOS 버전차로 어느 쪽이 실제인지 미지수라 규약을
// 가정하지 않고 매 프레임 판정한다 — AURARealtimeGeometry.h)
static const BOOL kAURARealtimeRotationDetectionEnabled = YES;

// 회전 잠금 전환에 필요한 "동일 후보" 연속 불일치 프레임 수 (~0.4s @ 0.08s 스로틀).
static const NSInteger kAURARealtimeRotationSwitchStreak = 5;

// 비-upright 프레임 회전을 신뢰할 최대 head roll(도). 눈선이 세로인 것은
// (a) 프레임 90° 회전 (b) 고개를 90° 가까이 기울임 둘 다에서 나오는데 눈선
// 하나로는 못 가른다. Vision 이 독립 추정한 head roll 이 이 값 이하일 때만
// (=머리가 대체로 똑바를 때만) '세로 눈선 = 프레임 회전'으로 확정한다.
static const double kAURARealtimeMaxHeadRollForFrameRotationDeg = 20.0;

// MediaPipe was removed from this build (a Unity MediaPipe plugin now provides
// it; keeping the Pod caused a duplicate-MediaPipe crash). Guard every
// MediaPipe use so this file still compiles and runs when the Pod is absent.
// When present, realtime MediaPipe screen landmarks work as before; when
// absent, the MediaPipe path degrades gracefully (Vision-based capture and the
// rest of the module are unaffected).
#if __has_include(<MediaPipeTasksVision/MediaPipeTasksVision.h>)
#define AURA_HAS_MEDIAPIPE 1
#import <MediaPipeTasksVision/MediaPipeTasksVision.h>
#else
#define AURA_HAS_MEDIAPIPE 0
#endif

static void *AURARealtimeCameraStabilityContext = &AURARealtimeCameraStabilityContext;

static NSTimeInterval const AURARealtimeCameraStableThresholdMs = 400.0;

// Continuous auto exposure/white-balance on the front camera flips the
// adjusting flags in short bursts even when the scene is steady. Only treat
// the camera as unstable when an adjusting episode persists past this grace
// window, so momentary blips do not reset the stability timer.
static NSTimeInterval const AURARealtimeCameraAdjustingGraceMs = 250.0;

static CGFloat AURARealtimeClamp(CGFloat value)
{
  return fmax(0.0, fmin(1.0, value));
}

static BOOL AURARealtimeSemanticMatteTypesContain(
    NSArray<AVSemanticSegmentationMatteType> *types,
    AVSemanticSegmentationMatteType type)
{
  return [types containsObject:type];
}

static NSArray<NSString *> *AURARealtimeSemanticMatteTypeNames(
    NSArray<AVSemanticSegmentationMatteType> *types)
{
  NSMutableArray<NSString *> *names = [NSMutableArray arrayWithCapacity:types.count];

  for (AVSemanticSegmentationMatteType type in types) {
    if ([type isEqualToString:AVSemanticSegmentationMatteTypeHair]) {
      [names addObject:@"hair"];
    } else if ([type isEqualToString:AVSemanticSegmentationMatteTypeSkin]) {
      [names addObject:@"skin"];
    } else if ([type isEqualToString:AVSemanticSegmentationMatteTypeTeeth]) {
      [names addObject:@"teeth"];
    } else {
      [names addObject:type.description ?: @"unknown"];
    }
  }

  return names;
}

static NSDictionary *AURARealtimeSemanticMatteAvailability(
    BOOL requested,
    BOOL hairAvailable,
    BOOL skinAvailable)
{
  return @{
    @"hair": @(hairAvailable),
    @"requested": @(requested),
    @"skin": @(skinAvailable),
  };
}

static NSDictionary *AURARealtimeEmbeddedSemanticMatteAvailability(NSURL *url)
{
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
  if (!source) {
    return AURARealtimeSemanticMatteAvailability(NO, NO, NO);
  }

  NSDictionary *hairInfo = CFBridgingRelease(CGImageSourceCopyAuxiliaryDataInfoAtIndex(
      source,
      0,
      kCGImageAuxiliaryDataTypeSemanticSegmentationHairMatte));
  NSDictionary *skinInfo = CFBridgingRelease(CGImageSourceCopyAuxiliaryDataInfoAtIndex(
      source,
      0,
      kCGImageAuxiliaryDataTypeSemanticSegmentationSkinMatte));
  CFRelease(source);

  return AURARealtimeSemanticMatteAvailability(
      hairInfo != nil || skinInfo != nil,
      hairInfo != nil,
      skinInfo != nil);
}

static NSDictionary *AURARealtimePoint(CGFloat x, CGFloat y)
{
  return @{
    @"x": @(AURARealtimeClamp(x)),
    @"y": @(AURARealtimeClamp(y)),
  };
}

static NSDictionary *AURARealtimeScreenPoint(CGFloat x, CGFloat y)
{
  return @{
    @"left": @(x),
    @"top": @(y),
    @"x": @(x),
    @"y": @(y),
  };
}

// Vision 픽셀 점 → 정준(canonical upright) 정규화 점.
// 모든 랜드마크 생산이 이 함수를 거치므로, 여기서 프레임 회전을 정준화하면
// 하류의 모든 휴리스틱(forehead/chin 밴드, 최저점, 입꼬리 극값)이 "x=얼굴
// 좌우, y=세로" 가정 위에서 구조적으로 옳아진다. rotation 은 매 프레임
// 자가판정된다(resolveFrameRotationForFace, AURARealtimeGeometry.h).
static NSDictionary *AURARealtimePointFromImagePoint(CGPoint point,
                                                     CGSize imageSize,
                                                     AURARealtimeFrameRotation rotation)
{
  CGFloat width = fmax(imageSize.width, 1.0);
  CGFloat height = fmax(imageSize.height, 1.0);
  const CGPoint raw = CGPointMake(point.x / width, 1.0 - (point.y / height));
  const CGPoint canonical = AURARealtimeCanonicalPoint(raw, rotation);
  return AURARealtimePoint(canonical.x, canonical.y);
}

static NSArray<NSDictionary *> *AURARealtimePointsFromRegion(
    VNFaceLandmarkRegion2D *region,
    CGSize imageSize,
    AURARealtimeFrameRotation rotation)
{
  if (region == nil || region.pointCount == 0) {
    return @[];
  }

  const CGPoint *points = [region pointsInImageOfSize:imageSize];
  NSMutableArray<NSDictionary *> *result = [NSMutableArray arrayWithCapacity:region.pointCount];

  for (NSUInteger index = 0; index < region.pointCount; index += 1) {
    [result addObject:AURARealtimePointFromImagePoint(points[index], imageSize, rotation)];
  }

  return result;
}

static NSDictionary *AURARealtimeCentroidFromPoints(NSArray<NSDictionary *> *points)
{
  if (points.count == 0) {
    return nil;
  }

  CGFloat sumX = 0.0;
  CGFloat sumY = 0.0;

  for (NSDictionary *point in points) {
    sumX += [point[@"x"] doubleValue];
    sumY += [point[@"y"] doubleValue];
  }

  return AURARealtimePoint(sumX / points.count, sumY / points.count);
}

static NSDictionary *AURARealtimeCentroidFromRegion(
    VNFaceLandmarkRegion2D *region,
    CGSize imageSize,
    AURARealtimeFrameRotation rotation)
{
  return AURARealtimeCentroidFromPoints(
      AURARealtimePointsFromRegion(region, imageSize, rotation));
}

static NSDictionary *AURARealtimeLowestPointFromRegion(
    VNFaceLandmarkRegion2D *region,
    CGSize imageSize,
    AURARealtimeFrameRotation rotation)
{
  NSArray<NSDictionary *> *points = AURARealtimePointsFromRegion(region, imageSize, rotation);
  NSDictionary *lowestPoint = nil;

  for (NSDictionary *point in points) {
    if (lowestPoint == nil || [point[@"y"] doubleValue] > [lowestPoint[@"y"] doubleValue]) {
      lowestPoint = point;
    }
  }

  return lowestPoint;
}

static NSDictionary *AURARealtimeCenteredChinPointFromRegion(
    VNFaceLandmarkRegion2D *region,
    NSDictionary *bounds,
    CGSize imageSize,
    AURARealtimeFrameRotation rotation)
{
  NSArray<NSDictionary *> *points = AURARealtimePointsFromRegion(region, imageSize, rotation);

  if (points.count == 0) {
    return nil;
  }

  CGFloat faceHeight = fmax([bounds[@"height"] doubleValue], 0.001);
  CGFloat lowestY = 0.0;

  for (NSDictionary *point in points) {
    lowestY = fmax(lowestY, [point[@"y"] doubleValue]);
  }

  CGFloat bottomBand = fmax(faceHeight * 0.08, 0.025);
  CGFloat sumX = 0.0;
  CGFloat sumY = 0.0;
  NSUInteger candidateCount = 0;

  for (NSDictionary *point in points) {
    CGFloat pointY = [point[@"y"] doubleValue];

    if (pointY >= lowestY - bottomBand) {
      sumX += [point[@"x"] doubleValue];
      sumY += pointY;
      candidateCount += 1;
    }
  }

  if (candidateCount == 0) {
    return AURARealtimeLowestPointFromRegion(region, imageSize, rotation);
  }

  CGFloat averageY = sumY / candidateCount;
  CGFloat boundsChinY = [bounds[@"y"] doubleValue] + faceHeight * 0.9;
  CGFloat stableY = fmax(lowestY * 0.82 + averageY * 0.18, boundsChinY);
  return AURARealtimePoint(sumX / candidateCount, stableY);
}

static NSDictionary *AURARealtimeLipCornerFromRegion(
    VNFaceLandmarkRegion2D *region,
    CGSize imageSize,
    AURARealtimeFrameRotation rotation,
    BOOL wantsLeft)
{
  NSArray<NSDictionary *> *points = AURARealtimePointsFromRegion(region, imageSize, rotation);
  NSDictionary *cornerPoint = nil;

  for (NSDictionary *point in points) {
    if (cornerPoint == nil) {
      cornerPoint = point;
      continue;
    }

    CGFloat pointX = [point[@"x"] doubleValue];
    CGFloat cornerX = [cornerPoint[@"x"] doubleValue];

    if ((wantsLeft && pointX < cornerX) || (!wantsLeft && pointX > cornerX)) {
      cornerPoint = point;
    }
  }

  return cornerPoint;
}

static NSDictionary *AURARealtimeBoundsFromObservation(VNFaceObservation *face,
                                                       AURARealtimeFrameRotation rotation)
{
  CGRect box = face.boundingBox;
  // Vision bottom-left 원점 → raw top-left 정규화 rect 의 두 대각 꼭짓점을
  // 정준화한 뒤 min/max 로 재조립한다 (90° 회전이면 가로/세로가 맞바뀜).
  const CGPoint rawTopLeft = CGPointMake(box.origin.x, 1.0 - box.origin.y - box.size.height);
  const CGPoint rawBottomRight =
      CGPointMake(box.origin.x + box.size.width, 1.0 - box.origin.y);
  const CGPoint c1 = AURARealtimeCanonicalPoint(rawTopLeft, rotation);
  const CGPoint c2 = AURARealtimeCanonicalPoint(rawBottomRight, rotation);
  const CGFloat minX = fmin(c1.x, c2.x);
  const CGFloat minY = fmin(c1.y, c2.y);
  return @{
    @"x": @(AURARealtimeClamp(minX)),
    @"y": @(AURARealtimeClamp(minY)),
    @"width": @(AURARealtimeClamp(fabs(c2.x - c1.x))),
    @"height": @(AURARealtimeClamp(fabs(c2.y - c1.y))),
  };
}

static NSDictionary *AURARealtimeBoundsPoint(NSDictionary *bounds, CGFloat xRatio, CGFloat yRatio)
{
  CGFloat x = [bounds[@"x"] doubleValue] + [bounds[@"width"] doubleValue] * xRatio;
  CGFloat y = [bounds[@"y"] doubleValue] + [bounds[@"height"] doubleValue] * yRatio;
  return AURARealtimePoint(x, y);
}

static NSDictionary *AURARealtimeForeheadPoint(
    VNFaceLandmarks2D *landmarks,
    NSDictionary *bounds,
    CGSize imageSize,
    AURARealtimeFrameRotation rotation)
{
  NSMutableArray<NSDictionary *> *browPoints = [NSMutableArray array];
  [browPoints addObjectsFromArray:
      AURARealtimePointsFromRegion(landmarks.leftEyebrow, imageSize, rotation)];
  [browPoints addObjectsFromArray:
      AURARealtimePointsFromRegion(landmarks.rightEyebrow, imageSize, rotation)];

  CGFloat faceTop = [bounds[@"y"] doubleValue];
  CGFloat faceHeight = [bounds[@"height"] doubleValue];
  CGFloat faceCenterX = [bounds[@"x"] doubleValue] + [bounds[@"width"] doubleValue] * 0.5;
  NSDictionary *leftEye = AURARealtimeCentroidFromRegion(landmarks.leftEye, imageSize, rotation);
  NSDictionary *rightEye = AURARealtimeCentroidFromRegion(landmarks.rightEye, imageSize, rotation);
  CGFloat foreheadCenterX = faceCenterX;

  if (browPoints.count == 0) {
    if (leftEye && rightEye) {
      foreheadCenterX =
          ([leftEye[@"x"] doubleValue] + [rightEye[@"x"] doubleValue]) / 2.0;
    }

    return AURARealtimePoint(foreheadCenterX, faceTop + faceHeight * 0.12);
  }

  CGFloat sumX = 0.0;
  CGFloat browTopY = 1.0;

  for (NSDictionary *point in browPoints) {
    sumX += [point[@"x"] doubleValue];
    browTopY = fmin(browTopY, [point[@"y"] doubleValue]);
  }

  if (leftEye && rightEye) {
    foreheadCenterX =
        ([leftEye[@"x"] doubleValue] + [rightEye[@"x"] doubleValue]) / 2.0;
  } else {
    foreheadCenterX = sumX / browPoints.count;
  }

  CGFloat foreheadY = faceTop + fmax((browTopY - faceTop) * 0.45, faceHeight * 0.05);
  return AURARealtimePoint(foreheadCenterX, foreheadY);
}

static NSMutableDictionary *AURARealtimeLandmarksFromFace(
    VNFaceObservation *face,
    CGSize imageSize,
    AURARealtimeFrameRotation rotation)
{
  VNFaceLandmarks2D *landmarks = face.landmarks;
  NSDictionary *bounds = AURARealtimeBoundsFromObservation(face, rotation);
  NSMutableDictionary *result = [NSMutableDictionary dictionary];

  if (landmarks == nil) {
    return result;
  }

  NSDictionary *leftEye = AURARealtimeCentroidFromRegion(landmarks.leftEye, imageSize, rotation);
  NSDictionary *rightEye = AURARealtimeCentroidFromRegion(landmarks.rightEye, imageSize, rotation);
  NSDictionary *noseBase = AURARealtimeLowestPointFromRegion(landmarks.nose, imageSize, rotation);
  VNFaceLandmarkRegion2D *lips = landmarks.outerLips ?: landmarks.innerLips;
  NSDictionary *mouthLeft = AURARealtimeLipCornerFromRegion(lips, imageSize, rotation, YES);
  NSDictionary *mouthRight = AURARealtimeLipCornerFromRegion(lips, imageSize, rotation, NO);
  NSDictionary *chin =
      AURARealtimeCenteredChinPointFromRegion(landmarks.faceContour, bounds, imageSize, rotation) ?:
          AURARealtimeBoundsPoint(bounds, 0.5, 0.92);
  NSDictionary *forehead = AURARealtimeForeheadPoint(landmarks, bounds, imageSize, rotation);

  if (leftEye) {
    result[@"leftEye"] = leftEye;
  }
  if (rightEye) {
    result[@"rightEye"] = rightEye;
  }
  if (noseBase) {
    result[@"noseBase"] = noseBase;
  }
  if (mouthLeft) {
    result[@"mouthLeft"] = mouthLeft;
  }
  if (mouthRight) {
    result[@"mouthRight"] = mouthRight;
  }
  if (chin) {
    result[@"chin"] = chin;
  }
  if (forehead) {
    result[@"forehead"] = forehead;
  }

  result[@"leftCheek"] = AURARealtimeBoundsPoint(bounds, 0.27, 0.53);
  result[@"rightCheek"] = AURARealtimeBoundsPoint(bounds, 0.73, 0.53);
  result[@"leftJaw"] = AURARealtimeBoundsPoint(bounds, 0.34, 0.78);
  result[@"rightJaw"] = AURARealtimeBoundsPoint(bounds, 0.66, 0.78);

  return result;
}

// Forward declarations: these are defined later in the file (outside the
// MediaPipe guard) but are used by the Vision→MediaPipe shim helpers below.
static CGFloat AURARealtimeNumberFromPoint(NSDictionary *point, NSString *key);
static NSDictionary *AURARealtimePoseFromGeometry(NSDictionary *landmarks);
static NSDictionary *AURARealtimePoseFromVisionObservation(VNFaceObservation *face,
                                                           BOOL isFront);

// Builds the MediaPipe-shaped `landmarks` map in the CANONICAL upright frame —
// the same frame the top-level Vision landmarks (AURARealtimeLandmarksFromFace)
// use, because both go through the rotation-aware primitives. These landmarks
// feed attachMediaPipeScreenLandmarksToPayload → screenPointFromNormalizedPoint
// → captureDevicePointFromCanonicalPoint, whose contract is canonical input.
// The greenlight's not_centered check reads the resulting screenLandmarks.
static NSMutableDictionary *AURARealtimeMediaPipeLandmarksFromVisionFace(
    VNFaceObservation *face,
    CGSize imageSize,
    AURARealtimeFrameRotation rotation)
{
  VNFaceLandmarks2D *landmarks = face.landmarks;
  NSDictionary *bounds = AURARealtimeBoundsFromObservation(face, rotation);
  NSMutableDictionary *result = [NSMutableDictionary dictionary];

  if (landmarks == nil) {
    return result;
  }

  NSDictionary *leftEye = AURARealtimeCentroidFromRegion(landmarks.leftEye, imageSize, rotation);
  NSDictionary *rightEye = AURARealtimeCentroidFromRegion(landmarks.rightEye, imageSize, rotation);
  VNFaceLandmarkRegion2D *lips = landmarks.outerLips ?: landmarks.innerLips;
  NSDictionary *mouthLeft = AURARealtimeLipCornerFromRegion(lips, imageSize, rotation, YES);
  NSDictionary *mouthRight = AURARealtimeLipCornerFromRegion(lips, imageSize, rotation, NO);
  NSDictionary *chin =
      AURARealtimeCenteredChinPointFromRegion(landmarks.faceContour, bounds, imageSize, rotation) ?:
          AURARealtimeBoundsPoint(bounds, 0.5, 0.92);
  NSDictionary *forehead = AURARealtimeForeheadPoint(landmarks, bounds, imageSize, rotation);

  // noseBridge/noseTip are placed by interpolating between forehead and chin.
  // Interpolating guarantees all four centerline points are COLLINEAR on screen,
  // so the greenlight's centerLineSpread ≈ 0 and the not_centered check passes
  // for a centered face. (Nose-region extreme pickers are less reliable than the
  // forehead/chin band heuristics, so we do not use them for the centerline.)
  NSDictionary *noseBridge = nil;
  NSDictionary *noseTip = nil;
  if (forehead && chin) {
    CGFloat fx = AURARealtimeNumberFromPoint(forehead, @"x");
    CGFloat fy = AURARealtimeNumberFromPoint(forehead, @"y");
    CGFloat cx = AURARealtimeNumberFromPoint(chin, @"x");
    CGFloat cy = AURARealtimeNumberFromPoint(chin, @"y");
    // 0 = forehead, 1 = chin. noseBridge ≈ 35%, noseTip ≈ 55% down the midline.
    noseBridge = AURARealtimePoint(fx + (cx - fx) * 0.35, fy + (cy - fy) * 0.35);
    noseTip = AURARealtimePoint(fx + (cx - fx) * 0.55, fy + (cy - fy) * 0.55);
  }

  if (forehead) {
    result[@"forehead"] = forehead;
  }
  if (noseBridge) {
    result[@"noseBridge"] = noseBridge;
  }
  if (noseTip) {
    result[@"noseTip"] = noseTip;
  }
  if (chin) {
    result[@"chin"] = chin;
  }
  if (leftEye) {
    result[@"leftEye"] = leftEye;
  }
  if (rightEye) {
    result[@"rightEye"] = rightEye;
  }
  if (mouthLeft) {
    result[@"mouthLeft"] = mouthLeft;
  }
  if (mouthRight) {
    result[@"mouthRight"] = mouthRight;
  }

  return result;
}

// pose/faceWidthRatio 계산용 사본 — 좌/우 라벨을 정준 x 기준으로 재정렬한다.
// 랜드마크는 이미 정준(upright) 프레임이지만, 회전 판정 전 원 프레임의 라벨이
// 뒤바뀌어 있을 수 있다 (rollDeg = atan2(rightY-leftY, rightX-leftX) 는 올바른
// 순서를 요구). 방출되는 landmarks 맵은 건드리지 않는다.
static NSMutableDictionary *AURARealtimePoseLandmarksFromCanonical(NSDictionary *landmarks)
{
  NSMutableDictionary *poseLandmarks = [landmarks mutableCopy];

  NSArray<NSArray<NSString *> *> *pairs = @[ @[ @"leftEye", @"rightEye" ], @[ @"mouthLeft", @"mouthRight" ] ];
  for (NSArray<NSString *> *pair in pairs) {
    NSDictionary *a = poseLandmarks[pair[0]];
    NSDictionary *b = poseLandmarks[pair[1]];
    if (a && b &&
        AURARealtimeNumberFromPoint(a, @"x") > AURARealtimeNumberFromPoint(b, @"x")) {
      poseLandmarks[pair[0]] = b;
      poseLandmarks[pair[1]] = a;
    }
  }

  return poseLandmarks;
}

// faceWidthRatio in the MediaPipe scale (thresholds 0.30..0.62 in the
// greenlight). Reuses the MediaPipe path's eye/mouth-span heuristic so the same
// thresholds apply; both use CANONICAL upright full-image normalized x coords.
static NSNumber *AURARealtimeMediaPipeFaceWidthRatioFromLandmarks(NSDictionary *landmarks)
{
  NSDictionary *leftEye = landmarks[@"leftEye"];
  NSDictionary *rightEye = landmarks[@"rightEye"];
  NSDictionary *mouthLeft = landmarks[@"mouthLeft"];
  NSDictionary *mouthRight = landmarks[@"mouthRight"];

  if (leftEye && rightEye && mouthLeft && mouthRight) {
    CGFloat eyeWidth =
        fabs(AURARealtimeNumberFromPoint(rightEye, @"x") -
             AURARealtimeNumberFromPoint(leftEye, @"x"));
    CGFloat mouthWidth =
        fabs(AURARealtimeNumberFromPoint(mouthRight, @"x") -
             AURARealtimeNumberFromPoint(mouthLeft, @"x"));
    return @(fmax(eyeWidth * 2.35, mouthWidth * 2.15));
  }

  return nil;
}

// Assembles the full MediaPipe-shaped payload. `landmarks` are CANONICAL
// upright (rotation-aware primitives), so screenLandmarks convert correctly and
// pose/faceWidthRatio can be derived from the same points (좌/우 라벨 재정렬만
// 별도 사본에서 수행). 실시간 좌표 규약의 단일 계약은 AURARealtimeGeometry.h.
static NSDictionary *AURARealtimeMediaPipePayloadFromVisionFace(
    VNFaceObservation *face,
    CGSize imageSize,
    BOOL isFront,
    AURARealtimeFrameRotation rotation)
{
  NSMutableDictionary *landmarks =
      AURARealtimeMediaPipeLandmarksFromVisionFace(face, imageSize, rotation);

  if (landmarks.count == 0) {
    return @{
      @"status": @"landmark_missing",
      @"landmarkCount": @0,
    };
  }

  NSMutableDictionary *payload = [@{
    @"status": @"ok",
    @"landmarkCount": @(landmarks.count),
    @"landmarks": landmarks,
    @"poseSource": @"geometry",
  } mutableCopy];

  // Pose + width: 정준 랜드마크에서 좌/우 라벨만 재정렬한 사본으로 계산.
  NSMutableDictionary *poseLandmarks = AURARealtimePoseLandmarksFromCanonical(landmarks);

  // For yaw, pose needs a REAL nose position, not the on-midline interpolated
  // noseTip (which would force yaw≈0). Override for the pose calc only — this
  // does not affect the emitted centerline landmarks/screenLandmarks.
  NSDictionary *noseCentroid =
      AURARealtimeCentroidFromRegion(face.landmarks.nose, imageSize, rotation);
  if (noseCentroid) {
    poseLandmarks[@"noseTip"] = noseCentroid;
  }

  // Vision 이 관측 자체에 제공하는 head pose 각도(roll/yaw/pitch)를 우선 사용한다.
  // VNImageRequestHandler 에 orientation 을 전달하므로 각도는 upright 프레임 기준.
  // 5점 geometry 근사((noseRatio-0.48)*28 등 개인차 큰 휴리스틱)보다 훨씬 안정적이라
  // pitch/yaw 게이트의 프레임 간 지터가 줄어든다. 게이트는 |값| 기준이라 부호 규약
  // 차이는 판정에 영향 없다. 각도가 없으면(관측 미제공) geometry 로 폴백.
  NSDictionary *visionPose = AURARealtimePoseFromVisionObservation(face, isFront);
  [payload addEntriesFromDictionary:
      visionPose ?: AURARealtimePoseFromGeometry(poseLandmarks)];

  NSNumber *faceWidthRatio =
      AURARealtimeMediaPipeFaceWidthRatioFromLandmarks(poseLandmarks);
  if (faceWidthRatio) {
    payload[@"faceWidthRatio"] = faceWidthRatio;
  }

  return payload;
}

static VNFaceObservation *AURARealtimeLargestFace(NSArray<VNFaceObservation *> *faces)
{
  VNFaceObservation *largestFace = nil;
  CGFloat largestArea = 0.0;

  for (VNFaceObservation *face in faces) {
    CGFloat area = face.boundingBox.size.width * face.boundingBox.size.height;
    if (largestFace == nil || area > largestArea) {
      largestFace = face;
      largestArea = area;
    }
  }

  return largestFace;
}

static CGImagePropertyOrientation AURARealtimeVideoOrientation(AVCaptureDevicePosition position)
{
  // Vision 검출 힌트. video data output 은 unmirrored 유지 — 미러는 preview
  // connection 소유. 주의: 이 힌트가 결과 좌표의 프레임을 보장한다고 가정하지
  // 않는다. 좌표 프레임은 매 프레임 자가판정한다(resolveFrameRotationForFace,
  // AURARealtimeGeometry.h) — 과거 이 파일에는 'Vision 좌표=upright' 와
  // 'raw landscape 실측' 이라는 상반된 주석이 공존했고 그 불일치가 중앙선
  // 어긋남의 근인이었다.
  return position == AVCaptureDevicePositionFront
      ? kCGImagePropertyOrientationLeft
      : kCGImagePropertyOrientationRight;
}

// 진단 로그/페이로드용 회전 이름.
static NSString *AURARealtimeFrameRotationName(AURARealtimeFrameRotation rotation)
{
  switch (rotation) {
    case AURARealtimeFrameRotationUpright: return @"upright";
    case AURARealtimeFrameRotation90CW: return @"rot90cw";
    case AURARealtimeFrameRotation90CCW: return @"rot90ccw";
    case AURARealtimeFrameRotation180: return @"rot180";
    default: return @"unknown";
  }
}

static CGFloat AURARealtimeDegrees(CGFloat radians)
{
  return radians * 180.0 / M_PI;
}

// Non-MediaPipe numeric helper: reads a coordinate from a landmark dictionary.
// Used by BOTH the MediaPipe path and the Vision/ARKit path (e.g. line ~520), so
// it must live OUTSIDE the MediaPipe guard — the guard workflow wrongly enclosed
// it, which broke the Pod-removed build (undeclared function at the call sites).
static CGFloat AURARealtimeNumberFromPoint(NSDictionary *point, NSString *key)
{
  NSNumber *number = point[key];
  return [number respondsToSelector:@selector(doubleValue)] ? number.doubleValue : 0.0;
}

#if AURA_HAS_MEDIAPIPE

static UIImageOrientation AURARealtimeMediaPipeImageOrientation(AVCaptureDevicePosition position)
{
  return position == AVCaptureDevicePositionFront
      ? UIImageOrientationLeft
      : UIImageOrientationRight;
}

static NSDictionary *AURARealtimeMediaPipePoint(MPPNormalizedLandmark *landmark)
{
  if (!landmark) {
    return nil;
  }

  return @{
    @"x": @(AURARealtimeClamp(landmark.x)),
    @"y": @(AURARealtimeClamp(landmark.y)),
    @"z": @(landmark.z),
  };
}

static MPPNormalizedLandmark *AURARealtimeMediaPipeLandmarkAtIndex(
    NSArray<MPPNormalizedLandmark *> *landmarks,
    NSUInteger index)
{
  return index < landmarks.count ? landmarks[index] : nil;
}

static NSDictionary *AURARealtimeAverageMediaPipePoint(
    NSArray<MPPNormalizedLandmark *> *landmarks,
    NSArray<NSNumber *> *indices)
{
  CGFloat sumX = 0.0;
  CGFloat sumY = 0.0;
  CGFloat sumZ = 0.0;
  NSUInteger count = 0;

  for (NSNumber *index in indices) {
    MPPNormalizedLandmark *landmark =
        AURARealtimeMediaPipeLandmarkAtIndex(landmarks, index.unsignedIntegerValue);

    if (!landmark) {
      continue;
    }

    sumX += landmark.x;
    sumY += landmark.y;
    sumZ += landmark.z;
    count += 1;
  }

  if (count == 0) {
    return nil;
  }

  return @{
    @"x": @(AURARealtimeClamp(sumX / count)),
    @"y": @(AURARealtimeClamp(sumY / count)),
    @"z": @(sumZ / count),
  };
}

static NSDictionary *AURARealtimePoseFromMatrix(MPPTransformMatrix *matrix)
{
  if (!matrix || matrix.rows < 3 || matrix.columns < 3) {
    return nil;
  }

  CGFloat r00 = [matrix valueAtRow:0 column:0];
  CGFloat r10 = [matrix valueAtRow:1 column:0];
  CGFloat r20 = [matrix valueAtRow:2 column:0];
  CGFloat r21 = [matrix valueAtRow:2 column:1];
  CGFloat r22 = [matrix valueAtRow:2 column:2];
  CGFloat sy = sqrt(r00 * r00 + r10 * r10);
  CGFloat pitch = 0.0;
  CGFloat yaw = 0.0;
  CGFloat roll = 0.0;

  if (sy >= 1e-6) {
    pitch = atan2(r21, r22);
    yaw = atan2(-r20, sy);
    roll = atan2(r10, r00);
  } else {
    CGFloat r01 = [matrix valueAtRow:0 column:1];
    CGFloat r11 = [matrix valueAtRow:1 column:1];
    pitch = atan2(-r11, r01);
    yaw = atan2(-r20, sy);
  }

  return @{
    @"pitchDeg": @(AURARealtimeDegrees(pitch)),
    @"yawDeg": @(AURARealtimeDegrees(yaw)),
    @"rollDeg": @(AURARealtimeDegrees(roll)),
    @"poseSource": @"matrix",
  };
}

#endif  // AURA_HAS_MEDIAPIPE

// Vision 얼굴 검출기가 관측에 직접 제공하는 head pose(라디안 → 도).
// 핸들러에 버퍼 orientation 을 전달하므로 각도는 upright 프레임 기준이다.
// 세 각도가 모두 있을 때만 사용하고, 하나라도 없으면 nil 을 반환해 호출측이
// geometry 근사로 폴백하게 한다 (부분 혼합은 소스 의미를 흐린다).
// 이 payload 의 landmarks 는 전면 카메라에서 셀피 미러가 적용된 프레임이고
// 기존 geometry pose 도 그 미러 좌표에서 유도됐다. Vision 각도는 비미러 관측
// 기준이므로 isFront 일 때 yaw/roll 부호를 뒤집어 기존 규약을 유지한다
// (게이트는 |값| 만 보지만, 부호를 방향 힌트로 쓰는 소비자를 위해 맞춘다).
static NSDictionary *AURARealtimePoseFromVisionObservation(VNFaceObservation *face,
                                                           BOOL isFront)
{
  NSNumber *roll = face.roll;
  NSNumber *yaw = face.yaw;
  NSNumber *pitch = nil;
  if (@available(iOS 15.0, *)) {
    pitch = face.pitch;
  }
  if (!roll || !yaw || !pitch) {
    return nil;
  }

  double mirror = isFront ? -1.0 : 1.0;
  return @{
    @"pitchDeg": @(AURARealtimeDegrees(pitch.doubleValue)),
    @"yawDeg": @(mirror * AURARealtimeDegrees(yaw.doubleValue)),
    @"rollDeg": @(mirror * AURARealtimeDegrees(roll.doubleValue)),
    @"poseSource": @"vision",
  };
}

static NSDictionary *AURARealtimePoseFromGeometry(NSDictionary *landmarks)
{
  NSDictionary *leftEye = landmarks[@"leftEye"];
  NSDictionary *rightEye = landmarks[@"rightEye"];
  NSDictionary *noseTip = landmarks[@"noseTip"];
  NSDictionary *mouthLeft = landmarks[@"mouthLeft"];
  NSDictionary *mouthRight = landmarks[@"mouthRight"];

  if (!leftEye || !rightEye || !noseTip) {
    return @{
      @"pitchDeg": @0,
      @"yawDeg": @0,
      @"rollDeg": @0,
      @"poseSource": @"geometry_unavailable",
    };
  }

  CGFloat leftX = AURARealtimeNumberFromPoint(leftEye, @"x");
  CGFloat leftY = AURARealtimeNumberFromPoint(leftEye, @"y");
  CGFloat rightX = AURARealtimeNumberFromPoint(rightEye, @"x");
  CGFloat rightY = AURARealtimeNumberFromPoint(rightEye, @"y");
  CGFloat noseX = AURARealtimeNumberFromPoint(noseTip, @"x");
  CGFloat noseY = AURARealtimeNumberFromPoint(noseTip, @"y");
  CGFloat eyeCenterX = (leftX + rightX) / 2.0;
  CGFloat eyeCenterY = (leftY + rightY) / 2.0;
  CGFloat eyeDistance = fmax(fabs(rightX - leftX), 0.001);
  CGFloat rollDeg = AURARealtimeDegrees(atan2(rightY - leftY, rightX - leftX));
  CGFloat yawDeg = (noseX - eyeCenterX) / eyeDistance * 42.0;
  CGFloat pitchDeg = 0.0;

  if (mouthLeft && mouthRight) {
    CGFloat mouthCenterY =
        (AURARealtimeNumberFromPoint(mouthLeft, @"y") +
         AURARealtimeNumberFromPoint(mouthRight, @"y")) /
        2.0;
    CGFloat verticalSpan = fmax(mouthCenterY - eyeCenterY, 0.001);
    CGFloat noseRatio = (noseY - eyeCenterY) / verticalSpan;
    pitchDeg = (noseRatio - 0.48) * 28.0;
  }

  return @{
    @"pitchDeg": @(pitchDeg),
    @"yawDeg": @(yawDeg),
    @"rollDeg": @(rollDeg),
    @"poseSource": @"geometry",
  };
}

@interface AURARealtimeFaceCaptureView : UIView <AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate>

@property (nonatomic, copy) RCTDirectEventBlock onLandmarksDetected;
@property (nonatomic, copy) NSString *facing;
@property (nonatomic, assign) BOOL semanticMatteCapture;

- (void)captureWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
- (void)restoreCameraAutoModes;
- (void)startCameraStabilityMonitoringForDevice:(AVCaptureDevice *)device;
- (void)stopCameraStabilityMonitoring;

@end

@implementation AURARealtimeFaceCaptureView {
  AVCaptureSession *_session;
  AVCaptureDeviceInput *_videoInput;
  AVCaptureVideoDataOutput *_videoOutput;
  AVCapturePhotoOutput *_photoOutput;
  AVCaptureVideoPreviewLayer *_previewLayer;
  AVCaptureDevice *_observedCameraDevice;
  dispatch_queue_t _sessionQueue;
  dispatch_queue_t _visionQueue;
  BOOL _isProcessingFrame;
  BOOL _isSessionConfigured;
  BOOL _isSessionRunning;
  BOOL _hasPendingCapture;
  // Monotonic id for the in-flight capture so a watchdog scheduled for one
  // capture never fires against a later (or already-finished) one.
  NSUInteger _captureGeneration;
  // YES once the current capture has already been retried without semantic
  // mattes (the stall fallback); a second stall then rejects instead of looping.
  BOOL _pendingCaptureIsFallback;
  BOOL _hasCameraStabilityObservers;
  BOOL _semanticMatteCapture;
  BOOL _semanticMatteRequiresHeic;
  CGSize _latestViewSize;
  NSDictionary *_lastScreenLandmarks;
  // 프레임 회전 자가판정 상태 (vision 큐 전용 접근).
  // 잠금(hysteresis): 첫 유효 판정으로 잠그고, "동일 후보"가 연속
  // kAURARealtimeRotationSwitchStreak 프레임 나와야 전환한다. Unknown 프레임은
  // 잠긴 값을 유지. _pendingFrameRotation 은 현재 누적 중인 전환 후보로,
  // 다른 후보가 오면 streak 를 리셋해 "플래핑"으로 엉뚱한 값에 잠기는 것을 막는다.
  AURARealtimeFrameRotation _lockedFrameRotation;
  AURARealtimeFrameRotation _pendingFrameRotation;
  BOOL _hasLockedFrameRotation;
  NSInteger _rotationDisagreeStreak;
  // 진단용 (payload 로 방출): 이번 프레임의 원시 판정과 raw 눈선 축 비율.
  AURARealtimeFrameRotation _diagDetectedRotation;
  double _diagEyeAxisRatio;
  BOOL _diagHasEyeAxis;
  NSDictionary *_matteCapability;
  NSDictionary *_pendingCaptureCameraMetadata;
  NSDictionary *_pendingSemanticMattes;
  NSString *_pendingCaptureFormat;
#if AURA_HAS_MEDIAPIPE
  MPPFaceLandmarker *_faceLandmarker;
#endif
  NSString *_faceLandmarkerInitError;
  CFTimeInterval _cameraStableSince;
  CFTimeInterval _cameraAdjustingSince;
  CFTimeInterval _lastScreenLandmarksTimestamp;
  CFTimeInterval _lastFrameTimestamp;
  NSInteger _sequence;
  NSInteger _lastMediaPipeTimestampMs;
  RCTPromiseResolveBlock _captureResolve;
  RCTPromiseRejectBlock _captureReject;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  self = [super initWithFrame:frame];
  if (self) {
    _facing = @"front";
    _sessionQueue = dispatch_queue_create("aura.realtimeFaceCapture.session", DISPATCH_QUEUE_SERIAL);
    _visionQueue = dispatch_queue_create("aura.realtimeFaceCapture.vision", DISPATCH_QUEUE_SERIAL);
    _session = [AVCaptureSession new];
    _previewLayer = [AVCaptureVideoPreviewLayer layerWithSession:_session];
    _previewLayer.videoGravity = AVLayerVideoGravityResizeAspectFill;
    [self.layer addSublayer:_previewLayer];
    self.backgroundColor = UIColor.blackColor;
    _latestViewSize = frame.size;
  }
  return self;
}

- (void)dealloc
{
  [self stopCameraStabilityMonitoring];
  [self restoreCameraAutoModes];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _latestViewSize = self.bounds.size;
  _previewLayer.frame = self.bounds;
  [self updatePreviewConnection];
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    [self startCameraIfPermitted];
  } else {
    [self stopSession];
  }
}

- (void)setFacing:(NSString *)facing
{
  NSString *nextFacing = [facing isEqualToString:@"back"] ? @"back" : @"front";
  if ([_facing isEqualToString:nextFacing]) {
    return;
  }

  _facing = nextFacing;
  _isSessionConfigured = NO;

  if (self.window != nil) {
    [self startCameraIfPermitted];
  }
}

- (void)setSemanticMatteCapture:(BOOL)semanticMatteCapture
{
  if (_semanticMatteCapture == semanticMatteCapture) {
    return;
  }

  _semanticMatteCapture = semanticMatteCapture;
  _matteCapability = nil;
  _isSessionConfigured = NO;

  if (self.window == nil) {
    return;
  }

  dispatch_async(_sessionQueue, ^{
    BOOL shouldRestart = self->_session.isRunning || self->_isSessionRunning;
    if (self->_session.isRunning) {
      [self->_session stopRunning];
    }

    if (![self configureSession]) {
      return;
    }

    if (shouldRestart) {
      [self->_session startRunning];
    }
    self->_isSessionRunning = self->_session.isRunning;
  });
}

- (AVCaptureDevicePosition)devicePosition
{
  return [_facing isEqualToString:@"back"] ? AVCaptureDevicePositionBack : AVCaptureDevicePositionFront;
}

- (void)startCameraIfPermitted
{
  AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];

  if (status == AVAuthorizationStatusAuthorized) {
    [self startSession];
    return;
  }

  if (status == AVAuthorizationStatusNotDetermined) {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (granted) {
          [self startSession];
        } else {
          [self emitCameraError:@"permission_denied"];
        }
      });
    }];
    return;
  }

  [self emitCameraError:@"permission_denied"];
}

- (void)startSession
{
  dispatch_async(_sessionQueue, ^{
    if (!self->_isSessionConfigured && ![self configureSession]) {
      return;
    }

    if (!self->_session.isRunning) {
      [self->_session startRunning];
    }
    self->_isSessionRunning = YES;
  });
}

- (void)stopSession
{
  dispatch_async(_sessionQueue, ^{
    if (self->_session.isRunning) {
      [self->_session stopRunning];
    }
    self->_isSessionRunning = NO;
  });
}

- (NSDictionary *)semanticMatteCapabilityForRung:(NSInteger)rung
                                          device:(AVCaptureDevice *)device
                                       supported:(BOOL)supported
{
  NSArray<AVSemanticSegmentationMatteType> *availableTypes =
      _photoOutput.availableSemanticSegmentationMatteTypes ?: @[];
  BOOL depthSupported = _photoOutput.depthDataDeliverySupported;

  return @{
    @"availableTypes": AURARealtimeSemanticMatteTypeNames(availableTypes),
    @"depthEnabled": @(_photoOutput.isDepthDataDeliveryEnabled),
    @"depthSupported": @(depthSupported),
    @"device": device.deviceType ?: @"unknown",
    @"preset": _session.sessionPreset ?: @"unknown",
    @"requestedTypes": supported ? @[@"hair", @"skin"] : @[],
    @"rung": @(rung),
    @"supported": @(supported),
  };
}

- (BOOL)semanticMatteTypesIncludeHairAndSkin:
    (NSArray<AVSemanticSegmentationMatteType> *)availableTypes
{
  return AURARealtimeSemanticMatteTypesContain(availableTypes, AVSemanticSegmentationMatteTypeHair) &&
      AURARealtimeSemanticMatteTypesContain(availableTypes, AVSemanticSegmentationMatteTypeSkin);
}

- (NSDictionary *)configureSemanticMatteDeliveryForDevice:(AVCaptureDevice *)device
{
  if (!_photoOutput || !_semanticMatteCapture || [self devicePosition] != AVCaptureDevicePositionFront) {
    return nil;
  }

  if (_photoOutput.depthDataDeliverySupported) {
    _photoOutput.depthDataDeliveryEnabled = YES;
  }

  NSArray<AVSemanticSegmentationMatteType> *availableTypes =
      _photoOutput.availableSemanticSegmentationMatteTypes ?: @[];
  BOOL supported = [self semanticMatteTypesIncludeHairAndSkin:availableTypes];
  NSDictionary *capability =
      [self semanticMatteCapabilityForRung:1 device:device supported:supported];
  NSLog(@"[aura:face-capture] matte:capability rung=%@ device=%@ preset=%@ depthSupported=%@ depthEnabled=%@ availableTypes=%@",
        capability[@"rung"],
        capability[@"device"],
        capability[@"preset"],
        capability[@"depthSupported"],
        capability[@"depthEnabled"],
        capability[@"availableTypes"]);

  // SSM 생성은 depth 파이프라인에 의존하므로 matte type이 있어도 depth delivery가
  // 미지원인 포맷(720p 등)에서는 matte가 나오지 않을 수 있다 → Photo 프리셋으로 승격.
  if ((!supported || !_photoOutput.depthDataDeliverySupported) &&
      [_session canSetSessionPreset:AVCaptureSessionPresetPhoto]) {
    _session.sessionPreset = AVCaptureSessionPresetPhoto;
    if (_photoOutput.depthDataDeliverySupported) {
      _photoOutput.depthDataDeliveryEnabled = YES;
    }

    availableTypes = _photoOutput.availableSemanticSegmentationMatteTypes ?: @[];
    supported = [self semanticMatteTypesIncludeHairAndSkin:availableTypes];
    capability = [self semanticMatteCapabilityForRung:2 device:device supported:supported];
    NSLog(@"[aura:face-capture] matte:capability rung=%@ device=%@ preset=%@ depthSupported=%@ depthEnabled=%@ availableTypes=%@",
          capability[@"rung"],
          capability[@"device"],
          capability[@"preset"],
          capability[@"depthSupported"],
          capability[@"depthEnabled"],
          capability[@"availableTypes"]);
  }

  if (supported) {
    _photoOutput.enabledSemanticSegmentationMatteTypes = @[
      AVSemanticSegmentationMatteTypeHair,
      AVSemanticSegmentationMatteTypeSkin,
    ];
  } else {
    _photoOutput.enabledSemanticSegmentationMatteTypes = @[];
  }

  return capability;
}

- (BOOL)configureSession
{
  [_session beginConfiguration];
  _session.sessionPreset = AVCaptureSessionPreset1280x720;
  _matteCapability = nil;
  [self stopCameraStabilityMonitoring];

  if (_videoInput) {
    [_session removeInput:_videoInput];
    _videoInput = nil;
  }
  if (_videoOutput) {
    [_session removeOutput:_videoOutput];
    _videoOutput = nil;
  }
  if (_photoOutput) {
    [_session removeOutput:_photoOutput];
    _photoOutput = nil;
  }

  AVCaptureDevice *device = [self cameraDeviceForPosition:[self devicePosition]];
  if (!device) {
    [_session commitConfiguration];
    [self emitCameraError:@"camera_unavailable"];
    return NO;
  }

  NSError *inputError = nil;
  AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:device error:&inputError];
  if (!input || inputError) {
    [_session commitConfiguration];
    [self emitCameraError:@"input_unavailable"];
    return NO;
  }

  if ([_session canAddInput:input]) {
    [_session addInput:input];
    _videoInput = input;
    [self startCameraStabilityMonitoringForDevice:device];
  }

  AVCaptureVideoDataOutput *videoOutput = [AVCaptureVideoDataOutput new];
  videoOutput.alwaysDiscardsLateVideoFrames = YES;
  videoOutput.videoSettings = @{
    (NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA),
  };
  [videoOutput setSampleBufferDelegate:self queue:_visionQueue];

  if ([_session canAddOutput:videoOutput]) {
    [_session addOutput:videoOutput];
    _videoOutput = videoOutput;
  }

  AVCapturePhotoOutput *photoOutput = [AVCapturePhotoOutput new];
  if ([_session canAddOutput:photoOutput]) {
    [_session addOutput:photoOutput];
    _photoOutput = photoOutput;
  }

  if (_semanticMatteCapture) {
    _matteCapability = [self configureSemanticMatteDeliveryForDevice:device];
  }

  [_session commitConfiguration];
  _isSessionConfigured = YES;
  [self updateOutputConnections];
  [self updatePreviewConnection];
  return YES;
}

- (AVCaptureDevice *)cameraDeviceForPosition:(AVCaptureDevicePosition)position
{
  NSArray<AVCaptureDeviceType> *deviceTypes =
      _semanticMatteCapture && position == AVCaptureDevicePositionFront
          ? @[
              AVCaptureDeviceTypeBuiltInTrueDepthCamera,
              AVCaptureDeviceTypeBuiltInWideAngleCamera,
            ]
          : @[
              AVCaptureDeviceTypeBuiltInWideAngleCamera,
            ];
  AVCaptureDeviceDiscoverySession *discovery = [AVCaptureDeviceDiscoverySession
      discoverySessionWithDeviceTypes:deviceTypes
                            mediaType:AVMediaTypeVideo
                             position:position];
  return discovery.devices.firstObject;
}

- (void)startCameraStabilityMonitoringForDevice:(AVCaptureDevice *)device
{
  [self stopCameraStabilityMonitoring];
  _observedCameraDevice = device;
  _cameraStableSince = 0;
  _cameraAdjustingSince = 0;

  if (!device) {
    return;
  }

  NSArray<NSString *> *keyPaths = @[
    @"adjustingExposure",
    @"adjustingWhiteBalance",
    @"adjustingFocus",
  ];

  @try {
    for (NSString *keyPath in keyPaths) {
      [device addObserver:self
               forKeyPath:keyPath
                  options:NSKeyValueObservingOptionNew
                  context:AURARealtimeCameraStabilityContext];
    }
    _hasCameraStabilityObservers = YES;
  } @catch (__unused NSException *exception) {
    _hasCameraStabilityObservers = NO;
  }

  [self refreshCameraStableSinceForDevice:device];
}

- (void)stopCameraStabilityMonitoring
{
  if (!_observedCameraDevice || !_hasCameraStabilityObservers) {
    _observedCameraDevice = nil;
    _hasCameraStabilityObservers = NO;
    return;
  }

  NSArray<NSString *> *keyPaths = @[
    @"adjustingExposure",
    @"adjustingWhiteBalance",
    @"adjustingFocus",
  ];

  @try {
    for (NSString *keyPath in keyPaths) {
      [_observedCameraDevice removeObserver:self
                                 forKeyPath:keyPath
                                    context:AURARealtimeCameraStabilityContext];
    }
  } @catch (__unused NSException *exception) {
  }

  _observedCameraDevice = nil;
  _hasCameraStabilityObservers = NO;
}

- (BOOL)isCameraDeviceAdjusting:(AVCaptureDevice *)device
{
  if (!device) {
    return YES;
  }

  BOOL focusAdjusting =
      [device isFocusModeSupported:AVCaptureFocusModeContinuousAutoFocus] && device.isAdjustingFocus;

  return device.isAdjustingExposure || device.isAdjustingWhiteBalance || focusAdjusting;
}

- (void)refreshCameraStableSinceForDevice:(AVCaptureDevice *)device
{
  CFTimeInterval now = CACurrentMediaTime();

  if ([self isCameraDeviceAdjusting:device]) {
    if (_cameraAdjustingSince <= 0) {
      _cameraAdjustingSince = now;
    }
    if ((now - _cameraAdjustingSince) * 1000.0 >= AURARealtimeCameraAdjustingGraceMs) {
      _cameraStableSince = 0;
    }
    return;
  }

  _cameraAdjustingSince = 0;

  if (_cameraStableSince <= 0) {
    _cameraStableSince = now;
  }
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context
{
  if (context == AURARealtimeCameraStabilityContext) {
    [self refreshCameraStableSinceForDevice:(AVCaptureDevice *)object];
    return;
  }

  [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
}

- (NSDictionary *)cameraStabilityPayload
{
  AVCaptureDevice *device = _videoInput.device;
  [self refreshCameraStableSinceForDevice:device];

  BOOL adjustingExposure = device ? device.isAdjustingExposure : YES;
  BOOL adjustingWhiteBalance = device ? device.isAdjustingWhiteBalance : YES;
  BOOL focusSupported =
      device ? [device isFocusModeSupported:AVCaptureFocusModeContinuousAutoFocus] : NO;
  BOOL adjustingFocus = device && focusSupported ? device.isAdjustingFocus : NO;
  CFTimeInterval stableDurationMs =
      _cameraStableSince > 0 ? (CACurrentMediaTime() - _cameraStableSince) * 1000.0 : 0.0;
  AVCaptureWhiteBalanceGains gains = device ? device.deviceWhiteBalanceGains
                                            : (AVCaptureWhiteBalanceGains){0, 0, 0};

  return @{
    @"status": device ? @"ok" : @"camera_unavailable",
    @"adjustingExposure": @(adjustingExposure),
    @"adjustingWhiteBalance": @(adjustingWhiteBalance),
    @"adjustingFocus": @(adjustingFocus),
    @"focusSupported": @(focusSupported),
    @"isStable": @(stableDurationMs >= AURARealtimeCameraStableThresholdMs),
    @"stableDurationMs": @(stableDurationMs),
    @"stableThresholdMs": @(AURARealtimeCameraStableThresholdMs),
    @"iso": @(device ? device.ISO : 0),
    @"exposureDurationMs": @(device ? CMTimeGetSeconds(device.exposureDuration) * 1000.0 : 0),
    @"lensPosition": @(device ? device.lensPosition : 0),
    @"whiteBalanceGains": @{
      @"red": @(gains.redGain),
      @"green": @(gains.greenGain),
      @"blue": @(gains.blueGain),
    },
  };
}

- (NSDictionary *)lockCameraForCaptureAndCreateMetadata
{
  AVCaptureDevice *device = _videoInput.device;
  NSMutableDictionary *metadata = [[self cameraStabilityPayload] mutableCopy];
  metadata[@"captureLockedAtMs"] = @([[NSDate date] timeIntervalSince1970] * 1000.0);

  if (!device) {
    metadata[@"lockError"] = @"camera_unavailable";
    metadata[@"exposureLocked"] = @NO;
    metadata[@"whiteBalanceLocked"] = @NO;
    metadata[@"focusLocked"] = @NO;
    return metadata;
  }

  NSError *lockError = nil;
  BOOL exposureLocked = NO;
  BOOL whiteBalanceLocked = NO;
  BOOL focusLocked = NO;

  if (![device lockForConfiguration:&lockError]) {
    metadata[@"lockError"] = lockError.localizedDescription ?: @"lock_failed";
    metadata[@"exposureLocked"] = @NO;
    metadata[@"whiteBalanceLocked"] = @NO;
    metadata[@"focusLocked"] = @NO;
    return metadata;
  }

  if ([device isExposureModeSupported:AVCaptureExposureModeLocked]) {
    device.exposureMode = AVCaptureExposureModeLocked;
    exposureLocked = YES;
  }
  if ([device isWhiteBalanceModeSupported:AVCaptureWhiteBalanceModeLocked]) {
    device.whiteBalanceMode = AVCaptureWhiteBalanceModeLocked;
    whiteBalanceLocked = YES;
  }
  if ([device isFocusModeSupported:AVCaptureFocusModeLocked]) {
    device.focusMode = AVCaptureFocusModeLocked;
    focusLocked = YES;
  }

  [device unlockForConfiguration];
  metadata[@"exposureLocked"] = @(exposureLocked);
  metadata[@"whiteBalanceLocked"] = @(whiteBalanceLocked);
  metadata[@"focusLocked"] = @(focusLocked);
  metadata[@"lockError"] = [NSNull null];
  return metadata;
}

- (void)restoreCameraAutoModes
{
  AVCaptureDevice *device = _videoInput.device;
  if (!device) {
    return;
  }

  NSError *lockError = nil;
  if (![device lockForConfiguration:&lockError]) {
    return;
  }

  if ([device isExposureModeSupported:AVCaptureExposureModeContinuousAutoExposure]) {
    device.exposureMode = AVCaptureExposureModeContinuousAutoExposure;
  }
  if ([device isWhiteBalanceModeSupported:AVCaptureWhiteBalanceModeContinuousAutoWhiteBalance]) {
    device.whiteBalanceMode = AVCaptureWhiteBalanceModeContinuousAutoWhiteBalance;
  }
  if ([device isFocusModeSupported:AVCaptureFocusModeContinuousAutoFocus]) {
    device.focusMode = AVCaptureFocusModeContinuousAutoFocus;
  }

  [device unlockForConfiguration];
  [self refreshCameraStableSinceForDevice:device];
}

- (void)updatePreviewConnection
{
  if (![NSThread isMainThread]) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self updatePreviewConnection];
    });
    return;
  }

  AVCaptureConnection *connection = _previewLayer.connection;
  if (!connection) {
    return;
  }

  if ([connection isVideoOrientationSupported]) {
    connection.videoOrientation = AVCaptureVideoOrientationPortrait;
  }
  if ([connection isVideoMirroringSupported]) {
    connection.automaticallyAdjustsVideoMirroring = NO;
    connection.videoMirrored = [self devicePosition] == AVCaptureDevicePositionFront;
  }
}

- (void)updateOutputConnections
{
  for (AVCaptureOutput *output in _session.outputs) {
    for (AVCaptureConnection *connection in output.connections) {
      if ([connection isVideoOrientationSupported]) {
        connection.videoOrientation = AVCaptureVideoOrientationPortrait;
      }
      if ([connection isVideoMirroringSupported]) {
        connection.automaticallyAdjustsVideoMirroring = NO;
        BOOL mirrorsPreviewOnly =
            [self devicePosition] == AVCaptureDevicePositionFront && output != _videoOutput;
        connection.videoMirrored = mirrorsPreviewOnly;
      }
    }
  }
}

- (CGSize)viewSizeForProjection
{
  if ([NSThread isMainThread]) {
    _latestViewSize = self.bounds.size;
  }

  return _latestViewSize;
}

- (void)emitCameraError:(NSString *)status
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.onLandmarksDetected) {
      self.onLandmarksDetected(@{
        @"status": status,
        @"faceCount": @0,
        @"sequence": @(self->_sequence++),
      });
    }
  });
}

#if AURA_HAS_MEDIAPIPE

- (MPPFaceLandmarker *)faceLandmarker
{
  if (_faceLandmarker || _faceLandmarkerInitError) {
    return _faceLandmarker;
  }

  NSString *modelPath = [NSBundle.mainBundle pathForResource:@"face_landmarker" ofType:@"task"];
  if (!modelPath) {
    _faceLandmarkerInitError = @"face_landmarker.task is missing from the app bundle.";
    return nil;
  }

  MPPBaseOptions *baseOptions = [MPPBaseOptions new];
  baseOptions.modelAssetPath = modelPath;
  MPPFaceLandmarkerOptions *options = [MPPFaceLandmarkerOptions new];
  options.baseOptions = baseOptions;
  options.runningMode = MPPRunningModeVideo;
  options.numFaces = 1;
  options.minFaceDetectionConfidence = 0.5;
  options.minFacePresenceConfidence = 0.5;
  options.minTrackingConfidence = 0.5;
  options.outputFacialTransformationMatrixes = YES;

  NSError *error = nil;
  _faceLandmarker = [[MPPFaceLandmarker alloc] initWithOptions:options error:&error];
  if (!_faceLandmarker || error) {
    _faceLandmarkerInitError =
        error.localizedDescription ?: @"MediaPipe FaceLandmarker initialization failed.";
  }

  return _faceLandmarker;
}

- (NSInteger)mediaPipeTimestampMsForSampleBuffer:(CMSampleBufferRef)sampleBuffer
{
  CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
  NSTimeInterval seconds = CMTIME_IS_VALID(presentationTime)
      ? CMTimeGetSeconds(presentationTime)
      : CACurrentMediaTime();
  NSInteger timestampMs = (NSInteger)llround(seconds * 1000.0);

  if (timestampMs <= _lastMediaPipeTimestampMs) {
    timestampMs = _lastMediaPipeTimestampMs + 1;
  }

  _lastMediaPipeTimestampMs = timestampMs;
  return timestampMs;
}

- (NSMutableDictionary *)mediaPipeLandmarksPayloadFromLandmarks:
    (NSArray<MPPNormalizedLandmark *> *)faceLandmarks
{
  NSMutableDictionary *landmarks = [NSMutableDictionary dictionary];
  NSDictionary *forehead =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 10));
  NSDictionary *noseBridge =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 168));
  NSDictionary *noseTip =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 1));
  NSDictionary *chin =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 152));
  NSDictionary *leftEye =
      AURARealtimeAverageMediaPipePoint(faceLandmarks, @[@33, @133]);
  NSDictionary *rightEye =
      AURARealtimeAverageMediaPipePoint(faceLandmarks, @[@362, @263]);
  NSDictionary *mouthLeft =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 61));
  NSDictionary *mouthRight =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 291));
  NSDictionary *upperLip =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 13));
  NSDictionary *lowerLip =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 14));

  if (forehead) {
    landmarks[@"forehead"] = forehead;
  }
  if (noseBridge) {
    landmarks[@"noseBridge"] = noseBridge;
  }
  if (noseTip) {
    landmarks[@"noseTip"] = noseTip;
  }
  if (chin) {
    landmarks[@"chin"] = chin;
  }
  if (leftEye) {
    landmarks[@"leftEye"] = leftEye;
  }
  if (rightEye) {
    landmarks[@"rightEye"] = rightEye;
  }
  if (mouthLeft) {
    landmarks[@"mouthLeft"] = mouthLeft;
  }
  if (mouthRight) {
    landmarks[@"mouthRight"] = mouthRight;
  }
  if (upperLip) {
    landmarks[@"upperLip"] = upperLip;
  }
  if (lowerLip) {
    landmarks[@"lowerLip"] = lowerLip;
  }

  return landmarks;
}

- (NSNumber *)mediaPipeFaceWidthRatioFromLandmarks:(NSDictionary *)landmarks
{
  NSDictionary *leftEye = landmarks[@"leftEye"];
  NSDictionary *rightEye = landmarks[@"rightEye"];
  NSDictionary *mouthLeft = landmarks[@"mouthLeft"];
  NSDictionary *mouthRight = landmarks[@"mouthRight"];

  if (leftEye && rightEye && mouthLeft && mouthRight) {
    CGFloat eyeWidth =
        fabs(AURARealtimeNumberFromPoint(rightEye, @"x") -
             AURARealtimeNumberFromPoint(leftEye, @"x"));
    CGFloat mouthWidth =
        fabs(AURARealtimeNumberFromPoint(mouthRight, @"x") -
             AURARealtimeNumberFromPoint(mouthLeft, @"x"));
    return @(fmax(eyeWidth * 2.35, mouthWidth * 2.15));
  }

  return nil;
}

#endif  // AURA_HAS_MEDIAPIPE

- (NSDictionary *)mediaPipePayloadForSampleBuffer:(CMSampleBufferRef)sampleBuffer
{
#if AURA_HAS_MEDIAPIPE
  MPPFaceLandmarker *landmarker = [self faceLandmarker];
  if (!landmarker) {
    return @{
      @"status": @"landmark_missing",
      @"error": _faceLandmarkerInitError ?: @"MediaPipe FaceLandmarker is unavailable.",
    };
  }

  NSError *imageError = nil;
  MPPImage *image =
      [[MPPImage alloc] initWithSampleBuffer:sampleBuffer
                                 orientation:AURARealtimeMediaPipeImageOrientation([self devicePosition])
                                       error:&imageError];
  if (!image || imageError) {
    return @{
      @"status": @"landmark_missing",
      @"error": imageError.localizedDescription ?: @"MediaPipe image conversion failed.",
    };
  }

  NSError *detectError = nil;
  MPPFaceLandmarkerResult *result =
      [landmarker detectVideoFrame:image
           timestampInMilliseconds:[self mediaPipeTimestampMsForSampleBuffer:sampleBuffer]
                              error:&detectError];
  if (!result || detectError) {
    return @{
      @"status": @"landmark_missing",
      @"error": detectError.localizedDescription ?: @"MediaPipe detection failed.",
    };
  }

  NSArray<MPPNormalizedLandmark *> *faceLandmarks = result.faceLandmarks.firstObject;
  if (faceLandmarks.count == 0) {
    return @{
      @"status": @"no_face",
      @"landmarkCount": @0,
    };
  }

  NSMutableDictionary *landmarks =
      [self mediaPipeLandmarksPayloadFromLandmarks:faceLandmarks];
  NSMutableDictionary *payload = [@{
    @"status": @"ok",
    @"landmarkCount": @(faceLandmarks.count),
    @"landmarks": landmarks,
  } mutableCopy];
  NSDictionary *matrixPose =
      AURARealtimePoseFromMatrix(result.facialTransformationMatrixes.firstObject);
  NSDictionary *pose = matrixPose ?: AURARealtimePoseFromGeometry(landmarks);
  NSNumber *faceWidthRatio = [self mediaPipeFaceWidthRatioFromLandmarks:landmarks];

  [payload addEntriesFromDictionary:pose];
  if (faceWidthRatio) {
    payload[@"faceWidthRatio"] = faceWidthRatio;
  }

  return payload;
#else
  // MediaPipe was removed from this build: realtime MediaPipe screen landmarks
  // are unavailable. Return a clean "unavailable" payload so the RN event
  // stream keeps flowing (Vision-based face detection still works) instead of
  // crashing or failing to compile.
  (void)sampleBuffer;
  return @{
    @"status": @"mediapipe_unavailable",
    @"error": @"MediaPipe was removed from this build.",
  };
#endif  // AURA_HAS_MEDIAPIPE
}

- (void)captureOutput:(AVCaptureOutput *)output
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
           fromConnection:(AVCaptureConnection *)connection
{
  CFTimeInterval now = CACurrentMediaTime();
  if (_isProcessingFrame || now - _lastFrameTimestamp < 0.08) {
    return;
  }

  _isProcessingFrame = YES;
  _lastFrameTimestamp = now;

  CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
  if (!imageBuffer) {
    _isProcessingFrame = NO;
    return;
  }

  CGSize imageSize = CGSizeMake(
      CVPixelBufferGetWidth(imageBuffer),
      CVPixelBufferGetHeight(imageBuffer));
  NSDictionary *mediaPipePayload = [self mediaPipePayloadForSampleBuffer:sampleBuffer];
  NSDictionary *cameraStabilityPayload = [self cameraStabilityPayload];
  CGImagePropertyOrientation orientation = AURARealtimeVideoOrientation([self devicePosition]);
  VNDetectFaceLandmarksRequest *request = [[VNDetectFaceLandmarksRequest alloc] init];
  VNImageRequestHandler *handler =
      [[VNImageRequestHandler alloc] initWithCMSampleBuffer:sampleBuffer
                                                orientation:orientation
                                                    options:@{}];
  NSError *error = nil;
  BOOL success = [handler performRequests:@[request] error:&error];

  if (!success || error) {
    [self emitPayload:@{
      @"status": @"detection_failed",
      @"faceCount": @0,
      @"imageWidth": @(imageSize.width),
      @"imageHeight": @(imageSize.height),
      @"sequence": @(_sequence++),
      @"mediaPipe": mediaPipePayload,
      @"cameraStability": cameraStabilityPayload,
    }];
    _isProcessingFrame = NO;
    return;
  }

  NSArray<VNFaceObservation *> *faces = request.results ?: @[];
  VNFaceObservation *primaryFace = AURARealtimeLargestFace(faces);
  // 좌표 프레임 자가판정 (raw 눈선 축 + 프로브 방향, hysteresis 포함).
  const AURARealtimeFrameRotation frameRotation =
      [self resolveFrameRotationForFace:primaryFace imageSize:imageSize];
  NSMutableDictionary *payload =
      [[self payloadForFaces:faces imageSize:imageSize rotation:frameRotation] mutableCopy];

  // 진단: 스크린샷/로그만으로 좌표 규약 문제를 원격 판독할 수 있게 방출.
  payload[@"frameRotation"] = AURARealtimeFrameRotationName(frameRotation);
  payload[@"frameRotationDetected"] = AURARealtimeFrameRotationName(_diagDetectedRotation);
  payload[@"frameRotationLocked"] = @(_hasLockedFrameRotation);
  if (_diagHasEyeAxis) {
    payload[@"eyeAxisRatio"] = @(_diagEyeAxisRatio);
    payload[@"eyeAxis"] = _diagEyeAxisRatio >= 1.0 ? @"horizontal" : @"vertical";
  }

#if AURA_HAS_MEDIAPIPE
  // Real MediaPipe present: keep its screen-landmark payload (computed from the
  // sample buffer above) as the greenlight source.
  payload[@"mediaPipe"] = mediaPipePayload;
#else
  // MediaPipe removed from this build: the RN greenlight reads ONLY
  // payload.mediaPipe, so synthesize a MediaPipe-shaped payload from the same
  // Vision face the top-level landmarks came from. status='ok' + centerline
  // landmarks (forehead/noseBridge/noseTip/chin) + yaw/roll/pitch +
  // faceWidthRatio let finalCaptureGreenlight pass when the face is framed.
  (void)mediaPipePayload;
  BOOL isFrontCamera = [self devicePosition] == AVCaptureDevicePositionFront;
  payload[@"mediaPipe"] = primaryFace
      ? AURARealtimeMediaPipePayloadFromVisionFace(primaryFace, imageSize, isFrontCamera, frameRotation)
      : @{@"status": @"no_face", @"landmarkCount": @0};
#endif  // AURA_HAS_MEDIAPIPE

  payload[@"cameraStability"] = cameraStabilityPayload;
  [self emitPayload:payload];
  _isProcessingFrame = NO;
}

// 프레임 회전 자가판정 + hysteresis. vision 큐에서만 호출.
//
// raw(무회전) 프레임의 눈 센트로이드 2점과 프로브(코 센트로이드, 없으면 입꼬리
// 중점)로 AURARealtimeDetectFrameRotation 을 돌린다. 첫 유효 판정으로 잠그고,
// 연속 kAURARealtimeRotationSwitchStreak 프레임 동안 다른 값이 나와야 전환.
// Unknown/얼굴 없음 프레임은 잠긴 값 유지(없으면 Upright=종전 동작 폴백).
// 킬스위치 kAURARealtimeRotationDetectionEnabled=NO 면 항상 Upright.
- (AURARealtimeFrameRotation)resolveFrameRotationForFace:(VNFaceObservation *)face
                                               imageSize:(CGSize)imageSize
{
  _diagDetectedRotation = AURARealtimeFrameRotationUnknown;
  _diagHasEyeAxis = NO;

  if (!kAURARealtimeRotationDetectionEnabled) {
    return AURARealtimeFrameRotationUpright;
  }

  if (face && face.landmarks) {
    NSDictionary *leftEye = AURARealtimeCentroidFromRegion(
        face.landmarks.leftEye, imageSize, AURARealtimeFrameRotationUpright);
    NSDictionary *rightEye = AURARealtimeCentroidFromRegion(
        face.landmarks.rightEye, imageSize, AURARealtimeFrameRotationUpright);
    NSDictionary *probe = AURARealtimeCentroidFromRegion(
        face.landmarks.nose, imageSize, AURARealtimeFrameRotationUpright);
    if (!probe) {
      VNFaceLandmarkRegion2D *lips = face.landmarks.outerLips ?: face.landmarks.innerLips;
      probe = AURARealtimeCentroidFromRegion(
          lips, imageSize, AURARealtimeFrameRotationUpright);
    }

    if (leftEye && rightEye) {
      const CGPoint l = CGPointMake(AURARealtimeNumberFromPoint(leftEye, @"x"),
                                    AURARealtimeNumberFromPoint(leftEye, @"y"));
      const CGPoint r = CGPointMake(AURARealtimeNumberFromPoint(rightEye, @"x"),
                                    AURARealtimeNumberFromPoint(rightEye, @"y"));
      const CGFloat rawDx = fabs(r.x - l.x);
      const CGFloat rawDy = fabs(r.y - l.y);
      if (rawDx > 1e-6 || rawDy > 1e-6) {
        _diagEyeAxisRatio = rawDx / fmax(rawDy, 1e-6);
        _diagHasEyeAxis = YES;
      }

      const CGPoint probePoint = probe
          ? CGPointMake(AURARealtimeNumberFromPoint(probe, @"x"),
                        AURARealtimeNumberFromPoint(probe, @"y"))
          : CGPointZero;
      _diagDetectedRotation =
          AURARealtimeDetectFrameRotation(l, r, probePoint, probe != nil);
    }
  }

  // 원시 판정(_diagDetectedRotation)은 진단용으로 보존한다. 적용 결정은 local
  // 사본에 F8 게이트를 적용한 값으로 한다 — 로그의 frameRotationDetected(원시)와
  // frameRotation(적용)이 다르면 게이트가 억제했음을 원격 판독할 수 있다.
  AURARealtimeFrameRotation detected = _diagDetectedRotation;

  // ── F8 게이트: 비-upright 회전은 머리가 똑바를 때만 신뢰 ──
  // 세로 눈선은 프레임 90° 회전과 고개 90° 기울임을 구분 못 한다(눈선 하나로는
  // 불가). Vision 이 독립 추정한 head roll 이 작을 때만 프레임 회전으로 확정하고,
  // 크거나(고개 기울임) 없으면 Unknown 으로 강등해 잠긴 값을 유지한다.
  // (한계: 방향 힌트가 실제와 어긋난 극단 케이스는 여전히 애매 — 사후 pose
  //  게이트가 최종 방어선이라 잘못된 분석 결과로는 이어지지 않는다.)
  if (detected != AURARealtimeFrameRotationUpright &&
      detected != AURARealtimeFrameRotationUnknown) {
    BOOL isFront = [self devicePosition] == AVCaptureDevicePositionFront;
    NSDictionary *visionPose = AURARealtimePoseFromVisionObservation(face, isFront);
    double headRollAbs =
        visionPose ? fabs([visionPose[@"rollDeg"] doubleValue]) : INFINITY;
    if (!visionPose || headRollAbs > kAURARealtimeMaxHeadRollForFrameRotationDeg) {
      detected = AURARealtimeFrameRotationUnknown;
    }
  }

  if (detected == AURARealtimeFrameRotationUnknown) {
    return _hasLockedFrameRotation ? _lockedFrameRotation
                                   : AURARealtimeFrameRotationUpright;
  }

  if (!_hasLockedFrameRotation) {
    _lockedFrameRotation = detected;
    _hasLockedFrameRotation = YES;
    _pendingFrameRotation = detected;
    _rotationDisagreeStreak = 0;
    return _lockedFrameRotation;
  }

  if (detected == _lockedFrameRotation) {
    _pendingFrameRotation = detected;
    _rotationDisagreeStreak = 0;
    return _lockedFrameRotation;
  }

  // detected != locked: "동일 후보"가 연속으로 쌓일 때만 전환한다. 다른 후보가
  // 오면 누적을 처음부터 다시 시작 — 서로 다른 값의 불일치가 섞여 누적돼 한 번만
  // 나온 값으로 잘못 전환되던 플래핑 버그(코덱스 F-hysteresis)를 막는다.
  if (detected == _pendingFrameRotation) {
    _rotationDisagreeStreak += 1;
  } else {
    _pendingFrameRotation = detected;
    _rotationDisagreeStreak = 1;
  }

  if (_rotationDisagreeStreak >= kAURARealtimeRotationSwitchStreak) {
    NSLog(@"[aura:face-capture] frame-rotation:switch %@ -> %@ (streak %ld)",
          AURARealtimeFrameRotationName(_lockedFrameRotation),
          AURARealtimeFrameRotationName(detected),
          (long)_rotationDisagreeStreak);
    _lockedFrameRotation = detected;
    _rotationDisagreeStreak = 0;
  }

  return _lockedFrameRotation;
}

- (NSDictionary *)payloadForFaces:(NSArray<VNFaceObservation *> *)faces
                        imageSize:(CGSize)imageSize
                         rotation:(AURARealtimeFrameRotation)rotation
{
  VNFaceObservation *face = AURARealtimeLargestFace(faces);
  NSMutableDictionary *payload = [@{
    @"status": face ? @"ok" : @"no_face",
    @"faceCount": @(faces.count),
    @"imageWidth": @(imageSize.width),
    @"imageHeight": @(imageSize.height),
    @"sequence": @(_sequence++),
  } mutableCopy];

  if (!face) {
    return payload;
  }

  NSDictionary *bounds = AURARealtimeBoundsFromObservation(face, rotation);
  NSMutableDictionary *landmarks = AURARealtimeLandmarksFromFace(face, imageSize, rotation);
  if (face.landmarks == nil || landmarks.count == 0) {
    payload[@"status"] = @"no_landmarks";
  }

  payload[@"bounds"] = bounds;
  payload[@"confidence"] = @(face.confidence);
  payload[@"landmarks"] = landmarks;
  return payload;
}

- (void)attachScreenLandmarksToPayload:(NSMutableDictionary *)payload
{
  NSDictionary *landmarks = payload[@"landmarks"];
  NSDictionary *screenLandmarks = nil;
  CFTimeInterval now = CACurrentMediaTime();

  if ([landmarks isKindOfClass:[NSDictionary class]]) {
    screenLandmarks = [self screenLandmarksFromLandmarks:landmarks];
  }

  if (screenLandmarks.count > 0) {
    payload[@"screenLandmarks"] = screenLandmarks;
    _lastScreenLandmarks = [screenLandmarks copy];
    _lastScreenLandmarksTimestamp = now;
    return;
  }

  if (_lastScreenLandmarks && now - _lastScreenLandmarksTimestamp <= 0.45) {
    payload[@"screenLandmarks"] = _lastScreenLandmarks;
    return;
  }

  [payload removeObjectForKey:@"screenLandmarks"];
}

- (NSDictionary *)screenLandmarksFromLandmarks:(NSDictionary *)landmarks
{
  NSMutableDictionary *screenLandmarks = [NSMutableDictionary dictionary];
  NSDictionary *forehead = landmarks[@"forehead"];
  NSDictionary *chin = landmarks[@"chin"];

  if (forehead) {
    NSDictionary *foreheadPoint = [self screenPointFromNormalizedPoint:forehead];
    if (foreheadPoint) {
      screenLandmarks[@"forehead"] = foreheadPoint;
    }
  }
  if (chin) {
    NSDictionary *chinPoint = [self screenPointFromNormalizedPoint:chin];
    if (chinPoint) {
      screenLandmarks[@"chin"] = chinPoint;
    }
  }

  return screenLandmarks;
}

- (void)attachMediaPipeScreenLandmarksToPayload:(NSMutableDictionary *)payload
{
  NSDictionary *mediaPipe = payload[@"mediaPipe"];
  if (![mediaPipe isKindOfClass:[NSDictionary class]]) {
    return;
  }

  NSDictionary *landmarks = mediaPipe[@"landmarks"];
  if (![landmarks isKindOfClass:[NSDictionary class]]) {
    return;
  }

  NSArray<NSString *> *screenPointKeys = @[
    @"forehead",
    @"noseBridge",
    @"noseTip",
    @"chin",
    @"leftEye",
    @"rightEye",
    @"mouthLeft",
    @"mouthRight",
  ];
  NSMutableDictionary *screenLandmarks = [NSMutableDictionary dictionary];

  for (NSString *key in screenPointKeys) {
    NSDictionary *point = landmarks[key];
    NSDictionary *screenPoint = [self screenPointFromNormalizedPoint:point];
    if (screenPoint) {
      screenLandmarks[key] = screenPoint;
    }
  }

  if (screenLandmarks.count == 0) {
    return;
  }

  NSMutableDictionary *nextMediaPipe = [mediaPipe mutableCopy];
  nextMediaPipe[@"screenLandmarks"] = screenLandmarks;

  // 투영 앵커 원격 계측: visionPose roll≈0 인데 이 값이 크면 정준→device→layer
  // 변환이 틀렸다는 증거다 (자동 보정에는 쓰지 않고 계측만 — fail-safe 원칙).
  NSDictionary *leftEyeScreen = screenLandmarks[@"leftEye"];
  NSDictionary *rightEyeScreen = screenLandmarks[@"rightEye"];
  if (leftEyeScreen && rightEyeScreen) {
    const CGFloat tilt = AURARealtimeScreenEyeLineTilt(
        CGPointMake([leftEyeScreen[@"left"] doubleValue],
                    [leftEyeScreen[@"top"] doubleValue]),
        CGPointMake([rightEyeScreen[@"left"] doubleValue],
                    [rightEyeScreen[@"top"] doubleValue]));
    nextMediaPipe[@"projectionEyeTilt"] = @(tilt);
  }

  payload[@"mediaPipe"] = nextMediaPipe;
}

- (CGPoint)captureDevicePointFromCanonicalPoint:(NSDictionary *)point
{
  CGFloat x = AURARealtimeClamp([point[@"x"] doubleValue]);
  CGFloat y = AURARealtimeClamp([point[@"y"] doubleValue]);

  // 입력 계약: 정준(canonical upright portrait, unmirrored) 정규화 점 —
  // 랜드마크 생산 전 구간이 프레임 회전 자가판정으로 정준화되므로 이 계약이
  // 구조적으로 성립한다(AURARealtimeGeometry.h). (y,x) 스왑 앵커로
  // capture-device 좌표를 만들고, videoGravity·crop·전면 미러는
  // pointForCaptureDevicePointOfInterest(preview connection)가 소유한다.
  // 이 앵커의 유효성은 mediaPipe.projectionEyeTilt 로그로 원격 계측된다.
  const CGPoint device = AURARealtimeCaptureDevicePointFromCanonical(
      CGPointMake(x, y), [self devicePosition] == AVCaptureDevicePositionFront);
  return device;
}

- (NSDictionary *)screenPointFromNormalizedPoint:(NSDictionary *)point
{
  if (![NSThread isMainThread] || CGRectIsEmpty(_previewLayer.bounds)) {
    return nil;
  }

  // AVCaptureVideoPreviewLayer owns front-camera mirror, videoGravity
  // resizeAspectFill, and crop. Let it convert into the exact rendered layer
  // point instead of duplicating those transforms by hand.
  CGPoint layerPoint =
      [_previewLayer pointForCaptureDevicePointOfInterest:
          [self captureDevicePointFromCanonicalPoint:point]];

  return AURARealtimeScreenPoint(layerPoint.x, layerPoint.y);
}

- (void)emitPayload:(NSDictionary *)payload
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSMutableDictionary *payloadWithScreenPoints = [payload mutableCopy];
    [self attachScreenLandmarksToPayload:payloadWithScreenPoints];
    [self attachMediaPipeScreenLandmarksToPayload:payloadWithScreenPoints];

    if (self.onLandmarksDetected) {
      self.onLandmarksDetected(payloadWithScreenPoints);
    }
  });
}

- (void)captureWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_sessionQueue, ^{
    if (!self->_photoOutput || !self->_isSessionRunning) {
      reject(@"REALTIME_CAMERA_UNAVAILABLE", @"Realtime face camera is not running.", nil);
      return;
    }

    if (self->_hasPendingCapture) {
      reject(@"REALTIME_CAMERA_BUSY", @"Realtime face camera is already capturing.", nil);
      return;
    }

    self->_hasPendingCapture = YES;
    self->_pendingCaptureIsFallback = NO;
    NSUInteger captureGeneration = ++self->_captureGeneration;
    self->_captureResolve = resolve;
    self->_captureReject = reject;
    self->_pendingCaptureCameraMetadata = [self lockCameraForCaptureAndCreateMetadata];

    [self updateOutputConnections];
    NSArray<AVSemanticSegmentationMatteType> *enabledMatteTypes =
        self->_semanticMatteCapture
            ? (self->_photoOutput.enabledSemanticSegmentationMatteTypes ?: @[])
            : @[];
    BOOL requestsSemanticMattes = enabledMatteTypes.count > 0;
    BOOL supportsHeic =
        [self->_photoOutput.availablePhotoCodecTypes containsObject:AVVideoCodecTypeHEVC];
    BOOL useHeic = requestsSemanticMattes && self->_semanticMatteRequiresHeic && supportsHeic;
    AVCapturePhotoSettings *settings = useHeic
        ? [AVCapturePhotoSettings photoSettingsWithFormat:@{AVVideoCodecKey: AVVideoCodecTypeHEVC}]
        : [AVCapturePhotoSettings photoSettings];
    settings.flashMode = AVCaptureFlashModeOff;
    self->_pendingCaptureFormat = useHeic ? @"heic" : @"jpg";
    self->_pendingSemanticMattes =
        AURARealtimeSemanticMatteAvailability(requestsSemanticMattes, NO, NO);

    if (requestsSemanticMattes) {
      settings.enabledSemanticSegmentationMatteTypes = enabledMatteTypes;
      settings.embedsSemanticSegmentationMattesInPhoto = YES;
      // SSM은 depth/portrait 처리 파이프라인에서 생성되므로 per-photo depth delivery가
      // 꺼져 있으면 matte가 조용히 생략된다(AVCam 샘플과 동일한 gating). depth 자체는
      // 파일에 임베드하지 않아 용량 증가를 피한다.
      if (self->_photoOutput.isDepthDataDeliveryEnabled) {
        settings.depthDataDeliveryEnabled = YES;
        settings.embedsDepthDataInPhoto = NO;
      }
      NSLog(@"[aura:face-capture] matte:capture-settings depthEnabled=%d embedsMattes=%d format=%@",
            settings.isDepthDataDeliveryEnabled,
            settings.embedsSemanticSegmentationMattesInPhoto,
            self->_pendingCaptureFormat);
    }

    [self->_photoOutput capturePhotoWithSettings:settings delegate:self];

    // Watchdog: the semantic-segmentation-matte (depth/portrait) capture
    // pipeline can silently stall on some device/format combinations, so the
    // photo delegate never fires and the JS `capture()` promise hangs forever —
    // the "camera frozen before report generation" bug. If this capture has not
    // completed after the timeout, restore the camera and reject so JS can
    // recover (retry / fall back to a plain photo) instead of freezing.
    dispatch_after(
        dispatch_time(DISPATCH_TIME_NOW, (int64_t)(7.0 * NSEC_PER_SEC)),
        self->_sessionQueue,
        ^{
          if (self->_hasPendingCapture &&
              self->_captureGeneration == captureGeneration) {
            [self failPendingCaptureWithTimeout];
          }
        });
  });
}

// Runs on _sessionQueue. On the FIRST stall, re-issue a plain (no matte / no
// depth) capture keeping the same promise — a basic photo almost never stalls,
// so the report still gets a usable frame instead of the camera freezing. Only
// if that fallback ALSO stalls do we restore the camera and reject so the JS
// layer is never stuck "uploading".
- (void)failPendingCaptureWithTimeout
{
  if (!_pendingCaptureIsFallback && _captureResolve && _photoOutput) {
    NSLog(@"[aura:face-capture] capture:timeout matte pipeline stalled; retrying without mattes");
    _pendingCaptureIsFallback = YES;
    _pendingSemanticMattes = AURARealtimeSemanticMatteAvailability(NO, NO, NO);
    _pendingCaptureFormat = @"jpg";
    NSUInteger captureGeneration = ++_captureGeneration;

    AVCapturePhotoSettings *settings = [AVCapturePhotoSettings photoSettings];
    settings.flashMode = AVCaptureFlashModeOff;
    [_photoOutput capturePhotoWithSettings:settings delegate:self];

    dispatch_after(
        dispatch_time(DISPATCH_TIME_NOW, (int64_t)(4.0 * NSEC_PER_SEC)),
        _sessionQueue,
        ^{
          if (self->_hasPendingCapture &&
              self->_captureGeneration == captureGeneration) {
            [self failPendingCaptureWithTimeout];
          }
        });
    return;
  }

  RCTPromiseRejectBlock reject = _captureReject;
  _captureResolve = nil;
  _captureReject = nil;
  _pendingCaptureCameraMetadata = nil;
  _pendingSemanticMattes = nil;
  _pendingCaptureFormat = nil;
  _pendingCaptureIsFallback = NO;
  _hasPendingCapture = NO;
  [self restoreCameraAutoModes];
  NSLog(@"[aura:face-capture] capture:timeout restored camera; rejecting stalled capture");
  if (reject) {
    reject(@"REALTIME_CAPTURE_TIMEOUT",
           @"Realtime face capture timed out (semantic matte pipeline stalled).",
           nil);
  }
}

- (void)captureOutput:(AVCapturePhotoOutput *)output
    didFinishProcessingPhoto:(AVCapturePhoto *)photo
                       error:(NSError *)error
{
  dispatch_async(_sessionQueue, ^{
    RCTPromiseResolveBlock resolve = self->_captureResolve;
    RCTPromiseRejectBlock reject = self->_captureReject;
    NSDictionary *cameraMetadata = self->_pendingCaptureCameraMetadata;
    NSDictionary *pendingSemanticMattes = self->_pendingSemanticMattes;
    NSString *pendingFormat = self->_pendingCaptureFormat ?: @"jpg";
    self->_captureResolve = nil;
    self->_captureReject = nil;
    self->_pendingCaptureCameraMetadata = nil;
    self->_pendingSemanticMattes = nil;
    self->_pendingCaptureFormat = nil;
    self->_hasPendingCapture = NO;
    [self restoreCameraAutoModes];

    if (!resolve || !reject) {
      return;
    }

    if (error) {
      reject(@"REALTIME_CAPTURE_FAILED", error.localizedDescription, error);
      return;
    }

    NSData *imageData = [photo fileDataRepresentation];
    if (!imageData) {
      reject(@"REALTIME_CAPTURE_EMPTY", @"Realtime face camera returned an empty image.", nil);
      return;
    }

    NSString *fileName =
        [NSString stringWithFormat:@"aura-face-%@.%@", NSUUID.UUID.UUIDString, pendingFormat];
    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:fileName];
    NSURL *url = [NSURL fileURLWithPath:path];
    NSError *writeError = nil;

    if (![imageData writeToURL:url options:NSDataWritingAtomic error:&writeError]) {
      reject(@"REALTIME_CAPTURE_WRITE_FAILED", writeError.localizedDescription, writeError);
      return;
    }

    BOOL requestedSemanticMattes = [pendingSemanticMattes[@"requested"] boolValue];
    BOOL deliveredHairMatte = NO;
    BOOL deliveredSkinMatte = NO;
    BOOL embeddedHairMatte = NO;
    BOOL embeddedSkinMatte = NO;

    if (requestedSemanticMattes) {
      deliveredHairMatte =
          [photo semanticSegmentationMatteForType:AVSemanticSegmentationMatteTypeHair] != nil;
      deliveredSkinMatte =
          [photo semanticSegmentationMatteForType:AVSemanticSegmentationMatteTypeSkin] != nil;
      NSDictionary *embeddedAvailability = AURARealtimeEmbeddedSemanticMatteAvailability(url);
      embeddedHairMatte = [embeddedAvailability[@"hair"] boolValue];
      embeddedSkinMatte = [embeddedAvailability[@"skin"] boolValue];

      NSLog(@"[aura:face-capture] matte:embedded hair=%d skin=%d deliveredHair=%d deliveredSkin=%d format=%@",
            embeddedHairMatte,
            embeddedSkinMatte,
            deliveredHairMatte,
            deliveredSkinMatte,
            pendingFormat);

      if (![pendingFormat isEqualToString:@"heic"] &&
          (deliveredHairMatte || deliveredSkinMatte) &&
          (!embeddedHairMatte || !embeddedSkinMatte)) {
        self->_semanticMatteRequiresHeic = YES;
        NSLog(@"[aura:face-capture] matte:heic-fallback-enabled reason=jpeg_roundtrip_failed");
      }
    }

    UIImage *image = [UIImage imageWithData:imageData];
    NSMutableDictionary *payload = [@{
      @"uri": url.absoluteString,
      @"width": @(image.size.width),
      @"height": @(image.size.height),
      @"format": pendingFormat,
      @"cameraMetadata": cameraMetadata ?: @{},
    } mutableCopy];

    if (self->_semanticMatteCapture || pendingSemanticMattes) {
      payload[@"semanticMattes"] = AURARealtimeSemanticMatteAvailability(
          requestedSemanticMattes,
          requestedSemanticMattes ? deliveredHairMatte : NO,
          requestedSemanticMattes ? deliveredSkinMatte : NO);
      if (self->_matteCapability) {
        payload[@"matteCapability"] = self->_matteCapability;
      }
    }

    resolve(payload);
  });
}

@end

@interface AURARealtimeFaceCaptureViewManager : RCTViewManager
@end

@implementation AURARealtimeFaceCaptureViewManager

RCT_EXPORT_MODULE(AURARealtimeFaceCaptureView)
RCT_EXPORT_VIEW_PROPERTY(facing, NSString)
RCT_EXPORT_VIEW_PROPERTY(onLandmarksDetected, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(semanticMatteCapture, BOOL)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (UIView *)view
{
  return [AURARealtimeFaceCaptureView new];
}

RCT_EXPORT_METHOD(capture:(nonnull NSNumber *)reactTag
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.bridge.uiManager addUIBlock:^(
      RCTUIManager *uiManager,
      NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *view = viewRegistry[reactTag];
    if (![view isKindOfClass:[AURARealtimeFaceCaptureView class]]) {
      reject(@"REALTIME_CAPTURE_VIEW_NOT_FOUND", @"Realtime face capture view was not found.", nil);
      return;
    }

    [(AURARealtimeFaceCaptureView *)view captureWithResolver:resolve rejecter:reject];
  }];
}

@end
