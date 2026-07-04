import React from 'react';

import {
  ReferenceMakeupExtractionCaptureScreen,
  type ReferenceMakeupExtractionCaptureResult,
} from './ReferenceMakeupExtractionCaptureScreen';

const cameraCaptureResult: ReferenceMakeupExtractionCaptureResult = {
  imageUri: 'file:///tmp/reference-makeup.png',
};

void cameraCaptureResult;

<ReferenceMakeupExtractionCaptureScreen
  onCapture={() => undefined}
  onClose={() => undefined}
/>;
