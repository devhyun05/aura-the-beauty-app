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
  '밝고 고른 빛에서,이마가 보이게,양쪽 귀가 보이게,액세서리 없이,표정은 편안하게,턱끝까지 화면 안에',
  'face analysis intro step titles',
);
<FaceAnalysisIntroScreen onStartAnalysisGuide={() => undefined} />;
