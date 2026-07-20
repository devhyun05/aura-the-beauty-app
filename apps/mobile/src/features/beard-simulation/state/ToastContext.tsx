import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Text, XStack } from 'tamagui';
import { Check } from 'lucide-react-native';
import { beardColors, beardRadius, beardTiming } from '../tokens/tokens';

/**
 * Top toast (position: top 124). Dark glass pill, blur 14, 1px border.
 * check = lavender / error = danger. Optional "다시 시도" retry action.
 */

export type ToastKind = 'ok' | 'err';

interface ToastState {
  kind: ToastKind;
  msg: string;
  retry?: () => void;
}

interface ToastApi {
  show(kind: ToastKind, msg: string, ms?: number, retry?: () => void): void;
  hide(): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const hide = useCallback(() => {
    clear();
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() =>
      setToast(null),
    );
  }, [clear, opacity]);

  const show = useCallback<ToastApi['show']>(
    (kind, msg, ms = beardTiming.toastDefault, retry) => {
      clear();
      setToast({ kind, msg, retry });
      opacity.setValue(0);
      translateY.setValue(-8);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(hide, ms);
    },
    [clear, hide, opacity, translateY],
  );

  useEffect(() => () => clear(), [clear]);

  return (
    <ToastContext.Provider value={{ show, hide }}>
      <View style={{ flex: 1 }}>
        {children}
        {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            top: 124,
            alignItems: 'center',
            zIndex: 90,
            opacity,
            transform: [{ translateY }],
          }}
        >
          <BlurView
            intensity={28}
            tint="dark"
            style={{
              borderRadius: beardRadius.pill,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: beardColors.glassBorder,
              maxWidth: '100%',
            }}
          >
            <XStack
              alignItems="center"
              gap={9}
              px={16}
              py={11}
              bg="rgba(24,27,32,0.72)"
              maxWidth="100%"
            >
              {toast.kind === 'ok' ? (
                <Check size={15} color={beardColors.lavender} strokeWidth={2.8} />
              ) : (
                <Text
                  width={16}
                  height={16}
                  borderRadius={8}
                  bg="rgba(229,72,77,0.2)"
                  color="#FF9B98"
                  fontSize={11}
                  fontWeight="800"
                  textAlign="center"
                  lineHeight={16}
                >
                  !
                </Text>
              )}
              <Text
                fontSize={13}
                fontWeight="600"
                color={beardColors.textPrimary}
                lineHeight={18}
                flexShrink={1}
              >
                {toast.msg}
              </Text>
              {toast.retry ? (
                <Pressable
                  onPress={() => {
                    const fn = toast.retry;
                    hide();
                    fn?.();
                  }}
                >
                  <Text
                    fontSize={13}
                    fontWeight="700"
                    color={beardColors.lavenderBright}
                    textDecorationLine="underline"
                  >
                    다시 시도
                  </Text>
                </Pressable>
              ) : null}
            </XStack>
          </BlurView>
        </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
