export const DEPTH_NEUTRAL_THRESHOLD = 0.015;

export type DepthMeasurementValue = {
  label: string;
  normalizedValue: number;
};

export type DepthPoint = {
  x: number;
  y: number;
};

export type DepthCropRect = DepthPoint & {
  w: number;
  h: number;
};

export function formatRelativeDepthValue(value: number): string {
  if (!Number.isFinite(value)) return '측정 보류';
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

export function relativeDepthDirection(value: number): '기준면' | '전방' | '후방' {
  if (Math.abs(value) < DEPTH_NEUTRAL_THRESHOLD) return '기준면';
  return value > 0 ? '전방' : '후방';
}

function compactDepthLabel(label: string): string {
  if (label.startsWith('왼쪽')) return '좌';
  if (label.startsWith('오른쪽')) return '우';
  return label;
}

export function formatDepthMeasurementValues(
  values: DepthMeasurementValue[],
): string | undefined {
  const finite = values.filter(value => Number.isFinite(value.normalizedValue));
  if (finite.length === 0) return undefined;
  if (finite.length === 1) {
    const value = finite[0].normalizedValue;
    return `${relativeDepthDirection(value)} · 상대값 ${formatRelativeDepthValue(value)}`;
  }
  return finite
    .map(value =>
      `${compactDepthLabel(value.label)} ${relativeDepthDirection(value.normalizedValue)} ${formatRelativeDepthValue(value.normalizedValue)}`,
    )
    .join(' · ');
}

export function projectDepthPoint(
  point: DepthPoint,
  crop: DepthCropRect,
): DepthPoint {
  return {
    x: (point.x - crop.x) / crop.w,
    y: (point.y - crop.y) / crop.h,
  };
}

export function selectSupportingDepthSamples<T extends DepthPoint>(
  samples: readonly T[],
  pin: DepthPoint,
  maximum = 6,
): T[] {
  if (maximum <= 0) return [];
  const unique = samples.filter((sample, index) => {
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return false;
    if ((sample.x - pin.x) ** 2 + (sample.y - pin.y) ** 2 < 1e-8) return false;
    return samples.findIndex(candidate =>
      Math.abs(candidate.x - sample.x) < 1e-6
      && Math.abs(candidate.y - sample.y) < 1e-6,
    ) === index;
  });
  if (unique.length <= maximum) return unique;

  const selected: {sample: T; index: number}[] = [];
  const references: DepthPoint[] = [pin];
  while (selected.length < maximum) {
    let bestIndex = -1;
    let bestDistance = -1;
    unique.forEach((sample, index) => {
      if (selected.some(item => item.index === index)) return;
      const nearestDistance = references.reduce(
        (nearest, reference) =>
          Math.min(
            nearest,
            (sample.x - reference.x) ** 2 + (sample.y - reference.y) ** 2,
          ),
        Number.POSITIVE_INFINITY,
      );
      if (nearestDistance > bestDistance) {
        bestDistance = nearestDistance;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) break;
    selected.push({sample: unique[bestIndex], index: bestIndex});
    references.push(unique[bestIndex]);
  }
  return selected
    .sort((left, right) => left.index - right.index)
    .map(item => item.sample);
}
