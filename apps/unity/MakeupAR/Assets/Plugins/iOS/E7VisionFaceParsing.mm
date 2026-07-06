#import <CoreGraphics/CoreGraphics.h>
#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <Vision/Vision.h>
#include <stdlib.h>
#include <string.h>

// Face parsing for the semantic foundation pipeline.
//
// Input : screen-capture PNG (upright), desired mask resolution.
// Output: five single-channel 8-bit masks written into outMasks
//         (maskWidth * maskHeight bytes each, concatenated in the order
//         skin, hair, lip, eye, brow), rows bottom-up so Unity can
//         LoadRawTextureData them directly (screen UV space, v=0 bottom).
//
// Sources:
//  - VNDetectFaceLandmarksRequest: precise per-frame polygons for the face
//    contour, eye openings, outer lips and eyebrows.
//  - VNGeneratePersonSegmentationRequest (iOS 15+): person/foreground mask;
//    hair, clothing, and background separate from face/neck skin through
//    the region difference. When unavailable, person defaults to full so
//    the geometry region alone drives the masks.
//
// Return codes: 0 ok, -1 invalid input, -2 decode failed, -3 vision failed,
// -4 no face, -5 landmarks missing.

static const int kE7ParsingMaskCount = 5;

typedef struct {
  unsigned char *data;
  CGContextRef context;
  int width;
  int height;
} E7GrayCanvas;

static bool E7CreateGrayCanvas(E7GrayCanvas *canvas, int width, int height)
{
  canvas->width = width;
  canvas->height = height;
  canvas->data = (unsigned char *)calloc((size_t)width * (size_t)height, 1);
  if (canvas->data == NULL) {
    return false;
  }

  CGColorSpaceRef gray = CGColorSpaceCreateDeviceGray();
  canvas->context = CGBitmapContextCreate(
    canvas->data, (size_t)width, (size_t)height, 8, (size_t)width, gray, (uint32_t)kCGImageAlphaNone);
  CGColorSpaceRelease(gray);
  if (canvas->context == NULL) {
    free(canvas->data);
    canvas->data = NULL;
    return false;
  }

  CGContextSetGrayFillColor(canvas->context, 1.0, 1.0);
  CGContextSetGrayStrokeColor(canvas->context, 1.0, 1.0);
  return true;
}

static void E7ReleaseGrayCanvas(E7GrayCanvas *canvas)
{
  if (canvas->context != NULL) {
    CGContextRelease(canvas->context);
    canvas->context = NULL;
  }

  if (canvas->data != NULL) {
    free(canvas->data);
    canvas->data = NULL;
  }
}

// CG bitmap memory is top-row-first; Unity expects bottom-row-first.
static void E7CopyCanvasFlipped(const E7GrayCanvas *canvas, unsigned char *destination)
{
  for (int y = 0; y < canvas->height; y++) {
    const unsigned char *sourceRow = canvas->data + (size_t)(canvas->height - 1 - y) * (size_t)canvas->width;
    memcpy(destination + (size_t)y * (size_t)canvas->width, sourceRow, (size_t)canvas->width);
  }
}

static void E7FillPolygon(E7GrayCanvas *canvas, const CGPoint *points, NSUInteger count)
{
  if (points == NULL || count < 3) {
    return;
  }

  CGContextBeginPath(canvas->context);
  CGContextMoveToPoint(canvas->context, points[0].x, points[0].y);
  for (NSUInteger index = 1; index < count; index++) {
    CGContextAddLineToPoint(canvas->context, points[index].x, points[index].y);
  }

  CGContextClosePath(canvas->context);
  CGContextFillPath(canvas->context);
}

static void E7StrokePolyline(E7GrayCanvas *canvas, const CGPoint *points, NSUInteger count, CGFloat lineWidth)
{
  if (points == NULL || count < 2) {
    return;
  }

  CGContextSetLineWidth(canvas->context, lineWidth);
  CGContextSetLineCap(canvas->context, kCGLineCapRound);
  CGContextSetLineJoin(canvas->context, kCGLineJoinRound);
  CGContextBeginPath(canvas->context);
  CGContextMoveToPoint(canvas->context, points[0].x, points[0].y);
  for (NSUInteger index = 1; index < count; index++) {
    CGContextAddLineToPoint(canvas->context, points[index].x, points[index].y);
  }

  CGContextStrokePath(canvas->context);
}

static void E7FillLandmarkPolygon(E7GrayCanvas *canvas, VNFaceLandmarkRegion2D *landmark, CGSize maskSize)
{
  if (landmark == nil || landmark.pointCount < 3) {
    return;
  }

  const CGPoint *points = [landmark pointsInImageOfSize:maskSize];
  E7FillPolygon(canvas, points, landmark.pointCount);
}

// Shared Vision + composition core. Takes ownership of nothing; the caller
// releases the image. Writes the five bottom-up class masks into outMasks.
static int E7RunFaceParsing(
  CGImageRef image,
  int maskWidth,
  int maskHeight,
  unsigned char *outMasks)
{
  @autoreleasepool {
    VNDetectFaceLandmarksRequest *landmarksRequest = [[VNDetectFaceLandmarksRequest alloc] init];
    NSMutableArray<VNRequest *> *requests = [NSMutableArray arrayWithObject:landmarksRequest];

    VNGeneratePersonSegmentationRequest *personRequest = nil;
    if (@available(iOS 15.0, *)) {
      personRequest = [[VNGeneratePersonSegmentationRequest alloc] init];
      personRequest.qualityLevel = VNGeneratePersonSegmentationRequestQualityLevelBalanced;
      personRequest.outputPixelFormat = kCVPixelFormatType_OneComponent8;
      [requests addObject:personRequest];
    }

    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image
                                                                        orientation:kCGImagePropertyOrientationUp
                                                                            options:@{}];
    NSError *error = nil;
    BOOL performed = [handler performRequests:requests error:&error];
    if (!performed || error != nil) {
      return -3;
    }

    VNFaceObservation *face = nil;
    for (VNFaceObservation *candidate in landmarksRequest.results) {
      if (face == nil
          || candidate.boundingBox.size.width * candidate.boundingBox.size.height
             > face.boundingBox.size.width * face.boundingBox.size.height) {
        face = candidate;
      }
    }

    if (face == nil) {
      return -4;
    }

    VNFaceLandmarks2D *landmarks = face.landmarks;
    VNFaceLandmarkRegion2D *faceContour = landmarks.faceContour;
    if (faceContour == nil || faceContour.pointCount < 5) {
      return -5;
    }

    CGSize maskSize = CGSizeMake(maskWidth, maskHeight);
    CGRect faceBox = VNImageRectForNormalizedRect(face.boundingBox, maskWidth, maskHeight);

    E7GrayCanvas regionCanvas;   // face + forehead + neck geometry region
    E7GrayCanvas lipCanvas;
    E7GrayCanvas eyeCanvas;
    E7GrayCanvas browCanvas;
    if (!E7CreateGrayCanvas(&regionCanvas, maskWidth, maskHeight)) {
      return -1;
    }

    if (!E7CreateGrayCanvas(&lipCanvas, maskWidth, maskHeight)
        || !E7CreateGrayCanvas(&eyeCanvas, maskWidth, maskHeight)
        || !E7CreateGrayCanvas(&browCanvas, maskWidth, maskHeight)) {
      E7ReleaseGrayCanvas(&regionCanvas);
      E7ReleaseGrayCanvas(&lipCanvas);
      E7ReleaseGrayCanvas(&eyeCanvas);
      E7ReleaseGrayCanvas(&browCanvas);
      return -1;
    }

    // ---- Face + forehead + neck region (geometry candidate) --------------
    {
      const CGPoint *contour = [faceContour pointsInImageOfSize:maskSize];
      NSUInteger contourCount = faceContour.pointCount;
      // faceContour runs ear -> chin -> ear; close it over the forehead with
      // a coarse arc so forehead skin is included (bangs are removed later
      // by the person/hair difference and the compositor exclusions).
      NSUInteger totalCount = contourCount + 3;
      CGPoint *closed = (CGPoint *)malloc(sizeof(CGPoint) * totalCount);
      if (closed != NULL) {
        memcpy(closed, contour, sizeof(CGPoint) * contourCount);
        CGPoint first = contour[0];
        CGPoint last = contour[contourCount - 1];
        CGFloat foreheadLift = faceBox.size.height * 0.42;
        CGFloat topY = CGRectGetMaxY(faceBox) + foreheadLift * 0.55;
        closed[contourCount] = CGPointMake(last.x, topY);
        closed[contourCount + 1] = CGPointMake(CGRectGetMidX(faceBox), CGRectGetMaxY(faceBox) + foreheadLift);
        closed[contourCount + 2] = CGPointMake(first.x, topY);
        E7FillPolygon(&regionCanvas, closed, totalCount);
        free(closed);
      }

      // Neck trapezoid below the chin (soft candidate; the person mask and
      // the compositor's neck gradient/skin gate refine it).
      CGFloat chinY = CGRectGetMinY(faceBox);
      CGFloat midX = CGRectGetMidX(faceBox);
      CGFloat topHalfWidth = faceBox.size.width * 0.44;
      CGFloat bottomHalfWidth = faceBox.size.width * 0.34;
      CGFloat neckDepth = faceBox.size.height * 0.52;
      CGPoint neck[4] = {
        CGPointMake(midX - topHalfWidth, chinY + faceBox.size.height * 0.10),
        CGPointMake(midX + topHalfWidth, chinY + faceBox.size.height * 0.10),
        CGPointMake(midX + bottomHalfWidth, chinY - neckDepth),
        CGPointMake(midX - bottomHalfWidth, chinY - neckDepth)
      };
      E7FillPolygon(&regionCanvas, neck, 4);
    }

    // ---- Exclusion polygons ----------------------------------------------
    E7FillLandmarkPolygon(&lipCanvas, landmarks.outerLips, maskSize);
    E7FillLandmarkPolygon(&eyeCanvas, landmarks.leftEye, maskSize);
    E7FillLandmarkPolygon(&eyeCanvas, landmarks.rightEye, maskSize);

    CGFloat browWidth = MAX(2.0, faceBox.size.height * 0.055);
    if (landmarks.leftEyebrow != nil && landmarks.leftEyebrow.pointCount >= 2) {
      const CGPoint *points = [landmarks.leftEyebrow pointsInImageOfSize:maskSize];
      E7StrokePolyline(&browCanvas, points, landmarks.leftEyebrow.pointCount, browWidth);
    }

    if (landmarks.rightEyebrow != nil && landmarks.rightEyebrow.pointCount >= 2) {
      const CGPoint *points = [landmarks.rightEyebrow pointsInImageOfSize:maskSize];
      E7StrokePolyline(&browCanvas, points, landmarks.rightEyebrow.pointCount, browWidth);
    }

    // ---- Person segmentation sampling ------------------------------------
    size_t maskPixelCount = (size_t)maskWidth * (size_t)maskHeight;
    unsigned char *personTopDown = (unsigned char *)malloc(maskPixelCount);
    bool personAvailable = false;
    if (personTopDown != NULL) {
      memset(personTopDown, 255, maskPixelCount);
      if (@available(iOS 15.0, *)) {
        VNPixelBufferObservation *personObservation =
          (VNPixelBufferObservation *)personRequest.results.firstObject;
        CVPixelBufferRef personBuffer =
          personObservation != nil ? personObservation.pixelBuffer : NULL;
        if (personBuffer != NULL
            && CVPixelBufferLockBaseAddress(personBuffer, kCVPixelBufferLock_ReadOnly) == kCVReturnSuccess) {
          const unsigned char *personBase = (const unsigned char *)CVPixelBufferGetBaseAddress(personBuffer);
          size_t personWidth = CVPixelBufferGetWidth(personBuffer);
          size_t personHeight = CVPixelBufferGetHeight(personBuffer);
          size_t personStride = CVPixelBufferGetBytesPerRow(personBuffer);
          if (personBase != NULL && personWidth > 0 && personHeight > 0) {
            for (int y = 0; y < maskHeight; y++) {
              size_t sourceY = (size_t)(((double)y + 0.5) / maskHeight * personHeight);
              if (sourceY >= personHeight) {
                sourceY = personHeight - 1;
              }

              const unsigned char *sourceRow = personBase + sourceY * personStride;
              unsigned char *destinationRow = personTopDown + (size_t)y * (size_t)maskWidth;
              for (int x = 0; x < maskWidth; x++) {
                size_t sourceX = (size_t)(((double)x + 0.5) / maskWidth * personWidth);
                if (sourceX >= personWidth) {
                  sourceX = personWidth - 1;
                }

                destinationRow[x] = sourceRow[sourceX];
              }
            }

            personAvailable = true;
          }

          CVPixelBufferUnlockBaseAddress(personBuffer, kCVPixelBufferLock_ReadOnly);
        }
      }
    }

    // ---- Compose final classes (CG canvases are top-down like person) ----
    unsigned char *skinOut = outMasks;
    unsigned char *hairOut = outMasks + maskPixelCount;
    unsigned char *lipOut = outMasks + maskPixelCount * 2;
    unsigned char *eyeOut = outMasks + maskPixelCount * 3;
    unsigned char *browOut = outMasks + maskPixelCount * 4;

    for (int y = 0; y < maskHeight; y++) {
      size_t topDownRow = (size_t)(maskHeight - 1 - y) * (size_t)maskWidth;
      size_t bottomUpRow = (size_t)y * (size_t)maskWidth;
      for (int x = 0; x < maskWidth; x++) {
        unsigned char region = regionCanvas.data[topDownRow + x];
        unsigned char person = personTopDown != NULL ? personTopDown[topDownRow + x] : 255;
        // skin candidate = geometry region ∩ person foreground
        unsigned int skin = ((unsigned int)region * (unsigned int)person) / 255u;
        skinOut[bottomUpRow + x] = (unsigned char)skin;
        // hair/clothing/background = person foreground outside the region
        unsigned int notRegion = 255u - (unsigned int)region;
        unsigned int hair = personAvailable
          ? ((unsigned int)person * notRegion) / 255u
          : 0u;
        hairOut[bottomUpRow + x] = (unsigned char)hair;
      }
    }

    E7CopyCanvasFlipped(&lipCanvas, lipOut);
    E7CopyCanvasFlipped(&eyeCanvas, eyeOut);
    E7CopyCanvasFlipped(&browCanvas, browOut);

    if (personTopDown != NULL) {
      free(personTopDown);
    }

    E7ReleaseGrayCanvas(&regionCanvas);
    E7ReleaseGrayCanvas(&lipCanvas);
    E7ReleaseGrayCanvas(&eyeCanvas);
    E7ReleaseGrayCanvas(&browCanvas);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Async raw-RGBA pipeline. The PNG entry point below runs Vision on the
// CALLING thread and needs a PNG round-trip — both caused visible frame
// hitches. The Submit/TryFetch pair instead accepts raw RGBA rows (from
// AsyncGPUReadback of a downscaled RT), copies them, and runs the same
// parsing core on a serial background queue; Unity polls TryFetch per frame.
// ---------------------------------------------------------------------------

static NSLock *E7ParsingLock(void)
{
  static NSLock *lock = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ lock = [[NSLock alloc] init]; });
  return lock;
}

static dispatch_queue_t E7ParsingQueue(void)
{
  static dispatch_queue_t queue = NULL;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    queue = dispatch_queue_create("e7.vision.faceparsing", DISPATCH_QUEUE_SERIAL);
  });
  return queue;
}

static bool gE7JobActive = false;
static bool gE7ResultReady = false;
static int gE7ResultWidth = 0;
static int gE7ResultHeight = 0;
static int gE7LastStatus = 0;
static int gE7CompletedJobs = 0;
static unsigned char *gE7ResultMasks = NULL;

extern "C" {

int E7VisionFaceParsingPng(
  const unsigned char *pngBytes,
  int byteCount,
  int maskWidth,
  int maskHeight,
  unsigned char *outMasks)
{
  @autoreleasepool {
    if (pngBytes == NULL || byteCount <= 0 || outMasks == NULL || maskWidth <= 0 || maskHeight <= 0) {
      return -1;
    }

    NSData *data = [NSData dataWithBytes:pngBytes length:(NSUInteger)byteCount];
    CGImageSourceRef imageSource = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
    if (imageSource == NULL) {
      return -2;
    }

    CGImageRef image = CGImageSourceCreateImageAtIndex(imageSource, 0, NULL);
    CFRelease(imageSource);
    if (image == NULL) {
      return -2;
    }

    int status = E7RunFaceParsing(image, maskWidth, maskHeight, outMasks);
    CGImageRelease(image);
    return status;
  }
}

// Accepts one RGBA frame (4 bytes/pixel). rowsBottomUp=1 means row 0 is the
// image bottom (Unity texture convention); the copy re-orders to top-down
// for CoreGraphics. Returns 0 = accepted, 1 = busy (previous frame still
// parsing; caller just skips this frame), -1 = invalid input.
int E7VisionFaceParsingSubmitRgba(
  const unsigned char *rgba,
  int width,
  int height,
  int strideBytes,
  int rowsBottomUp,
  int maskWidth,
  int maskHeight)
{
  if (rgba == NULL || width <= 0 || height <= 0 || maskWidth <= 0 || maskHeight <= 0
      || strideBytes < width * 4) {
    return -1;
  }

  NSLock *lock = E7ParsingLock();
  [lock lock];
  if (gE7JobActive) {
    [lock unlock];
    return 1;
  }

  gE7JobActive = true;
  [lock unlock];

  size_t tightStride = (size_t)width * 4;
  unsigned char *frameCopy = (unsigned char *)malloc(tightStride * (size_t)height);
  if (frameCopy == NULL) {
    [lock lock];
    gE7JobActive = false;
    [lock unlock];
    return -1;
  }

  for (int y = 0; y < height; y++) {
    int sourceY = rowsBottomUp != 0 ? (height - 1 - y) : y;
    memcpy(
      frameCopy + (size_t)y * tightStride,
      rgba + (size_t)sourceY * (size_t)strideBytes,
      tightStride);
  }

  dispatch_async(E7ParsingQueue(), ^{
    @autoreleasepool {
      int status = -2;
      unsigned char *masks =
        (unsigned char *)malloc((size_t)maskWidth * (size_t)maskHeight * kE7ParsingMaskCount);
      CGColorSpaceRef rgb = CGColorSpaceCreateDeviceRGB();
      CGDataProviderRef provider = CGDataProviderCreateWithData(
        NULL, frameCopy, tightStride * (size_t)height, NULL);
      CGImageRef image = NULL;
      if (masks != NULL && rgb != NULL && provider != NULL) {
        image = CGImageCreate(
          (size_t)width, (size_t)height, 8, 32, tightStride, rgb,
          (CGBitmapInfo)kCGImageAlphaNoneSkipLast | (CGBitmapInfo)kCGBitmapByteOrder32Big,
          provider, NULL, false, kCGRenderingIntentDefault);
      }

      if (image != NULL) {
        status = E7RunFaceParsing(image, maskWidth, maskHeight, masks);
        CGImageRelease(image);
      }

      if (provider != NULL) {
        CGDataProviderRelease(provider);
      }

      if (rgb != NULL) {
        CGColorSpaceRelease(rgb);
      }

      NSLock *jobLock = E7ParsingLock();
      [jobLock lock];
      gE7LastStatus = status;
      gE7CompletedJobs++;
      if (status == 0 && masks != NULL) {
        if (gE7ResultMasks != NULL) {
          free(gE7ResultMasks);
        }

        gE7ResultMasks = masks;
        masks = NULL;
        gE7ResultWidth = maskWidth;
        gE7ResultHeight = maskHeight;
        gE7ResultReady = true;
      }

      gE7JobActive = false;
      [jobLock unlock];

      if (masks != NULL) {
        free(masks);
      }

      free(frameCopy);
    }
  });

  return 0;
}

// Copies the newest completed mask set into outMasks. Returns 1 when a new
// result was delivered, 0 when nothing new is ready or dimensions mismatch.
int E7VisionFaceParsingTryFetch(
  unsigned char *outMasks,
  int maskWidth,
  int maskHeight)
{
  if (outMasks == NULL || maskWidth <= 0 || maskHeight <= 0) {
    return 0;
  }

  NSLock *lock = E7ParsingLock();
  [lock lock];
  bool delivered = false;
  if (gE7ResultReady
      && gE7ResultMasks != NULL
      && gE7ResultWidth == maskWidth
      && gE7ResultHeight == maskHeight) {
    memcpy(
      outMasks,
      gE7ResultMasks,
      (size_t)maskWidth * (size_t)maskHeight * kE7ParsingMaskCount);
    gE7ResultReady = false;
    delivered = true;
  }

  [lock unlock];
  return delivered ? 1 : 0;
}

// Status of the most recent background job (0 ok, negative = parsing error
// codes above). Lets the C# side detect a vertically-flipped capture
// (persistent -4 "no face") and toggle the row order automatically.
int E7VisionFaceParsingLastStatus(void)
{
  NSLock *lock = E7ParsingLock();
  [lock lock];
  int status = gE7LastStatus;
  [lock unlock];
  return status;
}

// Total background jobs completed since launch. The C# auto-flip logic
// counts JOBS (not frames) so it only toggles after several full inference
// attempts actually failed with "no face".
int E7VisionFaceParsingCompletedJobs(void)
{
  NSLock *lock = E7ParsingLock();
  [lock lock];
  int jobs = gE7CompletedJobs;
  [lock unlock];
  return jobs;
}

}
