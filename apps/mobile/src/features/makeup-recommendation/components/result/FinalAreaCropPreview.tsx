import {Image, type ImageLoadEventData} from 'expo-image';
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
} from 'react-native';

import Svg, {Polyline} from 'react-native-svg';
import type {FaceAnalysisRegionVisuals} from '../../../face-analysis/services/faceAnalysisMeasurements';
import type {PartKey} from '../../screens/recommendationResultTypes';
import {
  projectRegionGuidePoints,
  resolveMakeupRecommendationAreaCropAsset,
} from '../../services/makeupRecommendationRegionVisuals';
import type {
  MakeupRecommendationCropBox,
  MakeupRecommendationCropRegions,
} from '../../types';
import {colors, radius} from '../../theme/makeupResultTokens';
import {
  computeRegionFrameHeight,
  computeRegionImageLayout,
} from './finalAreaCropLayout';

export type FinalAreaCropPreviewProps = {
  area: PartKey;
  areaLabel: string;
  cropRegions?: MakeupRecommendationCropRegions;
  generatedImage: ImageSourcePropType;
  generatedReady: boolean;
  onSettledChange?: (settled: boolean) => void;
  sourceImageUri?: string;
  sourceRegionVisuals?: FaceAnalysisRegionVisuals;
};

const EMPTY_CROP_BOXES: readonly MakeupRecommendationCropBox[] = [];
const EMPTY_INDEXES: ReadonlySet<number> = new Set();

type CropLoadState = {
  epochKey: string;
  failedIndexes: ReadonlySet<number>;
  loadedIndexes: ReadonlySet<number>;
};


export function FinalAreaCropPreview({
  area,
  areaLabel,
  cropRegions,
  generatedImage,
  generatedReady,
  onSettledChange,
  sourceImageUri,
  sourceRegionVisuals,
}: FinalAreaCropPreviewProps) {
  const cropAsset = useMemo(
    () => resolveMakeupRecommendationAreaCropAsset({
      area,
      generatedCropRegions: cropRegions,
      generatedImage,
      generatedReady,
      sourceImageUri,
      sourceRegionVisuals,
    }),
    [
      area,
      cropRegions,
      generatedImage,
      generatedReady,
      sourceImageUri,
      sourceRegionVisuals,
    ],
  );
  const boxes = cropAsset.boxes.length > 0 ? cropAsset.boxes : EMPTY_CROP_BOXES;
  const cropKey = JSON.stringify(boxes);
  const cropItems: readonly (MakeupRecommendationCropBox | null)[] =
    boxes.length > 0 ? boxes : [null];

  const imageKey = JSON.stringify(cropAsset.imageSource);
  const loadEpochKey = `${imageKey}:${cropKey}:${area}:${cropAsset.coordinateSpace}`;
  const loadEpochKeyRef = useRef(loadEpochKey);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [sourceSize, setSourceSize] = useState({height: 1000, width: 840});
  const [loadState, setLoadState] = useState<CropLoadState>(() => ({
    epochKey: loadEpochKey,
    failedIndexes: EMPTY_INDEXES,
    loadedIndexes: EMPTY_INDEXES,
  }));
  const isCurrentEpoch = loadState.epochKey === loadEpochKey;
  const failedIndexes = isCurrentEpoch ? loadState.failedIndexes : EMPTY_INDEXES;
  const loadedIndexes = isCurrentEpoch ? loadState.loadedIndexes : EMPTY_INDEXES;
  const gapWidth = cropItems.length > 1 ? 10 : 0;
  const frameWidth = Math.max(
    1,
    (availableWidth - gapWidth) / cropItems.length,
  );
  const frameHeight = computeRegionFrameHeight({
    area,
    boxes,
    frameWidth,
    sourceHeight: sourceSize.height,
    sourceWidth: sourceSize.width,
  });

  useLayoutEffect(() => {
    loadEpochKeyRef.current = loadEpochKey;
    setLoadState(current =>
      current.epochKey === loadEpochKey
        ? current
        : {
          epochKey: loadEpochKey,
          failedIndexes: EMPTY_INDEXES,
          loadedIndexes: EMPTY_INDEXES,
        },
    );
    setSourceSize({height: 1000, width: 840});
    onSettledChange?.(false);
  }, [loadEpochKey, onSettledChange]);

  useEffect(() => {
    const settled = cropAsset.ready && isCurrentEpoch && (
      boxes.length === 0
      || boxes.every((_, index) => loadedIndexes.has(index) || failedIndexes.has(index))
    );
    onSettledChange?.(settled);
  }, [boxes, cropAsset.ready, failedIndexes, isCurrentEpoch, loadedIndexes, onSettledChange]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== availableWidth) {
      setAvailableWidth(nextWidth);
    }
  };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${areaLabel} 메이크업 랜드마크 확대 이미지`}
      onLayout={handleLayout}
      style={styles.row}>
      {cropItems.map((box, index) => {
        const failed = failedIndexes.has(index);
        const loaded = loadedIndexes.has(index);
        const imageStyle = box
          ? computeRegionImageLayout({
            area,
            box,
            frameHeight,
            frameWidth,
            sourceHeight: sourceSize.height,
            sourceWidth: sourceSize.width,
          })
          : undefined;

        return (
          <View
            key={`${area}:${box?.left ?? 'pending'}:${index}`}
            style={[styles.frame, {height: frameHeight, width: frameWidth}]}>
            {cropAsset.ready && box && !failed ? (
              <Image
                accessibilityIgnoresInvertColors
                contentFit="fill"
                onError={() => {
                  if (loadEpochKeyRef.current !== loadEpochKey) return;
                  setLoadState(current => (
                    current.epochKey !== loadEpochKey
                      ? current
                      : {
                        ...current,
                        failedIndexes: new Set(current.failedIndexes).add(index),
                      }
                  ));
                }}
                onLoad={(event: ImageLoadEventData) => {
                  if (loadEpochKeyRef.current !== loadEpochKey) return;
                  const {height, width} = event.source;
                  if (height > 0 && width > 0) {
                    setSourceSize(current =>
                      current.height === height && current.width === width
                        ? current
                        : {height, width},
                    );
                  }
                  setLoadState(current => (
                    current.epochKey !== loadEpochKey
                      ? current
                      : {
                        ...current,
                        loadedIndexes: new Set(current.loadedIndexes).add(index),
                      }
                  ));
                }}
                key={`${loadEpochKey}:${index}`}
                recyclingKey={`${loadEpochKey}:${index}`}
                source={cropAsset.imageSource}
                style={[styles.image, imageStyle]}
              />
            ) : null}

            {cropAsset.coordinateSpace === 'source-analysis-image'
            && imageStyle
            && loaded
            && !failed
            && cropAsset.guides.length > 0 ? (
              <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                {cropAsset.guides.map((guide, guideIndex) => {
                  const points = projectRegionGuidePoints(guide, imageStyle)
                    .map(point => `${point.x},${point.y}`)
                    .join(' ');
                  return (
                    <Polyline
                      fill="none"
                      key={`${guide.label}:${guideIndex}`}
                      points={points}
                      stroke="rgba(229, 93, 139, 0.92)"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  );
                })}
              </Svg>
            ) : null}

            {!cropAsset.ready || !box || !loaded || failed ? (
              <View pointerEvents="none" style={styles.placeholder}>
                <Text style={styles.aura}>A U R A</Text>
                <Text style={styles.placeholderText}>
                  {!cropAsset.ready
                    ? '추천 이미지 준비 중'
                    : !box
                      ? '얼굴 부위 위치를 확인하고 있어요'
                      : failed
                        ? '확대 이미지를 불러오지 못했어요'
                        : '랜드마크 확대 준비 중'}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  frame: {
    backgroundColor: colors.heroPlaceholder,
    borderColor: colors.glassBorder,
    borderRadius: radius.tile,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {position: 'absolute'},
  placeholder: {
    alignItems: 'center',
    backgroundColor: colors.heroPlaceholder,
    bottom: 0,
    gap: 6,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 8,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  aura: {
    color: colors.ink3,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  placeholderText: {
    color: colors.sub2,
    fontSize: 9.5,
    fontWeight: '600',
    textAlign: 'center',
  },
});