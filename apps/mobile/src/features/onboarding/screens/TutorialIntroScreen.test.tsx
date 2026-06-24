import React from 'react';

import {TutorialIntroScreen, getTutorialIntroHeroContent} from './TutorialIntroScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const heroContent = getTutorialIntroHeroContent();

expectEqual(heroContent.brand, 'AURA', 'tutorial intro brand');
expectEqual(heroContent.title, '이미지 진단을 시작합니다.', 'tutorial intro title');
expectEqual(
  heroContent.subtitle,
  '내 얼굴에 맞는 메이크업을 추천받고,\n나만의 스타일로 자연스럽게 완성해보세요.',
  'tutorial intro subtitle',
);
expectEqual(heroContent.primaryActionLabel, '진단 시작', 'tutorial intro primary action');

<TutorialIntroScreen
  onCloseToHome={() => undefined}
  onStartCapture={() => undefined}
  onStartDiagnosis={() => undefined}
/>;
