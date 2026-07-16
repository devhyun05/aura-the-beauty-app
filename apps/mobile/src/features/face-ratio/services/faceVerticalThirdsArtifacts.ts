import * as FileSystem from 'expo-file-system/legacy';

import type {
  FaceRatioPhase1ReplayValidation,
  FaceVerticalThirdsResult,
  VerticalThirdsKeypoint,
} from '../types';
import {getFaceRatioSessionDirUri} from './faceVerticalThirdsLogger';
import type {
  FaceRatioLandmark3D,
  FaceRatioTransformationMatrix,
} from './faceRatioPoseNormalization';
import {
  appendFaceRatioPhase1ReplayCapture,
  createFaceRatioPhase1ReplayArtifact,
  createFaceRatioPhase1ReplayCapture,
  isFaceRatioPhase1LocalCaptureUri,
  isFaceRatioPhase1ReplayArtifactExpired,
  validateFaceRatioPhase1ReplayArtifact,
  validateFaceRatioPhase1ReplayValidation,
  type FaceRatioPhase1ReplayArtifact,
} from './faceRatioPhase1ReplayArtifact';

const SOURCE_IMAGE_FILE_NAME = 'source.jpg';
const OVERLAY_IMAGE_FILE_NAME = 'overlay.png';
const RESULT_FILE_NAME = 'result.json';
const PHASE1_REPLAY_ROOT_DIRECTORY_NAME =
  'face-ratio-phase1-validation/';
const PHASE1_REPLAY_FILE_NAME = 'phase1-replay.json';

function getPhase1ReplayRootUri() {
  return FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}${PHASE1_REPLAY_ROOT_DIRECTORY_NAME}`
    : null;
}

function getPhase1ReplaySessionDirectoryUri(
  validation: FaceRatioPhase1ReplayValidation,
) {
  const rootUri = getPhase1ReplayRootUri();

  return rootUri
    ? `${rootUri}${validation.cohortId}/${validation.subjectId}/${validation.sessionId}/`
    : null;
}

async function readDirectoryOrEmpty(directoryUri: string) {
  try {
    return await FileSystem.readDirectoryAsync(directoryUri);
  } catch {
    return [];
  }
}

// raw 얼굴 자료는 dedicated validation root 아래에만 존재한다. 만료 시각이
// 지났거나 retention metadata를 읽을 수 없는 세션은 다음 쓰기 전에 삭제한다.
// 손상된 파일을 무기한 보존하는 것보다 privacy fail-closed 삭제가 우선이다.
export async function pruneExpiredFaceRatioPhase1ReplayArtifacts(
  now = new Date(),
) {
  const rootUri = getPhase1ReplayRootUri();

  if (!rootUri) {
    return 0;
  }

  let deletedCount = 0;
  const cohortNames = await readDirectoryOrEmpty(rootUri);

  for (const cohortName of cohortNames.filter(name => name.startsWith('cohort_'))) {
    const cohortUri = `${rootUri}${cohortName}/`;
    const subjectNames = await readDirectoryOrEmpty(cohortUri);

    for (const subjectName of subjectNames.filter(name => name.startsWith('subj_'))) {
      const subjectUri = `${cohortUri}${subjectName}/`;
      const sessionNames = await readDirectoryOrEmpty(subjectUri);

      for (const sessionName of sessionNames.filter(name =>
        name.startsWith('session_'),
      )) {
        const sessionUri = `${subjectUri}${sessionName}/`;
        const artifactUri = `${sessionUri}${PHASE1_REPLAY_FILE_NAME}`;
        let shouldDelete = false;

        try {
          const artifact = JSON.parse(
            await FileSystem.readAsStringAsync(artifactUri),
          ) as unknown;
          validateFaceRatioPhase1ReplayArtifact(artifact);
          shouldDelete = isFaceRatioPhase1ReplayArtifactExpired(
            artifact,
            now.toISOString(),
          );
        } catch {
          shouldDelete = true;
        }

        if (shouldDelete) {
          await FileSystem.deleteAsync(sessionUri, {idempotent: true});
          deletedCount += 1;
        }
      }
    }
  }

  return deletedCount;
}

export async function saveFaceRatioPhase1ReplayArtifact({
  capturedAtUtc,
  hairline,
  imageHeight,
  imageWidth,
  landmarks,
  transformationMatrix,
  validation,
  zProxy,
}: {
  capturedAtUtc: string;
  hairline: VerticalThirdsKeypoint | null;
  imageHeight: number;
  imageWidth: number;
  landmarks: readonly FaceRatioLandmark3D[];
  transformationMatrix: FaceRatioTransformationMatrix;
  validation: FaceRatioPhase1ReplayValidation;
  zProxy?: number;
}) {
  if (!__DEV__) {
    throw new Error(
      'Phase 1 raw replay artifacts are allowed only in local development builds',
    );
  }

  validateFaceRatioPhase1ReplayValidation(validation);
  const directoryUri = getPhase1ReplaySessionDirectoryUri(validation);

  if (!directoryUri) {
    throw new Error('Phase 1 replay document directory is unavailable');
  }

  const now = new Date();
  await FileSystem.makeDirectoryAsync(getPhase1ReplayRootUri()!, {
    intermediates: true,
  });
  await pruneExpiredFaceRatioPhase1ReplayArtifacts(now);
  await FileSystem.makeDirectoryAsync(directoryUri, {intermediates: true});

  const fileUri = `${directoryUri}${PHASE1_REPLAY_FILE_NAME}`;
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  let artifact: FaceRatioPhase1ReplayArtifact;

  if (fileInfo.exists) {
    const parsed = JSON.parse(
      await FileSystem.readAsStringAsync(fileUri),
    ) as unknown;
    validateFaceRatioPhase1ReplayArtifact(parsed);
    artifact = parsed;

    if (
      artifact.cohortId !== validation.cohortId ||
      artifact.sessionId !== validation.sessionId ||
      artifact.privacy.retention.deleteAfterDays !== validation.retentionDays ||
      artifact.captures.some(
        capture => capture.subjectId !== validation.subjectId,
      )
    ) {
      throw new Error(
        'Phase 1 replay metadata does not match the existing local artifact',
      );
    }
  } else {
    artifact = createFaceRatioPhase1ReplayArtifact({
      createdAtUtc: now.toISOString(),
      validation,
    });
  }

  const capture = createFaceRatioPhase1ReplayCapture({
    capturedAtUtc,
    hairline,
    imageHeight,
    imageWidth,
    landmarks,
    transformationMatrix,
    validation,
    zProxy,
  });
  const next = appendFaceRatioPhase1ReplayCapture(artifact, capture);

  // source image URI나 제품 payload는 저장하지 않는다. 이 파일은 raw landmark
  // replay만을 위한 별도 로컬 artifact다.
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(next, null, 2));

  return fileUri;
}

/**
 * 결과 화면이 캡처를 더 이상 참조하지 않는 retake/advance/change-mode 시점에
 * Phase 1 네이티브 카메라의 tmp 사진만 best-effort로 삭제한다.
 */
export async function deleteFaceRatioPhase1LocalCapture(
  uri: string | null | undefined,
) {
  if (!uri || !isFaceRatioPhase1LocalCaptureUri(uri)) {
    return false;
  }

  try {
    await FileSystem.deleteAsync(uri, {idempotent: true});
    return true;
  } catch {
    return false;
  }
}

export function isFaceRatioPhase1ReplayShotComplete(
  result: FaceVerticalThirdsResult,
) {
  return Boolean(
    result.artifacts.poseNormalizationReplayUri &&
      result.status === 'full_success' &&
      result.measurementMode === 'full_vertical_thirds' &&
      result.quality.usable &&
      result.verticalThirds &&
      result.faceLength &&
      result.postCorrection?.applied &&
      result.postCorrection.method ===
        'mediapipe_facial_transformation_matrix',
  );
}

async function ensureSessionDirectory(sessionId: string) {
  const directoryUri = getFaceRatioSessionDirUri(sessionId);

  if (!directoryUri) {
    return null;
  }

  await FileSystem.makeDirectoryAsync(directoryUri, {intermediates: true});

  return directoryUri;
}

export function getFaceVerticalThirdsResultJsonUri(sessionId: string) {
  const directoryUri = getFaceRatioSessionDirUri(sessionId);

  return directoryUri ? `${directoryUri}${RESULT_FILE_NAME}` : null;
}

export async function saveSourceImage(sessionId: string, sourceUri: string) {
  const directoryUri = await ensureSessionDirectory(sessionId);

  if (!directoryUri) {
    return sourceUri;
  }

  const fileUri = `${directoryUri}${SOURCE_IMAGE_FILE_NAME}`;
  await FileSystem.copyAsync({from: sourceUri, to: fileUri});

  return fileUri;
}

export async function saveOverlayImage(sessionId: string, tmpUri: string) {
  const directoryUri = await ensureSessionDirectory(sessionId);

  if (!directoryUri) {
    return tmpUri;
  }

  const fileUri = `${directoryUri}${OVERLAY_IMAGE_FILE_NAME}`;
  await FileSystem.copyAsync({from: tmpUri, to: fileUri});

  return fileUri;
}

export async function saveHairlineDebugArtifacts(
  sessionId: string,
  uris?: {
    hairMatteUri?: string;
    hairlineDebugUri?: string;
    skinMatteUri?: string;
  },
) {
  const directoryUri = await ensureSessionDirectory(sessionId);

  if (!directoryUri || !uris) {
    return {};
  }

  const artifacts: FaceVerticalThirdsResult['artifacts'] = {};

  if (uris.hairMatteUri) {
    artifacts.appleHairMatteUri = `${directoryUri}apple-hair-matte.png`;
    await FileSystem.copyAsync({from: uris.hairMatteUri, to: artifacts.appleHairMatteUri});
  }

  if (uris.skinMatteUri) {
    artifacts.appleSkinMatteUri = `${directoryUri}apple-skin-matte.png`;
    await FileSystem.copyAsync({from: uris.skinMatteUri, to: artifacts.appleSkinMatteUri});
  }

  if (uris.hairlineDebugUri) {
    artifacts.hairlineDebugUri = `${directoryUri}hairline-debug.png`;
    await FileSystem.copyAsync({from: uris.hairlineDebugUri, to: artifacts.hairlineDebugUri});
  }

  return artifacts;
}

export async function writeResultJson(result: FaceVerticalThirdsResult) {
  const directoryUri = await ensureSessionDirectory(result.sessionId);

  if (!directoryUri) {
    return null;
  }

  const fileUri = `${directoryUri}${RESULT_FILE_NAME}`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(result, null, 2));

  return fileUri;
}
