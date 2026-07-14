import React from 'react';

import type {MakeupFeedbackPhotoSelection} from '../types';
import {getMakeupFeedbackRetakeActionLabels} from '../services/makeupFeedbackResultPresentation';
import {MakeupFeedbackLoadingScreen} from './MakeupFeedbackLoadingScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const selection = {photoSource: 'camera'} satisfies MakeupFeedbackPhotoSelection;

<MakeupFeedbackLoadingScreen
  onBack={() => undefined}
  onChooseDifferentPhoto={() => undefined}
  onComplete={() => undefined}
  onRetake={() => undefined}
  selection={selection}
/>;

const cameraActions = getMakeupFeedbackRetakeActionLabels('camera');
const galleryActions = getMakeupFeedbackRetakeActionLabels('gallery');

expectEqual(cameraActions.primary, '다시 촬영', 'camera primary retake action');
expectEqual(
  cameraActions.secondary,
  '앨범에서 다른 사진 선택',
  'camera secondary gallery action',
);
expectEqual(galleryActions.primary, '다른 사진 선택', 'gallery primary choose action');
expectEqual(
  galleryActions.secondary,
  '카메라로 다시 촬영',
  'gallery secondary camera action',
);
