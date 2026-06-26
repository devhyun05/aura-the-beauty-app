import type {FaceCaptureCheckState} from '../services/faceCaptureValidation';
import {createBlockedFaceCaptureChecks} from '../services/faceCaptureValidation';

export const mockPendingFaceCaptureChecks: FaceCaptureCheckState = createBlockedFaceCaptureChecks();

export const mockReadyFaceCaptureChecks: FaceCaptureCheckState = {
  hasSingleFace: true,
  isFaceCentered: true,
  isFaceShapeDetected: true,
  isFaceUncovered: true,
  isHairClear: true,
  isLightingEven: true,
  isLookingForward: true,
};

export const mockBlockedFaceCaptureChecks: FaceCaptureCheckState = {
  hasSingleFace: true,
  isFaceCentered: true,
  isFaceShapeDetected: true,
  isFaceUncovered: true,
  isHairClear: false,
  isLightingEven: true,
  isLookingForward: false,
};