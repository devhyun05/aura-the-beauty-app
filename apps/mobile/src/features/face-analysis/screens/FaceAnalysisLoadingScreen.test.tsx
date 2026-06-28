import React from 'react';

import {
  FaceAnalysisLoadingScreen,
  resolveFaceAnalysisLoadingPreviewSource,
} from './FaceAnalysisLoadingScreen';

const onComplete = () => undefined;
const onBack = () => undefined;
const capturedPhotoUri = 'file:///tmp/captured-face.jpg';
const capturedPreviewSource =
  resolveFaceAnalysisLoadingPreviewSource(capturedPhotoUri) as {uri?: string};

if (capturedPreviewSource.uri !== capturedPhotoUri) {
  throw new Error('face analysis loading screen must show the captured photo');
}

<FaceAnalysisLoadingScreen onBack={onBack} onComplete={onComplete} />;
