import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { color, font, radius } from '../reportTokens';

interface Props { title: string; desc: string; ctaLabel: string; onOpen: () => void }

/** S2 region lens bar — appears under the photo when a band is tapped. */
export function RegionLens({ title, desc, ctaLabel, onOpen }: Props) {
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={{
      marginTop: 10, backgroundColor: color.accentWash, borderWidth: 1, borderColor: color.lensBorder,
      borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 13,
      flexDirection: 'row', alignItems: 'center', gap: 10,
    }}>
      <View style={{ backgroundColor: color.surface, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
        <Text style={[font(10.5, '800'), { color: color.accentDeep }]}>{title}</Text>
      </View>
      <Text style={[font(11.5, '400', 1.5), { color: color.body, flex: 1 }]}>{desc}</Text>
      <Pressable onPress={onOpen} style={({ pressed }) => ({
        backgroundColor: color.accent, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12,
        opacity: pressed ? 0.85 : 1,
      })}>
        <Text style={[font(11, '800'), { color: color.white }]}>{ctaLabel}</Text>
      </Pressable>
    </Animated.View>
  );
}
