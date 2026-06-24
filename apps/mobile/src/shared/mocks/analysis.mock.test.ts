import {getAnalysisAvoidedMakeupImageAssetNames} from './analysis.mock';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const avoidedImageAssetNames = getAnalysisAvoidedMakeupImageAssetNames();
const smokyImageAssetName: 'report-avoid-heavy-smoky.png' =
  avoidedImageAssetNames['너무 진한 스모키'];
const contourImageAssetName: 'report-avoid-strong-contour.png' =
  avoidedImageAssetNames['과한 컨투어링'];

expectEqual(
  avoidedImageAssetNames['너무 진한 스모키'],
  smokyImageAssetName,
  'heavy smoky image asset',
);
expectEqual(
  avoidedImageAssetNames['과한 컨투어링'],
  contourImageAssetName,
  'strong contour image asset',
);
