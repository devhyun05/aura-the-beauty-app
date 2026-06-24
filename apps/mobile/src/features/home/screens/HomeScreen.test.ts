import {
  filterStoreCategoryChipContainerStyle,
  filterStoreCategoryChipTextStyle,
  getFilterStoreCategoryChipLabel,
  heroCtaLabel,
  getHomeQuickActionPressHandler,
  getHeroTrendHeadline,
  heroTrendTitleMainTextStyle,
  heroTrendTitleReadableTextStyle,
} from './HomeScreen';
import {colors, radius, typography} from '../../../shared/theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const headline = getHeroTrendHeadline({
  title: '클린 오피스',
  tone: '뉴트럴 브라운',
} as const);

const expectedHeadline: '뉴트럴 브라운 무드의\n클린 오피스' = headline;
const expectedTitleColor: '#111111' = heroTrendTitleReadableTextStyle.color;
const expectedShadowColor: 'rgba(255, 255, 255, 0.30)' =
  heroTrendTitleReadableTextStyle.textShadowColor;
const expectedShadowRadius: 8 = heroTrendTitleReadableTextStyle.textShadowRadius;
const expectedShadowOffsetY: 2 = heroTrendTitleReadableTextStyle.textShadowOffset.height;
const expectedHeroCtaLabel: '보러가기' = heroCtaLabel;
const expectedHeroTitleMainFontFamily: typeof typography.fontFamily.semibold =
  heroTrendTitleMainTextStyle.fontFamily;
const filterStoreCategoryChipLabel = getFilterStoreCategoryChipLabel('Lip');
const expectedFilterStoreCategoryChipLabel: 'Lip' = filterStoreCategoryChipLabel;
const expectedFilterStoreCategoryChipRadius: typeof radius.pill =
  filterStoreCategoryChipContainerStyle.borderRadius;
const expectedFilterStoreCategoryChipBorderColor: typeof colors.border =
  filterStoreCategoryChipContainerStyle.borderColor;
const expectedFilterStoreCategoryChipTextFontFamily: typeof typography.fontFamily.semibold =
  filterStoreCategoryChipTextStyle.fontFamily;

expectEqual(headline, expectedHeadline, 'weekly trend headline');
expectEqual(
  heroTrendTitleReadableTextStyle.color,
  expectedTitleColor,
  'weekly trend title color',
);
expectEqual(
  heroTrendTitleReadableTextStyle.textShadowColor,
  expectedShadowColor,
  'weekly trend title shadow color',
);
expectEqual(
  heroTrendTitleReadableTextStyle.textShadowRadius,
  expectedShadowRadius,
  'weekly trend title shadow radius',
);
expectEqual(
  heroTrendTitleReadableTextStyle.textShadowOffset.height,
  expectedShadowOffsetY,
  'weekly trend title shadow offset',
);
expectEqual(heroCtaLabel, expectedHeroCtaLabel, 'hero CTA label');
expectEqual(
  heroTrendTitleMainTextStyle.fontFamily,
  expectedHeroTitleMainFontFamily,
  'weekly trend main title font family',
);
expectEqual(
  filterStoreCategoryChipLabel,
  expectedFilterStoreCategoryChipLabel,
  'filter store category chip label',
);
expectEqual(
  filterStoreCategoryChipContainerStyle.borderRadius,
  expectedFilterStoreCategoryChipRadius,
  'filter store category chip radius',
);
expectEqual(
  filterStoreCategoryChipContainerStyle.borderColor,
  expectedFilterStoreCategoryChipBorderColor,
  'filter store category chip border color',
);
expectEqual(
  filterStoreCategoryChipTextStyle.fontFamily,
  expectedFilterStoreCategoryChipTextFontFamily,
  'filter store category chip text font family',
);

let selectedQuickAction: 'ar' | 'feedback' | null = null;

const arPressHandler = getHomeQuickActionPressHandler('ar', {
  onPressARFilter: () => {
    selectedQuickAction = 'ar';
  },
});

if (!arPressHandler) {
  throw new Error('real-time AR quick action should have a press handler');
}

arPressHandler();

expectEqual(selectedQuickAction, 'ar', 'real-time AR quick action target');

const feedbackPressHandler = getHomeQuickActionPressHandler('feedback', {
  onPressMakeupFeedback: () => {
    selectedQuickAction = 'feedback';
  },
});

if (!feedbackPressHandler) {
  throw new Error('makeup feedback quick action should have a press handler');
}

feedbackPressHandler();

expectEqual(selectedQuickAction, 'feedback', 'makeup feedback quick action target');
