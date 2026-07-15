#import <UIKit/UIKit.h>

// Saves an image file (JPG captured by PhotoCapture.cs) into the user's photo album.
// Uses UIImageWriteToSavedPhotosAlbum (UIKit only — no extra framework to link).
// On iOS 14+ this triggers the "add-only" permission prompt automatically, which
// requires NSPhotoLibraryAddUsageDescription in the app's Info.plist.

typedef void (*ARMakeupAlbumSaveCallback)(int success, const char* message);

@interface ARMakeupAlbumSaver : NSObject
@property (nonatomic, assign) ARMakeupAlbumSaveCallback callback;
@end

@implementation ARMakeupAlbumSaver

- (void)image:(UIImage *)image didFinishSavingWithError:(NSError *)error contextInfo:(void *)contextInfo
{
    ARMakeupAlbumSaveCallback cb = self.callback;
    if (cb != NULL)
    {
        if (error == nil)
        {
            cb(1, "");
        }
        else
        {
            const char* msg = [[error localizedDescription] UTF8String];
            cb(0, msg != NULL ? msg : "unknown error");
        }
    }
    // Balance the CFRetain taken in armakeupSaveToPhotoAlbum.
    CFRelease((__bridge CFTypeRef)self);
}

@end

extern "C"
{
    void armakeupSaveToPhotoAlbum(const char* cPath, ARMakeupAlbumSaveCallback callback)
    {
        NSString *path = cPath != NULL ? [NSString stringWithUTF8String:cPath] : nil;
        dispatch_async(dispatch_get_main_queue(), ^{
            NSString *failReason = nil;
            UIImage *image = nil;

            if (path.length == 0)
            {
                failReason = @"empty path";
            }
            else if (![[NSFileManager defaultManager] fileExistsAtPath:path])
            {
                failReason = [NSString stringWithFormat:@"file not found: %@", path];
            }
            else
            {
                image = [UIImage imageWithContentsOfFile:path];
                if (image == nil)
                {
                    failReason = @"could not decode image";
                }
            }

            if (failReason != nil)
            {
                if (callback != NULL) callback(0, [failReason UTF8String]);
                return;
            }

            ARMakeupAlbumSaver *saver = [ARMakeupAlbumSaver new];
            saver.callback = callback;
            // Keep the saver alive until UIKit invokes the completion selector.
            CFRetain((__bridge CFTypeRef)saver);
            UIImageWriteToSavedPhotosAlbum(image, saver,
                @selector(image:didFinishSavingWithError:contextInfo:), NULL);
        });
    }
}
