import React from 'react';

import {
  PHOTO_CAPTURE_GUIDE_IMAGE_ASPECT_RATIO,
  PHOTO_CAPTURE_GUIDE_SWIPE_HINT_LABEL,
  PhotoCaptureGuideScreen,
  getPhotoCaptureGuideNavigationMode,
  getPhotoCaptureGuideVisualPresentation,
  getPhotoCaptureGuideSteps,
} from './PhotoCaptureGuideScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const guideSteps = getPhotoCaptureGuideSteps();
const navigationMode = getPhotoCaptureGuideNavigationMode();
const visualPresentation = getPhotoCaptureGuideVisualPresentation();
const lastStep = guideSteps[guideSteps.length - 1];

expectEqual(guideSteps.length, 4, 'photo capture guide step count');
expectEqual(guideSteps[0].iconKey, 'face', 'photo capture first step icon');
expectEqual(guideSteps[0].buttonLabel, null, 'photo capture first step action');
expectEqual(navigationMode.stepAdvance, 'swipe', 'photo capture guide step advance');
expectEqual(
  navigationMode.showsStepAdvanceButton,
  false,
  'photo capture guide step advance button',
);
expectEqual(lastStep.requiresPrivacyAgreement, true, 'photo capture privacy agreement');
expectEqual(lastStep.buttonLabel, '촬영하기', 'photo capture final action');
expectEqual(
  PHOTO_CAPTURE_GUIDE_IMAGE_ASPECT_RATIO,
  448 / 362,
  'photo capture guide image aspect ratio',
);
expectEqual(visualPresentation.showsImageChip, false, 'photo capture image chip');
expectEqual(visualPresentation.usesImageScrim, false, 'photo capture image scrim');
expectEqual(
  visualPresentation.imageFillMode,
  'zoomed-cover',
  'photo capture image fill mode',
);
expectEqual(
  visualPresentation.imageFillScale,
  1.08,
  'photo capture image fill scale',
);
expectEqual(visualPresentation.finalActionWidth, 'compact', 'photo capture final action width');
expectEqual(
  visualPresentation.finalPrivacyPlacement,
  'below-pagination-above-action',
  'photo capture privacy placement',
);
expectEqual(
  visualPresentation.showsPageNumberChip,
  false,
  'photo capture page number chip',
);
expectEqual(
  visualPresentation.headerDismissControl,
  'close-to-home',
  'photo capture header dismiss control',
);
expectEqual(
  visualPresentation.swipeNavigationPlacement,
  'fixed-above-swipe-hint',
  'photo capture swipe navigation placement',
);
expectEqual(
  PHOTO_CAPTURE_GUIDE_SWIPE_HINT_LABEL,
  '좌우로 넘겨 주세요.',
  'photo capture swipe hint label',
);

<PhotoCaptureGuideScreen
  onBackToIntro={() => undefined}
  onCloseToHome={() => undefined}
  onStartCapture={() => undefined}
/>;
