import {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, StyleSheet} from 'react-native';
import {Text} from 'tamagui';

import {colors, radius, spacing, typography} from '../theme';

const SHOW_DURATION_MS = 160;
const HIDE_DURATION_MS = 200;

/**
 * 화면 하단에 잠깐 떠났다 사라지는 토스트.
 * 반환된 `toast` 노드를 화면 트리 마지막에 렌더하고, `showToast(message)`로 띄운다.
 * 같은 메시지를 연타해도 타이머만 리셋돼 중복 표시되지 않는다.
 */
export function useTransientToast(durationMs = 1500) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((nextMessage: string) => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
    }

    setMessage(nextMessage);
    Animated.timing(opacity, {
      duration: SHOW_DURATION_MS,
      toValue: 1,
      useNativeDriver: true,
    }).start();

    hideTimeout.current = setTimeout(() => {
      Animated.timing(opacity, {
        duration: HIDE_DURATION_MS,
        toValue: 0,
        useNativeDriver: true,
      }).start(() => setMessage(null));
    }, durationMs);
  }, [durationMs, opacity]);

  useEffect(() => () => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
    }
  }, []);

  const toast = message ? (
    <Animated.View pointerEvents="none" style={[styles.toast, {opacity}]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  ) : null;

  return {showToast, toast};
}

const styles = StyleSheet.create({
  toast: {
    alignSelf: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.88)',
    borderRadius: radius.pill,
    bottom: 104,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    position: 'absolute',
  },
  toastText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
