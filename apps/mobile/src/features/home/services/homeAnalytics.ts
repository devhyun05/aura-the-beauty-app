import type {
  HomeAudienceState,
  HomeFeatureId,
  HomeModuleId,
} from '../types/homeModules';

export const HOME_ANALYTICS_EVENT_NAMES = [
  'home_enter',
  'hero_banner_press',
  'module_impression',
  'module_press',
  'filter_card_press',
  'section_more_press',
  'carousel_scroll',
] as const;

export type HomeAnalyticsEventName = (typeof HOME_ANALYTICS_EVENT_NAMES)[number];

export type HomeEnterEvent = {
  name: 'home_enter';
  properties: HomeAudienceState;
};

export type HomeModuleImpressionEvent = {
  name: 'module_impression';
  properties: {
    index: number;
    moduleId: HomeModuleId;
  };
};

export type HomeHeroBannerPressEvent = {
  name: 'hero_banner_press';
  properties: {
    targetId: string;
    targetKind: 'feature' | 'filter';
  };
};

export type HomeFilterCardPressEvent = {
  name: 'filter_card_press';
  properties: {filterId: string};
};

export type HomeSectionMorePressEvent = {
  name: 'section_more_press';
  properties: {sectionId: 'recommendedFilters'};
};

export type HomeModulePressEvent = {
  name: 'module_press';
  properties: {
    featureId: HomeFeatureId;
    itemId?: string;
    moduleId: HomeModuleId;
  };
};

export type HomeCarouselScrollEvent = {
  name: 'carousel_scroll';
  properties: {
    fromIndex: number;
    moduleId: HomeModuleId;
    toIndex: number;
  };
};

export type HomeAnalyticsEvent =
  | HomeCarouselScrollEvent
  | HomeEnterEvent
  | HomeFilterCardPressEvent
  | HomeHeroBannerPressEvent
  | HomeModuleImpressionEvent
  | HomeModulePressEvent
  | HomeSectionMorePressEvent;

export type HomeAnalyticsAdapter = {
  track: (event: HomeAnalyticsEvent) => Promise<void> | void;
};

export const noopHomeAnalyticsAdapter: HomeAnalyticsAdapter = {
  track: () => undefined,
};

let homeAnalyticsAdapter: HomeAnalyticsAdapter = noopHomeAnalyticsAdapter;

export function setHomeAnalyticsAdapter(
  adapter: HomeAnalyticsAdapter = noopHomeAnalyticsAdapter,
): void {
  homeAnalyticsAdapter = adapter;
}

export function trackHomeEvent(event: HomeAnalyticsEvent): void {
  try {
    const result = homeAnalyticsAdapter.track(event);

    if (result && typeof result.catch === 'function') {
      void result.catch(() => undefined);
    }
  } catch {
    // Analytics must never interrupt navigation or scrolling.
  }
}

export function trackHomeEnter(audience: HomeAudienceState): void {
  trackHomeEvent({name: 'home_enter', properties: audience});
}

export function trackHomeHeroBannerPress(
  targetKind: HomeHeroBannerPressEvent['properties']['targetKind'],
  targetId: string,
): void {
  trackHomeEvent({
    name: 'hero_banner_press',
    properties: {targetId, targetKind},
  });
}

export function trackHomeFilterCardPress(filterId: string): void {
  trackHomeEvent({name: 'filter_card_press', properties: {filterId}});
}

export function trackHomeSectionMorePress(): void {
  trackHomeEvent({
    name: 'section_more_press',
    properties: {sectionId: 'recommendedFilters'},
  });
}

export function trackHomeModuleImpression(
  moduleId: HomeModuleId,
  index: number,
): void {
  trackHomeEvent({name: 'module_impression', properties: {index, moduleId}});
}

export function trackHomeModulePress(
  moduleId: HomeModuleId,
  featureId: HomeFeatureId,
  itemId?: string,
): void {
  trackHomeEvent({
    name: 'module_press',
    properties: {featureId, itemId, moduleId},
  });
}

export function trackHomeCarouselScroll(
  moduleId: HomeModuleId,
  fromIndex: number,
  toIndex: number,
): void {
  if (fromIndex === toIndex) {
    return;
  }

  trackHomeEvent({
    name: 'carousel_scroll',
    properties: {fromIndex, moduleId, toIndex},
  });
}
