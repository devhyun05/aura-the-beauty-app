import type {ImageSourcePropType} from 'react-native';

import type {
  FaceAnalysisRegionGuide,
  FaceAnalysisRegionKey,
  FaceAnalysisRegionVisuals,
} from '../../face-analysis/services/faceAnalysisMeasurements';
import type {PartKey} from '../screens/recommendationResultTypes';
import type {
  MakeupRecommendationCropBox,
  MakeupRecommendationCropRegions,
} from '../types';

const AREA_REGION_KEY: Readonly<Record<PartKey, FaceAnalysisRegionKey>> = {
  base: 'jaw',
  brow: 'upper',
  eye: 'upper',
  cheek: 'mid',
  lip: 'lower',
};

const AREA_GUIDE_REGION_KEY: Partial<Record<PartKey, FaceAnalysisRegionKey>> = {
  base: 'jaw',
  eye: 'upper',
  lip: 'lower',
};

export type MakeupRecommendationSourceRegionCrop = {
  boxes: readonly MakeupRecommendationCropBox[];
  guides: readonly FaceAnalysisRegionGuide[];
};

export type MakeupRecommendationSourceRegionCrops = Partial<
  Record<PartKey, MakeupRecommendationSourceRegionCrop>
>;

export type MakeupRecommendationAreaCropAsset = {
  boxes: readonly MakeupRecommendationCropBox[];
  coordinateSpace:
    | 'full-image'
    | 'generated-image'
    | 'source-analysis-image'
    | 'unavailable';
  guides: readonly FaceAnalysisRegionGuide[];
  imageSource: ImageSourcePropType;
  ready: boolean;
};

const FULL_IMAGE_BOX: MakeupRecommendationCropBox = {
  bottom: 1,
  left: 0,
  right: 1,
  top: 0,
};

function toCropBox(
  visuals: FaceAnalysisRegionVisuals,
  key: FaceAnalysisRegionKey,
): MakeupRecommendationCropBox | undefined {
  const rect = visuals[key]?.cropRect;
  if (!rect) return undefined;
  return {
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.w,
    bottom: rect.y + rect.h,
  };
}

function unionCropBoxes(
  boxes: readonly MakeupRecommendationCropBox[],
): MakeupRecommendationCropBox | undefined {
  if (boxes.length === 0) return undefined;
  return {
    left: Math.min(...boxes.map(box => box.left)),
    top: Math.min(...boxes.map(box => box.top)),
    right: Math.max(...boxes.map(box => box.right)),
    bottom: Math.max(...boxes.map(box => box.bottom)),
  };
}

/**
 * Converts report geometry into crop references for the source analysis photo.
 * Brow/eye intentionally share the measured upper region: the four-region
 * contract cannot honestly invent separate left/right boxes. Generated
 * MediaPipe metadata remains the only precise two-sided AFTER crop source.
 */
export function mapAnalysisRegionVisualsToSourceCrops(
  visuals: FaceAnalysisRegionVisuals | undefined,
): MakeupRecommendationSourceRegionCrops | undefined {
  if (!visuals) return undefined;
  const result: MakeupRecommendationSourceRegionCrops = {};

  for (const area of ['base', 'brow', 'eye', 'cheek', 'lip'] as const) {
    const regionKey = AREA_REGION_KEY[area];
    const region = visuals[regionKey];
    const box = toCropBox(visuals, regionKey);
    if (!region || !box) continue;
    result[area] = {
      boxes: [box],
      guides: AREA_GUIDE_REGION_KEY[area] === regionKey
        ? [region.guide]
        : [],
    };
  }

  const allBoxes = (['upper', 'mid', 'lower', 'jaw'] as const)
    .map(key => toCropBox(visuals, key))
    .filter((box): box is MakeupRecommendationCropBox => Boolean(box));
  const fullFaceBox = unionCropBoxes(allBoxes);
  if (fullFaceBox) {
    result.base = {
      boxes: [fullFaceBox],
      guides: visuals.jaw ? [visuals.jaw.guide] : [],
    };
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Coordinate-space-safe fallback order:
 * 1) generated image + its own MediaPipe crop metadata;
 * 2) generated image + source report regionVisuals for identity-preserving edits;
 * 3) source report image + source report regionVisuals while generation is pending;
 * 4) the complete generated image, without invented crop coordinates;
 * 5) the complete source image, without invented crop coordinates;
 * 6) unavailable placeholder when no real image is ready.
 *
 * Once AFTER is ready, an area guide must never show the unmade-up source.
 */
export function resolveMakeupRecommendationAreaCropAsset(input: {
  area: PartKey;
  generatedCropRegions?: MakeupRecommendationCropRegions;
  generatedImage: ImageSourcePropType;
  generatedReady: boolean;
  sourceImageUri?: string;
  sourceRegionVisuals?: FaceAnalysisRegionVisuals;
}): MakeupRecommendationAreaCropAsset {
  const generatedBoxes = input.generatedCropRegions?.[input.area] ?? [];
  if (input.generatedReady && generatedBoxes.length > 0) {
    return {
      boxes: generatedBoxes,
      coordinateSpace: 'generated-image',
      guides: [],
      imageSource: input.generatedImage,
      ready: true,
    };
  }

  if (input.generatedReady) {
    return {
      boxes: [FULL_IMAGE_BOX],
      coordinateSpace: 'full-image',
      guides: [],
      imageSource: input.generatedImage,
      ready: true,
    };
  }

  const sourceCrop = mapAnalysisRegionVisualsToSourceCrops(
    input.sourceRegionVisuals,
  )?.[input.area];
  if (input.sourceImageUri?.trim() && sourceCrop?.boxes.length) {
    return {
      boxes: sourceCrop.boxes,
      coordinateSpace: 'source-analysis-image',
      guides: sourceCrop.guides,
      imageSource: {uri: input.sourceImageUri.trim()},
      ready: true,
    };
  }

  const sourceImageUri = input.sourceImageUri?.trim();
  if (sourceImageUri) {
    return {
      boxes: [FULL_IMAGE_BOX],
      coordinateSpace: 'full-image',
      guides: [],
      imageSource: {uri: sourceImageUri},
      ready: true,
    };
  }

  return {
    boxes: [],
    coordinateSpace: 'unavailable',
    guides: [],
    imageSource: input.generatedImage,
    ready: false,
  };
}

export function isMakeupRecommendationCropRenderReady(input: {
  assetReady: boolean;
  boxCount: number;
  failedIndexes: ReadonlySet<number>;
  loadedIndexes: ReadonlySet<number>;
}): boolean {
  if (!input.assetReady || input.boxCount <= 0) return false;

  for (let index = 0; index < input.boxCount; index += 1) {
    if (
      input.failedIndexes.has(index)
      || !input.loadedIndexes.has(index)
    ) {
      return false;
    }
  }

  return true;
}

export function projectRegionGuidePoints(
  guide: FaceAnalysisRegionGuide,
  imageLayout: {height: number; left: number; top: number; width: number},
): Array<{x: number; y: number}> {
  return guide.points.map(point => ({
    x: imageLayout.left + point.x * imageLayout.width,
    y: imageLayout.top + point.y * imageLayout.height,
  }));
}
