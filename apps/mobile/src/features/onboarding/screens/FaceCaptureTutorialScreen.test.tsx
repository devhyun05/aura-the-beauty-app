import React from 'react';

import {
  FACE_CAPTURE_TUTORIAL_IMAGE_ASPECT_RATIO,
  FACE_CAPTURE_TUTORIAL_SWIPE_HINT_LABEL,
  FaceCaptureTutorialScreen,
  getFaceCaptureTutorialIconNames,
  getFaceCaptureTutorialNavigationMode,
  getFaceCaptureTutorialVisualPresentation,
  getFaceCaptureTutorialSteps,
} from './FaceCaptureTutorialScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const guideSteps = getFaceCaptureTutorialSteps();
const iconNames = getFaceCaptureTutorialIconNames();
const navigationMode = getFaceCaptureTutorialNavigationMode();
const visualPresentation = getFaceCaptureTutorialVisualPresentation();
const lastStep = guideSteps[guideSteps.length - 1];
const imageFillPresentation: {
  imageFillMode: 'fit-image';
  imageFillScale: 1;
} = visualPresentation;

void imageFillPresentation;

expectEqual(guideSteps.length, 4, 'face capture tutorial step count');
expectEqual(guideSteps[0].iconKey, 'face', 'face capture first step icon');
expectEqual(guideSteps[2].iconKey, 'accessory', 'face capture accessory step icon');
expectEqual(iconNames.accessory, 'glasses', 'face capture accessory icon name');
expectEqual(guideSteps[0].buttonLabel, null, 'face capture first step action');
expectEqual(navigationMode.stepAdvance, 'swipe', 'face capture tutorial step advance');
expectEqual(
  navigationMode.showsStepAdvanceButton,
  false,
  'face capture tutorial step advance button',
);
expectEqual(lastStep.requiresPrivacyAgreement, true, 'face capture privacy agreement');
expectEqual(lastStep.buttonLabel, '촬영하기', 'face capture final action');
expectEqual(
  FACE_CAPTURE_TUTORIAL_IMAGE_ASPECT_RATIO,
  448 / 362,
  'face capture tutorial image aspect ratio',
);
expectEqual(visualPresentation.showsImageChip, false, 'face capture image chip');
expectEqual(visualPresentation.usesImageScrim, false, 'face capture image scrim');
expectEqual(
  visualPresentation.imageFillMode,
  'fit-image',
  'face capture image fill mode',
);
expectEqual(
  visualPresentation.imageFillScale,
  1,
  'face capture image fill scale',
);
expectEqual(visualPresentation.finalActionWidth, 'compact', 'face capture final action width');
expectEqual(
  visualPresentation.finalPrivacyPlacement,
  'below-pagination-above-action',
  'face capture privacy placement',
);
expectEqual(
  visualPresentation.showsPageNumberChip,
  false,
  'face capture page number chip',
);
expectEqual(
  visualPresentation.headerDismissControl,
  'close-to-home',
  'face capture header dismiss control',
);
expectEqual(
  visualPresentation.swipeNavigationPlacement,
  'fixed-above-swipe-hint',
  'face capture swipe navigation placement',
);
expectEqual(
  FACE_CAPTURE_TUTORIAL_SWIPE_HINT_LABEL,
  '좌우로 넘겨 주세요.',
  'face capture swipe hint label',
);

<FaceCaptureTutorialScreen
  onBackToIntro={() => undefined}
  onCloseToHome={() => undefined}
  onStartCapture={() => undefined}
/>;
