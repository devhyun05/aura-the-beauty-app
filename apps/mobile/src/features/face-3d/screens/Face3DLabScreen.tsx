import React from 'react';

import {
  Face3DAnalysisPanel,
  type Face3DCaptureReference,
} from '../components/Face3DAnalysisPanel';

type Face3DLabScreenProps = {
  capture: Face3DCaptureReference;
  onOpenVerticalThirds: () => void;
  onRetake: () => void;
};

export function Face3DLabScreen({
  capture,
  onOpenVerticalThirds,
  onRetake,
}: Face3DLabScreenProps) {
  return (
    <Face3DAnalysisPanel
      captureReference={capture}
      onOpenVerticalThirds={onOpenVerticalThirds}
      onRetake={onRetake}
    />
  );
}
