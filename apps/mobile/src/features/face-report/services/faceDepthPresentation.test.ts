import {
  formatRelativeDepthValue,
  relativeDepthDirection,
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
