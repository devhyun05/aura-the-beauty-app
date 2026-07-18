import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color, font, radius } from '../reportTokens';
import { describeImpressionExploration } from '../reportFormat';
import type { ImpressionAxis } from '../reportTypes';

/** S6 인상 좌표 맵 — axes[0]=가로, axes[1]=세로. value −1..1 → 0..1 위치.
 *  현재 위치(AI 판단) 점 + 드래그 탐색 점. 정직성: 위치는 AI가 본 인상, 숫자 미노출.
 *  드래그는 PanResponder(gesture-handler 미의존) — WhatIfRail과
 *  같은 캡처+종료거부 계약으로 리포트 ScrollView가 제스처를 가로채지 않게 한다. */
export function ImpressionMap({ axes }: { axes: ImpressionAxis[] }) {
  const ax = axes[0] ?? { leftLabel: '', rightLabel: '', value: 0, key: 'x' };
  const ay = axes[1] ?? { leftLabel: '', rightLabel: '', value: 0, key: 'y' };
  // 현재 위치(정규화 0..1): x = (value+1)/2, y = 위가 +1이므로 (1-value)/2
  const curX = (ax.value + 1) / 2;
  const curY = (1 - ay.value) / 2;
  const dragX = useSharedValue(curX);
  const dragY = useSharedValue(curY);
  const size = useRef(0);
  // 드래그 위치를 JS 상태로도 추적 — 공유값은 점 렌더용(UI 스레드), 상태는 실시간 해석 텍스트용.
  const [drag, setDrag] = useState({ x: curX, y: curY });

  // axes 프롭이 바뀌면(다른 보고서로 전환) 현재(AI) 위치로 재동기화 — mount 초기값이
  // stale하게 남아 이전 보고서 드래그 위치가 유지되는 것을 막는다(Gemini 리뷰).
  useEffect(() => {
    dragX.value = curX;
    dragY.value = curY;
    setDrag({ x: curX, y: curY });
  }, [curX, curY, dragX, dragY]);

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = e.nativeEvent.layout.width;
  };

  const setFromLocation = (locationX: number, locationY: number) => {
    if (size.current <= 0) return;
    const nx = Math.max(0, Math.min(1, locationX / size.current));
    const ny = Math.max(0, Math.min(1, locationY / size.current));
    dragX.value = nx;
    dragY.value = ny;
    setDrag({ x: nx, y: ny });
  };

  // 기본(AI) 위치로 복귀 — 드래그 점을 부드럽게 되돌린다.
  const reset = () => {
    dragX.value = withTiming(curX, { duration: 260 });
    dragY.value = withTiming(curY, { duration: 260 });
    setDrag({ x: curX, y: curY });
  };

  // ScrollView·iOS swipe-back에 제스처를 뺏기지 않도록 capture + 종료 거부
  // (WhatIfRail 주석 참조).
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: e => setFromLocation(e.nativeEvent.locationX, e.nativeEvent.locationY),
        onPanResponderMove: e => setFromLocation(e.nativeEvent.locationX, e.nativeEvent.locationY),
      }),
    [],
  );

  const dragStyle = useAnimatedStyle(() => ({
    left: `${dragX.value * 100}%`,
    top: `${dragY.value * 100}%`,
  }));

  const exploreText = describeImpressionExploration(axes, drag.x, drag.y);
  const moved = Math.abs(drag.x - curX) > 0.02 || Math.abs(drag.y - curY) > 0.02;

  return (
    <View style={{ gap: 8 }}>
      <Text style={[font(11.5, '700'), { color: color.muted }]}>AI가 본 인상 — 끌어서 둘러보세요</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[font(10.5, '700'), { color: color.faint, width: 48, textAlign: 'right' }]}>{ax.leftLabel}</Text>
        <View
          {...pan.panHandlers}
          onLayout={onLayout}
          style={{ flex: 1, aspectRatio: 1, borderRadius: radius.lg, backgroundColor: color.dial, borderWidth: 1, borderColor: color.outline8 }}
        >
          {/* 축 십자선 */}
          <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: color.outline8 }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: color.outline8 }} />
          {/* 현재 위치(고정) */}
          <View pointerEvents="none" style={{ position: 'absolute', left: `${curX * 100}%`, top: `${curY * 100}%`, width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: 7, backgroundColor: color.accent, borderWidth: 2, borderColor: color.white }} />
          {/* 드래그 탐색 점 */}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 16, height: 16, marginLeft: -8, marginTop: -8, borderRadius: 8, backgroundColor: color.magenta, opacity: 0.85 }, dragStyle]} />
        </View>
        <Text style={[font(10.5, '700'), { color: color.faint, width: 48 }]}>{ax.rightLabel}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 56 }}>
        <Text style={[font(10.5, '700'), { color: color.faint }]}>↑ {ay.rightLabel}</Text>
        <Text style={[font(10.5, '700'), { color: color.faint }]}>↓ {ay.leftLabel}</Text>
      </View>
      {exploreText ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 22, marginTop: 2 }}>
          <Text style={[font(12, '600', 1.5), { color: color.body, flex: 1 }]}>{exploreText}</Text>
          {moved ? (
            <Text onPress={reset} suppressHighlighting style={[font(11.5, '700'), { color: color.accentDeep }]}>
              기본 위치로
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
