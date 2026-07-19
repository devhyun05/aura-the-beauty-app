import type {PartKey} from '../../screens/recommendationResultTypes';
import type {MakeupRecommendationCropBox} from '../../types';

export type RegionFrameHeightInput = {
  area: PartKey;
  boxes: readonly MakeupRecommendationCropBox[];
  frameWidth: number;
  sourceHeight: number;
  sourceWidth: number;
};

export type RegionImageLayoutInput = {
  area: PartKey;
  box: MakeupRecommendationCropBox;
  frameHeight: number;
  frameWidth: number;
  sourceHeight: number;
  sourceWidth: number;
};

export type RegionImageLayout = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type FrameHeightRule = {
  fallback: number;
  max: number;
  min: number;
};

const FRAME_HEIGHT_RULES: Readonly<Record<PartKey, FrameHeightRule>> = {
  base: {fallback: 240, min: 220, max: 270},
  brow: {fallback: 70, min: 64, max: 78},
  eye: {fallback: 82, min: 72, max: 96},
  cheek: {fallback: 132, min: 118, max: 146},
  lip: {fallback: 124, min: 108, max: 140},
};

const CROP_VERTICAL_PLACEMENT: Readonly<Record<PartKey, number>> = {
  base: 0.5,
  brow: 0.88,
  eye: 0.5,
  cheek: 0.5,
  lip: 0.5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCropPixelSize(
  box: MakeupRecommendationCropBox,
  sourceHeight: number,
  sourceWidth: number,
) {
  return {
    height: Math.max(1, (box.bottom - box.top) * sourceHeight),
    width: Math.max(1, (box.right - box.left) * sourceWidth),
  };
}

/**
 * Tracks the detected region's real pixel aspect ratio. The safety bounds keep
 * a portrait face or a very thin brow strip usable without cropping either axis.
 */
export function computeRegionFrameHeight({
  area,
  boxes,
  frameWidth,
  sourceHeight,
  sourceWidth,
}: RegionFrameHeightInput): number {
  const rule = FRAME_HEIGHT_RULES[area];
  if (boxes.length === 0 || frameWidth <= 1 || sourceHeight <= 0 || sourceWidth <= 0) {
    return rule.fallback;
  }

  const aspectHeight = Math.max(
    ...boxes.map(box => {
      const crop = getCropPixelSize(box, sourceHeight, sourceWidth);
      return frameWidth * crop.height / crop.width;
    }),
  );

  return Math.round(clamp(aspectHeight, rule.min, rule.max));
}

/**
 * Fits the complete MediaPipe region inside the frame. Any remaining space is
 * filled by nearby pixels from the same source image instead of cutting the
 * detected feature. Brows sit low in their frame so extra context stays above
 * the eyebrow rather than exposing the eye below it.
 */
export function computeRegionImageLayout({
  area,
  box,
  frameHeight,
  frameWidth,
  sourceHeight,
  sourceWidth,
}: RegionImageLayoutInput): RegionImageLayout {
  const crop = getCropPixelSize(box, sourceHeight, sourceWidth);
  const scale = Math.min(frameWidth / crop.width, frameHeight / crop.height);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const renderedCropWidth = crop.width * scale;
  const renderedCropHeight = crop.height * scale;
  const cropLeft = Math.max(0, frameWidth - renderedCropWidth) / 2;
  const cropTop = Math.max(0, frameHeight - renderedCropHeight)
    * CROP_VERTICAL_PLACEMENT[area];

  return {
    height,
    left: cropLeft - box.left * sourceWidth * scale,
    top: cropTop - box.top * sourceHeight * scale,
    width,
  };
}