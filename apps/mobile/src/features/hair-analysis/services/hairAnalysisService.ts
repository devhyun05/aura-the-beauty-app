import * as FileSystem from 'expo-file-system/legacy';

import {BackendApiError, requestBackendJson} from '../../../shared/services/backendApi';
import {uploadMediaAsset} from '../../../shared/services/mediaUploadService';
import {requestFaceLandmarks} from '../../ar/services/unityMakeupBridge';
import type {FaceCaptureUploadResult} from '../../face-capture/services/faceCaptureUploadService';
import {uploadFaceCaptureImage} from '../../face-capture/services/faceCaptureUploadService';
import {analyzeFacePhoto, type FaceRatioLandmarkInput} from '../../face-ratio/services/faceRatioAnalyzerNative';
import type {HairAnalysisJob, HairMatteArtifacts, HairSimulation, HairStyle} from '../types';

const ANALYSIS_POLL_TIMEOUT_MS = 5 * 60 * 1000;
const SIMULATION_POLL_TIMEOUT_MS = 8 * 60 * 1000;
const FAST_POLL_INTERVAL_MS = 2000;
const SLOW_POLL_INTERVAL_MS = 10000;
const FAST_POLL_WINDOW_MS = 20000;

function getPollInterval(startedAt: number) {
  const baseInterval = Date.now() - startedAt < FAST_POLL_WINDOW_MS
    ? FAST_POLL_INTERVAL_MS
    : SLOW_POLL_INTERVAL_MS;
  return baseInterval + Math.floor(Math.random() * 1000);
}

export function createHairClientRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('hair_poll_aborted'));
      return;
    }
    const handleAbort = () => {
      clearTimeout(timeout);
      reject(new Error('hair_poll_aborted'));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', handleAbort, {once: true});
  });
}

function isRetriablePollError(error: unknown) {
  return error instanceof BackendApiError && (error.status === 429 || error.status >= 500);
}

export async function extractAppleHairMatte(
  capture: FaceCaptureUploadResult,
): Promise<HairMatteArtifacts> {
  if (!capture.semanticMattes?.hair) {
    return {};
  }

  const detected = await requestFaceLandmarks(capture.imageUri, {timeoutMs: 5000});
  if (detected.status !== 'ok' || detected.landmarks.length === 0) {
    return {};
  }

  const landmarks: FaceRatioLandmarkInput = {
    imageHeight: detected.imageHeight,
    imageWidth: detected.imageWidth,
    points: detected.landmarks,
    pose: detected.pose,
  };
  const result = await analyzeFacePhoto(capture.imageUri, {
    hairline: {
      enabled: true,
      matteArtifacts: true,
    },
    landmarks,
  });

  return {
    hairMatteUri: result.matteArtifacts?.hairMatteUri,
    skinMatteUri: result.matteArtifacts?.skinMatteUri,
    hairlineConfidence: result.hairline?.confidence,
    hairlinePosition: result.hairline
      ? {x: result.hairline.x, y: result.hairline.y}
      : undefined,
  };
}

function classifyHairline(position?: {y: number}) {
  if (!position) {
    return undefined;
  }
  if (position.y < 0.18) {
    return 'high';
  }
  if (position.y > 0.27) {
    return 'low';
  }
  return 'balanced';
}

async function deleteMatteArtifacts(matte: HairMatteArtifacts) {
  const artifactUri = matte.hairMatteUri ?? matte.skinMatteUri;
  if (!artifactUri) {
    return;
  }
  const directoryUri = artifactUri.replace(/\/[^/]+$/, '');
  try {
    await FileSystem.deleteAsync(directoryUri, {idempotent: true});
  } catch {
    // Native temporary files are best-effort cleanup; iOS also purges tmp storage.
  }
}

export async function createHairAnalysisFromCapture(
  capture: FaceCaptureUploadResult,
  clientRequestId = createHairClientRequestId(),
): Promise<{analysis: HairAnalysisJob; uploadedCapture: FaceCaptureUploadResult}> {
  let matte: HairMatteArtifacts = {};
  try {
    matte = await extractAppleHairMatte(capture);
  } catch {
    // The server MediaPipe fallback owns unsupported devices and native extraction failures.
  }

  const uploadedCapture = await uploadFaceCaptureImage({
    captureType: 'hair_analysis',
    contentType: capture.contentType,
    height: capture.height,
    mediaKind: 'hair-analysis-source',
    semanticMattes: capture.semanticMattes,
    source: 'camera',
    uri: capture.imageUri,
    width: capture.width,
  });
  let mask: Awaited<ReturnType<typeof uploadMediaAsset>> | null = null;
  try {
    if (matte.hairMatteUri) {
      try {
        mask = await uploadMediaAsset({
          contentType: 'image/png',
          fileName: 'apple-hair-matte.png',
          mediaKind: 'hair-analysis-mask',
          source: 'generated',
          uri: matte.hairMatteUri,
        });
      } catch {
        // Source upload is still valid; the server will run MediaPipe fallback.
        mask = null;
      }
    }
  } finally {
    await deleteMatteArtifacts(matte);
  }
  const response = await requestBackendJson<{analysis: HairAnalysisJob}>('/hair-analyses', {
    body: {
      clientRequestId,
      devicePayload: {
        hairline: classifyHairline(matte.hairlinePosition),
        hairlineConfidence: matte.hairlineConfidence,
        semanticMattes: capture.semanticMattes,
      },
      maskMediaId: mask?.id ?? null,
      photoCaptureId: uploadedCapture.photoCaptureId,
      sourceMediaId: uploadedCapture.mediaId,
    },
    method: 'POST',
  });
  return {analysis: response.analysis, uploadedCapture};
}

export async function getHairAnalysis(
  analysisId: string,
  signal?: AbortSignal,
): Promise<HairAnalysisJob> {
  const response = await requestBackendJson<{analysis: HairAnalysisJob}>(
    `/hair-analyses/${analysisId}`,
    {signal},
  );
  return response.analysis;
}

export async function waitForHairAnalysis(
  analysisId: string,
  signal?: AbortSignal,
): Promise<HairAnalysisJob> {
  const startedAt = Date.now();
  while (true) {
    let analysis: HairAnalysisJob;
    try {
      analysis = await getHairAnalysis(analysisId, signal);
    } catch (error) {
      if (!isRetriablePollError(error) || Date.now() - startedAt >= ANALYSIS_POLL_TIMEOUT_MS) {
        throw error;
      }
      await wait(getPollInterval(startedAt), signal);
      continue;
    }
    if (analysis.status === 'completed') {
      return analysis;
    }
    if (analysis.status === 'expired') {
      throw new Error('사진 보관 시간이 지나 분석이 만료됐어요. 새 사진으로 다시 촬영해 주세요.');
    }
    if (analysis.status === 'failed') {
      throw new Error(analysis.error?.message || '헤어 분석을 완료하지 못했어요.');
    }
    if (Date.now() - startedAt >= ANALYSIS_POLL_TIMEOUT_MS) {
      break;
    }
    await wait(getPollInterval(startedAt), signal);
  }
  throw new Error('헤어 분석 시간이 길어지고 있어요. 잠시 후 다시 확인해 주세요.');
}

export async function createHairSimulation(
  analysisId: string,
  styleId: string,
  clientRequestId = createHairClientRequestId(),
): Promise<HairSimulation> {
  const response = await requestBackendJson<{simulation: HairSimulation}>(
    `/hair-analyses/${analysisId}/simulations`,
    {
      body: {clientRequestId, styleId},
      method: 'POST',
    },
  );
  return response.simulation;
}

export async function getHairSimulation(
  simulationId: string,
  signal?: AbortSignal,
): Promise<HairSimulation> {
  const response = await requestBackendJson<{simulation: HairSimulation}>(
    `/hair-simulations/${simulationId}`,
    {signal},
  );
  return response.simulation;
}

export async function waitForHairSimulation(
  simulationId: string,
  signal?: AbortSignal,
): Promise<HairSimulation> {
  const startedAt = Date.now();
  while (true) {
    let simulation: HairSimulation;
    try {
      simulation = await getHairSimulation(simulationId, signal);
    } catch (error) {
      if (!isRetriablePollError(error) || Date.now() - startedAt >= SIMULATION_POLL_TIMEOUT_MS) {
        throw error;
      }
      await wait(getPollInterval(startedAt), signal);
      continue;
    }
    if (simulation.status === 'completed' && simulation.resultUrl) {
      return simulation;
    }
    if (simulation.status === 'expired') {
      throw new Error('합성 결과 보관 시간이 지났어요. 추천 스타일을 다시 선택해 주세요.');
    }
    if (simulation.status === 'failed') {
      throw new Error(simulation.error?.message || '헤어 합성을 완료하지 못했어요.');
    }
    if (Date.now() - startedAt >= SIMULATION_POLL_TIMEOUT_MS) {
      break;
    }
    await wait(getPollInterval(startedAt), signal);
  }
  throw new Error('헤어 합성 시간이 길어지고 있어요. 잠시 후 다시 확인해 주세요.');
}

export async function setHairSimulationSaved(simulationId: string, saved: boolean) {
  const response = await requestBackendJson<{simulation: HairSimulation}>(
    `/hair-simulations/${simulationId}/save`,
    {body: {saved}, method: 'POST'},
  );
  return response.simulation;
}

export async function listSavedHairSimulations() {
  const response = await requestBackendJson<{simulations: HairSimulation[]}>(
    '/hair-simulations?saved=true',
  );
  return response.simulations;
}

export async function deleteHairSimulation(simulationId: string) {
  await requestBackendJson<{deleted: boolean}>(`/hair-simulations/${simulationId}`, {
    method: 'DELETE',
  });
}

export async function getHairStyles() {
  const response = await requestBackendJson<{catalogVersion: string; styles: HairStyle[]}>(
    '/hair-styles',
  );
  return response.styles;
}

export async function downloadHairResult(resultUrl: string, simulationId: string) {
  const directory = FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error('기기 저장 공간을 사용할 수 없어요.');
  }
  const result = await FileSystem.downloadAsync(
    resultUrl,
    `${directory}hair-simulation-${simulationId}.jpg`,
  );
  if (result.status < 200 || result.status >= 300) {
    throw new Error('합성 결과를 내려받지 못했어요.');
  }
  return result.uri;
}

export async function deleteDownloadedHairResult(uri: string) {
  await FileSystem.deleteAsync(uri, {idempotent: true}).catch(() => undefined);
}
