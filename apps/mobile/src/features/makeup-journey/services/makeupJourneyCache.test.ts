import {
  createJourneyRequestGate,
  getCachedMakeupJourneyDay,
  getCachedMakeupJourneyMonth,
  getCachedMakeupJourneyTrend,
  getMakeupJourneyCacheRevision,
  invalidateMakeupJourneyCache,
  MAX_CACHED_MAKEUP_JOURNEY_MONTHS,
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

const revisionBeforeTargetedInvalidation = getMakeupJourneyCacheRevision();
invalidateMakeupJourneyCache({month: '2026-07'});
expect(
  getMakeupJourneyCacheRevision() === revisionBeforeTargetedInvalidation + 1,
  'every invalidation advances the revision so stale background prefetches cannot refill cache',
);

for (let index = 0; index <= MAX_CACHED_MAKEUP_JOURNEY_MONTHS; index += 1) {
  const year = 2020 + Math.floor(index / 12);
  const month = String((index % 12) + 1).padStart(2, '0');
  setCachedMakeupJourneyMonth(`${year}-${month}`, monthData);
}
expect(
  getCachedMakeupJourneyMonth('2020-01') === null,
  'background neighbor prefetch keeps the month cache bounded',
);
invalidateMakeupJourneyCache();

console.log('makeup journey cache contract passed');
