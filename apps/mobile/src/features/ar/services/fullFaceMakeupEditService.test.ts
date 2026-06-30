import {
  createFullFaceMakeupRecipeFromEditState,
  createFullFaceMakeupSavedContract,
  getFullFaceMakeupAdjustmentFields,
  getFullFaceMakeupCandidateOptions,
  getFullFaceMakeupColorOptions,
  getFullFaceMakeupFinishOptions,
  getFullFaceMakeupRegionLabel,
  getInitialFullFaceMakeupEditState,
  selectFullFaceMakeupRegion,
  updateFullFaceMakeupRegionCandidate,
  updateFullFaceMakeupRegionColor,
  updateFullFaceMakeupRegionEnabled,
  updateFullFaceMakeupRegionFinish,
  updateFullFaceMakeupRegionIntensity,
  updateFullFaceMakeupRegionParam,
} from './fullFaceMakeupEditService';
import {
  buildFullFaceCaptureBundleFromRequest,
  buildFullFaceMakeupSourceInput,
  buildUnitySynchronizedCaptureRequest,
} from '../../../shared/contracts/fullFaceMakeupRecipe';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const initialState = getInitialFullFaceMakeupEditState();
const sourceFrameMetadata = buildFullFaceMakeupSourceInput(
  buildFullFaceCaptureBundleFromRequest(
    buildUnitySynchronizedCaptureRequest({
      capturePairId: 'pair_face_edit_1000',
      captureSetId: 'full-face-capture-set-edit',
      requestedAtMs: 1000,
    }),
  ),
);
const sourcedInitialState = getInitialFullFaceMakeupEditState({sourceFrameMetadata});

expectEqual(initialState.selectedRegion, 'lip', 'initial selected region');
expectEqual(
  sourcedInitialState.sourceFrameMetadata?.capture.capturePairId,
  'pair_face_edit_1000',
  'initial state keeps source capture pair',
);
expectEqual(
  getFullFaceMakeupRegionLabel('eyeliner'),
  '아이라이너',
  'eyeliner product label',
);
expectEqual(
  getFullFaceMakeupAdjustmentFields('brow').some(field => field.name === 'browArch'),
  true,
  'brow adjustment schema includes browArch',
);
expectEqual(
  getFullFaceMakeupColorOptions('lip').some(option => option.hex === '#A64262'),
  true,
  'lip color palette is available',
);
expectEqual(
  getFullFaceMakeupFinishOptions('lip').some(option => option.finish === 'gloss'),
  true,
  'lip finish options include gloss',
);
expectEqual(
  getFullFaceMakeupCandidateOptions('brow').some(
    option => option.maskTextureId === 'brow-soft-arch-fine-hair-v1',
  ),
  true,
  'brow candidate options include alternate runtime mask',
);

const selectedBrowState = selectFullFaceMakeupRegion(initialState, 'brow');

expectEqual(selectedBrowState.selectedRegion, 'brow', 'selected brow region');

const browSpreadState = updateFullFaceMakeupRegionParam({
  state: selectedBrowState,
  region: 'brow',
  fieldName: 'maskSpreadX',
  direction: 'increase',
});

expectEqual(
  browSpreadState.controls.brow.params.maskSpreadX,
  0.02,
  'brow maskSpreadX increases by schema step',
);
expectEqual(
  initialState.controls.brow.params.maskSpreadX,
  0,
  'initial brow control remains immutable',
);

const disabledLipState = updateFullFaceMakeupRegionEnabled(
  initialState,
  'lip',
  false,
);
const softenedEyelinerState = updateFullFaceMakeupRegionIntensity({
  state: disabledLipState,
  region: 'eyeliner',
  direction: 'decrease',
});
const recoloredLipState = updateFullFaceMakeupRegionColor(
  softenedEyelinerState,
  'lip',
  '#A64262',
);
const glossyLipState = updateFullFaceMakeupRegionFinish(
  recoloredLipState,
  'lip',
  'gloss',
);
const alternateBrowState = updateFullFaceMakeupRegionCandidate(
  glossyLipState,
  'brow',
  'soft',
);
const recipe = createFullFaceMakeupRecipeFromEditState(alternateBrowState, 1000);
const sourcedRecipe = createFullFaceMakeupRecipeFromEditState(
  sourcedInitialState,
  1000,
);

expectEqual(recipe.version, 2, 'edited recipe version');
expectEqual(recipe.layerCount, 4, 'edited recipe layer count');
expectEqual(recipe.enabledLayerCount, 3, 'edited recipe enabled count');
expectEqual(
  recipe.activeRegions,
  'blush,brow,eyeliner',
  'edited recipe active region summary',
);
expectEqual(
  recipe.layers.find(layer => layer.region === 'lip')?.enabled,
  false,
  'disabled lip layer',
);
expectEqual(
  recipe.layers.find(layer => layer.region === 'eyeliner')?.intensity,
  0.67,
  'eyeliner intensity decreases by control step',
);
expectEqual(
  recipe.layers.find(layer => layer.region === 'lip')?.color,
  '#A64262',
  'lip color selection reaches recipe',
);
expectEqual(
  recipe.layers.find(layer => layer.region === 'lip')?.finish,
  'gloss',
  'lip finish selection reaches recipe',
);
expectEqual(
  recipe.layers.find(layer => layer.region === 'lip')?.glossBoost,
  0.34,
  'lip gloss tuning reaches recipe',
);
expectEqual(
  recipe.layers.find(layer => layer.region === 'brow')?.maskTextureId,
  'brow-soft-arch-fine-hair-v1',
  'brow candidate selection reaches recipe',
);
expectEqual(
  sourcedRecipe.sourceFrameMetadata?.capture.arFaceExportPath,
  'Documents/e7-reference-atlas/capture_pairs/pair_face_edit_1000/arface_export.json',
  'edited recipe keeps arface export path',
);

const savedContract = createFullFaceMakeupSavedContract({
  editState: alternateBrowState,
  recipe,
  savedAtMs: 2000,
});

expectEqual(
  savedContract.savedPackageId,
  'full-face-saved-2000',
  'saved package id',
);
expectEqual(
  savedContract.source,
  'face-analysis-full-face',
  'saved contract source',
);
expectEqual(
  savedContract.editState,
  alternateBrowState,
  'saved contract keeps editable state for re-entry',
);
