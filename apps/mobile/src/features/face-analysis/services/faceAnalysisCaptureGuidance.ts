import {DEFAULT_FACE_3D_REQUEST_OPTIONS} from '../../face-3d/services/face3DContract';
import type {Face3DStatus} from '../../face-3d/types';

export const FACE_ANALYSIS_CAPTURE_PLAN = [
  {
    description: '촬영 한 번으로 정면 사진과 3D 얼굴 정보를 함께 측정해요.',
    id: 's1',
    title: '통합 얼굴 촬영',
  },
] as const;

export const FACE_ANALYSIS_CAPTURE_DURATION_COPY =
  '보통 40초 내외이며, 얼굴을 맞추는 시간에 따라 더 걸릴 수 있어요.' as const;

export const FACE_3D_PREFLIGHT_COPY = {
  action: '준비됐어요',
  description:
    '약 3초 동안 정면을 보고 입술을 편하게 다문 채 표정과 고개를 유지해 주세요.',
  title: '이제 3D 얼굴 측정이에요',
} as const;

const FACE_3D_STATUS_COPY: Record<Face3DStatus, string> = {
  blocked: '3D 측정을 완료하지 못했어요.',
  collecting: '좋아요. 표정과 고개를 그대로 유지해 주세요.',
  completed: '3D 측정이 완료됐어요.',
  error: '3D 측정을 완료하지 못했어요.',
  idle: '얼굴을 타원 안에 맞추면 자동으로 측정해요.',
  preparing: '3D 카메라를 준비하고 있어요.',
  tracking: '정면을 보고 얼굴 윤곽이 안정될 때까지 유지해 주세요.',
};

const FACE_3D_COLLECTION_SECONDS = Math.ceil(
  DEFAULT_FACE_3D_REQUEST_OPTIONS.maximumDurationMs / 1000,
);

export function getFace3DRemainingSeconds(
  validFrameCount: number,
  targetFrameCount: number,
): number {
  if (targetFrameCount <= 0) {
    return FACE_3D_COLLECTION_SECONDS;
  }

  const progress = Math.min(1, Math.max(0, validFrameCount / targetFrameCount));
  return Math.ceil((1 - progress) * FACE_3D_COLLECTION_SECONDS);
}

export function getFace3DStatusCopy(status: Face3DStatus): string {
  return FACE_3D_STATUS_COPY[status];
}

export function getFace3DFailureAction(attemptCount: number): 'retry' | 'review' {
  return attemptCount >= 2 ? 'review' : 'retry';
}

export function shouldStartFace3DMeasurement({
  attemptCount,
  instructionsAccepted,
  nativeViewReady,
}: {
  attemptCount: number;
  instructionsAccepted: boolean;
  nativeViewReady: boolean;
}): boolean {
  return instructionsAccepted && nativeViewReady && attemptCount === 0;
}
