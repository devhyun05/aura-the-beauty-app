import {useEffect, useMemo, useState} from 'react';
import {Image as ExpoImage} from 'expo-image';
import {type ImageSourcePropType, StyleSheet} from 'react-native';
import {View} from 'tamagui';

import {
  isImageUriCached,
  isRemoteImageUri,
  markImageUriCached,
  prefetchImageUri,
  resolveImageSourceUri,
} from '../services/imageCacheService';
import {colors} from '../theme';

type ImagePlaceholderProps = {
  source?: ImageSourcePropType;
  borderRadius?: number;
  resizeMode?: 'cover' | 'contain';
};

export function ImagePlaceholder({
  source,
  borderRadius = 12,
  resizeMode = 'cover',
}: ImagePlaceholderProps) {
  const sourceUri = useMemo(() => resolveImageSourceUri(source), [source]);
  const isRemote = isRemoteImageUri(sourceUri);
  const [loadedSourceUri, setLoadedSourceUri] = useState(sourceUri);
  const [isLoaded, setIsLoaded] = useState(
    () => !isRemote || isImageUriCached(sourceUri),
  );
  const shouldShowLoadedImage = isLoaded && loadedSourceUri === sourceUri;

  if (sourceUri !== loadedSourceUri) {
    setLoadedSourceUri(sourceUri);
    setIsLoaded(!isRemote || isImageUriCached(sourceUri));
  }

  useEffect(() => {
    if (!source) {
      setIsLoaded(false);
      return;
    }

    if (!isRemote) {
      setIsLoaded(true);
      return;
    }

    if (isImageUriCached(sourceUri)) {
      setIsLoaded(true);
      return;
    }

    let isActive = true;
    setIsLoaded(false);

    prefetchImageUri(sourceUri).then(success => {
      if (isActive && success) {
        setIsLoaded(true);
      }
    });

    return () => {
      isActive = false;
    };
  }, [isRemote, source, sourceUri]);

  if (!source) {
    return <View style={[styles.placeholder, {borderRadius}]} />;
  }

  return (
    <View style={[styles.frame, {borderRadius}]}>
      {!isLoaded ? <View style={styles.placeholder} /> : null}
      <ExpoImage
        cachePolicy="memory-disk"
        contentFit={resizeMode}
        onError={() => setIsLoaded(false)}
        onLoad={() => {
          markImageUriCached(sourceUri);
          setLoadedSourceUri(sourceUri);
          setIsLoaded(true);
        }}
        source={source}
        style={[
          styles.image,
          {borderRadius, opacity: shouldShowLoadedImage ? 1 : 0},
        ]}
        transition={120}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surfaceMuted,
    height: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  placeholder: {
    backgroundColor: colors.surfaceMuted,
    height: '100%',
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  },
});
