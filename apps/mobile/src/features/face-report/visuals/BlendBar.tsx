import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { BlendData } from '../reportTypes';
import { Hatch } from './Hatch';

/** Blend bar: dominant axis as a solid fill, secondary axis as a hatch — no numbers. */
export function BlendBar({ data }: { data: BlendData }) {
  return (
    <View style={{ gap: 7 }}>
      {data.label ? <Text style={[font(12, '600'), { color: color.text }]}>{data.label}</Text> : null}
      <View style={{
        flexDirection: 'row', height: 26, borderRadius: radius.pill, overflow: 'hidden',
        borderWidth: 1, borderColor: color.outline8,
      }}>
        <View style={{ flex: data.dominantRatio, backgroundColor: color.accentLight, justifyContent: 'center', paddingHorizontal: 12 }}>
          <Text numberOfLines={1} style={[font(11.5, '800'), { color: color.accentInk }]}>{data.dominantLabel}</Text>
        </View>
        <View style={{ flex: 1 - data.dominantRatio, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 12 }}>
          <Hatch colorA={color.hatchA} colorB={color.hatchB} stripe={6} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <Text numberOfLines={1} style={[font(11.5, '700'), { color: color.text }]}>{data.secondaryLabel}</Text>
        </View>
      </View>
      {data.caption ? <Text style={[font(11.5, '400', 1.5), { color: color.muted }]}>{data.caption}</Text> : null}
    </View>
  );
}
