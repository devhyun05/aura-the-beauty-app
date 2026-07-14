import {requestBackendJson} from '../../../shared/services/backendApi';
import type {FullFaceMakeupRecipe} from '../../../shared/contracts/fullFaceMakeupRecipe';
import type {FullFaceMakeupSavedContract} from './fullFaceMakeupEditService';

const SENSITIVE_RECIPE_KEY =
  /(?:source.?frame|camera.?frame|raw.?frame|landmark|face.?embedding|identity.?embedding|face.?image)/i;

export type SavedArLook = {
  id: string;
  clientRequestId: string;
  title: string;
  stylePayload: {
    schemaVersion: 'saved_ar_look_v1';
    recipeContract: 'FullFaceMakeupRecipe';
    recipe: FullFaceMakeupRecipe;
    source: 'face-analysis-full-face';
  };
};

type SaveArLookResponse = {
  style: SavedArLook;
};

export function createSavedArLookClientRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function stripSensitiveRecipeValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => stripSensitiveRecipeValue(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value).reduce<Record<string, unknown>>((result, [key, item]) => {
    if (!SENSITIVE_RECIPE_KEY.test(key)) {
      result[key] = stripSensitiveRecipeValue(item);
    }
    return result;
  }, {}) as T;
}

/**
 * Builds the only AR-look payload allowed to leave the device. Capture paths,
 * face landmarks and identity data are removed before the request is created;
 * the backend repeats this minimisation and authors the recommendation projection.
 */
export function buildSavedArLookRequest(
  savedContract: FullFaceMakeupSavedContract,
  clientRequestId = createSavedArLookClientRequestId(),
) {
  return {
    clientRequestId,
    styleType: 'look',
    title: '저장한 AR 메이크업 룩',
    tags: ['AR 메이크업'],
    stylePayload: {
      schemaVersion: 'saved_ar_look_v1' as const,
      source: savedContract.source,
      recipeContract: 'FullFaceMakeupRecipe' as const,
      recipe: stripSensitiveRecipeValue(savedContract.recipe),
    },
  };
}

export async function saveArLook(
  savedContract: FullFaceMakeupSavedContract,
  clientRequestId = createSavedArLookClientRequestId(),
): Promise<SavedArLook> {
  const response = await requestBackendJson<SaveArLookResponse>('/makeup-styles', {
    body: buildSavedArLookRequest(savedContract, clientRequestId),
    method: 'POST',
  });
  return response.style;
}
