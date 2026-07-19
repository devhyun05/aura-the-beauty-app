import React from 'react';
import {StyleSheet} from 'react-native';
import Svg, {Circle, G, Line, Polyline} from 'react-native-svg';

import type {FaceGeometryResult} from '../types';

// 지표 계열별 색 — 라벨 접두사로 매핑. (magenta=눈꼬리 위쪽선, blue=tilt, green=개방도, cyan=눈썹)
const FAMILY_COLOR: ReadonlyArray<readonly [string, string]> = [
  ['canthalTilt', '#3b82f6'],
  ['canthalUpper', '#ff4d9d'],
  ['canthalLower', '#ff4d9d'],
  ['eyeOpenness', '#34d399'],
  ['browEdge', '#22d3ee'],
];

function colorFor(label: string): string {
  for (const [prefix, color] of FAMILY_COLOR) {
    if (label.startsWith(prefix)) {
      return color;
    }
  }
  return '#f59e0b';
}

export function FaceGeometryDebugOverlay({
  familyFilter,
  result,
}: {
  familyFilter?: (label: string) => boolean;
  result: FaceGeometryResult;
}) {
  const width = result.sourceImage.width;
  const height = result.sourceImage.height;
  const all = result.debugAnchors ?? [];
  const anchors = familyFilter ? all.filter(anchor => familyFilter(anchor.label)) : all;

  if (width <= 0 || height <= 0 || anchors.length === 0) {
    return null;
  }

  const stroke = Math.max(1.5, Math.min(5, height * 0.003));
  const dotRadius = stroke * 1.6;

  return (
    <Svg
      height="100%"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${width} ${height}`}
      width="100%">
      {/* 수평 0° 기준선(내안각 높이) — canthalTilt 를 무엇 대비 재는지 + roll 맥락 */}
      {anchors
        .filter(anchor => anchor.label.startsWith('canthalTilt'))
        .map((anchor, index) => (
          <Line
            key={`ref-${index}`}
            stroke="rgba(255,255,255,0.5)"
            strokeDasharray={`${stroke * 2} ${stroke * 2}`}
            strokeWidth={stroke * 0.6}
            x1={0}
            x2={width}
            y1={anchor.points[0].y * height}
            y2={anchor.points[0].y * height}
          />
        ))}

      {anchors.map((anchor, index) => {
        const color = colorFor(anchor.label);
        const points = anchor.points.map(point => ({
          x: point.x * width,
          y: point.y * height,
        }));

        return (
          <G key={`anchor-${index}`}>
            {anchor.kind === 'segment' && points.length >= 2 ? (
              <Line
                stroke={color}
                strokeLinecap="round"
                strokeWidth={stroke}
                x1={points[0].x}
                x2={points[1].x}
                y1={points[0].y}
                y2={points[1].y}
              />
            ) : (
              <Polyline
                fill="none"
                points={points.map(point => `${point.x},${point.y}`).join(' ')}
                stroke={color}
                strokeWidth={stroke}
              />
            )}
            {points.map((point, pointIndex) => (
              <Circle
                key={pointIndex}
                cx={point.x}
                cy={point.y}
                fill={color}
                r={dotRadius}
              />
            ))}
            {anchor.label.startsWith('browEdge') && points.length > 0
              ? (() => {
                  let apexIndex = 0;
                  for (let i = 1; i < points.length; i++) {
                    if (points[i].y < points[apexIndex].y) {
                      apexIndex = i;
                    }
                  }
                  // 봉우리로 고른 점을 빈 링으로 강조(진짜 봉우리가 이 근처인지 육안 확인).
                  return (
                    <Circle
                      cx={points[apexIndex].x}
                      cy={points[apexIndex].y}
                      fill="none"
                      r={dotRadius * 2.6}
                      stroke={color}
                      strokeWidth={stroke}
                    />
                  );
                })()
              : null}
          </G>
        );
      })}
    </Svg>
  );
}
