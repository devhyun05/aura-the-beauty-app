import {buildSavedArLookRequest} from './savedArLookService';
import {
  createFullFaceMakeupRecipeFromEditState,
  createFullFaceMakeupSavedContract,
  getInitialFullFaceMakeupEditState,
} from './fullFaceMakeupEditService';

const editState = getInitialFullFaceMakeupEditState({
  sourceFrameMetadata: {
    capture: {
      arFaceExportPath: '/private/user-face.png',
      capturePairId: 'capture-pair',
    },
  } as never,
});
const recipe = createFullFaceMakeupRecipeFromEditState(editState, 1000);
const request = buildSavedArLookRequest(
  createFullFaceMakeupSavedContract({editState, recipe, savedAtMs: 1000}),
  '11111111-1111-4111-8111-111111111111',
);

request satisfies {
  clientRequestId: string;
  stylePayload: {
    recipe: object;
    recipeContract: 'FullFaceMakeupRecipe';
    schemaVersion: 'saved_ar_look_v1';
  };
};

if ('sourceFrameMetadata' in request.stylePayload.recipe) {
  throw new Error('Saved AR look requests must not include sourceFrameMetadata.');
}
