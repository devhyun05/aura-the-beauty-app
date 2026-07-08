/**
 * Client for the local dev API (tools/beard-simulation-lab/server.py).
 * Dev-only integration surface — the production processing location
 * (on-device vs backend) is a deferred decision; this module is the seam
 * where that swap will happen.
 */

import type {
  BeardSimulationPhoto,
  BeardSimulationResult,
  BeardSimulationStage,
  BeardSurvey,
} from '../types';

const DEFAULT_DEV_API_URL = 'http://127.0.0.1:8765';
const REQUEST_TIMEOUT_MS = 120000;

export class BeardSimulationRejectedError extends Error {
  reason: string;
  requestId?: string;

  constructor(reason: string, requestId?: string) {
    super(`beard simulation rejected: ${reason}`);
    this.name = 'BeardSimulationRejectedError';
    this.reason = reason;
    this.requestId = requestId;
  }
}

export function isBeardSimulationRejectedError(
  error: unknown,
): error is BeardSimulationRejectedError {
  return error instanceof BeardSimulationRejectedError;
}

export function getBeardSimApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_BEARD_SIM_API_URL?.trim();
  return (raw || DEFAULT_DEV_API_URL).replace(/\/+$/, '');
}

function toAbsoluteRef(baseUrl: string, ref: string): string {
  return ref.startsWith('http') ? ref : `${baseUrl}${ref}`;
}

export async function checkBeardSimApiHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${getBeardSimApiBaseUrl()}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export async function simulateBeardRemoval(
  photo: BeardSimulationPhoto,
  survey: BeardSurvey,
  stages: BeardSimulationStage[] = ['mild', 'medium', 'strong'],
): Promise<BeardSimulationResult & {inputImageRef?: string}> {
  const baseUrl = getBeardSimApiBaseUrl();
  const formData = new FormData();
  formData.append('photo', {
    uri: photo.uri,
    name: photo.fileName ?? 'photo.jpg',
    type: photo.mimeType ?? 'image/jpeg',
  } as unknown as Blob);
  formData.append('survey', JSON.stringify(survey));
  formData.append('stages', stages.join(','));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/simulate`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 422) {
    const payload = (await response.json()) as {
      detail?: {reason?: string; requestId?: string};
    };
    throw new BeardSimulationRejectedError(
      payload.detail?.reason ?? 'unknown',
      payload.detail?.requestId,
    );
  }
  if (!response.ok) {
    throw new Error(`beard simulation API error: HTTP ${response.status}`);
  }

  const result = (await response.json()) as BeardSimulationResult & {
    inputImageRef?: string;
  };
  return {
    ...result,
    inputImageRef: result.inputImageRef
      ? toAbsoluteRef(baseUrl, result.inputImageRef)
      : undefined,
    stages: result.stages.map(stageResult => ({
      ...stageResult,
      imageRef: toAbsoluteRef(baseUrl, stageResult.imageRef),
    })),
    maskPackage: {
      ...result.maskPackage,
      masks: Object.fromEntries(
        Object.entries(result.maskPackage.masks).map(([key, ref]) => [
          key,
          toAbsoluteRef(baseUrl, ref),
        ]),
      ) as BeardSimulationResult['maskPackage']['masks'],
    },
  };
}

/** Immediate-delete (data policy): removes the photo and every derivative. */
export async function deleteBeardSimulationRun(requestId: string): Promise<void> {
  const response = await fetch(
    `${getBeardSimApiBaseUrl()}/runs/${encodeURIComponent(requestId)}`,
    {method: 'DELETE'},
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`failed to delete run ${requestId}: HTTP ${response.status}`);
  }
}
