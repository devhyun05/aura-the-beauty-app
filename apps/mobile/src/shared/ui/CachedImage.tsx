import {Image as ExpoImage} from 'expo-image';
import type {ImageSourcePropType, ImageStyle, StyleProp} from 'react-native';

export {prefetchImageSources} from '../services/imageCacheService';

const DEFAULT_TRANSITION_MS = 120;
type ImageContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';

export type CachedImageProps = {
  accessibilityLabel?: string;
  accessible?: boolean;
  contentFit?: ImageContentFit;
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string | null;
  source: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  transition?: number;
};

/**
 * Remote-image view backed by expo-image with a persistent memory+disk cache.
 *
 * Unlike react-native's <Image>, the decoded bitmap and downloaded bytes
 * survive navigation and the memory pressure of the native AR/Unity view, so
 * returning to a screen re-uses the cache instead of re-downloading.
 */
export function CachedImage({
  contentFit = 'cover',
  priority = 'normal',
  recyclingKey,
  source,
  transition = DEFAULT_TRANSITION_MS,
  ...rest
}: CachedImageProps) {
  return (
    <ExpoImage
      cachePolicy="memory-disk"
      contentFit={contentFit}
      priority={priority}
      recyclingKey={recyclingKey}
      source={source}
      transition={transition}
      {...rest}
    />
  );
}
