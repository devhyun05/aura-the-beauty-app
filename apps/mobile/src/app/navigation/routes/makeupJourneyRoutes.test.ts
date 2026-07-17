import {
  getMakeupJourneyDayBackBehavior,
  getMakeupJourneyEmptyDayFeedbackContext,
  getMakeupJourneyFeedbackPhotoRoute,
  getMakeupJourneyInitialMonthRouteParam,
  getMakeupJourneyInitialTrendRangeRouteParam,
  getMakeupJourneyTrendBackBehavior,
  isMakeupJourneyEntryDateRouteParam,
} from './makeupJourneyRoutes';
import {
  getHomeTabResetState,
  getMakeupJourneyDayResetState,
  getMakeupJourneySafeReturnResetState,
  getMakeupJourneyTabResetState,
} from './routeUtils';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getMakeupJourneyDayBackBehavior(true),
  'goBack',
  'journey detail returns through an existing stack',
);
expectEqual(
  getMakeupJourneyDayBackBehavior(false),
  'MakeupJourneyTab',
  'deep-linked detail falls back to the journey tab',
);
expectEqual(
  getMakeupJourneyTrendBackBehavior(false),
  'MakeupJourneyDayDetail',
  'deep-linked trend falls back to its selected day',
);
expectEqual(
  getMakeupJourneyFeedbackPhotoRoute('camera'),
  'MakeupFeedbackCapture',
  'correction camera reuses capture route',
);
expectEqual(
  getMakeupJourneyFeedbackPhotoRoute('gallery'),
  'MakeupFeedbackAlbumUpload',
  'correction gallery reuses upload route',
);

const emptyPastDayFeedbackContext = getMakeupJourneyEmptyDayFeedbackContext(
  '2026-06-01',
  new Date(2026, 6, 17, 23, 30),
);
expectEqual(
  emptyPastDayFeedbackContext.entryDate,
  '2026-07-17',
  'empty past-day CTA uses the device-local current date instead of the selected day',
);
expectEqual(
  emptyPastDayFeedbackContext.origin,
  'journeyDay',
  'empty past-day CTA returns cancellation and completion to the resolved journey day',
);
expectEqual(
  isMakeupJourneyEntryDateRouteParam('2026-07-17'),
  true,
  'canonical journey deep-link date is accepted at the route boundary',
);
expectEqual(
  isMakeupJourneyEntryDateRouteParam('not-a-date'),
  false,
  'malformed journey deep-link date is rejected before screen rendering',
);
expectEqual(
  getMakeupJourneyInitialMonthRouteParam('2026-07'),
  '2026-07',
  'canonical journey tab month is accepted',
);
expectEqual(
  getMakeupJourneyInitialMonthRouteParam('0000-01'),
  undefined,
  'malformed journey tab month falls back without crashing calendar state',
);
expectEqual(
  getMakeupJourneyInitialTrendRangeRouteParam('90d'),
  '90d',
  'canonical trend deep-link range is accepted',
);
expectEqual(
  getMakeupJourneyInitialTrendRangeRouteParam('bogus'),
  undefined,
  'malformed trend deep-link range falls back to the screen default',
);

const tabReset = getMakeupJourneyTabResetState('2026-07');
expectEqual(tabReset.index, 0, 'calendar fallback replaces the root stack');
expectEqual(tabReset.routes[0]?.name, 'MainTabs', 'calendar fallback starts at main tabs');
expectEqual(
  tabReset.routes[0]?.params.params?.month,
  '2026-07',
  'calendar fallback preserves the selected month',
);

const genericTabReset = getMakeupJourneyTabResetState();
expectEqual(
  genericTabReset.routes[0]?.params.screen,
  'MakeupJourneyTab',
  'journey result fallback returns to the journey tab without an invalid month',
);

const homeReset = getHomeTabResetState();
expectEqual(homeReset.index, 0, 'disabled journey deep link replaces the root stack');
expectEqual(
  homeReset.routes[0]?.params.screen,
  'HomeTab',
  'disabled journey deep link can always return to Home',
);
expectEqual(
  'params' in (genericTabReset.routes[0]?.params ?? {}),
  false,
  'journey result fallback omits an unknown month instead of passing an empty value',
);

const dayReset = getMakeupJourneyDayResetState('2026-07-17');
expectEqual(dayReset.index, 1, 'day fallback creates a two-route root stack');
expectEqual(
  dayReset.routes.map(item => item.name).join(','),
  'MainTabs,MakeupJourneyDayDetail',
  'day fallback cannot cycle back into trend or feedback result',
);

const validFeedbackResultReturn = getMakeupJourneySafeReturnResetState(
  '2026-07-17',
);
expectEqual(
  validFeedbackResultReturn.routes[1]?.name,
  'MakeupJourneyDayDetail',
  'a completed correction returns to its canonical journey day',
);
const validFeedbackResultReturnParams = validFeedbackResultReturn.routes[1]?.params;
expectEqual(
  validFeedbackResultReturnParams && 'entryDate' in validFeedbackResultReturnParams
    ? validFeedbackResultReturnParams.entryDate
    : undefined,
  '2026-07-17',
  'a completed correction preserves its journey entry date',
);

const invalidFeedbackResultReturn = getMakeupJourneySafeReturnResetState(
  'not-a-date',
);
expectEqual(
  invalidFeedbackResultReturn.routes.length,
  1,
  'an invalid correction return date falls back without creating a broken detail route',
);
const invalidFeedbackResultReturnParams = invalidFeedbackResultReturn.routes[0]?.params;
expectEqual(
  invalidFeedbackResultReturnParams && 'screen' in invalidFeedbackResultReturnParams
    ? invalidFeedbackResultReturnParams.screen
    : undefined,
  'MakeupJourneyTab',
  'an invalid correction return date safely falls back to the journey calendar',
);
