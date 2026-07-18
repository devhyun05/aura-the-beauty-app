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
const introTitle: '맞춤 스타일링을 위한\n얼굴 분석' = content.title;
const primaryAction: '촬영 가이드 보기' = content.primaryActionLabel;

expectEqual(introTitle, '맞춤 스타일링을 위한\n얼굴 분석', 'face analysis intro title');
expectEqual(primaryAction, '촬영 가이드 보기', 'face analysis intro primary action');
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
  '자연광 아래에서 찍기,이마 보이기,귀 보이게 하기,액세서리 빼기,무표정으로 찍기,턱선까지 넣기',
  'face analysis intro step titles',
);
<FaceAnalysisIntroScreen onStartAnalysisGuide={() => undefined} />;
