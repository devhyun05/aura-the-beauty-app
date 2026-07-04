#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <React/RCTBridge.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTUIManager.h>
#import <React/RCTViewManager.h>
#import <UIKit/UIKit.h>
#import <Vision/Vision.h>

static CGFloat AURARealtimeClamp(CGFloat value)
{
  return fmax(0.0, fmin(1.0, value));
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

@interface AURARealtimeFaceCaptureView : UIView <AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate>

@property (nonatomic, copy) RCTDirectEventBlock onLandmarksDetected;
@property (nonatomic, copy) NSString *facing;

- (void)captureWithResolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject;

@end

@implementation AURARealtimeFaceCaptureView {
  AVCaptureSession *_session;
  AVCaptureDeviceInput *_videoInput;
  AVCaptureVideoDataOutput *_videoOutput;
  AVCapturePhotoOutput *_photoOutput;
  AVCaptureVideoPreviewLayer *_previewLayer;
  dispatch_queue_t _sessionQueue;
  dispatch_queue_t _visionQueue;
  BOOL _isProcessingFrame;
  BOOL _isSessionConfigured;
  BOOL _isSessionRunning;
  BOOL _hasPendingCapture;
  CGSize _latestViewSize;
  NSDictionary *_lastScreenLandmarks;
  CFTimeInterval _lastScreenLandmarksTimestamp;
  CFTimeInterval _lastFrameTimestamp;
  NSInteger _sequence;
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

- (BOOL)configureSession
{
  [_session beginConfiguration];
  _session.sessionPreset = AVCaptureSessionPreset1280x720;

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

  [_session commitConfiguration];
  _isSessionConfigured = YES;
  [self updateOutputConnections];
  [self updatePreviewConnection];
  return YES;
}

- (AVCaptureDevice *)cameraDeviceForPosition:(AVCaptureDevicePosition)position
{
  AVCaptureDeviceDiscoverySession *discovery = [AVCaptureDeviceDiscoverySession
      discoverySessionWithDeviceTypes:@[
        AVCaptureDeviceTypeBuiltInWideAngleCamera,
      ]
                            mediaType:AVMediaTypeVideo
                             position:position];
  return discovery.devices.firstObject;
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
  CGImagePropertyOrientation orientation = AURARealtimeVideoOrientation([self devicePosition]);
  VNDetectFaceLandmarksRequest *request = [[VNDetectFaceLandmarksRequest alloc] init];
  VNImageRequestHandler *handler =
      [[VNImageRequestHandler alloc] initWithCMSampleBuffer:sampleBuffer
                                                orientation:orientation
                                                    options:@{}];
  NSError *error = nil;
  BOOL success = [handler performRequests:@[request] error:&error];

  if (!success || error) {
    [self emitCameraError:@"detection_failed"];
    _isProcessingFrame = NO;
    return;
  }

  NSArray<VNFaceObservation *> *faces = request.results ?: @[];
  NSDictionary *payload = [self payloadForFaces:faces imageSize:imageSize];
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

    [self updateOutputConnections];
    AVCapturePhotoSettings *settings = [AVCapturePhotoSettings photoSettings];
    settings.flashMode = AVCaptureFlashModeOff;
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
    self->_captureResolve = nil;
    self->_captureReject = nil;
    self->_hasPendingCapture = NO;

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

    NSString *fileName = [NSString stringWithFormat:@"aura-face-%@.jpg", NSUUID.UUID.UUIDString];
    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:fileName];
    NSURL *url = [NSURL fileURLWithPath:path];
    NSError *writeError = nil;

    if (![imageData writeToURL:url options:NSDataWritingAtomic error:&writeError]) {
      reject(@"REALTIME_CAPTURE_WRITE_FAILED", writeError.localizedDescription, writeError);
      return;
    }

    UIImage *image = [UIImage imageWithData:imageData];
    resolve(@{
      @"uri": url.absoluteString,
      @"width": @(image.size.width),
      @"height": @(image.size.height),
      @"format": @"jpg",
    });
  });
}

@end

@interface AURARealtimeFaceCaptureViewManager : RCTViewManager
@end

@implementation AURARealtimeFaceCaptureViewManager

RCT_EXPORT_MODULE(AURARealtimeFaceCaptureView)
RCT_EXPORT_VIEW_PROPERTY(facing, NSString)
RCT_EXPORT_VIEW_PROPERTY(onLandmarksDetected, RCTDirectEventBlock)

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
