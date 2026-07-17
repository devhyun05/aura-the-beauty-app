import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { color, font } from '../reportTokens';
import type { PhotoSlotData } from '../reportTypes';
import { Hatch } from './Hatch';

interface Props {
  slot: PhotoSlotData;
  shape?: 'rect' | 'circle';
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Photo slot: renders the image when `uri` is present, otherwise the design's hatched placeholder. */
export function PhotoSlot({ slot, shape = 'rect', radius = 0, style }: Props) {
  const br = shape === 'circle' ? 999 : radius;
  return (
    <View style={[{ borderRadius: br, overflow: 'hidden', backgroundColor: color.hatchB }, style]}>
      {slot.uri ? (
        <Image source={{ uri: slot.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
      ) : (
        <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          <Hatch colorA={color.hatchC} colorB={color.bg} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <Text style={[font(9.5, '400', 1.5), { color: color.faint, textAlign: 'center' }]}>{slot.placeholderLabel}</Text>
        </View>
      )}
    </View>
  );
}
