import React, {useRef, useState} from 'react';
import {PanResponder, StyleSheet, Text, View} from 'react-native';

/**
 * 온페이스 핏 핸들(A17) — Unity가 방출한 부위 앵커 좌표 위에 골드 점을 그리고,
 * 드래그를 뷰포트 델타로 환산해 App에 올린다. App이 현재 룩의 겹 수만큼 점을
 * 펼쳐 주므로("겹마다 점") 이 컴포넌트는 받은 점을 그대로 그린다.
 * 역할 분담: Unity=좌표만 / 터치·핏 시트 기록=전부 RN(App).
 * 좌표 규약: Unity 뷰포트 0..1(y=아래→위) → 화면 px는 (x·w, (1-y)·h).
 *
 * 드래그 견고화: UnityView(네이티브)가 제스처를 뺏어 "잠깐 끌리다 놓이는" 문제를
 * terminationRequest 거부 + 네이티브 응답자 차단으로 막는다. 콜백·좌표는 ref로
 * 최신값을 읽어(PanResponder는 1회 생성) 10Hz 갱신에도 스테일 클로저가 없다.
 */

export interface FitHandlePoint {
  key: string;
  x: number;
  y: number;
  /** 같은 앵커에 겹이 여럿일 때 부채꼴 오프셋 인덱스(0=앵커 그대로) */
  stack?: number;
  /** 점 위 소형 라벨(겹 번호 등) */
  label?: string;
}

interface Props {
  handles: FitHandlePoint[];
  onDelta: (
    key: string,
    dxVp: number,
    dyVpUp: number,
    phase: 'start' | 'move' | 'end',
  ) => void;
}

const DOT = 30; // 터치 타깃(px) — 링 지름
const STACK_DX = 18; // 겹 부채꼴 오프셋(px) — 오른쪽 위로 펼침
const STACK_DY = -12;

function HandleDot({
  handle,
  size,
  onDelta,
}: {
  handle: FitHandlePoint;
  size: {w: number; h: number};
  onDelta: Props['onDelta'];
}) {
  const [dragging, setDragging] = useState(false);
  // 최신 props를 ref로 — PanResponder는 마운트 시 1회 생성이라 클로저가 낡는다.
  const latest = useRef({handle, size, onDelta});
  latest.current = {handle, size, onDelta};
  // 드래그 중 Unity 좌표 갱신(프리즈 안 된 경우)에 점이 떨리지 않게 시작 위치 고정.
  const startRef = useRef({x: handle.x, y: handle.y});
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // UnityView 등 네이티브/형제 응답자에게 제스처를 넘기지 않는다(끊김 방지).
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        const h = latest.current.handle;
        startRef.current = {x: h.x, y: h.y};
        setDragging(true);
        latest.current.onDelta(h.key, 0, 0, 'start');
      },
      onPanResponderMove: (_e, g) => {
        const {size: s, onDelta: cb, handle: h} = latest.current;
        cb(h.key, g.dx / s.w, -g.dy / s.h, 'move');
      },
      onPanResponderRelease: (_e, g) => {
        setDragging(false);
        const {size: s, onDelta: cb, handle: h} = latest.current;
        cb(h.key, g.dx / s.w, -g.dy / s.h, 'end');
      },
      onPanResponderTerminate: (_e, g) => {
        setDragging(false);
        const {size: s, onDelta: cb, handle: h} = latest.current;
        cb(h.key, g.dx / s.w, -g.dy / s.h, 'end');
      },
    }),
  ).current;

  const base = dragging ? startRef.current : handle;
  const stack = handle.stack ?? 0;
  return (
    <View
      {...pan.panHandlers}
      style={[
        styles.dot,
        dragging && styles.dotDragging,
        {
          left: base.x * size.w - DOT / 2 + stack * STACK_DX,
          top: (1 - base.y) * size.h - DOT / 2 + stack * STACK_DY,
        },
      ]}>
      <View style={styles.dotCore} />
      {handle.label != null && <Text style={styles.dotLabel}>{handle.label}</Text>}
    </View>
  );
}

export default function FitHandlesOverlay({handles, onDelta}: Props) {
  const [size, setSize] = useState<{w: number; h: number} | null>(null);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={e =>
        setSize({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }>
      {size &&
        handles.map(h => (
          <HandleDot key={h.key} handle={h} size={size} onDelta={onDelta} />
        ))}
    </View>
  );
}

const GOLD = '#C9A15E';

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: 'rgba(201,161,94,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDragging: {
    backgroundColor: 'rgba(201,161,94,0.35)',
    transform: [{scale: 1.15}],
  },
  dotCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GOLD,
  },
  dotLabel: {
    position: 'absolute',
    top: -13,
    color: GOLD,
    fontSize: 9,
    fontWeight: '700',
  },
});
