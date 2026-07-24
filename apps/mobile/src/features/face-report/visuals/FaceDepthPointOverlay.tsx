import React, {useMemo, useState} from 'react';
import {View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';

import type {Face3DPhotoEvidence} from '../../face-3d/services/face3DPhotoEvidence';
import {
  projectDepthPoint,
  selectSupportingDepthSamples,
} from '../services/faceDepthPresentation';
import {color} from '../reportTokens';

type CropRect = {x: number; y: number; w: number; h: number};

export function FaceDepthPointOverlay({
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
  const renderRegions = useMemo(() => {
    if (size.w <= 0 || size.h <= 0) return [];
    const active = new Set(activeMetricKeys);
    return Object.values(evidence.regions).flatMap(region => {
      if (!region || !region.metricKeys.some(key => active.has(key))) return [];
      const pinNormalized = projectDepthPoint(region.pin, crop);
      const pin = {
        x: pinNormalized.x * size.w,
        y: pinNormalized.y * size.h,
      };
      const samples = selectSupportingDepthSamples(region.samples, region.pin)
        .map(sample => {
          const projected = projectDepthPoint(sample, crop);
          return {
            x: projected.x * size.w,
            y: projected.y * size.h,
          };
        });
      return [{
        key: region.pin.metricKey,
        pin,
        samples,
      }];
    });
  }, [
    activeMetricKeys,
    crop,
    evidence,
    size.h,
    size.w,
  ]);

  if (
    !Object.values(evidence.regions).some(
      region => region?.metricKeys.some(key => activeMetricKeys.includes(key)),
    )
  ) {
    return null;
  }

  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={{position: 'absolute', inset: 0}}
      onLayout={event =>
        setSize({
          w: event.nativeEvent.layout.width,
          h: event.nativeEvent.layout.height,
        })
      }>
      {size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h}>
          {renderRegions.flatMap(region =>
            region.samples.map((sample, index) => (
              <Circle
                key={`${region.key}-sample-${index}`}
                cx={sample.x}
                cy={sample.y}
                r={2.75}
                fill="rgba(255,255,255,0.68)"
                stroke={color.accentDeep}
                strokeOpacity={0.78}
                strokeWidth={1}
              />
            )),
          )}
          {renderRegions.map(region => (
            <React.Fragment key={`${region.key}-pin`}>
              <Circle
                cx={region.pin.x}
                cy={region.pin.y}
                r={9.5}
                fill="rgba(255,255,255,0.10)"
                stroke={color.white}
                strokeOpacity={0.72}
                strokeWidth={1}
              />
              <Circle
                cx={region.pin.x}
                cy={region.pin.y}
                r={4.75}
                fill={color.accentDeep}
                stroke={color.white}
                strokeWidth={2}
              />
            </React.Fragment>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
