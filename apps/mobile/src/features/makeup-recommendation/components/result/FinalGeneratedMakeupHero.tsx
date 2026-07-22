import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  type GestureResponderEvent,
  type ImageSourcePropType,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  MakeupRecommendationImageAlignmentMetadata,
  MakeupRecommendationImageStatus,
} from '../../types';
import {AlignedHeroImageLayer} from './AlignedHeroImageLayer';

const INITIAL_COMPARE_RATIO = 1;
const MIN_COMPARE_RATIO = 0.04;
const MAX_COMPARE_RATIO = 1;
const IOS_EDGE_GUARD = 24;
const AURA_LETTERS = ['A', 'U', 'R', 'A'] as const;

export const clampFinalCompareRatio = (ratio: number): number =>
  Math.min(MAX_COMPARE_RATIO, Math.max(MIN_COMPARE_RATIO, ratio));

type FinalGeneratedMakeupHeroProps = {
  alignmentMetadata?: MakeupRecommendationImageAlignmentMetadata;
  beforeImageUri?: string;
  afterImage: ImageSourcePropType;
  imageStatus: MakeupRecommendationImageStatus;
  imageError?: string;
  onReadyChange?: (ready: boolean) => void;
  onRetry: () => void;
  reduceMotion?: boolean;
  title?: string;
};

export const FinalGeneratedMakeupHero = ({
  alignmentMetadata,
  beforeImageUri,
  afterImage,
  imageStatus,
  imageError,
  onReadyChange,
  onRetry,
  reduceMotion = false,
  title,
}: FinalGeneratedMakeupHeroProps) => {
  const isServerGenerating = imageStatus === 'pending' || imageStatus === 'processing';
  const isIncomplete = imageStatus === 'failed' || imageStatus === 'partial';
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const shouldReduceMotion = reduceMotion || systemReduceMotion;
  const [heroWidth, setHeroWidth] = useState(0);
  const [heroHeight, setHeroHeight] = useState(0);
  const [compareRatio, setCompareRatio] = useState(INITIAL_COMPARE_RATIO);
  const [afterLoaded, setAfterLoaded] = useState(false);
  const [afterLoadFailed, setAfterLoadFailed] = useState(false);
  const isLoading =
    isServerGenerating ||
    (imageStatus === 'completed' && !afterLoaded && !afterLoadFailed);
  const [visibleAuraLetters, setVisibleAuraLetters] = useState(
    reduceMotion && isLoading ? AURA_LETTERS.length : 0,
  );
  const compareRatioRef = useRef(compareRatio);
  const gestureStartRatioRef = useRef(compareRatio);
  const heroWidthRef = useRef(heroWidth);
  const comparePosition = useRef(new Animated.Value(0)).current;
  const afterOpacity = useRef(new Animated.Value(0)).current;
  const afterImageKey = useMemo(() => JSON.stringify(afterImage), [afterImage]);
  const afterLoadEpochKey = `${afterImageKey}:${imageStatus}`;
  const afterLoadEpochKeyRef = useRef(afterLoadEpochKey);
  const dividerLeft = useMemo(
    () => Animated.subtract(comparePosition, 24),
    [comparePosition],
  );
  const beforeClipTranslateX = useMemo(
    () => Animated.multiply(comparePosition, -1),
    [comparePosition],
  );
  const sourceFrame = alignmentMetadata?.source;
  const sourceImageWidth = sourceFrame?.imageSize.width ?? 0;
  const sourceImageHeight = sourceFrame?.imageSize.height ?? 0;
  const heroAspectRatio = sourceImageWidth > 0 && sourceImageHeight > 0
    ? sourceImageWidth / sourceImageHeight
    : undefined;
  const displayTitle = title?.trim();

  const canCompare = imageStatus === 'completed' && afterLoaded && !afterLoadFailed;

  const updateCompareRatio = useCallback((nextRatio: number, commitState = false) => {
    const clampedRatio = clampFinalCompareRatio(nextRatio);
    compareRatioRef.current = clampedRatio;
    comparePosition.setValue(clampedRatio * heroWidthRef.current);
    if (commitState) {
      setCompareRatio(clampedRatio);
    }
  }, [comparePosition]);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (active) setSystemReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isLoading) {
      setVisibleAuraLetters(0);
      return undefined;
    }

    if (shouldReduceMotion) {
      setVisibleAuraLetters(AURA_LETTERS.length);
      return undefined;
    }

    setVisibleAuraLetters(1);
    const intervalId = setInterval(() => {
      setVisibleAuraLetters((current) =>
        current >= AURA_LETTERS.length ? 1 : current + 1,
      );
    }, 420);

    return () => clearInterval(intervalId);
  }, [isLoading, shouldReduceMotion]);

  useLayoutEffect(() => {
    afterLoadEpochKeyRef.current = afterLoadEpochKey;
    setAfterLoaded(false);
    setAfterLoadFailed(false);
    onReadyChange?.(false);
    compareRatioRef.current = INITIAL_COMPARE_RATIO;
    setCompareRatio(INITIAL_COMPARE_RATIO);
    comparePosition.setValue(INITIAL_COMPARE_RATIO * heroWidthRef.current);
    afterOpacity.stopAnimation();
    afterOpacity.setValue(0);
  }, [afterLoadEpochKey, afterOpacity, comparePosition, onReadyChange]);

  useEffect(() => {
    afterOpacity.stopAnimation();
    onReadyChange?.(false);

    if (!canCompare) {
      afterOpacity.setValue(0);
      return undefined;
    }

    if (shouldReduceMotion) {
      afterOpacity.setValue(1);
      onReadyChange?.(true);
      return undefined;
    }

    let active = true;
    afterOpacity.setValue(0);
    const animation = Animated.timing(afterOpacity, {
      duration: 650,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start(({finished}) => {
      if (active && finished) onReadyChange?.(true);
    });

    return () => {
      active = false;
      animation.stop();
    };
  }, [afterOpacity, canCompare, onReadyChange, shouldReduceMotion]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (event, gestureState) => {
          if (!canCompare || heroWidth <= 0 || event.nativeEvent.pageX <= IOS_EDGE_GUARD) {
            return false;
          }

          const horizontalDistance = Math.abs(gestureState.dx);
          const verticalDistance = Math.abs(gestureState.dy);
          return horizontalDistance > 6 && horizontalDistance > verticalDistance * 1.2;
        },
        onPanResponderGrant: () => {
          gestureStartRatioRef.current = compareRatioRef.current;
        },
        onPanResponderMove: (_event, gestureState) => {
          updateCompareRatio(gestureStartRatioRef.current + gestureState.dx / heroWidth);
        },
        onPanResponderRelease: () => {
          setCompareRatio(compareRatioRef.current);
        },
        onPanResponderTerminate: () => {
          setCompareRatio(compareRatioRef.current);
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [canCompare, heroWidth, updateCompareRatio],
  );

  const handleCompareTap = (event: GestureResponderEvent) => {
    if (!canCompare || heroWidth <= 0 || event.nativeEvent.locationX <= IOS_EDGE_GUARD) {
      return;
    }

    updateCompareRatio(event.nativeEvent.locationX / heroWidth, true);
  };

  const handleAccessibilityAction = (event: {
    nativeEvent: {actionName: string};
  }) => {
    if (event.nativeEvent.actionName === 'increment') {
      updateCompareRatio(compareRatioRef.current + 0.05, true);
    } else if (event.nativeEvent.actionName === 'decrement') {
      updateCompareRatio(compareRatioRef.current - 0.05, true);
    }
  };

  const displayError = afterLoadFailed
    ? '생성된 이미지를 불러오지 못했어요.'
    : imageError?.trim();
  const showFailure = isIncomplete || afterLoadFailed;

  return (
    <View
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        const nextHeight = event.nativeEvent.layout.height;
        heroWidthRef.current = nextWidth;
        comparePosition.setValue(compareRatioRef.current * nextWidth);
        setHeroWidth(nextWidth);
        setHeroHeight(nextHeight);
      }}
      style={[styles.hero, heroAspectRatio ? {aspectRatio: heroAspectRatio} : null]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.imageClip]}>
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <View style={[styles.placeholderGlow, styles.placeholderGlowTop]} />
          <View style={[styles.placeholderGlow, styles.placeholderGlowBottom]} />
          <Text style={styles.placeholderMark}>AURA</Text>
        </View>

        {imageStatus === 'completed' ? (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, {opacity: afterOpacity}]}
          >
            <AlignedHeroImageLayer
              alignmentFrame={alignmentMetadata?.generated}
              key={afterLoadEpochKey}
              referenceFrame={sourceFrame}
              onLoad={() => {
                if (afterLoadEpochKeyRef.current !== afterLoadEpochKey) return;
                setAfterLoadFailed(false);
                setAfterLoaded(true);
              }}
              onError={() => {
                if (afterLoadEpochKeyRef.current !== afterLoadEpochKey) return;
                setAfterLoaded(false);
                setAfterLoadFailed(true);
              }}
              recyclingKey={afterLoadEpochKey}
              source={afterImage}
              viewportHeight={heroHeight}
              viewportWidth={heroWidth}
            />
          </Animated.View>
        ) : beforeImageUri?.trim() ? (
          <AlignedHeroImageLayer
            alignmentFrame={sourceFrame}
            referenceFrame={sourceFrame}
            source={{uri: beforeImageUri}}
            viewportHeight={heroHeight}
            viewportWidth={heroWidth}
          />
        ) : null}

        {canCompare && beforeImageUri?.trim() ? (
          <Animated.View style={[styles.beforeClip, {left: comparePosition}]}>
            <Animated.View
              style={[
                styles.beforeClipCanvas,
                {
                  transform: [{translateX: beforeClipTranslateX}],
                  width: heroWidth || '100%',
                },
              ]}
            >
              <AlignedHeroImageLayer
                alignmentFrame={sourceFrame}
                referenceFrame={sourceFrame}
                source={{uri: beforeImageUri}}
                viewportHeight={heroHeight}
                viewportWidth={heroWidth}
              />
            </Animated.View>
          </Animated.View>
        ) : null}
      </View>

      {displayTitle && imageStatus === 'completed' ? (
        <View pointerEvents="none" style={styles.titleOverlay}>
          <Text numberOfLines={2} style={styles.titleText}>{displayTitle}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityLabel="추천 메이크업 이미지 생성 중"
          style={styles.stateOverlay}
        >
          <View style={styles.auraRow}>
            {AURA_LETTERS.map((letter, index) => (
              <Text
                key={`${letter}-${index}`}
                style={[
                  styles.auraLetter,
                  index >= visibleAuraLetters && styles.auraLetterWaiting,
                ]}
              >
                {letter}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {showFailure ? (
        <View accessibilityLiveRegion="polite" style={styles.failureOverlay}>
          <View style={styles.failureCard}>
            <Text style={styles.failureTitle}>
              {imageStatus === 'partial'
                ? '이미지 생성을 마치지 못했어요'
                : '추천 이미지를 불러오지 못했어요'}
            </Text>
            {displayError ? (
              <Text numberOfLines={2} style={styles.failureBody}>
                {displayError}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="추천 이미지 다시 생성"
              onPress={onRetry}
              style={({pressed}) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {canCompare ? (
        <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
          <Pressable
            accessible={false}
            onPress={handleCompareTap}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.compareLabels}>
            <Text style={styles.compareLabel}>추천 메이크업</Text>
            <Text style={styles.compareLabel}>분석 사진</Text>
          </View>
          <Animated.View
            accessible
            accessibilityActions={[
              {name: 'increment', label: '추천 메이크업 더 보기'},
              {name: 'decrement', label: '분석 사진 더 보기'},
            ]}
            accessibilityLabel="메이크업 전후 비교 슬라이더"
            accessibilityRole="adjustable"
            accessibilityValue={{
              min: Math.round(MIN_COMPARE_RATIO * 100),
              max: Math.round(MAX_COMPARE_RATIO * 100),
              now: Math.round(compareRatio * 100),
              text: `추천 메이크업 ${Math.round(compareRatio * 100)}퍼센트`,
            }}
            onAccessibilityAction={handleAccessibilityAction}
            style={[styles.dividerHitArea, {left: dividerLeft}]}
          >
            <View style={styles.dividerLine} />
            <View style={styles.dividerKnob}>
              <Text style={styles.dividerIcon}>‹›</Text>
            </View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    width: '100%',
    aspectRatio: 0.84,
    minHeight: 360,
    maxHeight: 470,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#D8DAE2',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#D9DBE3',
  },
  placeholderGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  placeholderGlowTop: {
    top: -90,
    right: -70,
  },
  placeholderGlowBottom: {
    bottom: -120,
    left: -60,
    backgroundColor: 'rgba(193,201,224,0.58)',
  },
  placeholderMark: {
    color: 'rgba(64,70,88,0.42)',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 8,
  },
  imageClip: {
    borderRadius: 28,
    overflow: 'hidden',
  },

  beforeClip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  beforeClipCanvas: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  titleOverlay: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  titleText: {
    maxWidth: '84%',
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.72)',
    textShadowOffset: {
      width: 0,
      height: 1,
    },
    textShadowRadius: 5,
  },

  stateOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: 'rgba(229,237,233,0.96)',
  },
  auraRow: {
    flexDirection: 'row',
    gap: 12,
  },
  auraLetter: {
    minWidth: 23,
    color: '#788A80',
    fontSize: 34,
    fontWeight: '300',
    textAlign: 'center',
  },
  auraLetterWaiting: {
    color: 'rgba(120,138,128,0.26)',
  },
  failureOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(20,24,34,0.3)',
  },
  failureCard: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    borderRadius: 20,
    backgroundColor: 'rgba(244,246,251,0.92)',
  },
  failureTitle: {
    color: '#161A26',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  failureBody: {
    marginTop: 7,
    color: '#5F6574',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 14,
    minWidth: 112,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: '#141A2B',
  },
  retryButtonPressed: {
    opacity: 0.78,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  compareLabels: {
    position: 'absolute',
    top: 16,
    right: 14,
    left: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compareLabel: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(13,17,28,0.48)',
  },
  dividerHitArea: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.96)',

  },
  dividerKnob: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(20,26,43,0.08)',
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.96)',

  },
  dividerIcon: {
    color: '#151B2C',
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
