import {Image as ExpoImage, type ImageSource} from 'expo-image';
import type {ImageSourcePropType} from 'react-native';

import {
  isRemoteImageUri,
  prefetchImageSource,
  resolveImageSourceUri,
} from '../../../shared/services/imageCacheService';
import type {HomeModuleConfig, HomeModuleId} from '../types/homeModules';

export const HOME_IMAGE_PREFETCH_CONCURRENCY = 4;
export const HOME_CURRENT_MODULE_PREFETCH_LIMIT = 2;
export const HOME_NEXT_MODULE_PREFETCH_LIMIT = 1;

export type HomeImageLoadStage = 'deferred' | 'preview' | 'visible';

export type HomeImagePrefetcher = (
  source: ImageSourcePropType,
) => Promise<boolean>;

export type HomeImageSourceUriResolver = (
  source: ImageSourcePropType,
) => string | undefined;

export type HomeImageSchedulerOptions = {
  prefetch?: HomeImagePrefetcher;
  resolveUri?: HomeImageSourceUriResolver;
};

export type HomeImageScheduler = {
  getActiveCount: () => number;
  getScheduledUriCount: () => number;
  scheduleSources: (
    sources: readonly (ImageSourcePropType | undefined)[],
  ) => Promise<readonly boolean[]>;
  scheduleAroundModule: (
    modules: readonly HomeModuleConfig[],
    currentModuleIndex: number,
  ) => Promise<readonly boolean[]>;
};

type QueuedPrefetch = {
  resolve: (success: boolean) => void;
  source: ImageSourcePropType;
};

async function prefetchHomeImageSource(
  source: ImageSourcePropType,
): Promise<boolean> {
  const uri = resolveImageSourceUri(source);

  if (isRemoteImageUri(uri)) {
    return prefetchImageSource(source);
  }

  const loadableSource = getLoadableExpoImageSource(source);

  if (!loadableSource) {
    return false;
  }

  try {
    await ExpoImage.loadAsync(loadableSource);
    return true;
  } catch {
    return false;
  }
}

function getLoadableExpoImageSource(
  source: ImageSourcePropType,
): ImageSource | number | undefined {
  if (typeof source === 'number') {
    return source;
  }

  if (Array.isArray(source)) {
    const firstSource = source[0];
    return firstSource?.uri ? firstSource as ImageSource : undefined;
  }

  return source.uri ? source as ImageSource : undefined;
}

/**
 * Keeps mounted-but-offscreen FlatList cells from starting their own image
 * requests before the viewability scheduler reaches them.
 */
export function getHomeImageSourceForStage(
  source: ImageSourcePropType | undefined,
  imageIndex: number,
  stage: HomeImageLoadStage,
): ImageSourcePropType | undefined {
  if (stage === 'visible' || (stage === 'preview' && imageIndex === 0)) {
    return source;
  }

  return undefined;
}

export function getHomeModulePrefetchWindowSources(
  modules: readonly HomeModuleConfig[],
  currentModuleIndex: number,
): ImageSourcePropType[] {
  if (
    currentModuleIndex < 0
    || currentModuleIndex >= modules.length
    || !Number.isInteger(currentModuleIndex)
  ) {
    return [];
  }

  const currentModuleSources = modules[currentModuleIndex]?.imageSources
    .slice(0, HOME_CURRENT_MODULE_PREFETCH_LIMIT) ?? [];
  const nextModuleSources = modules[currentModuleIndex + 1]?.imageSources
    .slice(0, HOME_NEXT_MODULE_PREFETCH_LIMIT) ?? [];

  return [...currentModuleSources, ...nextModuleSources];
}

export function getAllHomeImageSources(
  modules: readonly HomeModuleConfig[],
  additionalSources: readonly (ImageSourcePropType | undefined)[] = [],
): ImageSourcePropType[] {
  return [
    ...modules.flatMap(module => module.imageSources),
    ...additionalSources.flatMap(source => source ? [source] : []),
  ];
}

/**
 * Keeps only the viewport modules visible and one following module in preview.
 * Previously viewed modules are intentionally omitted so mounted FlatList cells
 * return to the deferred placeholder instead of retaining decoded bitmaps.
 */
export function getHomeImageLoadStagesForViewport(
  modules: readonly HomeModuleConfig[],
  visibleModuleIndices: readonly number[],
): Partial<Record<HomeModuleId, HomeImageLoadStage>> {
  const validVisibleIndices = [...new Set(visibleModuleIndices)]
    .filter(index => (
      Number.isInteger(index)
      && index >= 0
      && index < modules.length
    ));

  if (validVisibleIndices.length === 0) {
    return {};
  }

  const stages: Partial<Record<HomeModuleId, HomeImageLoadStage>> = {};

  validVisibleIndices.forEach(index => {
    const module = modules[index];

    if (module) {
      stages[module.id] = 'visible';
    }
  });

  const nextModule = modules[Math.max(...validVisibleIndices) + 1];

  if (nextModule && !stages[nextModule.id]) {
    stages[nextModule.id] = 'preview';
  }

  return stages;
}

export function createHomeImageScheduler(
  options: HomeImageSchedulerOptions = {},
): HomeImageScheduler {
  const prefetch = options.prefetch ?? prefetchHomeImageSource;
  const resolveUri = options.resolveUri ?? resolveImageSourceUri;
  const scheduledByUri = new Map<string, Promise<boolean>>();
  const queue: QueuedPrefetch[] = [];
  let activeCount = 0;

  const drainQueue = () => {
    while (activeCount < HOME_IMAGE_PREFETCH_CONCURRENCY && queue.length > 0) {
      const queuedPrefetch = queue.shift();

      if (!queuedPrefetch) {
        return;
      }

      activeCount += 1;

      void Promise.resolve()
        .then(() => prefetch(queuedPrefetch.source))
        .catch(() => false)
        .then(queuedPrefetch.resolve)
        .finally(() => {
          activeCount -= 1;
          drainQueue();
        });
    }
  };

  const scheduleSource = (source: ImageSourcePropType): Promise<boolean> => {
    let uri: string | undefined;

    try {
      uri = resolveUri(source);
    } catch {
      return Promise.resolve(false);
    }

    if (!uri) {
      return Promise.resolve(false);
    }

    const scheduled = scheduledByUri.get(uri);

    if (scheduled) {
      return scheduled;
    }

    let resolvePrefetch: (success: boolean) => void = () => undefined;
    const task = new Promise<boolean>(resolve => {
      resolvePrefetch = resolve;
    });

    scheduledByUri.set(uri, task);
    void task.then(success => {
      if (
        !success
        && isRemoteImageUri(uri)
        && scheduledByUri.get(uri) === task
      ) {
        scheduledByUri.delete(uri);
      }
    });
    queue.push({resolve: resolvePrefetch, source});
    drainQueue();

    return task;
  };

  const scheduleSources = (
    sources: readonly (ImageSourcePropType | undefined)[],
  ): Promise<readonly boolean[]> => Promise.all(
    sources.flatMap(source => source ? [scheduleSource(source)] : []),
  );

  return {
    getActiveCount: () => activeCount,
    getScheduledUriCount: () => scheduledByUri.size,
    scheduleSources,
    scheduleAroundModule: (modules, currentModuleIndex) => scheduleSources(
      getHomeModulePrefetchWindowSources(modules, currentModuleIndex),
    ),
  };
}

export const homeImageScheduler = createHomeImageScheduler();
