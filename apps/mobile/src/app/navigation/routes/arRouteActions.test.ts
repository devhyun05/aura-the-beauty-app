import {getARFilterDetailEditRouteParams} from './arRouteActions';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const detailEditRouteParams = getARFilterDetailEditRouteParams();

expectEqual(
  detailEditRouteParams.backRoute,
  'ARFilter',
  'AR filter detail edit back route',
);
expectEqual(
  detailEditRouteParams.mode,
  'preset',
  'AR filter detail edit mode',
);
