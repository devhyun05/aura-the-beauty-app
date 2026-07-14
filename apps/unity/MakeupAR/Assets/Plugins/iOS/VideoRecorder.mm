#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#import <CoreMedia/CoreMedia.h>

// Native H.264 encoder for ARMakeup video recording.
//
// VideoRecorder.cs feeds one RGBA32 frame per call (bottom-up, as returned by
// Unity's Texture2D.ReadPixels). This writes an .mov via AVAssetWriter:
//   armakeupVideoBegin(path, w, h, fps)      — open the writer
//   armakeupVideoAppend(rgba, length, index) — append one frame at index/fps
//   armakeupVideoEnd(callback)               — finalize + save to album, then callback
//
// Requires AVFoundation / CoreMedia / CoreVideo (linked via IOSPostBuild.cs).
// NSPhotoLibraryAddUsageDescription in Info.plist is needed for the album save
// (same add-only prompt as the photo path).

typedef void (*ARMakeupVideoDoneCallback)(int success, const char* message);

// ── Writer state (single active recording; Unity serializes begin/append/end) ──
static AVAssetWriter *gWriter = nil;
static AVAssetWriterInput *gInput = nil;
static AVAssetWriterInputPixelBufferAdaptor *gAdaptor = nil;
static NSString *gPath = nil;
static int gWidth = 0;
static int gHeight = 0;
static int gFps = 30;

// Reports success/message on the main queue and releases the writer state.
static void ARMakeupVideoFinish(ARMakeupVideoDoneCallback cb, int success, NSString *message)
{
    gInput = nil;
    gAdaptor = nil;
    gWriter = nil;
    NSString *msg = message ?: @"";
    dispatch_async(dispatch_get_main_queue(), ^{
        if (cb != NULL) cb(success, [msg UTF8String]);
    });
}

// Saves the finished .mov into the photo album, then fires the callback.
@interface ARMakeupVideoAlbumSaver : NSObject
@property (nonatomic, assign) ARMakeupVideoDoneCallback callback;
@end

@implementation ARMakeupVideoAlbumSaver
- (void)video:(NSString *)path didFinishSavingWithError:(NSError *)error contextInfo:(void *)ctx
{
    ARMakeupVideoDoneCallback cb = self.callback;
    if (error == nil)
    {
        if (cb != NULL) cb(1, "");
    }
    else
    {
        const char *m = [[error localizedDescription] UTF8String];
        if (cb != NULL) cb(0, m != NULL ? m : "album save failed");
    }
    CFRelease((__bridge CFTypeRef)self); // balance the CFRetain in armakeupVideoEnd
}
@end

extern "C"
{
    int armakeupVideoBegin(const char *cPath, int width, int height, int fps)
    {
        @autoreleasepool
        {
            if (gWriter != nil) return 0; // already recording
            if (cPath == NULL || width <= 0 || height <= 0) return 0;

            gPath = [NSString stringWithUTF8String:cPath];
            gWidth = width;
            gHeight = height;
            gFps = fps > 0 ? fps : 30;

            [[NSFileManager defaultManager] removeItemAtPath:gPath error:nil]; // writer refuses existing file

            NSError *err = nil;
            NSURL *url = [NSURL fileURLWithPath:gPath];
            gWriter = [[AVAssetWriter alloc] initWithURL:url fileType:AVFileTypeQuickTimeMovie error:&err];
            if (gWriter == nil) return 0;

            NSDictionary *compression = @{
                AVVideoAverageBitRateKey: @((long)width * height * 6),
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            };
            NSDictionary *settings = @{
                AVVideoCodecKey: AVVideoCodecTypeH264,
                AVVideoWidthKey: @(width),
                AVVideoHeightKey: @(height),
                AVVideoCompressionPropertiesKey: compression,
            };
            gInput = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo outputSettings:settings];
            gInput.expectsMediaDataInRealTime = YES;

            NSDictionary *sourceAttrs = @{
                (id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA),
                (id)kCVPixelBufferWidthKey: @(width),
                (id)kCVPixelBufferHeightKey: @(height),
            };
            gAdaptor = [AVAssetWriterInputPixelBufferAdaptor
                assetWriterInputPixelBufferAdaptorWithAssetWriterInput:gInput
                                            sourcePixelBufferAttributes:sourceAttrs];

            if (![gWriter canAddInput:gInput]) { gWriter = nil; gInput = nil; gAdaptor = nil; return 0; }
            [gWriter addInput:gInput];

            if (![gWriter startWriting]) { gWriter = nil; gInput = nil; gAdaptor = nil; return 0; }
            [gWriter startSessionAtSourceTime:kCMTimeZero];
            return 1;
        }
    }

    int armakeupVideoAppend(const unsigned char *rgba, int length, int frameIndex)
    {
        @autoreleasepool
        {
            if (gWriter == nil || gInput == nil || gAdaptor == nil) return 0;
            if (rgba == NULL || length < gWidth * gHeight * 4) return 0;
            if (!gInput.isReadyForMoreMediaData) return 0; // drop; PTS gap is harmless

            CVPixelBufferRef pb = NULL;
            CVReturn cvr = kCVReturnError;
            if (gAdaptor.pixelBufferPool != NULL)
                cvr = CVPixelBufferPoolCreatePixelBuffer(NULL, gAdaptor.pixelBufferPool, &pb);
            if (cvr != kCVReturnSuccess || pb == NULL)
            {
                NSDictionary *attrs = @{ (id)kCVPixelBufferCGImageCompatibilityKey: @YES,
                                         (id)kCVPixelBufferCGBitmapContextCompatibilityKey: @YES };
                cvr = CVPixelBufferCreate(kCFAllocatorDefault, gWidth, gHeight,
                                          kCVPixelFormatType_32BGRA,
                                          (__bridge CFDictionaryRef)attrs, &pb);
            }
            if (cvr != kCVReturnSuccess || pb == NULL) return 0;

            CVPixelBufferLockBaseAddress(pb, 0);
            uint8_t *base = (uint8_t *)CVPixelBufferGetBaseAddress(pb);
            size_t bpr = CVPixelBufferGetBytesPerRow(pb);
            // RGBA(아래→위) → BGRA(위→아래): 수직 뒤집기 + R/B 스왑.
            for (int y = 0; y < gHeight; y++)
            {
                const uint8_t *src = rgba + (size_t)(gHeight - 1 - y) * gWidth * 4;
                uint8_t *dst = base + (size_t)y * bpr;
                for (int x = 0; x < gWidth; x++)
                {
                    dst[x * 4 + 0] = src[x * 4 + 2]; // B
                    dst[x * 4 + 1] = src[x * 4 + 1]; // G
                    dst[x * 4 + 2] = src[x * 4 + 0]; // R
                    dst[x * 4 + 3] = src[x * 4 + 3]; // A
                }
            }
            CVPixelBufferUnlockBaseAddress(pb, 0);

            CMTime pts = CMTimeMake(frameIndex, gFps);
            BOOL ok = [gAdaptor appendPixelBuffer:pb withPresentationTime:pts];
            CVPixelBufferRelease(pb);
            return ok ? 1 : 0;
        }
    }

    void armakeupVideoEnd(ARMakeupVideoDoneCallback callback)
    {
        if (gWriter == nil || gInput == nil)
        {
            ARMakeupVideoFinish(callback, 0, @"no active recording");
            return;
        }

        AVAssetWriter *writer = gWriter;
        NSString *path = gPath;
        [gInput markAsFinished];
        [writer finishWritingWithCompletionHandler:^{
            if (writer.status != AVAssetWriterStatusCompleted)
            {
                NSString *m = writer.error ? [writer.error localizedDescription] : @"writer did not complete";
                ARMakeupVideoFinish(callback, 0, m);
                return;
            }
            // Finished on an arbitrary queue; album save wants the main queue.
            dispatch_async(dispatch_get_main_queue(), ^{
                gInput = nil; gAdaptor = nil; gWriter = nil;
                if (UIVideoAtPathIsCompatibleWithSavedPhotosAlbum(path))
                {
                    ARMakeupVideoAlbumSaver *saver = [ARMakeupVideoAlbumSaver new];
                    saver.callback = callback;
                    CFRetain((__bridge CFTypeRef)saver); // kept alive until the save selector fires
                    UISaveVideoAtPathToSavedPhotosAlbum(path, saver,
                        @selector(video:didFinishSavingWithError:contextInfo:), NULL);
                }
                else
                {
                    // File is valid on disk even if the album rejects it; report the path anyway.
                    if (callback != NULL) callback(1, "");
                }
            });
        }];
    }
}
