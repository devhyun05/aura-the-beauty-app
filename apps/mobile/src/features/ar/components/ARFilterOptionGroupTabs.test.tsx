import React from 'react';

import {
  AR_FILTER_OPTION_GROUP_SELECTOR_ACTIVE_INDICATOR,
  AR_FILTER_OPTION_GROUP_SELECTOR_CHROME,
  AR_FILTER_OPTION_GROUP_SELECTOR_HEIGHT,
  AR_FILTER_OPTION_GROUP_SELECTOR_STYLE,
  AR_FILTER_OPTION_GROUP_SELECTOR_VERTICAL_FOOTPRINT,
  ARFilterOptionGroupTabs,
} from './ARFilterOptionGroupTabs';
import {getARFilterOptionGroups} from '../services/arFilterOptionRules';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const pointOptionGroups = getARFilterOptionGroups('lip');

expectEqual(
  AR_FILTER_OPTION_GROUP_SELECTOR_STYLE,
  'compactTextTabs',
  'AR filter option group selector uses compact text tabs',
);
expectEqual(
  AR_FILTER_OPTION_GROUP_SELECTOR_CHROME,
  'none',
  'AR filter option group selector removes chip chrome',
);
expectEqual(
  AR_FILTER_OPTION_GROUP_SELECTOR_ACTIVE_INDICATOR,
  'underline',
  'AR filter option group selector active state uses underline',
);
expectEqual(
  AR_FILTER_OPTION_GROUP_SELECTOR_HEIGHT,
  24,
  'AR filter option group selector is shorter than chip buttons',
);
expectEqual(
  AR_FILTER_OPTION_GROUP_SELECTOR_VERTICAL_FOOTPRINT,
  28,
  'AR filter option group selector uses compact vertical space',
);

<ARFilterOptionGroupTabs
  onOptionGroupPress={() => undefined}
  optionGroups={pointOptionGroups}
  selectedMakeupOptionGroup="makeupLook"
/>;
