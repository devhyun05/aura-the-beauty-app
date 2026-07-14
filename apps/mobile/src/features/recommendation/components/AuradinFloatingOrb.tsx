import {useEffect, useMemo, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, PanResponder, Pressable, StyleSheet, useWindowDimensions, View} from 'react-native';
import {Sparkles} from 'lucide-react-native';
import {Text} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {LinearGradient} from 'expo-linear-gradient';

import * as SecureStore from '../../../shared/services/localSecureStore';
import {iconSize, radius, spacing, typography} from '../../../shared/theme';

const POSITION_KEY = 'aura.productRecommendation.auradinOrbPosition.v1';
const HINT_KEY = 'aura.productRecommendation.auradinOrbHint.v1';
const ORB_SIZE = 52;
const MINI_HIT_SIZE = 44;
const MINI_VISUAL_SIZE = 36;
const BOTTOM_NAV_GUARD = 80;
export const AURADIN_ORB_CONTENT_CLEARANCE = spacing.sm + ORB_SIZE + spacing.sm;

type StoredPosition = {side: 'left' | 'right'; yRatio: number};

export function AuradinFloatingOrb({
  onOpen,
  onSideChange,
  compact = false,
  hidden = false,
}: {
  onOpen: () => void;
  onSideChange?: (side: StoredPosition['side']) => void;
  compact?: boolean;
  hidden?: boolean;
}) {
  const {height, width} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const size = compact ? MINI_HIT_SIZE : ORB_SIZE;
  const visualSize = compact ? MINI_VISUAL_SIZE : ORB_SIZE;
  const position = useRef(new Animated.ValueXY({x: width - ORB_SIZE - spacing.md, y: height * 0.56})).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const [dragEnabled, setDragEnabled] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [motionPreferenceLoaded, setMotionPreferenceLoaded] = useState(false);
  const sideRef = useRef<'left' | 'right'>('right');
  const yRef = useRef(height * 0.56);
  const minY = insets.top + spacing.xl;
  const maxY = Math.max(minY, height - insets.bottom - size - BOTTOM_NAV_GUARD);

  const clampY = (value: number) => Math.max(minY, Math.min(maxY, value));
  const snap = (side: 'left' | 'right', y: number, animated = true) => {
    sideRef.current = side;
    onSideChange?.(side);
    yRef.current = clampY(y);
    const next = {x: side === 'left' ? spacing.sm : width - size - spacing.sm, y: yRef.current};
    if (animated && !reduceMotion) Animated.spring(position, {toValue: next, useNativeDriver: false, damping: 20, stiffness: 220}).start();
    else position.setValue(next);
    void SecureStore.setItemAsync(POSITION_KEY, JSON.stringify({side, yRatio: yRef.current / Math.max(height, 1)} satisfies StoredPosition));
  };

  useEffect(() => {
    let active = true;
    Promise.all([SecureStore.getItemAsync(POSITION_KEY), SecureStore.getItemAsync(HINT_KEY)]).then(([stored, hintSeen]) => {
      if (!active) return;
      if (!hintSeen) setHintVisible(true);
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored) as StoredPosition;
        if ((parsed.side === 'left' || parsed.side === 'right') && Number.isFinite(parsed.yRatio)) {
          snap(parsed.side, parsed.yRatio * height, false);
        }
      } catch {
        snap('right', height * 0.56, false);
      }
    });
    return () => {active = false;};
    // Position is intentionally restored once per viewport size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, width]);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active) {
        setReduceMotion(value);
        setMotionPreferenceLoaded(true);
      }
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      setReduceMotion(value);
      setMotionPreferenceLoaded(true);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!motionPreferenceLoaded) return;
    entrance.stopAnimation();
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }
    entrance.setValue(0.82);
    Animated.spring(entrance, {
      damping: 18,
      stiffness: 210,
      toValue: 1,
      useNativeDriver: false,
    }).start();
  }, [entrance, motionPreferenceLoaded, reduceMotion]);

  useEffect(() => {
    const nextY = clampY(yRef.current);
    yRef.current = nextY;
    position.setValue({
      x: sideRef.current === 'left' ? spacing.sm : width - size - spacing.sm,
      y: nextY,
    });
    // Only reflow the current edge position when the compact touch target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => dragEnabled && (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2),
      onPanResponderMove: (_, gesture) => {
        position.setValue({x: Math.max(spacing.sm, Math.min(width - size - spacing.sm, (sideRef.current === 'left' ? spacing.sm : width - size - spacing.sm) + gesture.dx)), y: clampY(yRef.current + gesture.dy)});
      },
      onPanResponderRelease: (_, gesture) => {
        const currentX = (sideRef.current === 'left' ? spacing.sm : width - size - spacing.sm) + gesture.dx;
        snap(currentX + size / 2 < width / 2 ? 'left' : 'right', yRef.current + gesture.dy);
        setDragEnabled(false);
      },
      onPanResponderTerminate: () => setDragEnabled(false),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragEnabled, height, size, width],
  );

  const dismissHint = () => {
    if (!hintVisible) return;
    setHintVisible(false);
    void SecureStore.setItemAsync(HINT_KEY, 'seen');
  };

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[styles.host, {
        height: size,
        opacity: hidden ? 0 : entrance,
        width: size,
        transform: [...position.getTranslateTransform(), {scale: entrance}],
      }]}
      {...panResponder.panHandlers}>
      {hintVisible && !compact ? <View pointerEvents="none" style={[styles.hint, sideRef.current === 'right' ? styles.hintRight : styles.hintLeft]}><Text style={styles.hintText}>길게 눌러 위치를 옮길 수 있어요</Text></View> : null}
      <Pressable
        accessibilityActions={[{name: 'activate', label: '아우라딘 열기'}, {name: 'move', label: '아우라딘 위치 이동'}]}
        accessibilityLabel="아우라딘 열기"
        accessibilityHint="길게 눌러 드래그하거나 위치 이동 동작으로 반대쪽 가장자리에 옮길 수 있어요"
        accessibilityRole="button"
        delayLongPress={300}
        onAccessibilityAction={event => {if (event.nativeEvent.actionName === 'move') snap(sideRef.current === 'left' ? 'right' : 'left', yRef.current); else onOpen();}}
        onLongPress={() => {dismissHint(); setDragEnabled(true);}}
        onPress={() => {dismissHint(); if (!dragEnabled) onOpen();}}
        hitSlop={4}
        style={[styles.orb, {borderRadius: visualSize / 2, height: visualSize, width: visualSize}]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.98)', '#E0DCFF', '#F7CDE5']}
          end={{x: 0.88, y: 1}}
          start={{x: 0.12, y: 0}}
          style={styles.jellyFill}>
          <View style={styles.jellyHighlight} />
          <View style={styles.jellyDrop} />
          <View style={styles.orbCore}>
            <Sparkles color="#302A4D" size={compact ? iconSize.xs : iconSize.sm} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {alignItems: 'center', justifyContent: 'center', left: 0, position: 'absolute', shadowColor: '#8C79C7', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.28, shadowRadius: 16, top: 0, zIndex: 100},
  orb: {alignItems: 'center', borderColor: 'rgba(255,255,255,0.94)', borderWidth: 2, justifyContent: 'center', overflow: 'hidden'},
  jellyFill: {alignItems: 'center', height: '100%', justifyContent: 'center', overflow: 'hidden', width: '100%'},
  jellyHighlight: {backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: radius.pill, height: '21%', left: '21%', position: 'absolute', top: '15%', transform: [{rotate: '-24deg'}], width: '38%'},
  jellyDrop: {backgroundColor: 'rgba(169,194,255,0.34)', borderBottomLeftRadius: radius.pill, borderTopRightRadius: radius.pill, bottom: '-8%', height: '48%', position: 'absolute', right: '-4%', transform: [{rotate: '18deg'}], width: '47%'},
  orbCore: {alignItems: 'center', backgroundColor: 'rgba(249,207,229,0.72)', borderBottomLeftRadius: radius.pill, borderBottomRightRadius: radius.md, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.pill, height: '62%', justifyContent: 'center', transform: [{rotate: '-5deg'}], width: '62%'},
  hint: {backgroundColor: '#111111', borderRadius: radius.md, bottom: ORB_SIZE + spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, position: 'absolute', width: 180},
  hintLeft: {left: 0},
  hintRight: {right: 0},
  hintText: {color: '#FFFFFF', fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
});
