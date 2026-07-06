import {MoveHorizontal} from 'lucide-react-native';
import {useRef, useState} from 'react';
import {Image, PanResponder, StyleSheet, View as RNView} from 'react-native';
import type {ImageSourcePropType} from 'react-native';
import {Text} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';

const MIN_RATIO = 0.05;
const MAX_RATIO = 0.95;

/**
 * 비포애프터 비교 슬라이더.
 * 두 이미지를 겹쳐놓고 드래그(또는 탭)로 경계선을 옮겨 전/후를 비교한다.
 * 의존성 없이 PanResponder + 너비 클리핑으로 구현.
 */
export function BeforeAfterSlider({
  afterSource,
  beforeSource,
  onFirstInteract,
}: {
  afterSource: ImageSourcePropType;
  beforeSource: ImageSourcePropType;
  onFirstInteract?: () => void;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [ratio, setRatio] = useState(0.5);
  const hasInteractedRef = useRef(false);
  const onFirstInteractRef = useRef(onFirstInteract);
  const ratioRef = useRef(0.5);
  const startRatioRef = useRef(0.5);
  const widthRef = useRef(0);

  onFirstInteractRef.current = onFirstInteract;

  const setClampedRatio = (nextRatio: number) => {
    const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, nextRatio));
    ratioRef.current = clamped;
    setRatio(clamped);
  };

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: event => {
      if (!hasInteractedRef.current) {
        hasInteractedRef.current = true;
        onFirstInteractRef.current?.();
      }
      // 탭한 지점으로 즉시 이동한 뒤, 이어지는 드래그의 기준점으로 삼는다.
      if (widthRef.current > 0) {
        setClampedRatio(event.nativeEvent.locationX / widthRef.current);
      }
      startRatioRef.current = ratioRef.current;
    },
    onPanResponderMove: (_event, gesture) => {
      if (widthRef.current > 0) {
        setClampedRatio(startRatioRef.current + gesture.dx / widthRef.current);
      }
    },
    onStartShouldSetPanResponder: () => true,
    // 세로 스크롤보다 슬라이더 조작을 우선한다(이미지 영역 안에서만).
    onPanResponderTerminationRequest: () => false,
  })).current;

  const dividerX = containerWidth * ratio;

  return (
    <RNView
      accessibilityHint="좌우로 드래그하면 메이크업 전후를 비교할 수 있어요"
      accessibilityLabel="비포애프터 비교 슬라이더"
      style={styles.container}
      onLayout={event => {
        widthRef.current = event.nativeEvent.layout.width;
        setContainerWidth(event.nativeEvent.layout.width);
      }}
      {...panResponder.panHandlers}>
      <Image resizeMode="cover" source={afterSource} style={styles.fullImage} />

      {containerWidth > 0 ? (
        <RNView style={[styles.beforeClip, {width: dividerX}]}>
          <Image
            resizeMode="cover"
            source={beforeSource}
            style={[styles.fullImage, {width: containerWidth}]}
          />
        </RNView>
      ) : null}

      <Text style={[styles.roleLabel, styles.beforeLabel]}>BEFORE</Text>
      <Text style={[styles.roleLabel, styles.afterLabel]}>AFTER</Text>

      {containerWidth > 0 ? (
        <>
          <RNView pointerEvents="none" style={[styles.divider, {left: dividerX - 1}]} />
          <RNView pointerEvents="none" style={[styles.handle, {left: dividerX - 18}]}>
            <MoveHorizontal color={colors.textPrimary} size={iconSize.xs} strokeWidth={2.4} />
          </RNView>
        </>
      ) : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  afterLabel: {
    right: spacing.md,
  },
  beforeClip: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
  },
  beforeLabel: {
    left: spacing.md,
  },
  container: {
    aspectRatio: 4 / 5,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  divider: {
    backgroundColor: colors.white,
    bottom: 0,
    position: 'absolute',
    top: 0,
    width: 2,
  },
  fullImage: {
    height: '100%',
    width: '100%',
  },
  handle: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    ...{
      elevation: 4,
      shadowColor: colors.black,
      shadowOffset: {height: 2, width: 0},
      shadowOpacity: 0.24,
      shadowRadius: 6,
    },
  },
  roleLabel: {
    backgroundColor: 'rgba(17, 17, 17, 0.5)',
    borderRadius: radius.pill,
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.md,
  },
});
