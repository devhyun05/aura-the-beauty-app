import {
  createJourneyRequestGate,
  getCachedMakeupJourneyDay,
  getCachedMakeupJourneyMonth,
  getCachedMakeupJourneyTrend,
  invalidateMakeupJourneyCache,
  matchesMakeupJourneyCacheTarget,
  setCachedMakeupJourneyDay,
  setCachedMakeupJourneyMonth,
  setCachedMakeupJourneyTrend,
} from './makeupJourneyCache';
import type {
  MakeupJourneyCalendarResponse,
  MakeupJourneyDayResponse,
  MakeupJourneyTrendResponse,
} from '../types';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const gate = createJourneyRequestGate();
const julyRequest = gate.begin('2026-07');
const augustRequest = gate.begin('2026-08');
expect(!gate.isCurrent(julyRequest, '2026-07'), 'late prior-month response is rejected');
expect(gate.isCurrent(augustRequest, '2026-08'), 'latest requested month may update the screen');
expect(!gate.isCurrent(augustRequest, '2026-07'), 'response cannot update a different month key');

expect(
  matchesMakeupJourneyCacheTarget(
    {entryDate: '2026-07-17'},
    {month: '2026-07'},
  ),
  'day mutation invalidates its month',
);
expect(
  !matchesMakeupJourneyCacheTarget(
    {entryDate: '2026-08-01'},
    {month: '2026-07'},
  ),
  'day mutation does not invalidate unrelated months',
);
expect(matchesMakeupJourneyCacheTarget(null, {month: '2026-07'}), 'global invalidation matches all');

const monthData = {} as MakeupJourneyCalendarResponse;
const dayData = {} as MakeupJourneyDayResponse;
const trendData = {} as MakeupJourneyTrendResponse;
setCachedMakeupJourneyMonth('2026-07', monthData);
setCachedMakeupJourneyDay('2026-07-17', dayData);
setCachedMakeupJourneyTrend('30d', '2026-07-17', trendData);
invalidateMakeupJourneyCache();
expect(getCachedMakeupJourneyMonth('2026-07') === null, 'account boundary clears month cache');
expect(getCachedMakeupJourneyDay('2026-07-17') === null, 'account boundary clears day cache');
expect(
  getCachedMakeupJourneyTrend('30d', '2026-07-17') === null,
  'account boundary clears trend cache',
);

console.log('makeup journey cache contract passed');
