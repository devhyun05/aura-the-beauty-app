import {buildJourneyChartGeometry} from './chart';
import type {MakeupJourneyTrendPoint} from '../types';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const empty = buildJourneyChartGeometry([], 80, 320, '2026-07-11', '2026-07-17');
expect(empty.points.length === 0, 'zero records produce no points');
expect(empty.path === null, 'zero records produce no line');

const withoutGoal = buildJourneyChartGeometry([], null, 320, '2026-07-11', '2026-07-17');
expect(withoutGoal.goalY === null, 'pre-onboarding chart does not invent a goal line');

const single = buildJourneyChartGeometry([
  {date: '2026-07-17', score: 84, status: 'success'},
], 80, 320, '2026-07-11', '2026-07-17');
expect(single.points.length === 1, 'one record produces one point');
expect(single.points[0]?.x === 292, 'a record on the range end is placed at the right boundary');
expect(single.path === null, 'single point does not invent a line segment');

const points: MakeupJourneyTrendPoint[] = [
  {date: '2026-07-01', score: 76, status: 'failure'},
  {date: '2026-07-10', score: 82, status: 'success'},
  {date: '2026-07-17', score: 65, status: 'failure'},
];
const many = buildJourneyChartGeometry(points, 80, 320, '2026-07-01', '2026-07-31');
expect(many.points.length === 3, 'many records preserve every point');
expect(Boolean(many.path?.startsWith('M ')), 'many records begin an SVG path');
expect((many.path?.match(/ L /g)?.length ?? 0) === 2, 'many records connect each adjacent point');
expect(
  (many.points[0]?.x ?? 0) < (many.points[1]?.x ?? 0) &&
    (many.points[1]?.x ?? 0) < (many.points[2]?.x ?? 0),
  'point positions increase chronologically',
);
expect(many.points[1]?.status === 'success', 'point status is retained for theme coloring');
expect(
  (many.points[1]?.x ?? 0) - (many.points[0]?.x ?? 0) >
    (many.points[2]?.x ?? 0) - (many.points[1]?.x ?? 0),
  'point spacing follows the actual nine-day and seven-day gaps',
);

const sevenDay = buildJourneyChartGeometry(points.slice(1), 80, 320, '2026-07-11', '2026-07-17');
const ninetyDay = buildJourneyChartGeometry(points.slice(1), 80, 320, '2026-04-19', '2026-07-17');
expect(
  (sevenDay.points[0]?.x ?? 0) < (ninetyDay.points[0]?.x ?? 0),
  'the same recent point occupies a different x position when the selected range changes',
);

console.log('makeup journey chart contract passed');
