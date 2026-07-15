#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#import <CoreMedia/CoreMedia.h>
#include <unistd.h> // usleep (오프라인 인코더 대기 스핀)

// 사전 촬영 미디어 보정(MediaEditController.cs)용 네이티브 헬퍼.
//
//  - armakeupNormalizeImage   : 갤러리 사진의 EXIF 방향을 정립으로 구워 JPEG로 재저장.
//  - armakeupProbeVideo       : 소스 영상의 (캡드·짝수) 출력 크기·프레임 수·fps 조회.
//  - armakeupDecodeFirstFrame : 영상 첫 프레임을 top-first RGBA로 디코드(편집 스틸 프리뷰).
//  - armakeupVideoEditBegin   : 소스 리더(방향 정규화 비디오 컴포지션) + 비디오 전용 라이터 개시.
//  - armakeupVideoEditReadFrame: 다음 디코드 프레임을 top-first RGBA로 반환(+PTS).
//  - armakeupVideoEditWriteFrame: 처리된 프레임(Unity 리드백 = bottom-first RGBA)을 PTS로 기록.
//  - armakeupVideoEditEnd     : 비디오 트랙 완료 → 소스 오디오 패스스루 머지 → dst → 앨범 저장.
//  - armakeupVideoEditAbort   : 중간 취소·정리.
//
// 방향: AVAssetReaderVideoCompositionOutput + videoCompositionWithPropertiesOfAsset로 소스의
// preferredTransform을 적용해 "똑바로 선" BGRA 프레임을 얻는다. 다운스케일은 BGRA→RGBA 복사
// 시 포인트 샘플로 처리(캡드 출력 크기). 세로 뒤집기는 소비자별로 다르다:
//   read(디코드): top-first(Unity FramePresenter/MediaPipe 규약)
//   write(인코드): 입력이 Unity ReadPixels = bottom-first이므로 네이티브가 뒤집어 top-first BGRA.
//
// AVFoundation/CoreMedia/CoreVideo는 IOSPostBuild.cs가 링크(VideoRecorder와 공유).
// 앨범 저장엔 NSPhotoLibraryAddUsageDescription(Info.plist)가 필요(사진 경로와 동일).

typedef void (*ARMakeupMediaDoneCallback)(int success, const char* message);

// 전방 선언 — armakeupVideoEditEnd(extern "C" 블록)에서 정의보다 먼저 참조.
static void ARMakeupSaveVideoToAlbum(NSString *path, ARMakeupMediaDoneCallback callback);

// ── 편집 세션 전역 (단일 활성 — Unity가 begin/read/write/end를 직렬화) ──
static AVAssetReader *gReader = nil;
static AVAssetReaderVideoCompositionOutput *gReaderOutput = nil;
static AVAssetWriter *gWriter = nil;
static AVAssetWriterInput *gWriterInput = nil;
static AVAssetWriterInputPixelBufferAdaptor *gAdaptor = nil;
static NSString *gSrcPath = nil;   // 오디오 패스스루 소스
static NSString *gDstPath = nil;   // 최종 출력(오디오 머지본)
static NSString *gTempVideoPath = nil; // 비디오 전용 중간본
static int gOrientedW = 0, gOrientedH = 0; // 방향 정규화된 소스 프레임 크기
static int gOutW = 0, gOutH = 0;           // 캡드·짝수 출력 크기

static int EvenFloor(int v) { int e = v & ~1; return e < 2 ? 2 : e; }

// 오리엔티드 크기를 긴 변 maxLong 이하 짝수로 캡.
static void CapSize(int inW, int inH, int maxLong, int *outW, int *outH)
{
    int longSide = inW > inH ? inW : inH;
    if (maxLong <= 0) maxLong = longSide;
    double scale = longSide > maxLong ? (double)maxLong / longSide : 1.0;
    *outW = EvenFloor((int)(inW * scale + 0.5));
    *outH = EvenFloor((int)(inH * scale + 0.5));
}

// 소스의 방향 정규화 비디오 컴포지션 + 오리엔티드 크기. 실패 시 nil.
static AVMutableVideoComposition *BuildVideoComposition(AVAsset *asset, int *w, int *h)
{
    NSArray<AVAssetTrack *> *vtracks = [asset tracksWithMediaType:AVMediaTypeVideo];
    if (vtracks.count == 0) return nil;
    AVMutableVideoComposition *vc = [AVMutableVideoComposition videoCompositionWithPropertiesOfAsset:asset];
    if (vc == nil) return nil;
    // 프레임 지속(합성 프레임 레이트) — 소스 공칭 fps 사용(없으면 30).
    AVAssetTrack *vt = vtracks.firstObject;
    float fps = vt.nominalFrameRate > 0 ? vt.nominalFrameRate : 30.0f;
    vc.frameDuration = CMTimeMake(1, (int32_t)(fps + 0.5f));
    *w = (int)(vc.renderSize.width + 0.5);
    *h = (int)(vc.renderSize.height + 0.5);
    return vc;
}

// BGRA CVPixelBuffer(위→아래) → 목적 RGBA로 포인트 샘플 다운스케일.
//   topFirst=YES  : 목적 행0 = 소스 상단 (디코드/read — Unity/MediaPipe 규약)
static void CopyBGRAtoRGBA(CVPixelBufferRef pb, unsigned char *dst, int outW, int outH, int srcW, int srcH)
{
    CVPixelBufferLockBaseAddress(pb, kCVPixelBufferLock_ReadOnly);
    const uint8_t *base = (const uint8_t *)CVPixelBufferGetBaseAddress(pb);
    size_t bpr = CVPixelBufferGetBytesPerRow(pb);
    for (int y = 0; y < outH; y++)
    {
        int sy = srcH == outH ? y : (int)((long)y * srcH / outH);
        if (sy >= srcH) sy = srcH - 1;
        const uint8_t *srow = base + (size_t)sy * bpr;
        uint8_t *drow = dst + (size_t)y * outW * 4;
        for (int x = 0; x < outW; x++)
        {
            int sx = srcW == outW ? x : (int)((long)x * srcW / outW);
            if (sx >= srcW) sx = srcW - 1;
            const uint8_t *sp = srow + (size_t)sx * 4; // BGRA
            uint8_t *dp = drow + (size_t)x * 4;
            dp[0] = sp[2]; // R
            dp[1] = sp[1]; // G
            dp[2] = sp[0]; // B
            dp[3] = sp[3]; // A
        }
    }
    CVPixelBufferUnlockBaseAddress(pb, kCVPixelBufferLock_ReadOnly);
}

static void ARMediaFinish(ARMakeupMediaDoneCallback cb, int success, NSString *message)
{
    NSString *msg = message ?: @"";
    dispatch_async(dispatch_get_main_queue(), ^{ if (cb) cb(success, [msg UTF8String]); });
}

// 완료 셀렉터 타깃 — 앨범 저장 결과를 콜백으로 전달.
@interface ARMakeupMediaAlbumSaver : NSObject
@property (nonatomic, assign) ARMakeupMediaDoneCallback callback;
@end
@implementation ARMakeupMediaAlbumSaver
- (void)video:(NSString *)path didFinishSavingWithError:(NSError *)error contextInfo:(void *)ctx
{
    ARMakeupMediaDoneCallback cb = self.callback;
    if (error == nil) { if (cb) cb(1, ""); }
    else { const char *m = [[error localizedDescription] UTF8String]; if (cb) cb(0, m ? m : "album save failed"); }
    CFRelease((__bridge CFTypeRef)self);
}
@end

static void ARMediaCleanupSession(void)
{
    gReaderOutput = nil;
    gReader = nil;
    gWriterInput = nil;
    gAdaptor = nil;
    gWriter = nil;
}

extern "C"
{
    // ── 사진: EXIF 정립 정규화 ────────────────────────────────────────────────
    int armakeupNormalizeImage(const char *cSrc, const char *cDst)
    {
        @autoreleasepool
        {
            if (cSrc == NULL || cDst == NULL) return 0;
            NSString *src = [NSString stringWithUTF8String:cSrc];
            NSString *dst = [NSString stringWithUTF8String:cDst];
            UIImage *img = [UIImage imageWithContentsOfFile:src];
            if (img == nil) return 0;

            UIImage *upright = img;
            if (img.imageOrientation != UIImageOrientationUp)
            {
                UIGraphicsImageRendererFormat *fmt = [UIGraphicsImageRendererFormat defaultFormat];
                fmt.scale = 1.0; // 픽셀=포인트(방향만 굽고 리샘플 없음)
                UIGraphicsImageRenderer *r =
                    [[UIGraphicsImageRenderer alloc] initWithSize:img.size format:fmt];
                upright = [r imageWithActions:^(UIGraphicsImageRendererContext *ctx) {
                    [img drawInRect:CGRectMake(0, 0, img.size.width, img.size.height)];
                }];
            }
            NSData *jpg = UIImageJPEGRepresentation(upright, 0.95);
            if (jpg == nil) return 0;
            [[NSFileManager defaultManager] removeItemAtPath:dst error:nil];
            return [jpg writeToFile:dst atomically:YES] ? 1 : 0;
        }
    }

    // ── 영상: 메타 조회 ───────────────────────────────────────────────────────
    int armakeupProbeVideo(const char *cSrc, int maxLongSide,
                           int *outW, int *outH, int *frameCount, int *fpsNum, int *fpsDen)
    {
        @autoreleasepool
        {
            if (cSrc == NULL) return 0;
            NSString *src = [NSString stringWithUTF8String:cSrc];
            AVURLAsset *asset = [AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:src] options:nil];
            int ow = 0, oh = 0;
            AVMutableVideoComposition *vc = BuildVideoComposition(asset, &ow, &oh);
            if (vc == nil || ow <= 0 || oh <= 0) return 0;

            int cw = 0, ch = 0; CapSize(ow, oh, maxLongSide, &cw, &ch);
            if (outW) *outW = cw;
            if (outH) *outH = ch;

            AVAssetTrack *vt = [asset tracksWithMediaType:AVMediaTypeVideo].firstObject;
            float fps = vt.nominalFrameRate > 0 ? vt.nominalFrameRate : 30.0f;
            double seconds = CMTimeGetSeconds(asset.duration);
            if (frameCount) *frameCount = (int)(seconds * fps + 0.5);
            if (fpsNum) *fpsNum = (int)(fps + 0.5f);
            if (fpsDen) *fpsDen = 1;
            return 1;
        }
    }

    // ── 영상: 첫 프레임 디코드(프리뷰) ───────────────────────────────────────
    int armakeupDecodeFirstFrame(const char *cSrc, int maxLongSide,
                                 unsigned char *out, int cap, int *outW, int *outH)
    {
        @autoreleasepool
        {
            if (cSrc == NULL || out == NULL) return -1;
            NSString *src = [NSString stringWithUTF8String:cSrc];
            AVURLAsset *asset = [AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:src] options:nil];
            int ow = 0, oh = 0;
            AVMutableVideoComposition *vc = BuildVideoComposition(asset, &ow, &oh);
            if (vc == nil || ow <= 0 || oh <= 0) return -1;
            int cw = 0, ch = 0; CapSize(ow, oh, maxLongSide, &cw, &ch);
            if (cap < cw * ch * 4) return -1;

            NSError *err = nil;
            AVAssetReader *reader = [AVAssetReader assetReaderWithAsset:asset error:&err];
            if (reader == nil) return -1;
            NSDictionary *attrs = @{ (id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA) };
            AVAssetReaderVideoCompositionOutput *outp =
                [AVAssetReaderVideoCompositionOutput assetReaderVideoCompositionOutputWithVideoTracks:
                    [asset tracksWithMediaType:AVMediaTypeVideo] videoSettings:attrs];
            outp.videoComposition = vc;
            if (![reader canAddOutput:outp]) return -1;
            [reader addOutput:outp];
            if (![reader startReading]) return -1;

            int result = -1;
            CMSampleBufferRef sb = [outp copyNextSampleBuffer];
            if (sb != NULL)
            {
                CVPixelBufferRef pb = CMSampleBufferGetImageBuffer(sb);
                if (pb != NULL)
                {
                    CopyBGRAtoRGBA(pb, out, cw, ch, ow, oh);
                    if (outW) *outW = cw;
                    if (outH) *outH = ch;
                    result = cw * ch * 4;
                }
                CFRelease(sb);
            }
            [reader cancelReading];
            return result;
        }
    }

    // ── 영상 편집: 개시 ───────────────────────────────────────────────────────
    int armakeupVideoEditBegin(const char *cSrc, const char *cDst, int maxLongSide,
                               int *outW, int *outH, int *frameCount, int *fpsNum, int *fpsDen)
    {
        @autoreleasepool
        {
            if (gReader != nil || gWriter != nil) return 0; // 이미 세션 진행 중
            if (cSrc == NULL || cDst == NULL) return 0;

            gSrcPath = [NSString stringWithUTF8String:cSrc];
            gDstPath = [NSString stringWithUTF8String:cDst];
            gTempVideoPath = [gDstPath stringByAppendingString:@".video.mov"];

            AVURLAsset *asset = [AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:gSrcPath] options:nil];
            int ow = 0, oh = 0;
            AVMutableVideoComposition *vc = BuildVideoComposition(asset, &ow, &oh);
            if (vc == nil || ow <= 0 || oh <= 0) { ARMediaCleanupSession(); return 0; }
            gOrientedW = ow; gOrientedH = oh;
            CapSize(ow, oh, maxLongSide, &gOutW, &gOutH);

            AVAssetTrack *vt = [asset tracksWithMediaType:AVMediaTypeVideo].firstObject;
            float fps = vt.nominalFrameRate > 0 ? vt.nominalFrameRate : 30.0f;
            double seconds = CMTimeGetSeconds(asset.duration);
            if (outW) *outW = gOutW;
            if (outH) *outH = gOutH;
            if (frameCount) *frameCount = (int)(seconds * fps + 0.5);
            if (fpsNum) *fpsNum = (int)(fps + 0.5f);
            if (fpsDen) *fpsDen = 1;

            // 리더: 방향 정규화 컴포지션에서 BGRA 프레임.
            NSError *err = nil;
            gReader = [AVAssetReader assetReaderWithAsset:asset error:&err];
            if (gReader == nil) { ARMediaCleanupSession(); return 0; }
            NSDictionary *rattrs = @{ (id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA) };
            gReaderOutput = [AVAssetReaderVideoCompositionOutput
                assetReaderVideoCompositionOutputWithVideoTracks:[asset tracksWithMediaType:AVMediaTypeVideo]
                                                    videoSettings:rattrs];
            gReaderOutput.videoComposition = vc;
            if (![gReader canAddOutput:gReaderOutput]) { ARMediaCleanupSession(); return 0; }
            [gReader addOutput:gReaderOutput];
            if (![gReader startReading]) { ARMediaCleanupSession(); return 0; }

            // 라이터: 비디오 전용 중간본(오디오는 End에서 머지).
            [[NSFileManager defaultManager] removeItemAtPath:gTempVideoPath error:nil];
            gWriter = [[AVAssetWriter alloc] initWithURL:[NSURL fileURLWithPath:gTempVideoPath]
                                                fileType:AVFileTypeQuickTimeMovie error:&err];
            if (gWriter == nil) { ARMediaCleanupSession(); return 0; }
            NSDictionary *compression = @{
                AVVideoAverageBitRateKey: @((long)gOutW * gOutH * 8),
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            };
            NSDictionary *settings = @{
                AVVideoCodecKey: AVVideoCodecTypeH264,
                AVVideoWidthKey: @(gOutW),
                AVVideoHeightKey: @(gOutH),
                AVVideoCompressionPropertiesKey: compression,
            };
            gWriterInput = [AVAssetWriterInput assetWriterInputWithMediaType:AVMediaTypeVideo
                                                             outputSettings:settings];
            gWriterInput.expectsMediaDataInRealTime = NO; // 오프라인 — 준비될 때까지 기다려 프레임 보존
            NSDictionary *sourceAttrs = @{
                (id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA),
                (id)kCVPixelBufferWidthKey: @(gOutW),
                (id)kCVPixelBufferHeightKey: @(gOutH),
            };
            gAdaptor = [AVAssetWriterInputPixelBufferAdaptor
                assetWriterInputPixelBufferAdaptorWithAssetWriterInput:gWriterInput
                                            sourcePixelBufferAttributes:sourceAttrs];
            if (![gWriter canAddInput:gWriterInput]) { ARMediaCleanupSession(); return 0; }
            [gWriter addInput:gWriterInput];
            if (![gWriter startWriting]) { ARMediaCleanupSession(); return 0; }
            [gWriter startSessionAtSourceTime:kCMTimeZero];
            return 1;
        }
    }

    int armakeupVideoEditReadFrame(unsigned char *out, int cap, long long *ptsValue, int *ptsScale)
    {
        @autoreleasepool
        {
            if (gReader == nil || gReaderOutput == nil || out == NULL) return -1;
            if (cap < gOutW * gOutH * 4) return -1;

            CMSampleBufferRef sb = [gReaderOutput copyNextSampleBuffer];
            if (sb == NULL)
            {
                return gReader.status == AVAssetReaderStatusCompleted ? 0 : -1; // EOF vs 에러
            }
            int result = -1;
            CVPixelBufferRef pb = CMSampleBufferGetImageBuffer(sb);
            if (pb != NULL)
            {
                CopyBGRAtoRGBA(pb, out, gOutW, gOutH, gOrientedW, gOrientedH);
                CMTime pts = CMSampleBufferGetPresentationTimeStamp(sb);
                if (ptsValue) *ptsValue = pts.value;
                if (ptsScale) *ptsScale = pts.timescale;
                result = gOutW * gOutH * 4;
            }
            CFRelease(sb);
            return result;
        }
    }

    int armakeupVideoEditWriteFrame(const unsigned char *rgba, int len, long long ptsValue, int ptsScale)
    {
        @autoreleasepool
        {
            if (gWriter == nil || gWriterInput == nil || gAdaptor == nil) return 0;
            if (rgba == NULL || len < gOutW * gOutH * 4) return 0;

            // 오프라인: 인코더가 준비될 때까지 대기(프레임 드롭 없이 전부 기록).
            int guard = 0;
            while (!gWriterInput.isReadyForMoreMediaData && guard++ < 5000)
            {
                if (gWriter.status == AVAssetWriterStatusFailed) return 0;
                usleep(1000);
            }
            if (!gWriterInput.isReadyForMoreMediaData) return 0;

            CVPixelBufferRef pb = NULL;
            CVReturn cvr = kCVReturnError;
            if (gAdaptor.pixelBufferPool != NULL)
                cvr = CVPixelBufferPoolCreatePixelBuffer(NULL, gAdaptor.pixelBufferPool, &pb);
            if (cvr != kCVReturnSuccess || pb == NULL)
            {
                NSDictionary *attrs = @{ (id)kCVPixelBufferCGImageCompatibilityKey: @YES,
                                         (id)kCVPixelBufferCGBitmapContextCompatibilityKey: @YES };
                cvr = CVPixelBufferCreate(kCFAllocatorDefault, gOutW, gOutH,
                                          kCVPixelFormatType_32BGRA,
                                          (__bridge CFDictionaryRef)attrs, &pb);
            }
            if (cvr != kCVReturnSuccess || pb == NULL) return 0;

            CVPixelBufferLockBaseAddress(pb, 0);
            uint8_t *base = (uint8_t *)CVPixelBufferGetBaseAddress(pb);
            size_t bpr = CVPixelBufferGetBytesPerRow(pb);
            // 입력 RGBA(Unity ReadPixels = 아래→위) → BGRA(위→아래): 수직 뒤집기 + R/B 스왑.
            for (int y = 0; y < gOutH; y++)
            {
                const uint8_t *src = rgba + (size_t)(gOutH - 1 - y) * gOutW * 4;
                uint8_t *dst = base + (size_t)y * bpr;
                for (int x = 0; x < gOutW; x++)
                {
                    dst[x * 4 + 0] = src[x * 4 + 2]; // B
                    dst[x * 4 + 1] = src[x * 4 + 1]; // G
                    dst[x * 4 + 2] = src[x * 4 + 0]; // R
                    dst[x * 4 + 3] = src[x * 4 + 3]; // A
                }
            }
            CVPixelBufferUnlockBaseAddress(pb, 0);

            CMTime pts = (ptsScale > 0) ? CMTimeMake(ptsValue, ptsScale) : kCMTimeInvalid;
            BOOL ok = [gAdaptor appendPixelBuffer:pb withPresentationTime:pts];
            CVPixelBufferRelease(pb);
            return ok ? 1 : 0;
        }
    }

    void armakeupVideoEditAbort(void)
    {
        @autoreleasepool
        {
            if (gReader != nil) [gReader cancelReading];
            if (gWriter != nil && gWriter.status == AVAssetWriterStatusWriting) [gWriter cancelWriting];
            [[NSFileManager defaultManager] removeItemAtPath:gTempVideoPath error:nil];
            ARMediaCleanupSession();
        }
    }

    // 비디오 트랙 완료 → 소스 오디오 패스스루 머지 → dst → 앨범 저장.
    void armakeupVideoEditEnd(ARMakeupMediaDoneCallback callback)
    {
        if (gWriter == nil || gWriterInput == nil)
        {
            ARMediaCleanupSession();
            ARMediaFinish(callback, 0, @"no active session");
            return;
        }

        AVAssetWriter *writer = gWriter;
        NSString *tempVideo = gTempVideoPath;
        NSString *srcPath = gSrcPath;
        NSString *dstPath = gDstPath;
        [gReader cancelReading];
        [gWriterInput markAsFinished];
        [writer finishWritingWithCompletionHandler:^{
            ARMediaCleanupSession();
            if (writer.status != AVAssetWriterStatusCompleted)
            {
                NSString *m = writer.error ? [writer.error localizedDescription] : @"writer did not complete";
                [[NSFileManager defaultManager] removeItemAtPath:tempVideo error:nil];
                ARMediaFinish(callback, 0, m);
                return;
            }

            // 비디오(편집본) + 오디오(소스 패스스루) 합성 → dst.
            AVMutableComposition *comp = [AVMutableComposition composition];
            AVURLAsset *videoAsset = [AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:tempVideo] options:nil];
            AVURLAsset *srcAsset = [AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:srcPath] options:nil];
            AVAssetTrack *vt = [videoAsset tracksWithMediaType:AVMediaTypeVideo].firstObject;
            AVAssetTrack *at = [srcAsset tracksWithMediaType:AVMediaTypeAudio].firstObject;
            NSError *cErr = nil;
            BOOL composed = NO;
            if (vt != nil)
            {
                AVMutableCompositionTrack *cvt =
                    [comp addMutableTrackWithMediaType:AVMediaTypeVideo
                                      preferredTrackID:kCMPersistentTrackID_Invalid];
                composed = [cvt insertTimeRange:CMTimeRangeMake(kCMTimeZero, videoAsset.duration)
                                        ofTrack:vt atTime:kCMTimeZero error:&cErr];
                if (at != nil)
                {
                    AVMutableCompositionTrack *cat =
                        [comp addMutableTrackWithMediaType:AVMediaTypeAudio
                                          preferredTrackID:kCMPersistentTrackID_Invalid];
                    // 오디오는 소스 길이만큼(비디오보다 길면 비디오 길이로 클램프).
                    CMTime audioDur = srcAsset.duration;
                    if (CMTimeCompare(audioDur, videoAsset.duration) > 0) audioDur = videoAsset.duration;
                    [cat insertTimeRange:CMTimeRangeMake(kCMTimeZero, audioDur)
                                 ofTrack:at atTime:kCMTimeZero error:nil]; // 오디오 실패는 무음으로 허용
                }
            }

            void (^finishNoAudio)(void) = ^{
                // 합성 실패 시 최소한 비디오(무음)라도 dst로 옮겨 저장.
                [[NSFileManager defaultManager] removeItemAtPath:dstPath error:nil];
                NSError *mvErr = nil;
                if ([[NSFileManager defaultManager] moveItemAtPath:tempVideo toPath:dstPath error:&mvErr])
                    ARMakeupSaveVideoToAlbum(dstPath, callback);
                else
                    ARMediaFinish(callback, 0, mvErr ? [mvErr localizedDescription] : @"compose failed");
            };

            if (!composed)
            {
                dispatch_async(dispatch_get_main_queue(), finishNoAudio);
                return;
            }

            [[NSFileManager defaultManager] removeItemAtPath:dstPath error:nil];
            AVAssetExportSession *exportSession =
                [[AVAssetExportSession alloc] initWithAsset:comp presetName:AVAssetExportPresetPassthrough];
            exportSession.outputURL = [NSURL fileURLWithPath:dstPath];
            exportSession.outputFileType = AVFileTypeQuickTimeMovie;
            [exportSession exportAsynchronouslyWithCompletionHandler:^{
                if (exportSession.status == AVAssetExportSessionStatusCompleted)
                {
                    [[NSFileManager defaultManager] removeItemAtPath:tempVideo error:nil];
                    ARMakeupSaveVideoToAlbum(dstPath, callback);
                }
                else
                {
                    // 오디오 머지 실패 → tempVideo(무음)를 dst로 살려 저장(finishNoAudio가 이동).
                    dispatch_async(dispatch_get_main_queue(), finishNoAudio);
                }
            }];
        }];
    }
}

// 편집본 .mov를 앨범에 저장(사진 add-only 권한과 동일 프롬프트).
static void ARMakeupSaveVideoToAlbum(NSString *path, ARMakeupMediaDoneCallback callback)
{
    dispatch_async(dispatch_get_main_queue(), ^{
        if (UIVideoAtPathIsCompatibleWithSavedPhotosAlbum(path))
        {
            ARMakeupMediaAlbumSaver *saver = [ARMakeupMediaAlbumSaver new];
            saver.callback = callback;
            CFRetain((__bridge CFTypeRef)saver);
            UISaveVideoAtPathToSavedPhotosAlbum(path, saver,
                @selector(video:didFinishSavingWithError:contextInfo:), NULL);
        }
        else
        {
            // 앨범이 거부해도 디스크엔 유효 — 경로는 성공으로 통지.
            if (callback) callback(1, "");
        }
    });
}
