#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <React/RCTBridge.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTUIManager.h>
#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>
#import <Vision/Vision.h>
#import <MediaPipeTasksVision/MediaPipeTasksVision.h>

static void *AURARealtimeCameraStabilityContext = &AURARealtimeCameraStabilityContext;

static NSTimeInterval const AURARealtimeCameraStableThresholdMs = 400.0;

// Continuous auto exposure/white-balance on the front camera flips the
// adjusting flags in short bursts even when the scene is steady. Only treat
// the camera as unstable when an adjusting episode persists past this grace
// window, so momentary blips do not reset the stability timer.
static NSTimeInterval const AURARealtimeCameraAdjustingGraceMs = 250.0;

static CGFloat AURARealtimeClamp(CGFloat value)
{
  return fmax(0.0, fmin(1.0, value));
}

static BOOL AURARealtimeSemanticMatteTypesContain(
    NSArray<AVSemanticSegmentationMatteType> *types,
    AVSemanticSegmentationMatteType type)
{
  return [types containsObject:type];
}

static NSArray<NSString *> *AURARealtimeSemanticMatteTypeNames(
    NSArray<AVSemanticSegmentationMatteType> *types)
{
  NSMutableArray<NSString *> *names = [NSMutableArray arrayWithCapacity:types.count];

  for (AVSemanticSegmentationMatteType type in types) {
    if ([type isEqualToString:AVSemanticSegmentationMatteTypeHair]) {
      [names addObject:@"hair"];
    } else if ([type isEqualToString:AVSemanticSegmentationMatteTypeSkin]) {
      [names addObject:@"skin"];
    } else if ([type isEqualToString:AVSemanticSegmentationMatteTypeTeeth]) {
      [names addObject:@"teeth"];
    } else {
      [names addObject:type.description ?: @"unknown"];
    }
  }

  return names;
}

static NSDictionary *AURARealtimeSemanticMatteAvailability(
    BOOL requested,
    BOOL hairAvailable,
    BOOL skinAvailable)
{
  return @{
    @"hair": @(hairAvailable),
    @"requested": @(requested),
    @"skin": @(skinAvailable),
  };
}

static NSDictionary *AURARealtimeEmbeddedSemanticMatteAvailability(NSURL *url)
{
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
  if (!source) {
    return AURARealtimeSemanticMatteAvailability(NO, NO, NO);
  }

  NSDictionary *hairInfo = CFBridgingRelease(CGImageSourceCopyAuxiliaryDataInfoAtIndex(
      source,
      0,
      kCGImageAuxiliaryDataTypeSemanticSegmentationHairMatte));
  NSDictionary *skinInfo = CFBridgingRelease(CGImageSourceCopyAuxiliaryDataInfoAtIndex(
      source,
      0,
      kCGImageAuxiliaryDataTypeSemanticSegmentationSkinMatte));
  CFRelease(source);

  return AURARealtimeSemanticMatteAvailability(
      hairInfo != nil || skinInfo != nil,
      hairInfo != nil,
      skinInfo != nil);
}

static NSDictionary *AURARealtimePoint(CGFloat x, CGFloat y)
{
  return @{
    @"x": @(AURARealtimeClamp(x)),
    @"y": @(AURARealtimeClamp(y)),
  };
}

static NSDictionary *AURARealtimeScreenPoint(CGFloat x, CGFloat y)
{
  return @{
    @"left": @(x),
    @"top": @(y),
    @"x": @(x),
    @"y": @(y),
  };
}

static NSDictionary *AURARealtimePointFromImagePoint(CGPoint point, CGSize imageSize)
{
  CGFloat width = fmax(imageSize.width, 1.0);
  CGFloat height = fmax(imageSize.height, 1.0);
  return AURARealtimePoint(point.x / width, 1.0 - (point.y / height));
}

static NSArray<NSDictionary *> *AURARealtimePointsFromRegion(
    VNFaceLandmarkRegion2D *region,
    CGSize imageSize)
{
  if (region == nil || region.pointCount == 0) {
    return @[];
  }

  const CGPoint *points = [region pointsInImageOfSize:imageSize];
  NSMutableArray<NSDictionary *> *result = [NSMutableArray arrayWithCapacity:region.pointCount];

  for (NSUInteger index = 0; index < region.pointCount; index += 1) {
    [result addObject:AURARealtimePointFromImagePoint(points[index], imageSize)];
  }

  return result;
}

static NSDictionary *AURARealtimeCentroidFromPoints(NSArray<NSDictionary *> *points)
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

  return AURARealtimePoint(sumX / points.count, sumY / points.count);
}

static NSDictionary *AURARealtimeCentroidFromRegion(
    VNFaceLandmarkRegion2D *region,
    CGSize imageSize)
{
  return AURARealtimeCentroidFromPoints(AURARealtimePointsFromRegion(region, imageSize));
}

static NSDictionary *AURARealtimeLowestPointFromRegion(
    VNFaceLandmarkRegion2D *region,
    CGSize imageSize)
{
  NSArray<NSDictionary *> *points = AURARealtimePointsFromRegion(region, imageSize);
  NSDictionary *lowestPoint = nil;

  for (NSDictionary *point in points) {
    if (lowestPoint == nil || [point[@"y"] doubleValue] > [lowestPoint[@"y"] doubleValue]) {
      lowestPoint = point;
    }
  }

  return lowestPoint;
}

static NSDictionary *AURARealtimeCenteredChinPointFromRegion(
    VNFaceLandmarkRegion2D *region,
    NSDictionary *bounds,
    CGSize imageSize)
{
  NSArray<NSDictionary *> *points = AURARealtimePointsFromRegion(region, imageSize);

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
    return AURARealtimeLowestPointFromRegion(region, imageSize);
  }

  CGFloat averageY = sumY / candidateCount;
  CGFloat boundsChinY = [bounds[@"y"] doubleValue] + faceHeight * 0.9;
  CGFloat stableY = fmax(lowestY * 0.82 + averageY * 0.18, boundsChinY);
  return AURARealtimePoint(sumX / candidateCount, stableY);
}

static NSDictionary *AURARealtimeLipCornerFromRegion(
    VNFaceLandmarkRegion2D *region,
    CGSize imageSize,
    BOOL wantsLeft)
{
  NSArray<NSDictionary *> *points = AURARealtimePointsFromRegion(region, imageSize);
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

static NSDictionary *AURARealtimeBoundsFromObservation(VNFaceObservation *face)
{
  CGRect box = face.boundingBox;
  return @{
    @"x": @(AURARealtimeClamp(box.origin.x)),
    @"y": @(AURARealtimeClamp(1.0 - box.origin.y - box.size.height)),
    @"width": @(AURARealtimeClamp(box.size.width)),
    @"height": @(AURARealtimeClamp(box.size.height)),
  };
}

static NSDictionary *AURARealtimeBoundsPoint(NSDictionary *bounds, CGFloat xRatio, CGFloat yRatio)
{
  CGFloat x = [bounds[@"x"] doubleValue] + [bounds[@"width"] doubleValue] * xRatio;
  CGFloat y = [bounds[@"y"] doubleValue] + [bounds[@"height"] doubleValue] * yRatio;
  return AURARealtimePoint(x, y);
}

static NSDictionary *AURARealtimeForeheadPoint(
    VNFaceLandmarks2D *landmarks,
    NSDictionary *bounds,
    CGSize imageSize)
{
  NSMutableArray<NSDictionary *> *browPoints = [NSMutableArray array];
  [browPoints addObjectsFromArray:AURARealtimePointsFromRegion(landmarks.leftEyebrow, imageSize)];
  [browPoints addObjectsFromArray:AURARealtimePointsFromRegion(landmarks.rightEyebrow, imageSize)];

  CGFloat faceTop = [bounds[@"y"] doubleValue];
  CGFloat faceHeight = [bounds[@"height"] doubleValue];
  CGFloat faceCenterX = [bounds[@"x"] doubleValue] + [bounds[@"width"] doubleValue] * 0.5;
  NSDictionary *leftEye = AURARealtimeCentroidFromRegion(landmarks.leftEye, imageSize);
  NSDictionary *rightEye = AURARealtimeCentroidFromRegion(landmarks.rightEye, imageSize);
  CGFloat foreheadCenterX = faceCenterX;

  if (browPoints.count == 0) {
    if (leftEye && rightEye) {
      foreheadCenterX =
          ([leftEye[@"x"] doubleValue] + [rightEye[@"x"] doubleValue]) / 2.0;
    }

    return AURARealtimePoint(foreheadCenterX, faceTop + faceHeight * 0.12);
  }

  CGFloat sumX = 0.0;
  CGFloat browTopY = 1.0;

  for (NSDictionary *point in browPoints) {
    sumX += [point[@"x"] doubleValue];
    browTopY = fmin(browTopY, [point[@"y"] doubleValue]);
  }

  if (leftEye && rightEye) {
    foreheadCenterX =
        ([leftEye[@"x"] doubleValue] + [rightEye[@"x"] doubleValue]) / 2.0;
  } else {
    foreheadCenterX = sumX / browPoints.count;
  }

  CGFloat foreheadY = faceTop + fmax((browTopY - faceTop) * 0.45, faceHeight * 0.05);
  return AURARealtimePoint(foreheadCenterX, foreheadY);
}

static NSMutableDictionary *AURARealtimeLandmarksFromFace(
    VNFaceObservation *face,
    CGSize imageSize)
{
  VNFaceLandmarks2D *landmarks = face.landmarks;
  NSDictionary *bounds = AURARealtimeBoundsFromObservation(face);
  NSMutableDictionary *result = [NSMutableDictionary dictionary];

  if (landmarks == nil) {
    return result;
  }

  NSDictionary *leftEye = AURARealtimeCentroidFromRegion(landmarks.leftEye, imageSize);
  NSDictionary *rightEye = AURARealtimeCentroidFromRegion(landmarks.rightEye, imageSize);
  NSDictionary *noseBase = AURARealtimeLowestPointFromRegion(landmarks.nose, imageSize);
  VNFaceLandmarkRegion2D *lips = landmarks.outerLips ?: landmarks.innerLips;
  NSDictionary *mouthLeft = AURARealtimeLipCornerFromRegion(lips, imageSize, YES);
  NSDictionary *mouthRight = AURARealtimeLipCornerFromRegion(lips, imageSize, NO);
  NSDictionary *chin = AURARealtimeCenteredChinPointFromRegion(landmarks.faceContour, bounds, imageSize) ?:
      AURARealtimeBoundsPoint(bounds, 0.5, 0.92);
  NSDictionary *forehead = AURARealtimeForeheadPoint(landmarks, bounds, imageSize);

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

  result[@"leftCheek"] = AURARealtimeBoundsPoint(bounds, 0.27, 0.53);
  result[@"rightCheek"] = AURARealtimeBoundsPoint(bounds, 0.73, 0.53);
  result[@"leftJaw"] = AURARealtimeBoundsPoint(bounds, 0.34, 0.78);
  result[@"rightJaw"] = AURARealtimeBoundsPoint(bounds, 0.66, 0.78);

  return result;
}

static VNFaceObservation *AURARealtimeLargestFace(NSArray<VNFaceObservation *> *faces)
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

static CGImagePropertyOrientation AURARealtimeVideoOrientation(AVCaptureDevicePosition position)
{
  // The video data output stays unmirrored. The preview layer owns front-camera
  // mirroring, so Vision receives upright, unmirrored frames to avoid double
  // mirroring when converting landmarks back through AVCaptureVideoPreviewLayer.
  return position == AVCaptureDevicePositionFront
      ? kCGImagePropertyOrientationLeft
      : kCGImagePropertyOrientationRight;
}

static UIImageOrientation AURARealtimeMediaPipeImageOrientation(AVCaptureDevicePosition position)
{
  return position == AVCaptureDevicePositionFront
      ? UIImageOrientationLeft
      : UIImageOrientationRight;
}

static CGFloat AURARealtimeDegrees(CGFloat radians)
{
  return radians * 180.0 / M_PI;
}

static NSDictionary *AURARealtimeMediaPipePoint(MPPNormalizedLandmark *landmark)
{
  if (!landmark) {
    return nil;
  }

  return @{
    @"x": @(AURARealtimeClamp(landmark.x)),
    @"y": @(AURARealtimeClamp(landmark.y)),
    @"z": @(landmark.z),
  };
}

static MPPNormalizedLandmark *AURARealtimeMediaPipeLandmarkAtIndex(
    NSArray<MPPNormalizedLandmark *> *landmarks,
    NSUInteger index)
{
  return index < landmarks.count ? landmarks[index] : nil;
}

static NSDictionary *AURARealtimeAverageMediaPipePoint(
    NSArray<MPPNormalizedLandmark *> *landmarks,
    NSArray<NSNumber *> *indices)
{
  CGFloat sumX = 0.0;
  CGFloat sumY = 0.0;
  CGFloat sumZ = 0.0;
  NSUInteger count = 0;

  for (NSNumber *index in indices) {
    MPPNormalizedLandmark *landmark =
        AURARealtimeMediaPipeLandmarkAtIndex(landmarks, index.unsignedIntegerValue);

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
    @"x": @(AURARealtimeClamp(sumX / count)),
    @"y": @(AURARealtimeClamp(sumY / count)),
    @"z": @(sumZ / count),
  };
}

static CGFloat AURARealtimeNumberFromPoint(NSDictionary *point, NSString *key)
{
  NSNumber *number = point[key];
  return [number respondsToSelector:@selector(doubleValue)] ? number.doubleValue : 0.0;
}

static NSDictionary *AURARealtimePoseFromMatrix(MPPTransformMatrix *matrix)
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
    @"pitchDeg": @(AURARealtimeDegrees(pitch)),
    @"yawDeg": @(AURARealtimeDegrees(yaw)),
    @"rollDeg": @(AURARealtimeDegrees(roll)),
    @"poseSource": @"matrix",
  };
}

static NSDictionary *AURARealtimePoseFromGeometry(NSDictionary *landmarks)
{
  NSDictionary *leftEye = landmarks[@"leftEye"];
  NSDictionary *rightEye = landmarks[@"rightEye"];
  NSDictionary *noseTip = landmarks[@"noseTip"];
  NSDictionary *mouthLeft = landmarks[@"mouthLeft"];
  NSDictionary *mouthRight = landmarks[@"mouthRight"];

  if (!leftEye || !rightEye || !noseTip) {
    return @{
      @"pitchDeg": @0,
      @"yawDeg": @0,
      @"rollDeg": @0,
      @"poseSource": @"geometry_unavailable",
    };
  }

  CGFloat leftX = AURARealtimeNumberFromPoint(leftEye, @"x");
  CGFloat leftY = AURARealtimeNumberFromPoint(leftEye, @"y");
  CGFloat rightX = AURARealtimeNumberFromPoint(rightEye, @"x");
  CGFloat rightY = AURARealtimeNumberFromPoint(rightEye, @"y");
  CGFloat noseX = AURARealtimeNumberFromPoint(noseTip, @"x");
  CGFloat noseY = AURARealtimeNumberFromPoint(noseTip, @"y");
  CGFloat eyeCenterX = (leftX + rightX) / 2.0;
  CGFloat eyeCenterY = (leftY + rightY) / 2.0;
  CGFloat eyeDistance = fmax(fabs(rightX - leftX), 0.001);
  CGFloat rollDeg = AURARealtimeDegrees(atan2(rightY - leftY, rightX - leftX));
  CGFloat yawDeg = (noseX - eyeCenterX) / eyeDistance * 42.0;
  CGFloat pitchDeg = 0.0;

  if (mouthLeft && mouthRight) {
    CGFloat mouthCenterY =
        (AURARealtimeNumberFromPoint(mouthLeft, @"y") +
         AURARealtimeNumberFromPoint(mouthRight, @"y")) /
        2.0;
    CGFloat verticalSpan = fmax(mouthCenterY - eyeCenterY, 0.001);
    CGFloat noseRatio = (noseY - eyeCenterY) / verticalSpan;
    pitchDeg = (noseRatio - 0.48) * 28.0;
  }

  return @{
    @"pitchDeg": @(pitchDeg),
    @"yawDeg": @(yawDeg),
    @"rollDeg": @(rollDeg),
    @"poseSource": @"geometry",
  };
}

@interface AURARealtimeFaceCaptureView : UIView <AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate>

@property (nonatomic, copy) RCTDirectEventBlock onLandmarksDetected;
@property (nonatomic, copy) NSString *facing;
@property (nonatomic, assign) BOOL semanticMatteCapture;

- (void)captureWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;
- (void)restoreCameraAutoModes;
- (void)startCameraStabilityMonitoringForDevice:(AVCaptureDevice *)device;
- (void)stopCameraStabilityMonitoring;

@end

@implementation AURARealtimeFaceCaptureView {
  AVCaptureSession *_session;
  AVCaptureDeviceInput *_videoInput;
  AVCaptureVideoDataOutput *_videoOutput;
  AVCapturePhotoOutput *_photoOutput;
  AVCaptureVideoPreviewLayer *_previewLayer;
  AVCaptureDevice *_observedCameraDevice;
  dispatch_queue_t _sessionQueue;
  dispatch_queue_t _visionQueue;
  BOOL _isProcessingFrame;
  BOOL _isSessionConfigured;
  BOOL _isSessionRunning;
  BOOL _hasPendingCapture;
  BOOL _hasCameraStabilityObservers;
  BOOL _semanticMatteCapture;
  BOOL _semanticMatteRequiresHeic;
  CGSize _latestViewSize;
  NSDictionary *_lastScreenLandmarks;
  NSDictionary *_matteCapability;
  NSDictionary *_pendingCaptureCameraMetadata;
  NSDictionary *_pendingSemanticMattes;
  NSString *_pendingCaptureFormat;
  MPPFaceLandmarker *_faceLandmarker;
  NSString *_faceLandmarkerInitError;
  CFTimeInterval _cameraStableSince;
  CFTimeInterval _cameraAdjustingSince;
  CFTimeInterval _lastScreenLandmarksTimestamp;
  CFTimeInterval _lastFrameTimestamp;
  NSInteger _sequence;
  NSInteger _lastMediaPipeTimestampMs;
  RCTPromiseResolveBlock _captureResolve;
  RCTPromiseRejectBlock _captureReject;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  self = [super initWithFrame:frame];
  if (self) {
    _facing = @"front";
    _sessionQueue = dispatch_queue_create("aura.realtimeFaceCapture.session", DISPATCH_QUEUE_SERIAL);
    _visionQueue = dispatch_queue_create("aura.realtimeFaceCapture.vision", DISPATCH_QUEUE_SERIAL);
    _session = [AVCaptureSession new];
    _previewLayer = [AVCaptureVideoPreviewLayer layerWithSession:_session];
    _previewLayer.videoGravity = AVLayerVideoGravityResizeAspectFill;
    [self.layer addSublayer:_previewLayer];
    self.backgroundColor = UIColor.blackColor;
    _latestViewSize = frame.size;
  }
  return self;
}

- (void)dealloc
{
  [self stopCameraStabilityMonitoring];
  [self restoreCameraAutoModes];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _latestViewSize = self.bounds.size;
  _previewLayer.frame = self.bounds;
  [self updatePreviewConnection];
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window != nil) {
    [self startCameraIfPermitted];
  } else {
    [self stopSession];
  }
}

- (void)setFacing:(NSString *)facing
{
  NSString *nextFacing = [facing isEqualToString:@"back"] ? @"back" : @"front";
  if ([_facing isEqualToString:nextFacing]) {
    return;
  }

  _facing = nextFacing;
  _isSessionConfigured = NO;

  if (self.window != nil) {
    [self startCameraIfPermitted];
  }
}

- (void)setSemanticMatteCapture:(BOOL)semanticMatteCapture
{
  if (_semanticMatteCapture == semanticMatteCapture) {
    return;
  }

  _semanticMatteCapture = semanticMatteCapture;
  _matteCapability = nil;
  _isSessionConfigured = NO;

  if (self.window == nil) {
    return;
  }

  dispatch_async(_sessionQueue, ^{
    BOOL shouldRestart = self->_session.isRunning || self->_isSessionRunning;
    if (self->_session.isRunning) {
      [self->_session stopRunning];
    }

    if (![self configureSession]) {
      return;
    }

    if (shouldRestart) {
      [self->_session startRunning];
    }
    self->_isSessionRunning = self->_session.isRunning;
  });
}

- (AVCaptureDevicePosition)devicePosition
{
  return [_facing isEqualToString:@"back"] ? AVCaptureDevicePositionBack : AVCaptureDevicePositionFront;
}

- (void)startCameraIfPermitted
{
  AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];

  if (status == AVAuthorizationStatusAuthorized) {
    [self startSession];
    return;
  }

  if (status == AVAuthorizationStatusNotDetermined) {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (granted) {
          [self startSession];
        } else {
          [self emitCameraError:@"permission_denied"];
        }
      });
    }];
    return;
  }

  [self emitCameraError:@"permission_denied"];
}

- (void)startSession
{
  dispatch_async(_sessionQueue, ^{
    if (!self->_isSessionConfigured && ![self configureSession]) {
      return;
    }

    if (!self->_session.isRunning) {
      [self->_session startRunning];
    }
    self->_isSessionRunning = YES;
  });
}

- (void)stopSession
{
  dispatch_async(_sessionQueue, ^{
    if (self->_session.isRunning) {
      [self->_session stopRunning];
    }
    self->_isSessionRunning = NO;
  });
}

- (NSDictionary *)semanticMatteCapabilityForRung:(NSInteger)rung
                                          device:(AVCaptureDevice *)device
                                       supported:(BOOL)supported
{
  NSArray<AVSemanticSegmentationMatteType> *availableTypes =
      _photoOutput.availableSemanticSegmentationMatteTypes ?: @[];
  BOOL depthSupported = _photoOutput.depthDataDeliverySupported;

  return @{
    @"availableTypes": AURARealtimeSemanticMatteTypeNames(availableTypes),
    @"depthEnabled": @(_photoOutput.isDepthDataDeliveryEnabled),
    @"depthSupported": @(depthSupported),
    @"device": device.deviceType ?: @"unknown",
    @"preset": _session.sessionPreset ?: @"unknown",
    @"requestedTypes": supported ? @[@"hair", @"skin"] : @[],
    @"rung": @(rung),
    @"supported": @(supported),
  };
}

- (BOOL)semanticMatteTypesIncludeHairAndSkin:
    (NSArray<AVSemanticSegmentationMatteType> *)availableTypes
{
  return AURARealtimeSemanticMatteTypesContain(availableTypes, AVSemanticSegmentationMatteTypeHair) &&
      AURARealtimeSemanticMatteTypesContain(availableTypes, AVSemanticSegmentationMatteTypeSkin);
}

- (NSDictionary *)configureSemanticMatteDeliveryForDevice:(AVCaptureDevice *)device
{
  if (!_photoOutput || !_semanticMatteCapture || [self devicePosition] != AVCaptureDevicePositionFront) {
    return nil;
  }

  if (_photoOutput.depthDataDeliverySupported) {
    _photoOutput.depthDataDeliveryEnabled = YES;
  }

  NSArray<AVSemanticSegmentationMatteType> *availableTypes =
      _photoOutput.availableSemanticSegmentationMatteTypes ?: @[];
  BOOL supported = [self semanticMatteTypesIncludeHairAndSkin:availableTypes];
  NSDictionary *capability =
      [self semanticMatteCapabilityForRung:1 device:device supported:supported];
  NSLog(@"[aura:face-capture] matte:capability rung=%@ device=%@ preset=%@ depthSupported=%@ depthEnabled=%@ availableTypes=%@",
        capability[@"rung"],
        capability[@"device"],
        capability[@"preset"],
        capability[@"depthSupported"],
        capability[@"depthEnabled"],
        capability[@"availableTypes"]);

  // SSM 생성은 depth 파이프라인에 의존하므로 matte type이 있어도 depth delivery가
  // 미지원인 포맷(720p 등)에서는 matte가 나오지 않을 수 있다 → Photo 프리셋으로 승격.
  if ((!supported || !_photoOutput.depthDataDeliverySupported) &&
      [_session canSetSessionPreset:AVCaptureSessionPresetPhoto]) {
    _session.sessionPreset = AVCaptureSessionPresetPhoto;
    if (_photoOutput.depthDataDeliverySupported) {
      _photoOutput.depthDataDeliveryEnabled = YES;
    }

    availableTypes = _photoOutput.availableSemanticSegmentationMatteTypes ?: @[];
    supported = [self semanticMatteTypesIncludeHairAndSkin:availableTypes];
    capability = [self semanticMatteCapabilityForRung:2 device:device supported:supported];
    NSLog(@"[aura:face-capture] matte:capability rung=%@ device=%@ preset=%@ depthSupported=%@ depthEnabled=%@ availableTypes=%@",
          capability[@"rung"],
          capability[@"device"],
          capability[@"preset"],
          capability[@"depthSupported"],
          capability[@"depthEnabled"],
          capability[@"availableTypes"]);
  }

  if (supported) {
    _photoOutput.enabledSemanticSegmentationMatteTypes = @[
      AVSemanticSegmentationMatteTypeHair,
      AVSemanticSegmentationMatteTypeSkin,
    ];
  } else {
    _photoOutput.enabledSemanticSegmentationMatteTypes = @[];
  }

  return capability;
}

- (BOOL)configureSession
{
  [_session beginConfiguration];
  _session.sessionPreset = AVCaptureSessionPreset1280x720;
  _matteCapability = nil;
  [self stopCameraStabilityMonitoring];

  if (_videoInput) {
    [_session removeInput:_videoInput];
    _videoInput = nil;
  }
  if (_videoOutput) {
    [_session removeOutput:_videoOutput];
    _videoOutput = nil;
  }
  if (_photoOutput) {
    [_session removeOutput:_photoOutput];
    _photoOutput = nil;
  }

  AVCaptureDevice *device = [self cameraDeviceForPosition:[self devicePosition]];
  if (!device) {
    [_session commitConfiguration];
    [self emitCameraError:@"camera_unavailable"];
    return NO;
  }

  NSError *inputError = nil;
  AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:device error:&inputError];
  if (!input || inputError) {
    [_session commitConfiguration];
    [self emitCameraError:@"input_unavailable"];
    return NO;
  }

  if ([_session canAddInput:input]) {
    [_session addInput:input];
    _videoInput = input;
    [self startCameraStabilityMonitoringForDevice:device];
  }

  AVCaptureVideoDataOutput *videoOutput = [AVCaptureVideoDataOutput new];
  videoOutput.alwaysDiscardsLateVideoFrames = YES;
  videoOutput.videoSettings = @{
    (NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA),
  };
  [videoOutput setSampleBufferDelegate:self queue:_visionQueue];

  if ([_session canAddOutput:videoOutput]) {
    [_session addOutput:videoOutput];
    _videoOutput = videoOutput;
  }

  AVCapturePhotoOutput *photoOutput = [AVCapturePhotoOutput new];
  if ([_session canAddOutput:photoOutput]) {
    [_session addOutput:photoOutput];
    _photoOutput = photoOutput;
  }

  if (_semanticMatteCapture) {
    _matteCapability = [self configureSemanticMatteDeliveryForDevice:device];
  }

  [_session commitConfiguration];
  _isSessionConfigured = YES;
  [self updateOutputConnections];
  [self updatePreviewConnection];
  return YES;
}

- (AVCaptureDevice *)cameraDeviceForPosition:(AVCaptureDevicePosition)position
{
  NSArray<AVCaptureDeviceType> *deviceTypes =
      _semanticMatteCapture && position == AVCaptureDevicePositionFront
          ? @[
              AVCaptureDeviceTypeBuiltInTrueDepthCamera,
              AVCaptureDeviceTypeBuiltInWideAngleCamera,
            ]
          : @[
              AVCaptureDeviceTypeBuiltInWideAngleCamera,
            ];
  AVCaptureDeviceDiscoverySession *discovery = [AVCaptureDeviceDiscoverySession
      discoverySessionWithDeviceTypes:deviceTypes
                            mediaType:AVMediaTypeVideo
                             position:position];
  return discovery.devices.firstObject;
}

- (void)startCameraStabilityMonitoringForDevice:(AVCaptureDevice *)device
{
  [self stopCameraStabilityMonitoring];
  _observedCameraDevice = device;
  _cameraStableSince = 0;
  _cameraAdjustingSince = 0;

  if (!device) {
    return;
  }

  NSArray<NSString *> *keyPaths = @[
    @"adjustingExposure",
    @"adjustingWhiteBalance",
    @"adjustingFocus",
  ];

  @try {
    for (NSString *keyPath in keyPaths) {
      [device addObserver:self
               forKeyPath:keyPath
                  options:NSKeyValueObservingOptionNew
                  context:AURARealtimeCameraStabilityContext];
    }
    _hasCameraStabilityObservers = YES;
  } @catch (__unused NSException *exception) {
    _hasCameraStabilityObservers = NO;
  }

  [self refreshCameraStableSinceForDevice:device];
}

- (void)stopCameraStabilityMonitoring
{
  if (!_observedCameraDevice || !_hasCameraStabilityObservers) {
    _observedCameraDevice = nil;
    _hasCameraStabilityObservers = NO;
    return;
  }

  NSArray<NSString *> *keyPaths = @[
    @"adjustingExposure",
    @"adjustingWhiteBalance",
    @"adjustingFocus",
  ];

  @try {
    for (NSString *keyPath in keyPaths) {
      [_observedCameraDevice removeObserver:self
                                 forKeyPath:keyPath
                                    context:AURARealtimeCameraStabilityContext];
    }
  } @catch (__unused NSException *exception) {
  }

  _observedCameraDevice = nil;
  _hasCameraStabilityObservers = NO;
}

- (BOOL)isCameraDeviceAdjusting:(AVCaptureDevice *)device
{
  if (!device) {
    return YES;
  }

  BOOL focusAdjusting =
      [device isFocusModeSupported:AVCaptureFocusModeContinuousAutoFocus] && device.isAdjustingFocus;

  return device.isAdjustingExposure || device.isAdjustingWhiteBalance || focusAdjusting;
}

- (void)refreshCameraStableSinceForDevice:(AVCaptureDevice *)device
{
  CFTimeInterval now = CACurrentMediaTime();

  if ([self isCameraDeviceAdjusting:device]) {
    if (_cameraAdjustingSince <= 0) {
      _cameraAdjustingSince = now;
    }
    if ((now - _cameraAdjustingSince) * 1000.0 >= AURARealtimeCameraAdjustingGraceMs) {
      _cameraStableSince = 0;
    }
    return;
  }

  _cameraAdjustingSince = 0;

  if (_cameraStableSince <= 0) {
    _cameraStableSince = now;
  }
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context
{
  if (context == AURARealtimeCameraStabilityContext) {
    [self refreshCameraStableSinceForDevice:(AVCaptureDevice *)object];
    return;
  }

  [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
}

- (NSDictionary *)cameraStabilityPayload
{
  AVCaptureDevice *device = _videoInput.device;
  [self refreshCameraStableSinceForDevice:device];

  BOOL adjustingExposure = device ? device.isAdjustingExposure : YES;
  BOOL adjustingWhiteBalance = device ? device.isAdjustingWhiteBalance : YES;
  BOOL focusSupported =
      device ? [device isFocusModeSupported:AVCaptureFocusModeContinuousAutoFocus] : NO;
  BOOL adjustingFocus = device && focusSupported ? device.isAdjustingFocus : NO;
  CFTimeInterval stableDurationMs =
      _cameraStableSince > 0 ? (CACurrentMediaTime() - _cameraStableSince) * 1000.0 : 0.0;
  AVCaptureWhiteBalanceGains gains = device ? device.deviceWhiteBalanceGains
                                            : (AVCaptureWhiteBalanceGains){0, 0, 0};

  return @{
    @"status": device ? @"ok" : @"camera_unavailable",
    @"adjustingExposure": @(adjustingExposure),
    @"adjustingWhiteBalance": @(adjustingWhiteBalance),
    @"adjustingFocus": @(adjustingFocus),
    @"focusSupported": @(focusSupported),
    @"isStable": @(stableDurationMs >= AURARealtimeCameraStableThresholdMs),
    @"stableDurationMs": @(stableDurationMs),
    @"stableThresholdMs": @(AURARealtimeCameraStableThresholdMs),
    @"iso": @(device ? device.ISO : 0),
    @"exposureDurationMs": @(device ? CMTimeGetSeconds(device.exposureDuration) * 1000.0 : 0),
    @"lensPosition": @(device ? device.lensPosition : 0),
    @"whiteBalanceGains": @{
      @"red": @(gains.redGain),
      @"green": @(gains.greenGain),
      @"blue": @(gains.blueGain),
    },
  };
}

- (NSDictionary *)lockCameraForCaptureAndCreateMetadata
{
  AVCaptureDevice *device = _videoInput.device;
  NSMutableDictionary *metadata = [[self cameraStabilityPayload] mutableCopy];
  metadata[@"captureLockedAtMs"] = @([[NSDate date] timeIntervalSince1970] * 1000.0);

  if (!device) {
    metadata[@"lockError"] = @"camera_unavailable";
    metadata[@"exposureLocked"] = @NO;
    metadata[@"whiteBalanceLocked"] = @NO;
    metadata[@"focusLocked"] = @NO;
    return metadata;
  }

  NSError *lockError = nil;
  BOOL exposureLocked = NO;
  BOOL whiteBalanceLocked = NO;
  BOOL focusLocked = NO;

  if (![device lockForConfiguration:&lockError]) {
    metadata[@"lockError"] = lockError.localizedDescription ?: @"lock_failed";
    metadata[@"exposureLocked"] = @NO;
    metadata[@"whiteBalanceLocked"] = @NO;
    metadata[@"focusLocked"] = @NO;
    return metadata;
  }

  if ([device isExposureModeSupported:AVCaptureExposureModeLocked]) {
    device.exposureMode = AVCaptureExposureModeLocked;
    exposureLocked = YES;
  }
  if ([device isWhiteBalanceModeSupported:AVCaptureWhiteBalanceModeLocked]) {
    device.whiteBalanceMode = AVCaptureWhiteBalanceModeLocked;
    whiteBalanceLocked = YES;
  }
  if ([device isFocusModeSupported:AVCaptureFocusModeLocked]) {
    device.focusMode = AVCaptureFocusModeLocked;
    focusLocked = YES;
  }

  [device unlockForConfiguration];
  metadata[@"exposureLocked"] = @(exposureLocked);
  metadata[@"whiteBalanceLocked"] = @(whiteBalanceLocked);
  metadata[@"focusLocked"] = @(focusLocked);
  metadata[@"lockError"] = [NSNull null];
  return metadata;
}

- (void)restoreCameraAutoModes
{
  AVCaptureDevice *device = _videoInput.device;
  if (!device) {
    return;
  }

  NSError *lockError = nil;
  if (![device lockForConfiguration:&lockError]) {
    return;
  }

  if ([device isExposureModeSupported:AVCaptureExposureModeContinuousAutoExposure]) {
    device.exposureMode = AVCaptureExposureModeContinuousAutoExposure;
  }
  if ([device isWhiteBalanceModeSupported:AVCaptureWhiteBalanceModeContinuousAutoWhiteBalance]) {
    device.whiteBalanceMode = AVCaptureWhiteBalanceModeContinuousAutoWhiteBalance;
  }
  if ([device isFocusModeSupported:AVCaptureFocusModeContinuousAutoFocus]) {
    device.focusMode = AVCaptureFocusModeContinuousAutoFocus;
  }

  [device unlockForConfiguration];
  [self refreshCameraStableSinceForDevice:device];
}

- (void)updatePreviewConnection
{
  if (![NSThread isMainThread]) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self updatePreviewConnection];
    });
    return;
  }

  AVCaptureConnection *connection = _previewLayer.connection;
  if (!connection) {
    return;
  }

  if ([connection isVideoOrientationSupported]) {
    connection.videoOrientation = AVCaptureVideoOrientationPortrait;
  }
  if ([connection isVideoMirroringSupported]) {
    connection.automaticallyAdjustsVideoMirroring = NO;
    connection.videoMirrored = [self devicePosition] == AVCaptureDevicePositionFront;
  }
}

- (void)updateOutputConnections
{
  for (AVCaptureOutput *output in _session.outputs) {
    for (AVCaptureConnection *connection in output.connections) {
      if ([connection isVideoOrientationSupported]) {
        connection.videoOrientation = AVCaptureVideoOrientationPortrait;
      }
      if ([connection isVideoMirroringSupported]) {
        connection.automaticallyAdjustsVideoMirroring = NO;
        BOOL mirrorsPreviewOnly =
            [self devicePosition] == AVCaptureDevicePositionFront && output != _videoOutput;
        connection.videoMirrored = mirrorsPreviewOnly;
      }
    }
  }
}

- (CGSize)viewSizeForProjection
{
  if ([NSThread isMainThread]) {
    _latestViewSize = self.bounds.size;
  }

  return _latestViewSize;
}

- (void)emitCameraError:(NSString *)status
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.onLandmarksDetected) {
      self.onLandmarksDetected(@{
        @"status": status,
        @"faceCount": @0,
        @"sequence": @(self->_sequence++),
      });
    }
  });
}

- (MPPFaceLandmarker *)faceLandmarker
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
  options.runningMode = MPPRunningModeVideo;
  options.numFaces = 1;
  options.minFaceDetectionConfidence = 0.5;
  options.minFacePresenceConfidence = 0.5;
  options.minTrackingConfidence = 0.5;
  options.outputFacialTransformationMatrixes = YES;

  NSError *error = nil;
  _faceLandmarker = [[MPPFaceLandmarker alloc] initWithOptions:options error:&error];
  if (!_faceLandmarker || error) {
    _faceLandmarkerInitError =
        error.localizedDescription ?: @"MediaPipe FaceLandmarker initialization failed.";
  }

  return _faceLandmarker;
}

- (NSInteger)mediaPipeTimestampMsForSampleBuffer:(CMSampleBufferRef)sampleBuffer
{
  CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
  NSTimeInterval seconds = CMTIME_IS_VALID(presentationTime)
      ? CMTimeGetSeconds(presentationTime)
      : CACurrentMediaTime();
  NSInteger timestampMs = (NSInteger)llround(seconds * 1000.0);

  if (timestampMs <= _lastMediaPipeTimestampMs) {
    timestampMs = _lastMediaPipeTimestampMs + 1;
  }

  _lastMediaPipeTimestampMs = timestampMs;
  return timestampMs;
}

- (NSMutableDictionary *)mediaPipeLandmarksPayloadFromLandmarks:
    (NSArray<MPPNormalizedLandmark *> *)faceLandmarks
{
  NSMutableDictionary *landmarks = [NSMutableDictionary dictionary];
  NSDictionary *forehead =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 10));
  NSDictionary *noseBridge =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 168));
  NSDictionary *noseTip =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 1));
  NSDictionary *chin =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 152));
  NSDictionary *leftEye =
      AURARealtimeAverageMediaPipePoint(faceLandmarks, @[@33, @133]);
  NSDictionary *rightEye =
      AURARealtimeAverageMediaPipePoint(faceLandmarks, @[@362, @263]);
  NSDictionary *mouthLeft =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 61));
  NSDictionary *mouthRight =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 291));
  NSDictionary *upperLip =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 13));
  NSDictionary *lowerLip =
      AURARealtimeMediaPipePoint(AURARealtimeMediaPipeLandmarkAtIndex(faceLandmarks, 14));

  if (forehead) {
    landmarks[@"forehead"] = forehead;
  }
  if (noseBridge) {
    landmarks[@"noseBridge"] = noseBridge;
  }
  if (noseTip) {
    landmarks[@"noseTip"] = noseTip;
  }
  if (chin) {
    landmarks[@"chin"] = chin;
  }
  if (leftEye) {
    landmarks[@"leftEye"] = leftEye;
  }
  if (rightEye) {
    landmarks[@"rightEye"] = rightEye;
  }
  if (mouthLeft) {
    landmarks[@"mouthLeft"] = mouthLeft;
  }
  if (mouthRight) {
    landmarks[@"mouthRight"] = mouthRight;
  }
  if (upperLip) {
    landmarks[@"upperLip"] = upperLip;
  }
  if (lowerLip) {
    landmarks[@"lowerLip"] = lowerLip;
  }

  return landmarks;
}

- (NSNumber *)mediaPipeFaceWidthRatioFromLandmarks:(NSDictionary *)landmarks
{
  NSDictionary *leftEye = landmarks[@"leftEye"];
  NSDictionary *rightEye = landmarks[@"rightEye"];
  NSDictionary *mouthLeft = landmarks[@"mouthLeft"];
  NSDictionary *mouthRight = landmarks[@"mouthRight"];

  if (leftEye && rightEye && mouthLeft && mouthRight) {
    CGFloat eyeWidth =
        fabs(AURARealtimeNumberFromPoint(rightEye, @"x") -
             AURARealtimeNumberFromPoint(leftEye, @"x"));
    CGFloat mouthWidth =
        fabs(AURARealtimeNumberFromPoint(mouthRight, @"x") -
             AURARealtimeNumberFromPoint(mouthLeft, @"x"));
    return @(fmax(eyeWidth * 2.35, mouthWidth * 2.15));
  }

  return nil;
}

- (NSDictionary *)mediaPipePayloadForSampleBuffer:(CMSampleBufferRef)sampleBuffer
{
  MPPFaceLandmarker *landmarker = [self faceLandmarker];
  if (!landmarker) {
    return @{
      @"status": @"landmark_missing",
      @"error": _faceLandmarkerInitError ?: @"MediaPipe FaceLandmarker is unavailable.",
    };
  }

  NSError *imageError = nil;
  MPPImage *image =
      [[MPPImage alloc] initWithSampleBuffer:sampleBuffer
                                 orientation:AURARealtimeMediaPipeImageOrientation([self devicePosition])
                                       error:&imageError];
  if (!image || imageError) {
    return @{
      @"status": @"landmark_missing",
      @"error": imageError.localizedDescription ?: @"MediaPipe image conversion failed.",
    };
  }

  NSError *detectError = nil;
  MPPFaceLandmarkerResult *result =
      [landmarker detectVideoFrame:image
           timestampInMilliseconds:[self mediaPipeTimestampMsForSampleBuffer:sampleBuffer]
                              error:&detectError];
  if (!result || detectError) {
    return @{
      @"status": @"landmark_missing",
      @"error": detectError.localizedDescription ?: @"MediaPipe detection failed.",
    };
  }

  NSArray<MPPNormalizedLandmark *> *faceLandmarks = result.faceLandmarks.firstObject;
  if (faceLandmarks.count == 0) {
    return @{
      @"status": @"no_face",
      @"landmarkCount": @0,
    };
  }

  NSMutableDictionary *landmarks =
      [self mediaPipeLandmarksPayloadFromLandmarks:faceLandmarks];
  NSMutableDictionary *payload = [@{
    @"status": @"ok",
    @"landmarkCount": @(faceLandmarks.count),
    @"landmarks": landmarks,
  } mutableCopy];
  NSDictionary *matrixPose =
      AURARealtimePoseFromMatrix(result.facialTransformationMatrixes.firstObject);
  NSDictionary *pose = matrixPose ?: AURARealtimePoseFromGeometry(landmarks);
  NSNumber *faceWidthRatio = [self mediaPipeFaceWidthRatioFromLandmarks:landmarks];

  [payload addEntriesFromDictionary:pose];
  if (faceWidthRatio) {
    payload[@"faceWidthRatio"] = faceWidthRatio;
  }

  return payload;
}

- (void)captureOutput:(AVCaptureOutput *)output
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
           fromConnection:(AVCaptureConnection *)connection
{
  CFTimeInterval now = CACurrentMediaTime();
  if (_isProcessingFrame || now - _lastFrameTimestamp < 0.08) {
    return;
  }

  _isProcessingFrame = YES;
  _lastFrameTimestamp = now;

  CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
  if (!imageBuffer) {
    _isProcessingFrame = NO;
    return;
  }

  CGSize imageSize = CGSizeMake(
      CVPixelBufferGetWidth(imageBuffer),
      CVPixelBufferGetHeight(imageBuffer));
  NSDictionary *mediaPipePayload = [self mediaPipePayloadForSampleBuffer:sampleBuffer];
  NSDictionary *cameraStabilityPayload = [self cameraStabilityPayload];
  CGImagePropertyOrientation orientation = AURARealtimeVideoOrientation([self devicePosition]);
  VNDetectFaceLandmarksRequest *request = [[VNDetectFaceLandmarksRequest alloc] init];
  VNImageRequestHandler *handler =
      [[VNImageRequestHandler alloc] initWithCMSampleBuffer:sampleBuffer
                                                orientation:orientation
                                                    options:@{}];
  NSError *error = nil;
  BOOL success = [handler performRequests:@[request] error:&error];

  if (!success || error) {
    [self emitPayload:@{
      @"status": @"detection_failed",
      @"faceCount": @0,
      @"imageWidth": @(imageSize.width),
      @"imageHeight": @(imageSize.height),
      @"sequence": @(_sequence++),
      @"mediaPipe": mediaPipePayload,
      @"cameraStability": cameraStabilityPayload,
    }];
    _isProcessingFrame = NO;
    return;
  }

  NSArray<VNFaceObservation *> *faces = request.results ?: @[];
  NSMutableDictionary *payload =
      [[self payloadForFaces:faces imageSize:imageSize] mutableCopy];
  payload[@"mediaPipe"] = mediaPipePayload;
  payload[@"cameraStability"] = cameraStabilityPayload;
  [self emitPayload:payload];
  _isProcessingFrame = NO;
}

- (NSDictionary *)payloadForFaces:(NSArray<VNFaceObservation *> *)faces imageSize:(CGSize)imageSize
{
  VNFaceObservation *face = AURARealtimeLargestFace(faces);
  NSMutableDictionary *payload = [@{
    @"status": face ? @"ok" : @"no_face",
    @"faceCount": @(faces.count),
    @"imageWidth": @(imageSize.width),
    @"imageHeight": @(imageSize.height),
    @"sequence": @(_sequence++),
  } mutableCopy];

  if (!face) {
    return payload;
  }

  NSDictionary *bounds = AURARealtimeBoundsFromObservation(face);
  NSMutableDictionary *landmarks = AURARealtimeLandmarksFromFace(face, imageSize);
  if (face.landmarks == nil || landmarks.count == 0) {
    payload[@"status"] = @"no_landmarks";
  }

  payload[@"bounds"] = bounds;
  payload[@"confidence"] = @(face.confidence);
  payload[@"landmarks"] = landmarks;
  return payload;
}

- (void)attachScreenLandmarksToPayload:(NSMutableDictionary *)payload
{
  NSDictionary *landmarks = payload[@"landmarks"];
  NSDictionary *screenLandmarks = nil;
  CFTimeInterval now = CACurrentMediaTime();

  if ([landmarks isKindOfClass:[NSDictionary class]]) {
    screenLandmarks = [self screenLandmarksFromLandmarks:landmarks];
  }

  if (screenLandmarks.count > 0) {
    payload[@"screenLandmarks"] = screenLandmarks;
    _lastScreenLandmarks = [screenLandmarks copy];
    _lastScreenLandmarksTimestamp = now;
    return;
  }

  if (_lastScreenLandmarks && now - _lastScreenLandmarksTimestamp <= 0.45) {
    payload[@"screenLandmarks"] = _lastScreenLandmarks;
    return;
  }

  [payload removeObjectForKey:@"screenLandmarks"];
}

- (NSDictionary *)screenLandmarksFromLandmarks:(NSDictionary *)landmarks
{
  NSMutableDictionary *screenLandmarks = [NSMutableDictionary dictionary];
  NSDictionary *forehead = landmarks[@"forehead"];
  NSDictionary *chin = landmarks[@"chin"];

  if (forehead) {
    NSDictionary *foreheadPoint = [self screenPointFromNormalizedPoint:forehead];
    if (foreheadPoint) {
      screenLandmarks[@"forehead"] = foreheadPoint;
    }
  }
  if (chin) {
    NSDictionary *chinPoint = [self screenPointFromNormalizedPoint:chin];
    if (chinPoint) {
      screenLandmarks[@"chin"] = chinPoint;
    }
  }

  return screenLandmarks;
}

- (void)attachMediaPipeScreenLandmarksToPayload:(NSMutableDictionary *)payload
{
  NSDictionary *mediaPipe = payload[@"mediaPipe"];
  if (![mediaPipe isKindOfClass:[NSDictionary class]]) {
    return;
  }

  NSDictionary *landmarks = mediaPipe[@"landmarks"];
  if (![landmarks isKindOfClass:[NSDictionary class]]) {
    return;
  }

  NSArray<NSString *> *screenPointKeys = @[
    @"forehead",
    @"noseBridge",
    @"noseTip",
    @"chin",
    @"leftEye",
    @"rightEye",
    @"mouthLeft",
    @"mouthRight",
  ];
  NSMutableDictionary *screenLandmarks = [NSMutableDictionary dictionary];

  for (NSString *key in screenPointKeys) {
    NSDictionary *point = landmarks[key];
    NSDictionary *screenPoint = [self screenPointFromNormalizedPoint:point];
    if (screenPoint) {
      screenLandmarks[key] = screenPoint;
    }
  }

  if (screenLandmarks.count == 0) {
    return;
  }

  NSMutableDictionary *nextMediaPipe = [mediaPipe mutableCopy];
  nextMediaPipe[@"screenLandmarks"] = screenLandmarks;
  payload[@"mediaPipe"] = nextMediaPipe;
}

- (CGPoint)captureDevicePointFromVisionPoint:(NSDictionary *)point
{
  CGFloat x = AURARealtimeClamp([point[@"x"] doubleValue]);
  CGFloat y = AURARealtimeClamp([point[@"y"] doubleValue]);

  // Vision landmarks are normalized after the sample buffer is oriented into
  // upright portrait coordinates. AVCaptureVideoPreviewLayer's point-of-interest
  // conversion API expects capture-device coordinates, which are rotated
  // relative to portrait. For the portrait preview used here, swap y/x before
  // handing the point to the preview layer. Front-camera mirroring is still
  // applied only by the preview connection, so do not mirror x here.
  return CGPointMake(y, x);
}

- (NSDictionary *)screenPointFromNormalizedPoint:(NSDictionary *)point
{
  if (![NSThread isMainThread] || CGRectIsEmpty(_previewLayer.bounds)) {
    return nil;
  }

  // AVCaptureVideoPreviewLayer owns front-camera mirror, videoGravity
  // resizeAspectFill, and crop. Let it convert into the exact rendered layer
  // point instead of duplicating those transforms by hand.
  CGPoint layerPoint =
      [_previewLayer pointForCaptureDevicePointOfInterest:
          [self captureDevicePointFromVisionPoint:point]];

  return AURARealtimeScreenPoint(layerPoint.x, layerPoint.y);
}

- (void)emitPayload:(NSDictionary *)payload
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSMutableDictionary *payloadWithScreenPoints = [payload mutableCopy];
    [self attachScreenLandmarksToPayload:payloadWithScreenPoints];
    [self attachMediaPipeScreenLandmarksToPayload:payloadWithScreenPoints];

    if (self.onLandmarksDetected) {
      self.onLandmarksDetected(payloadWithScreenPoints);
    }
  });
}

- (void)captureWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject
{
  dispatch_async(_sessionQueue, ^{
    if (!self->_photoOutput || !self->_isSessionRunning) {
      reject(@"REALTIME_CAMERA_UNAVAILABLE", @"Realtime face camera is not running.", nil);
      return;
    }

    if (self->_hasPendingCapture) {
      reject(@"REALTIME_CAMERA_BUSY", @"Realtime face camera is already capturing.", nil);
      return;
    }

    self->_hasPendingCapture = YES;
    self->_captureResolve = resolve;
    self->_captureReject = reject;
    self->_pendingCaptureCameraMetadata = [self lockCameraForCaptureAndCreateMetadata];

    [self updateOutputConnections];
    NSArray<AVSemanticSegmentationMatteType> *enabledMatteTypes =
        self->_semanticMatteCapture
            ? (self->_photoOutput.enabledSemanticSegmentationMatteTypes ?: @[])
            : @[];
    BOOL requestsSemanticMattes = enabledMatteTypes.count > 0;
    BOOL supportsHeic =
        [self->_photoOutput.availablePhotoCodecTypes containsObject:AVVideoCodecTypeHEVC];
    BOOL useHeic = requestsSemanticMattes && self->_semanticMatteRequiresHeic && supportsHeic;
    AVCapturePhotoSettings *settings = useHeic
        ? [AVCapturePhotoSettings photoSettingsWithFormat:@{AVVideoCodecKey: AVVideoCodecTypeHEVC}]
        : [AVCapturePhotoSettings photoSettings];
    settings.flashMode = AVCaptureFlashModeOff;
    self->_pendingCaptureFormat = useHeic ? @"heic" : @"jpg";
    self->_pendingSemanticMattes =
        AURARealtimeSemanticMatteAvailability(requestsSemanticMattes, NO, NO);

    if (requestsSemanticMattes) {
      settings.enabledSemanticSegmentationMatteTypes = enabledMatteTypes;
      settings.embedsSemanticSegmentationMattesInPhoto = YES;
      // SSM은 depth/portrait 처리 파이프라인에서 생성되므로 per-photo depth delivery가
      // 꺼져 있으면 matte가 조용히 생략된다(AVCam 샘플과 동일한 gating). depth 자체는
      // 파일에 임베드하지 않아 용량 증가를 피한다.
      if (self->_photoOutput.isDepthDataDeliveryEnabled) {
        settings.depthDataDeliveryEnabled = YES;
        settings.embedsDepthDataInPhoto = NO;
      }
      NSLog(@"[aura:face-capture] matte:capture-settings depthEnabled=%d embedsMattes=%d format=%@",
            settings.isDepthDataDeliveryEnabled,
            settings.embedsSemanticSegmentationMattesInPhoto,
            self->_pendingCaptureFormat);
    }

    [self->_photoOutput capturePhotoWithSettings:settings delegate:self];
  });
}

- (void)captureOutput:(AVCapturePhotoOutput *)output
    didFinishProcessingPhoto:(AVCapturePhoto *)photo
                       error:(NSError *)error
{
  dispatch_async(_sessionQueue, ^{
    RCTPromiseResolveBlock resolve = self->_captureResolve;
    RCTPromiseRejectBlock reject = self->_captureReject;
    NSDictionary *cameraMetadata = self->_pendingCaptureCameraMetadata;
    NSDictionary *pendingSemanticMattes = self->_pendingSemanticMattes;
    NSString *pendingFormat = self->_pendingCaptureFormat ?: @"jpg";
    self->_captureResolve = nil;
    self->_captureReject = nil;
    self->_pendingCaptureCameraMetadata = nil;
    self->_pendingSemanticMattes = nil;
    self->_pendingCaptureFormat = nil;
    self->_hasPendingCapture = NO;
    [self restoreCameraAutoModes];

    if (!resolve || !reject) {
      return;
    }

    if (error) {
      reject(@"REALTIME_CAPTURE_FAILED", error.localizedDescription, error);
      return;
    }

    NSData *imageData = [photo fileDataRepresentation];
    if (!imageData) {
      reject(@"REALTIME_CAPTURE_EMPTY", @"Realtime face camera returned an empty image.", nil);
      return;
    }

    NSString *fileName =
        [NSString stringWithFormat:@"aura-face-%@.%@", NSUUID.UUID.UUIDString, pendingFormat];
    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:fileName];
    NSURL *url = [NSURL fileURLWithPath:path];
    NSError *writeError = nil;

    if (![imageData writeToURL:url options:NSDataWritingAtomic error:&writeError]) {
      reject(@"REALTIME_CAPTURE_WRITE_FAILED", writeError.localizedDescription, writeError);
      return;
    }

    BOOL requestedSemanticMattes = [pendingSemanticMattes[@"requested"] boolValue];
    BOOL deliveredHairMatte = NO;
    BOOL deliveredSkinMatte = NO;
    BOOL embeddedHairMatte = NO;
    BOOL embeddedSkinMatte = NO;

    if (requestedSemanticMattes) {
      deliveredHairMatte =
          [photo semanticSegmentationMatteForType:AVSemanticSegmentationMatteTypeHair] != nil;
      deliveredSkinMatte =
          [photo semanticSegmentationMatteForType:AVSemanticSegmentationMatteTypeSkin] != nil;
      NSDictionary *embeddedAvailability = AURARealtimeEmbeddedSemanticMatteAvailability(url);
      embeddedHairMatte = [embeddedAvailability[@"hair"] boolValue];
      embeddedSkinMatte = [embeddedAvailability[@"skin"] boolValue];

      NSLog(@"[aura:face-capture] matte:embedded hair=%d skin=%d deliveredHair=%d deliveredSkin=%d format=%@",
            embeddedHairMatte,
            embeddedSkinMatte,
            deliveredHairMatte,
            deliveredSkinMatte,
            pendingFormat);

      if (![pendingFormat isEqualToString:@"heic"] &&
          (deliveredHairMatte || deliveredSkinMatte) &&
          (!embeddedHairMatte || !embeddedSkinMatte)) {
        self->_semanticMatteRequiresHeic = YES;
        NSLog(@"[aura:face-capture] matte:heic-fallback-enabled reason=jpeg_roundtrip_failed");
      }
    }

    UIImage *image = [UIImage imageWithData:imageData];
    NSMutableDictionary *payload = [@{
      @"uri": url.absoluteString,
      @"width": @(image.size.width),
      @"height": @(image.size.height),
      @"format": pendingFormat,
      @"cameraMetadata": cameraMetadata ?: @{},
    } mutableCopy];

    if (self->_semanticMatteCapture || pendingSemanticMattes) {
      payload[@"semanticMattes"] = AURARealtimeSemanticMatteAvailability(
          requestedSemanticMattes,
          requestedSemanticMattes ? deliveredHairMatte : NO,
          requestedSemanticMattes ? deliveredSkinMatte : NO);
      if (self->_matteCapability) {
        payload[@"matteCapability"] = self->_matteCapability;
      }
    }

    resolve(payload);
  });
}

@end

@interface AURARealtimeFaceCaptureViewManager : RCTViewManager
@end

@implementation AURARealtimeFaceCaptureViewManager

RCT_EXPORT_MODULE(AURARealtimeFaceCaptureView)
RCT_EXPORT_VIEW_PROPERTY(facing, NSString)
RCT_EXPORT_VIEW_PROPERTY(onLandmarksDetected, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(semanticMatteCapture, BOOL)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (UIView *)view
{
  return [AURARealtimeFaceCaptureView new];
}

RCT_EXPORT_METHOD(capture:(nonnull NSNumber *)reactTag
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [self.bridge.uiManager addUIBlock:^(
      RCTUIManager *uiManager,
      NSDictionary<NSNumber *, UIView *> *viewRegistry) {
    UIView *view = viewRegistry[reactTag];
    if (![view isKindOfClass:[AURARealtimeFaceCaptureView class]]) {
      reject(@"REALTIME_CAPTURE_VIEW_NOT_FOUND", @"Realtime face capture view was not found.", nil);
      return;
    }

    [(AURARealtimeFaceCaptureView *)view captureWithResolver:resolve rejecter:reject];
  }];
}

@end
