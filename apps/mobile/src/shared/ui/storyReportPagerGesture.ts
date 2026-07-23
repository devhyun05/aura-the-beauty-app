export type StoryReportGestureAxis =
  | 'horizontal'
  | 'undecided'
  | 'vertical';

export const STORY_REPORT_VERTICAL_ACTIVATION_PX = 8;
export const STORY_REPORT_HORIZONTAL_ACTIVATION_PX = 10;
export const STORY_REPORT_VERTICAL_DOMINANCE_RATIO = 1.15;
export const STORY_REPORT_HORIZONTAL_DOMINANCE_RATIO = 1.25;
export const STORY_REPORT_SWIPE_DISTANCE_RATIO = 0.18;
export const STORY_REPORT_SWIPE_MAX_DISTANCE_PX = 84;
export const STORY_REPORT_SWIPE_VELOCITY = 0.55;

/**
 * Classifies only after one axis is clearly dominant. The caller owns the
 * sticky state: once vertical or horizontal wins, it must stay locked until
 * the finger is released.
 */
export function classifyStoryReportGesture(
  dx: number,
  dy: number,
): StoryReportGestureAxis {
  const horizontal = Math.abs(dx);
  const vertical = Math.abs(dy);

  if (
    vertical >= STORY_REPORT_VERTICAL_ACTIVATION_PX
    && vertical > horizontal * STORY_REPORT_VERTICAL_DOMINANCE_RATIO
  ) {
    return 'vertical';
  }

  if (
    horizontal >= STORY_REPORT_HORIZONTAL_ACTIVATION_PX
    && horizontal > vertical * STORY_REPORT_HORIZONTAL_DOMINANCE_RATIO
  ) {
    return 'horizontal';
  }

  return 'undecided';
}

export function resolveStoryReportSwipeTarget({
  currentIndex,
  dx,
  pageCount,
  pageWidth,
  velocityX,
}: {
  currentIndex: number;
  dx: number;
  pageCount: number;
  pageWidth: number;
  velocityX: number;
}): number {
  if (pageCount <= 0 || pageWidth <= 0) {
    return Math.max(0, currentIndex);
  }

  const clampedCurrent = Math.max(
    0,
    Math.min(currentIndex, pageCount - 1),
  );
  const distanceThreshold = Math.min(
    pageWidth * STORY_REPORT_SWIPE_DISTANCE_RATIO,
    STORY_REPORT_SWIPE_MAX_DISTANCE_PX,
  );
  const distanceQualified = Math.abs(dx) >= distanceThreshold;
  const velocityQualified =
    Math.abs(velocityX) >= STORY_REPORT_SWIPE_VELOCITY;

  if (!distanceQualified && !velocityQualified) {
    return clampedCurrent;
  }

  // A completed distance gesture keeps its displacement direction even when
  // the user slows down just before release. Velocity decides short flicks.
  const directionSource = distanceQualified ? dx : velocityX;
  const delta = directionSource < 0 ? 1 : -1;
  return Math.max(0, Math.min(clampedCurrent + delta, pageCount - 1));
}
