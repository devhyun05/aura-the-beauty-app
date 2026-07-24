import {
  formatDepthMeasurementValues,
  formatRelativeDepthValue,
  projectDepthPoint,
  relativeDepthDirection,
  selectSupportingDepthSamples,
} from './faceDepthPresentation';

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

assertEqual(formatRelativeDepthValue(0.3439), '+0.34', 'positive depth');
assertEqual(formatRelativeDepthValue(-0.087), '-0.09', 'negative depth');
assertEqual(formatRelativeDepthValue(-0.001), '+0.00', 'near-zero depth');
assertEqual(relativeDepthDirection(0.2), '전방', 'forward direction');
assertEqual(relativeDepthDirection(-0.2), '후방', 'behind direction');
assertEqual(relativeDepthDirection(0.01), '기준면', 'reference plane direction');
assertEqual(
  formatDepthMeasurementValues([{label: '코끝', normalizedValue: 0.3439}]),
  '전방 · 상대값 +0.34',
  'single depth value',
);
assertEqual(
  formatDepthMeasurementValues([
    {label: '왼쪽 광대', normalizedValue: 0.12},
    {label: '오른쪽 광대', normalizedValue: -0.08},
  ]),
  '좌 전방 +0.12 · 우 후방 -0.08',
  'paired depth values',
);
assertEqual(
  formatDepthMeasurementValues([]),
  undefined,
  'empty depth values',
);

const projected = projectDepthPoint(
  {x: 0.4, y: 0.5},
  {x: 0.2, y: 0.25, w: 0.4, h: 0.5},
);
assertEqual(projected.x, 0.5, 'crop projection x');
assertEqual(projected.y, 0.5, 'crop projection y');

const samples = Array.from({length: 10}, (_, index) => ({
  id: index,
  x: index / 10,
  y: (index % 3) / 10,
}));
const selected = selectSupportingDepthSamples(samples, {x: 0.5, y: 0.5});
assertEqual(selected.length, 6, 'supporting sample cap');
assertEqual(
  selectSupportingDepthSamples(samples, {x: 0.5, y: 0.5}).map(sample => sample.id).join(','),
  selected.map(sample => sample.id).join(','),
  'supporting sample selection is deterministic',
);
assertEqual(
  selectSupportingDepthSamples([{x: 0.5, y: 0.5}], {x: 0.5, y: 0.5}).length,
  0,
  'pin duplicate is omitted from supporting samples',
);
