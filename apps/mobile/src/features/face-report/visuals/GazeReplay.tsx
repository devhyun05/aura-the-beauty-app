import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color, font, pct, radius } from '../reportTokens';
import type { S6Data } from '../reportTypes';

export const FACE_W = 112;
export const FACE_H = 146;
/** Egg-shaped face outline approximating the HTML's elliptical border-radius box. */
export const FACE_PATH = 'M56 2 C86 2 108 27 108 62 C108 105 84 144 56 144 C28 144 4 105 4 62 C4 27 26 2 56 2 Z';

function Ring({ ring, index, active }: { ring: S6Data['rings'][number]; index: number; active: SharedValue<number> }) {
  const aStyle = useAnimatedStyle(() => {
    const on = active.value === index + 1;
    return {
      backgroundColor: withTiming(on ? ring.activeFill : ring.restFill, { duration: 350 }),
      transform: [{ scale: withTiming(on ? 1.07 : 1, { duration: 350 }) }],
      shadowOpacity: withTiming(on ? 0.4 : 0, { duration: 350 }),
    };
  });
  return (
    <Animated.View style={[{
      position: 'absolute', left: pct(ring.left * 100), right: pct(ring.right * 100),
      top: pct(ring.top * 100), height: pct(ring.height * 100),
      borderRadius: radius.pill, borderWidth: 2, borderColor: ring.color,
      borderStyle: ring.dashed ? 'dashed' : 'solid',
      shadowColor: ring.color, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
    }, aStyle]} />
  );
}

/** S6 gaze-order diagram with replay: rings light up in sequence (1 → 2 → rest). */
export function GazeReplay({ data }: { data: S6Data }) {
  const active = useSharedValue(0);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const play = () => {
    if (playing) return;
    setPlaying(true);
    active.value = 1;
    let acc = 0;
    data.rings.forEach((_, i) => {
      acc += data.stepMs[i] ?? 1000;
      const next = i + 1 < data.rings.length ? i + 2 : 0;
      timers.current.push(setTimeout(() => {
        active.value = next;
        if (next === 0) setPlaying(false);
      }, acc));
    });
  };

  return (
    <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
      <View style={{ width: FACE_W, height: FACE_H }}>
        <Svg width={FACE_W} height={FACE_H} viewBox={`0 0 ${FACE_W} ${FACE_H}`}>
          <Path d={FACE_PATH} stroke={color.faceOutline} strokeWidth={2} fill="none" />
          {data.faceGuides.map((y, i) => (
            <Line key={i} x1={FACE_W * 0.14} x2={FACE_W * 0.86} y1={FACE_H * y} y2={FACE_H * y}
              stroke="rgba(22,48,59,0.15)" strokeWidth={1} strokeDasharray="3,3" />
          ))}
        </Svg>
        {data.rings.map((r, i) => <Ring key={i} ring={r} index={i} active={active} />)}
        {data.markers.map(m => (
          <View key={m.n} style={{
            position: 'absolute', right: pct(m.right * 100), top: pct(m.top * 100),
            width: 17, height: 17, borderRadius: 8.5, backgroundColor: m.color,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={[font(10, '800'), { color: color.white }]}>{m.n}</Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[font(12, '800'), { color: color.ink }]}>{data.diagramTitle}</Text>
          <Pressable onPress={play} style={({ pressed }) => ({
            borderWidth: 1, borderColor: 'rgba(34,174,221,0.4)', backgroundColor: color.accentWash,
            borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11, opacity: pressed ? 0.8 : 1,
          })}>
            <Text style={[font(10.5, '800'), { color: color.accentDeep }]}>{playing ? data.playingLabel : data.playLabel}</Text>
          </Pressable>
        </View>
        {data.items.map(item => (
          <View key={item.n} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <View style={{ width: 17, height: 17, borderRadius: 8.5, backgroundColor: item.color, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[font(10, '800'), { color: color.white }]}>{item.n}</Text>
            </View>
            <Text style={[font(12.5, '400', 1.5), { color: color.body, flex: 1 }]}>{item.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
