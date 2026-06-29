import React from 'react';

import {
  filterSavedRecommendedMakeups,
  getSavedMakeupPageCount,
  paginateSavedRecommendedMakeups,
  SavedMakeupListScreen,
  type SavedRecommendedMakeup,
} from './SavedMakeupListScreen';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';

<SavedMakeupListScreen onPressMakeup={() => undefined} />;

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const savedMakeups: SavedRecommendedMakeup[] = Array.from({length: 15}, (_, index) => ({
  id: `saved-${index + 1}`,
  makeup: {
    description: index === 13 ? '로지 브라운 립과 치크' : '데일리 추천',
    id: `makeup-${index + 1}`,
    imageSource: {uri: `https://example.com/makeup-${index + 1}.png`},
    subtitle: index === 4 ? '코랄 글로우' : '맞춤 추천',
    tags: index === 8 ? ['브라운', '눈썹'] : [],
    title: `추천 룩 ${index + 1}`,
  },
  makeupIndex: index % 3,
  report: undefined as unknown as FaceAnalysisReport,
  reportAnalyzedAt: '2026-06-29T07:00:00.000Z',
  reportId: `report-${Math.floor(index / 3) + 1}`,
  reportMood: index === 2 ? '쿨 로즈 무드' : '맑은 데일리',
  reportTitle: '맞춤 분석 보고서',
}));

expectEqual(getSavedMakeupPageCount(savedMakeups.length), 4, 'saved makeup total pages');
expectEqual(
  paginateSavedRecommendedMakeups(savedMakeups, 1).length,
  4,
  'saved makeup first page size',
);
expectEqual(
  paginateSavedRecommendedMakeups(savedMakeups, 2).length,
  4,
  'saved makeup second page size',
);
expectEqual(
  paginateSavedRecommendedMakeups(savedMakeups, 4).length,
  3,
  'saved makeup last page size',
);
expectEqual(
  filterSavedRecommendedMakeups(savedMakeups, '코랄').length,
  1,
  'saved makeup search by subtitle',
);
expectEqual(
  filterSavedRecommendedMakeups(savedMakeups, '브라운').length,
  2,
  'saved makeup search by tags and description',
);
expectEqual(
  filterSavedRecommendedMakeups(savedMakeups, '쿨 로즈').length,
  1,
  'saved makeup search by report mood',
);
