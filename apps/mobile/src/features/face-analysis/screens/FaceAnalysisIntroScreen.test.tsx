import React from 'react';

import {
  FaceAnalysisIntroScreen,
  getFaceAnalysisCapturePlanTitles,
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
const primaryAction: '시작하기' = content.primaryActionLabel;

expectEqual(introTitle, '얼굴 분석으로\n나에게 맞는 룩을 찾아요', 'face analysis intro title');
expectEqual(primaryAction, '시작하기', 'face analysis intro primary action');
expectEqual(
  getFaceAnalysisCapturePlanTitles().join(','),
  '통합 얼굴 촬영',
  'face analysis capture plan titles',
);
expectEqual(
  content.captureDuration,
  '보통 10초 내외이며, 얼굴을 맞추는 시간에 따라 더 걸릴 수 있어요.',
  'face analysis capture duration',
);
expectEqual(
  getFaceAnalysisIntroStepTitles().join(','),
  '취향 설문,사진 촬영,맞춤 추천',
  'face analysis intro step titles',
);

<FaceAnalysisIntroScreen onStartAnalysisGuide={() => undefined} />;
