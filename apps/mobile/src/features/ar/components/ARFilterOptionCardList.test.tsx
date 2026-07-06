import React from 'react';

import {
  AR_FILTER_OPTION_CARD_ASPECT_RATIO,
  AR_FILTER_OPTION_CARD_ACTIVE_INDICATOR,
  AR_FILTER_OPTION_CARD_ACTIVE_DEPTH_EFFECT,
  AR_FILTER_OPTION_CARD_ACTIVE_EDGE_TREATMENT,
  AR_FILTER_OPTION_CARD_ACTIVE_OUTLINE_VISIBILITY,
  AR_FILTER_OPTION_CARD_COPY_PLACEMENT,
  AR_FILTER_OPTION_CARD_LABEL_ALIGNMENT,
  AR_FILTER_OPTION_CARD_META_PLACEMENT,
  AR_FILTER_OPTION_CARD_PREVIEW_KINDS,
  AR_FILTER_OPTION_CARD_SELECTED_BADGE,
  AR_FILTER_OPTION_CARD_SELECTED_EFFECT,
  AR_FILTER_OPTION_CARD_SELECTED_LABEL_VISIBILITY,
  AR_FILTER_OPTION_CARD_SELECTED_BADGE_OFFSET,
  AR_FILTER_OPTION_CARD_SURFACE_OVERFLOW,
  AR_FILTER_OPTION_CARD_WIDTH,
  AR_FILTER_OPTION_PICKER_MIN_HEIGHT,
  AR_FILTER_CATEGORY_SELECTOR_ACTIVE_INDICATOR,
  AR_FILTER_CATEGORY_SELECTOR_CHROME,
  AR_FILTER_CATEGORY_SELECTOR_HEIGHT,
  AR_FILTER_CATEGORY_SELECTOR_STYLE,
  AR_FILTER_CATEGORY_SELECTOR_VERTICAL_FOOTPRINT,
  AR_FILTER_ORIGINAL_OPTION_ICON_LIBRARY_NAME,
  AR_FILTER_ORIGINAL_OPTION_ICON_SOURCE,
  ARFilterOptionCardList,
} from './ARFilterOptionCardList';
import {getARMakeupGuideData, getDefaultMakeupFilter} from '../../../shared/services/makeupGuideService';
import {getARFilterShapeOptions} from '../services/arFilterOptionRules';

type TypeEquals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type ExpectType<T extends true> = T;

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const arGuideData = getARMakeupGuideData();
const selectedMakeupFilter = getDefaultMakeupFilter(arGuideData);
const shapeOptions = getARFilterShapeOptions('all');

expectEqual(
  AR_FILTER_OPTION_CARD_ASPECT_RATIO,
  1,
  'AR filter option card is square',
);
expectEqual(
  AR_FILTER_OPTION_CARD_COPY_PLACEMENT,
  'outsideBelow',
  'AR filter option card labels sit outside the card',
);
expectEqual(
  AR_FILTER_OPTION_CARD_LABEL_ALIGNMENT,
  'center',
  'AR filter option card labels stay centered below the card',
);
expectEqual(
  AR_FILTER_OPTION_CARD_META_PLACEMENT,
  'none',
  'AR filter option card hides redundant meta chips',
);
expectEqual(
  AR_FILTER_OPTION_CARD_PREVIEW_KINDS.join(','),
  'makeupLook,color,type,texture,shape,original',
  'AR filter option card preview kinds share one card shell',
);
expectEqual(
  AR_FILTER_OPTION_CARD_WIDTH,
  72,
  'AR filter option card width is reduced',
);
expectEqual(
  AR_FILTER_OPTION_PICKER_MIN_HEIGHT,
  104,
  'AR filter option picker height allows outside labels',
);
expectEqual(
  AR_FILTER_OPTION_CARD_SURFACE_OVERFLOW,
  'hidden',
  'AR filter option card surface clips image content',
);
expectEqual(
  AR_FILTER_OPTION_CARD_ACTIVE_INDICATOR,
  'pressedInset',
  'AR filter option card selected state uses card styling',
);
expectEqual(
  AR_FILTER_OPTION_CARD_ACTIVE_DEPTH_EFFECT,
  'insetShadow',
  'AR filter option card selected state looks pressed inward',
);
expectEqual(
  AR_FILTER_OPTION_CARD_ACTIVE_EDGE_TREATMENT,
  'shadowOnly',
  'AR filter option card selected edge is handled by shadow',
);
expectEqual(
  AR_FILTER_OPTION_CARD_ACTIVE_OUTLINE_VISIBILITY,
  'hidden',
  'AR filter option card selected state does not show a gray outline',
);
expectEqual(
  AR_FILTER_OPTION_CARD_SELECTED_LABEL_VISIBILITY,
  'accessibilityOnly',
  'AR filter option card does not render selected chips',
);
expectEqual(
  AR_FILTER_OPTION_CARD_SELECTED_BADGE,
  'topRightInsetCheck',
  'AR filter option card selected badge is inset from the inner border',
);
expectEqual(
  AR_FILTER_OPTION_CARD_SELECTED_BADGE_OFFSET,
  8,
  'AR filter option card selected badge clears the active inner border',
);
expectEqual(
  AR_FILTER_OPTION_CARD_SELECTED_EFFECT,
  'innerGlowAndPressedDepth',
  'AR filter option card selected state is visibly stronger than idle cards',
);
expectEqual(
  AR_FILTER_CATEGORY_SELECTOR_STYLE,
  'compactTextTabs',
  'AR filter categories use compact text tabs instead of chips',
);
expectEqual(
  AR_FILTER_CATEGORY_SELECTOR_CHROME,
  'none',
  'AR filter category selector removes chip chrome',
);
expectEqual(
  AR_FILTER_CATEGORY_SELECTOR_ACTIVE_INDICATOR,
  'underline',
  'AR filter category selector uses an underline active state',
);
expectEqual(
  AR_FILTER_CATEGORY_SELECTOR_HEIGHT,
  24,
  'AR filter category tabs are shorter than chip buttons',
);
expectEqual(
  AR_FILTER_CATEGORY_SELECTOR_VERTICAL_FOOTPRINT,
  28,
  'AR filter category selector uses less vertical space than chips',
);
expectEqual(
  AR_FILTER_ORIGINAL_OPTION_ICON_SOURCE,
  'lucide-react-native',
  'AR filter original option card icon source',
);
expectEqual(
  AR_FILTER_ORIGINAL_OPTION_ICON_LIBRARY_NAME,
  'CircleOff',
  'AR filter original option card uses a library icon',
);

type OptionCardAspectRatioContract = ExpectType<
  TypeEquals<typeof AR_FILTER_OPTION_CARD_ASPECT_RATIO, 1>
>;
type OptionCardCopyPlacementContract = ExpectType<
  TypeEquals<typeof AR_FILTER_OPTION_CARD_COPY_PLACEMENT, 'outsideBelow'>
>;
type OptionCardWidthContract = ExpectType<
  TypeEquals<typeof AR_FILTER_OPTION_CARD_WIDTH, 72>
>;
type OptionCardSelectedBadgeContract = ExpectType<
  TypeEquals<typeof AR_FILTER_OPTION_CARD_SELECTED_BADGE, 'topRightInsetCheck'>
>;
type OptionCardBadgeOffsetContract = ExpectType<
  TypeEquals<typeof AR_FILTER_OPTION_CARD_SELECTED_BADGE_OFFSET, 8>
>;

<ARFilterOptionCardList
  arGuideData={arGuideData}
  availableMakeupFilters={arGuideData.filters}
  onCategoryPress={() => undefined}
  onColorOptionPress={() => undefined}
  onMakeupFilterPress={() => undefined}
  onOriginalOptionPress={() => undefined}
  onShapeOptionPress={() => undefined}
  onTextureOptionPress={() => undefined}
  onTypeOptionPress={() => undefined}
  selectedCategoryId="recommended"
  selectedColorId={selectedMakeupFilter.colorOptions[0]?.id ?? ''}
  selectedMakeupArea="all"
  selectedMakeupFilter={selectedMakeupFilter}
  selectedMakeupOptionGroup="makeupLook"
  selectedPointMakeupLookId={selectedMakeupFilter.id}
  selectedShapeId={shapeOptions[0]?.id ?? 'original'}
  selectedTextureId={selectedMakeupFilter.textureOptions[0]?.id ?? ''}
  selectedTotalMakeupLookId={selectedMakeupFilter.id}
  selectedTypeId={selectedMakeupFilter.typeOptions[0]?.id ?? ''}
  shapeOptions={shapeOptions}
/>;
