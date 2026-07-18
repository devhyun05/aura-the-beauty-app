import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { color, font } from '../reportTokens';
import type { PhotoSlotData } from '../reportTypes';
import { Hatch } from './Hatch';

interface Props {
  slot: PhotoSlotData;
  shape?: 'rect' | 'circle' | 'oval';
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Photo slot: renders the image when `uri` is present, otherwise the design's hatched placeholder. */
export function PhotoSlot({ slot, shape = 'rect', radius = 0, style }: Props) {
  const br = shape === 'circle' || shape === 'oval' ? 999 : radius;
  const c = slot.cropRect;
  const hasCrop = !!c && c.w > 0 && c.h > 0;
  return (
    <View style={[{ borderRadius: br, overflow: 'hidden', backgroundColor: color.hatchB }, style]}>
      {slot.uri && hasCrop && c ? (
        <View style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <Image
            source={{ uri: slot.uri }}
            contentFit="cover"
            transition={150}
            style={{
              position: 'absolute',
              width: `${100 / c.w}%`,
              height: `${100 / c.h}%`,
              left: `${(-c.x * 100) / c.w}%`,
              top: `${(-c.y * 100) / c.h}%`,
            }}
          />
        </View>
      ) : slot.uri ? (
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
