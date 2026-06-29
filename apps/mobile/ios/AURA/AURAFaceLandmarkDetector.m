#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <Vision/Vision.h>

static CGFloat AURAClamp(CGFloat value)
{
  return fmax(0.0, fmin(1.0, value));
}

static CGImagePropertyOrientation AURAImageOrientationFromUIImage(UIImageOrientation orientation)
{
  switch (orientation) {
    case UIImageOrientationUp:
      return kCGImagePropertyOrientationUp;
    case UIImageOrientationDown:
      return kCGImagePropertyOrientationDown;
    case UIImageOrientationLeft:
      return kCGImagePropertyOrientationLeft;
    case UIImageOrientationRight:
      return kCGImagePropertyOrientationRight;
    case UIImageOrientationUpMirrored:
      return kCGImagePropertyOrientationUpMirrored;
    case UIImageOrientationDownMirrored:
      return kCGImagePropertyOrientationDownMirrored;
    case UIImageOrientationLeftMirrored:
      return kCGImagePropertyOrientationLeftMirrored;
    case UIImageOrientationRightMirrored:
      return kCGImagePropertyOrientationRightMirrored;
  }
}

static NSDictionary *AURAPoint(CGFloat x, CGFloat y)
{
  return @{
    @"x": @(AURAClamp(x)),
    @"y": @(AURAClamp(y)),
  };
}

static NSDictionary *AURAPointFromImagePoint(CGPoint point, CGSize imageSize)
{
  CGFloat width = fmax(imageSize.width, 1.0);
  CGFloat height = fmax(imageSize.height, 1.0);
  return AURAPoint(point.x / width, 1.0 - (point.y / height));
}

static NSArray<NSDictionary *> *AURAPointsFromRegion(VNFaceLandmarkRegion2D *region, CGSize imageSize)
{
  if (region == nil || region.pointCount == 0) {
    return @[];
  }

  const CGPoint *points = [region pointsInImageOfSize:imageSize];
  NSMutableArray<NSDictionary *> *result = [NSMutableArray arrayWithCapacity:region.pointCount];

  for (NSUInteger index = 0; index < region.pointCount; index += 1) {
    [result addObject:AURAPointFromImagePoint(points[index], imageSize)];
  }

  return result;
}

static NSDictionary *AURACentroidFromPoints(NSArray<NSDictionary *> *points)
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

  return AURAPoint(sumX / points.count, sumY / points.count);
}

static NSDictionary *AURACentroidFromRegion(VNFaceLandmarkRegion2D *region, CGSize imageSize)
{
  return AURACentroidFromPoints(AURAPointsFromRegion(region, imageSize));
}

static NSDictionary *AURALowestPointFromRegion(VNFaceLandmarkRegion2D *region, CGSize imageSize)
{
  NSArray<NSDictionary *> *points = AURAPointsFromRegion(region, imageSize);
  NSDictionary *lowestPoint = nil;

  for (NSDictionary *point in points) {
    if (lowestPoint == nil || [point[@"y"] doubleValue] > [lowestPoint[@"y"] doubleValue]) {
      lowestPoint = point;
    }
  }

  return lowestPoint;
}

static NSDictionary *AURACenteredChinPointFromRegion(
    VNFaceLandmarkRegion2D *region,
    NSDictionary *bounds,
    CGSize imageSize)
{
  NSArray<NSDictionary *> *points = AURAPointsFromRegion(region, imageSize);

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
    return AURALowestPointFromRegion(region, imageSize);
  }

  CGFloat averageY = sumY / candidateCount;
  CGFloat boundsChinY = [bounds[@"y"] doubleValue] + faceHeight * 0.9;
  CGFloat stableY = fmax(lowestY * 0.82 + averageY * 0.18, boundsChinY);
  return AURAPoint(sumX / candidateCount, stableY);
}

static NSDictionary *AURALipCornerFromRegion(VNFaceLandmarkRegion2D *region, CGSize imageSize, BOOL wantsLeft)
{
  NSArray<NSDictionary *> *points = AURAPointsFromRegion(region, imageSize);
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

static NSDictionary *AURABoundsFromObservation(VNFaceObservation *face)
{
  CGRect box = face.boundingBox;
  return @{
    @"x": @(AURAClamp(box.origin.x)),
    @"y": @(AURAClamp(1.0 - box.origin.y - box.size.height)),
    @"width": @(AURAClamp(box.size.width)),
    @"height": @(AURAClamp(box.size.height)),
  };
}

static NSDictionary *AURABoundsPoint(NSDictionary *bounds, CGFloat xRatio, CGFloat yRatio)
{
  CGFloat x = [bounds[@"x"] doubleValue] + [bounds[@"width"] doubleValue] * xRatio;
  CGFloat y = [bounds[@"y"] doubleValue] + [bounds[@"height"] doubleValue] * yRatio;
  return AURAPoint(x, y);
}

static NSDictionary *AURAForeheadPoint(
    VNFaceLandmarks2D *landmarks,
    NSDictionary *bounds,
    CGSize imageSize)
{
  NSMutableArray<NSDictionary *> *browPoints = [NSMutableArray array];
  [browPoints addObjectsFromArray:AURAPointsFromRegion(landmarks.leftEyebrow, imageSize)];
  [browPoints addObjectsFromArray:AURAPointsFromRegion(landmarks.rightEyebrow, imageSize)];

  CGFloat faceTop = [bounds[@"y"] doubleValue];
  CGFloat faceHeight = [bounds[@"height"] doubleValue];
  CGFloat faceCenterX = [bounds[@"x"] doubleValue] + [bounds[@"width"] doubleValue] * 0.5;
  NSDictionary *leftEye = AURACentroidFromRegion(landmarks.leftEye, imageSize);
  NSDictionary *rightEye = AURACentroidFromRegion(landmarks.rightEye, imageSize);
  CGFloat foreheadCenterX = faceCenterX;

  if (browPoints.count == 0) {
    if (leftEye && rightEye) {
      foreheadCenterX = ([leftEye[@"x"] doubleValue] + [rightEye[@"x"] doubleValue]) / 2.0;
    }

    return AURAPoint(foreheadCenterX, faceTop + faceHeight * 0.12);
  }

  CGFloat sumX = 0.0;
  CGFloat browTopY = 1.0;

  for (NSDictionary *point in browPoints) {
    sumX += [point[@"x"] doubleValue];
    browTopY = fmin(browTopY, [point[@"y"] doubleValue]);
  }

  if (leftEye && rightEye) {
    foreheadCenterX = ([leftEye[@"x"] doubleValue] + [rightEye[@"x"] doubleValue]) / 2.0;
  } else {
    foreheadCenterX = sumX / browPoints.count;
  }

  CGFloat foreheadY = faceTop + fmax((browTopY - faceTop) * 0.45, faceHeight * 0.05);
  return AURAPoint(foreheadCenterX, foreheadY);
}

static NSMutableDictionary *AURALandmarksFromFace(VNFaceObservation *face, CGSize imageSize)
{
  VNFaceLandmarks2D *landmarks = face.landmarks;
  NSDictionary *bounds = AURABoundsFromObservation(face);
  NSMutableDictionary *result = [NSMutableDictionary dictionary];

  if (landmarks == nil) {
    return result;
  }

  NSDictionary *leftEye = AURACentroidFromRegion(landmarks.leftEye, imageSize);
  NSDictionary *rightEye = AURACentroidFromRegion(landmarks.rightEye, imageSize);
  NSDictionary *noseBase = AURALowestPointFromRegion(landmarks.nose, imageSize);
  VNFaceLandmarkRegion2D *lips = landmarks.outerLips ?: landmarks.innerLips;
  NSDictionary *mouthLeft = AURALipCornerFromRegion(lips, imageSize, YES);
  NSDictionary *mouthRight = AURALipCornerFromRegion(lips, imageSize, NO);
  NSDictionary *chin = AURACenteredChinPointFromRegion(landmarks.faceContour, bounds, imageSize) ?:
      AURABoundsPoint(bounds, 0.5, 0.92);
  NSDictionary *forehead = AURAForeheadPoint(landmarks, bounds, imageSize);

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

  result[@"leftCheek"] = AURABoundsPoint(bounds, 0.27, 0.53);
  result[@"rightCheek"] = AURABoundsPoint(bounds, 0.73, 0.53);
  result[@"leftJaw"] = AURABoundsPoint(bounds, 0.34, 0.78);
  result[@"rightJaw"] = AURABoundsPoint(bounds, 0.66, 0.78);

  return result;
}

static VNFaceObservation *AURALargestFace(NSArray<VNFaceObservation *> *faces)
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

@interface AURAFaceLandmarkDetector : NSObject <RCTBridgeModule>
@end

@implementation AURAFaceLandmarkDetector

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(detect:(NSString *)imageUri
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSURL *url = [NSURL URLWithString:imageUri];
    NSString *path = url.isFileURL ? url.path : imageUri;
    BOOL shouldDeleteAfter = [options[@"deleteAfter"] boolValue];

    UIImage *image = [UIImage imageWithContentsOfFile:path];
    CGImageRef cgImage = image.CGImage;

    if (image == nil || cgImage == nil) {
      if (shouldDeleteAfter) {
        [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
      }
      reject(@"FACE_LANDMARK_IMAGE_UNAVAILABLE", @"Unable to load image for face landmark detection.", nil);
      return;
    }

    CGSize imageSize = CGSizeMake(CGImageGetWidth(cgImage), CGImageGetHeight(cgImage));
    VNDetectFaceLandmarksRequest *request = [[VNDetectFaceLandmarksRequest alloc] init];
    VNImageRequestHandler *handler =
        [[VNImageRequestHandler alloc] initWithCGImage:cgImage
                                           orientation:AURAImageOrientationFromUIImage(image.imageOrientation)
                                               options:@{}];
    NSError *error = nil;

    if (![handler performRequests:@[request] error:&error]) {
      if (shouldDeleteAfter) {
        [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
      }
      reject(@"FACE_LANDMARK_DETECTION_FAILED", error.localizedDescription, error);
      return;
    }

    NSArray<VNFaceObservation *> *faces = request.results ?: @[];
    VNFaceObservation *face = AURALargestFace(faces);
    NSString *status = faces.count == 0 ? @"no_face" : @"ok";
    NSMutableDictionary *payload = [@{
      @"status": status,
      @"faceCount": @(faces.count),
      @"imageWidth": @(imageSize.width),
      @"imageHeight": @(imageSize.height),
    } mutableCopy];

    if (face != nil) {
      NSDictionary *bounds = AURABoundsFromObservation(face);
      NSMutableDictionary *landmarks = AURALandmarksFromFace(face, imageSize);
      if (face.landmarks == nil || landmarks.count == 0) {
        payload[@"status"] = @"no_landmarks";
      }

      payload[@"bounds"] = bounds;
      payload[@"confidence"] = @(face.confidence);
      payload[@"landmarks"] = landmarks;
    }

    NSLog(
        @"[aura:face-landmarks] status=%@ faceCount=%lu forehead=%@ chin=%@ bounds=%@",
        payload[@"status"],
        (unsigned long)faces.count,
        payload[@"landmarks"][@"forehead"],
        payload[@"landmarks"][@"chin"],
        payload[@"bounds"]);

    if (shouldDeleteAfter) {
      [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
    }

    resolve(payload);
  });
}

@end
