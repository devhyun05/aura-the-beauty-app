import React from 'react';

import {getARMakeupGuideData} from '../../../shared/services/makeupGuideService';
import {
  AR_FILTER_COMPARISON_MODE_ACTIVE_INDICATOR,
  AR_FILTER_COMPARISON_MODE_CONTAINER_CHROME,
  AR_FILTER_COMPARISON_MODE_CONTROL_STYLE,
  AR_FILTER_COMPARISON_MODE_VERTICAL_OFFSET,
  AR_FILTER_GUIDE_MODE_CONTROL_WIDTH,
  AR_FILTER_GUIDE_MODE_PLACEMENT,
  ARFilterModeTabs,
  getARFilterComparisonTabs,
  getARFilterModeTabHeight,
  getARFilterSelectedTabOpacity,
} from './ARFilterModeTabs';
import {spacing} from '../../../shared/theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

type TestElementProps = {
  children?: React.ReactNode;
  style?: unknown;
};

type TestElement = React.ReactElement<TestElementProps>;

function assertElement(node: React.ReactNode, label: string): TestElement {
  if (!React.isValidElement<TestElementProps>(node)) {
    throw new Error(`${label}: expected a React element`);
  }

  return node;
}

function getElementChildren(element: TestElement): readonly React.ReactNode[] {
  const {children} = element.props;

  if (Array.isArray(children)) {
    return children;
  }

  return children === undefined ? [] : [children];
}

function isStyleRecord(style: unknown): style is Record<string, unknown> {
  return typeof style === 'object' && style !== null && !Array.isArray(style);
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (mergedStyle, styleItem) => ({
        ...mergedStyle,
        ...flattenStyle(styleItem),
      }),
      {},
    );
  }

  return isStyleRecord(style) ? style : {};
}

const arGuideData = getARMakeupGuideData();
const renderedModeTabs = ARFilterModeTabs({
  arGuideData,
  guideMode: 'half',
  onBack: () => undefined,
  onComparisonModeChange: () => undefined,
  onGuideModeChange: () => undefined,
  selectedComparisonMode: 'left',
  topInset: 47,
});
const modeTabsRoot = assertElement(renderedModeTabs, 'AR filter mode tabs root');
const modeTabsHeader = assertElement(
  getElementChildren(modeTabsRoot)[0],
  'AR filter mode tabs header',
);
const guideModeControl = assertElement(
  getElementChildren(modeTabsHeader)[1],
  'AR filter guide mode control',
);
const headerStyle = flattenStyle(modeTabsHeader.props.style);
const guideModeControlStyle = flattenStyle(guideModeControl.props.style);
const comparisonBar = assertElement(
  getElementChildren(modeTabsRoot)[1],
  'AR filter comparison mode control',
);
const comparisonBarStyle = flattenStyle(comparisonBar.props.style);

expectEqual(
  AR_FILTER_GUIDE_MODE_PLACEMENT,
  'headerCenter',
  'AR filter guide mode control is centered in the header',
);
expectEqual(
  AR_FILTER_COMPARISON_MODE_CONTROL_STYLE,
  'plainTextToggle',
  'AR filter comparison control does not use segmented tabs',
);
expectEqual(
  AR_FILTER_COMPARISON_MODE_ACTIVE_INDICATOR,
  'underline',
  'AR filter comparison active state uses a simple underline',
);
expectEqual(
  AR_FILTER_COMPARISON_MODE_CONTAINER_CHROME,
  'none',
  'AR filter comparison control has no tab container chrome',
);
expectEqual(
  AR_FILTER_COMPARISON_MODE_VERTICAL_OFFSET,
  -spacing.xs,
  'AR filter comparison buttons are raised slightly toward the guide mode tabs',
);
expectEqual(
  getARFilterModeTabHeight(),
  24,
  'AR filter mode tab height',
);
expectEqual(
  getARFilterSelectedTabOpacity(),
  0.62,
  'AR filter selected tab opacity',
);
expectEqual(
  headerStyle.justifyContent,
  'center',
  'AR filter mode tab header centers the guide control on screen',
);
expectEqual(
  guideModeControlStyle.alignSelf,
  'center',
  'AR filter guide mode control self-aligns to center',
);
expectEqual(
  AR_FILTER_GUIDE_MODE_CONTROL_WIDTH,
  192,
  'AR filter guide mode control width gives the tab labels more room',
);
expectEqual(
  guideModeControlStyle.width,
  AR_FILTER_GUIDE_MODE_CONTROL_WIDTH,
  'AR filter guide mode control applies the wider tab width',
);
expectEqual(
  JSON.stringify(comparisonBarStyle.transform),
  JSON.stringify([{translateY: -spacing.xs}]),
  'AR filter comparison buttons move slightly upward',
);
expectEqual(
  getARFilterComparisonTabs(arGuideData).join(','),
  '왼쪽,오른쪽',
  'AR filter comparison labels',
);
