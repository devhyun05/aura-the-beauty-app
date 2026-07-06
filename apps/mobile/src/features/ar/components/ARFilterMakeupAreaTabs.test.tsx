import React from 'react';

import {
  AR_FILTER_MAKEUP_AREA_SELECTOR_ACTIVE_INDICATOR,
  AR_FILTER_MAKEUP_AREA_SELECTOR_CHROME,
  AR_FILTER_MAKEUP_AREA_SELECTOR_HEIGHT,
  AR_FILTER_MAKEUP_AREA_SELECTOR_STYLE,
  AR_FILTER_MAKEUP_AREA_SELECTOR_VERTICAL_FOOTPRINT,
  ARFilterMakeupAreaTabs,
} from './ARFilterMakeupAreaTabs';
import {getARMakeupGuideData} from '../../../shared/services/makeupGuideService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const arGuideData = getARMakeupGuideData();

expectEqual(
  AR_FILTER_MAKEUP_AREA_SELECTOR_STYLE,
  'compactTextTabs',
  'AR filter makeup area selector uses compact text tabs',
);
expectEqual(
  AR_FILTER_MAKEUP_AREA_SELECTOR_CHROME,
  'none',
  'AR filter makeup area selector removes chip chrome',
);
expectEqual(
  AR_FILTER_MAKEUP_AREA_SELECTOR_ACTIVE_INDICATOR,
  'underline',
  'AR filter makeup area selector active state uses underline',
);
expectEqual(
  AR_FILTER_MAKEUP_AREA_SELECTOR_HEIGHT,
  24,
  'AR filter makeup area selector is shorter than chip buttons',
);
expectEqual(
  AR_FILTER_MAKEUP_AREA_SELECTOR_VERTICAL_FOOTPRINT,
  28,
  'AR filter makeup area selector uses compact vertical space',
);

<ARFilterMakeupAreaTabs
  makeupAreas={arGuideData.makeupAreas}
  onMakeupAreaPress={() => undefined}
  selectedMakeupArea="all"
/>;
