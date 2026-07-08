#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

#if __has_include(<MediaPipeTasksVision/MediaPipeTasksVision.h>)
#define AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE 1
#import <MediaPipeTasksVision/MediaPipeTasksVision.h>
#else
#define AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE 0
#endif

#import "AURAFaceRatioHairline.h"

static CGFloat AURAFaceRatioClamp(CGFloat value)
{
  return fmax(0.0, fmin(1.0, value));
}

static CGFloat AURAFaceRatioDegrees(CGFloat radians)
{
  return radians * 180.0 / M_PI;
}

static double AURAFaceRatioPointValue(NSDictionary *point, NSString *key)
{
  NSNumber *value = point[key];
  return [value respondsToSelector:@selector(doubleValue)] ? value.doubleValue : 0.0;
}

static BOOL AURAFaceRatioHairlineEnabled(NSDictionary *options)
{
  NSDictionary *hairlineOptions = options[@"hairline"];
  if (![hairlineOptions isKindOfClass:[NSDictionary class]]) {
    return YES;
  }

  NSNumber *enabled = hairlineOptions[@"enabled"];
  return [enabled respondsToSelector:@selector(boolValue)] ? enabled.boolValue : YES;
}

#if AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE
static NSDictionary *AURAFaceRatioPoint(MPPNormalizedLandmark *landmark)
{
  if (!landmark) {
    return nil;
  }

  return @{
    @"x": @(AURAFaceRatioClamp(landmark.x)),
    @"y": @(AURAFaceRatioClamp(landmark.y)),
    @"z": @(landmark.z),
  };
}

static MPPNormalizedLandmark *AURAFaceRatioLandmarkAtIndex(
    NSArray<MPPNormalizedLandmark *> *landmarks,
    NSUInteger index)
{
  return index < landmarks.count ? landmarks[index] : nil;
}

static NSDictionary *AURAFaceRatioAveragePoint(
    NSArray<MPPNormalizedLandmark *> *landmarks,
    NSArray<NSNumber *> *indices)
{
  CGFloat sumX = 0.0;
  CGFloat sumY = 0.0;
  CGFloat sumZ = 0.0;
  NSUInteger count = 0;

  for (NSNumber *index in indices) {
    MPPNormalizedLandmark *landmark =
        AURAFaceRatioLandmarkAtIndex(landmarks, index.unsignedIntegerValue);

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
    @"x": @(AURAFaceRatioClamp(sumX / count)),
    @"y": @(AURAFaceRatioClamp(sumY / count)),
    @"z": @(sumZ / count),
  };
}
#endif // AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE

static CGFloat AURAFaceRatioMedianValue(NSArray<NSNumber *> *values)
{
  NSArray<NSNumber *> *sorted =
      [values sortedArrayUsingSelector:@selector(compare:)];
  NSUInteger count = sorted.count;

  if (count == 0) {
    return 0.0;
  }

  if (count % 2 == 1) {
    return sorted[count / 2].doubleValue;
  }

  return (sorted[count / 2 - 1].doubleValue + sorted[count / 2].doubleValue) / 2.0;
}

static NSDictionary *AURAFaceRatioMedianPoint(NSArray<NSDictionary *> *points)
{
  NSMutableArray<NSNumber *> *xs = [NSMutableArray array];
  NSMutableArray<NSNumber *> *ys = [NSMutableArray array];
  NSMutableArray<NSNumber *> *zs = [NSMutableArray array];

  for (NSDictionary *point in points) {
    if (![point isKindOfClass:[NSDictionary class]]) {
      continue;
    }

    NSNumber *x = point[@"x"];
    NSNumber *y = point[@"y"];
    NSNumber *z = point[@"z"];

    if (![x respondsToSelector:@selector(doubleValue)] ||
        ![y respondsToSelector:@selector(doubleValue)]) {
      continue;
    }

    [xs addObject:x];
    [ys addObject:y];
    [zs addObject:z ?: @0];
  }

  if (xs.count == 0) {
    return nil;
  }

  return @{
    @"x": @(AURAFaceRatioClamp(AURAFaceRatioMedianValue(xs))),
    @"y": @(AURAFaceRatioClamp(AURAFaceRatioMedianValue(ys))),
    @"z": @(AURAFaceRatioMedianValue(zs)),
  };
}

static NSDictionary *AURAFaceRatioBottomContourPoint(
    NSArray *centerCandidates,
    NSArray *bottomCandidates)
{
  NSMutableArray<NSNumber *> *centerXs = [NSMutableArray array];
  NSMutableArray<NSNumber *> *centerZs = [NSMutableArray array];
  NSMutableArray<NSNumber *> *fallbackXs = [NSMutableArray array];
  NSMutableArray<NSNumber *> *fallbackZs = [NSMutableArray array];
  NSNumber *bottomY = nil;

  for (NSDictionary *point in centerCandidates) {
    if (![point isKindOfClass:[NSDictionary class]]) {
      continue;
    }

    NSNumber *x = point[@"x"];
    NSNumber *z = point[@"z"];

    if (![x respondsToSelector:@selector(doubleValue)]) {
      continue;
    }

    [centerXs addObject:x];
    [centerZs addObject:z ?: @0];
  }

  for (NSDictionary *point in bottomCandidates) {
    if (![point isKindOfClass:[NSDictionary class]]) {
      continue;
    }

    NSNumber *x = point[@"x"];
    NSNumber *y = point[@"y"];
    NSNumber *z = point[@"z"];

    if (![x respondsToSelector:@selector(doubleValue)] ||
        ![y respondsToSelector:@selector(doubleValue)]) {
      continue;
    }

    [fallbackXs addObject:x];
    [fallbackZs addObject:z ?: @0];

    if (!bottomY || y.doubleValue > bottomY.doubleValue) {
      bottomY = y;
    }
  }

  NSArray<NSNumber *> *xs = centerXs.count > 0 ? centerXs : fallbackXs;
  NSArray<NSNumber *> *zs = centerZs.count > 0 ? centerZs : fallbackZs;

  if (xs.count == 0 || !bottomY) {
    return nil;
  }

  return @{
    @"x": @(AURAFaceRatioClamp(AURAFaceRatioMedianValue(xs))),
    @"y": @(AURAFaceRatioClamp(bottomY.doubleValue)),
    @"z": @(AURAFaceRatioMedianValue(zs)),
  };
}

#if AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE
static NSDictionary *AURAFaceRatioPoseFromMatrix(MPPTransformMatrix *matrix)
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
    @"pitchDeg": @(AURAFaceRatioDegrees(pitch)),
    @"yawDeg": @(AURAFaceRatioDegrees(yaw)),
    @"rollDeg": @(AURAFaceRatioDegrees(roll)),
    @"poseSource": @"matrix",
  };
}
#endif // AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE

// MediaPipe normalized coordinates assume upright pixels. Captured JPEGs carry
// EXIF rotation flags, so bake the orientation into pixel data before
// detection to keep landmark coordinates aligned with how RN renders the file.
static UIImage *AURAFaceRatioUprightImage(UIImage *image)
{
  if (image.imageOrientation == UIImageOrientationUp) {
    return image;
  }

  UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat defaultFormat];
  format.scale = 1.0;
  UIGraphicsImageRenderer *renderer =
      [[UIGraphicsImageRenderer alloc] initWithSize:image.size format:format];

  return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    [image drawInRect:CGRectMake(0, 0, image.size.width, image.size.height)];
  }];
}

@interface AURAFaceRatioAnalyzer : NSObject <RCTBridgeModule>
@end

@implementation AURAFaceRatioAnalyzer {
#if AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE
  MPPFaceLandmarker *_faceLandmarker;
#endif
  NSString *_faceLandmarkerInitError;
}

RCT_EXPORT_MODULE();

- (dispatch_queue_t)methodQueue
{
  return dispatch_queue_create("com.aura.face-ratio-analyzer", DISPATCH_QUEUE_SERIAL);
}

#if AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE
- (MPPFaceLandmarker *)imageModeFaceLandmarker
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
  options.runningMode = MPPRunningModeImage;
  options.numFaces = 1;
  options.minFaceDetectionConfidence = 0.5;
  options.minFacePresenceConfidence = 0.5;
  options.outputFacialTransformationMatrixes = YES;

  NSError *error = nil;
  _faceLandmarker = [[MPPFaceLandmarker alloc] initWithOptions:options error:&error];
  if (!_faceLandmarker || error) {
    _faceLandmarkerInitError =
        error.localizedDescription ?: @"MediaPipe FaceLandmarker initialization failed.";
  }

  return _faceLandmarker;
}
#endif // AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE

RCT_EXPORT_METHOD(analyze:(NSString *)imageUri
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
#if AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE
  NSURL *url = [NSURL URLWithString:imageUri];
  NSString *path = url.isFileURL ? url.path : imageUri;
  NSURL *imageFileURL = url.isFileURL ? url : [NSURL fileURLWithPath:path];

  UIImage *image = [UIImage imageWithContentsOfFile:path];
  if (image == nil) {
    reject(@"FACE_RATIO_IMAGE_UNAVAILABLE",
           @"Unable to load image for face ratio analysis.",
           nil);
    return;
  }

  UIImage *uprightImage = AURAFaceRatioUprightImage(image);
  MPPFaceLandmarker *landmarker = [self imageModeFaceLandmarker];
  if (!landmarker) {
    reject(@"FACE_RATIO_MODEL_MISSING",
           self->_faceLandmarkerInitError ?: @"FaceLandmarker unavailable.",
           nil);
    return;
  }

  NSError *error = nil;
  MPPImage *mpImage = [[MPPImage alloc] initWithUIImage:uprightImage error:&error];
  if (!mpImage || error) {
    reject(@"FACE_RATIO_IMAGE_UNAVAILABLE",
           error.localizedDescription ?: @"Unable to wrap image for MediaPipe.",
           error);
    return;
  }

  MPPFaceLandmarkerResult *result = [landmarker detectImage:mpImage error:&error];
  if (!result || error) {
    reject(@"FACE_RATIO_DETECTION_FAILED",
           error.localizedDescription ?: @"MediaPipe face detection failed.",
           error);
    return;
  }

  NSUInteger faceCount = result.faceLandmarks.count;
  NSMutableDictionary *payload = [@{
    @"status": faceCount > 0 ? @"ok" : @"no_face",
    @"faceCount": @(faceCount),
    @"imageWidth": @(uprightImage.size.width),
    @"imageHeight": @(uprightImage.size.height),
  } mutableCopy];

  if (faceCount > 0) {
    NSArray<MPPNormalizedLandmark *> *faceLandmarks = result.faceLandmarks.firstObject;
    payload[@"landmarkCount"] = @(faceLandmarks.count);

    NSDictionary *idx9 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 9));
    NSDictionary *idx10 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 10));
    NSDictionary *idx151 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 151));
    NSDictionary *idx234 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 234));
    NSDictionary *idx454 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 454));
    NSDictionary *leftInnerBrow =
        AURAFaceRatioAveragePoint(faceLandmarks, @[@107, @55, @65]);
    NSDictionary *rightInnerBrow =
        AURAFaceRatioAveragePoint(faceLandmarks, @[@336, @285, @295]);
    NSDictionary *idx2 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 2));
    NSDictionary *idx97 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 97));
    NSDictionary *idx326 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 326));
    NSDictionary *idx148 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 148));
    NSDictionary *idx152 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 152));
    NSDictionary *idx176 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 176));
    NSDictionary *idx377 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 377));
    NSDictionary *idx400 =
        AURAFaceRatioPoint(AURAFaceRatioLandmarkAtIndex(faceLandmarks, 400));

    NSMutableArray<NSDictionary *> *glabellaCandidates = [NSMutableArray array];
    for (NSDictionary *candidate in @[
      idx9 ?: [NSNull null],
      idx151 ?: [NSNull null],
      leftInnerBrow ?: [NSNull null],
      rightInnerBrow ?: [NSNull null],
    ]) {
      if ([candidate isKindOfClass:[NSDictionary class]]) {
        [glabellaCandidates addObject:candidate];
      }
    }

    NSMutableArray<NSDictionary *> *subnasaleCandidates = [NSMutableArray array];
    for (NSDictionary *candidate in @[
      idx2 ?: [NSNull null],
      idx97 ?: [NSNull null],
      idx326 ?: [NSNull null],
    ]) {
      if ([candidate isKindOfClass:[NSDictionary class]]) {
        [subnasaleCandidates addObject:candidate];
      }
    }

    NSDictionary *hApprox = idx10;
    NSDictionary *glabella = AURAFaceRatioMedianPoint(glabellaCandidates);
    NSDictionary *subnasale = AURAFaceRatioMedianPoint(subnasaleCandidates);
    NSDictionary *menton = AURAFaceRatioBottomContourPoint(
        @[
          idx148 ?: [NSNull null],
          idx152 ?: [NSNull null],
          idx377 ?: [NSNull null],
        ],
        @[
          idx148 ?: [NSNull null],
          idx152 ?: [NSNull null],
          idx176 ?: [NSNull null],
          idx377 ?: [NSNull null],
          idx400 ?: [NSNull null],
        ]);

    NSMutableDictionary *keypoints = [NSMutableDictionary dictionary];
    if (hApprox) keypoints[@"hApprox"] = hApprox;
    if (glabella) keypoints[@"glabella"] = glabella;
    if (subnasale) keypoints[@"subnasale"] = subnasale;
    if (menton) keypoints[@"menton"] = menton;
    payload[@"keypoints"] = keypoints;

    NSMutableDictionary *debugPoints = [NSMutableDictionary dictionary];
    if (idx9) debugPoints[@"idx9"] = idx9;
    if (idx10) debugPoints[@"idx10"] = idx10;
    if (idx151) debugPoints[@"idx151"] = idx151;
    if (idx234) debugPoints[@"idx234"] = idx234;
    if (idx454) debugPoints[@"idx454"] = idx454;
    if (idx2) debugPoints[@"idx2"] = idx2;
    if (idx97) debugPoints[@"idx97"] = idx97;
    if (idx326) debugPoints[@"idx326"] = idx326;
    if (idx148) debugPoints[@"idx148"] = idx148;
    if (idx152) debugPoints[@"idx152"] = idx152;
    if (idx176) debugPoints[@"idx176"] = idx176;
    if (idx377) debugPoints[@"idx377"] = idx377;
    if (idx400) debugPoints[@"idx400"] = idx400;
    if (leftInnerBrow) debugPoints[@"leftInnerBrow"] = leftInnerBrow;
    if (rightInnerBrow) debugPoints[@"rightInnerBrow"] = rightInnerBrow;
    payload[@"debugPoints"] = debugPoints;

    NSDictionary *pose =
        AURAFaceRatioPoseFromMatrix(result.facialTransformationMatrixes.firstObject);
    payload[@"pose"] = pose ?: @{
      @"pitchDeg": @0,
      @"yawDeg": @0,
      @"rollDeg": @0,
      @"poseSource": @"unavailable",
    };

    NSDictionary *hairlineOptions =
        [options[@"hairline"] isKindOfClass:[NSDictionary class]]
            ? options[@"hairline"]
            : @{};
    if (AURAFaceRatioHairlineEnabled(options) &&
        idx234 &&
        idx454 &&
        idx10 &&
        glabella &&
        imageFileURL) {
      AURAFaceRatioHairlineLandmarks hairlineLandmarks = {
        .leftFaceX = AURAFaceRatioPointValue(idx234, @"x"),
        .leftFaceY = AURAFaceRatioPointValue(idx234, @"y"),
        .rightFaceX = AURAFaceRatioPointValue(idx454, @"x"),
        .rightFaceY = AURAFaceRatioPointValue(idx454, @"y"),
        .foreheadTopX = AURAFaceRatioPointValue(idx10, @"x"),
        .foreheadTopY = AURAFaceRatioPointValue(idx10, @"y"),
        .glabellaX = AURAFaceRatioPointValue(glabella, @"x"),
        .glabellaY = AURAFaceRatioPointValue(glabella, @"y"),
        .yawDeg = [payload[@"pose"][@"yawDeg"] respondsToSelector:@selector(doubleValue)]
            ? [payload[@"pose"][@"yawDeg"] doubleValue]
            : 0.0,
        .pitchDeg = [payload[@"pose"][@"pitchDeg"] respondsToSelector:@selector(doubleValue)]
            ? [payload[@"pose"][@"pitchDeg"] doubleValue]
            : 0.0,
        .rollDeg = [payload[@"pose"][@"rollDeg"] respondsToSelector:@selector(doubleValue)]
            ? [payload[@"pose"][@"rollDeg"] doubleValue]
            : 0.0,
      };
      NSDictionary *hairlineResult =
          AURAFaceRatioDetectHairline(imageFileURL, hairlineLandmarks, hairlineOptions);
      NSDictionary *matte = hairlineResult[@"matte"];
      NSDictionary *hairline = hairlineResult[@"hairline"];
      NSDictionary *debugArtifacts = hairlineResult[@"debugArtifacts"];
      NSString *failureReason = hairlineResult[@"failureReason"];

      if ([matte isKindOfClass:[NSDictionary class]]) {
        payload[@"matte"] = matte;
      }
      if ([hairline isKindOfClass:[NSDictionary class]]) {
        payload[@"hairline"] = hairline;
      }
      if ([debugArtifacts isKindOfClass:[NSDictionary class]]) {
        payload[@"debugArtifacts"] = debugArtifacts;
      }
      if ([failureReason isKindOfClass:[NSString class]]) {
        payload[@"hairlineFailureReason"] = failureReason;
      }

      NSLog(@"[aura:face-ratio] native hairline hair=%d skin=%d visible=%d confidence=%.2f candidates=%lu stdPx=%.1f reason=%@",
            [matte[@"hairAvailable"] boolValue],
            [matte[@"skinAvailable"] boolValue],
            [hairline[@"visible"] boolValue],
            [hairline[@"confidence"] doubleValue],
            (unsigned long)[hairline[@"candidateCount"] unsignedIntegerValue],
            [hairline[@"boundaryStdPx"] doubleValue],
            failureReason ?: @"none");
    }
  }

  NSLog(@"[aura:face-ratio] native analyze status=%@ faceCount=%lu keypoints=%@",
        payload[@"status"],
        (unsigned long)faceCount,
        payload[@"keypoints"]);

  resolve(payload);
#else
  // MediaPipe was removed from this build (the Unity MediaPipe plugin now
  // provides MediaPipe, and a duplicate CocoaPods dependency caused a crash).
  // Keep the exported interface intact but fail gracefully so the RN side gets
  // a clean, catchable error instead of a crash.
  (void)imageUri;
  (void)options;
  (void)resolve;
  reject(@"MEDIAPIPE_UNAVAILABLE",
         @"MediaPipe was removed from this build.",
         nil);
#endif // AURA_FACE_RATIO_MEDIAPIPE_AVAILABLE
}

@end
