import {
  getCachedMakeupJourneyTrend,
  setCachedMakeupJourneyTrend,
} from '../services/makeupJourneyCache';
import {getMakeupJourneyTrend} from '../services/makeupJourneyService';
import type {
  MakeupJourneyTrendRange,
  MakeupJourneyTrendResponse,
} from '../types';
import {
  type MakeupJourneyResource,
  useMakeupJourneyResource,
} from './useMakeupJourneyResource';

function splitTrendKey(key: string): [MakeupJourneyTrendRange, string] {
  const separatorIndex = key.indexOf(':');
  return [
    key.slice(0, separatorIndex) as MakeupJourneyTrendRange,
    key.slice(separatorIndex + 1),
  ];
}
function readTrendCache(key: string): MakeupJourneyTrendResponse | null {
  const [range, endDate] = splitTrendKey(key);
  return getCachedMakeupJourneyTrend(range, endDate);
}

function writeTrendCache(key: string, data: MakeupJourneyTrendResponse): void {
  const [range, endDate] = splitTrendKey(key);
  setCachedMakeupJourneyTrend(range, endDate, data);
}

function loadTrend(key: string, signal: AbortSignal): Promise<MakeupJourneyTrendResponse> {
  const [range, endDate] = splitTrendKey(key);
  return getMakeupJourneyTrend(range, endDate, signal);
}

export function useMakeupJourneyTrend(
  range: MakeupJourneyTrendRange,
  endDate: string,
): MakeupJourneyResource<MakeupJourneyTrendResponse> {
  return useMakeupJourneyResource({
    cacheTarget: {entryDate: endDate},
    enabled: true,
    key: `${range}:${endDate}`,
    load: loadTrend,
    readCache: readTrendCache,
    writeCache: writeTrendCache,
  });
}
