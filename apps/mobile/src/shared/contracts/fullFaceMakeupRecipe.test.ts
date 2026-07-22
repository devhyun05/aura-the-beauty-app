import {
  DEFAULT_FULL_FACE_REGION_CONTROLS,
  FULL_FACE_REGION_RUNTIME_ASSETS,
  MAKEUP_RECIPE_REGIONS,
  REGION_ADJUSTMENT_FIELD_SCHEMAS,
  REGION_CANDIDATE_OPTIONS,
  REGION_COLOR_OPTIONS,
  REGION_FINISH_OPTIONS,
  buildFullFaceCaptureBundleFromRequest,
  buildFullFaceMakeupRecipe,
  buildFullFaceMakeupSourceInput,
  buildUnitySynchronizedCaptureRequest,
  getMakeupRecipeRegionsForArea,
  normalizeMakeupRecipeRegion,
} from './fullFaceMakeupRecipe';
import {
  AR_BLUSH_COLORS,
  AR_BLUSH_REFERENCE_SHAPES,
} from './arBlushCatalog';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const recipe = buildFullFaceMakeupRecipe({
  controls: DEFAULT_FULL_FACE_REGION_CONTROLS,
  sentAtMs: 1000,
});
const captureRequest = buildUnitySynchronizedCaptureRequest({
  capturePairId: 'pair_face_contract_1000',
  captureSetId: 'full-face-capture-set-contract',
  requestedAtMs: 1000,
});
const sourceFrameMetadata = buildFullFaceMakeupSourceInput(
  buildFullFaceCaptureBundleFromRequest(captureRequest),
);
const sourcedRecipe = buildFullFaceMakeupRecipe({
  controls: DEFAULT_FULL_FACE_REGION_CONTROLS,
  sentAtMs: 1000,
  sourceFrameMetadata,
});

expectEqual(
  MAKEUP_RECIPE_REGIONS.join(','),
  'foundation,lip,blush,brow,eyeshadow,eyeliner,lens',
  'canonical makeup region registry',
);
expectEqual(
  recipe.layers.map(layer => layer.region).join(','),
  'foundation,lip,blush,brow,eyeshadow,eyeliner',
  'full-face recipe layer order',
);
expectEqual(recipe.version, 2, 'full-face recipe version');
expectEqual(recipe.layerCount, 6, 'full-face recipe layer count');
expectEqual(recipe.enabledLayerCount, 4, 'full-face recipe enabled layer count');
// 아이섀도는 기본 OFF(기존 저장 룩·프리셋 회귀 방지) — 레이어는 존재하되 비활성.
expectEqual(
  recipe.layers.find(layer => layer.region === 'eyeshadow')?.enabled,
  false,
  'eyeshadow layer present but disabled by default',
);
expectEqual(recipe.rendererMode, 'smooth-region-mask', 'full-face renderer mode');
expectEqual(
  recipe.layers.every(layer => layer.rendererMode === 'smooth-region-mask'),
  true,
  'full-face layer renderer mode',
);
expectEqual(
  recipe.layers.find(layer => layer.region === 'brow')?.maskTextureId,
  'brow-png-natural-hair-v1',
  'natural hair brow mask id',
);
expectEqual(
  recipe.layers.find(layer => layer.region === 'eyeliner')?.maskTextureId,
  'e7-eyeliner-minimal-safe-uv-v0',
  'eyeliner mask id',
);
expectEqual(
  normalizeMakeupRecipeRegion('cheek'),
  'blush',
  'legacy cheek alias',
);
expectEqual(
  normalizeMakeupRecipeRegion('eye'),
  'eyeliner',
  'legacy eye alias',
);
expectEqual(
  getMakeupRecipeRegionsForArea('all').join(','),
  'foundation,lip,blush,brow,eyeliner',
  'all makeup area maps to five regions (eyeshadow/lens stay opt-in)',
);
expectEqual(
  getMakeupRecipeRegionsForArea('base').join(','),
  'foundation',
  'base makeup area maps to foundation',
);
expectEqual(
  getMakeupRecipeRegionsForArea('cheek').join(','),
  'blush',
  'cheek makeup area maps to blush',
);
expectEqual(
  REGION_ADJUSTMENT_FIELD_SCHEMAS.brow.some(field => field.name === 'browArch'),
  true,
  'brow arch schema is preserved',
);
expectEqual(
  REGION_ADJUSTMENT_FIELD_SCHEMAS.lip.some(field => field.name === 'upperInnerFill'),
  true,
  'lip inner fill schema is preserved',
);
expectEqual(
  REGION_COLOR_OPTIONS.blush.map(option => option.hex).join(','),
  AR_BLUSH_COLORS.map(option => option.hex).join(','),
  'full-face blush palette uses the common AR catalog',
);
expectEqual(
  REGION_CANDIDATE_OPTIONS.blush.map(option => option.label).join(','),
  AR_BLUSH_REFERENCE_SHAPES.map(option => option.label).join(','),
  'full-face blush candidate labels use the common AR catalog',
);
expectEqual(
  REGION_CANDIDATE_OPTIONS.blush.map(option => option.maskTextureId).join(','),
  AR_BLUSH_REFERENCE_SHAPES.map(option => option.maskTextureId).join(','),
  'full-face blush masks preserve the five reference mappings',
);
expectEqual(
  REGION_FINISH_OPTIONS.lip.some(option => option.finish === 'gloss'),
  true,
  'lip finish options include gloss',
);
expectEqual(
  REGION_FINISH_OPTIONS.foundation.some(option => option.finish === 'glow'),
  true,
  'foundation finish options include glow',
);
expectEqual(
  REGION_CANDIDATE_OPTIONS.lip.some(
    option => option.maskTextureId === 'e7-lip-validation-safe-v0',
  ),
  true,
  'lip candidate options include alternate runtime mask',
);
expectEqual(
  recipe.layers.find(layer => layer.region === 'lip')?.color,
  REGION_COLOR_OPTIONS.lip[0].hex,
  'default lip color reaches recipe',
);
expectEqual(
  recipe.layers.find(layer => layer.region === 'lip')?.finish,
  REGION_FINISH_OPTIONS.lip[0].finish,
  'default lip finish reaches recipe',
);
expectEqual(
  FULL_FACE_REGION_RUNTIME_ASSETS.blush.maskTextureId,
  'e7-blush-balanced-uv-v0',
  'blush runtime fallback keeps the 512px balanced atlas',
);
expectEqual(
  FULL_FACE_REGION_RUNTIME_ASSETS.blush.candidateId,
  'blush-balanced-soft-oval-v0',
  'blush runtime fallback candidate id',
);
expectEqual(
  DEFAULT_FULL_FACE_REGION_CONTROLS.blush.opacity,
  0.58,
  'default full-face blush opacity is visibly stronger',
);
expectEqual(
  DEFAULT_FULL_FACE_REGION_CONTROLS.blush.intensity,
  0.62,
  'default full-face blush intensity is visibly stronger',
);
expectEqual(
  FULL_FACE_REGION_RUNTIME_ASSETS.foundation.maskTextureId,
  'foundation-skin-mask-v1',
  'foundation runtime asset id',
);
expectEqual(
  captureRequest.purpose,
  'full_face_makeup_capture_neutral',
  'capture request purpose',
);
expectEqual(
  sourceFrameMetadata.capture.framePath,
  'Documents/e7-reference-atlas/capture_pairs/pair_face_contract_1000/frame.png',
  'capture bundle frame path',
);
expectEqual(
  sourceFrameMetadata.capture.arFaceExportPath,
  'Documents/e7-reference-atlas/capture_pairs/pair_face_contract_1000/arface_export.json',
  'capture bundle arface path',
);
expectEqual(
  sourcedRecipe.sourceFrameMetadata?.capture.captureSetId,
  'full-face-capture-set-contract',
  'recipe keeps capture set id',
);
