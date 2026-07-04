import {
  getFloatingActionInteractionModeLabels,
  getFloatingActionSelectionBadgeLabel,
} from './FloatingActionSettingsScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getFloatingActionInteractionModeLabels().join(','),
  '탭으로 열기,드래그로 실행',
  'floating action interaction mode labels',
);

expectEqual(
  getFloatingActionSelectionBadgeLabel(['makeupExtraction', 'arFilter'], 'makeupExtraction'),
  '1',
  'first selected floating action badge label',
);

expectEqual(
  getFloatingActionSelectionBadgeLabel(['makeupExtraction', 'arFilter'], 'arFilter'),
  '2',
  'second selected floating action badge label',
);

expectEqual(
  getFloatingActionSelectionBadgeLabel(['makeupExtraction', 'arFilter'], 'makeupFeedback'),
  '',
  'unselected floating action badge label',
);
