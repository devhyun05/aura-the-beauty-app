import React from 'react';

import {
  AR_FILTER_BOTTOM_ACTION_BUTTON_GAP,
  ARFilterBottomActions,
  getARFilterSaveButtonLabel,
  getARFilterShapeEditButtonLabel,
} from './ARFilterBottomActions';
import {spacing} from '../../../shared/theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  AR_FILTER_BOTTOM_ACTION_BUTTON_GAP,
  spacing.sm,
  'AR filter bottom action buttons use compact spacing',
);
expectEqual(
  getARFilterShapeEditButtonLabel(),
  '형태 수정',
  'AR filter shape edit button label',
);
expectEqual(
  getARFilterSaveButtonLabel(),
  '저장',
  'AR filter save button label',
);

<ARFilterBottomActions
  hasUnsavedMakeupChanges
  onOpenShapeAdjust={() => undefined}
  onSave={() => undefined}
/>;
