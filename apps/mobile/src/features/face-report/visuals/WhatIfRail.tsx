import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { color, font } from '../reportTokens';
import type { SpectrumAxisData, WhatIfConfig } from '../reportTypes';
import { RailTrack } from './SpectrumRail';

interface Props { axis: SpectrumAxisData; config: WhatIfConfig }

/**
 * S3 draggable "만약에" rail. Dragging anywhere on the track shows a dashed ghost marker
 * (reanimated shared value) and the caption for the zone under the finger. The real
 * measured marker never moves.
 */
export function WhatIfRail({ axis, config }: Props) {
  const trackW = useRef(0);
  const ghost = useSharedValue(0.5);
  const [zone, setZone] = useState<number | null>(null); // index into config.zones; null = idle
  const min = config.min ?? 0.04;
  const max = config.max ?? 0.96;

  const setFromX = (x: number) => {
    if (trackW.current <= 0) return;
    const p = Math.min(max, Math.max(min, x / trackW.current));
    ghost.value = p;
    const zi = config.zones.findIndex(z => p < z.upTo);
    const idx = zi === -1 ? config.zones.length - 1 : zi;
    setZone(prev => (prev === idx ? prev : idx));
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => setFromX(e.nativeEvent.locationX),
    onPanResponderMove: e => setFromX(e.nativeEvent.locationX),
  }), []);

  const ghostStyle = useAnimatedStyle(() => ({ left: `${ghost.value * 100}%` }));
  const active = zone != null;

  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={[font(12, '600'), { color: color.text }]}>{axis.leftLabel}</Text>
        <Text style={[font(12, '600'), { color: color.text }]}>{axis.rightLabel}</Text>
      </View>
      <View
        {...pan.panHandlers}
        onLayout={e => { trackW.current = e.nativeEvent.layout.width; }}
        style={{ height: 24, marginVertical: -7, justifyContent: 'center' }}
      >
        <RailTrack state={axis.state} />
        {active && (
          <Animated.View style={[{
            position: 'absolute', top: '50%', width: 16, height: 16, marginLeft: -8, marginTop: -8,
            borderRadius: 8, backgroundColor: color.white,
            borderWidth: 2.5, borderStyle: 'dashed', borderColor: color.magenta,
            shadowColor: color.ink, shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2,
          }, ghostStyle]} />
        )}
      </View>
      {active ? (
        <Text style={[font(11.5, '400', 1.55), { color: color.body }]}>
          <Text style={[font(11.5, '700'), { color: color.ink }]}>{config.prefix}</Text>
          {' — '}
          {config.zones[zone!].text}
          {' '}
          <Text onPress={() => setZone(null)} suppressHighlighting style={[font(11.5, '700'), { color: color.accentDeep }]}>
            {config.resetLabel}
          </Text>
        </Text>
      ) : (
        <Text style={[font(11.5, '400', 1.5), { color: color.muted }]}>{config.idleCaption}</Text>
      )}
    </View>
  );
}
