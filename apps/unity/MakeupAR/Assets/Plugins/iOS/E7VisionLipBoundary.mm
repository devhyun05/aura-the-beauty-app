#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <Vision/Vision.h>
#include <stdlib.h>
#include <string.h>

static NSString *E7JsonEscape(NSString *value)
{
  if (value == nil) {
    return @"";
  }

  NSMutableString *escaped = [value mutableCopy];
  [escaped replaceOccurrencesOfString:@"\\" withString:@"\\\\" options:0 range:NSMakeRange(0, escaped.length)];
  [escaped replaceOccurrencesOfString:@"\"" withString:@"\\\"" options:0 range:NSMakeRange(0, escaped.length)];
  [escaped replaceOccurrencesOfString:@"\n" withString:@"\\n" options:0 range:NSMakeRange(0, escaped.length)];
  [escaped replaceOccurrencesOfString:@"\r" withString:@"\\r" options:0 range:NSMakeRange(0, escaped.length)];
  return escaped;
}

static char *E7CopyCString(NSString *json)
{
  const char *utf8 = [json UTF8String];
  if (utf8 == NULL) {
    utf8 = "";
  }

  size_t length = strlen(utf8);
  char *copy = (char *)malloc(length + 1);
  if (copy == NULL) {
    return NULL;
  }

  memcpy(copy, utf8, length);
  copy[length] = '\0';
  return copy;
}

static NSString *E7FailureJson(NSString *status, NSString *detail, int imageWidth, int imageHeight)
{
  return [NSString stringWithFormat:
    @"{\"status\":\"%@\",\"detail\":\"%@\",\"source\":\"apple_vision_runtime_lip_landmarks\",\"coordinateMode\":\"raw-y\",\"imageWidth\":%d,\"imageHeight\":%d,\"faceCount\":0,\"outerPointCount\":0,\"innerPointCount\":0,\"lipConfidence\":0,\"lipBounds\":{\"x\":0,\"y\":0,\"width\":0,\"height\":0},\"outer\":[],\"inner\":[]}",
    E7JsonEscape(status),
    E7JsonEscape(detail),
    imageWidth,
    imageHeight];
}

static NSString *E7PointArrayJson(VNFaceLandmarkRegion2D *landmark, CGSize imageSize)
{
  if (landmark == nil || landmark.pointCount == 0) {
    return @"[]";
  }

  const CGPoint *points = [landmark pointsInImageOfSize:imageSize];
  NSMutableArray<NSString *> *items = [NSMutableArray arrayWithCapacity:landmark.pointCount];
  for (NSUInteger index = 0; index < landmark.pointCount; index++) {
    CGPoint point = points[index];
    [items addObject:[NSString stringWithFormat:@"{\"x\":%.3f,\"y\":%.3f}", point.x, point.y]];
  }

  return [NSString stringWithFormat:@"[%@]", [items componentsJoinedByString:@","]];
}

static void E7ExpandLandmarkBounds(VNFaceLandmarkRegion2D *landmark, CGSize imageSize, CGRect *bounds)
{
  if (landmark == nil || landmark.pointCount == 0 || bounds == NULL) {
    return;
  }

  const CGPoint *points = [landmark pointsInImageOfSize:imageSize];
  for (NSUInteger index = 0; index < landmark.pointCount; index++) {
    CGPoint point = points[index];
    if (CGRectIsNull(*bounds)) {
      *bounds = CGRectMake(point.x, point.y, 0, 0);
      continue;
    }

    CGFloat minX = MIN(CGRectGetMinX(*bounds), point.x);
    CGFloat minY = MIN(CGRectGetMinY(*bounds), point.y);
    CGFloat maxX = MAX(CGRectGetMaxX(*bounds), point.x);
    CGFloat maxY = MAX(CGRectGetMaxY(*bounds), point.y);
    *bounds = CGRectMake(minX, minY, maxX - minX, maxY - minY);
  }
}

static NSString *E7HandPointArrayJson(
  NSDictionary<VNHumanHandPoseObservationJointName, VNRecognizedPoint *> *points,
  CGSize imageSize,
  CGFloat minimumConfidence,
  NSUInteger *includedPointCount,
  float *averageConfidence,
  CGRect *bounds)
{
  NSArray<VNHumanHandPoseObservationJointName> *orderedKeys = @[
    VNHumanHandPoseObservationJointNameWrist,
    VNHumanHandPoseObservationJointNameThumbCMC,
    VNHumanHandPoseObservationJointNameThumbMP,
    VNHumanHandPoseObservationJointNameThumbIP,
    VNHumanHandPoseObservationJointNameThumbTip,
    VNHumanHandPoseObservationJointNameIndexMCP,
    VNHumanHandPoseObservationJointNameIndexPIP,
    VNHumanHandPoseObservationJointNameIndexDIP,
    VNHumanHandPoseObservationJointNameIndexTip,
    VNHumanHandPoseObservationJointNameMiddleMCP,
    VNHumanHandPoseObservationJointNameMiddlePIP,
    VNHumanHandPoseObservationJointNameMiddleDIP,
    VNHumanHandPoseObservationJointNameMiddleTip,
    VNHumanHandPoseObservationJointNameRingMCP,
    VNHumanHandPoseObservationJointNameRingPIP,
    VNHumanHandPoseObservationJointNameRingDIP,
    VNHumanHandPoseObservationJointNameRingTip,
    VNHumanHandPoseObservationJointNameLittleMCP,
    VNHumanHandPoseObservationJointNameLittlePIP,
    VNHumanHandPoseObservationJointNameLittleDIP,
    VNHumanHandPoseObservationJointNameLittleTip
  ];
  NSArray<NSString *> *orderedNames = @[
    @"wrist",
    @"thumb_cmc",
    @"thumb_mcp",
    @"thumb_ip",
    @"thumb_tip",
    @"index_mcp",
    @"index_pip",
    @"index_dip",
    @"index_tip",
    @"middle_mcp",
    @"middle_pip",
    @"middle_dip",
    @"middle_tip",
    @"ring_mcp",
    @"ring_pip",
    @"ring_dip",
    @"ring_tip",
    @"little_mcp",
    @"little_pip",
    @"little_dip",
    @"little_tip"
  ];
  NSMutableArray<NSString *> *items = [NSMutableArray array];
  CGFloat minX = CGFLOAT_MAX;
  CGFloat minY = CGFLOAT_MAX;
  CGFloat maxX = -CGFLOAT_MAX;
  CGFloat maxY = -CGFLOAT_MAX;
  float confidenceSum = 0.0f;
  NSUInteger count = 0;

  for (NSUInteger index = 0; index < orderedKeys.count; index++) {
    VNHumanHandPoseObservationJointName key = orderedKeys[index];
    VNRecognizedPoint *point = points[key];
    if (point == nil || point.confidence < minimumConfidence) {
      continue;
    }

    CGFloat x = point.location.x * imageSize.width;
    CGFloat y = (1.0 - point.location.y) * imageSize.height;
    minX = MIN(minX, x);
    minY = MIN(minY, y);
    maxX = MAX(maxX, x);
    maxY = MAX(maxY, y);
    confidenceSum += point.confidence;
    count++;
    [items addObject:[NSString stringWithFormat:
      @"{\"index\":%lu,\"name\":\"%@\",\"x\":%.3f,\"y\":%.3f,\"confidence\":%.3f}",
      (unsigned long)index,
      orderedNames[index],
      x,
      y,
      point.confidence]];
  }

  if (includedPointCount != NULL) {
    *includedPointCount = count;
  }

  if (averageConfidence != NULL) {
    *averageConfidence = count > 0 ? confidenceSum / (float)count : 0.0f;
  }

  if (bounds != NULL) {
    *bounds = count > 0
      ? CGRectMake(minX, minY, MAX(0.0, maxX - minX), MAX(0.0, maxY - minY))
      : CGRectZero;
  }

  return [NSString stringWithFormat:@"[%@]", [items componentsJoinedByString:@","]];
}

static VNFaceObservation *E7LargestFace(NSArray<VNFaceObservation *> *faces)
{
  VNFaceObservation *largest = nil;
  CGFloat largestArea = 0.0;
  for (VNFaceObservation *face in faces) {
    CGFloat area = face.boundingBox.size.width * face.boundingBox.size.height;
    if (largest == nil || area > largestArea) {
      largest = face;
      largestArea = area;
    }
  }

  return largest;
}

extern "C" {

const char *E7VisionDetectLipBoundaryPng(
  const unsigned char *pngBytes,
  int byteCount,
  int imageWidth,
  int imageHeight)
{
  @autoreleasepool {
    if (pngBytes == NULL || byteCount <= 0) {
      return E7CopyCString(E7FailureJson(@"invalid_input", @"png_bytes_empty", imageWidth, imageHeight));
    }

    NSData *data = [NSData dataWithBytes:pngBytes length:(NSUInteger)byteCount];
    CGImageSourceRef imageSource = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
    if (imageSource == NULL) {
      return E7CopyCString(E7FailureJson(@"decode_failed", @"cg_image_source_null", imageWidth, imageHeight));
    }

    CGImageRef image = CGImageSourceCreateImageAtIndex(imageSource, 0, NULL);
    CFRelease(imageSource);
    if (image == NULL) {
      return E7CopyCString(E7FailureJson(@"decode_failed", @"cg_image_null", imageWidth, imageHeight));
    }

    int width = (int)CGImageGetWidth(image);
    int height = (int)CGImageGetHeight(image);
    VNDetectFaceLandmarksRequest *request = [[VNDetectFaceLandmarksRequest alloc] init];
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image
                                                                        orientation:kCGImagePropertyOrientationUp
                                                                            options:@{}];
    NSError *error = nil;
    BOOL performed = [handler performRequests:@[request] error:&error];
    CGImageRelease(image);

    if (!performed || error != nil) {
      NSString *detail = error != nil ? error.localizedDescription : @"perform_request_failed";
      return E7CopyCString(E7FailureJson(@"vision_request_failed", detail, width, height));
    }

    NSArray<VNFaceObservation *> *faces = request.results;
    VNFaceObservation *face = E7LargestFace(faces);
    if (face == nil) {
      return E7CopyCString(E7FailureJson(@"no_face", @"no_face_observation", width, height));
    }

    VNFaceLandmarks2D *landmarks = face.landmarks;
    VNFaceLandmarkRegion2D *outerLips = landmarks.outerLips;
    VNFaceLandmarkRegion2D *innerLips = landmarks.innerLips;
    if (outerLips == nil || innerLips == nil || outerLips.pointCount < 3 || innerLips.pointCount < 3) {
      return E7CopyCString(E7FailureJson(@"lip_landmarks_missing", @"outer_or_inner_lips_missing", width, height));
    }

    CGSize imageSize = CGSizeMake(width, height);
    NSString *outerJson = E7PointArrayJson(outerLips, imageSize);
    NSString *innerJson = E7PointArrayJson(innerLips, imageSize);
    CGRect lipBounds = CGRectNull;
    E7ExpandLandmarkBounds(outerLips, imageSize, &lipBounds);
    E7ExpandLandmarkBounds(innerLips, imageSize, &lipBounds);
    if (CGRectIsNull(lipBounds)) {
      lipBounds = CGRectZero;
    }

    NSString *json = [NSString stringWithFormat:
      @"{\"status\":\"ok\",\"detail\":\"outerLips_innerLips\",\"source\":\"apple_vision_runtime_lip_landmarks\",\"coordinateMode\":\"raw-y\",\"imageWidth\":%d,\"imageHeight\":%d,\"faceCount\":%lu,\"outerPointCount\":%lu,\"innerPointCount\":%lu,\"lipConfidence\":%.3f,\"lipBounds\":{\"x\":%.3f,\"y\":%.3f,\"width\":%.3f,\"height\":%.3f},\"outer\":%@,\"inner\":%@}",
      width,
      height,
      (unsigned long)faces.count,
      (unsigned long)outerLips.pointCount,
      (unsigned long)innerLips.pointCount,
      face.confidence,
      lipBounds.origin.x,
      lipBounds.origin.y,
      lipBounds.size.width,
      lipBounds.size.height,
      outerJson,
      innerJson];
    return E7CopyCString(json);
  }
}

void E7VisionReleaseCString(const char *pointer)
{
  if (pointer != NULL) {
    free((void *)pointer);
  }
}

const char *E7VisionDetectHandPoseRgba(
  const unsigned char *rgbaBytes,
  int byteCount,
  int imageWidth,
  int imageHeight)
{
  @autoreleasepool {
    if (rgbaBytes == NULL || byteCount <= 0 || imageWidth <= 0 || imageHeight <= 0) {
      return E7CopyCString(
        @"{\"status\":\"invalid_input\",\"handDetected\":false,\"detail\":\"rgba_input_empty\",\"pointCount\":0,\"confidence\":0,\"points\":[]}");
    }

    size_t expectedByteCount = (size_t)imageWidth * (size_t)imageHeight * 4;
    if ((size_t)byteCount < expectedByteCount) {
      return E7CopyCString([NSString stringWithFormat:
        @"{\"status\":\"invalid_input\",\"handDetected\":false,\"detail\":\"rgba_input_too_small\",\"imageWidth\":%d,\"imageHeight\":%d,\"pointCount\":0,\"confidence\":0,\"points\":[]}",
        imageWidth,
        imageHeight]);
    }

    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGDataProviderRef provider = CGDataProviderCreateWithData(
      NULL,
      rgbaBytes,
      expectedByteCount,
      NULL);
    if (colorSpace == NULL || provider == NULL) {
      if (colorSpace != NULL) {
        CGColorSpaceRelease(colorSpace);
      }
      if (provider != NULL) {
        CGDataProviderRelease(provider);
      }
      return E7CopyCString(
        @"{\"status\":\"decode_failed\",\"handDetected\":false,\"detail\":\"cg_provider_or_colorspace_null\",\"pointCount\":0,\"confidence\":0,\"points\":[]}");
    }

    CGImageRef image = CGImageCreate(
      imageWidth,
      imageHeight,
      8,
      32,
      (size_t)imageWidth * 4,
      colorSpace,
      kCGImageAlphaLast | kCGBitmapByteOrder32Big,
      provider,
      NULL,
      false,
      kCGRenderingIntentDefault);
    CGDataProviderRelease(provider);
    CGColorSpaceRelease(colorSpace);
    if (image == NULL) {
      return E7CopyCString(
        @"{\"status\":\"decode_failed\",\"handDetected\":false,\"detail\":\"cg_image_null\",\"pointCount\":0,\"confidence\":0,\"points\":[]}");
    }

    VNDetectHumanHandPoseRequest *request = [[VNDetectHumanHandPoseRequest alloc] init];
    request.maximumHandCount = 1;
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image
                                                                        orientation:kCGImagePropertyOrientationUp
                                                                            options:@{}];
    NSError *error = nil;
    BOOL performed = [handler performRequests:@[request] error:&error];
    CGImageRelease(image);

    if (!performed || error != nil) {
      NSString *detail = error != nil ? error.localizedDescription : @"perform_request_failed";
      return E7CopyCString([NSString stringWithFormat:
        @"{\"status\":\"vision_request_failed\",\"handDetected\":false,\"detail\":\"%@\",\"imageWidth\":%d,\"imageHeight\":%d,\"pointCount\":0,\"confidence\":0,\"points\":[]}",
        E7JsonEscape(detail),
        imageWidth,
        imageHeight]);
    }

    VNHumanHandPoseObservation *hand = request.results.firstObject;
    if (hand == nil) {
      return E7CopyCString([NSString stringWithFormat:
        @"{\"status\":\"ok\",\"handDetected\":false,\"detail\":\"no_hand\",\"imageWidth\":%d,\"imageHeight\":%d,\"pointCount\":0,\"confidence\":0,\"points\":[]}",
        imageWidth,
        imageHeight]);
    }

    NSError *pointsError = nil;
    NSDictionary<VNHumanHandPoseObservationJointName, VNRecognizedPoint *> *points =
      [hand recognizedPointsForJointsGroupName:VNHumanHandPoseObservationJointsGroupNameAll
                                         error:&pointsError];
    if (points == nil || pointsError != nil) {
      NSString *detail = pointsError != nil ? pointsError.localizedDescription : @"recognized_points_empty";
      return E7CopyCString([NSString stringWithFormat:
        @"{\"status\":\"hand_points_missing\",\"handDetected\":false,\"detail\":\"%@\",\"imageWidth\":%d,\"imageHeight\":%d,\"pointCount\":0,\"confidence\":0,\"points\":[]}",
        E7JsonEscape(detail),
        imageWidth,
        imageHeight]);
    }

    NSUInteger includedPointCount = 0;
    float averageConfidence = 0.0f;
    CGRect bounds = CGRectZero;
    CGSize imageSize = CGSizeMake(imageWidth, imageHeight);
    NSString *pointsJson = E7HandPointArrayJson(
      points,
      imageSize,
      0.22,
      &includedPointCount,
      &averageConfidence,
      &bounds);
    BOOL handDetected = includedPointCount >= 5 && averageConfidence >= 0.22f;
    NSString *json = [NSString stringWithFormat:
      @"{\"status\":\"ok\",\"handDetected\":%@,\"detail\":\"vision_hand_pose\",\"imageWidth\":%d,\"imageHeight\":%d,\"pointCount\":%lu,\"confidence\":%.3f,\"bounds\":{\"x\":%.3f,\"y\":%.3f,\"width\":%.3f,\"height\":%.3f},\"points\":%@}",
      handDetected ? @"true" : @"false",
      imageWidth,
      imageHeight,
      (unsigned long)includedPointCount,
      averageConfidence,
      bounds.origin.x,
      bounds.origin.y,
      bounds.size.width,
      bounds.size.height,
      pointsJson];
    return E7CopyCString(json);
  }
}

}
