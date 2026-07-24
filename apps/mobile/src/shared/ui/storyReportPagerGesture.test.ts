import {
  classifyStoryReportGesture,
  resolveStoryReportSwipeTarget,
} from './storyReportPagerGesture';

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  classifyStoryReportGesture(3, 10),
  'vertical',
  'a mostly vertical drag belongs to the content scroll',
);
expectEqual(
  classifyStoryReportGesture(16, 4),
  'horizontal',
  'a clearly horizontal drag belongs to the pager',
);
expectEqual(
  classifyStoryReportGesture(10, 2),
  'horizontal',
  'a horizontal drag responds at the reduced activation distance',
);
expectEqual(
  classifyStoryReportGesture(9, 2),
  'undecided',
  'movement below the horizontal activation distance remains undecided',
);
expectEqual(
  classifyStoryReportGesture(9, 7),
  'undecided',
  'an ambiguous diagonal drag remains in the dead zone',
);
expectEqual(
  classifyStoryReportGesture(5, 5),
  'undecided',
  'small movement never chooses an axis',
);

expectEqual(
  resolveStoryReportSwipeTarget({
    currentIndex: 3,
    dx: -80,
    pageCount: 8,
    pageWidth: 360,
    velocityX: -0.2,
  }),
  4,
  'a left distance swipe advances one page',
);
expectEqual(
  resolveStoryReportSwipeTarget({
    currentIndex: 3,
    dx: 18,
    pageCount: 8,
    pageWidth: 360,
    velocityX: 0.8,
  }),
  2,
  'a short right flick returns one page',
);
expectEqual(
  resolveStoryReportSwipeTarget({
    currentIndex: 3,
    dx: -30,
    pageCount: 8,
    pageWidth: 360,
    velocityX: -0.2,
  }),
  3,
  'a weak horizontal drag snaps back',
);
expectEqual(
  resolveStoryReportSwipeTarget({
    currentIndex: 0,
    dx: 120,
    pageCount: 8,
    pageWidth: 360,
    velocityX: 1,
  }),
  0,
  'the first page cannot swipe before the start',
);
expectEqual(
  resolveStoryReportSwipeTarget({
    currentIndex: 7,
    dx: -120,
    pageCount: 8,
    pageWidth: 360,
    velocityX: -1,
  }),
  7,
  'the last page cannot swipe past the end',
);

console.log('story report pager gesture contracts passed');
