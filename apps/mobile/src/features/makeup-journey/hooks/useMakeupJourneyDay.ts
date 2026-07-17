import {
  getCachedMakeupJourneyDay,
  setCachedMakeupJourneyDay,
} from '../services/makeupJourneyCache';
import {getMakeupJourneyDay} from '../services/makeupJourneyService';
import type {MakeupJourneyDayResponse} from '../types';
import {
  type MakeupJourneyResource,
  useMakeupJourneyResource,
} from './useMakeupJourneyResource';

export function useMakeupJourneyDay(
  entryDate: string,
): MakeupJourneyResource<MakeupJourneyDayResponse> {
  return useMakeupJourneyResource({
    cacheTarget: {entryDate},
    enabled: true,
    key: entryDate,
    load: getMakeupJourneyDay,
    readCache: getCachedMakeupJourneyDay,
    writeCache: setCachedMakeupJourneyDay,
  });
}
