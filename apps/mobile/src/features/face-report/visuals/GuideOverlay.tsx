import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Ellipse, Line, Polyline } from 'react-native-svg';
import { color, pct } from '../reportTokens';
import type { FeatureGuide } from '../reportTypes';
import { Pill } from './Pill';

interface Props {
  guide: FeatureGuide;
  label: string;
  labelX: number;
  labelAlign?: 'left' | 'right';
}

/** S3 photo-crop guide overlay: slanted eye-tail line + dot / dashed nose axis / lip & jaw ellipses. */
export function GuideOverlay({ guide, label, labelX, labelAlign = 'left' }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.w > 0 && (
        <Svg width={size.w} height={size.h}>
          {guide.kind === 'slantLine' && (() => {
            const x1 = guide.from.x * size.w;
            const y1 = guide.from.y * size.h;
            const len = guide.length * size.w;
            const a = (guide.angleDeg * Math.PI) / 180;
            return (
              <Line x1={x1} y1={y1} x2={x1 + len * Math.cos(a)} y2={y1 + len * Math.sin(a)}
                stroke={color.lineWhiteStrong} strokeWidth={1.5} />
            );
          })()}
          {guide.kind === 'dashedVertical' && (
            <Line x1={guide.x * size.w} y1={guide.top * size.h} x2={guide.x * size.w} y2={(guide.top + guide.height) * size.h}
              stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} strokeDasharray="5,4" />
          )}
          {guide.kind === 'ellipse' && (
            <Ellipse cx={guide.cx * size.w} cy={guide.cy * size.h} rx={guide.rx * size.w} ry={guide.ry * size.h}
              stroke={guide.dashed ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.9)'} strokeWidth={1.5}
              fill="none" strokeDasharray={guide.dashed ? '6,5' : undefined} />
          )}
          {guide.kind === 'polyline' && guide.points.length >= 2 && (
            <Polyline
              points={guide.points.map(p => `${p.x * size.w},${p.y * size.h}`).join(' ')}
              fill="none"
              stroke={color.lineWhiteStrong}
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          )}
        </Svg>
      )}
      {guide.kind === 'slantLine' && (
        <View style={{
          position: 'absolute', left: pct(guide.marker.x * 100), top: pct(guide.marker.y * 100),
          width: 9, height: 9, borderRadius: 4.5, backgroundColor: color.magenta,
          borderWidth: 2, borderColor: color.white,
        }} />
      )}
      <View style={{
        position: 'absolute', bottom: 10, flexDirection: 'row',
        ...(labelAlign === 'left' ? { left: pct(labelX * 100) } : { right: pct(labelX * 100) }),
      }}>
        <Pill variant="dark" label={label} />
      </View>
    </View>
  );
}
