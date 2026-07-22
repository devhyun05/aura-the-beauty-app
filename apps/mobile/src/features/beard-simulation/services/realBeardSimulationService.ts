import * as MediaLibrary from 'expo-media-library/legacy';
import {
  BackendApiError,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import type {
  BeardAnalysis,
  BeardSimulationResult,
  BeardSimulationService,
  SimulateInput,
} from '../contracts/types';

/**
 * Real implementation of `BeardSimulationService` — wires the flow to the deployed backend
 * (subsystems B/C). It performs the full round-trip and NEVER fabricates content:
 *   1. POST /beard/upload-url   → presigned PUT target
 *   2. PUT the local JPEG bytes → S3 (mirrors faceCaptureUploadService)
 *   3. POST /beard/jobs         → creates + kicks the beard-removal job
 *   4. GET  /beard/jobs/{id}    → polled until a terminal status
 *   5. POST /beard/report       → (analysis path only) 상세 보고서; on failure the analysis is
 *                                 left undefined so the report screen shows a real error state.
 *
 * NOTE (verified against services/backend): the /beard/jobs endpoints return the job object
 * FLAT under the envelope `data` (via `success(_map_beard_job(...))`), i.e. requestBackendJson
 * resolves directly to `{id, status, resultUrl, ...}` — NOT `{job: {...}}`.
 */

// --- Backend response shapes (keys already camelCased by the API envelope) ---

interface BeardUploadUrlResponse {
  uploadUrl: string;
  inputKey: string;
  method: string;
  contentType: string;
  expiresIn: number;
}

type BeardJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface BeardJob {
  id: string;
  status: BeardJobStatus;
  path: 'photo' | 'analysis';
  instanceState?: string | null;
  resultUrl?: string | null;
  errorMessage?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface BeardReportResponse {
  analysis: BeardAnalysis;
  analysisStatus: string;
}

const UPLOAD_CONTENT_TYPE = 'image/jpeg';
const POLL_INTERVAL_MS = 3000;
// ~4 minutes of polling at a 3s cadence before we give up client-side.
const MAX_POLL_ATTEMPTS = 80;
const CLIENT_TIMEOUT_REASON = '결과 생성이 지연되고 있어요';

const TERMINAL_STATUSES: ReadonlySet<BeardJobStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Reads a local `file://` (or remote) image into a Blob for the S3 PUT.
 * Mirrors faceCaptureUploadService.readImageBlobWithXhr — status 0 is a successful local read.
 */
function readImageBlobWithXhr(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('GET', uri);
    request.responseType = 'blob';
    request.onload = () => {
      const isLocalFileRead = request.status === 0;
      const isHttpSuccess = request.status >= 200 && request.status < 300;

      if (!isLocalFileRead && !isHttpSuccess) {
        reject(new Error(`Failed to read image file with HTTP ${request.status}.`));
        return;
      }

      if (!(request.response instanceof Blob)) {
        reject(new Error('Failed to read image file as a blob.'));
        return;
      }

      resolve(request.response);
    };
    request.onerror = () => reject(new Error('Failed to read image file from the device.'));
    request.send();
  });
}

async function pollBeardJob(initialJob: BeardJob): Promise<BeardJob> {
  let current = initialJob;
  let attempts = 0;

  while (!TERMINAL_STATUSES.has(current.status)) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      return {
        ...current,
        status: 'failed',
        errorMessage: current.errorMessage ?? CLIENT_TIMEOUT_REASON,
      };
    }

    await wait(POLL_INTERVAL_MS);
    attempts += 1;

    current = await requestBackendJson<BeardJob>(`/beard/jobs/${current.id}`, {
      method: 'GET',
    });
  }

  return current;
}

/**
 * Fire-and-forget prewarm to hide the beard Lambda cold start. Call on flow entry.
 * Any failure (Lambda not configured, auth, network) is swallowed — it must never block entry.
 */
export function prewarmBeardSimulation(): void {
  void requestBackendJson('/beard/prewarm', {body: {}, method: 'POST'}).catch((error) => {
    console.info('[aura:beard] prewarm skipped', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

export const realBeardSimulationService: BeardSimulationService = {
  async simulate(input: SimulateInput): Promise<BeardSimulationResult> {
    const startedAt = Date.now();
    const survey = input.survey ?? {};

    // (a) Presigned upload target.
    const upload = await requestBackendJson<BeardUploadUrlResponse>('/beard/upload-url', {
      body: {},
      method: 'POST',
    });

    // (b) Read the local JPEG and PUT the raw bytes to S3.
    const imageBlob = await readImageBlobWithXhr(input.imageUri);
    const uploadResponse = await fetch(upload.uploadUrl, {
      body: imageBlob,
      headers: {'Content-Type': UPLOAD_CONTENT_TYPE},
      method: 'PUT',
    });

    if (!uploadResponse.ok) {
      throw new Error(`Beard photo upload failed with HTTP ${uploadResponse.status}.`);
    }

    // (c) Create the job (server-side kicks it immediately).
    const createdJob = await requestBackendJson<BeardJob>('/beard/jobs', {
      body: {inputKey: upload.inputKey, path: input.path, survey},
      method: 'POST',
    });

    // (d) Poll until a terminal status.
    const job = await pollBeardJob(createdJob);

    if (job.status !== 'completed' || !job.resultUrl) {
      console.info('[aura:beard] simulate:not-ready', {
        durationMs: Date.now() - startedAt,
        status: job.status,
      });

      return {
        status: 'failed',
        inputImageUri: input.imageUri,
        resultImageUri: null,
        guard: {passed: false, blockedReason: job.errorMessage ?? undefined},
      };
    }

    // (e) Analysis path → generate the 상세 보고서. NO SILENT FALLBACK: if the report request
    // fails (502 / parse error / forbidden term / network), leave analysis undefined so the
    // report screen renders an explicit "분석을 불러오지 못했어요" state instead of fake content.
    let analysis: BeardAnalysis | undefined;

    if (input.path === 'analysis') {
      try {
        const report = await requestBackendJson<BeardReportResponse>('/beard/report', {
          body: {imageKey: upload.inputKey, guardPassed: true, survey},
          method: 'POST',
        });
        analysis = report.analysis;
      } catch (error) {
        analysis = undefined;
        console.info('[aura:beard] report:failed', {
          message: error instanceof Error ? error.message : String(error),
          status: error instanceof BackendApiError ? error.status : undefined,
        });
      }
    }

    console.info('[aura:beard] simulate:ready', {
      durationMs: Date.now() - startedAt,
      hasAnalysis: Boolean(analysis),
      path: input.path,
    });

    return {
      status: 'ready',
      inputImageUri: input.imageUri,
      resultImageUri: job.resultUrl,
      analysis,
      guard: {passed: true},
    };
  },

  async saveResultToLibrary(uri: string): Promise<void> {
    const permission = await MediaLibrary.requestPermissionsAsync();

    if (!permission.granted) {
      throw new Error('media-library-permission-denied');
    }

    await MediaLibrary.saveToLibraryAsync(uri);
  },
};
