import React from 'react';

import {
  AR_FILTER_BOTTOM_ACTION_BUTTON_GAP,
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BACKGROUND_COLOR,
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BORDER_COLOR,
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_SIZE,
  ARFilterBottomActions,
  getARFilterDetailEditButtonLabel,
  getARFilterEditActionButtonLabel,
  getARFilterEditActionOptions,
  getARFilterSaveButtonLabel,
  getARFilterShapeEditButtonLabel,
} from './ARFilterBottomActions';
import {colors, spacing} from '../../../shared/theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  AR_FILTER_BOTTOM_ACTION_BUTTON_GAP,
  spacing.sm,
  'AR filter bottom action icon buttons leave extra space',
);
expectEqual(
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_SIZE,
  36,
  'AR filter bottom action icon button matches sheet toggle size',
);
expectEqual(
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BACKGROUND_COLOR,
  colors.arFilterBottomSheetSurface,
  'AR filter bottom action icon button matches sheet toggle background',
);
expectEqual(
  AR_FILTER_BOTTOM_ACTION_ICON_BUTTON_BORDER_COLOR,
  colors.border,
  'AR filter bottom action icon button matches sheet toggle border',
);
expectEqual(
  getARFilterEditActionButtonLabel(),
  '수정',
  'AR filter edit action button label',
);
expectEqual(
  getARFilterDetailEditButtonLabel(),
  '제품 수정',
  'AR filter detail edit button label',
);
expectEqual(
  getARFilterShapeEditButtonLabel(),
  '핏 수정',
  'AR filter shape edit button label',
);
expectEqual(
  getARFilterSaveButtonLabel(),
  '저장',
  'AR filter save button label',
);
expectEqual(
  getARFilterEditActionOptions().map(option => option.label).join(','),
  '제품 수정,핏 수정',
  'AR filter edit action menu options',
);

<ARFilterBottomActions
  hasUnsavedMakeupChanges
  onOpenDetailEdit={() => undefined}
  onOpenShapeAdjust={() => undefined}
  onSave={() => undefined}
/>;
