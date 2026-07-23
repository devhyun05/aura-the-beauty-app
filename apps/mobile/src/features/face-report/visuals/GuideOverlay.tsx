import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, {Circle as SvgCircle, Ellipse, Line, Path, Polyline} from 'react-native-svg';
import { color, pct } from '../reportTokens';
import type { FeatureGuide } from '../reportTypes';
import { Pill } from './Pill';

interface Props {
  guide: FeatureGuide;
  guides?: FeatureGuide[];
  activeMetricKeys?: string[];
  label: string;
  labelX: number;
  labelAlign?: 'left' | 'right';
}

/** S3 photo-crop guide overlay: slanted eye-tail line + dot / dashed nose axis / lip ellipse / real polylines. */
export function GuideOverlay({
  guide,
  guides,
  activeMetricKeys,
  label,
  labelX,
  labelAlign = 'left',
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const activeKeys = new Set(activeMetricKeys ?? []);
  const availableGuides = guides?.length ? guides : [guide];
  const visibleGuides = activeKeys.size > 0
    ? availableGuides.filter(candidate =>
        candidate.kind === 'measurement'
        && candidate.metricKeys.some(key => activeKeys.has(key)),
      )
    : availableGuides.slice(0, 1);
  const activeLabel =
    label
    || visibleGuides.find(candidate => candidate.kind === 'measurement')?.label
    || '';
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.w > 0 && (
        <Svg width={size.w} height={size.h}>
          {visibleGuides.map((visibleGuide, guideIndex) => (
            <React.Fragment key={`guide-${guideIndex}`}>
          {visibleGuide.kind === 'slantLine' && (() => {
            const x1 = visibleGuide.from.x * size.w;
            const y1 = visibleGuide.from.y * size.h;
            const len = visibleGuide.length * size.w;
            const a = (visibleGuide.angleDeg * Math.PI) / 180;
            return (
              <Line x1={x1} y1={y1} x2={x1 + len * Math.cos(a)} y2={y1 + len * Math.sin(a)}
                stroke={color.lineWhiteStrong} strokeWidth={1.5} />
            );
          })()}
          {visibleGuide.kind === 'dashedVertical' && (
            <Line x1={visibleGuide.x * size.w} y1={visibleGuide.top * size.h} x2={visibleGuide.x * size.w} y2={(visibleGuide.top + visibleGuide.height) * size.h}
              stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} strokeDasharray="5,4" />
          )}
          {visibleGuide.kind === 'ellipse' && (
            <Ellipse cx={visibleGuide.cx * size.w} cy={visibleGuide.cy * size.h} rx={visibleGuide.rx * size.w} ry={visibleGuide.ry * size.h}
              stroke={visibleGuide.dashed ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.9)'} strokeWidth={1.5}
              fill="none" strokeDasharray={visibleGuide.dashed ? '6,5' : undefined} />
          )}
          {visibleGuide.kind === 'polyline' && visibleGuide.points.length >= 2 && (
            <Polyline
              points={visibleGuide.points.map(p => `${p.x * size.w},${p.y * size.h}`).join(' ')}
              fill="none"
              stroke={color.lineWhiteStrong}
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          )}
          {visibleGuide.kind === 'measurement' && (() => {
            const points = visibleGuide.points.map(point => ({
              x: point.x * size.w,
              y: point.y * size.h,
            }));
            if (points.length < 2) return null;
            if (visibleGuide.measurementKind === 'contour') {
              return (
                <Polyline
                  points={points.map(point => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  stroke={color.lineWhiteStrong}
                  strokeWidth={2}
                />
              );
            }
            const pairs: {x: number; y: number}[][] = [];
            for (let index = 0; index + 1 < points.length; index += 2) {
              pairs.push([points[index], points[index + 1]]);
            }
            return (
              <>
                {pairs.map(([from, to], pairIndex) => {
                  const cap = 4;
                  const isAngle = visibleGuide.measurementKind === 'angle';
                  const radius = Math.min(16, Math.abs(to.x - from.x) * 0.28);
                  const angle = Math.atan2(to.y - from.y, to.x - from.x);
                  const endAngle = angle < 0 ? angle : angle;
                  const arcEnd = {
                    x: from.x + radius * Math.cos(endAngle),
                    y: from.y + radius * Math.sin(endAngle),
                  };
                  return (
                    <React.Fragment key={pairIndex}>
                      {isAngle ? (
                        <>
                          <Line
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={from.y}
                            stroke="rgba(255,255,255,0.62)"
                            strokeWidth={1}
                            strokeDasharray="4 3"
                          />
                          <Path
                            d={`M ${from.x + radius} ${from.y} A ${radius} ${radius} 0 0 ${angle < 0 ? 0 : 1} ${arcEnd.x} ${arcEnd.y}`}
                            fill="none"
                            stroke={color.lineWhiteStrong}
                            strokeWidth={1.5}
                          />
                        </>
                      ) : null}
                      <Line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={color.lineWhiteStrong}
                        strokeWidth={2}
                      />
                      <Line
                        x1={from.x}
                        y1={from.y - cap}
                        x2={from.x}
                        y2={from.y + cap}
                        stroke={color.lineWhiteStrong}
                        strokeWidth={1.5}
                      />
                      <Line
                        x1={to.x}
                        y1={to.y - cap}
                        x2={to.x}
                        y2={to.y + cap}
                        stroke={color.lineWhiteStrong}
                        strokeWidth={1.5}
                      />
                      <SvgCircle cx={from.x} cy={from.y} r={2.5} fill={color.accentDeep} stroke={color.white} strokeWidth={1} />
                      <SvgCircle cx={to.x} cy={to.y} r={2.5} fill={color.accentDeep} stroke={color.white} strokeWidth={1} />
                    </React.Fragment>
                  );
                })}
              </>
            );
          })()}
            </React.Fragment>
          ))}
        </Svg>
      )}
      {guide.kind === 'slantLine' && (
        <View style={{
          position: 'absolute', left: pct(guide.marker.x * 100), top: pct(guide.marker.y * 100),
          width: 9, height: 9, borderRadius: 4.5, backgroundColor: color.magenta,
          borderWidth: 2, borderColor: color.white,
        }} />
      )}
      {visibleGuides.length > 0 && activeLabel ? (
        <View style={{
          position: 'absolute', bottom: 10, flexDirection: 'row',
          ...(labelAlign === 'left' ? { left: pct(labelX * 100) } : { right: pct(labelX * 100) }),
        }}>
          <Pill variant="dark" label={activeLabel} />
        </View>
      ) : null}
    </View>
  );
}
