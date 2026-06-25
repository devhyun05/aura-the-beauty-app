import {getRouteChrome} from './routeChrome';
import {routes, type RouteName} from './routeTypes';

export type NavigationStatusBarStyle = 'dark' | 'light';

export type NavigationRouteState = {
  index?: number;
  routes: readonly NavigationRoute[];
};

type NavigationRoute = {
  name: string;
  state?: NavigationRouteState;
};

export function resolveActiveRouteName(
  state: NavigationRouteState | undefined,
): RouteName | null {
  if (!state) {
    return null;
  }

  const activeRoute = state.routes[state.index ?? 0];

  if (!activeRoute) {
    return null;
  }

  const nestedRouteName = resolveActiveRouteName(activeRoute.state);

  if (nestedRouteName) {
    return nestedRouteName;
  }

  return isRouteName(activeRoute.name) ? activeRoute.name : null;
}

export function getStatusBarStyleForRouteName(
  routeName: RouteName | null,
): NavigationStatusBarStyle {
  if (!routeName) {
    return 'dark';
  }

  return getRouteChrome(routeName).statusBarStyle;
}

export function getStatusBarStyleForNavigationState(
  state: NavigationRouteState | undefined,
): NavigationStatusBarStyle {
  return getStatusBarStyleForRouteName(resolveActiveRouteName(state));
}

function isRouteName(value: string): value is RouteName {
  return (routes as readonly string[]).includes(value);
}
