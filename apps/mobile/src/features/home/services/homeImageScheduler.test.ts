import type {ImageSourcePropType} from 'react-native';

import {
  createHomeImageScheduler,
  getAllHomeImageSources,
  getHomeImageLoadStagesForViewport,
  getHomeImageSourceForStage,
  getHomeModulePrefetchWindowSources,
  HOME_IMAGE_PREFETCH_CONCURRENCY,
} from './homeImageScheduler';
import type {HomeModuleConfig, HomeModuleId} from '../types/homeModules';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function remoteSource(uri: string): ImageSourcePropType {
  return {uri};
}

function moduleWithImages(
  id: HomeModuleId,
  uris: readonly string[],
): HomeModuleConfig {
  return {
    ctaLabel: '열기',
    featureId: 'faceAnalysis',
    id,
    imageSources: uris.map(remoteSource),
    kind: id,
    title: id,
    visibility: 'always',
  };
}

const modules = [
  moduleWithImages('faceAnalysis', [
    'https://example.com/current-1.webp',
    'https://example.com/current-2.webp',
    'https://example.com/current-not-prefetched.webp',
  ]),
  moduleWithImages('products', [
    'https://example.com/next-1.webp',
    'https://example.com/next-not-prefetched.webp',
  ]),
  moduleWithImages('consulting', ['https://example.com/off-window.webp']),
];
const stagedSource = remoteSource('https://example.com/staged.webp');

const viewportStages = getHomeImageLoadStagesForViewport(modules, [1]);
expect(
  viewportStages.faceAnalysis === undefined,
  'a previously viewed module returns to the deferred stage',
);
expect(
  viewportStages.products === 'visible',
  'the viewport module is visible',
);
expect(
  viewportStages.consulting === 'preview',
  'only the following module remains in preview',
);

expect(
  getHomeImageSourceForStage(stagedSource, 0, 'deferred') === undefined,
  'mounted offscreen cells do not start image requests',
);
expect(
  getHomeImageSourceForStage(stagedSource, 0, 'preview') === stagedSource,
  'the next module may load only its representative image',
);
expect(
  getHomeImageSourceForStage(stagedSource, 1, 'preview') === undefined,
  'the next module defers secondary images',
);
expect(
  getHomeImageSourceForStage(stagedSource, 2, 'visible') === stagedSource,
  'a visible module may render the images in its current viewport',
);

expect(
  getHomeModulePrefetchWindowSources(modules, 0).length === 3,
  'window contains two current images and one next image',
);
expect(
  getHomeModulePrefetchWindowSources(modules, -1).length === 0,
  'invalid module index does not prefetch',
);
expect(
  getAllHomeImageSources(modules, [stagedSource]).length === 7,
  'all module and additional home images are included in the eager prefetch set',
);

async function runSchedulerContract(): Promise<void> {
  let activeCount = 0;
  let maxActiveCount = 0;
  const requestedUris: string[] = [];
  const releases: Array<(success: boolean) => void> = [];

  const scheduler = createHomeImageScheduler({
    prefetch: source => {
      const uri = (source as {uri?: string}).uri ?? '';
      requestedUris.push(uri);
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);

      return new Promise<boolean>(resolve => {
        releases.push(success => {
          activeCount -= 1;
          resolve(success);
        });
      });
    },
    resolveUri: source => (source as {uri?: string}).uri,
  });

  const firstSchedule = scheduler.scheduleAroundModule(modules, 0);
  const duplicateSchedule = scheduler.scheduleAroundModule(modules, 0);

  await flushMicrotasks();
  expect(
    requestedUris.length === Math.min(3, HOME_IMAGE_PREFETCH_CONCURRENCY),
    'scheduler fills the available prefetch slots',
  );
  expect(
    scheduler.getActiveCount() === Math.min(3, HOME_IMAGE_PREFETCH_CONCURRENCY),
    'scheduler reports every active request',
  );
  expect(scheduler.getScheduledUriCount() === 3, 'overlapping window URIs are deduplicated');

  releases.shift()?.(true);
  await flushMicrotasks();
  expect(requestedUris.length === 3, 'the complete viewport window is scheduled');
  expect(
    maxActiveCount <= HOME_IMAGE_PREFETCH_CONCURRENCY,
    'prefetch concurrency never exceeds its configured limit',
  );
  expect(
    !requestedUris.includes('https://example.com/current-not-prefetched.webp')
      && !requestedUris.includes('https://example.com/next-not-prefetched.webp')
      && !requestedUris.includes('https://example.com/off-window.webp'),
    'viewport scheduling remains scoped while eager Home prefetch uses the full image set',
  );

  while (releases.length > 0) {
    releases.shift()?.(true);
  }

  await Promise.all([firstSchedule, duplicateSchedule]);
  expect(requestedUris.length === 3, 'duplicate scheduling does not repeat URI requests');

  let bundledAssetAttempts = 0;
  const bundledAssetScheduler = createHomeImageScheduler({
    prefetch: async () => {
      bundledAssetAttempts += 1;
      return false;
    },
    resolveUri: source => (source as {uri?: string}).uri,
  });
  const bundledAssetModules = [
    moduleWithImages('auradin', ['file:///app/home-auradin.webp']),
  ];

  await bundledAssetScheduler.scheduleAroundModule(bundledAssetModules, 0);
  await bundledAssetScheduler.scheduleAroundModule(bundledAssetModules, 0);
  expect(
    bundledAssetAttempts === 1,
    'bundled asset decode attempts are URI-deduplicated',
  );

  let sharedActiveCount = 0;
  let sharedMaxActiveCount = 0;
  const sharedReleases: Array<() => void> = [];
  const sharedScheduler = createHomeImageScheduler({
    prefetch: () => {
      sharedActiveCount += 1;
      sharedMaxActiveCount = Math.max(sharedMaxActiveCount, sharedActiveCount);

      return new Promise<boolean>(resolve => {
        sharedReleases.push(() => {
          sharedActiveCount -= 1;
          resolve(true);
        });
      });
    },
    resolveUri: source => (source as {uri?: string}).uri,
  });
  const sharedModuleTask = sharedScheduler.scheduleAroundModule(modules, 0);
  const sharedFilterTask = sharedScheduler.scheduleSources([
    remoteSource('https://example.com/filter-1.webp'),
    remoteSource('https://example.com/filter-2.webp'),
  ]);

  await flushMicrotasks();
  expect(
    sharedScheduler.getActiveCount() === HOME_IMAGE_PREFETCH_CONCURRENCY,
    'module and filter prefetches share the configured queue',
  );

  while (sharedReleases.length > 0 || sharedScheduler.getActiveCount() > 0) {
    sharedReleases.shift()?.();
    await flushMicrotasks();
  }

  await Promise.all([sharedModuleTask, sharedFilterTask]);
  expect(
    sharedMaxActiveCount === HOME_IMAGE_PREFETCH_CONCURRENCY,
    'the shared home prefetch queue never exceeds its configured concurrency',
  );

  let remoteAssetAttempts = 0;
  const retryingRemoteScheduler = createHomeImageScheduler({
    prefetch: async () => {
      remoteAssetAttempts += 1;
      return false;
    },
    resolveUri: source => (source as {uri?: string}).uri,
  });
  const failedRemoteModules = [
    moduleWithImages('consulting', ['https://example.com/retry.webp']),
  ];

  await retryingRemoteScheduler.scheduleAroundModule(failedRemoteModules, 0);
  await flushMicrotasks();
  await retryingRemoteScheduler.scheduleAroundModule(failedRemoteModules, 0);
  expect(
    remoteAssetAttempts === 2,
    'failed remote assets can be retried when the module becomes visible again',
  );
}

function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

void runSchedulerContract().catch(error => {
  setTimeout(() => {
    throw error;
  }, 0);
});
