export type StoryReportGestureAxis =
  | 'horizontal'
  | 'undecided'
  | 'vertical';

export const STORY_REPORT_VERTICAL_ACTIVATION_PX = 8;
// 각 카드 내부의 세로 ScrollView와 같은 터치를 놓고 경쟁한다 — 애매한 초반 구간에서
// 내부 ScrollView가 먼저 onScrollBeginDrag를 발생시키면 그 터치 동안 페이저가
// 영영 캡처하지 못한다(StoryReportPager의 setPagingEnabled(false) 게이트).
// 네이티브 스크롤뷰의 자체 인식 임계값을 이기려면 더 적은 픽셀에서 확정해야 한다.
export const STORY_REPORT_HORIZONTAL_ACTIVATION_PX = 4;
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
