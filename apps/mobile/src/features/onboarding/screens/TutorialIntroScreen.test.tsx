import React from 'react';

import {
  TutorialIntroScreen,
  getTutorialIntroHeaderPresentation,
  getTutorialIntroHeroContent,
} from './TutorialIntroScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const heroContent = getTutorialIntroHeroContent();
const headerPresentation = getTutorialIntroHeaderPresentation();
const tutorialIntroTitle: '얼굴 분석을 시작합니다.' = heroContent.title;

expectEqual(heroContent.brand, 'AURA', 'tutorial intro brand');
expectEqual(tutorialIntroTitle, '얼굴 분석을 시작합니다.', 'tutorial intro title');
expectEqual(
  heroContent.subtitle,
  '내 얼굴에 맞는 메이크업을 추천받고,\n나만의 룩으로 자연스럽게 완성해보세요.',
  'tutorial intro subtitle',
);
expectEqual(heroContent.primaryActionLabel, '분석 시작', 'tutorial intro primary action');
expectEqual(
  headerPresentation.headerComponent,
  'AppHeader',
  'tutorial intro header component',
);
expectEqual(headerPresentation.title, '얼굴 분석', 'tutorial intro header title');

<TutorialIntroScreen
  onCloseToHome={() => undefined}
  onStartCapture={() => undefined}
  onStartDiagnosis={() => undefined}
/>;
