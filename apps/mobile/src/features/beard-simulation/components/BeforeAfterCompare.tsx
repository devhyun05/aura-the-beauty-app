import React, { useMemo, useState } from 'react';
import {
  Image,
  PanResponder,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { Text } from 'tamagui';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { beardColors } from '../tokens/tokens';

type Src = string | number;
const toSource = (s: Src): ImageSourcePropType => (typeof s === 'number' ? s : { uri: s });

/**
 * Before/After compare using the overflow-container pattern (NOT clip-path — RN has no
 * clip-path). A width-clamped container reveals the LEFT part (original); the full-width
 * "after" image sits behind it. Drag wins over scroll via a capturing PanResponder.
 *
 * The divider position is CONTROLLED (kept by the parent across renders).
 */
export function BeforeAfterCompare({
  originalUri,
  afterUri,
  divider,
  onDivider,
  showOriginal = false,
  variant = 'result',
  rightChipLabel = '보정 후',
  handleTopPct = variant === 'result' ? 41 : 46,
  style,
  onDragStateChange,
}: {
  originalUri: Src;
  afterUri: Src;
  divider: number;
  onDivider: (pct: number) => void;
  showOriginal?: boolean;
  variant?: 'result' | 'report';
  rightChipLabel?: string;
  handleTopPct?: number;
  style?: ViewStyle;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const pctFromX = (x: number) => {
    if (size.w <= 0) return divider;
    return Math.max(8, Math.min(92, (x / size.w) * 100));
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Capture horizontal drags so the compare wins over any parent ScrollView.
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 3,
        onPanResponderGrant: (e) => {
          onDragStateChange?.(true);
          onDivider(pctFromX(e.nativeEvent.locationX));
        },
        onPanResponderMove: (e) => {
          onDivider(pctFromX(e.nativeEvent.locationX));
        },
        onPanResponderRelease: () => onDragStateChange?.(false),
        onPanResponderTerminate: () => onDragStateChange?.(false),
      }),
    // pctFromX depends on size.w; recreate when it changes.
    [size.w, onDivider],
  );

  const clipWidth = showOriginal ? size.w : (divider / 100) * size.w;
  const chipVisible = !showOriginal;

  const isResult = variant === 'result';
  const handleSize = isResult ? 42 : 36;
  const chipTop = isResult ? 122 : 14;
  const chipRadius = isResult ? 9 : 8;
  const chipFont = isResult ? 12.5 : 11.5;
  const chipPadX = isResult ? 12 : 10;
  const chipPadY = isResult ? 6 : 5;

  return (
    <View style={[{ overflow: 'hidden' }, style]} onLayout={onLayout} {...pan.panHandlers}>
      {/* After (beard-removed) image fills the whole area */}
      <Image
        source={toSource(afterUri)}
        resizeMode="cover"
        style={{ position: 'absolute', top: 0, left: 0, width: size.w, height: size.h }}
      />

      {/* Original, revealed on the LEFT via width-clamped overflow container */}
      <View style={{ position: 'absolute', top: 0, left: 0, height: size.h, width: clipWidth, overflow: 'hidden' }}>
        <Image
          source={toSource(originalUri)}
          resizeMode="cover"
          style={{ position: 'absolute', top: 0, left: 0, width: size.w, height: size.h }}
        />
      </View>

      {/* Divider line + handle */}
      {chipVisible ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: 'rgba(255,255,255,0.92)',
            left: `${divider}%`,
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: `${handleTopPct}%`,
              left: '50%',
              width: handleSize,
              height: handleSize,
              borderRadius: handleSize / 2,
              backgroundColor: beardColors.lavenderBright,
              transform: [{ translateX: -handleSize / 2 }, { translateY: -handleSize / 2 }],
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.4,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 3 },
              elevation: 4,
              flexDirection: 'row',
            }}
          >
            <ChevronLeft size={isResult ? 18 : 15} color={beardColors.onLavender} strokeWidth={2.4} style={{ marginRight: -6 }} />
            <ChevronRight size={isResult ? 18 : 15} color={beardColors.onLavender} strokeWidth={2.4} style={{ marginLeft: -6 }} />
          </View>
        </View>
      ) : null}

      {/* Chips */}
      {chipVisible ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: chipTop,
              left: isResult ? 16 : 14,
              paddingHorizontal: chipPadX,
              paddingVertical: chipPadY,
              borderRadius: chipRadius,
              backgroundColor: 'rgba(15,17,20,0.72)',
            }}
          >
            <Text fontSize={chipFont} fontWeight="600" color={beardColors.textPrimary}>
              현재
            </Text>
          </View>
          <View
            style={{
              position: 'absolute',
              top: chipTop,
              right: isResult ? 16 : 14,
              paddingHorizontal: chipPadX,
              paddingVertical: chipPadY,
              borderRadius: chipRadius,
              backgroundColor: beardColors.lavenderBright,
            }}
          >
            <Text fontSize={chipFont} fontWeight="700" color={beardColors.onLavender} numberOfLines={1}>
              {rightChipLabel}
            </Text>
          </View>
        </>
      ) : null}

      {/* "원본 보는 중" center chip (result variant only) */}
      {showOriginal && isResult ? (
        <View
          style={{
            position: 'absolute',
            top: 122,
            left: '50%',
            transform: [{ translateX: -55 }],
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: 'rgba(15,17,20,0.78)',
            borderWidth: 1,
            borderColor: 'rgba(184,164,255,0.5)',
          }}
        >
          <Text fontSize={12.5} fontWeight="600" color={beardColors.lavenderText}>
            원본 보는 중
          </Text>
        </View>
      ) : null}
    </View>
  );
}
