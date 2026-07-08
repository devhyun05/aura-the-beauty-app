import type {
  BeardGoal,
  BeardRegion,
  BeardSimulationStage,
  BeardType,
  GuardCheckId,
  ShavingState,
} from './contracts/types';

/** Stage copy deliberately carries no session counts — the stage is a look,
 * not a prediction. Session-range info lives only in the collapsed
 * REFERENCE_INFO sheet below. */
export const STAGE_DISPLAY: Record<
  BeardSimulationStage,
  {label: string; description: string}
> = {
  mild: {
    label: '초기 변화 느낌',
    description: '푸른 그림자가 살짝 옅어진 모습이에요.',
  },
  medium: {
    label: '눈에 띄는 변화 느낌',
    description: '그림자가 옅어지고 수염 밀도가 줄어든 모습이에요.',
  },
  strong: {
    label: '많이 줄어든 느낌',
    description: '수염과 그림자가 크게 줄어든 모습이에요.',
  },
};

/** Collapsed "일반 정보" sheet — reference only, never shown next to results. */
export const REFERENCE_INFO = {
  title: '일반 정보 (참고용)',
  body:
    '레이저 제모는 일반적으로 여러 회에 걸쳐 진행되며, 회차 수와 간격은 모발 굵기·피부 상태에 따라 크게 달라집니다. ' +
    '위 단계 이미지는 특정 회차의 결과를 의미하지 않습니다. 정확한 계획은 의료 전문가와 상담하세요.',
};

export const SHAVING_STATE_DISPLAY: Record<ShavingState, string> = {
  clean: '매일 면도 (깔끔한 상태)',
  stubble: '짧은 수염이 자주 올라옴',
  short: '짧게 유지하는 편',
  dense: '수염이 굵고 밀도가 높음',
};

export const GOAL_DISPLAY: Record<BeardGoal, string> = {
  shadow_reduction: '면도 후 푸른 그림자 완화',
  density_reduction: '수염 밀도 줄이기',
  full_visualization: '전체 제모 모습 보기',
};

export const REGION_DISPLAY: Record<BeardRegion, string> = {
  mustache: '인중',
  chin: '턱',
  mouth_side: '입가',
  jaw: '턱선·볼',
};

export const BEARD_TYPE_DISPLAY: Record<BeardType, string> = {
  shadow_dominant: '그림자 위주형',
  stubble: '짧은 수염형',
  patchy: '부분 분포형',
  dense: '고밀도형',
};

export const GUARD_CHECK_DISPLAY: Record<GuardCheckId, string> = {
  mask_protect_overlap: '입술·콧망울 보호 영역 침범 없음',
  landmark_drift: '입술·턱 위치 변형 없음',
  jawline_iou: '턱선 윤곽 유지',
  identity_distance: '동일인 검증',
  seam_score: '경계 자연스러움',
};

/** Failure UX copy — reasons come from the engine as
 * "quality_gate:<check>" / "guard:<check>". */
export const FAILURE_COPY: Record<string, {title: string; guidance: string[]}> = {
  'quality_gate:no_face_detected': {
    title: '얼굴을 찾지 못했어요',
    guidance: ['정면을 바라보고 얼굴 전체가 나오게 촬영해 주세요.'],
  },
  'quality_gate:face_too_small': {
    title: '얼굴이 너무 작게 나왔어요',
    guidance: ['카메라를 조금 더 가까이에서 촬영해 주세요.'],
  },
  'quality_gate:head_tilted': {
    title: '고개가 기울어져 있어요',
    guidance: ['고개를 똑바로 하고 정면을 바라봐 주세요.'],
  },
  'quality_gate:face_not_frontal': {
    title: '정면 사진이 필요해요',
    guidance: ['정면을 바라보고 다시 촬영해 주세요.'],
  },
  'quality_gate:photo_too_blurry': {
    title: '사진이 흔들렸어요',
    guidance: ['휴대폰을 고정하고 초점이 맞은 뒤 촬영해 주세요.'],
  },
  'quality_gate:bad_lighting': {
    title: '조명이 너무 어둡거나 밝아요',
    guidance: ['밝고 고른 조명 아래에서 다시 촬영해 주세요.'],
  },
  'guard:mask_protect_overlap': {
    title: '정확한 분석이 어려운 사진이에요',
    guidance: [
      '입 주변이 가려지지 않게 촬영해 주세요.',
      '수염이 긴 상태라면 짧게 정리한 뒤 다시 시도하면 정확도가 올라가요.',
    ],
  },
  default: {
    title: '결과를 안전하게 만들 수 없었어요',
    guidance: [
      '얼굴 변형 없이 자연스러운 결과를 만들 수 없어 표시하지 않았어요.',
      '정면·밝은 조명에서 다시 촬영해 주세요.',
    ],
  },
};

export const CONSENT_NOTICE = [
  '사진은 시뮬레이션 생성에만 사용되며, 개발 단계에서는 로컬 서버에서 처리됩니다.',
  '결과 이미지는 참고용 합성 이미지이며 의료적 예측이 아닙니다.',
  '삭제 버튼을 누르면 사진과 결과물이 즉시 삭제됩니다.',
];
