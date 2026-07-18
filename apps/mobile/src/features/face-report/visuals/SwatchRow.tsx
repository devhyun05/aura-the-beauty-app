import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { color, font, radius } from '../reportTokens';
import type { SwatchData } from '../reportTypes';

interface Props {
  swatches: SwatchData[];
  bad?: boolean;           // 피할 색: diagonal white slash + gray selection ring
  selectedName?: string;
  onPick: (s: SwatchData) => void;
}

/** 4-column swatch grid. Selection ring drawn as absolute overlays (white inner + colored outer). */
export function SwatchRow({ swatches, bad = false, selectedName, onPick }: Props) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {swatches.map(s => {
        const selected = selectedName === s.name;
        return (
          <Pressable key={`${s.familyLabel ?? ''}-${s.name}`} onPress={() => { Haptics.selectionAsync(); onPick(s); }}
            style={{ flexBasis: '22%', flexGrow: 1, gap: 5 }}>
            <View style={{ height: 42, borderRadius: radius.sm, backgroundColor: s.color, overflow: 'hidden' }}>
              {bad && <BadSlash />}
            </View>
            {selected && (
              <>
                <View pointerEvents="none" style={{
                  position: 'absolute', top: -2.5, left: -2.5, right: -2.5, height: 47,
                  borderRadius: radius.sm + 2.5, borderWidth: 2.5, borderColor: color.white,
                }} />
                <View pointerEvents="none" style={{
                  position: 'absolute', top: -5, left: -5, right: -5, height: 52,
                  borderRadius: radius.sm + 5, borderWidth: 2.5, borderColor: bad ? color.dotOutline : color.accent,
                }} />
              </>
            )}
            <View style={{ alignItems: 'center', minHeight: 34 }}>
              <Text numberOfLines={1} style={[font(10, '700'), { color: color.ink, textAlign: 'center' }]}>
                {s.name}
              </Text>
              {s.familyLabel ? (
                <Text numberOfLines={1} style={[font(9, '500'), { color: color.faint, textAlign: 'center' }]}>
                  {s.familyLabel}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function BadSlash() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 && (
        <Svg width={size.w} height={size.h}>
          <Line x1={0} y1={size.h} x2={size.w} y2={0}
            stroke="rgba(255,255,255,0.95)" strokeWidth={Math.hypot(size.w, size.h) * 0.08} />
        </Svg>
      )}
    </View>
  );
}
