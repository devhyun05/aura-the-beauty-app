import {
  createFullFaceMakeupRecipeFromEditState,
  createFullFaceMakeupSavedContract,
  getInitialFullFaceMakeupEditState,
} from './fullFaceMakeupEditService';
import {
  createRecommendedMakeupEditState,
  createRecommendedMakeupSavedContract,
} from './recommendedMakeupEditService';
import {buildSavedArLookRequest} from './savedArLookService';
import {getRecommendedMakeupFilterById} from '../../../shared/services/makeupGuideService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const cleanSmokyFilter = getRecommendedMakeupFilterById(
  'filter-clean-smoky-city',
);
const cleanSmokyState = createRecommendedMakeupEditState(cleanSmokyFilter);

expectEqual(cleanSmokyState.selectedRegion, 'lip', 'recommended selected region');
expectEqual(
  cleanSmokyState.controls.foundation.enabled,
  false,
  'recommended disabled foundation',
);
expectEqual(cleanSmokyState.controls.lip.enabled, true, 'recommended enabled lip');
expectEqual(
  cleanSmokyState.controls.blush.enabled,
  true,
  'recommended enabled blush',
);
expectEqual(cleanSmokyState.controls.brow.enabled, true, 'recommended enabled brow');
expectEqual(
  cleanSmokyState.controls.eyeliner.enabled,
  true,
  'recommended enabled eyeliner',
);
expectEqual(
  cleanSmokyState.controls.lip.colorHex,
  cleanSmokyFilter.colorOptions[0]?.hex,
  'recommended primary lip color',
);
expectEqual(
  cleanSmokyState.controls.lip.intensity,
  cleanSmokyFilter.presetValues.intensity,
  'recommended preset intensity',
);

const cleanSmokyRecipe = createFullFaceMakeupRecipeFromEditState(
  cleanSmokyState,
  1000,
);
expectEqual(cleanSmokyRecipe.version, 2, 'recommended recipe version');
expectEqual(
  cleanSmokyRecipe.activeRegions,
  'lip,blush,brow,eyeliner',
  'recommended recipe active regions',
);

const glowFilter = getRecommendedMakeupFilterById('filter-gyaru-glow');
const glowState = createRecommendedMakeupEditState(glowFilter);
expectEqual(glowState.controls.lip.finish, 'gloss', 'recommended glow lip finish');
expectEqual(
  glowState.controls.eyeliner.finish,
  'soft-eye-shimmer',
  'recommended glow eye finish',
);

const savedContract = createRecommendedMakeupSavedContract(
  cleanSmokyFilter,
  2000,
);
const savedRequest = buildSavedArLookRequest(
  savedContract,
  '11111111-1111-4111-8111-111111111111',
);

expectEqual(savedContract.source, 'preset', 'recommended saved contract source');
expectEqual(
  savedRequest.stylePayload.schemaVersion,
  'saved_ar_look_v1',
  'recommended saved payload schema',
);
expectEqual(
  savedRequest.stylePayload.recipeContract,
  'FullFaceMakeupRecipe',
  'recommended saved recipe contract',
);
expectEqual(
  savedRequest.stylePayload.source,
  'preset',
  'recommended saved payload source',
);

const defaultEditState = getInitialFullFaceMakeupEditState();
const defaultRecipe = createFullFaceMakeupRecipeFromEditState(
  defaultEditState,
  3000,
);
const defaultSavedContract = createFullFaceMakeupSavedContract({
  editState: defaultEditState,
  recipe: defaultRecipe,
  savedAtMs: 3000,
});

expectEqual(
  defaultSavedContract.source,
  'face-analysis-full-face',
  'existing Unity save source remains the default',
);
