import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { color, font, radius } from '../reportTokens';

type Variant = 'dark' | 'accent' | 'lightDashed';
interface Props { label: string; variant: Variant; style?: StyleProp<ViewStyle> }

/** Overlay label pill used on photos. `dark` reproduces the HTML's backdrop-blur pill via expo-blur. */
export function Pill({ label, variant, style }: Props) {
  if (variant === 'dark') {
    return (
      <View style={[{ borderRadius: radius.pill, overflow: 'hidden', alignSelf: 'flex-start' }, style]}>
        <BlurView intensity={12} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.overlayDark }} />
        <Text style={[font(10, '700'), { color: color.white, paddingVertical: 3, paddingHorizontal: 9 }]}>{label}</Text>
      </View>
    );
  }
  if (variant === 'accent') {
    return (
      <View style={[{ borderRadius: radius.pill, backgroundColor: color.overlayAccent, alignSelf: 'flex-start' }, style]}>
        <Text style={[font(10.5, '700'), { color: color.white, paddingVertical: 3, paddingHorizontal: 10 }]}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={[{
      borderRadius: radius.pill, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.85)',
      borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(22,48,59,0.35)',
    }, style]}>
      <Text style={[font(10, '700'), { color: color.body, paddingVertical: 3, paddingHorizontal: 9 }]}>{label}</Text>
    </View>
  );
}
