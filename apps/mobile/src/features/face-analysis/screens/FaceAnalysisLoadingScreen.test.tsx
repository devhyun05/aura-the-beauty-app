import React from 'react';

import {
  FaceAnalysisLoadingScreen,
  faceAnalysisLoadingVideoSource,
} from './FaceAnalysisLoadingScreen';

const onComplete = () => undefined;
const onBack = () => undefined;

if (!faceAnalysisLoadingVideoSource) {
  throw new Error('face analysis loading screen must bundle the loading video');
}

<FaceAnalysisLoadingScreen onBack={onBack} onComplete={onComplete} />;
