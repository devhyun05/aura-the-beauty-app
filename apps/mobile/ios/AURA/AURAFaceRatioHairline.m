#import "AURAFaceRatioHairline.h"

#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#import <ImageIO/ImageIO.h>
#import <UIKit/UIKit.h>

// Scan / decision constants (docs/AURA_FACE_HAIRLINE_APPLE_MATTE_PLAN_KO_v0.1.md §튜닝 상수).
// Every constant can be overridden at runtime through options[@"tuning"][<name>] so thresholds
// can be tuned from TS with Fast Refresh, without a native rebuild. Keep names in sync with
// `FaceRatioHairlineTuning` in apps/mobile/src/features/face-ratio/constants.ts.

// Forehead ROI (doc v0.2 §4.3.3), fractions of face width (|idx234.x - idx454.x|).
static const double kHairlineRoiHalfWidthFraction = 0.28;   // roiX = faceCenterX ± faceWidth * this
static const double kHairlineRoiTopOffsetFraction = 0.35;   // roiY0 = idx10.y - faceWidth * this
static const double kHairlineRoiBottomMarginFraction = 0.03; // roiY1 = G.y - faceWidth * this

// Column scan (doc v0.2 §4.3.4). Alpha thresholds are on 0..1 normalized matte alpha.
static const double kHairlineHairAlphaThreshold = 0.45;
static const double kHairlineSkinAlphaThreshold = 0.35;
static const double kHairlineGradientThreshold = 0.25;
// Resolution-relative windows (fractions of matte height, with pixel floors applied in code:
// hair >= 2px, skin >= 3px, gradient offset >= 2px).
static const double kHairlineHairWindowFraction = 0.005;
static const double kHairlineSkinWindowFraction = 0.010;
static const double kHairlineGradientOffsetFraction = 0.004;
static const double kHairlineSampledColumnCount = 48;

// Post-processing.
static const double kHairlineOutlierMaxDeviationFraction = 0.08; // |y - median| < faceWidth * this
static const double kHairlineMinCandidateCount = 8;
static const double kHairlineMinSkinFraction = 0.20;             // hairlineVisible gate
static const double kHairlineMinGapToGlabellaFraction = 0.02;    // H.y <= G.y - faceWidth * this

// Confidence formula (plan §0.4): lightingQuality dropped (no honest input here), renormalized.
// confidence = 0.40*boundarySharpness + 0.30*candidateConsistency
//            + 0.20*foreheadSkinVisibility + 0.10*poseQuality
static const double kHairlineWeightBoundarySharpness = 0.40;
static const double kHairlineWeightCandidateConsistency = 0.30;
static const double kHairlineWeightForeheadSkinVisibility = 0.20;
static const double kHairlineWeightPoseQuality = 0.10;
static const double kHairlineSharpnessNormGradient = 0.60; // gradient at which sharpness saturates
static const double kHairlineSkinVisibilityNorm = 0.60;    // skinFraction at which visibility saturates
// poseQuality = 1 - clamp(max(|yaw|/8, |pitch|/8, |roll|/5), 0, 1) — mirrors JS pose gate limits.
static const double kHairlinePoseYawLimitDeg = 8.0;
static const double kHairlinePosePitchLimitDeg = 8.0;
static const double kHairlinePoseRollLimitDeg = 5.0;

static double AURAHairlineTuningValue(NSDictionary *_Nullable options,
                                      NSString *key,
                                      double fallback) {
  NSDictionary *tuning = options[@"tuning"];
  if (![tuning isKindOfClass:[NSDictionary class]]) {
    return fallback;
  }
  NSNumber *value = tuning[key];
  if (![value isKindOfClass:[NSNumber class]]) {
    return fallback;
  }
  return value.doubleValue;
}

typedef struct {
  double x;
  double y;
  double gradient;
  double weight;
} AURAHairlineCandidate;

static double AURAHairlineClamp(double value) {
  return fmax(0.0, fmin(1.0, value));
}

static BOOL AURAHairlineBoolOption(NSDictionary *_Nullable options, NSString *key) {
  NSNumber *value = options[key];
  return [value respondsToSelector:@selector(boolValue)] ? value.boolValue : NO;
}

static int AURAHairlineClampInt(int value, int minValue, int maxValue) {
  return (int)fmax(minValue, fmin(maxValue, value));
}

static int AURAHairlineCompareDoubles(const void *lhs, const void *rhs) {
  double a = *(const double *)lhs;
  double b = *(const double *)rhs;
  return (a > b) - (a < b);
}

static int AURAHairlineCompareCandidateY(const void *lhs, const void *rhs) {
  const AURAHairlineCandidate *a = (const AURAHairlineCandidate *)lhs;
  const AURAHairlineCandidate *b = (const AURAHairlineCandidate *)rhs;
  return (a->y > b->y) - (a->y < b->y);
}

static double AURAHairlineMedian(double *values, NSUInteger count) {
  if (count == 0) {
    return 0.0;
  }

  qsort(values, count, sizeof(double), AURAHairlineCompareDoubles);
  if (count % 2 == 1) {
    return values[count / 2];
  }

  return (values[count / 2 - 1] + values[count / 2]) / 2.0;
}

static CGImagePropertyOrientation AURAHairlineExifOrientationFromProperties(
    NSDictionary *properties) {
  NSNumber *orientation = properties[(NSString *)kCGImagePropertyOrientation];
  if (![orientation respondsToSelector:@selector(unsignedIntValue)]) {
    return kCGImagePropertyOrientationUp;
  }

  return (CGImagePropertyOrientation)orientation.unsignedIntValue;
}

static BOOL AURAHairlineOrientationSwapsAxes(CGImagePropertyOrientation orientation) {
  return orientation == kCGImagePropertyOrientationLeft ||
      orientation == kCGImagePropertyOrientationRight ||
      orientation == kCGImagePropertyOrientationLeftMirrored ||
      orientation == kCGImagePropertyOrientationRightMirrored;
}

static AVSemanticSegmentationMatte *AURAHairlineCopyMatteFromSource(
    CGImageSourceRef source,
    CFStringRef auxiliaryDataType,
    CGImagePropertyOrientation orientation) {
  NSDictionary *auxiliaryInfo = CFBridgingRelease(
      CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, 0, auxiliaryDataType));
  if (![auxiliaryInfo isKindOfClass:[NSDictionary class]]) {
    return nil;
  }

  NSError *error = nil;
  AVSemanticSegmentationMatte *matte =
      [AVSemanticSegmentationMatte
          semanticSegmentationMatteFromImageSourceAuxiliaryDataType:auxiliaryDataType
                                          dictionaryRepresentation:auxiliaryInfo
                                                             error:&error];
  if (!matte || error) {
    return nil;
  }

  return [matte semanticSegmentationMatteByApplyingExifOrientation:orientation];
}

static double AURAHairlineSampleLockedPixelBuffer(
    CVPixelBufferRef buffer,
    int x,
    int y) {
  if (!buffer) {
    return 0.0;
  }

  size_t width = CVPixelBufferGetWidth(buffer);
  size_t height = CVPixelBufferGetHeight(buffer);
  if (width == 0 || height == 0) {
    return 0.0;
  }

  x = AURAHairlineClampInt(x, 0, (int)width - 1);
  y = AURAHairlineClampInt(y, 0, (int)height - 1);

  uint8_t *baseAddress = CVPixelBufferGetBaseAddress(buffer);
  if (!baseAddress) {
    return 0.0;
  }

  size_t bytesPerRow = CVPixelBufferGetBytesPerRow(buffer);
  OSType pixelFormat = CVPixelBufferGetPixelFormatType(buffer);
  uint8_t *row = baseAddress + y * bytesPerRow;

  if (pixelFormat == kCVPixelFormatType_OneComponent8) {
    return row[x] / 255.0;
  }

  if (pixelFormat == kCVPixelFormatType_OneComponent32Float) {
    float *floatRow = (float *)row;
    return AURAHairlineClamp(floatRow[x]);
  }

  return 0.0;
}

static double AURAHairlineAverageColumnRange(
    CVPixelBufferRef buffer,
    double normX,
    double normY0,
    double normY1) {
  size_t width = CVPixelBufferGetWidth(buffer);
  size_t height = CVPixelBufferGetHeight(buffer);
  if (width == 0 || height == 0) {
    return 0.0;
  }

  double y0 = AURAHairlineClamp(fmin(normY0, normY1));
  double y1 = AURAHairlineClamp(fmax(normY0, normY1));
  int x = AURAHairlineClampInt((int)llround(AURAHairlineClamp(normX) * ((double)width - 1.0)),
                               0,
                               (int)width - 1);
  int startY = AURAHairlineClampInt((int)floor(y0 * ((double)height - 1.0)),
                                    0,
                                    (int)height - 1);
  int endY = AURAHairlineClampInt((int)ceil(y1 * ((double)height - 1.0)),
                                  0,
                                  (int)height - 1);
  double sum = 0.0;
  NSUInteger count = 0;

  for (int y = startY; y <= endY; y += 1) {
    sum += AURAHairlineSampleLockedPixelBuffer(buffer, x, y);
    count += 1;
  }

  return count > 0 ? sum / count : 0.0;
}

static double AURAHairlineSampleNorm(CVPixelBufferRef buffer, double normX, double normY) {
  size_t width = CVPixelBufferGetWidth(buffer);
  size_t height = CVPixelBufferGetHeight(buffer);
  if (width == 0 || height == 0) {
    return 0.0;
  }

  int x = AURAHairlineClampInt((int)llround(AURAHairlineClamp(normX) * ((double)width - 1.0)),
                               0,
                               (int)width - 1);
  int y = AURAHairlineClampInt((int)llround(AURAHairlineClamp(normY) * ((double)height - 1.0)),
                               0,
                               (int)height - 1);
  return AURAHairlineSampleLockedPixelBuffer(buffer, x, y);
}

static double AURAHairlineSkinFractionInRoi(
    CVPixelBufferRef skinBuffer,
    double roiX0,
    double roiX1,
    double hairlineY,
    double roiY1) {
  if (!skinBuffer || roiY1 <= hairlineY) {
    return 0.0;
  }

  NSUInteger columns = 32;
  NSUInteger rows = 32;
  NSUInteger visible = 0;
  NSUInteger sampled = 0;

  for (NSUInteger xi = 0; xi < columns; xi += 1) {
    double x = roiX0 + (roiX1 - roiX0) * ((double)xi + 0.5) / (double)columns;
    for (NSUInteger yi = 0; yi < rows; yi += 1) {
      double y = hairlineY + (roiY1 - hairlineY) * ((double)yi + 0.5) / (double)rows;
      if (AURAHairlineSampleNorm(skinBuffer, x, y) > 0.5) {
        visible += 1;
      }
      sampled += 1;
    }
  }

  return sampled > 0 ? (double)visible / (double)sampled : 0.0;
}

static UIImage *AURAHairlineImageFromMatte(CVPixelBufferRef buffer) {
  if (!buffer) {
    return nil;
  }

  CVPixelBufferLockBaseAddress(buffer, kCVPixelBufferLock_ReadOnly);
  size_t width = CVPixelBufferGetWidth(buffer);
  size_t height = CVPixelBufferGetHeight(buffer);
  if (width == 0 || height == 0) {
    CVPixelBufferUnlockBaseAddress(buffer, kCVPixelBufferLock_ReadOnly);
    return nil;
  }

  size_t byteCount = width * height * 4;
  uint8_t *rgba = calloc(byteCount, sizeof(uint8_t));
  if (!rgba) {
    CVPixelBufferUnlockBaseAddress(buffer, kCVPixelBufferLock_ReadOnly);
    return nil;
  }

  for (size_t y = 0; y < height; y += 1) {
    for (size_t x = 0; x < width; x += 1) {
      uint8_t value = (uint8_t)llround(AURAHairlineSampleLockedPixelBuffer(
          buffer,
          (int)x,
          (int)y) * 255.0);
      size_t offset = (y * width + x) * 4;
      rgba[offset] = value;
      rgba[offset + 1] = value;
      rgba[offset + 2] = value;
      rgba[offset + 3] = 255;
    }
  }

  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(
      rgba,
      width,
      height,
      8,
      width * 4,
      colorSpace,
      (CGBitmapInfo)kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGImageRef imageRef = context ? CGBitmapContextCreateImage(context) : nil;
  UIImage *image = imageRef ? [UIImage imageWithCGImage:imageRef] : nil;

  if (imageRef) {
    CGImageRelease(imageRef);
  }
  if (context) {
    CGContextRelease(context);
  }
  CGColorSpaceRelease(colorSpace);
  free(rgba);
  CVPixelBufferUnlockBaseAddress(buffer, kCVPixelBufferLock_ReadOnly);

  return image;
}

static NSString *AURAHairlineWritePNG(UIImage *image, NSString *directory, NSString *fileName) {
  if (!image) {
    return nil;
  }

  NSString *path = [directory stringByAppendingPathComponent:fileName];
  NSData *data = UIImagePNGRepresentation(image);
  if (![data writeToFile:path atomically:YES]) {
    return nil;
  }

  return [NSURL fileURLWithPath:path].absoluteString;
}

static NSDictionary *AURAHairlineWriteDebugArtifacts(
    CVPixelBufferRef hairBuffer,
    CVPixelBufferRef skinBuffer,
    double roiX0,
    double roiX1,
    double roiY0,
    double roiY1,
    AURAHairlineCandidate *candidates,
    NSUInteger candidateCount,
    double hairlineX,
    double hairlineY,
    BOOL includeDebugOverlay) {
  NSString *directory = [NSTemporaryDirectory() stringByAppendingPathComponent:
      [NSString stringWithFormat:@"aura-hairline-%@", NSUUID.UUID.UUIDString]];
  NSError *directoryError = nil;
  if (![NSFileManager.defaultManager createDirectoryAtPath:directory
                               withIntermediateDirectories:YES
                                                attributes:nil
                                                     error:&directoryError]) {
    return nil;
  }

  UIImage *hairImage = AURAHairlineImageFromMatte(hairBuffer);
  UIImage *skinImage = AURAHairlineImageFromMatte(skinBuffer);
  NSMutableDictionary *artifacts = [NSMutableDictionary dictionary];
  NSString *hairUri = AURAHairlineWritePNG(hairImage, directory, @"apple-hair-matte.png");
  NSString *skinUri = AURAHairlineWritePNG(skinImage, directory, @"apple-skin-matte.png");
  if (hairUri) {
    artifacts[@"hairMatteUri"] = hairUri;
  }
  if (skinUri) {
    artifacts[@"skinMatteUri"] = skinUri;
  }

  if (!includeDebugOverlay) {
    return artifacts.count > 0 ? artifacts : nil;
  }

  CGSize size = CGSizeMake(
      fmax(1.0, (CGFloat)CVPixelBufferGetWidth(hairBuffer)),
      fmax(1.0, (CGFloat)CVPixelBufferGetHeight(hairBuffer)));
  UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat defaultFormat];
  format.scale = 1.0;
  UIGraphicsImageRenderer *renderer =
      [[UIGraphicsImageRenderer alloc] initWithSize:size format:format];
  UIImage *debugImage = [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    if (hairImage) {
      [hairImage drawInRect:CGRectMake(0, 0, size.width, size.height)];
    } else {
      [[UIColor blackColor] setFill];
      UIRectFill(CGRectMake(0, 0, size.width, size.height));
    }

    if (skinImage) {
      [skinImage drawInRect:CGRectMake(0, 0, size.width, size.height)
                  blendMode:kCGBlendModeScreen
                      alpha:0.35];
    }

    CGContextRef cg = context.CGContext;
    CGContextSetLineWidth(cg, 2.0);
    CGContextSetStrokeColorWithColor(cg, UIColor.systemYellowColor.CGColor);
    CGRect roiRect = CGRectMake(
        roiX0 * size.width,
        roiY0 * size.height,
        (roiX1 - roiX0) * size.width,
        (roiY1 - roiY0) * size.height);
    CGContextStrokeRect(cg, roiRect);

    CGContextSetFillColorWithColor(cg, UIColor.systemPinkColor.CGColor);
    for (NSUInteger index = 0; index < candidateCount; index += 1) {
      CGPoint point = CGPointMake(candidates[index].x * size.width,
                                  candidates[index].y * size.height);
      CGContextFillEllipseInRect(cg, CGRectMake(point.x - 1.5, point.y - 1.5, 3, 3));
    }

    CGContextSetStrokeColorWithColor(cg, UIColor.systemGreenColor.CGColor);
    CGContextMoveToPoint(cg, 0, hairlineY * size.height);
    CGContextAddLineToPoint(cg, size.width, hairlineY * size.height);
    CGContextStrokePath(cg);
    CGContextSetFillColorWithColor(cg, UIColor.systemGreenColor.CGColor);
    CGContextFillEllipseInRect(
        cg,
        CGRectMake(hairlineX * size.width - 4, hairlineY * size.height - 4, 8, 8));
  }];
  NSString *debugUri = AURAHairlineWritePNG(debugImage, directory, @"hairline-debug.png");
  if (debugUri) {
    artifacts[@"hairlineDebugUri"] = debugUri;
  }

  return artifacts.count > 0 ? artifacts : nil;
}

NSDictionary *AURAFaceRatioDetectHairline(NSURL *imageFileURL,
                                          AURAFaceRatioHairlineLandmarks landmarks,
                                          NSDictionary *_Nullable options) {
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)imageFileURL, NULL);
  if (!source) {
    return @{ @"failureReason": @"image_unreadable" };
  }

  NSDictionary *properties =
      CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL)) ?: @{};
  CGImagePropertyOrientation orientation = AURAHairlineExifOrientationFromProperties(properties);
  AVSemanticSegmentationMatte *hairMatte = AURAHairlineCopyMatteFromSource(
      source,
      kCGImageAuxiliaryDataTypeSemanticSegmentationHairMatte,
      orientation);
  AVSemanticSegmentationMatte *skinMatte = AURAHairlineCopyMatteFromSource(
      source,
      kCGImageAuxiliaryDataTypeSemanticSegmentationSkinMatte,
      orientation);
  CFRelease(source);

  CVPixelBufferRef hairBuffer = hairMatte.mattingImage;
  CVPixelBufferRef skinBuffer = skinMatte.mattingImage;
  BOOL hairAvailable = hairBuffer != nil;
  BOOL skinAvailable = skinBuffer != nil;
  size_t hairWidth = hairAvailable ? CVPixelBufferGetWidth(hairBuffer) : 0;
  size_t hairHeight = hairAvailable ? CVPixelBufferGetHeight(hairBuffer) : 0;
  size_t skinWidth = skinAvailable ? CVPixelBufferGetWidth(skinBuffer) : 0;
  size_t skinHeight = skinAvailable ? CVPixelBufferGetHeight(skinBuffer) : 0;
  size_t matteWidth = hairWidth > 0 ? hairWidth : skinWidth;
  size_t matteHeight = hairHeight > 0 ? hairHeight : skinHeight;
  NSMutableDictionary *matteInfo = [@{
    @"hairAvailable": @(hairAvailable),
    @"skinAvailable": @(skinAvailable),
    @"matteWidth": @(matteWidth),
    @"matteHeight": @(matteHeight),
  } mutableCopy];

  if (!hairAvailable || !skinAvailable || hairWidth == 0 || hairHeight == 0 ||
      skinWidth == 0 || skinHeight == 0) {
    return @{
      @"matte": matteInfo,
      @"failureReason": @"no_aux_data",
    };
  }

  double faceWidth = fabs(landmarks.rightFaceX - landmarks.leftFaceX);
  double faceCenterX = (landmarks.leftFaceX + landmarks.rightFaceX) / 2.0;
  double roiHalfWidthFraction = AURAHairlineTuningValue(
      options,
      @"roiHalfWidthFraction",
      kHairlineRoiHalfWidthFraction);
  double roiTopOffsetFraction = AURAHairlineTuningValue(
      options,
      @"roiTopOffsetFraction",
      kHairlineRoiTopOffsetFraction);
  double roiBottomMarginFraction = AURAHairlineTuningValue(
      options,
      @"roiBottomMarginFraction",
      kHairlineRoiBottomMarginFraction);

  if (faceWidth <= 0.05 || !isfinite(faceWidth)) {
    return @{
      @"matte": matteInfo,
      @"failureReason": @"roi_invalid",
    };
  }

  double roiX0 = AURAHairlineClamp(faceCenterX - faceWidth * roiHalfWidthFraction);
  double roiX1 = AURAHairlineClamp(faceCenterX + faceWidth * roiHalfWidthFraction);
  double roiY0 = AURAHairlineClamp(landmarks.foreheadTopY - faceWidth * roiTopOffsetFraction);
  double roiY1 = AURAHairlineClamp(landmarks.glabellaY - faceWidth * roiBottomMarginFraction);

  if (roiX1 - roiX0 < 0.02 || roiY1 - roiY0 < 0.02) {
    return @{
      @"matte": matteInfo,
      @"failureReason": @"roi_invalid",
    };
  }

  double hairAlphaThreshold = AURAHairlineTuningValue(
      options,
      @"hairAlphaThreshold",
      kHairlineHairAlphaThreshold);
  double skinAlphaThreshold = AURAHairlineTuningValue(
      options,
      @"skinAlphaThreshold",
      kHairlineSkinAlphaThreshold);
  double gradientThreshold = AURAHairlineTuningValue(
      options,
      @"gradientThreshold",
      kHairlineGradientThreshold);
  double hairWindowNorm = fmax(
      2.0 / (double)hairHeight,
      AURAHairlineTuningValue(options, @"hairWindowFraction", kHairlineHairWindowFraction));
  double skinWindowNorm = fmax(
      3.0 / (double)skinHeight,
      AURAHairlineTuningValue(options, @"skinWindowFraction", kHairlineSkinWindowFraction));
  double gradientOffsetNorm = fmax(
      2.0 / (double)hairHeight,
      AURAHairlineTuningValue(
          options,
          @"gradientOffsetFraction",
          kHairlineGradientOffsetFraction));
  NSUInteger sampledColumnCount = (NSUInteger)llround(AURAHairlineTuningValue(
      options,
      @"sampledColumnCount",
      kHairlineSampledColumnCount));
  sampledColumnCount = MAX(8, sampledColumnCount);

  AURAHairlineCandidate *candidates =
      calloc(sampledColumnCount, sizeof(AURAHairlineCandidate));
  if (!candidates) {
    return @{
      @"matte": matteInfo,
      @"failureReason": @"no_candidates",
    };
  }

  CVPixelBufferLockBaseAddress(hairBuffer, kCVPixelBufferLock_ReadOnly);
  CVPixelBufferLockBaseAddress(skinBuffer, kCVPixelBufferLock_ReadOnly);

  NSUInteger candidateCount = 0;
  int rowStart = AURAHairlineClampInt((int)floor(roiY0 * ((double)hairHeight - 1.0)),
                                      0,
                                      (int)hairHeight - 1);
  int rowEnd = AURAHairlineClampInt((int)ceil(roiY1 * ((double)hairHeight - 1.0)),
                                    0,
                                    (int)hairHeight - 1);

  for (NSUInteger column = 0; column < sampledColumnCount; column += 1) {
    double columnRatio = ((double)column + 0.5) / (double)sampledColumnCount;
    double x = roiX0 + (roiX1 - roiX0) * columnRatio;

    for (int row = rowStart; row <= rowEnd; row += 1) {
      double y = ((double)row + 0.5) / (double)hairHeight;
      double hairAbove =
          AURAHairlineAverageColumnRange(hairBuffer, x, y - hairWindowNorm, y);
      double hairBelow =
          AURAHairlineAverageColumnRange(hairBuffer, x, y, y + hairWindowNorm);
      double skinBelow =
          AURAHairlineAverageColumnRange(skinBuffer, x, y, y + skinWindowNorm);
      double skinAbove =
          AURAHairlineAverageColumnRange(skinBuffer, x, y - skinWindowNorm, y);
      double hairGradient =
          hairAbove -
          AURAHairlineAverageColumnRange(
              hairBuffer,
              x,
              y + gradientOffsetNorm,
              y + gradientOffsetNorm + hairWindowNorm);
      double skinGradient =
          AURAHairlineAverageColumnRange(
              skinBuffer,
              x,
              y + gradientOffsetNorm,
              y + gradientOffsetNorm + skinWindowNorm) -
          skinAbove;
      double gradient = fmax(0.0, (hairGradient + skinGradient) / 2.0);

      if (hairAbove >= hairAlphaThreshold &&
          skinBelow >= skinAlphaThreshold &&
          gradient >= gradientThreshold &&
          hairAbove > hairBelow) {
        double sigma = fmax((roiX1 - roiX0) * 0.33, 0.001);
        double centerWeight =
            exp(-0.5 * pow((x - faceCenterX) / sigma, 2.0));
        candidates[candidateCount++] = (AURAHairlineCandidate){
          .x = x,
          .y = y,
          .gradient = gradient,
          .weight = fmax(0.001, gradient * centerWeight),
        };
        break;
      }
    }
  }

  double minCandidateCount = AURAHairlineTuningValue(
      options,
      @"minCandidateCount",
      kHairlineMinCandidateCount);
  if (candidateCount < (NSUInteger)ceil(minCandidateCount)) {
    CVPixelBufferUnlockBaseAddress(skinBuffer, kCVPixelBufferLock_ReadOnly);
    CVPixelBufferUnlockBaseAddress(hairBuffer, kCVPixelBufferLock_ReadOnly);
    free(candidates);
    return @{
      @"matte": matteInfo,
      @"failureReason": @"no_candidates",
    };
  }

  double *candidateYs = calloc(candidateCount, sizeof(double));
  if (!candidateYs) {
    CVPixelBufferUnlockBaseAddress(skinBuffer, kCVPixelBufferLock_ReadOnly);
    CVPixelBufferUnlockBaseAddress(hairBuffer, kCVPixelBufferLock_ReadOnly);
    free(candidates);
    return @{
      @"matte": matteInfo,
      @"failureReason": @"no_candidates",
    };
  }
  for (NSUInteger index = 0; index < candidateCount; index += 1) {
    candidateYs[index] = candidates[index].y;
  }
  double medianY = AURAHairlineMedian(candidateYs, candidateCount);
  free(candidateYs);

  double outlierMaxDeviation = faceWidth * AURAHairlineTuningValue(
      options,
      @"outlierMaxDeviationFraction",
      kHairlineOutlierMaxDeviationFraction);
  AURAHairlineCandidate *filteredCandidates =
      calloc(candidateCount, sizeof(AURAHairlineCandidate));
  if (!filteredCandidates) {
    CVPixelBufferUnlockBaseAddress(skinBuffer, kCVPixelBufferLock_ReadOnly);
    CVPixelBufferUnlockBaseAddress(hairBuffer, kCVPixelBufferLock_ReadOnly);
    free(candidates);
    return @{
      @"matte": matteInfo,
      @"failureReason": @"no_candidates",
    };
  }
  NSUInteger filteredCount = 0;
  for (NSUInteger index = 0; index < candidateCount; index += 1) {
    if (fabs(candidates[index].y - medianY) <= outlierMaxDeviation) {
      filteredCandidates[filteredCount++] = candidates[index];
    }
  }

  if (filteredCount < (NSUInteger)ceil(minCandidateCount)) {
    CVPixelBufferUnlockBaseAddress(skinBuffer, kCVPixelBufferLock_ReadOnly);
    CVPixelBufferUnlockBaseAddress(hairBuffer, kCVPixelBufferLock_ReadOnly);
    free(filteredCandidates);
    free(candidates);
    return @{
      @"matte": matteInfo,
      @"failureReason": @"no_candidates",
    };
  }

  qsort(filteredCandidates,
        filteredCount,
        sizeof(AURAHairlineCandidate),
        AURAHairlineCompareCandidateY);
  double totalWeight = 0.0;
  double weightedX = 0.0;
  double meanGradient = 0.0;
  for (NSUInteger index = 0; index < filteredCount; index += 1) {
    totalWeight += filteredCandidates[index].weight;
    weightedX += filteredCandidates[index].x * filteredCandidates[index].weight;
    meanGradient += filteredCandidates[index].gradient;
  }

  meanGradient /= (double)filteredCount;
  double weightedMedianY = filteredCandidates[filteredCount - 1].y;
  double runningWeight = 0.0;
  for (NSUInteger index = 0; index < filteredCount; index += 1) {
    runningWeight += filteredCandidates[index].weight;
    if (runningWeight >= totalWeight / 2.0) {
      weightedMedianY = filteredCandidates[index].y;
      break;
    }
  }

  double hairlineX = AURAHairlineClamp(weightedX / fmax(totalWeight, 0.001));
  double hairlineY = AURAHairlineClamp(weightedMedianY);
  double variance = 0.0;
  for (NSUInteger index = 0; index < filteredCount; index += 1) {
    variance += pow(filteredCandidates[index].y - hairlineY, 2.0);
  }
  double stdNorm = sqrt(variance / (double)filteredCount);

  NSNumber *pixelWidthNumber = properties[(NSString *)kCGImagePropertyPixelWidth];
  NSNumber *pixelHeightNumber = properties[(NSString *)kCGImagePropertyPixelHeight];
  double rawImageWidth = [pixelWidthNumber respondsToSelector:@selector(doubleValue)]
      ? pixelWidthNumber.doubleValue
      : 0.0;
  double rawImageHeight = [pixelHeightNumber respondsToSelector:@selector(doubleValue)]
      ? pixelHeightNumber.doubleValue
      : 0.0;
  double imageHeight = AURAHairlineOrientationSwapsAxes(orientation)
      ? rawImageWidth
      : rawImageHeight;
  if (imageHeight <= 0.0) {
    imageHeight = (double)hairHeight;
  }
  double boundaryStdPx = stdNorm * imageHeight;
  double skinFraction = AURAHairlineSkinFractionInRoi(
      skinBuffer,
      roiX0,
      roiX1,
      hairlineY,
      roiY1);

  double boundarySharpness = AURAHairlineClamp(
      meanGradient /
      fmax(AURAHairlineTuningValue(
          options,
          @"sharpnessNormGradient",
          kHairlineSharpnessNormGradient), 0.001));
  double coverage = AURAHairlineClamp((double)filteredCount / (double)sampledColumnCount);
  double consistencyStdTerm = 1.0 - AURAHairlineClamp(
      stdNorm / fmax(0.08 * faceWidth, 0.001));
  double candidateConsistency = AURAHairlineClamp(0.5 * coverage + 0.5 * consistencyStdTerm);
  double foreheadSkinVisibility = AURAHairlineClamp(
      skinFraction /
      fmax(AURAHairlineTuningValue(
          options,
          @"skinVisibilityNorm",
          kHairlineSkinVisibilityNorm), 0.001));
  double poseYawLimit = AURAHairlineTuningValue(
      options,
      @"poseYawLimitDeg",
      kHairlinePoseYawLimitDeg);
  double posePitchLimit = AURAHairlineTuningValue(
      options,
      @"posePitchLimitDeg",
      kHairlinePosePitchLimitDeg);
  double poseRollLimit = AURAHairlineTuningValue(
      options,
      @"poseRollLimitDeg",
      kHairlinePoseRollLimitDeg);
  double poseSeverity = fmax(
      fabs(landmarks.yawDeg) / fmax(poseYawLimit, 0.001),
      fmax(
          fabs(landmarks.pitchDeg) / fmax(posePitchLimit, 0.001),
          fabs(landmarks.rollDeg) / fmax(poseRollLimit, 0.001)));
  double poseQuality = 1.0 - AURAHairlineClamp(poseSeverity);
  double confidence = AURAHairlineClamp(
      AURAHairlineTuningValue(
          options,
          @"weightBoundarySharpness",
          kHairlineWeightBoundarySharpness) *
          boundarySharpness +
      AURAHairlineTuningValue(
          options,
          @"weightCandidateConsistency",
          kHairlineWeightCandidateConsistency) *
          candidateConsistency +
      AURAHairlineTuningValue(
          options,
          @"weightForeheadSkinVisibility",
          kHairlineWeightForeheadSkinVisibility) *
          foreheadSkinVisibility +
      AURAHairlineTuningValue(
          options,
          @"weightPoseQuality",
          kHairlineWeightPoseQuality) *
          poseQuality);
  double minSkinFraction = AURAHairlineTuningValue(
      options,
      @"minSkinFraction",
      kHairlineMinSkinFraction);
  double minGapToGlabella = faceWidth * AURAHairlineTuningValue(
      options,
      @"minGapToGlabellaFraction",
      kHairlineMinGapToGlabellaFraction);
  BOOL visible =
      filteredCount >= (NSUInteger)ceil(minCandidateCount) &&
      skinFraction >= minSkinFraction &&
      hairlineY <= landmarks.glabellaY - minGapToGlabella;

  CVPixelBufferUnlockBaseAddress(skinBuffer, kCVPixelBufferLock_ReadOnly);
  CVPixelBufferUnlockBaseAddress(hairBuffer, kCVPixelBufferLock_ReadOnly);

  NSDictionary *exportedArtifacts = nil;
  BOOL requestsDebugArtifacts = AURAHairlineBoolOption(options, @"debugArtifacts");
  BOOL requestsMatteArtifacts = AURAHairlineBoolOption(options, @"matteArtifacts");
  if (requestsDebugArtifacts || requestsMatteArtifacts) {
    exportedArtifacts = AURAHairlineWriteDebugArtifacts(
        hairBuffer,
        skinBuffer,
        roiX0,
        roiX1,
        roiY0,
        roiY1,
        filteredCandidates,
        filteredCount,
        hairlineX,
        hairlineY,
        requestsDebugArtifacts);
  }

  NSMutableDictionary *result = [@{
    @"matte": matteInfo,
    @"hairline": @{
      @"boundaryStdPx": @(boundaryStdPx),
      @"candidateCount": @(filteredCount),
      @"confidence": @(confidence),
      @"method": @"apple_hair_skin_boundary",
      @"skinFraction": @(skinFraction),
      @"visible": @(visible),
      @"x": @(hairlineX),
      @"y": @(hairlineY),
    },
  } mutableCopy];
  if (exportedArtifacts && requestsDebugArtifacts) {
    result[@"debugArtifacts"] = exportedArtifacts;
  }
  if (exportedArtifacts && requestsMatteArtifacts) {
    NSMutableDictionary *matteArtifacts = [NSMutableDictionary dictionary];
    if (exportedArtifacts[@"hairMatteUri"]) {
      matteArtifacts[@"hairMatteUri"] = exportedArtifacts[@"hairMatteUri"];
    }
    if (exportedArtifacts[@"skinMatteUri"]) {
      matteArtifacts[@"skinMatteUri"] = exportedArtifacts[@"skinMatteUri"];
    }
    if (matteArtifacts.count > 0) {
      result[@"matteArtifacts"] = matteArtifacts;
    }
  }

  free(filteredCandidates);
  free(candidates);

  return result;
}
