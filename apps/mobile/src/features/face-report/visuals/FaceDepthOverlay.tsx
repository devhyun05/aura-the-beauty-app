import React, {useMemo, useState} from 'react';
import {Text, View} from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  RadialGradient,
  Skia,
  vec,
} from '@shopify/react-native-skia';

import type {
  Face3DPhotoEvidence,
  Face3DPhotoEvidencePoint,
} from '../../face-3d/services/face3DPhotoEvidence';
import {color, font, radius} from '../reportTokens';

type CropRect = {x: number; y: number; w: number; h: number};

export function FaceDepthOverlay({
  activeMetricKeys,
  cropRect,
  evidence,
}: {
  activeMetricKeys: string[];
  cropRect?: CropRect;
  evidence: Face3DPhotoEvidence;
}) {
  const [size, setSize] = useState({w: 0, h: 0});
  const crop = cropRect ?? {x: 0, y: 0, w: 1, h: 1};
  const active = new Set(activeMetricKeys);
  const visibleRegions = Object.values(evidence.regions).filter(
    region => region && region.metricKeys.some(key => active.has(key)),
  );

  const toFrame = (point: Face3DPhotoEvidencePoint) => ({
    x: ((point.x - crop.x) / crop.w) * size.w,
    y: ((point.y - crop.y) / crop.h) * size.h,
  });
  const renderRegions = useMemo(
    () =>
      visibleRegions.flatMap(region => {
        if (!region || size.w <= 0 || size.h <= 0) return [];
        const hull = region.hull.map(toFrame);
        const path = Skia.Path.Make();
        path.moveTo(hull[0].x, hull[0].y);
        hull.slice(1).forEach(point => path.lineTo(point.x, point.y));
        path.close();
        return [{
          path,
          pin: toFrame(region.pin),
          pinLabel: region.pin.label,
          samples: region.samples.map(sample => ({
            ...toFrame(sample),
            relativeDepth: sample.relativeDepth,
          })),
        }];
      }),
    // crop is a plain DTO and the evidence object is immutable after parsing.
    [crop.h, crop.w, crop.x, crop.y, evidence, size.h, size.w, activeMetricKeys.join('|')],
  );

  if (visibleRegions.length === 0) return null;

  return (
    <View
      pointerEvents="none"
      style={{position: 'absolute', inset: 0}}
      onLayout={event =>
        setSize({
          w: event.nativeEvent.layout.width,
          h: event.nativeEvent.layout.height,
        })
      }>
      {size.w > 0 && size.h > 0 ? (
        <Canvas style={{position: 'absolute', inset: 0}}>
          {renderRegions.map((region, regionIndex) => (
            <Group key={regionIndex} clip={region.path}>
              {region.samples.map((sample, sampleIndex) => {
                const heat = Math.max(0, Math.min(1, sample.relativeDepth));
                const heatRadius = Math.max(12, Math.min(size.w, size.h) * 0.1);
                return (
                  <Circle
                    key={sampleIndex}
                    cx={sample.x}
                    cy={sample.y}
                    r={heatRadius}>
                    <RadialGradient
                      c={vec(sample.x, sample.y)}
                      r={heatRadius}
                      colors={[
                        `rgba(14,125,168,${(0.12 + heat * 0.42).toFixed(3)})`,
                        'rgba(14,125,168,0)',
                      ]}
                    />
                  </Circle>
                );
              })}
            </Group>
          ))}
        </Canvas>
      ) : null}
      {renderRegions.map((region, index) => (
        <View
          key={`pin-${index}`}
          style={{
            position: 'absolute',
            left: region.pin.x - 10,
            top: region.pin.y - 10,
            alignItems: 'center',
          }}>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: color.accentDeep,
              borderColor: color.white,
              borderWidth: 1.5,
            }}>
            <Text style={[font(9, '800'), {color: color.white}]}>+Z</Text>
          </View>
          <View
            style={{
              marginTop: 3,
              borderRadius: radius.pill,
              backgroundColor: 'rgba(22,48,59,0.76)',
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}>
            <Text style={[font(9, '700'), {color: color.white}]}>
              ⊙ {region.pinLabel}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
