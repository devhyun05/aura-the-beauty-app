import {
  HOME_ANALYTICS_EVENT_NAMES,
  setHomeAnalyticsAdapter,
  trackHomeFilterCardPress,
  trackHomeHeroBannerPress,
  trackHomeSectionMorePress,
  trackHomeCarouselScroll,
  trackHomeEnter,
  trackHomeModuleImpression,
  trackHomeModulePress,
  type HomeAnalyticsEvent,
} from './homeAnalytics';

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

expect(
  HOME_ANALYTICS_EVENT_NAMES.join(',')
    === 'home_enter,hero_banner_press,module_impression,module_press,filter_card_press,section_more_press,carousel_scroll',
  'home analytics event names are stable',
);

const events: HomeAnalyticsEvent[] = [];
setHomeAnalyticsAdapter({
  track: event => {
    events.push(event);
  },
});

trackHomeEnter({
  hasCompletedFaceAnalysis: false,
  isAuthenticated: true,
  recentActivityCount: 0,
});
trackHomeHeroBannerPress('feature', 'faceDiagnosis');
trackHomeModuleImpression('makeupExtraction', 2);
trackHomeModulePress('makeupFeedback', 'makeupFeedback');
trackHomeFilterCardPress('filter-aura-blush-lift');
trackHomeSectionMorePress();
trackHomeCarouselScroll('products', 0, 1);
trackHomeCarouselScroll('products', 1, 1);

expect(events.length === 7, 'unchanged carousel position is not tracked');
expect(events[0]?.name === 'home_enter', 'home enter event is dispatched');
expect(events[1]?.name === 'hero_banner_press', 'hero press event is dispatched');
expect(events[2]?.name === 'module_impression', 'module impression is dispatched');
expect(events[3]?.name === 'module_press', 'module press is dispatched');
expect(events[4]?.name === 'filter_card_press', 'filter press event is dispatched');
expect(events[5]?.name === 'section_more_press', 'more press event is dispatched');
expect(events[6]?.name === 'carousel_scroll', 'carousel scroll is dispatched');

setHomeAnalyticsAdapter({
  track: () => {
    throw new Error('analytics unavailable');
  },
});
trackHomeModulePress('products', 'productRecommendation');

setHomeAnalyticsAdapter();
