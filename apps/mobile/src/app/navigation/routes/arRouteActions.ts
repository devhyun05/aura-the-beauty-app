import type {RootStackParamList} from '../routeTypes';

export type ARFilterDetailEditRouteParams = NonNullable<
  RootStackParamList['MakeupFilterEdit']
>;

type ARFilterDetailEditRouteParamsInput = Pick<
  ARFilterDetailEditRouteParams,
  | 'editSourceImageUri'
  | 'initialEditMode'
  | 'initialGuideMode'
  | 'initialMakeupFilterId'
  | 'source'
>;

export function getARFilterDetailEditRouteParams(
  input: ARFilterDetailEditRouteParamsInput = {},
): ARFilterDetailEditRouteParams {
  return {
    backRoute: 'ARFilter',
    ...(input.editSourceImageUri ? {editSourceImageUri: input.editSourceImageUri} : {}),
    initialEditMode: input.initialEditMode ?? 'product',
    ...(input.initialGuideMode ? {initialGuideMode: input.initialGuideMode} : {}),
    ...(input.initialMakeupFilterId ? {initialMakeupFilterId: input.initialMakeupFilterId} : {}),
    mode: 'preset',
    ...(input.source ? {source: input.source} : {}),
  };
}
