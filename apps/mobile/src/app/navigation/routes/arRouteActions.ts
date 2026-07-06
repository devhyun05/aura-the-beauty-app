import type {RootStackParamList} from '../routeTypes';

export type ARFilterDetailEditRouteParams = NonNullable<
  RootStackParamList['MakeupFilterEdit']
>;

export function getARFilterDetailEditRouteParams(): ARFilterDetailEditRouteParams {
  return {
    backRoute: 'ARFilter',
    mode: 'preset',
  };
}
