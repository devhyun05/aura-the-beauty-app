import {Image as ExpoImage} from 'expo-image';
import {Image as RNImage, type ImageSourcePropType} from 'react-native';

const prefetchedUris = new Set<string>();
const pendingPrefetches = new Map<string, Promise<boolean>>();

export function resolveImageSourceUri(
  source?: ImageSourcePropType,
): string | undefined {
  if (!source) {
    return undefined;
  }

  const resolved = RNImage.resolveAssetSource(source);
  return resolved?.uri;
}

export function isRemoteImageUri(uri?: string): uri is string {
  return Boolean(uri?.startsWith('http://') || uri?.startsWith('https://'));
}

export function isImageUriCached(uri?: string): boolean {
  return Boolean(uri && prefetchedUris.has(uri));
}

export function markImageUriCached(uri?: string): void {
  if (uri) {
    prefetchedUris.add(uri);
  }
}

export function prefetchImageUri(uri?: string): Promise<boolean> {
  if (!isRemoteImageUri(uri)) {
    return Promise.resolve(false);
  }

  if (prefetchedUris.has(uri)) {
    return Promise.resolve(true);
  }

  const pending = pendingPrefetches.get(uri);
  if (pending) {
    return pending;
  }

  const task = ExpoImage.prefetch(uri, 'memory-disk')
    .then(success => {
      if (success) {
        prefetchedUris.add(uri);
      }

      return success;
    })
    .catch(() => false)
    .finally(() => {
      pendingPrefetches.delete(uri);
    });

  pendingPrefetches.set(uri, task);

  return task;
}

export function prefetchTransientImageUri(uri?: string): Promise<boolean> {
  if (!isRemoteImageUri(uri)) {
    return Promise.resolve(false);
  }
  return ExpoImage.prefetch(uri, 'memory').catch(() => false);
}

export function prefetchImageSource(
  source?: ImageSourcePropType,
): Promise<boolean> {
  return prefetchImageUri(resolveImageSourceUri(source));
}

export function prefetchImageSources(
  sources: readonly (ImageSourcePropType | undefined)[],
): void {
  sources.forEach(source => {
    void prefetchImageSource(source);
  });
}
