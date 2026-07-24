import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { color, pct, radius, shadow } from '../reportTokens';
import type { BandKey, S2Data } from '../reportTypes';
import {getVerticalThirdsPhotoAspectRatio} from '../../face-ratio/verticalThirdsDisplayGeometry';
import { PhotoSlot } from './PhotoSlot';
import { Pill } from './Pill';

function GuideLine({ y }: { y: number }) {
  return (
    <View pointerEvents="none" style={[{
      position: 'absolute', left: 0, right: 0, top: pct(y * 100), height: 1.5, backgroundColor: color.lineWhite,
    }, shadow.overlayLine]} />
  );
}

function LinePill({ label, y, centered = true }: { label: string; y: number; centered?: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 10, top: pct(y * 100), marginTop: centered ? -10 : 0 }}>
      <Pill variant="dark" label={label} />
    </View>
  );
}

function Band({ active, top, height, restTint, activeTint, onPress }: {
  active: boolean; top: number; height: number; restTint: string; activeTint: string; onPress: () => void;
}) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withTiming(active ? 1 : 0, { duration: 200 }); }, [active, t]);
  const aStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [restTint, activeTint]),
    borderColor: interpolateColor(t.value, [0, 1], ['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)']),
  }));
  return (
    <Pressable onPress={onPress} style={{ position: 'absolute', left: 0, right: 0, top: pct(top * 100), height: pct(height * 100) }}>
      <Animated.View style={[{ flex: 1, borderWidth: 2 }, aStyle]} />
    </Pressable>
  );
}

/**
 * Source-aligned S2 measurement photo with calibration lines, left dark pills,
 * right cyan band pills, and tappable measured-region bands.
 */
export function GuidePhotoOverlay({ data, picked, onPickBand }: {
  data: S2Data;
  picked: BandKey | null;
  onPickBand: (k: BandKey) => void;
}) {
  const press = (k: BandKey) => { Haptics.selectionAsync(); onPickBand(k); };
  const sourceAspectRatio = getVerticalThirdsPhotoAspectRatio({
    height: data.photo.sourceHeight,
    width: data.photo.sourceWidth,
  });
  const hairlineY = data.hairlineMissing ? null : data.hairlineY;
  const measuredBands = data.hairlineMissing
    ? data.bands.filter(band => band.key !== 'upper')
    : data.bands;

  return (
    <View style={{ borderRadius: radius.md, backgroundColor: color.surface }}>
      <View style={{ borderRadius: radius.md, overflow: 'hidden', aspectRatio: sourceAspectRatio }}>
        <PhotoSlot slot={data.photo} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        {hairlineY !== null ? (
          <>
            <GuideLine y={hairlineY} />
            <LinePill label={data.lineLabels.hairline} y={hairlineY} />
          </>
        ) : null}
        <GuideLine y={data.browY} />
        <LinePill label={data.lineLabels.brow} y={data.browY} />
        <GuideLine y={data.noseBaseY} />
        <LinePill label={data.lineLabels.noseBase} y={data.noseBaseY} />
        <GuideLine y={data.chinY} />
        <LinePill label={data.lineLabels.chin} y={data.chinY} />
        {measuredBands.map(b => {
          const activeTint = b.restingTint
            ? color.bandActive
            : color.bandActiveSoft;
          return (
            <Band key={b.key} active={picked === b.key} top={b.top} height={b.height}
              restTint={b.restingTint ? color.bandRest : 'rgba(110,203,232,0)'}
              activeTint={activeTint}
              onPress={() => press(b.key)} />
          );
        })}
        {measuredBands.map(b => (
          <View key={b.key + '-pill'} pointerEvents="none"
            style={{ position: 'absolute', right: 10, top: pct(b.pillY * 100), marginTop: b.pillCentered ? -10 : 0 }}>
            <Pill variant="accent" label={b.pillLabel} />
          </View>
        ))}
      </View>
    </View>
  );
}
