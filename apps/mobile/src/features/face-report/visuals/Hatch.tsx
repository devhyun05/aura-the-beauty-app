import React, { useId, useState } from 'react';
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';

interface Props { colorA: string; colorB?: string; stripe?: number; style?: StyleProp<ViewStyle> }

/** 135° diagonal stripe fill — RN equivalent of the HTML's repeating-linear-gradient hatches. */
export function Hatch({ colorA, colorB, stripe = 10, style }: Props) {
  const id = 'h' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  return (
    <View pointerEvents="none" style={[{ overflow: 'hidden' }, style]} onLayout={onLayout}>
      {size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <Pattern id={id} patternUnits="userSpaceOnUse" width={stripe * 2} height={stripe * 2} patternTransform="rotate(135)">
              {colorB ? <Rect width={stripe * 2} height={stripe * 2} fill={colorB} /> : null}
              <Rect width={stripe} height={stripe * 2} fill={colorA} />
            </Pattern>
          </Defs>
          <Rect width={size.w} height={size.h} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}
