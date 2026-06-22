import type {FaceCaptureCheckState} from '../services/faceCaptureValidation';

export const mockReadyFaceCaptureChecks: FaceCaptureCheckState = {
  isFaceCentered: true,
  isLookingForward: true,
  isFaceUncovered: true,
  isHairClear: true,
  isLightingEven: true,
};

export const mockBlockedFaceCaptureChecks: FaceCaptureCheckState = {
  isFaceCentered: true,
  isLookingForward: false,
  isFaceUncovered: true,
  isHairClear: false,
  isLightingEven: true,
};
