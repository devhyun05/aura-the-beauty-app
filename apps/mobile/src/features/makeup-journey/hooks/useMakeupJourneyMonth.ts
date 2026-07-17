import {
  getCachedMakeupJourneyMonth,
  setCachedMakeupJourneyMonth,
} from '../services/makeupJourneyCache';
import {getMakeupJourneyCalendar} from '../services/makeupJourneyService';
import type {MakeupJourneyCalendarResponse} from '../types';
import {
  type MakeupJourneyResource,
  useMakeupJourneyResource,
} from './useMakeupJourneyResource';

export function useMakeupJourneyMonth(
  month: string,
  enabled = true,
): MakeupJourneyResource<MakeupJourneyCalendarResponse> {
  return useMakeupJourneyResource({
    cacheTarget: {month},
    enabled,
    key: month,
    load: getMakeupJourneyCalendar,
    readCache: getCachedMakeupJourneyMonth,
    writeCache: setCachedMakeupJourneyMonth,
  });
}
