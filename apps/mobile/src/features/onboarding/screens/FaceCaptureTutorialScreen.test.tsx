import React from 'react';

import {
  FACE_CAPTURE_TUTORIAL_IMAGE_ASPECT_RATIO,
  FACE_CAPTURE_TUTORIAL_ACCESSIBILITY_LABEL,
  FaceCaptureTutorialScreen,
  FaceCaptureTutorialSheet,
  getFaceCaptureTutorialComparisonBadges,
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
const comparisonBadges = getFaceCaptureTutorialComparisonBadges();
const navigationMode = getFaceCaptureTutorialNavigationMode();
const visualPresentation = getFaceCaptureTutorialVisualPresentation();
const lastStep = guideSteps[guideSteps.length - 1];
const finalStepRequiresPrivacyAgreement: false = lastStep.requiresPrivacyAgreement;
const imageFillPresentation: {
  imageFillMode: 'fit-image';
  imageFillScale: 1;
} = visualPresentation;
const finalPrivacyPlacement: 'none' = visualPresentation.finalPrivacyPlacement;
const sheetPresentation: 'bottom-modal-sheet' = visualPresentation.sheetPresentation;

void imageFillPresentation;

expectEqual(guideSteps.length, 6, 'face capture tutorial step count');
expectEqual(
  guideSteps.map(step => step.id).join(','),
  'light,forehead,ears,accessory,expression,framing',
  'face capture tutorial checklist order',
);
expectEqual(
  guideSteps.map(step => step.heading).join(','),
  '밝고 고른 빛에서,이마가 보이게,양쪽 귀가 보이게,액세서리 없이,표정은 편안하게,턱끝까지 화면 안에',
  'face capture tutorial checklist headings',
);
expectEqual(guideSteps[0].iconKey, 'light', 'face capture first step icon');
expectEqual(guideSteps[3].iconKey, 'accessory', 'face capture accessory step icon');
expectEqual(iconNames.accessory, 'glasses', 'face capture accessory icon name');
expectEqual(guideSteps[0].buttonLabel, null, 'face capture first step action');
expectEqual(guideSteps[5].stepLabel, '6/6', 'face capture final step label');
expectEqual(
  guideSteps.every(step => step.imageAccessibilityLabel.length > 0),
  true,
  'face capture comparison image accessibility labels',
);
expectEqual(comparisonBadges.source, 'ui-overlay', 'face capture comparison badge source');
expectEqual(comparisonBadges.incorrect.icon, 'x', 'face capture incorrect badge icon');
expectEqual(
  comparisonBadges.incorrect.placement,
  'left-panel-bottom-right',
  'face capture incorrect badge placement',
);
expectEqual(comparisonBadges.correct.icon, 'check', 'face capture correct badge icon');
expectEqual(
  comparisonBadges.correct.placement,
  'right-panel-bottom-right',
  'face capture correct badge placement',
);
expectEqual(navigationMode.stepAdvance, 'swipe', 'face capture tutorial step advance');
expectEqual(
  navigationMode.showsStepAdvanceButton,
  false,
  'face capture tutorial step advance button',
);
expectEqual(
  finalStepRequiresPrivacyAgreement,
  false,
  'face capture privacy agreement removed',
);
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
  finalPrivacyPlacement,
  'none',
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
  visualPresentation.headerComponent,
  'AppHeader',
  'face capture tutorial common header component',
);
expectEqual(
  sheetPresentation,
  'bottom-modal-sheet',
  'face capture tutorial sheet presentation',
);
expectEqual(
  visualPresentation.sheetDismissControl,
  'close-button',
  'face capture tutorial sheet dismiss control',
);
expectEqual(
  visualPresentation.swipeNavigationPlacement,
  'fixed-footer-pagination',
  'face capture swipe navigation placement',
);
expectEqual(
  FACE_CAPTURE_TUTORIAL_ACCESSIBILITY_LABEL,
  '사진 촬영 가이드',
  'face capture tutorial accessibility label',
);

<FaceCaptureTutorialScreen
  onBackToIntro={() => undefined}
  onCloseToHome={() => undefined}
  onStartCapture={() => undefined}
/>;

<FaceCaptureTutorialSheet
  isVisible={false}
  onDismiss={() => undefined}
  onStartCapture={() => undefined}
/>;
