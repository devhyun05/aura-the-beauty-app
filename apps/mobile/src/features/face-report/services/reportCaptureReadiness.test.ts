import {areFaceReportCaptureAssetsSettled} from './reportCaptureReadiness';

function expectEqual(actual: boolean, expected: boolean, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

expectEqual(
  areFaceReportCaptureAssetsSettled({
    assetStates: new Map(),
    expectedAssetCount: 0,
    layoutReady: false,
  }),
  false,
  'layout must finish before capture',
);

expectEqual(
  areFaceReportCaptureAssetsSettled({
    assetStates: new Map(),
    expectedAssetCount: 0,
    layoutReady: true,
  }),
  true,
  'a document without images is ready after layout',
);

expectEqual(
  areFaceReportCaptureAssetsSettled({
    assetStates: new Map([['photo-1', true]]),
    expectedAssetCount: 2,
    layoutReady: true,
  }),
  false,
  'every expected image must register',
);

expectEqual(
  areFaceReportCaptureAssetsSettled({
    assetStates: new Map([
      ['photo-1', true],
      ['photo-2', false],
    ]),
    expectedAssetCount: 2,
    layoutReady: true,
  }),
  false,
  'a pending image blocks capture',
);

expectEqual(
  areFaceReportCaptureAssetsSettled({
    assetStates: new Map([
      ['photo-1', true],
      ['photo-2', true],
    ]),
    expectedAssetCount: 2,
    layoutReady: true,
  }),
  true,
  'load or error settled images permit capture',
);

console.info('Face report capture readiness contracts passed.');
