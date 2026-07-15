import {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet} from 'react-native';
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
  const [action, setAction] = useState<{label: string; onPress: () => void} | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = null;
    opacity.setValue(0);
    setMessage(null);
    setAction(null);
  }, [opacity]);

  const showToast = useCallback((
    nextMessage: string,
    nextAction?: {label: string; onPress: () => void},
  ) => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
    }

    setMessage(nextMessage);
    setAction(nextAction ?? null);
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
      }).start(() => {
        setMessage(null);
        setAction(null);
      });
    }, durationMs);
  }, [durationMs, opacity]);

  useEffect(() => () => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
    }
  }, []);

  const toast = message ? (
    <Animated.View pointerEvents={action ? 'auto' : 'none'} style={[styles.toast, {opacity}]}>
      <Text style={styles.toastText}>{message}</Text>
      {action ? (
        <Pressable
          accessibilityLabel={action.label}
          accessibilityRole="button"
          onPress={() => {
            const onPress = action.onPress;
            dismissToast();
            onPress();
          }}
          style={styles.action}>
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}
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
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    position: 'absolute',
    zIndex: 200,
  },
  toastText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textDecorationLine: 'underline',
  },
});
