#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

#import "AURAFaceRatioHairline.h"

// AURAFaceRatioAnalyzer — 얼굴 세로 3분할(상/중/하안부) 키포인트 추출.
//
// 얼굴 검출은 하지 않는다. CocoaPods MediaPipe 는 Unity homuler MediaPipe 와 중복
// 크래시를 일으켜 제거됐고(020cb33), 랜드마크와 pose 는 Unity homuler(IMAGE 모드)가
// 검출해 options[@"landmarks"] 로 넘겨준다. homuler 는 MediaPipe 와 동일한 478점
// 메시라 기존 인덱스 상수(9/10/151/234/454/2/97/326/148/152/176/377/400)를 그대로 쓴다.

static CGFloat AURAFaceRatioClamp(CGFloat value)
{
  return fmax(0.0, fmin(1.0, value));
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

// Unity homuler 가 넘겨준 정규화 랜드마크를 인덱스 접근 가능한 배열로 채운다.
// 각 슬롯은 clamp 된 {x,y,z} 또는 NSNull. `i` 필드를 슬롯 번호로 쓰므로 전송 순서에
// 의존하지 않는다.
static NSArray *AURAFaceRatioLandmarksFromJS(NSArray *jsPoints)
{
  if (![jsPoints isKindOfClass:[NSArray class]] || jsPoints.count == 0) {
    return @[];
  }

  NSInteger maxIndex = -1;
  for (id entry in jsPoints) {
    if (![entry isKindOfClass:[NSDictionary class]]) {
      continue;
    }
    NSInteger index = [entry[@"i"] integerValue];
    if (index > maxIndex) {
      maxIndex = index;
    }
  }
  if (maxIndex < 0) {
    return @[];
  }

  NSMutableArray *slots = [NSMutableArray arrayWithCapacity:(NSUInteger)(maxIndex + 1)];
  for (NSInteger i = 0; i <= maxIndex; i++) {
    [slots addObject:[NSNull null]];
  }

  for (id entry in jsPoints) {
    if (![entry isKindOfClass:[NSDictionary class]]) {
      continue;
    }
    NSInteger index = [entry[@"i"] integerValue];
    if (index < 0 || index > maxIndex) {
      continue;
    }
    NSNumber *x = entry[@"x"];
    NSNumber *y = entry[@"y"];
    if (![x isKindOfClass:[NSNumber class]] || ![y isKindOfClass:[NSNumber class]]) {
      continue;
    }
    NSNumber *z = [entry[@"z"] isKindOfClass:[NSNumber class]] ? entry[@"z"] : @0;
    slots[(NSUInteger)index] = @{
      @"x": @(AURAFaceRatioClamp(x.doubleValue)),
      @"y": @(AURAFaceRatioClamp(y.doubleValue)),
      @"z": z,
    };
  }

  return slots;
}

static NSDictionary *AURAFaceRatioLandmarkAtIndex(NSArray *landmarks, NSUInteger index)
{
  if (index >= landmarks.count) {
    return nil;
  }
  id entry = landmarks[index];
  return [entry isKindOfClass:[NSDictionary class]] ? entry : nil;
}

// 슬롯은 이미 clamp 된 {x,y,z} 이므로 그대로 통과시킨다(호출부 형태 유지).
static NSDictionary *AURAFaceRatioPoint(NSDictionary *landmark)
{
  return landmark;
}

static NSDictionary *AURAFaceRatioAveragePoint(
    NSArray *landmarks,
    NSArray<NSNumber *> *indices)
{
  CGFloat sumX = 0.0;
  CGFloat sumY = 0.0;
  CGFloat sumZ = 0.0;
  NSUInteger count = 0;

  for (NSNumber *index in indices) {
    NSDictionary *landmark =
        AURAFaceRatioLandmarkAtIndex(landmarks, index.unsignedIntegerValue);

    if (!landmark) {
      continue;
    }

    sumX += [landmark[@"x"] doubleValue];
    sumY += [landmark[@"y"] doubleValue];
    sumZ += [landmark[@"z"] doubleValue];
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

// pose 는 homuler 의 facialTransformationMatrixes 에서 유도되어 도(degree) 단위로
// 넘어온다. poseSource 를 "matrix" 로 유지해 하위(roll 보정·quality gate) 의미를 보존한다.
static NSDictionary *AURAFaceRatioPoseFromJS(NSDictionary *poseInput)
{
  if (![poseInput isKindOfClass:[NSDictionary class]]) {
    return nil;
  }

  NSNumber *pitch = poseInput[@"pitchDeg"];
  NSNumber *yaw = poseInput[@"yawDeg"];
  NSNumber *roll = poseInput[@"rollDeg"];
  if (![pitch isKindOfClass:[NSNumber class]] ||
      ![yaw isKindOfClass:[NSNumber class]] ||
      ![roll isKindOfClass:[NSNumber class]]) {
    return nil;
  }

  return @{
    @"pitchDeg": pitch,
    @"yawDeg": yaw,
    @"rollDeg": roll,
    @"poseSource": @"matrix",
  };
}

// 랜드마크 정규화 좌표는 upright 픽셀을 전제한다. 촬영 JPEG 은 EXIF 회전 플래그를
// 담고 있으므로, RN 이 파일을 렌더하는 방식과 좌표계를 맞추기 위해 픽셀에 방향을
// 구워 넣는다. Unity homuler 도 동일한 upright 프레임 기준으로 검출해야 한다.
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

@implementation AURAFaceRatioAnalyzer

RCT_EXPORT_MODULE();

- (dispatch_queue_t)methodQueue
{
  return dispatch_queue_create("com.aura.face-ratio-analyzer", DISPATCH_QUEUE_SERIAL);
}

RCT_EXPORT_METHOD(analyze:(NSString *)imageUri
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
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

  // 랜드마크·pose 는 Unity homuler(IMAGE 모드)가 검출해 넘겨준다.
  // 없으면 얼굴 검출 자체가 불가하므로 unsupported 로 알린다(호출측이 격리).
  NSDictionary *landmarkInput =
      [options isKindOfClass:[NSDictionary class]] ? options[@"landmarks"] : nil;
  if (![landmarkInput isKindOfClass:[NSDictionary class]]) {
    resolve(@{
      @"status": @"unsupported",
      @"faceCount": @0,
      @"error": @"Face landmarks were not provided (homuler landmark service unavailable).",
    });
    return;
  }

  NSArray *jsPoints = landmarkInput[@"points"];
  NSArray *faceLandmarks = AURAFaceRatioLandmarksFromJS(jsPoints);
  NSUInteger faceCount = faceLandmarks.count > 0 ? 1 : 0;

  NSMutableDictionary *payload = [@{
    @"status": faceCount > 0 ? @"ok" : @"no_face",
    @"faceCount": @(faceCount),
    @"imageWidth": @(uprightImage.size.width),
    @"imageHeight": @(uprightImage.size.height),
  } mutableCopy];

  if (faceCount > 0) {
    payload[@"landmarkCount"] =
        @([jsPoints isKindOfClass:[NSArray class]] ? jsPoints.count : 0);

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

    NSDictionary *pose = AURAFaceRatioPoseFromJS(landmarkInput[@"pose"]);
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
}

@end
