import React from 'react';

import {
  MakeupFilterEditScreen,
  getMakeupFilterEditCameraMode,
  getMakeupFilterEditSelectedColor,
  getMakeupFilterEditSelectedTabOpacity,
  getMakeupFilterEditPreviewColorOverlayLayers,
  getMakeupFilterEditPreviewSummaryContent,
} from './MakeupFilterEditScreen';
import {colors} from '../../../shared/theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const expectedFilterEditPreviewSummaryContent: null = getMakeupFilterEditPreviewSummaryContent();

expectEqual(
  getMakeupFilterEditPreviewColorOverlayLayers().length,
  0,
  'AR filter edit preview color overlay layer count',
);
expectEqual(
  expectedFilterEditPreviewSummaryContent,
  null,
  'AR filter edit preview summary content',
);
expectEqual(
  getMakeupFilterEditCameraMode(),
  'photo-preview',
  'AR filter edit camera mode',
);
expectEqual(
  getMakeupFilterEditSelectedTabOpacity(),
  0.62,
  'AR filter edit selected tab opacity',
);
expectEqual(
  getMakeupFilterEditSelectedColor([], 'missing').hex,
  colors.white,
  'AR filter edit selected color fallback hex',
);
expectEqual(
  getMakeupFilterEditSelectedColor([], 'missing').label,
  '기본',
  'AR filter edit selected color fallback label',
);

<MakeupFilterEditScreen
  onBack={() => undefined}
  onSave={() => undefined}
/>;
