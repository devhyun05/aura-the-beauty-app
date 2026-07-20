import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from 'tamagui';
import { Check } from 'lucide-react-native';
import { beardColors } from '../tokens/tokens';

/** Step 1 single-select row: full-width, 22px black check circle when selected. */
export function SelectRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: 18,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: selected ? beardColors.lightText : beardColors.lightBorder,
        backgroundColor: selected ? beardColors.lightSelectedBg : beardColors.lightBg,
      }}
    >
      <Text flex={1} fontSize={15} fontWeight="600" color={beardColors.lightText} lineHeight={21}>
        {label}
      </Text>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: beardColors.lightText,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: selected ? 1 : 0,
        }}
      >
        <Check size={12} color="#FFFFFF" strokeWidth={3} />
      </View>
    </Pressable>
  );
}

/** Pill chip (survey step 2/3). Selected = black border + light-selected bg. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingHorizontal: 17,
        paddingVertical: 12,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: selected ? beardColors.lightText : beardColors.lightBorder,
        backgroundColor: selected ? beardColors.lightSelectedBg : beardColors.lightBg,
      }}
    >
      <Text fontSize={14} fontWeight="600" color={selected ? beardColors.lightText : beardColors.lightOptionText}>
        {label}
      </Text>
    </Pressable>
  );
}
