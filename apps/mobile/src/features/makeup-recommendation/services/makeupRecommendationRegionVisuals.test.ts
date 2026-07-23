import type {FaceAnalysisRegionVisuals} from '../../face-analysis/services/faceAnalysisMeasurements';
import {
  isMakeupRecommendationCropRenderReady,
  mapAnalysisRegionVisualsToSourceCrops,
  projectRegionGuidePoints,
  resolveMakeupRecommendationAreaCropAsset,
} from './makeupRecommendationRegionVisuals';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const visuals: FaceAnalysisRegionVisuals = {
  upper: {
    cropRect: {x: 0.29, y: 0.3, w: 0.42, h: 0.14},
    guide: {
      label: 'eye line',
      points: [{x: 0.38, y: 0.4}, {x: 0.62, y: 0.4}],
    },
  },
  mid: {
    cropRect: {x: 0.3, y: 0.39, w: 0.4, h: 0.14},
    guide: {
      label: 'nose center',
      points: [{x: 0.5, y: 0.4}, {x: 0.5, y: 0.49}],
    },
  },
  lower: {
    cropRect: {x: 0.37, y: 0.52, w: 0.25, h: 0.07},
    guide: {
      label: 'lip line',
      points: [{x: 0.43, y: 0.55}, {x: 0.56, y: 0.55}],
    },
  },
  jaw: {
    cropRect: {x: 0.29, y: 0.43, w: 0.42, h: 0.23},
    guide: {
      label: 'jaw line',
      points: [{x: 0.35, y: 0.57}, {x: 0.63, y: 0.58}],
    },
  },
};

const sourceCrops = mapAnalysisRegionVisualsToSourceCrops(visuals);
expectEqual(sourceCrops?.brow?.boxes.length, 1, 'four-region source does not invent left/right brows');
expectEqual(sourceCrops?.eye?.boxes.length, 1, 'four-region source does not invent left/right eyes');
expectEqual(sourceCrops?.lip?.boxes[0]?.left, 0.37, 'lip uses measured lower crop');
expectEqual(sourceCrops?.base?.boxes[0]?.top, 0.3, 'base union starts at upper crop');
expectEqual(sourceCrops?.base?.boxes[0]?.bottom, 0.66, 'base union ends at jaw crop');

const generatedLeft = {left: 0.2, top: 0.2, right: 0.3, bottom: 0.3};
const generatedRight = {left: 0.7, top: 0.2, right: 0.8, bottom: 0.3};
const generatedFirst = resolveMakeupRecommendationAreaCropAsset({
  area: 'eye',
  generatedCropRegions: {eye: [generatedLeft, generatedRight]},
  generatedImage: {uri: 'https://cdn/after.jpg'},
  generatedReady: true,
  sourceImageUri: 'https://cdn/source.jpg',
  sourceRegionVisuals: visuals,
});
expectEqual(generatedFirst.coordinateSpace, 'generated-image', 'AFTER metadata wins');
expectEqual(generatedFirst.boxes.length, 2, 'precise generated eye pair retained');
expectEqual(generatedFirst.boxes[0], generatedLeft, 'screen-left generated box stays first');
expectEqual(generatedFirst.boxes[1], generatedRight, 'screen-right generated box stays second');
expectEqual(
  (generatedFirst.imageSource as {uri?: string}).uri,
  'https://cdn/after.jpg',
  'generated coordinates stay paired with AFTER image',
);

const sourceFallback = resolveMakeupRecommendationAreaCropAsset({
  area: 'lip',
  generatedImage: {uri: 'https://cdn/after.jpg'},
  generatedReady: true,
  sourceImageUri: 'https://cdn/source.jpg',
  sourceRegionVisuals: visuals,
});
expectEqual(sourceFallback.coordinateSpace, 'source-analysis-image', 'source fallback selected');
expectEqual(
  (sourceFallback.imageSource as {uri?: string}).uri,
  'https://cdn/source.jpg',
  'source coordinates never reuse AFTER image',
);
expectEqual(sourceFallback.guides[0]?.label, 'lip line', 'source guide evidence retained');

const generatedFullFallback = resolveMakeupRecommendationAreaCropAsset({
  area: 'brow',
  generatedImage: {uri: 'https://cdn/after.jpg'},
  generatedReady: true,
  sourceRegionVisuals: visuals,
});
expectEqual(
  generatedFullFallback.coordinateSpace,
  'full-image',
  'missing coordinates fall back to the complete generated image',
);
expectEqual(generatedFullFallback.ready, true, 'complete generated image is terminal-ready');
expectEqual(generatedFullFallback.boxes.length, 1, 'complete image fallback has one full-frame box');
expectEqual(generatedFullFallback.boxes[0]?.left, 0, 'full-frame fallback starts at left edge');
expectEqual(generatedFullFallback.boxes[0]?.bottom, 1, 'full-frame fallback reaches bottom edge');

const sourceFullFallback = resolveMakeupRecommendationAreaCropAsset({
  area: 'lip',
  generatedImage: {uri: 'https://cdn/after.jpg'},
  generatedReady: false,
  sourceImageUri: 'https://cdn/source.jpg',
});
expectEqual(
  sourceFullFallback.coordinateSpace,
  'full-image',
  'ready source image remains a safe full-frame fallback',
);
expectEqual(
  (sourceFullFallback.imageSource as {uri?: string}).uri,
  'https://cdn/source.jpg',
  'source full-frame fallback uses the real source image',
);

const unavailable = resolveMakeupRecommendationAreaCropAsset({
  area: 'brow',
  generatedImage: {uri: 'https://cdn/after.jpg'},
  generatedReady: false,
});
expectEqual(unavailable.coordinateSpace, 'unavailable', 'no ready real image remains unavailable');
expectEqual(unavailable.ready, false, 'unavailable asset is not marked ready');

expectEqual(
  isMakeupRecommendationCropRenderReady({
    assetReady: true,
    boxCount: 1,
    failedIndexes: new Set(),
    loadedIndexes: new Set([0]),
  }),
  true,
  'loaded full-frame fallback settles capture',
);
expectEqual(
  isMakeupRecommendationCropRenderReady({
    assetReady: true,
    boxCount: 1,
    failedIndexes: new Set([0]),
    loadedIndexes: new Set(),
  }),
  false,
  'image load failure is not disguised as a successful capture',
);

const projected = projectRegionGuidePoints(
  visuals.upper?.guide as NonNullable<typeof visuals.upper>['guide'],
  {height: 200, left: -20, top: -40, width: 400},
);
expectEqual(projected[0]?.x, 132, 'guide x projected through image layout');
expectEqual(projected[0]?.y, 40, 'guide y projected through image layout');

console.log('makeupRecommendationRegionVisuals.test.ts passed');
