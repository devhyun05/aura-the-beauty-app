#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <MediaPipeTasksVision/MediaPipeTasksVision.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#import <ImageIO/ImageIO.h>
#import <CoreGraphics/CoreGraphics.h>

// AURAPersonalColorAnalyzer — 온디바이스 퍼스널 컬러 ROI 색 통계.
// LOCKED: CPU 픽셀 루프(Core Image 미사용), 알파 가중은 별도 matte 버퍼에서만.
// 반환 스키마는 src/features/personal-color/services/personalColorCore/contracts.ts의
// NativePersonalColorResult 와 일치.
//
// NOTE: matte 재구성/샘플링 헬퍼는 AURAFaceRatioHairline.m의 static 헬퍼를 이 모듈에
// self-contained로 복제(promote 대신)했다 — 작동 중인 hairline 파일을 건드리지 않기 위함.
// lip index 배열은 E7NativeLipBoundaryProviders.swift:1842-1850에서 복제.

#pragma mark - 튜닝 상수 (calibration target)

static const double kSkinAlphaGate = 0.6;
static const double kHairAlphaGate = 0.6;
static const double kSkinPatchRadiusFraction = 0.045; // faceWidth 대비
static const int kSkinPatchGridSteps = 21;
static const int kHairGridStepsX = 40;
static const int kHairGridStepsY = 24;
static const int kLipGridStepsX = 48;
static const int kLipGridStepsY = 40;
static const double kMinSamplesForFullConfidence = 40.0;
static const uint8_t kOverExposedThreshold = 250;
static const uint8_t kUnderExposedThreshold = 16;
static const uint8_t kSpecularBrightMin = 230; // near-white
static const uint8_t kSpecularSatMax = 20;     // low saturation (max-min)

// MediaPipe 입술 컨투어 인덱스 (E7NativeLipBoundaryProviders.swift 복제)
static const int kOuterLipIndices[] = {61, 146, 91, 181, 84, 17, 314, 405, 321, 375,
                                       291, 409, 270, 269, 267, 0, 37, 39, 40, 185};
static const int kInnerLipIndices[] = {78, 95, 88, 178, 87, 14, 317, 402, 318, 324,
                                       308, 415, 310, 311, 312, 13, 82, 81, 80, 191};
static const int kOuterLipCount = 20;
static const int kInnerLipCount = 20;

// 피부 패치 landmark 클러스터
static const int kLeftCheekIndices[] = {50, 101, 118, 119, 205, 36};
static const int kRightCheekIndices[] = {280, 330, 347, 348, 425, 266};
static const int kForeheadIndices[] = {10, 151, 9, 107, 336};

#pragma mark - 기본 헬퍼

static double AURAPCClamp01(double v) { return fmax(0.0, fmin(1.0, v)); }
static int AURAPCClampInt(int v, int lo, int hi) { return (int)fmax(lo, fmin(hi, v)); }

typedef struct {
  uint8_t *data;
  size_t width;
  size_t height;
  size_t bytesPerRow;
} AURAPCImageBuffer;

// EXIF orientation을 픽셀에 bake (AURAFaceRatioUprightImage 패턴)
static UIImage *AURAPCUprightImage(UIImage *image) {
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

static CGImagePropertyOrientation AURAPCExifOrientation(CGImageSourceRef source) {
  NSDictionary *properties =
      CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
  NSNumber *orientation = properties[(NSString *)kCGImagePropertyOrientation];
  if (![orientation respondsToSelector:@selector(unsignedIntValue)]) {
    return kCGImagePropertyOrientationUp;
  }
  return (CGImagePropertyOrientation)orientation.unsignedIntValue;
}

// 캡처 파일의 aux data → AVSemanticSegmentationMatte (EXIF 정립)
static AVSemanticSegmentationMatte *AURAPCCopyMatte(CGImageSourceRef source,
                                                    CFStringRef auxiliaryDataType,
                                                    CGImagePropertyOrientation orientation) {
  NSDictionary *auxiliaryInfo =
      CFBridgingRelease(CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, 0, auxiliaryDataType));
  if (![auxiliaryInfo isKindOfClass:[NSDictionary class]]) {
    return nil;
  }
  NSError *error = nil;
  AVSemanticSegmentationMatte *matte = [AVSemanticSegmentationMatte
      semanticSegmentationMatteFromImageSourceAuxiliaryDataType:auxiliaryDataType
                                      dictionaryRepresentation:auxiliaryInfo
                                                         error:&error];
  if (!matte || error) {
    return nil;
  }
  return [matte semanticSegmentationMatteByApplyingExifOrientation:orientation];
}

// matte 알파 정규화 샘플 (single-component buffer). 호출 전 락 필요.
static double AURAPCSampleMatte(CVPixelBufferRef buffer, double nx, double ny) {
  if (!buffer) return 0.0;
  size_t width = CVPixelBufferGetWidth(buffer);
  size_t height = CVPixelBufferGetHeight(buffer);
  if (width == 0 || height == 0) return 0.0;
  int x = AURAPCClampInt((int)llround(AURAPCClamp01(nx) * ((double)width - 1.0)), 0, (int)width - 1);
  int y = AURAPCClampInt((int)llround(AURAPCClamp01(ny) * ((double)height - 1.0)), 0, (int)height - 1);
  uint8_t *baseAddress = CVPixelBufferGetBaseAddress(buffer);
  if (!baseAddress) return 0.0;
  size_t bytesPerRow = CVPixelBufferGetBytesPerRow(buffer);
  OSType pixelFormat = CVPixelBufferGetPixelFormatType(buffer);
  uint8_t *row = baseAddress + (size_t)y * bytesPerRow;
  if (pixelFormat == kCVPixelFormatType_OneComponent8) {
    return row[x] / 255.0;
  }
  if (pixelFormat == kCVPixelFormatType_OneComponent32Float) {
    float *floatRow = (float *)row;
    return AURAPCClamp01(floatRow[x]);
  }
  return 0.0;
}

// 스틸을 명시적 sRGB RGBA8 비트맵으로 1회 rasterize (DeviceRGB 아님 — P3 오염 방지)
static BOOL AURAPCRasterize(UIImage *upright, AURAPCImageBuffer *out) {
  CGImageRef cg = upright.CGImage;
  if (!cg) return NO;
  size_t width = CGImageGetWidth(cg);
  size_t height = CGImageGetHeight(cg);
  if (width == 0 || height == 0) return NO;
  size_t bytesPerRow = width * 4;
  uint8_t *data = calloc(height * bytesPerRow, sizeof(uint8_t));
  if (!data) return NO;
  CGColorSpaceRef colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef context = CGBitmapContextCreate(
      data, width, height, 8, bytesPerRow, colorSpace,
      kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(colorSpace);
  if (!context) {
    free(data);
    return NO;
  }
  CGContextDrawImage(context, CGRectMake(0, 0, width, height), cg);
  CGContextRelease(context);
  out->data = data;
  out->width = width;
  out->height = height;
  out->bytesPerRow = bytesPerRow;
  return YES;
}

// 정규화 좌표 → 픽셀 RGB (byte order R,G,B,A)
static void AURAPCPixel(AURAPCImageBuffer buf, double nx, double ny,
                        uint8_t *r, uint8_t *g, uint8_t *b) {
  int x = AURAPCClampInt((int)llround(AURAPCClamp01(nx) * ((double)buf.width - 1.0)), 0, (int)buf.width - 1);
  int y = AURAPCClampInt((int)llround(AURAPCClamp01(ny) * ((double)buf.height - 1.0)), 0, (int)buf.height - 1);
  uint8_t *px = buf.data + (size_t)y * buf.bytesPerRow + (size_t)x * 4;
  *r = px[0];
  *g = px[1];
  *b = px[2];
}

#pragma mark - 랜드마크 좌표

typedef struct { double x; double y; BOOL valid; } AURAPCPoint;

static AURAPCPoint AURAPCLandmark(NSArray<MPPNormalizedLandmark *> *landmarks, int index) {
  AURAPCPoint p = {0, 0, NO};
  if (index < 0 || (NSUInteger)index >= landmarks.count) return p;
  MPPNormalizedLandmark *lm = landmarks[index];
  p.x = AURAPCClamp01(lm.x);
  p.y = AURAPCClamp01(lm.y);
  p.valid = YES;
  return p;
}

static AURAPCPoint AURAPCClusterCenter(NSArray<MPPNormalizedLandmark *> *landmarks,
                                       const int *indices, int count) {
  double sx = 0, sy = 0;
  int n = 0;
  for (int i = 0; i < count; i++) {
    AURAPCPoint p = AURAPCLandmark(landmarks, indices[i]);
    if (!p.valid) continue;
    sx += p.x;
    sy += p.y;
    n++;
  }
  AURAPCPoint c = {0, 0, NO};
  if (n == 0) return c;
  c.x = sx / n;
  c.y = sy / n;
  c.valid = YES;
  return c;
}

// point-in-polygon (ray casting), 폴리곤은 정규화 좌표 배열
static BOOL AURAPCInsidePolygon(const double *px, const double *py, int count, double x, double y) {
  BOOL inside = NO;
  for (int i = 0, j = count - 1; i < count; j = i++) {
    BOOL intersect = ((py[i] > y) != (py[j] > y)) &&
                     (x < (px[j] - px[i]) * (y - py[i]) / (py[j] - py[i]) + px[i]);
    if (intersect) inside = !inside;
  }
  return inside;
}

#pragma mark - ROI 누적

typedef struct {
  double sumW, sumWR, sumWG, sumWB, sumWR2, sumWG2, sumWB2;
  long sampled;    // ROI 게이트 통과 후보 수 (분모)
  long accumulated; // specular 제외 후 실제 누적 수
  long overCount, underCount, specularCount;
  int hist[512];
} AURAPCAcc;

static void AURAPCAccInit(AURAPCAcc *a) {
  memset(a, 0, sizeof(AURAPCAcc));
}

// ROI 내부 후보 픽셀 1개 처리
static void AURAPCAccAdd(AURAPCAcc *a, uint8_t r, uint8_t g, uint8_t b, double weight) {
  a->sampled += 1;
  uint8_t mx = fmax(r, fmax(g, b));
  uint8_t mn = fmin(r, fmin(g, b));
  if (mx >= kOverExposedThreshold) a->overCount += 1;
  if (mx <= kUnderExposedThreshold) a->underCount += 1;
  // specular glint: near-white & 저채도 → 색 누적에서 제외
  if (mn >= kSpecularBrightMin && (mx - mn) <= kSpecularSatMax) {
    a->specularCount += 1;
    return;
  }
  double w = weight;
  a->sumW += w;
  a->sumWR += w * r;
  a->sumWG += w * g;
  a->sumWB += w * b;
  a->sumWR2 += w * r * r;
  a->sumWG2 += w * g * g;
  a->sumWB2 += w * b * b;
  a->accumulated += 1;
  int bin = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
  a->hist[bin] += 1;
}

static double AURAPCVar(double sumWc2, double sumWc, double sumW) {
  if (sumW <= 0) return 0.0;
  double mean = sumWc / sumW;
  double var = sumWc2 / sumW - mean * mean;
  return fmax(0.0, var);
}

static NSDictionary *AURAPCFinalizeRegion(AURAPCAcc *a) {
  if (a->sampled == 0 || a->sumW <= 0) return nil;
  double meanR = a->sumWR / a->sumW;
  double meanG = a->sumWG / a->sumW;
  double meanB = a->sumWB / a->sumW;

  int bestBin = 0;
  int bestCount = -1;
  for (int i = 0; i < 512; i++) {
    if (a->hist[i] > bestCount) {
      bestCount = a->hist[i];
      bestBin = i;
    }
  }
  double domR = ((bestBin >> 6) & 7) * 32 + 16;
  double domG = ((bestBin >> 3) & 7) * 32 + 16;
  double domB = (bestBin & 7) * 32 + 16;

  double coverage = 1.0; // ROI 게이트 통과율은 호출부에서 areaRatio로 별도 계산
  double overRatio = (double)a->overCount / (double)a->sampled;
  double underRatio = (double)a->underCount / (double)a->sampled;
  double specRatio = (double)a->specularCount / (double)a->sampled;

  double countTerm = fmin(1.0, (double)a->accumulated / kMinSamplesForFullConfidence);
  double expTerm = 1.0 - fmin(1.0, overRatio + underRatio);
  double specTerm = 1.0 - fmin(1.0, specRatio);
  double confidence = fmax(0.0, fmin(1.0, 0.5 * countTerm + 0.3 * expTerm + 0.2 * specTerm));
  (void)coverage;

  return @{
    @"rgbMean": @{@"r": @(meanR), @"g": @(meanG), @"b": @(meanB)},
    @"rgbVariance": @{
      @"r": @(AURAPCVar(a->sumWR2, a->sumWR, a->sumW)),
      @"g": @(AURAPCVar(a->sumWG2, a->sumWG, a->sumW)),
      @"b": @(AURAPCVar(a->sumWB2, a->sumWB, a->sumW)),
    },
    @"dominant": @{@"r": @(domR), @"g": @(domG), @"b": @(domB)},
    @"sampleCount": @(a->accumulated),
    @"overexposedRatio": @(overRatio),
    @"underexposedRatio": @(underRatio),
    @"specularRejectedRatio": @(specRatio),
    @"confidence": @(confidence),
  };
}

#pragma mark - Module

@interface AURAPersonalColorAnalyzer : NSObject <RCTBridgeModule>
@end

@implementation AURAPersonalColorAnalyzer {
  MPPFaceLandmarker *_faceLandmarker;
  NSString *_faceLandmarkerInitError;
}

RCT_EXPORT_MODULE();

- (dispatch_queue_t)methodQueue {
  return dispatch_queue_create("com.aura.personal-color-analyzer", DISPATCH_QUEUE_SERIAL);
}

- (MPPFaceLandmarker *)imageModeFaceLandmarker {
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
  NSError *error = nil;
  _faceLandmarker = [[MPPFaceLandmarker alloc] initWithOptions:options error:&error];
  if (!_faceLandmarker || error) {
    _faceLandmarkerInitError =
        error.localizedDescription ?: @"MediaPipe FaceLandmarker initialization failed.";
  }
  return _faceLandmarker;
}

RCT_EXPORT_METHOD(analyze:(NSString *)imageUri
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSURL *url = [NSURL URLWithString:imageUri];
  NSString *path = url.isFileURL ? url.path : imageUri;
  NSURL *imageFileURL = url.isFileURL ? url : [NSURL fileURLWithPath:path];

  UIImage *image = [UIImage imageWithContentsOfFile:path];
  if (image == nil) {
    resolve(@{@"status": @"error", @"faceCount": @0, @"error": @"image_unavailable"});
    return;
  }
  UIImage *uprightImage = AURAPCUprightImage(image);

  MPPFaceLandmarker *landmarker = [self imageModeFaceLandmarker];
  if (!landmarker) {
    resolve(@{@"status": @"unsupported", @"faceCount": @0,
              @"error": self->_faceLandmarkerInitError ?: @"landmarker_unavailable"});
    return;
  }

  NSError *error = nil;
  MPPImage *mpImage = [[MPPImage alloc] initWithUIImage:uprightImage error:&error];
  if (!mpImage || error) {
    resolve(@{@"status": @"error", @"faceCount": @0, @"error": @"mp_image_failed"});
    return;
  }
  MPPFaceLandmarkerResult *result = [landmarker detectImage:mpImage error:&error];
  if (!result || error) {
    resolve(@{@"status": @"error", @"faceCount": @0, @"error": @"detection_failed"});
    return;
  }

  NSUInteger faceCount = result.faceLandmarks.count;
  double imgW = uprightImage.size.width;
  double imgH = uprightImage.size.height;
  if (faceCount == 0) {
    resolve(@{@"status": @"no_face", @"faceCount": @0,
              @"imageWidth": @(imgW), @"imageHeight": @(imgH), @"colorSpace": @"srgb"});
    return;
  }
  NSArray<MPPNormalizedLandmark *> *landmarks = result.faceLandmarks.firstObject;

  // sRGB rasterize
  AURAPCImageBuffer colorBuf = {0};
  if (!AURAPCRasterize(uprightImage, &colorBuf)) {
    resolve(@{@"status": @"error", @"faceCount": @(faceCount), @"error": @"rasterize_failed"});
    return;
  }

  // matte 재구성
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)imageFileURL, NULL);
  CGImagePropertyOrientation orientation =
      source ? AURAPCExifOrientation(source) : kCGImagePropertyOrientationUp;
  AVSemanticSegmentationMatte *hairMatte = source
      ? AURAPCCopyMatte(source, kCGImageAuxiliaryDataTypeSemanticSegmentationHairMatte, orientation)
      : nil;
  AVSemanticSegmentationMatte *skinMatte = source
      ? AURAPCCopyMatte(source, kCGImageAuxiliaryDataTypeSemanticSegmentationSkinMatte, orientation)
      : nil;
  if (source) CFRelease(source);

  CVPixelBufferRef hairBuf = hairMatte.mattingImage;
  CVPixelBufferRef skinBuf = skinMatte.mattingImage;
  if (hairBuf) CVPixelBufferLockBaseAddress(hairBuf, kCVPixelBufferLock_ReadOnly);
  if (skinBuf) CVPixelBufferLockBaseAddress(skinBuf, kCVPixelBufferLock_ReadOnly);

  NSMutableArray<NSString *> *warnings = [NSMutableArray array];
  NSMutableDictionary *regions = [NSMutableDictionary dictionary];

  double faceWidth = 0.0;
  AURAPCPoint left = AURAPCLandmark(landmarks, 234);
  AURAPCPoint right = AURAPCLandmark(landmarks, 454);
  if (left.valid && right.valid) faceWidth = fabs(right.x - left.x);
  if (faceWidth < 1e-4) faceWidth = 0.3;

  // ---- Skin 3패치 (landmark 배치 + skin-matte 게이트) ----
  NSDictionary *skinClusters = @{
    @"skinCheekLeft": [NSValue valueWithPointer:kLeftCheekIndices],
    @"skinCheekRight": [NSValue valueWithPointer:kRightCheekIndices],
    @"skinForehead": [NSValue valueWithPointer:kForeheadIndices],
  };
  NSDictionary *skinCounts = @{
    @"skinCheekLeft": @(6),
    @"skinCheekRight": @(6),
    @"skinForehead": @(5),
  };
  for (NSString *key in skinClusters) {
    const int *indices = (const int *)[skinClusters[key] pointerValue];
    int count = [skinCounts[key] intValue];
    AURAPCPoint center = AURAPCClusterCenter(landmarks, indices, count);
    if (!center.valid) continue;

    AURAPCAcc acc;
    AURAPCAccInit(&acc);
    double radius = faceWidth * kSkinPatchRadiusFraction;
    long gridSampled = 0;
    long gridGated = 0;
    for (int gy = 0; gy < kSkinPatchGridSteps; gy++) {
      for (int gx = 0; gx < kSkinPatchGridSteps; gx++) {
        double fx = ((double)gx / (kSkinPatchGridSteps - 1)) * 2.0 - 1.0;
        double fy = ((double)gy / (kSkinPatchGridSteps - 1)) * 2.0 - 1.0;
        if (fx * fx + fy * fy > 1.0) continue; // 원반
        gridSampled += 1;
        double nx = center.x + fx * radius;
        double ny = center.y + fy * radius;
        double alpha = skinBuf ? AURAPCSampleMatte(skinBuf, nx, ny) : 1.0;
        if (skinBuf && alpha < kSkinAlphaGate) continue;
        gridGated += 1;
        uint8_t r, g, b;
        AURAPCPixel(colorBuf, nx, ny, &r, &g, &b);
        AURAPCAccAdd(&acc, r, g, b, skinBuf ? alpha : 1.0);
      }
    }
    NSDictionary *stats = AURAPCFinalizeRegion(&acc);
    if (stats) {
      double coverage = gridSampled > 0 ? (double)gridGated / (double)gridSampled : 0.0;
      NSMutableDictionary *m = [stats mutableCopy];
      m[@"areaRatio"] = @(coverage);
      m[@"matteCoverage"] = @(coverage);
      regions[key] = m;
    }
  }

  // ---- Hair (matte 주도) ----
  if (hairBuf) {
    AURAPCPoint foreheadTop = AURAPCLandmark(landmarks, 10);
    if (foreheadTop.valid && left.valid && right.valid) {
      double cx = (left.x + right.x) / 2.0;
      double x0 = cx - 0.5 * faceWidth;
      double x1 = cx + 0.5 * faceWidth;
      double y0 = foreheadTop.y - 0.5 * faceWidth;
      double y1 = foreheadTop.y - 0.05 * faceWidth;
      AURAPCAcc acc;
      AURAPCAccInit(&acc);
      long gridSampled = 0, gridGated = 0;
      for (int gy = 0; gy < kHairGridStepsY; gy++) {
        for (int gx = 0; gx < kHairGridStepsX; gx++) {
          double nx = x0 + (x1 - x0) * ((double)gx + 0.5) / kHairGridStepsX;
          double ny = y0 + (y1 - y0) * ((double)gy + 0.5) / kHairGridStepsY;
          if (ny < 0.0 || ny > 1.0) continue;
          gridSampled += 1;
          double alpha = AURAPCSampleMatte(hairBuf, nx, ny);
          if (alpha < kHairAlphaGate) continue;
          gridGated += 1;
          uint8_t r, g, b;
          AURAPCPixel(colorBuf, nx, ny, &r, &g, &b);
          AURAPCAccAdd(&acc, r, g, b, alpha);
        }
      }
      NSDictionary *stats = AURAPCFinalizeRegion(&acc);
      if (stats) {
        double coverage = gridSampled > 0 ? (double)gridGated / (double)gridSampled : 0.0;
        NSMutableDictionary *m = [stats mutableCopy];
        m[@"areaRatio"] = @(coverage);
        m[@"matteCoverage"] = @(coverage);
        regions[@"hair"] = m;
      }
    }
  } else {
    [warnings addObject:@"hair_matte_unavailable"];
  }

  // ---- Lip (landmark 폴리곤; 입술 matte 없음) ----
  {
    double outerX[kOuterLipCount], outerY[kOuterLipCount];
    double innerX[kInnerLipCount], innerY[kInnerLipCount];
    BOOL lipValid = YES;
    double minX = 1.0, maxX = 0.0, minY = 1.0, maxY = 0.0;
    for (int i = 0; i < kOuterLipCount; i++) {
      AURAPCPoint p = AURAPCLandmark(landmarks, kOuterLipIndices[i]);
      if (!p.valid) { lipValid = NO; break; }
      outerX[i] = p.x; outerY[i] = p.y;
      minX = fmin(minX, p.x); maxX = fmax(maxX, p.x);
      minY = fmin(minY, p.y); maxY = fmax(maxY, p.y);
    }
    for (int i = 0; i < kInnerLipCount && lipValid; i++) {
      AURAPCPoint p = AURAPCLandmark(landmarks, kInnerLipIndices[i]);
      if (!p.valid) { lipValid = NO; break; }
      innerX[i] = p.x; innerY[i] = p.y;
    }
    if (lipValid && maxX > minX && maxY > minY) {
      AURAPCAcc acc;
      AURAPCAccInit(&acc);
      long gridSampled = 0, gridGated = 0;
      for (int gy = 0; gy < kLipGridStepsY; gy++) {
        for (int gx = 0; gx < kLipGridStepsX; gx++) {
          double nx = minX + (maxX - minX) * ((double)gx + 0.5) / kLipGridStepsX;
          double ny = minY + (maxY - minY) * ((double)gy + 0.5) / kLipGridStepsY;
          gridSampled += 1;
          if (!AURAPCInsidePolygon(outerX, outerY, kOuterLipCount, nx, ny)) continue;
          if (AURAPCInsidePolygon(innerX, innerY, kInnerLipCount, nx, ny)) continue; // 치아/입안 제외
          gridGated += 1;
          uint8_t r, g, b;
          AURAPCPixel(colorBuf, nx, ny, &r, &g, &b);
          AURAPCAccAdd(&acc, r, g, b, 1.0);
        }
      }
      NSDictionary *stats = AURAPCFinalizeRegion(&acc);
      if (stats) {
        double coverage = gridSampled > 0 ? (double)gridGated / (double)gridSampled : 0.0;
        NSMutableDictionary *m = [stats mutableCopy];
        m[@"areaRatio"] = @(coverage);
        m[@"matteCoverage"] = @(1.0);
        regions[@"lip"] = m;
      }
    } else {
      [warnings addObject:@"lip_landmarks_unavailable"];
    }
  }

  if (hairBuf) CVPixelBufferUnlockBaseAddress(hairBuf, kCVPixelBufferLock_ReadOnly);
  if (skinBuf) CVPixelBufferUnlockBaseAddress(skinBuf, kCVPixelBufferLock_ReadOnly);
  free(colorBuf.data);

  NSDictionary *payload = @{
    @"status": @"ok",
    @"faceCount": @(faceCount),
    @"landmarkCount": @(landmarks.count),
    @"imageWidth": @(imgW),
    @"imageHeight": @(imgH),
    @"colorSpace": @"srgb",
    @"matte": @{
      @"skinAvailable": @(skinBuf != NULL),
      @"hairAvailable": @(hairBuf != NULL),
      @"matteWidth": @(skinBuf ? (double)CVPixelBufferGetWidth(skinBuf) : 0.0),
      @"matteHeight": @(skinBuf ? (double)CVPixelBufferGetHeight(skinBuf) : 0.0),
    },
    @"regions": regions,
    @"warnings": warnings,
  };

  NSLog(@"[aura:personal-color] native analyze status=ok faces=%lu regions=%lu hairMatte=%d skinMatte=%d",
        (unsigned long)faceCount, (unsigned long)regions.count, hairBuf != NULL, skinBuf != NULL);

  resolve(payload);
}

@end
