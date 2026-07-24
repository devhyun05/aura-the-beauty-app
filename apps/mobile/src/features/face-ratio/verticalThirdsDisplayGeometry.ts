export type SourceImageDimensions = {
  height: number;
  width: number;
};

/**
 * Vertical-thirds keypoints are expressed in the uncropped source-image
 * coordinate space. The display frame must therefore use that exact aspect
 * ratio; accepting a design-time frame ratio would move the photo underneath
 * otherwise-correct H/G/Sn/Me overlays.
 */
export function getVerticalThirdsPhotoAspectRatio(
  sourceImage: SourceImageDimensions,
): number {
  const {height, width} = sourceImage;
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(width) ||
    height <= 0 ||
    width <= 0
  ) {
    throw new Error('Vertical-thirds source image dimensions must be positive.');
  }

  return width / height;
}
