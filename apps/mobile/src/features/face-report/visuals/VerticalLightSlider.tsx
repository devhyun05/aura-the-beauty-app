import React, {useMemo, useRef, useState} from 'react';
import {PanResponder, Text, View} from 'react-native';
import Animated, {SharedValue, useAnimatedStyle} from 'react-native-reanimated';
import {color, font, radius} from '../reportTokens';

interface Props {
  value: SharedValue<number>; // -1 (warm) .. 1 (cool); 0 = 기준 조명
  heading: string;
  warmLabel: string;
  coolLabel: string;
  captions: {warm: string; neutral: string; cool: string};
}

const TRACK_H = 128;

/** S4 세로 조명 슬라이더: 위로 끌면 쿨(+1), 아래로 끌면 웜(-1). 드레이프 tint를 재조정. */
export function VerticalLightSlider({value, heading, warmLabel, coolLabel, captions}: Props) {
  const [zone, setZone] = useState<-1 | 0 | 1>(0);
  const start = useRef(0);

  // ScrollView·iOS swipe-back에 제스처를 뺏기지 않도록 capture + 종료 거부(LightingDial 주석 참조).
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          start.current = value.value;
        },
        onPanResponderMove: (_e, g) => {
          // 위로(dy<0) 드래그 = 쿨(+). 트랙 절반 이동에서 풀스케일.
          const v = Math.max(-1, Math.min(1, start.current - (g.dy / (TRACK_H / 2))));
          value.value = v;
          const z = v < -0.25 ? -1 : v > 0.25 ? 1 : 0;
          setZone(prev => (prev === z ? prev : z));
        },
      }),
    [],
  );

  // 손잡이 세로 위치: value +1(쿨)=상단 0%, -1(웜)=하단 100%.
  const knobStyle = useAnimatedStyle(() => ({
    top: ((1 - value.value) / 2) * (TRACK_H - 22),
  }));

  return (
    <View
      style={{
        width: 92,
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: color.outline8,
        borderRadius: radius.lg,
        paddingVertical: 10,
        paddingHorizontal: 6,
      }}>
      <Text style={[font(10, '800', undefined, 0.8), {color: color.muted}]}>{heading}</Text>
      <Text style={[font(10, '700'), {color: color.accentDeep}]}>{coolLabel}</Text>
      <View
        {...pan.panHandlers}
        hitSlop={{top: 8, bottom: 8, left: 16, right: 16}}
        style={{width: 10, height: TRACK_H, borderRadius: radius.pill, backgroundColor: color.dial, justifyContent: 'flex-start'}}>
        <Animated.View
          style={[
            {position: 'absolute', left: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: color.magenta},
            knobStyle,
          ]}
        />
      </View>
      <Text style={[font(10, '700'), {color: color.warmLabel}]}>{warmLabel}</Text>
      <Text style={[font(9.5, '400', 1.4), {color: color.muted, textAlign: 'center'}]}>
        {zone === -1 ? captions.warm : zone === 1 ? captions.cool : captions.neutral}
      </Text>
    </View>
  );
}
