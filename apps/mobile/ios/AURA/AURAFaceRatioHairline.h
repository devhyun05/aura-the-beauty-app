#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Normalized (0..1, EXIF-upright space) inputs required to build the forehead ROI.
/// All coordinates come from AURAFaceRatioAnalyzer's IMAGE-mode MediaPipe detection so this
/// module stays independent of MediaPipe types.
typedef struct {
  double leftFaceX;    // MediaPipe landmark index 234 (viewer-left face contour)
  double leftFaceY;
  double rightFaceX;   // MediaPipe landmark index 454 (viewer-right face contour)
  double rightFaceY;
  double foreheadTopX; // MediaPipe landmark index 10 (top of forehead mesh)
  double foreheadTopY;
  double glabellaX;    // analyzer-computed glabella (G)
  double glabellaY;
  double yawDeg;       // pose, degrees (poseQuality confidence term)
  double pitchDeg;
  double rollDeg;
} AURAFaceRatioHairlineLandmarks;

/// Detects the central hairline (H) from Apple semantic segmentation mattes (hair/skin)
/// embedded as auxiliary images in the captured photo file.
///
/// `options` keys:
///   - `tuning` (NSDictionary<NSString *, NSNumber *>, optional): per-constant overrides;
///     keys must match the constant names in AURAFaceRatioHairline.m (see
///     `FaceRatioHairlineTuning` in apps/mobile/src/features/face-ratio/constants.ts).
///   - `debugArtifacts` (NSNumber BOOL, optional): when YES, writes
///     apple-hair-matte.png / apple-skin-matte.png / hairline-debug.png into a temp
///     directory and returns their file:// URIs under `debugArtifacts`.
///   - `matteArtifacts` (NSNumber BOOL, optional): exports the same production hair/skin
///     matte PNGs under `matteArtifacts` without changing the existing debug contract.
///
/// Always returns a non-nil dictionary:
///   - `matte`: @{hairAvailable(BOOL), skinAvailable(BOOL), matteWidth(N), matteHeight(N)}
///     (present whenever the file could be opened)
///   - `hairline` (only on successful detection):
///     @{x, y (normalized, EXIF-upright space), confidence(0..1), visible(BOOL),
///       candidateCount(N), boundaryStdPx(photo px), skinFraction(0..1),
///       method=@"apple_hair_skin_boundary"}
///   - `debugArtifacts` (only when requested and produced):
///     @{hairMatteUri, skinMatteUri, hairlineDebugUri}
///   - `failureReason` (only when `hairline` is absent): one of
///     @"not_implemented" | @"image_unreadable" | @"no_aux_data" | @"roi_invalid" |
///     @"no_candidates"
FOUNDATION_EXPORT NSDictionary *AURAFaceRatioDetectHairline(
    NSURL *imageFileURL,
    AURAFaceRatioHairlineLandmarks landmarks,
    NSDictionary *_Nullable options);

NS_ASSUME_NONNULL_END
