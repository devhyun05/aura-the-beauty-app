import {
  getCachedMakeupJourneyMonth,
  getMakeupJourneyCacheRevision,
  setCachedMakeupJourneyMonth,
} from './makeupJourneyCache';
import {prefetchMakeupJourneyPrivateImage} from './makeupJourneyPrivateImage';
import {getMakeupJourneyCalendar} from './makeupJourneyService';
import type {MakeupJourneyCalendarResponse} from '../types';

export const MAKEUP_JOURNEY_THUMBNAIL_PREFETCH_CONCURRENCY = 4;

type ThumbnailQueueItem = {
  cacheRevision: number;
  resolve: (success: boolean) => void;
  uri: string;
};

const thumbnailQueue: ThumbnailQueueItem[] = [];
const pendingThumbnailPrefetches = new Map<string, Promise<boolean>>();
const pendingMonthPrefetches = new Map<
  string,
  {cacheRevision: number; promise: Promise<MakeupJourneyCalendarResponse | null>}
>();
let activeThumbnailPrefetches = 0;

function drainThumbnailQueue(): void {
  while (
    activeThumbnailPrefetches < MAKEUP_JOURNEY_THUMBNAIL_PREFETCH_CONCURRENCY
    && thumbnailQueue.length > 0
  ) {
    const queued = thumbnailQueue.shift();
    if (!queued) {
      return;
    }
    const key = `${queued.cacheRevision}:${queued.uri}`;
    if (queued.cacheRevision !== getMakeupJourneyCacheRevision()) {
      pendingThumbnailPrefetches.delete(key);
      queued.resolve(false);
      continue;
    }

    activeThumbnailPrefetches += 1;
    void prefetchMakeupJourneyPrivateImage(queued.uri, queued.cacheRevision)
      .then(queued.resolve)
      .catch(() => queued.resolve(false))
      .finally(() => {
        pendingThumbnailPrefetches.delete(key);
        activeThumbnailPrefetches -= 1;
        drainThumbnailQueue();
      });
  }
}

function scheduleThumbnailPrefetch(uri: string, cacheRevision: number): Promise<boolean> {
  const key = `${cacheRevision}:${uri}`;
  const pending = pendingThumbnailPrefetches.get(key);
  if (pending) {
    return pending;
  }

  let resolveTask: (success: boolean) => void = () => undefined;
  const task = new Promise<boolean>(resolve => {
    resolveTask = resolve;
  });
  pendingThumbnailPrefetches.set(key, task);
  thumbnailQueue.push({cacheRevision, resolve: resolveTask, uri});
  drainThumbnailQueue();
  return task;
}

export async function prefetchMakeupJourneyCalendarThumbnails(
  data: MakeupJourneyCalendarResponse,
  cacheRevision = getMakeupJourneyCacheRevision(),
): Promise<void> {
  const thumbnailUrls = [...new Set(data.days.flatMap(day => {
    const uri = day.representativeThumbnailUrl?.trim();
    return uri ? [uri] : [];
  }))];
  await Promise.all(thumbnailUrls.map(uri => scheduleThumbnailPrefetch(uri, cacheRevision)));
}

export function prefetchMakeupJourneyMonth(
  month: string,
): Promise<MakeupJourneyCalendarResponse | null> {
  const cacheRevision = getMakeupJourneyCacheRevision();
  const cached = getCachedMakeupJourneyMonth(month);
  if (cached) {
    return prefetchMakeupJourneyCalendarThumbnails(cached, cacheRevision).then(() => cached);
  }

  const pending = pendingMonthPrefetches.get(month);
  if (pending?.cacheRevision === cacheRevision) {
    return pending.promise;
  }

  const promise = getMakeupJourneyCalendar(month)
    .then(async data => {
      if (cacheRevision !== getMakeupJourneyCacheRevision()) {
        return null;
      }
      setCachedMakeupJourneyMonth(month, data);
      await prefetchMakeupJourneyCalendarThumbnails(data, cacheRevision);
      return cacheRevision === getMakeupJourneyCacheRevision() ? data : null;
    })
    .finally(() => {
      const current = pendingMonthPrefetches.get(month);
      if (current?.promise === promise) {
        pendingMonthPrefetches.delete(month);
      }
    });
  pendingMonthPrefetches.set(month, {cacheRevision, promise});
  return promise;
}
