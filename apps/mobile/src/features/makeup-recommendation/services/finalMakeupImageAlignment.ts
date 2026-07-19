import type {
  MakeupRecommendationImageAlignmentFrame,
  MakeupRecommendationImageAlignmentPoint,
} from '../types';

const TARGET_EYE_CENTER_Y_RATIO = 0.4;
const TARGET_EYE_DISTANCE_WIDTH_RATIO = 0.3;
const TARGET_EYE_DISTANCE_HEIGHT_RATIO = 0.26;
const TARGET_FACE_CENTER_Y_RATIO = 0.5;
const TARGET_FACE_WIDTH_RATIO = 0.72;
const TARGET_FACE_HEIGHT_RATIO = 0.62;
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

export function computeFinalMakeupImageTransform(
  frame: MakeupRecommendationImageAlignmentFrame | undefined,
  viewport: FinalMakeupAlignmentViewport,
): FinalMakeupImageTransform | null {
  if (
    !frame
    || !isPositiveFinite(frame.imageSize.width)
    || !isPositiveFinite(frame.imageSize.height)
    || !isPositiveFinite(viewport.width)
    || !isPositiveFinite(viewport.height)
  ) return null;

  const imageWidth = frame.imageSize.width;
  const imageHeight = frame.imageSize.height;
  const coverScale = Math.max(viewport.width / imageWidth, viewport.height / imageHeight);
  const renderedWidth = imageWidth * coverScale;
  const renderedHeight = imageHeight * coverScale;
  const originX = (viewport.width - renderedWidth) / 2;
  const originY = (viewport.height - renderedHeight) / 2;
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const imageLeftEye = frame.eyeCenters?.imageLeft;
  const imageRightEye = frame.eyeCenters?.imageRight;

  let anchorImageX: number;
  let anchorImageY: number;
  let sourceSpan: number;
  let targetSpan: number;
  let targetX = centerX;
  let targetY: number;
  let measuredRollDeg = 0;

  if (
    isNormalizedPoint(imageLeftEye)
    && isNormalizedPoint(imageRightEye)
    && imageRightEye.x > imageLeftEye.x
  ) {
    const leftX = imageLeftEye.x * imageWidth;
    const leftY = imageLeftEye.y * imageHeight;
    const rightX = imageRightEye.x * imageWidth;
    const rightY = imageRightEye.y * imageHeight;
    const deltaX = rightX - leftX;
    const deltaY = rightY - leftY;
    const eyeDistance = Math.hypot(deltaX, deltaY);
    if (!isPositiveFinite(eyeDistance)) return null;
    anchorImageX = (leftX + rightX) / 2;
    anchorImageY = (leftY + rightY) / 2;
    sourceSpan = eyeDistance * coverScale;
    targetSpan = Math.min(
      viewport.width * TARGET_EYE_DISTANCE_WIDTH_RATIO,
      viewport.height * TARGET_EYE_DISTANCE_HEIGHT_RATIO,
    );
    targetY = viewport.height * TARGET_EYE_CENTER_Y_RATIO;
    measuredRollDeg = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  } else {
    const {faceBox} = frame;
    if (
      !Number.isFinite(faceBox.left)
      || !Number.isFinite(faceBox.top)
      || !Number.isFinite(faceBox.right)
      || !Number.isFinite(faceBox.bottom)
      || faceBox.right <= faceBox.left
      || faceBox.bottom <= faceBox.top
    ) return null;
    anchorImageX = ((faceBox.left + faceBox.right) / 2) * imageWidth;
    anchorImageY = ((faceBox.top + faceBox.bottom) / 2) * imageHeight;
    sourceSpan = (faceBox.right - faceBox.left) * imageWidth * coverScale;
    targetSpan = Math.min(
      viewport.width * TARGET_FACE_WIDTH_RATIO,
      viewport.height * TARGET_FACE_HEIGHT_RATIO,
    );
    targetY = viewport.height * TARGET_FACE_CENTER_Y_RATIO;
  }

  if (!isPositiveFinite(sourceSpan) || !isPositiveFinite(targetSpan)) return null;
  const anchorX = originX + anchorImageX * coverScale;
  const anchorY = originY + anchorImageY * coverScale;
  const requestedScale = targetSpan / sourceSpan;
  const rollDeg = typeof frame.rollDeg === 'number' && Number.isFinite(frame.rollDeg)
    ? frame.rollDeg
    : measuredRollDeg;

  return {
    anchorX,
    anchorY,
    innerTranslateX: centerX - anchorX,
    innerTranslateY: centerY - anchorY,
    originX,
    originY,
    outerTranslateX: targetX - centerX,
    outerTranslateY: targetY - centerY,
    renderedHeight,
    renderedWidth,
    rotationDeg: -rollDeg,
    scale: clamp(requestedScale, MIN_ALIGNMENT_SCALE, MAX_ALIGNMENT_SCALE),
    targetX,
    targetY,
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