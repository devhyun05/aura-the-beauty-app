import React, { useRef } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from 'tamagui';
import { Eye } from 'lucide-react-native';
import { beardColors, beardTiming } from '../tokens/tokens';

/**
 * "원본 보기" — press-and-hold to peek the original; release to revert.
 * A short tap (<260ms) toggles a PINNED state instead (accessibility alternative).
 * Light haptic on hold enter.
 *
 * Parent owns `holding`/`pinned` and passes `showOriginal = holding || pinned`.
 */
export function HoldOriginalButton({
  showOriginal,
  onHoldingChange,
  onTogglePin,
}: {
  showOriginal: boolean;
  onHoldingChange: (holding: boolean) => void;
  onTogglePin: () => void;
}) {
  const t0 = useRef(0);

  return (
    <View style={{ alignItems: 'center', gap: 6, width: 64 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="원본 보기 — 누르고 있는 동안 원본을 보여드려요. 짧게 탭하면 고정돼요."
        accessibilityState={{ selected: showOriginal }}
        onPressIn={() => {
          t0.current = Date.now();
          // TODO(backend): none — haptic is client-side only.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onHoldingChange(true);
        }}
        onPressOut={() => {
          const quick = Date.now() - t0.current < beardTiming.holdShortTapMax;
          onHoldingChange(false);
          if (quick) onTogglePin();
        }}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: showOriginal ? beardColors.lavender : 'rgba(255,255,255,0.25)',
          backgroundColor: showOriginal ? 'rgba(184,164,255,0.18)' : 'rgba(255,255,255,0.05)',
        }}
      >
        <Eye size={24} color={showOriginal ? beardColors.lavenderText : beardColors.textPrimary} strokeWidth={1.8} />
      </Pressable>
      <Text
        fontSize={11}
        textAlign="center"
        lineHeight={14}
        color={showOriginal ? beardColors.lavenderText : beardColors.textSecondary}
      >
        {showOriginal ? '원본 보는 중' : '원본 보기'}
      </Text>
    </View>
  );
}
