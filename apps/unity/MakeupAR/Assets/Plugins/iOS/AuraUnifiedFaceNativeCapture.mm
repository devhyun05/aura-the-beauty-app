#import <ARKit/ARKit.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreImage/CoreImage.h>
#import <ImageIO/ImageIO.h>
#import <UIKit/UIKit.h>
#import <simd/simd.h>

#include <cmath>
#include <cstdint>
#include <cstring>

#if __has_include("UnityXRNativePtrs.h")
#include "UnityXRNativePtrs.h"
#else
// Apple ARKit XR Plug-in 6.4 public native-pointer ABI. Keep this fallback in
// sync with Packages/com.unity.xr.arkit/Includes~/UnityXRNativePtrs.h.
typedef struct UnityXRNativeSession_1
{
    int version;
    void *sessionPtr;
} UnityXRNativeSession_1;

typedef UnityXRNativeSession_1 UnityXRNativeSession;
static const int kUnityXRNativeSessionVersion = 1;
#endif

typedef struct AuraUnifiedFaceNativeSampleInfo
{
    uint64_t token;
    double frameTimestampSeconds;
    int32_t imageWidth;
    int32_t imageHeight;
    int32_t vertexCount;
    int32_t triangleIndexCount;
    int32_t textureCoordinateCount;
    int32_t projectedVertexCount;
    int32_t trueDepthHardware;
    int32_t depthDataObserved;
    int32_t faceTrackingSupported;
} AuraUnifiedFaceNativeSampleInfo;

@interface AURAUnifiedFaceRetainedSample : NSObject
{
@public
    CVPixelBufferRef _pixelBuffer;
}

@property(nonatomic, assign) uint64_t token;
@property(nonatomic, assign) double frameTimestampSeconds;
@property(nonatomic, assign) int32_t imageWidth;
@property(nonatomic, assign) int32_t imageHeight;
@property(nonatomic, assign) CGAffineTransform displayTransform;
@property(nonatomic, assign) BOOL requiresHorizontalUnmirror;
@property(nonatomic, strong) NSData *vertices;
@property(nonatomic, strong) NSData *projectedVertices;
@property(nonatomic, strong) NSData *textureCoordinates;
@property(nonatomic, strong) NSData *triangleIndices;

- (instancetype)initWithPixelBuffer:(CVPixelBufferRef)pixelBuffer;

@end

@implementation AURAUnifiedFaceRetainedSample

- (instancetype)initWithPixelBuffer:(CVPixelBufferRef)pixelBuffer
{
    self = [super init];
    if (self != nil)
    {
        _pixelBuffer = pixelBuffer;
        if (_pixelBuffer != NULL)
        {
            CVPixelBufferRetain(_pixelBuffer);
        }
    }
    return self;
}

- (void)dealloc
{
    if (_pixelBuffer != NULL)
    {
        CVPixelBufferRelease(_pixelBuffer);
        _pixelBuffer = NULL;
    }
}

@end

static NSMutableDictionary<NSNumber *, AURAUnifiedFaceRetainedSample *> *
AURARetainedSamples(void)
{
    static NSMutableDictionary<NSNumber *, AURAUnifiedFaceRetainedSample *> *samples;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        samples = [NSMutableDictionary dictionary];
    });
    return samples;
}

static AURAUnifiedFaceRetainedSample *AURASampleForToken(uint64_t token)
{
    @synchronized([AURAUnifiedFaceRetainedSample class])
    {
        return AURARetainedSamples()[@(token)];
    }
}

static ARSession *AURAARSessionFromUnityNativePtr(const void *nativeSessionPtr)
{
    if (nativeSessionPtr == NULL)
    {
        return nil;
    }

    const UnityXRNativeSession *nativeSession =
        static_cast<const UnityXRNativeSession *>(nativeSessionPtr);
    if (nativeSession->version != kUnityXRNativeSessionVersion
        || nativeSession->sessionPtr == NULL)
    {
        return nil;
    }

    return (__bridge ARSession *)nativeSession->sessionPtr;
}

static BOOL AURAIsFinitePoint(CGPoint point)
{
    return std::isfinite(point.x) && std::isfinite(point.y);
}

static CGPoint AURAProjectWorldPoint(
    ARCamera *camera,
    vector_float3 worldPoint,
    CGSize viewportSize)
{
    return [camera projectPoint:worldPoint
                   orientation:UIInterfaceOrientationPortrait
                  viewportSize:viewportSize];
}

static CGPoint AURAOutputPointForRawCoreImagePoint(
    CGPoint rawCoreImagePoint,
    size_t rawWidth,
    size_t rawHeight,
    int32_t outputWidth,
    int32_t outputHeight,
    CGAffineTransform displayTransform,
    BOOL requiresHorizontalUnmirror)
{
    // Core Image uses a bottom-left origin. ARFrame.displayTransform uses
    // normalized image coordinates with a top-left origin.
    CGPoint normalizedImagePoint = CGPointMake(
        rawCoreImagePoint.x / static_cast<CGFloat>(rawWidth),
        1.0 - (rawCoreImagePoint.y / static_cast<CGFloat>(rawHeight)));
    CGPoint normalizedOutputPoint =
        CGPointApplyAffineTransform(normalizedImagePoint, displayTransform);
    if (requiresHorizontalUnmirror)
    {
        normalizedOutputPoint.x = 1.0 - normalizedOutputPoint.x;
    }

    return CGPointMake(
        normalizedOutputPoint.x * outputWidth,
        (1.0 - normalizedOutputPoint.y) * outputHeight);
}

static CGAffineTransform AURACoreImageTransformForSample(
    AURAUnifiedFaceRetainedSample *sample)
{
    size_t rawWidth = CVPixelBufferGetWidth(sample->_pixelBuffer);
    size_t rawHeight = CVPixelBufferGetHeight(sample->_pixelBuffer);

    CGPoint outputOrigin = AURAOutputPointForRawCoreImagePoint(
        CGPointMake(0.0, 0.0),
        rawWidth,
        rawHeight,
        sample.imageWidth,
        sample.imageHeight,
        sample.displayTransform,
        sample.requiresHorizontalUnmirror);
    CGPoint outputX = AURAOutputPointForRawCoreImagePoint(
        CGPointMake(static_cast<CGFloat>(rawWidth), 0.0),
        rawWidth,
        rawHeight,
        sample.imageWidth,
        sample.imageHeight,
        sample.displayTransform,
        sample.requiresHorizontalUnmirror);
    CGPoint outputY = AURAOutputPointForRawCoreImagePoint(
        CGPointMake(0.0, static_cast<CGFloat>(rawHeight)),
        rawWidth,
        rawHeight,
        sample.imageWidth,
        sample.imageHeight,
        sample.displayTransform,
        sample.requiresHorizontalUnmirror);

    return CGAffineTransformMake(
        (outputX.x - outputOrigin.x) / static_cast<CGFloat>(rawWidth),
        (outputX.y - outputOrigin.y) / static_cast<CGFloat>(rawWidth),
        (outputY.x - outputOrigin.x) / static_cast<CGFloat>(rawHeight),
        (outputY.y - outputOrigin.y) / static_cast<CGFloat>(rawHeight),
        outputOrigin.x,
        outputOrigin.y);
}

static int32_t AURACopyData(
    uint64_t token,
    NSData *data,
    void *destination,
    int32_t destinationByteCount)
{
    if (token == 0
        || data == nil
        || destination == NULL
        || destinationByteCount < 0
        || data.length != static_cast<NSUInteger>(destinationByteCount))
    {
        return 0;
    }

    std::memcpy(destination, data.bytes, data.length);
    return 1;
}

extern "C"
{
    int32_t AuraUnifiedFaceCapture_IsSessionAvailable(
        const void *nativeSessionPtr)
    {
        ARSession *session = AURAARSessionFromUnityNativePtr(nativeSessionPtr);
        return session != nil ? 1 : 0;
    }

    // Return codes are intentionally compact and fail-closed:
    // 1=success, -1=bad session ABI, -2=no current frame/image,
    // -3=not exactly one tracked ARFaceAnchor, -4=invalid mesh,
    // -5=projection invalid, -6=native retention capacity reached.
    int32_t AuraUnifiedFaceCapture_TryRetainCurrentFrame(
        const void *nativeSessionPtr,
        AuraUnifiedFaceNativeSampleInfo *sampleInfo)
    {
        if (sampleInfo == NULL)
        {
            return -1;
        }
        std::memset(sampleInfo, 0, sizeof(*sampleInfo));

        ARSession *session = AURAARSessionFromUnityNativePtr(nativeSessionPtr);
        if (session == nil)
        {
            return -1;
        }

        ARFrame *frame = session.currentFrame;
        CVPixelBufferRef capturedImage =
            frame != nil ? frame.capturedImage : NULL;
        if (frame == nil || capturedImage == NULL)
        {
            return -2;
        }

        ARFaceAnchor *faceAnchor = nil;
        NSInteger faceAnchorCount = 0;
        for (ARAnchor *anchor in frame.anchors)
        {
            if ([anchor isKindOfClass:[ARFaceAnchor class]])
            {
                ARFaceAnchor *candidate = (ARFaceAnchor *)anchor;
                if (candidate.isTracked)
                {
                    faceAnchorCount += 1;
                    faceAnchor = candidate;
                }
            }
        }
        if (faceAnchorCount != 1
            || faceAnchor == nil)
        {
            return -3;
        }

        ARFaceGeometry *geometry = faceAnchor.geometry;
        NSInteger vertexCount = geometry.vertexCount;
        NSInteger textureCoordinateCount = geometry.textureCoordinateCount;
        NSInteger triangleCount = geometry.triangleCount;
        if (geometry == nil
            || vertexCount <= 0
            || textureCoordinateCount != vertexCount
            || triangleCount <= 0
            || geometry.vertices == NULL
            || geometry.textureCoordinates == NULL
            || geometry.triangleIndices == NULL)
        {
            return -4;
        }

        size_t rawWidth = CVPixelBufferGetWidth(capturedImage);
        size_t rawHeight = CVPixelBufferGetHeight(capturedImage);
        if (rawWidth == 0
            || rawHeight == 0
            || rawWidth > INT32_MAX
            || rawHeight > INT32_MAX)
        {
            return -2;
        }

        // Preserve square/portrait sensors. Traditional front-camera buffers are
        // landscape and become width=rawHeight, height=rawWidth in portrait.
        int32_t outputWidth = static_cast<int32_t>(
            rawWidth >= rawHeight ? rawHeight : rawWidth);
        int32_t outputHeight = static_cast<int32_t>(
            rawWidth >= rawHeight ? rawWidth : rawHeight);
        CGSize portraitViewport = CGSizeMake(outputWidth, outputHeight);

        vector_float4 faceOrigin4 = simd_mul(
            faceAnchor.transform,
            simd_make_float4(0.0f, 0.0f, 0.0f, 1.0f));
        vector_float4 facePositiveX4 = simd_mul(
            faceAnchor.transform,
            simd_make_float4(0.01f, 0.0f, 0.0f, 1.0f));
        CGPoint projectedOrigin = AURAProjectWorldPoint(
            frame.camera,
            simd_make_float3(faceOrigin4.x, faceOrigin4.y, faceOrigin4.z),
            portraitViewport);
        CGPoint projectedPositiveX = AURAProjectWorldPoint(
            frame.camera,
            simd_make_float3(
                facePositiveX4.x,
                facePositiveX4.y,
                facePositiveX4.z),
            portraitViewport);
        if (!AURAIsFinitePoint(projectedOrigin)
            || !AURAIsFinitePoint(projectedPositiveX)
            || std::fabs(projectedPositiveX.x - projectedOrigin.x) < 0.001)
        {
            return -5;
        }

        // ARFace local +X points to the viewer's right. If ARKit's presentation
        // projection places it leftward, explicitly unmirror both the saved JPEG
        // and projected vertices so they share one portrait-unmirrored space.
        BOOL requiresHorizontalUnmirror =
            projectedPositiveX.x < projectedOrigin.x;

        NSMutableData *vertices =
            [NSMutableData dataWithLength:
                static_cast<NSUInteger>(vertexCount) * 3 * sizeof(float)];
        NSMutableData *projectedVertices =
            [NSMutableData dataWithLength:
                static_cast<NSUInteger>(vertexCount) * 2 * sizeof(float)];
        NSMutableData *textureCoordinates =
            [NSMutableData dataWithLength:
                static_cast<NSUInteger>(textureCoordinateCount)
                * 2 * sizeof(float)];
        NSMutableData *triangleIndices =
            [NSMutableData dataWithLength:
                static_cast<NSUInteger>(triangleCount) * 3 * sizeof(int32_t)];

        float *vertexDestination =
            static_cast<float *>(vertices.mutableBytes);
        float *projectedDestination =
            static_cast<float *>(projectedVertices.mutableBytes);
        float *uvDestination =
            static_cast<float *>(textureCoordinates.mutableBytes);
        int32_t *indexDestination =
            static_cast<int32_t *>(triangleIndices.mutableBytes);

        const vector_float3 *sourceVertices = geometry.vertices;
        const vector_float2 *sourceTextureCoordinates =
            geometry.textureCoordinates;
        for (NSInteger index = 0; index < vertexCount; index += 1)
        {
            vector_float3 localVertex = sourceVertices[index];

            // Match ARKitFaceSubsystem 6.4's right-handed to Unity conversion.
            vertexDestination[index * 3] = localVertex.x;
            vertexDestination[index * 3 + 1] = localVertex.y;
            vertexDestination[index * 3 + 2] = -localVertex.z;

            vector_float4 worldVertex4 = simd_mul(
                faceAnchor.transform,
                simd_make_float4(
                    localVertex.x,
                    localVertex.y,
                    localVertex.z,
                    1.0f));
            CGPoint projectedPoint = AURAProjectWorldPoint(
                frame.camera,
                simd_make_float3(
                    worldVertex4.x,
                    worldVertex4.y,
                    worldVertex4.z),
                portraitViewport);
            if (!AURAIsFinitePoint(projectedPoint))
            {
                return -5;
            }

            CGFloat normalizedX = projectedPoint.x / outputWidth;
            CGFloat normalizedY = projectedPoint.y / outputHeight;
            if (requiresHorizontalUnmirror)
            {
                normalizedX = 1.0 - normalizedX;
            }
            projectedDestination[index * 2] =
                static_cast<float>(fmax(0.0, fmin(1.0, normalizedX)));
            projectedDestination[index * 2 + 1] =
                static_cast<float>(fmax(0.0, fmin(1.0, normalizedY)));

            // Match ARKitFaceSubsystem 6.4's top-left Unity UV convention.
            vector_float2 sourceUv = sourceTextureCoordinates[index];
            uvDestination[index * 2] = sourceUv.x;
            uvDestination[index * 2 + 1] = 1.0f - sourceUv.y;
        }

        const int16_t *sourceTriangleIndices = geometry.triangleIndices;
        for (NSInteger triangle = 0; triangle < triangleCount; triangle += 1)
        {
            NSInteger sourceOffset = triangle * 3;
            NSInteger destinationOffset = triangle * 3;
            indexDestination[destinationOffset] =
                sourceTriangleIndices[sourceOffset];
            indexDestination[destinationOffset + 1] =
                sourceTriangleIndices[sourceOffset + 2];
            indexDestination[destinationOffset + 2] =
                sourceTriangleIndices[sourceOffset + 1];
        }

        AURAUnifiedFaceRetainedSample *sample =
            [[AURAUnifiedFaceRetainedSample alloc]
                initWithPixelBuffer:capturedImage];
        sample.frameTimestampSeconds = frame.timestamp;
        sample.imageWidth = outputWidth;
        sample.imageHeight = outputHeight;
        sample.displayTransform =
            [frame displayTransformForOrientation:UIInterfaceOrientationPortrait
                                      viewportSize:portraitViewport];
        sample.requiresHorizontalUnmirror = requiresHorizontalUnmirror;
        sample.vertices = vertices;
        sample.projectedVertices = projectedVertices;
        sample.textureCoordinates = textureCoordinates;
        sample.triangleIndices = triangleIndices;

        @synchronized([AURAUnifiedFaceRetainedSample class])
        {
            NSMutableDictionary *samples = AURARetainedSamples();
            if (samples.count >= 16)
            {
                return -6;
            }

            static uint64_t nextToken = 1;
            sample.token = nextToken++;
            if (sample.token == 0)
            {
                sample.token = nextToken++;
            }
            samples[@(sample.token)] = sample;
        }

        sampleInfo->token = sample.token;
        sampleInfo->frameTimestampSeconds = sample.frameTimestampSeconds;
        sampleInfo->imageWidth = sample.imageWidth;
        sampleInfo->imageHeight = sample.imageHeight;
        sampleInfo->vertexCount = static_cast<int32_t>(vertexCount);
        sampleInfo->triangleIndexCount =
            static_cast<int32_t>(triangleCount * 3);
        sampleInfo->textureCoordinateCount =
            static_cast<int32_t>(textureCoordinateCount);
        sampleInfo->projectedVertexCount =
            static_cast<int32_t>(vertexCount);
        AVCaptureDevice *trueDepthCamera =
            [AVCaptureDevice
                defaultDeviceWithDeviceType:
                    AVCaptureDeviceTypeBuiltInTrueDepthCamera
                mediaType:AVMediaTypeVideo
                position:AVCaptureDevicePositionFront];
        sampleInfo->trueDepthHardware = trueDepthCamera != nil ? 1 : 0;
        sampleInfo->depthDataObserved =
            frame.capturedDepthData != nil ? 1 : 0;
        sampleInfo->faceTrackingSupported =
            [ARFaceTrackingConfiguration isSupported] ? 1 : 0;
        return 1;
    }

    int32_t AuraUnifiedFaceCapture_CopyVertices(
        uint64_t token,
        float *destination,
        int32_t floatCount)
    {
        AURAUnifiedFaceRetainedSample *sample = AURASampleForToken(token);
        return AURACopyData(
            token,
            sample.vertices,
            destination,
            floatCount * static_cast<int32_t>(sizeof(float)));
    }

    int32_t AuraUnifiedFaceCapture_CopyProjectedVertices(
        uint64_t token,
        float *destination,
        int32_t floatCount)
    {
        AURAUnifiedFaceRetainedSample *sample = AURASampleForToken(token);
        return AURACopyData(
            token,
            sample.projectedVertices,
            destination,
            floatCount * static_cast<int32_t>(sizeof(float)));
    }

    int32_t AuraUnifiedFaceCapture_CopyTextureCoordinates(
        uint64_t token,
        float *destination,
        int32_t floatCount)
    {
        AURAUnifiedFaceRetainedSample *sample = AURASampleForToken(token);
        return AURACopyData(
            token,
            sample.textureCoordinates,
            destination,
            floatCount * static_cast<int32_t>(sizeof(float)));
    }

    int32_t AuraUnifiedFaceCapture_CopyTriangleIndices(
        uint64_t token,
        int32_t *destination,
        int32_t indexCount)
    {
        AURAUnifiedFaceRetainedSample *sample = AURASampleForToken(token);
        return AURACopyData(
            token,
            sample.triangleIndices,
            destination,
            indexCount * static_cast<int32_t>(sizeof(int32_t)));
    }

    int32_t AuraUnifiedFaceCapture_PersistJpeg(
        uint64_t token,
        const char *utf8Path,
        float quality)
    {
        @autoreleasepool
        {
            AURAUnifiedFaceRetainedSample *sample =
                AURASampleForToken(token);
            if (sample == nil
                || sample->_pixelBuffer == NULL
                || utf8Path == NULL)
            {
                return 0;
            }

            NSString *path = [NSString stringWithUTF8String:utf8Path];
            if (path.length == 0)
            {
                return 0;
            }

            CIImage *sourceImage =
                [CIImage imageWithCVPixelBuffer:sample->_pixelBuffer];
            CGAffineTransform imageTransform =
                AURACoreImageTransformForSample(sample);
            CIImage *outputImage =
                [[sourceImage imageByApplyingTransform:imageTransform]
                    imageByCroppingToRect:CGRectMake(
                        0.0,
                        0.0,
                        sample.imageWidth,
                        sample.imageHeight)];

            static CIContext *context;
            static dispatch_once_t contextOnceToken;
            dispatch_once(&contextOnceToken, ^{
                context = [CIContext contextWithOptions:nil];
            });

            CGColorSpaceRef colorSpace =
                CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
            CGImageRef cgImage = [context createCGImage:outputImage
                                               fromRect:CGRectMake(
                                                   0.0,
                                                   0.0,
                                                   sample.imageWidth,
                                                   sample.imageHeight)
                                                 format:kCIFormatRGBA8
                                             colorSpace:colorSpace];
            CGColorSpaceRelease(colorSpace);
            if (cgImage == NULL)
            {
                return 0;
            }

            UIImage *image = [UIImage imageWithCGImage:cgImage
                                                 scale:1.0
                                           orientation:UIImageOrientationUp];
            CGImageRelease(cgImage);
            NSData *jpeg = UIImageJPEGRepresentation(
                image,
                fmaxf(0.0f, fminf(1.0f, quality)));
            if (jpeg == nil)
            {
                return 0;
            }

            NSError *writeError = nil;
            BOOL wrote = [jpeg writeToFile:path
                                   options:NSDataWritingAtomic
                                     error:&writeError];
            return wrote && writeError == nil ? 1 : 0;
        }
    }

    void AuraUnifiedFaceCapture_Release(uint64_t token)
    {
        if (token == 0)
        {
            return;
        }

        @synchronized([AURAUnifiedFaceRetainedSample class])
        {
            [AURARetainedSamples() removeObjectForKey:@(token)];
        }
    }

    void AuraUnifiedFaceCapture_Reset(void)
    {
        @synchronized([AURAUnifiedFaceRetainedSample class])
        {
            [AURARetainedSamples() removeAllObjects];
        }
    }
}
