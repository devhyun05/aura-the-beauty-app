import React from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { color, font, pct, radius, shadow } from '../reportTokens';
import type { SpectrumAxisData } from '../reportTypes';
import { StatusChip } from './Badge';

export const RAIL_H = 10;
export const MARKER = 16;

/** Bare rail track: point marker / boundary band / withheld (dimmed, no marker). */
export type SpectrumGradientColors = readonly [string, string, ...string[]];

export function RailTrack({ state, height = RAIL_H, markerSize = MARKER, gradientColors }: {
  state: SpectrumAxisData['state']; height?: number; markerSize?: number;
  gradientColors?: SpectrumGradientColors;
}) {
  const withheld = state.kind === 'withheld';
  return (
    <View style={{ height, borderRadius: radius.pill, backgroundColor: color.rail, opacity: withheld ? 0.45 : 1, overflow: 'visible' }}>
      {gradientColors ? (
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ borderRadius: radius.pill, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
        />
      ) : null}
      <View style={{
        position: 'absolute', left: '50%', top: 2, bottom: 2, width: 1,
        backgroundColor: gradientColors ? 'rgba(255,255,255,0.72)' : color.tick,
      }} />
      {state.kind === 'point' && (
        <View style={[{
          position: 'absolute', left: pct(state.position * 100), top: height / 2,
          width: markerSize, height: markerSize, marginLeft: -markerSize / 2, marginTop: -markerSize / 2,
          borderRadius: markerSize / 2, backgroundColor: color.magenta, borderWidth: 3, borderColor: color.white,
        }, shadow.marker]} />
      )}
      {state.kind === 'band' && (
        <View style={{
          position: 'absolute', left: pct(state.start * 100), width: pct(state.width * 100), top: -3, bottom: -3,
          borderRadius: 8, backgroundColor: color.markerBand,
          borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.markerBandBorder,
        }} />
      )}
    </View>
  );
}

/** Full labeled spectrum row: end labels (+ optional centered axis label), track, caption. */
export function SpectrumRail({ axis, gap = 7, gradientColors }: {
  axis: SpectrumAxisData;
  gap?: number;
  gradientColors?: SpectrumGradientColors;
}) {
  return (
    <View style={{ gap }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={[font(12, '600'), { color: color.text, flex: 1 }]}>{axis.leftLabel}</Text>
        <Text style={[font(11, '700', undefined, 0.66), { color: color.muted, textAlign: 'center', width: 52 }]}>
          {axis.axisLabel ?? ''}
        </Text>
        <Text style={[font(12, '600'), { color: color.text, flex: 1, textAlign: 'right' }]}>{axis.rightLabel}</Text>
      </View>
      <RailTrack state={axis.state} gradientColors={gradientColors} />
      {axis.caption != null && (
        axis.statusChip ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <StatusChip label={axis.statusChip} />
            <Text style={[font(11.5, '400', 1.5), { color: color.muted, flex: 1 }]}>{axis.caption}</Text>
          </View>
        ) : (
          <Text style={[font(11.5, '400', 1.5), { color: color.muted }]}>{axis.caption}</Text>
        )
      )}
    </View>
  );
}
