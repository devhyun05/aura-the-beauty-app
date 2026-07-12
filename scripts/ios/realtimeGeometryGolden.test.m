// AURARealtimeGeometry.h 골든벡터 하니스 (macOS 로컬 전용).
//
// CI(ubuntu)는 ObjC 를 컴파일하지 못하므로 이 하니스는 로컬 검증용이다 —
// 실행: node scripts/ios/run-realtime-geometry-golden.mjs
// CI 에서는 동일 골든 JSON 을 TS 미러(realtimeFrameGeometry.test.ts)가 통과한다.
//
// usage: harness <golden.json>

#import <Foundation/Foundation.h>
#import "AURARealtimeGeometry.h"

static int failures = 0;

static void failCase(NSString *message)
{
  fprintf(stderr, "[aura:geometry-golden] FAIL %s\n", message.UTF8String);
  failures += 1;
}

static CGPoint pointFromArray(NSArray *array)
{
  return CGPointMake([array[0] doubleValue], [array[1] doubleValue]);
}

static AURARealtimeFrameRotation rotationFromName(NSString *name)
{
  if ([name isEqualToString:@"upright"]) return AURARealtimeFrameRotationUpright;
  if ([name isEqualToString:@"rot90cw"]) return AURARealtimeFrameRotation90CW;
  if ([name isEqualToString:@"rot90ccw"]) return AURARealtimeFrameRotation90CCW;
  if ([name isEqualToString:@"rot180"]) return AURARealtimeFrameRotation180;
  return AURARealtimeFrameRotationUnknown;
}

static NSString *nameFromRotation(AURARealtimeFrameRotation rotation)
{
  switch (rotation) {
    case AURARealtimeFrameRotationUpright: return @"upright";
    case AURARealtimeFrameRotation90CW: return @"rot90cw";
    case AURARealtimeFrameRotation90CCW: return @"rot90ccw";
    case AURARealtimeFrameRotation180: return @"rot180";
    default: return @"unknown";
  }
}

int main(int argc, const char *argv[])
{
  @autoreleasepool {
    if (argc < 2) {
      fprintf(stderr, "usage: %s <golden.json>\n", argv[0]);
      return 2;
    }

    NSString *jsonPath = [NSString stringWithUTF8String:argv[1]];
    NSData *data = [NSData dataWithContentsOfFile:jsonPath];
    if (!data) {
      fprintf(stderr, "golden JSON 을 읽을 수 없음: %s\n", jsonPath.UTF8String);
      return 2;
    }

    NSError *error = nil;
    NSDictionary *fixture = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
    if (!fixture || error) {
      fprintf(stderr, "golden JSON 파싱 실패: %s\n", error.localizedDescription.UTF8String);
      return 2;
    }

    const double tolerance = [fixture[@"tolerance"] doubleValue];

    void (^expectClose)(double, double, NSString *) = ^(double actual, double expected, NSString *label) {
      if (fabs(actual - expected) > tolerance) {
        failCase([NSString stringWithFormat:@"%@: expected %.9f, got %.9f", label, expected, actual]);
      }
    };
    void (^expectPointClose)(CGPoint, NSArray *, NSString *) = ^(CGPoint actual, NSArray *expected, NSString *label) {
      expectClose(actual.x, [expected[0] doubleValue], [label stringByAppendingString:@".x"]);
      expectClose(actual.y, [expected[1] doubleValue], [label stringByAppendingString:@".y"]);
    };

    NSArray *rotationCases = fixture[@"rotationCases"];
    for (NSDictionary *testCase in rotationCases) {
      NSString *name = testCase[@"name"];
      NSDictionary *vision = testCase[@"vision"];
      const BOOL isFront = [testCase[@"isFront"] boolValue];

      const CGPoint leftEye = pointFromArray(vision[@"leftEye"]);
      const CGPoint rightEye = pointFromArray(vision[@"rightEye"]);
      NSArray *probeArray = [vision[@"probe"] isKindOfClass:[NSArray class]] ? vision[@"probe"] : nil;
      const BOOL hasProbe = probeArray != nil;
      const CGPoint probe = hasProbe ? pointFromArray(probeArray) : CGPointZero;

      const AURARealtimeFrameRotation detected =
          AURARealtimeDetectFrameRotation(leftEye, rightEye, probe, hasProbe);
      const AURARealtimeFrameRotation expected = rotationFromName(testCase[@"expectRotation"]);

      if (detected != expected) {
        failCase([NSString stringWithFormat:@"%@: rotation expected %@, got %@",
                                            name, testCase[@"expectRotation"], nameFromRotation(detected)]);
        continue;
      }

      NSDictionary *expectCanonical = testCase[@"expectCanonical"];
      NSDictionary *expectDevice = testCase[@"expectDevice"];
      if (expectCanonical && expectDevice && hasProbe) {
        NSDictionary<NSString *, NSValue *> *points = @{
          @"leftEye": [NSValue valueWithBytes:&leftEye objCType:@encode(CGPoint)],
          @"rightEye": [NSValue valueWithBytes:&rightEye objCType:@encode(CGPoint)],
          @"probe": [NSValue valueWithBytes:&probe objCType:@encode(CGPoint)],
        };

        for (NSString *key in points) {
          CGPoint visionPoint;
          [points[key] getValue:&visionPoint];

          const CGPoint canonical = AURARealtimeCanonicalPoint(visionPoint, detected);
          expectPointClose(canonical, expectCanonical[key],
                           [NSString stringWithFormat:@"%@.canonical.%@", name, key]);

          const CGPoint roundTrip = AURARealtimeVisionPointFromCanonical(canonical, detected);
          expectClose(roundTrip.x, visionPoint.x,
                      [NSString stringWithFormat:@"%@.roundtrip.%@.x", name, key]);
          expectClose(roundTrip.y, visionPoint.y,
                      [NSString stringWithFormat:@"%@.roundtrip.%@.y", name, key]);

          const CGPoint device = AURARealtimeCaptureDevicePointFromCanonical(canonical, isFront);
          expectPointClose(device, expectDevice[key],
                           [NSString stringWithFormat:@"%@.device.%@", name, key]);
        }
      }
    }

    NSArray *tiltCases = fixture[@"tiltCases"];
    for (NSDictionary *tiltCase in tiltCases) {
      const CGFloat tilt = AURARealtimeScreenEyeLineTilt(
          pointFromArray(tiltCase[@"leftEyeScreen"]),
          pointFromArray(tiltCase[@"rightEyeScreen"]));
      expectClose(tilt, [tiltCase[@"expectTilt"] doubleValue],
                  [NSString stringWithFormat:@"%@.tilt", tiltCase[@"name"]]);
    }

    if (failures > 0) {
      fprintf(stderr, "[aura:geometry-golden] %d failures\n", failures);
      return 1;
    }

    printf("[aura:geometry-golden] PASS (%lu rotation cases, %lu tilt cases)\n",
           (unsigned long)rotationCases.count, (unsigned long)tiltCases.count);
    return 0;
  }
}
