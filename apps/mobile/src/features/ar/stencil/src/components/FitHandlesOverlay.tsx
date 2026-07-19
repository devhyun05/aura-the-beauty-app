import React, {useRef, useState} from 'react';
import {PanResponder, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Svg, {Polyline} from 'react-native-svg';

import type {FitHandleOutline} from '../composer/fitHandleContract';

/**
 * 온페이스 핏 핸들(A17) — Unity가 방출한 부위 앵커 좌표 위에 무채색 점(흰 코어+
 * 어두운 테두리 — 피부 위 가시성)을 그리고,
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
  outlines?: FitHandleOutline[];
  onDelta: (
    key: string,
    dxVp: number,
    dyVpUp: number,
    phase: 'start' | 'move' | 'end',
  ) => void;
  onGesture?: (
    region: string,
    gesture: FitOutlineGesture,
    phase: 'start' | 'move' | 'end',
  ) => void;
  onWarpDelta?: (
    region: string,
    pointIndex: number,
    delta: number,
    phase: 'start' | 'move' | 'end',
  ) => void;
}

export interface FitTouchPoint {identifier?: string | number; pageX: number; pageY: number}
export interface FitOutlineGesture {
  kind: 'position' | 'transform' | 'width';
  dxVp: number;
  dyVpUp: number;
  scale: number;
  rotation: number;
  width: number;
}

export function fitOutlineGesture(
  start: readonly FitTouchPoint[],
  current: readonly FitTouchPoint[],
  size: {w: number; h: number},
): FitOutlineGesture {
  const pairCount = Math.min(start.length, current.length, 2);
  if (pairCount === 0 || size.w <= 0 || size.h <= 0) {
    return {kind: 'position', dxVp: 0, dyVpUp: 0, scale: 1, rotation: 0, width: 0};
  }
  const center = (points: readonly FitTouchPoint[]) => ({
    x: points.slice(0, pairCount).reduce((sum, point) => sum + point.pageX, 0) / pairCount,
    y: points.slice(0, pairCount).reduce((sum, point) => sum + point.pageY, 0) / pairCount,
  });
  const a = center(start);
  const b = center(current);
  let scale = 1;
  let rotation = 0;
  if (pairCount === 2) {
    const vector = (points: readonly FitTouchPoint[]) => ({
      x: points[1].pageX - points[0].pageX,
      y: points[1].pageY - points[0].pageY,
    });
    const from = vector(start);
    const to = vector(current);
    const fromDistance = Math.hypot(from.x, from.y);
    if (fromDistance > 0) scale = Math.hypot(to.x, to.y) / fromDistance;
    const rawAngle = Math.atan2(to.y, to.x) - Math.atan2(from.y, from.x);
    let shortest = Math.atan2(Math.sin(rawAngle), Math.cos(rawAngle));
    if (shortest <= -Math.PI) shortest = Math.PI;
    rotation = shortest * 180 / Math.PI;
  }
  return {
    kind: pairCount === 2 ? 'transform' : 'position',
    dxVp: (b.x - a.x) / size.w,
    dyVpUp: -(b.y - a.y) / size.h,
    scale,
    rotation,
    width: ((b.x - a.x) / size.w - (b.y - a.y) / size.h) / 2,
  };
}

export interface FitTouchGestureState {
  baseline: FitTouchPoint[];
  origin: FitOutlineGesture;
  current: FitOutlineGesture;
}

const ZERO_GESTURE: FitOutlineGesture = {
  kind: 'position', dxVp: 0, dyVpUp: 0, scale: 1, rotation: 0, width: 0,
};

/** 터치 수가 바뀌는 프레임을 새 baseline으로 잡아 1↔2 전환 점프를 없앤다. */
export function advanceFitTouchGesture(
  state: FitTouchGestureState | null,
  touches: readonly FitTouchPoint[],
  size: {w: number; h: number},
): FitTouchGestureState {
  const incoming = [...touches];
  const trackedIds = state?.baseline
    .map(point => point.identifier)
    .filter((id): id is string | number => id !== undefined) ?? [];
  const retained = trackedIds.length > 0
    ? trackedIds.flatMap(id => {
        const point = incoming.find(candidate => candidate.identifier === id);
        return point ? [point] : [];
      })
    : [];
  const active = [
    ...retained,
    ...incoming.filter(point =>
      point.identifier === undefined || !trackedIds.includes(point.identifier),
    ),
  ].slice(0, 2);
  if (!state) {
    return {baseline: active, origin: ZERO_GESTURE, current: ZERO_GESTURE};
  }
  if (active.length === 0) return state;
  const baselineIds = state.baseline.map(point => point.identifier);
  const activeIds = active.map(point => point.identifier);
  const sameIdentifiers =
    baselineIds.every(id => id !== undefined) && activeIds.every(id => id !== undefined)
      ? baselineIds.length === activeIds.length &&
        baselineIds.every(id => activeIds.includes(id))
      : active.length === state.baseline.length;
  if (!sameIdentifiers) {
    return {baseline: active, origin: state.current, current: state.current};
  }
  const ordered = state.baseline.every(point => point.identifier !== undefined)
    ? state.baseline.map(point =>
        active.find(candidate => candidate.identifier === point.identifier) ?? point,
      )
    : active;
  const local = fitOutlineGesture(state.baseline, ordered, size);
  const current: FitOutlineGesture = {
    kind: active.length > 1 ? 'transform' : 'position',
    dxVp: state.origin.dxVp + local.dxVp,
    dyVpUp: state.origin.dyVpUp + local.dyVpUp,
    scale: state.origin.scale * local.scale,
    rotation: state.origin.rotation + local.rotation,
    width: state.origin.width + local.width,
  };
  return {...state, current};
}

/** 제어점 화면 드래그를 이웃점 접선의 수직 방향으로 투영해 부위 크기 비율로 바꾼다. */
export function projectFitWarpDelta(
  points: readonly [number, number][],
  pointIndex: number,
  dxVp: number,
  dyVpUp: number,
  mirrored: boolean,
): number {
  if (points.length < 3 || pointIndex < 0 || pointIndex >= points.length) return 0;
  const current = points[pointIndex];
  const distinct = (point: readonly [number, number]) =>
    Math.hypot(point[0] - current[0], point[1] - current[1]) > 1e-6;
  let previous: readonly [number, number] | undefined;
  let next: readonly [number, number] | undefined;
  for (let offset = 1; offset < points.length && (!previous || !next); offset++) {
    const before = points[(pointIndex - offset + points.length) % points.length];
    const after = points[(pointIndex + offset) % points.length];
    if (!previous && distinct(before)) previous = before;
    if (!next && distinct(after)) next = after;
  }
  if (!previous || !next) return 0;
  const tx = next[0] - previous[0];
  const ty = next[1] - previous[1];
  const length = Math.hypot(tx, ty);
  if (length === 0) return 0;
  let nx = -ty / length;
  let ny = tx / length;
  const centroid = points.reduce(
    (sum, point) => ({x: sum.x + point[0], y: sum.y + point[1]}),
    {x: 0, y: 0},
  );
  centroid.x /= points.length;
  centroid.y /= points.length;
  const outwardDot = nx * (current[0] - centroid.x) + ny * (current[1] - centroid.y);
  if (outwardDot < -1e-8) {
    nx = -nx;
    ny = -ny;
  }
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const regionSize = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    1e-4,
  );
  const projected = (dxVp * nx + dyVpUp * ny) / regionSize;
  return mirrored ? -projected : projected;
}

/** 8개 RN 제어점 j를 8~12점 outline의 동일 cyclic 위치로 다운샘플한다. */
export function fitWarpOutlinePointIndex(
  outlinePointCount: number,
  controlIndex: number,
): number {
  if (outlinePointCount <= 0) return 0;
  return Math.min(
    outlinePointCount - 1,
    Math.floor(controlIndex * outlinePointCount / 8),
  );
}

/** 볼 외곽선은 시각 stroke만 닫는다. 원본 점 배열은 hit-test/워프 제어점에 그대로 쓴다. */
export function fitOutlineStrokePoints<T>(
  region: string,
  points: readonly T[],
): readonly T[] {
  return region.replace(/[LR]$/, '') === 'blush' && points.length > 0
    ? [...points, points[0]]
    : points;
}

const segmentDistance = (
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
};

const DOT = 30; // 터치 타깃(px) — 링 지름
const STACK_DX = 18; // 겹 부채꼴 오프셋(px) — 오른쪽 위로 펼침
const STACK_DY = -12;
const isPilotWarpRegion = (region: string) => {
  const base = region.replace(/[LR]$/, '');
  return base === 'eyeshadow' || base === 'blush';
};

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

function OutlineShape({
  outline,
  size,
  onGesture,
}: {
  outline: FitHandleOutline;
  size: {w: number; h: number};
  onGesture?: Props['onGesture'];
}) {
  const startTouches = useRef<FitTouchPoint[]>([]);
  const touchGesture = useRef<FitTouchGestureState | null>(null);
  const startMode = useRef<'position' | 'transform' | 'width'>('position');
  const xs = outline.points.map(point => point[0] * size.w);
  const ys = outline.points.map(point => (1 - point[1]) * size.h);
  const pad = 18;
  const left = Math.max(0, Math.min(...xs) - pad);
  const top = Math.max(0, Math.min(...ys) - pad);
  const right = Math.min(size.w, Math.max(...xs) + pad);
  const bottom = Math.min(size.h, Math.max(...ys) + pad);
  const localPoints = xs.map((x, index) => [x - left, ys[index] - top] as const);
  const latest = useRef({outline, size, onGesture, localPoints});
  latest.current = {outline, size, onGesture, localPoints};
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: event => {
      startTouches.current = [...event.nativeEvent.touches].slice(0, 2);
      touchGesture.current = advanceFitTouchGesture(null, startTouches.current, latest.current.size);
      const locationX = event.nativeEvent.locationX;
      const locationY = event.nativeEvent.locationY;
      const currentPoints = latest.current.localPoints;
      const edgeDistance = currentPoints.reduce((best, point, index) => {
        const next = currentPoints[(index + 1) % currentPoints.length];
        return Math.min(best, segmentDistance(locationX, locationY, point[0], point[1], next[0], next[1]));
      }, Number.POSITIVE_INFINITY);
      startMode.current = startTouches.current.length > 1
        ? 'transform'
        : edgeDistance <= 14 ? 'width' : 'position';
      const initial = fitOutlineGesture(startTouches.current, startTouches.current, latest.current.size);
      latest.current.onGesture?.(
        latest.current.outline.region,
        {...initial, kind: startMode.current},
        'start',
      );
    },
    onPanResponderMove: event => {
      const touches = [...event.nativeEvent.touches];
      touchGesture.current = advanceFitTouchGesture(touchGesture.current, touches, latest.current.size);
      const gesture = touchGesture.current.current;
      if (touches.length > 1) startMode.current = 'transform';
      latest.current.onGesture?.(
        latest.current.outline.region,
        startMode.current === 'width'
          ? {...gesture, kind: 'width', dxVp: 0, dyVpUp: 0, scale: 1, rotation: 0}
          : {...gesture, kind: startMode.current, width: 0},
        'move',
      );
    },
    onPanResponderRelease: event => {
      const active = [...event.nativeEvent.touches];
      touchGesture.current = advanceFitTouchGesture(touchGesture.current, active, latest.current.size);
      const gesture = touchGesture.current.current;
      latest.current.onGesture?.(
        latest.current.outline.region,
        startMode.current === 'width'
          ? {...gesture, kind: 'width', dxVp: 0, dyVpUp: 0, scale: 1, rotation: 0}
          : {...gesture, kind: startMode.current, width: 0},
        'end',
      );
    },
    onPanResponderTerminate: event => {
      touchGesture.current = advanceFitTouchGesture(
        touchGesture.current,
        [...event.nativeEvent.touches],
        latest.current.size,
      );
      const gesture = touchGesture.current.current;
      latest.current.onGesture?.(
        latest.current.outline.region,
        startMode.current === 'width'
          ? {...gesture, kind: 'width', dxVp: 0, dyVpUp: 0, scale: 1, rotation: 0}
          : {...gesture, kind: startMode.current, width: 0},
        'end',
      );
    },
  })).current;
  const points = fitOutlineStrokePoints(outline.region, localPoints)
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
  return (
    <View
      {...pan.panHandlers}
      // 외곽선마다 wire 좌표에서 계산되는 동적 hit box라 정적 StyleSheet로 옮길 수 없다.
      // eslint-disable-next-line react-native/no-inline-styles
      style={{position: 'absolute', left, top, width: right - left, height: bottom - top}}
      pointerEvents="box-only">
      <Svg width={right - left} height={bottom - top} pointerEvents="none">
        <Polyline
          points={points}
          fill="rgba(201,161,94,0.08)"
          stroke="rgba(201,161,94,0.72)"
          strokeWidth={2}
        />
      </Svg>
    </View>
  );
}

export default function FitHandlesOverlay({
  handles,
  outlines = [],
  onDelta,
  onGesture,
  onWarpDelta,
}: Props) {
  const [size, setSize] = useState<{w: number; h: number} | null>(null);
  const [advanced, setAdvanced] = useState(false);
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
      {size && outlines.map(outline => (
        <OutlineShape
          key={`outline:${outline.region}`}
          outline={outline}
          size={size}
          onGesture={onGesture}
        />
      ))}
      {size && handles.map(h => (
          <HandleDot key={h.key} handle={h} size={size} onDelta={onDelta} />
      ))}
      {size && advanced && onWarpDelta && outlines
        .filter(outline => isPilotWarpRegion(outline.region))
        .flatMap(outline => Array.from({length: 8}, (_, index) => {
          const sourceIndex = fitWarpOutlinePointIndex(outline.points.length, index);
          const [x, y] = outline.points[sourceIndex];
          return (
          <HandleDot
            key={`warp:${outline.region}:${index}`}
            handle={{key: `${outline.region}#${index}`, x, y}}
            size={size}
            onDelta={(_key, dx, dy, phase) => onWarpDelta(
              outline.region,
              index,
              projectFitWarpDelta(
                outline.points,
                sourceIndex,
                dx,
                dy,
                outline.region.replace(/[LR]$/, '') === 'eyeshadow' &&
                  outline.region.endsWith('L'),
              ),
              phase,
            )}
          />
          );
        }))}
      {outlines.some(outline => isPilotWarpRegion(outline.region)) && (
        <TouchableOpacity
          style={styles.advancedButton}
          onPress={() => setAdvanced(value => !value)}>
          <Text style={styles.advancedText}>{advanced ? '기본 조작' : '고급 변형'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.55)',
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDragging: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    transform: [{scale: 1.15}],
  },
  dotCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  dotLabel: {
    position: 'absolute',
    top: -13,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 2,
    textShadowOffset: {width: 0, height: 1},
  },
  advancedButton: {
    position: 'absolute',
    right: 12,
    bottom: 184,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(20,20,20,0.72)',
  },
  advancedText: {color: '#C9A15E', fontSize: 11, fontWeight: '700'},
});
