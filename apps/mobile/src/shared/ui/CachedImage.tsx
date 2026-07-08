import {
  Image,
  type ImageResizeMode,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
} from 'react-native';

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
  priority: _priority,
  recyclingKey: _recyclingKey,
  source,
  transition: _transition = DEFAULT_TRANSITION_MS,
  ...rest
}: CachedImageProps) {
  const resizeMode: ImageResizeMode =
    contentFit === 'fill'
      ? 'stretch'
      : contentFit === 'none'
        ? 'center'
        : contentFit === 'scale-down'
          ? 'contain'
          : contentFit;

  return (
    <Image
      resizeMode={resizeMode}
      source={source}
      {...rest}
    />
  );
}

export function getPrefetchableImageUri(
  source: ImageSourcePropType | undefined,
): string | undefined {
  if (!source || typeof source === 'number') {
    return undefined;
  }

  const candidate = Array.isArray(source) ? source[0] : source;
  const uri = candidate?.uri;

  return typeof uri === 'string' && /^https?:\/\//.test(uri) ? uri : undefined;
}

/**
 * Warm the cache for a set of remote images so they render instantly later.
 * Local (bundled) sources and non-http uris are ignored.
 */
export function prefetchImageSources(
  sources: ReadonlyArray<ImageSourcePropType | undefined>,
): void {
  const uris = Array.from(
    new Set(
      sources
        .map(getPrefetchableImageUri)
        .filter((uri): uri is string => Boolean(uri)),
    ),
  );

  if (uris.length > 0) {
    uris.forEach(uri => {
      void Image.prefetch(uri);
    });
  }
}
