import {
  getFloatingActionButtonPositionLabels,
  getFloatingActionCandidateLabels,
  getFloatingActionInteractionModeLabels,
  getFloatingActionInteractionModeSelectionBadgeLabel,
  getFloatingActionSelectionBadgeLabel,
  getFloatingActionSelectedCountLabel,
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
  getFloatingActionInteractionModeSelectionBadgeLabel(),
  '하나 선택',
  'floating action interaction mode single selection badge',
);

expectEqual(
  getFloatingActionButtonPositionLabels().join(','),
  '오른쪽,왼쪽',
  'floating action button position labels',
);

expectEqual(
  getFloatingActionCandidateLabels().join(','),
  '메이크업 필터,메이크업 추출,메이크업 피드백,얼굴 분석,추천 제품,필터 스토어',
  'floating action candidate labels',
);

expectEqual(
  getFloatingActionSelectedCountLabel(['arFilter', 'makeupExtraction', 'makeupFeedback']),
  '3/3 선택됨',
  'floating action selected count label',
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
