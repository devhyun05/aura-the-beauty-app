import {Image as ExpoImage, type ImageSource} from 'expo-image';

import {
  buildBackendApiUrl,
  getBackendAuthToken,
} from '../../../shared/services/backendApi';

const MAKEUP_JOURNEY_THUMBNAIL_PATH = /^\/?(?:api\/)?makeup-journey\/reports\/[0-9a-f-]+\/thumbnail$/i;

let privateImageGeneration = 0;
const prefetchedPrivateImageKeys = new Set<string>();
const pendingPrivateImagePrefetches = new Map<string, Promise<boolean>>();

function normalizedPrivateImagePath(path: string): string | null {
  const normalized = path.trim().split('?', 1)[0];
  if (!MAKEUP_JOURNEY_THUMBNAIL_PATH.test(normalized)) {
    return null;
  }
  return normalized.replace(/^\/+/, '').replace(/^api\/+/, '');
}

function privateImageKey(path: string): string {
  // A report thumbnail is immutable. General journey data changes (notes,
  // missions, representative selection) must not cold-start every face image;
  // the report path changes when the selected photo changes and the generation
  // changes at account boundaries.
  return `${privateImageGeneration}:${path}`;
}

function privateImageUri(path: string, cacheRevision: number): string {
  const url = buildBackendApiUrl(path);
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}cacheRevision=${cacheRevision}&privateGeneration=${privateImageGeneration}`;
}

export function getMakeupJourneyPrivateImageSource(
  endpointPath: string | null | undefined,
  cacheRevision: number,
): ImageSource | null {
  const path = endpointPath ? normalizedPrivateImagePath(endpointPath) : null;
  const authToken = getBackendAuthToken();
  if (!path || !authToken) {
    return null;
  }
  const key = privateImageKey(path);
  return {
    cacheKey: `makeup-journey-private:${key}`,
    headers: {Authorization: `Bearer ${authToken}`},
    uri: privateImageUri(path, cacheRevision),
  };
}

export function prefetchMakeupJourneyPrivateImage(
  endpointPath: string,
  cacheRevision: number,
): Promise<boolean> {
  const source = getMakeupJourneyPrivateImageSource(endpointPath, cacheRevision);
  if (!source?.uri || !source.headers) {
    return Promise.resolve(false);
  }
  const generationAtStart = privateImageGeneration;
  const key = source.cacheKey ?? source.uri;
  if (prefetchedPrivateImageKeys.has(key)) {
    return Promise.resolve(true);
  }
  const pending = pendingPrivateImagePrefetches.get(key);
  if (pending) {
    return pending;
  }

  const task = ExpoImage.prefetch(source.uri, {
    cachePolicy: 'memory',
    headers: source.headers,
  })
    .then(success => {
      if (success && generationAtStart === privateImageGeneration) {
        prefetchedPrivateImageKeys.add(key);
        return true;
      }
      return false;
    })
    .catch(() => false)
    .finally(() => {
      pendingPrivateImagePrefetches.delete(key);
    });
  pendingPrivateImagePrefetches.set(key, task);
  return task;
}

export function clearMakeupJourneyPrivateImageMemoryCache(): void {
  privateImageGeneration += 1;
  prefetchedPrivateImageKeys.clear();
  pendingPrivateImagePrefetches.clear();
  try {
    const clearing = ExpoImage.clearMemoryCache();
    if (clearing && typeof clearing.catch === 'function') {
      void clearing.catch(() => false);
    }
  } catch {
    // Native image cache may be unavailable while the app runtime is tearing down.
  }
}

export function getMakeupJourneyPrivateImageGeneration(): number {
  return privateImageGeneration;
}
