import {
  getHomeQuickActionPressHandler,
  getHeroTrendHeadline,
  heroTrendTitleReadableTextStyle,
} from './HomeScreen';

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

let selectedQuickAction: 'ar' | null = null;

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
