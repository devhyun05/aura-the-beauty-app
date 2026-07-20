import type {
  MakeupRecommendationImageAlignmentFrame,
  MakeupRecommendationImageAlignmentPoint,
} from '../types';

const MIN_ALIGNMENT_SCALE = 0.45;
const MAX_ALIGNMENT_SCALE = 3.2;

export type FinalMakeupAlignmentViewport = {width: number; height: number};

export type FinalMakeupImageTransform = {
  anchorX: number;
  anchorY: number;
  innerTranslateX: number;
  innerTranslateY: number;
  originX: number;
  originY: number;
  outerTranslateX: number;
  outerTranslateY: number;
  renderedHeight: number;
  renderedWidth: number;
  rotationDeg: number;
  scale: number;
  targetX: number;
  targetY: number;
};

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNormalizedPoint(
  point: MakeupRecommendationImageAlignmentPoint | undefined,
): point is MakeupRecommendationImageAlignmentPoint {
  return Boolean(
    point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && point.x >= 0
    && point.x <= 1
    && point.y >= 0
    && point.y <= 1,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

type MeasuredAlignmentFrame = {
  anchorX: number;
  anchorY: number;
  originX: number;
  originY: number;
  renderedHeight: number;
  renderedWidth: number;
  rollDeg: number;
  span: number;
};

function hasUsableEyeCenters(frame: MakeupRecommendationImageAlignmentFrame): boolean {
  const imageLeftEye = frame.eyeCenters?.imageLeft;
  const imageRightEye = frame.eyeCenters?.imageRight;
  return Boolean(
    isNormalizedPoint(imageLeftEye)
    && isNormalizedPoint(imageRightEye)
    && imageRightEye.x > imageLeftEye.x,
  );
}

function measureAlignmentFrame(
  frame: MakeupRecommendationImageAlignmentFrame,
  viewport: FinalMakeupAlignmentViewport,
  useEyeCenters: boolean,
): MeasuredAlignmentFrame | null {
  const imageWidth = frame.imageSize.width;
  const imageHeight = frame.imageSize.height;
  if (
    !isPositiveFinite(imageWidth)
    || !isPositiveFinite(imageHeight)
    || !isPositiveFinite(viewport.width)
    || !isPositiveFinite(viewport.height)
  ) return null;

  // Preserve the complete camera frame. The layer fills any edge space with
  // the same photo, so keeping the shot intact never creates gray gutters.
  const containScale = Math.min(viewport.width / imageWidth, viewport.height / imageHeight);
  const renderedWidth = imageWidth * containScale;
  const renderedHeight = imageHeight * containScale;
  const originX = (viewport.width - renderedWidth) / 2;
  const originY = (viewport.height - renderedHeight) / 2;

  if (useEyeCenters && hasUsableEyeCenters(frame)) {
    const imageLeftEye = frame.eyeCenters!.imageLeft!;
    const imageRightEye = frame.eyeCenters!.imageRight!;
    const leftX = imageLeftEye.x * imageWidth;
    const leftY = imageLeftEye.y * imageHeight;
    const rightX = imageRightEye.x * imageWidth;
    const rightY = imageRightEye.y * imageHeight;
    const deltaX = rightX - leftX;
    const deltaY = rightY - leftY;
    const span = Math.hypot(deltaX, deltaY) * containScale;
    if (!isPositiveFinite(span)) return null;
    const measuredRollDeg = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    return {
      anchorX: originX + ((leftX + rightX) / 2) * containScale,
      anchorY: originY + ((leftY + rightY) / 2) * containScale,
      originX,
      originY,
      renderedHeight,
      renderedWidth,
      rollDeg: typeof frame.rollDeg === 'number' && Number.isFinite(frame.rollDeg)
        ? frame.rollDeg
        : measuredRollDeg,
      span,
    };
  }

  const {faceBox} = frame;
  if (
    !Number.isFinite(faceBox.left)
    || !Number.isFinite(faceBox.top)
    || !Number.isFinite(faceBox.right)
    || !Number.isFinite(faceBox.bottom)
    || faceBox.right <= faceBox.left
    || faceBox.bottom <= faceBox.top
  ) return null;
  const faceWidth = (faceBox.right - faceBox.left) * imageWidth;
  const span = faceWidth * containScale;
  if (!isPositiveFinite(span)) return null;
  return {
    anchorX: originX + ((faceBox.left + faceBox.right) / 2) * imageWidth * containScale,
    anchorY: originY + ((faceBox.top + faceBox.bottom) / 2) * imageHeight * containScale,
    originX,
    originY,
    renderedHeight,
    renderedWidth,
    rollDeg: typeof frame.rollDeg === 'number' && Number.isFinite(frame.rollDeg)
      ? frame.rollDeg
      : 0,
    span,
  };
}

export function computeFinalMakeupImageTransform(
  frame: MakeupRecommendationImageAlignmentFrame | undefined,
  viewport: FinalMakeupAlignmentViewport,
  referenceFrame: MakeupRecommendationImageAlignmentFrame | undefined = frame,
): FinalMakeupImageTransform | null {
  if (
    !frame
    || !referenceFrame
    || !isPositiveFinite(frame.imageSize.width)
    || !isPositiveFinite(frame.imageSize.height)
    || !isPositiveFinite(viewport.width)
    || !isPositiveFinite(viewport.height)
  ) return null;

  const useEyeCenters = hasUsableEyeCenters(frame) && hasUsableEyeCenters(referenceFrame);
  const measuredFrame = measureAlignmentFrame(frame, viewport, useEyeCenters);
  const measuredReference = measureAlignmentFrame(referenceFrame, viewport, useEyeCenters);
  if (!measuredFrame || !measuredReference) return null;

  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const requestedScale = measuredReference.span / measuredFrame.span;

  return {
    anchorX: measuredFrame.anchorX,
    anchorY: measuredFrame.anchorY,
    innerTranslateX: centerX - measuredFrame.anchorX,
    innerTranslateY: centerY - measuredFrame.anchorY,
    originX: measuredFrame.originX,
    originY: measuredFrame.originY,
    outerTranslateX: measuredReference.anchorX - centerX,
    outerTranslateY: measuredReference.anchorY - centerY,
    renderedHeight: measuredFrame.renderedHeight,
    renderedWidth: measuredFrame.renderedWidth,
    rotationDeg: measuredReference.rollDeg - measuredFrame.rollDeg,
    scale: clamp(requestedScale, MIN_ALIGNMENT_SCALE, MAX_ALIGNMENT_SCALE),
    targetX: measuredReference.anchorX,
    targetY: measuredReference.anchorY,
  };
}

export function projectFinalMakeupAlignmentPoint(
  transform: FinalMakeupImageTransform,
  point: MakeupRecommendationImageAlignmentPoint,
): MakeupRecommendationImageAlignmentPoint {
  const sourceX = transform.originX + point.x * transform.renderedWidth;
  const sourceY = transform.originY + point.y * transform.renderedHeight;
  const deltaX = sourceX - transform.anchorX;
  const deltaY = sourceY - transform.anchorY;
  const rotationRad = transform.rotationDeg * (Math.PI / 180);
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return {
    x: transform.targetX + transform.scale * (deltaX * cos - deltaY * sin),
    y: transform.targetY + transform.scale * (deltaX * sin + deltaY * cos),
  };
}