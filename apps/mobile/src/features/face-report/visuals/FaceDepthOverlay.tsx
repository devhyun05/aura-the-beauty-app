import React, {useMemo, useState} from 'react';
import {Text, View} from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  RadialGradient,
  vec,
} from '@shopify/react-native-skia';

import type {
  Face3DPhotoEvidence,
  Face3DPhotoEvidencePoint,
} from '../../face-3d/services/face3DPhotoEvidence';
import type {RegionMeasurementValueData} from '../reportTypes';
import {
  formatRelativeDepthValue,
  relativeDepthDirection,
} from '../services/faceDepthPresentation';
import {color, font, radius} from '../reportTokens';

type CropRect = {x: number; y: number; w: number; h: number};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

function heatColor(signedDepth: number | undefined, strength: number): string {
  const alpha = 0.18 + clamp(strength, 0, 1) * 0.34;
  if (signedDepth === undefined) {
    return `rgba(21,124,153,${alpha.toFixed(3)})`;
  }
  if (signedDepth < -0.015) {
    return `rgba(30,118,145,${alpha.toFixed(3)})`;
  }
  if (signedDepth > 0.015) {
    return `rgba(218,105,91,${alpha.toFixed(3)})`;
  }
  return `rgba(244,225,196,${Math.min(alpha, 0.3).toFixed(3)})`;
}

export function FaceDepthOverlay({
  activeMetricKeys,
  cropRect,
  evidence,
  measurementValues = [],
}: {
  activeMetricKeys: string[];
  cropRect?: CropRect;
  evidence: Face3DPhotoEvidence;
  measurementValues?: RegionMeasurementValueData[];
}) {
  const [size, setSize] = useState({w: 0, h: 0});
  const crop = cropRect ?? {x: 0, y: 0, w: 1, h: 1};
  const active = new Set(activeMetricKeys);
  const visibleRegions = Object.values(evidence.regions).filter(
    region => region && region.metricKeys.some(key => active.has(key)),
  );
  const valueByMetric = useMemo(
    () => new Map(measurementValues.map(value => [value.metricKey, value])),
    [measurementValues],
  );

  const toFrame = (point: Face3DPhotoEvidencePoint) => ({
    x: ((point.x - crop.x) / crop.w) * size.w,
    y: ((point.y - crop.y) / crop.h) * size.h,
  });
  const renderRegions = useMemo(
    () =>
      visibleRegions.flatMap(region => {
        if (!region || size.w <= 0 || size.h <= 0) return [];
        const transformedSamples = region.samples.map(sample => ({
          ...toFrame(sample),
          relativeDepth: sample.relativeDepth,
          signedDepthNormalized: sample.signedDepthNormalized,
        }));
        const sampleStride = Math.max(1, Math.ceil(transformedSamples.length / 40));
        const samples = transformedSamples.filter((_, index) => index % sampleStride === 0);
        const sampleWidth =
          Math.max(...transformedSamples.map(sample => sample.x))
          - Math.min(...transformedSamples.map(sample => sample.x));
        const sampleHeight =
          Math.max(...transformedSamples.map(sample => sample.y))
          - Math.min(...transformedSamples.map(sample => sample.y));
        const localSpan = Math.max(8, Math.min(sampleWidth, sampleHeight));
        return [{
          pin: toFrame(region.pin),
          pinLabel: region.pin.label,
          pinMetricKey: region.pin.metricKey,
          sampleRadius: clamp(localSpan * 0.55 + 9, 12, Math.min(size.w, size.h) * 0.075),
          samples,
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
          <Group opacity={0.92}>
            {renderRegions.flatMap((region, regionIndex) =>
              region.samples.map((sample, sampleIndex) => {
                const signedDepth = sample.signedDepthNormalized;
                const strength =
                  signedDepth === undefined
                    ? clamp(sample.relativeDepth, 0, 1)
                    : clamp(Math.abs(signedDepth) / 0.38, 0.08, 1);
                const sampleColor = heatColor(signedDepth, strength);
                return (
                  <Circle
                    key={`${regionIndex}-${sampleIndex}`}
                    cx={sample.x}
                    cy={sample.y}
                    r={region.sampleRadius}>
                    <RadialGradient
                      c={vec(sample.x, sample.y)}
                      r={region.sampleRadius}
                      colors={[sampleColor, 'rgba(255,255,255,0)']}
                    />
                    <BlurMask
                      blur={Math.max(4, region.sampleRadius * 0.34)}
                      style="normal"
                    />
                  </Circle>
                );
              }),
            )}
          </Group>
          {renderRegions.map((region, regionIndex) => {
            const value = valueByMetric.get(region.pinMetricKey);
            const signedValue = value?.normalizedValue;
            const ringColor =
              signedValue !== undefined && signedValue < -0.015
                ? 'rgba(30,118,145,0.86)'
                : 'rgba(218,105,91,0.86)';
            return (
              <Group key={`focus-${regionIndex}`}>
                <Circle
                  cx={region.pin.x}
                  cy={region.pin.y}
                  r={10}
                  color={ringColor}
                  style="stroke"
                  strokeWidth={1.5}
                />
                <Circle
                  cx={region.pin.x}
                  cy={region.pin.y}
                  r={17}
                  color={ringColor.replace('0.86', '0.34')}
                  style="stroke"
                  strokeWidth={1}
                />
              </Group>
            );
          })}
        </Canvas>
      ) : null}
      {renderRegions.map((region, index) => {
        const value = valueByMetric.get(region.pinMetricKey);
        const normalizedValue = value?.normalizedValue;
        const label = value?.label ?? region.pinLabel;
        const calloutWidth = 104;
        const calloutLeft = clamp(region.pin.x - calloutWidth / 2, 8, size.w - calloutWidth - 8);
        const placeBelow = region.pin.y < 58;
        const calloutTop = placeBelow ? region.pin.y + 18 : region.pin.y - 58;
        return (
          <React.Fragment key={`pin-${index}`}>
            <View
              style={{
                position: 'absolute',
                left: region.pin.x - 4,
                top: region.pin.y - 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: color.white,
                borderColor: color.accentDeep,
                borderWidth: 2,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: calloutLeft,
                top: calloutTop,
                width: calloutWidth,
                borderRadius: radius.md,
                backgroundColor: 'rgba(18,42,52,0.88)',
                borderColor: 'rgba(255,255,255,0.34)',
                borderWidth: 1,
                paddingHorizontal: 8,
                paddingVertical: 6,
                alignItems: 'center',
              }}>
              <Text style={[font(9, '700'), {color: 'rgba(255,255,255,0.78)'}]}>
                {label}
              </Text>
              <Text style={[font(14, '800'), {color: color.white, marginTop: 1}]}>
                {normalizedValue === undefined
                  ? '상대 깊이'
                  : formatRelativeDepthValue(normalizedValue)}
              </Text>
              {normalizedValue !== undefined ? (
                <Text style={[font(8.5, '600'), {color: 'rgba(255,255,255,0.72)', marginTop: 1}]}>
                  기준면 대비 {relativeDepthDirection(normalizedValue)} · 상대값
                </Text>
              ) : null}
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}
