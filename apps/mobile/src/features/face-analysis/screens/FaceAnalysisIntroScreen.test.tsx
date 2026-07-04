import React from 'react';

import {
  FaceAnalysisIntroScreen,
  getFaceAnalysisIntroContent,
  getFaceAnalysisIntroStepTitles,
} from './FaceAnalysisIntroScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const content = getFaceAnalysisIntroContent();
const introTitle: '얼굴 분석으로\n나에게 맞는 룩을 찾아요' = content.title;
const primaryAction: '얼굴 분석 시작하기' = content.primaryActionLabel;

expectEqual(introTitle, '얼굴 분석으로\n나에게 맞는 룩을 찾아요', 'face analysis intro title');
expectEqual(primaryAction, '얼굴 분석 시작하기', 'face analysis intro primary action');
expectEqual(
  getFaceAnalysisIntroStepTitles().join(','),
  '취향 설문,사진 촬영,맞춤 추천',
  'face analysis intro step titles',
);

<FaceAnalysisIntroScreen onStartAnalysisGuide={() => undefined} />;
