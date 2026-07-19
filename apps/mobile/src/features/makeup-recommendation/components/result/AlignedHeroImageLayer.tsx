import {Image} from 'expo-image';
import {useMemo} from 'react';
import {
  type ImageSourcePropType,
  type ImageStyle,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import {computeFinalMakeupImageTransform} from '../../services/finalMakeupImageAlignment';
import type {MakeupRecommendationImageAlignmentFrame} from '../../types';

type AlignedHeroImageLayerProps = {
  alignmentFrame?: MakeupRecommendationImageAlignmentFrame;
  onError?: () => void;
  onLoad?: () => void;
  recyclingKey?: string;
  referenceFrame?: MakeupRecommendationImageAlignmentFrame;
  source: ImageSourcePropType;
  viewportHeight: number;
  viewportWidth: number;
};

type AlignmentStyles = {
  image: ImageStyle;
  inner: ViewStyle;
  outer: ViewStyle;
  scaleAndRotate: ViewStyle;
};

export function AlignedHeroImageLayer({
  alignmentFrame,
  onError,
  onLoad,
  recyclingKey,
  referenceFrame,
  source,
  viewportHeight,
  viewportWidth,
}: AlignedHeroImageLayerProps) {
  const hasMeasuredViewport = viewportWidth > 0 && viewportHeight > 0;
  const transform = useMemo(
    () => computeFinalMakeupImageTransform(
      alignmentFrame,
      {height: viewportHeight, width: viewportWidth},
      referenceFrame,
    ),
    [alignmentFrame, referenceFrame, viewportHeight, viewportWidth],
  );
  const fullCanvasStyle = useMemo(
    () => hasMeasuredViewport
      ? {
          height: viewportHeight,
          left: 0,
          position: 'absolute' as const,
          top: 0,
          width: viewportWidth,
        }
      : StyleSheet.absoluteFill,
    [hasMeasuredViewport, viewportHeight, viewportWidth],
  );
  const alignmentStyles = useMemo<AlignmentStyles | null>(() => {
    if (!transform) return null;
    return {
      image: {
        height: transform.renderedHeight,
        left: transform.originX,
        position: 'absolute',
        top: transform.originY,
        width: transform.renderedWidth,
      },
      inner: {
        transform: [
          {translateX: transform.innerTranslateX},
          {translateY: transform.innerTranslateY},
        ],
      },
      outer: {
        transform: [
          {translateX: transform.outerTranslateX},
          {translateY: transform.outerTranslateY},
        ],
      },
      scaleAndRotate: {
        transform: [
          {scale: transform.scale},
          {rotate: `${transform.rotationDeg}deg`},
        ],
      },
    };
  }, [transform]);

  if (!alignmentStyles) {
    return (
      <View pointerEvents="none" style={fullCanvasStyle}>
        <Image
          accessibilityIgnoresInvertColors
          contentFit="cover"
          contentPosition="center"
          recyclingKey={recyclingKey ? recyclingKey + ':background' : undefined}
          source={source}
          style={StyleSheet.absoluteFill}
        />
        <Image
          accessibilityIgnoresInvertColors
          contentFit="contain"
          contentPosition="center"
          onError={onError}
          onLoad={onLoad}
          recyclingKey={recyclingKey}
          source={source}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={fullCanvasStyle}>
      <Image
        accessibilityIgnoresInvertColors
        contentFit="cover"
        contentPosition="center"
        recyclingKey={recyclingKey ? `${recyclingKey}:background` : undefined}
        source={source}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.transformLayer, alignmentStyles.outer]}>
        <View style={[styles.transformLayer, alignmentStyles.scaleAndRotate]}>
          <View style={[styles.transformLayer, alignmentStyles.inner]}>
            <Image
              accessibilityIgnoresInvertColors
              contentFit="fill"
              onError={onError}
              onLoad={onLoad}
              recyclingKey={recyclingKey}
              source={source}
              style={alignmentStyles.image}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  transformLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
});
