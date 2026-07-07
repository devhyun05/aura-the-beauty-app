import {Heart, ImageOff} from 'lucide-react-native';
import {useRef, useState} from 'react';
import {
  Animated,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {Text, View, XStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {getCommunityMockImageSource} from '../mocks/community.mock';
import type {CommunityMedia} from '../types';

const DOUBLE_TAP_WINDOW_MS = 300;

/**
 * 전폭 4:5 페이저 캐러셀.
 * 스펙: 캐러셀 내부는 가로 팬 전유, 페이저 pill은 내부 하단 중앙, 더블탭 = 좋아요.
 */
export function ThreadImageCarousel({
  media,
  onDoubleTap,
}: {
  media: CommunityMedia[];
  onDoubleTap?: () => void;
}) {
  const {width} = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        pagingEnabled
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumScrollEnd}
        showsHorizontalScrollIndicator={false}>
        {media.map(item => (
          <CarouselFrame key={item.id} item={item} width={width} onDoubleTap={onDoubleTap} />
        ))}
      </ScrollView>

      {media.length > 1 ? (
        <XStack style={styles.pager}>
          <Text
            accessibilityLabel={`${media.length}장 중 ${Math.min(activeIndex + 1, media.length)}번째 사진`}
            style={styles.pagerText}>
            {Math.min(activeIndex + 1, media.length)} / {media.length}
          </Text>
        </XStack>
      ) : null}
    </View>
  );
}

function CarouselFrame({
  item,
  onDoubleTap,
  width,
}: {
  item: CommunityMedia;
  onDoubleTap?: () => void;
  width: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [hasError, setHasError] = useState(false);
  const burst = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);

  const imageSource = item.imageUrl || item.cdnUrl
    ? {uri: item.imageUrl ?? item.cdnUrl ?? ''}
    : getCommunityMockImageSource(item.id);

  const runBurst = () => {
    burst.setValue(0);
    Animated.sequence([
      Animated.timing(burst, {duration: 180, toValue: 1, useNativeDriver: true}),
      Animated.delay(150),
      Animated.timing(burst, {duration: 220, toValue: 0, useNativeDriver: true}),
    ]).start();
  };

  const handlePress = () => {
    const now = Date.now();

    if (now - lastTapRef.current < DOUBLE_TAP_WINDOW_MS) {
      lastTapRef.current = 0;
      runBurst();
      onDoubleTap?.();
      return;
    }

    lastTapRef.current = now;
  };

  if (hasError) {
    return (
      <Pressable
        accessibilityLabel="이미지 다시 불러오기"
        accessibilityRole="button"
        style={[styles.frame, styles.errorFrame, {width}]}
        onPress={() => {
          setHasError(false);
          setAttempt(current => current + 1);
        }}>
        <ImageOff color={colors.textTertiary} size={iconSize.lg} strokeWidth={1.8} />
        <Text style={styles.errorText}>다시 불러오기</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel="룩 사진, 두 번 탭하면 좋아요"
      onPress={handlePress}
      style={[styles.frame, {width}]}>
      <Image
        key={attempt}
        resizeMode="cover"
        source={imageSource}
        style={styles.image}
        onError={() => setHasError(true)}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.burstHeart,
          {
            opacity: burst,
            transform: [{
              scale: burst.interpolate({inputRange: [0, 1], outputRange: [0.6, 1.15]}),
            }],
          },
        ]}>
        <Heart color={colors.white} fill={colors.white} size={64} strokeWidth={1} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  burstHeart: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  errorFrame: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  errorText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  frame: {
    aspectRatio: 4 / 5,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  pager: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.5)',
    borderRadius: radius.pill,
    bottom: spacing.md,
    minHeight: 26,
    paddingHorizontal: spacing.sm,
    position: 'absolute',
  },
  pagerText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontVariant: ['tabular-nums'],
    lineHeight: typography.lineHeight.xs,
  },
  wrap: {
    position: 'relative',
  },
});
