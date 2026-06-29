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
    @"{\"status\":\"%@\",\"detail\":\"%@\",\"source\":\"apple_vision_runtime_lip_landmarks\",\"coordinateMode\":\"raw-y\",\"imageWidth\":%d,\"imageHeight\":%d,\"faceCount\":0,\"outerPointCount\":0,\"innerPointCount\":0,\"outer\":[],\"inner\":[]}",
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
    NSString *json = [NSString stringWithFormat:
      @"{\"status\":\"ok\",\"detail\":\"outerLips_innerLips\",\"source\":\"apple_vision_runtime_lip_landmarks\",\"coordinateMode\":\"raw-y\",\"imageWidth\":%d,\"imageHeight\":%d,\"faceCount\":%lu,\"outerPointCount\":%lu,\"innerPointCount\":%lu,\"outer\":%@,\"inner\":%@}",
      width,
      height,
      (unsigned long)faces.count,
      (unsigned long)outerLips.pointCount,
      (unsigned long)innerLips.pointCount,
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

}
