#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
#import <Vision/Vision.h>
#import <CoreVideo/CoreVideo.h>
#import <ImageIO/ImageIO.h>
#import <CoreGraphics/CoreGraphics.h>

// AURAPersonalColorAnalyzer — 온디바이스 퍼스널 컬러 ROI 색 통계.
// LOCKED: CPU 픽셀 루프(Core Image 미사용), 알파 가중은 별도 matte 버퍼에서만.
// 반환 스키마는 src/features/personal-color/services/personalColorCore/contracts.ts의
// NativePersonalColorResult 와 일치.
//
// 얼굴 검출은 하지 않는다. CocoaPods MediaPipe 는 Unity homuler MediaPipe 와 중복
// 크래시를 일으켜 제거됐고(020cb33), 랜드마크는 Unity homuler(IMAGE 모드)가 검출해
// options[@"landmarks"] 로 넘겨준다. homuler 는 MediaPipe 와 동일한 478점 메시라
// 기존 인덱스 상수(234/454/10, 입술·볼 클러스터)를 그대로 쓴다.
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

// 흰자(sclera) — 조명 캐스트 추정용(illuminationCorrection). 눈꺼풀 링 폴리곤 내부에서
// 어두운 픽셀(홍채/동공/속눈썹)·고채도 픽셀(홍채색/메이크업)을 로컬 게이트로 제외.
// 인덱스 저역=scleraLeft(피사체 우측 눈, cheek 명명 규약과 동일), 고역=scleraRight.
static const int kScleraLeftEyeIndices[] = {33, 7, 163, 144, 145, 153, 154, 155,
                                            133, 173, 157, 158, 159, 160, 161, 246};
static const int kScleraRightEyeIndices[] = {263, 249, 390, 373, 374, 380, 381, 382,
                                             362, 398, 384, 385, 386, 387, 388, 466};
static const int kScleraEyeIndexCount = 16;
// 그리드 밀도 — 코너/하단 trim·코호트 게이트로 잃는 표본을 보상(실기기 자리 촬영
// too_few_samples 해결). 중복 픽셀은 bbox 픽셀 클램프가 방지.
// 조밀화(2026-07-19): 흰자는 좁은 눈에서 개구부의 얇은 띠라 36x22로는 색-게이트 통과
// 픽셀이 눈당 8개(≥8 게이트 경계)로 아슬했다. 64x32로 올려 실사진 2장 모두 눈당 13~46px
// 확보(중복은 bbox 픽셀 클램프가 방지). calibration target.
static const int kScleraGridStepsX = 64;
static const int kScleraGridStepsY = 32;
// 색-기반 흰자 선택 하한(2026-07-19): 흰자는 '모든 채널이 밝은' 픽셀이다.
// min(r,g,b) 하한이라 적색만 높은 분홍조직(waterline·눈물언덕·충혈 실핏줄)은 통과
// 불가 — max 채널 하한(구 kScleraDarkMin=60)은 붉은 픽셀을 빨강 채널만으로 통과시켰다.
// 실패 실사진 2장 스윕: 140이면 진짜 흰자(L*70~77)만 잡히고 홍채 그늘(L*40)은 전멸,
// 150은 좁은 눈에서 수율이 4~5px로 붕괴. 140 채택. calibration target.
static const uint8_t kScleraMinChannel = 140;
// 실측 실험(2026-07-18): 20%로 조였더니 표본이 눈당 34/46→4/5로 88% 급감.
// 흰자 픽셀 대부분이 20~28% 채도(분홍빛)에 분포 = 확산성 충혈로, 중립 백색은
// 눈당 4-5개뿐이었다. 즉 붉음은 ROI 오염이 아니라 실제 충혈이며(충혈 게이트가
// 올바르게 감지·스킵), 채도 게이트를 조여도 흰자가 실제로 붉어 소용없다. 28 유지.
static const int kScleraSatRelPctMax = 28; // (mx-mn) ≤ mx의 28% — 상대 채도(밝기 적응). 홍채색/메이크업 배제
// 오염 방어(실기기에서 붉은기 오염 → 전역 red-cut 편향 확인):
static const double kScleraMinOpenRatio = 0.2;  // 픽셀 공간 세로/가로 비 이 미만 = 감은/가는 눈 → 스킵
static const double kScleraCornerTrim = 0.2;    // bbox 좌우 각 20% 제외 — 눈물언덕(분홍) 등 코너 조직 배제
// (2026-07-19 폐지) kScleraLowerTrim·kScleraBrightQuantile·kScleraBrightFraction·kScleraDarkMin:
// 하단 위치 트림은 좁게 뜬 눈에서 가장 밝은 진짜 흰자 띠(개구부 하단)를 통째로 잘랐고,
// 상대 밝기 코호트는 홍채가 밴드를 지배하면 "어두운 것들 중 상위 10%"를 흰자로 오인했다.
// 실패 실사진 재현으로 확인 후 색-기반 선택(kScleraMinChannel)으로 대체.

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

// Apple Vision person(전경) 세그멘테이션 마스크. main 앱은 Unity/ARKit로 촬영해 사진에
// AVFoundation 시맨틱 매트(머리/피부)를 임베드하지 않으므로, 헤어 매트가 없을 때 이 전경
// 마스크로 머리 영역(이마 위 박스)의 배경을 걸러낸다 — Unity의 E7VisionFaceParsing이 쓰는
// 것과 동일한 person-seg 방식. 반환 버퍼는 lock+retain 되어 오며 호출측이 unlock+release.
// 실패 시 NULL. AURAPCSampleMatte 가 OneComponent8 을 그대로 소화한다(0..255→0..1).
static CVPixelBufferRef AURAPCCopyPersonMask(UIImage *image) {
  if (image == nil) return NULL;
  CGImageRef cg = image.CGImage;
  if (cg == NULL) return NULL;
  VNGeneratePersonSegmentationRequest *request =
      [[VNGeneratePersonSegmentationRequest alloc] init];
  request.qualityLevel = VNGeneratePersonSegmentationRequestQualityLevelBalanced;
  request.outputPixelFormat = kCVPixelFormatType_OneComponent8;
  // uprightImage 는 이미 EXIF 정립본이라 orientation Up — 아래 정규화 좌표 샘플링과 정합.
  VNImageRequestHandler *handler =
      [[VNImageRequestHandler alloc] initWithCGImage:cg
                                         orientation:kCGImagePropertyOrientationUp
                                             options:@{}];
  NSError *error = nil;
  if (![handler performRequests:@[ request ] error:&error] || error != nil) {
    return NULL;
  }
  VNPixelBufferObservation *observation = request.results.firstObject;
  CVPixelBufferRef mask = observation.pixelBuffer;
  if (mask == NULL) return NULL;
  CVPixelBufferRetain(mask);
  CVPixelBufferLockBaseAddress(mask, kCVPixelBufferLock_ReadOnly);
  return mask;
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

// Unity homuler 가 넘겨준 정규화 랜드마크. 각 항목의 `i` 필드를 슬롯 번호로 삼아
// 인덱스 직접 접근이 가능한 C 배열로 채운다(전송 순서에 의존하지 않는다).
typedef struct {
  AURAPCPoint *points;
  int capacity;
} AURAPCLandmarkSet;

static AURAPCLandmarkSet AURAPCLandmarkSetFromJS(NSArray *jsPoints) {
  AURAPCLandmarkSet set = {NULL, 0};
  if (jsPoints.count == 0) return set;

  int maxIndex = -1;
  for (id entry in jsPoints) {
    if (![entry isKindOfClass:NSDictionary.class]) continue;
    int index = [entry[@"i"] intValue];
    if (index > maxIndex) maxIndex = index;
  }
  if (maxIndex < 0) return set;

  int capacity = maxIndex + 1;
  set.points = calloc((size_t)capacity, sizeof(AURAPCPoint));
  if (!set.points) return set;
  set.capacity = capacity;

  for (id entry in jsPoints) {
    if (![entry isKindOfClass:NSDictionary.class]) continue;
    int index = [entry[@"i"] intValue];
    if (index < 0 || index >= capacity) continue;
    NSNumber *xNum = entry[@"x"];
    NSNumber *yNum = entry[@"y"];
    if (![xNum isKindOfClass:NSNumber.class] || ![yNum isKindOfClass:NSNumber.class]) continue;
    set.points[index].x = AURAPCClamp01(xNum.doubleValue);
    set.points[index].y = AURAPCClamp01(yNum.doubleValue);
    set.points[index].valid = YES;
  }
  return set;
}

static void AURAPCLandmarkSetFree(AURAPCLandmarkSet *set) {
  if (set && set->points) {
    free(set->points);
    set->points = NULL;
    set->capacity = 0;
  }
}

static AURAPCPoint AURAPCLandmark(AURAPCLandmarkSet landmarks, int index) {
  AURAPCPoint p = {0, 0, NO};
  if (!landmarks.points || index < 0 || index >= landmarks.capacity) return p;
  return landmarks.points[index];
}

static AURAPCPoint AURAPCClusterCenter(AURAPCLandmarkSet landmarks,
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
  // 채널별 256-히스토그램 — 중앙값(median) 산출용. 평균은 소수 이상치(국소
  // 실핏줄)에 끌려가지만, 중앙값은 breakdown 50%라 소수 붉은 픽셀을 자동 무시한다.
  int rHist[256], gHist[256], bHist[256];
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
  a->rHist[r] += 1;
  a->gHist[g] += 1;
  a->bHist[b] += 1;
}

static double AURAPCVar(double sumWc2, double sumWc, double sumW) {
  if (sumW <= 0) return 0.0;
  double mean = sumWc / sumW;
  double var = sumWc2 / sumW - mean * mean;
  return fmax(0.0, var);
}

// 채널 히스토그램의 중앙값(50번째 백분위) 채널값. total = 누적 픽셀 수.
static double AURAPCMedianFromHist(const int *hist, long total) {
  if (total <= 0) return 0.0;
  long half = total / 2;
  long cum = 0;
  for (int v = 0; v < 256; v++) {
    cum += hist[v];
    if (cum > half) return (double)v;
  }
  return 255.0;
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

  // 채널별 중앙값 — 조명 캐스트 추정(흰자)에서 rgbMean 대신 쓴다. 소수 국소
  // 실핏줄에 강건: breakdown 50%라 붉은 픽셀이 절반 미만이면 중앙값은 깨끗한
  // 흰자색을 가리키고, 절반을 넘으면(전반적 충혈) 중앙값도 붉어 충혈 게이트가 스킵.
  double medR = AURAPCMedianFromHist(a->rHist, a->accumulated);
  double medG = AURAPCMedianFromHist(a->gHist, a->accumulated);
  double medB = AURAPCMedianFromHist(a->bHist, a->accumulated);

  return @{
    @"rgbMean": @{@"r": @(meanR), @"g": @(meanG), @"b": @(meanB)},
    @"rgbMedian": @{@"r": @(medR), @"g": @(medG), @"b": @(medB)},
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

@implementation AURAPersonalColorAnalyzer

RCT_EXPORT_MODULE();

- (dispatch_queue_t)methodQueue {
  return dispatch_queue_create("com.aura.personal-color-analyzer", DISPATCH_QUEUE_SERIAL);
}

RCT_EXPORT_METHOD(analyze:(NSString *)imageUri
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  (void)reject;

  NSURL *url = [NSURL URLWithString:imageUri];
  NSString *path = url.isFileURL ? url.path : imageUri;
  NSURL *imageFileURL = url.isFileURL ? url : [NSURL fileURLWithPath:path];

  UIImage *image = [UIImage imageWithContentsOfFile:path];
  if (image == nil) {
    resolve(@{@"status": @"error", @"faceCount": @0, @"error": @"image_unavailable"});
    return;
  }
  UIImage *uprightImage = AURAPCUprightImage(image);

  double imgW = uprightImage.size.width;
  double imgH = uprightImage.size.height;

  // 랜드마크는 Unity homuler(IMAGE 모드)가 검출해 JS 를 통해 넘겨준다.
  // 없으면 얼굴 검출 자체가 불가하므로 unsupported 로 알린다(호출측이 격리).
  NSDictionary *landmarkInput =
      [options isKindOfClass:NSDictionary.class] ? options[@"landmarks"] : nil;
  if (![landmarkInput isKindOfClass:NSDictionary.class]) {
    resolve(@{@"status": @"unsupported", @"faceCount": @0,
              @"error": @"face landmarks were not provided (homuler landmark service unavailable)"});
    return;
  }

  NSArray *jsPoints = landmarkInput[@"points"];
  if (![jsPoints isKindOfClass:NSArray.class] || jsPoints.count == 0) {
    resolve(@{@"status": @"no_face", @"faceCount": @0,
              @"imageWidth": @(imgW), @"imageHeight": @(imgH), @"colorSpace": @"srgb"});
    return;
  }

  AURAPCLandmarkSet landmarks = AURAPCLandmarkSetFromJS(jsPoints);
  if (landmarks.capacity == 0) {
    AURAPCLandmarkSetFree(&landmarks);
    resolve(@{@"status": @"no_face", @"faceCount": @0,
              @"imageWidth": @(imgW), @"imageHeight": @(imgH), @"colorSpace": @"srgb"});
    return;
  }
  NSUInteger faceCount = 1;
  NSUInteger landmarkCount = jsPoints.count;

  // sRGB rasterize
  AURAPCImageBuffer colorBuf = {0};
  if (!AURAPCRasterize(uprightImage, &colorBuf)) {
    AURAPCLandmarkSetFree(&landmarks);
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

  // 헤어 게이트 소스: AVFoundation 헤어 매트가 있으면 그것, 없으면(Unity/ARKit 촬영)
  // Apple Vision person 세그멘테이션으로 대체. 머리 박스는 이마 위에 기하로 놓여 있어,
  // '전경(=사람)' 픽셀만 누적하면 배경을 걸러낸 머리색이 나온다.
  CVPixelBufferRef personMaskBuf = hairBuf ? NULL : AURAPCCopyPersonMask(uprightImage);
  CVPixelBufferRef hairGateBuf = hairBuf ? hairBuf : personMaskBuf;
  double hairGate = hairBuf ? kHairAlphaGate : 0.5; // person 마스크는 전경 임계(≈0/1)
  if (personMaskBuf) [warnings addObject:@"hair_from_person_segmentation"];

  // 랜드마크 정규화 좌표는 EXIF 적용된 upright 프레임 기준이어야 한다(아래 샘플링이
  // uprightImage 를 쓰기 때문). Unity 가 다른 방향으로 디코드했다면 종횡비가 어긋나므로
  // 계측 가능한 경고로 남긴다 — 조용히 틀린 색을 뽑는 것보다 낫다.
  double jsW = [landmarkInput[@"imageWidth"] doubleValue];
  double jsH = [landmarkInput[@"imageHeight"] doubleValue];
  if (jsW > 0.0 && jsH > 0.0 && imgW > 0.0 && imgH > 0.0) {
    double jsAspect = jsW / jsH;
    double nativeAspect = imgW / imgH;
    if (fabs(jsAspect - nativeAspect) > 0.02 * nativeAspect) {
      [warnings addObject:@"landmark_frame_mismatch"];
    }
  }

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

  // ---- Hair (AVFoundation 매트 또는 Vision person-seg 게이트 주도) ----
  if (hairGateBuf) {
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
          double alpha = AURAPCSampleMatte(hairGateBuf, nx, ny);
          if (alpha < hairGate) continue;
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

  // ---- Sclera 좌/우 (눈꺼풀 링 폴리곤; 축 계산 불참 — 조명 캐스트 추정 전용) ----
  {
    const int *eyeIdx[2] = {kScleraLeftEyeIndices, kScleraRightEyeIndices};
    NSString *eyeKeys[2] = {@"scleraLeft", @"scleraRight"};
    BOOL anyValid = NO;
    for (int e = 0; e < 2; e++) {
      double ringX[kScleraEyeIndexCount], ringY[kScleraEyeIndexCount];
      BOOL valid = YES;
      double minX = 1.0, maxX = 0.0, minY = 1.0, maxY = 0.0;
      for (int i = 0; i < kScleraEyeIndexCount; i++) {
        AURAPCPoint p = AURAPCLandmark(landmarks, eyeIdx[e][i]);
        if (!p.valid) { valid = NO; break; }
        ringX[i] = p.x; ringY[i] = p.y;
        minX = fmin(minX, p.x); maxX = fmax(maxX, p.x);
        minY = fmin(minY, p.y); maxY = fmax(maxY, p.y);
      }
      if (!valid || maxX <= minX || maxY <= minY) continue;
      // 감은/블링크 눈 fail-safe: 픽셀 공간 종횡비로 판정(정규화 좌표는 이미지
      // 비율에 왜곡됨). 링이 슬리버로 붕괴하면 눈꺼풀 피부가 흰자로 오염된다.
      double bboxW = maxX - minX;
      double bboxH = maxY - minY;
      double ringWpx = bboxW * (double)imgW;
      double ringHpx = bboxH * (double)imgH;
      if (ringHpx < ringWpx * kScleraMinOpenRatio) continue;
      anyValid = YES;
      // 눈 코너(눈물언덕 등 분홍 조직) 제외 — 좌우 코너만 트림. 하단 트림은 폐지:
      // 실기기 실사진 검증(2026-07-19)에서 좁게 뜬 눈은 중앙 밴드가 거의 홍채로 채워지고,
      // 가장 밝은 진짜 흰자 띠가 개구부 '하단'에 있어 kScleraLowerTrim(0.18)이 그걸
      // 통째로 잘라냈다(→ 상위 코호트조차 홍채 그늘 L*≈40). waterline 분홍은 아래
      // 색-기반 게이트(min채널+저채도)가 배제하므로 위치 트림이 불필요하다.
      double bandMinX = minX + bboxW * kScleraCornerTrim;
      double bandMaxX = maxX - bboxW * kScleraCornerTrim;
      // 작은 눈에서 같은 픽셀 중복 샘플로 sampleCount가 부풀지 않게 그리드를 bbox 픽셀 크기로 클램프
      int stepsX = (int)fmax(1.0, fmin((double)kScleraGridStepsX, floor(ringWpx)));
      int stepsY = (int)fmax(1.0, fmin((double)kScleraGridStepsY, floor(ringHpx)));
      // 색-기반 흰자 선택(2026-07-19, 실사진 시뮬레이션 검증): 종전 상대 밝기 코호트
      // (p90×0.75)는 "어두운 영역의 상위 10%도 어둡다"는 함정이 있었다 — 홍채가 밴드를
      // 지배하면 코호트가 홍채 그늘을 흰자로 오인(실측 L*44, 충혈 게이트가 결국 거부).
      // 흰자는 '모든 채널이 밝고(min≥kScleraMinChannel) 색기가 적은(상대채도≤28%)'
      // 픽셀이라는 절대 색 기준으로 직접 선별한다. 홍채/속눈썹/그늘(어두움)·눈물언덕/
      // waterline(분홍=적색만 높음)은 자동 탈락. 같은 사진 시뮬 결과: 종전 (107,90,87)
      // L*40 → 색규칙 (207~214,170~186,164~177) L*73~78(진짜 흰자).
      AURAPCAcc acc;
      AURAPCAccInit(&acc);
      long gridSampled = 0, gridGated = 0;
      for (int gy = 0; gy < stepsY; gy++) {
        for (int gx = 0; gx < stepsX; gx++) {
          double nx = minX + bboxW * ((double)gx + 0.5) / stepsX;
          double ny = minY + bboxH * ((double)gy + 0.5) / stepsY;
          gridSampled += 1;
          if (nx < bandMinX || nx > bandMaxX) continue;
          if (!AURAPCInsidePolygon(ringX, ringY, kScleraEyeIndexCount, nx, ny)) continue;
          uint8_t r, g, b;
          AURAPCPixel(colorBuf, nx, ny, &r, &g, &b);
          uint8_t mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
          uint8_t mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
          if (mn < kScleraMinChannel) continue; // 홍채/속눈썹/그늘/분홍조직 — 흰자는 전 채널이 밝다
          if ((int)(mx - mn) * 100 > kScleraSatRelPctMax * (int)mx) continue; // 상대 채도: 홍채색/메이크업
          gridGated += 1;
          AURAPCAccAdd(&acc, r, g, b, 1.0); // 내장 specular 게이트가 글린트 제거
        }
      }
      NSDictionary *stats = AURAPCFinalizeRegion(&acc);
      if (stats) {
        double coverage = gridSampled > 0 ? (double)gridGated / (double)gridSampled : 0.0;
        NSMutableDictionary *m = [stats mutableCopy];
        m[@"areaRatio"] = @(coverage);
        m[@"matteCoverage"] = @(1.0);
        regions[eyeKeys[e]] = m;
      }
    }
    if (!anyValid) {
      [warnings addObject:@"sclera_landmarks_unavailable"];
    }
  }

  if (hairBuf) CVPixelBufferUnlockBaseAddress(hairBuf, kCVPixelBufferLock_ReadOnly);
  if (skinBuf) CVPixelBufferUnlockBaseAddress(skinBuf, kCVPixelBufferLock_ReadOnly);
  if (personMaskBuf) {
    CVPixelBufferUnlockBaseAddress(personMaskBuf, kCVPixelBufferLock_ReadOnly);
    CVPixelBufferRelease(personMaskBuf);
  }
  free(colorBuf.data);
  AURAPCLandmarkSetFree(&landmarks);

  NSDictionary *payload = @{
    @"status": @"ok",
    @"faceCount": @(faceCount),
    @"landmarkCount": @(landmarkCount),
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
