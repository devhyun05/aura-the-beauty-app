import type {FooterTabKey} from '../../shared/ui';
import type {FooterTargetRoute, MainHeaderVariant} from './routeChrome';
import {getFooterTargetRoute, getRouteChrome} from './routeChrome';
import type {MainTabRouteName} from './routeTypes';

export type MainHeaderCopy = {
  subtitle: 'MAKEUP GUIDE' | 'AI PRODUCT MATCH';
  title: 'AI AR Makeup' | '추천 제품';
  usesBrandLogo: boolean;
};

const mainHeaderCopyByVariant = {
  custom: {
    subtitle: 'AI PRODUCT MATCH',
    title: '추천 제품',
    usesBrandLogo: false,
  },
  default: {
    subtitle: 'MAKEUP GUIDE',
    title: 'AI AR Makeup',
    usesBrandLogo: false,
  },
  home: {
    subtitle: 'MAKEUP GUIDE',
    title: 'AI AR Makeup',
    usesBrandLogo: true,
  },
} as const satisfies Record<MainHeaderVariant, MainHeaderCopy>;

export function getMainHeaderCopy(routeName: MainTabRouteName): MainHeaderCopy {
  const chrome = getRouteChrome(routeName);

  if (chrome.kind !== 'mainTab') {
    throw new Error(`${routeName} is not a main tab route`);
  }

  return mainHeaderCopyByVariant[chrome.headerVariant];
}

export function getMainTabFooterState(
  routeName: MainTabRouteName,
): Extract<FooterTabKey, 'home' | 'custom'> | undefined {
  const chrome = getRouteChrome(routeName);

  if (chrome.kind !== 'mainTab') {
    throw new Error(`${routeName} is not a main tab route`);
  }

  return chrome.footerTab;
}

export function getRootRouteForFooterTab(tab: FooterTabKey): FooterTargetRoute {
  return getFooterTargetRoute(tab);
}
