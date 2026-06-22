import {colors} from '../../../shared/theme';

export const FACE_CAPTURE_READY_COLOR = colors.white;
export const FACE_CAPTURE_ERROR_COLOR = colors.danger;

export type FaceCaptureCheckKey =
  | 'isFaceCentered'
  | 'isLookingForward'
  | 'isFaceUncovered'
  | 'isHairClear'
  | 'isLightingEven';

export type FaceCaptureCheckState = Record<FaceCaptureCheckKey, boolean>;

export type FaceCaptureGuidanceStatus = 'ready' | 'blocked';

export type FaceCaptureGuidance = {
  status: FaceCaptureGuidanceStatus;
  isCaptureEnabled: boolean;
  tintColor: string;
  message: string | null;
  failedChecks: FaceCaptureCheckKey[];
};

type FaceCaptureRule = {
  key: FaceCaptureCheckKey;
  message: string;
};

const FACE_CAPTURE_RULES: readonly FaceCaptureRule[] = [
  {
    key: 'isFaceCentered',
    message: '얼굴을 가이드 안에 맞춰 주세요',
  },
  {
    key: 'isLookingForward',
    message: '정면을 바라봐 주세요',
  },
  {
    key: 'isFaceUncovered',
    message: '안경과 얼굴을 가리는 액세서리를 제거해 주세요',
  },
  {
    key: 'isHairClear',
    message: '앞머리를 넘겨 이마를 보여 주세요',
  },
  {
    key: 'isLightingEven',
    message: '밝은 곳에서 얼굴을 비춰 주세요',
  },
];

export function evaluateFaceCaptureGuidance(
  checks: FaceCaptureCheckState,
): FaceCaptureGuidance {
  const failedRules = FACE_CAPTURE_RULES.filter(rule => !checks[rule.key]);

  if (failedRules.length === 0) {
    return {
      status: 'ready',
      isCaptureEnabled: true,
      tintColor: FACE_CAPTURE_READY_COLOR,
      message: null,
      failedChecks: [],
    };
  }

  return {
    status: 'blocked',
    isCaptureEnabled: false,
    tintColor: FACE_CAPTURE_ERROR_COLOR,
    message: failedRules[0].message,
    failedChecks: failedRules.map(rule => rule.key),
  };
}
