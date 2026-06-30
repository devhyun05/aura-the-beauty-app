import { faceAnalysisReportsMock } from '../mocks/faceAnalysis.mock';
import type {
  FaceAnalysisMakeupCard,
  FaceAnalysisMakeupGuideline,
  FaceAnalysisReport,
} from '../types/faceAnalysis';
import {BackendApiError, getBackendApiBaseUrl, requestBackendJson} from './backendApi';

type FaceAnalysisCaptureInput = {
  bucket?: string | null;
  cdnUrl?: string | null;
  contentType?: string | null;
  imageUri?: string | null;
  mediaId?: string | null;
  objectKey?: string | null;
  photoCaptureId?: string | null;
  source?: string | null;
};

type BackendMakeupCard = {
  cdnUrl?: string | null;
  description?: string | null;
  imageBucket?: string | null;
  imageObjectKey?: string | null;
  imageStatus?: 'failed' | 'pending' | 'ready' | null;
  imageUrl?: string | null;
  image_url?: string | null;
  objectKey?: string | null;
  previewUrl?: string | null;
  subtitle?: string | null;
  tags?: string[] | null;
  title?: string | null;
};

type BackendMakeupGuideline = Partial<Record<keyof FaceAnalysisMakeupGuideline, string | null>>;

type BackendAnalysisResult = {
  avoidedMakeups?: BackendMakeupCard[] | null;
  baseMakeupGuide?: string | null;
  faceShape?: string | null;
  makeupGuideline?: BackendMakeupGuideline | null;
  personalColor?: string | null;
  imageGenerationStatus?: string | null;
  recommendedMakeups?: BackendMakeupCard[] | null;
  recommendedMood?: string | null;
  shortSummary?: string | null;
  skinAnalysisSummary?: string | null;
  skinType?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  timing?: {
    imageGenerationBatchMs?: number | null;
    imageGenerationItems?: {durationMs?: number | null; index?: number | null}[] | null;
    imageGenerationStatus?: string | null;
    imageGenerationTotalMs?: number | null;
    sourceImageReadMs?: number | null;
    textAnalysisMs?: number | null;
    totalMs?: number | null;
  } | null;
  toneSummary?: string | null;
};

type BackendAnalysisRequest = {
  bucket?: string | null;
  cdnUrl?: string | null;
  imageObjectKey?: string | null;
  imageUrl?: string | null;
  objectKey?: string | null;
  previewUrl?: string | null;
  sourceObjectKey?: string | null;
  sourceUri?: string | null;
};

type BackendMediaReference = {
  cdnUrl?: string | null;
  imageUrl?: string | null;
  objectKey?: string | null;
  previewUrl?: string | null;
  url?: string | null;
};

type BackendAnalysisJob = {
  analyzedAt?: string | null;
  baseMakeupGuide?: string | null;
  detailPayload?: {
    request?: BackendAnalysisRequest | null;
    result?: BackendAnalysisResult | null;
  } | null;
  environmentLabel?: string | null;
  errorMessage?: string | null;
  faceShape?: string | null;
  id?: string | null;
  personalColor?: string | null;
  recommendedMood?: string | null;
  reportTitle?: string | null;
  shortSummary?: string | null;
  skinAnalysisSummary?: string | null;
  skinType?: string | null;
  previewMedia?: BackendMediaReference | null;
  sourceMedia?: BackendMediaReference | null;
  status?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  title?: string | null;
  toneSummary?: string | null;
};

type CreateAnalysisJobResponse = {
  job: BackendAnalysisJob;
};

type GetAnalysisReportResponse = {
  report: BackendAnalysisJob;
};

type DeleteAnalysisReportResponse = {
  deleted: boolean;
  reportId: string;
};

type ListAnalysisReportsResponse = {
  reports: BackendAnalysisJob[];
};

type GetFaceAnalysisReportsOptions = {
  limit?: number;
  withRecommendedMakeups?: boolean;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANALYSIS_REPORT_POLL_INTERVAL_MS = 5000;
const ANALYSIS_REPORT_POLL_TIMEOUT_MS = 240000;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && uuidPattern.test(value));
}

function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find(value => Boolean(value?.trim()))?.trim();
}

function getBackendCdnBaseUrl(): string | null {
  const apiBaseUrl = getBackendApiBaseUrl();

  if (!apiBaseUrl) {
    return null;
  }

  return apiBaseUrl.replace(/\/api(?:\/.*)?$/, '').replace(/\/+$/, '');
}

function buildCdnUrlFromObjectKey(objectKey: string | null | undefined): string | undefined {
  const normalizedObjectKey = objectKey?.trim().replace(/^\/+/, '');
  const cdnBaseUrl = getBackendCdnBaseUrl();

  if (!normalizedObjectKey || !cdnBaseUrl) {
    return undefined;
  }

  return `${cdnBaseUrl}/${normalizedObjectKey}`;
}

function parseS3ObjectKey(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();

  if (!normalized?.startsWith('s3://')) {
    return undefined;
  }

  const [, objectKey] = normalized.replace('s3://', '').split(/\/(.+)/);

  return objectKey;
}

function isImageUri(value: string | undefined): value is string {
  return Boolean(
    value?.startsWith('http://') ||
      value?.startsWith('https://') ||
      value?.startsWith('file:') ||
      value?.startsWith('content:') ||
      value?.startsWith('data:image/'),
  );
}

function resolveImageUrlFromObjectKey(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    const objectKey = firstText(parseS3ObjectKey(value), value);
    const imageUrl = buildCdnUrlFromObjectKey(objectKey);

    if (imageUrl) {
      return imageUrl;
    }
  }

  return undefined;
}

function resolveMakeupImageUrl(card: BackendMakeupCard | null | undefined): string | undefined {
  const directUrl = firstText(
    card?.imageUrl,
    card?.image_url,
    card?.cdnUrl,
    card?.previewUrl,
  );

  if (directUrl?.startsWith('http://') || directUrl?.startsWith('https://')) {
    return directUrl;
  }

  const objectKey = firstText(
    card?.imageObjectKey,
    card?.objectKey,
    parseS3ObjectKey(directUrl),
  );

  return buildCdnUrlFromObjectKey(objectKey);
}

function resolveBackendMediaImageUrl(
  media: BackendMediaReference | null | undefined,
): string | undefined {
  const directUrl = firstText(
    media?.cdnUrl,
    media?.imageUrl,
    media?.previewUrl,
    media?.url,
  );

  if (isImageUri(directUrl)) {
    return directUrl;
  }

  return resolveImageUrlFromObjectKey(media?.objectKey, parseS3ObjectKey(directUrl));
}

export function resolveFaceAnalysisReportImageSource(
  job: BackendAnalysisJob,
  capture?: FaceAnalysisCaptureInput | null,
): FaceAnalysisReport['imageSource'] | undefined {
  const request = job.detailPayload?.request;
  const directUrl = firstText(
    capture?.imageUri,
    capture?.cdnUrl,
    request?.cdnUrl,
    request?.imageUrl,
    request?.previewUrl,
    resolveBackendMediaImageUrl(job.previewMedia),
    resolveBackendMediaImageUrl(job.sourceMedia),
    request?.sourceUri,
  );

  if (isImageUri(directUrl)) {
    return {uri: directUrl};
  }

  const objectKeyUrl = resolveImageUrlFromObjectKey(
    capture?.objectKey,
    request?.objectKey,
    request?.imageObjectKey,
    request?.sourceObjectKey,
    parseS3ObjectKey(directUrl),
  );

  return objectKeyUrl ? {uri: objectKeyUrl} : undefined;
}

function firstStringArray(
  value: string[] | null | undefined,
  fallback: string[],
): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value.filter(item => item.trim());

  return normalized.length > 0 ? normalized.slice(0, 4) : fallback;
}

function mergeMakeupGuideline(
  aiGuideline: BackendMakeupGuideline | null | undefined,
  fallback: FaceAnalysisMakeupGuideline,
): FaceAnalysisMakeupGuideline {
  return {
    brow: firstText(aiGuideline?.brow, fallback.brow) ?? '',
    blush: firstText(aiGuideline?.blush, fallback.blush) ?? '',
    highlight: firstText(aiGuideline?.highlight, fallback.highlight) ?? '',
    eyeshadow:
      firstText(aiGuideline?.eyeshadow, fallback.eyeshadow) ?? '',
    eyeliner:
      firstText(aiGuideline?.eyeliner, fallback.eyeliner) ?? '',
    lip: firstText(aiGuideline?.lip, fallback.lip) ?? '',
  };
}

function resolveMakeupImageStatus(
  card: BackendMakeupCard | null | undefined,
  generatedImageUrl: string | undefined,
): FaceAnalysisMakeupCard['imageStatus'] {
  if (generatedImageUrl) {
    return 'ready';
  }

  return card?.imageStatus === 'failed' ? 'failed' : 'pending';
}

function mergeMakeupCards(
  reportId: string,
  aiCards: BackendMakeupCard[] | null | undefined,
  fallbackCards: FaceAnalysisMakeupCard[],
  useFallback: boolean,
): FaceAnalysisMakeupCard[] {
  const normalizedAiCards = Array.isArray(aiCards)
    ? aiCards.filter((card): card is BackendMakeupCard => Boolean(card))
    : [];

  if (!useFallback) {
    return [0, 1, 2].map((index) => {
      const aiCard = normalizedAiCards[index];
      const fallbackCard = fallbackCards[index] ?? fallbackCards[0];
      const generatedImageUrl = resolveMakeupImageUrl(aiCard);

      return {
        ...fallbackCard,
        id: `${reportId}-ai-makeup-${index + 1}`,
        title: firstText(aiCard?.title, fallbackCard.title) ?? fallbackCard.title,
        subtitle: firstText(aiCard?.subtitle, fallbackCard.subtitle) ?? fallbackCard.subtitle,
        description:
          firstText(aiCard?.description, fallbackCard.description) ?? fallbackCard.description,
        imageSource: generatedImageUrl
          ? {uri: generatedImageUrl}
          : fallbackCard.imageSource,
        imageStatus: resolveMakeupImageStatus(aiCard, generatedImageUrl),
        tags: firstStringArray(aiCard?.tags, fallbackCard.tags),
      };
    });
  }

  const cards = fallbackCards.slice(0, 3);

  return cards.map((fallbackCard, index) => {
    const aiCard = normalizedAiCards[index];
    const generatedImageUrl = resolveMakeupImageUrl(aiCard);

    return {
      ...fallbackCard,
      id: `${reportId}-${fallbackCard.id}`,
      title: firstText(aiCard?.title, fallbackCard.title) ?? fallbackCard.title,
      subtitle: firstText(aiCard?.subtitle, fallbackCard.subtitle) ?? fallbackCard.subtitle,
      description:
        firstText(aiCard?.description, fallbackCard.description) ?? fallbackCard.description,
      imageSource: generatedImageUrl
        ? {uri: generatedImageUrl}
        : fallbackCard.imageSource,
      imageStatus: generatedImageUrl ? 'ready' : fallbackCard.imageStatus,
      tags: firstStringArray(aiCard?.tags, fallbackCard.tags),
    };
  });
}
function getRecommendedMakeupCount(job: BackendAnalysisJob): number {
  const recommendedMakeups = job.detailPayload?.result?.recommendedMakeups;

  return Array.isArray(recommendedMakeups) ? recommendedMakeups.length : 0;
}

function getGeneratedMakeupImageCount(job: BackendAnalysisJob): number {
  const recommendedMakeups = job.detailPayload?.result?.recommendedMakeups;

  if (!Array.isArray(recommendedMakeups)) {
    return 0;
  }

  return recommendedMakeups.filter(card => Boolean(resolveMakeupImageUrl(card))).length;
}

function getImageGenerationStatus(job: BackendAnalysisJob): string | undefined {
  return firstText(
    job.detailPayload?.result?.imageGenerationStatus,
    job.detailPayload?.result?.timing?.imageGenerationStatus,
  );
}

function hasCompleteBackendReportText(job: BackendAnalysisJob): boolean {
  const result = job.detailPayload?.result;

  return Boolean(
    result &&
      getRecommendedMakeupCount(job) === 3 &&
      firstText(
        result.shortSummary,
        result.summary,
        job.shortSummary,
        job.summary,
      ),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function waitForCompleteAnalysisReport(
  initialJob: BackendAnalysisJob,
  capture: FaceAnalysisCaptureInput | null | undefined,
  startedAt: number,
): Promise<FaceAnalysisReport> {
  let currentJob = initialJob;

  while (true) {
    const report = mapBackendJobToFaceAnalysisReport(currentJob, capture);
    const generatedImageCount = getGeneratedMakeupImageCount(currentJob);
    const imageGenerationStatus = getImageGenerationStatus(currentJob);
    const recommendedCount = getRecommendedMakeupCount(currentJob);

    if (hasCompleteBackendReportText(currentJob)) {
      console.info('[aura:analysis] analysis-report:ready', {
        durationMs: Date.now() - startedAt,
        generatedImageCount,
        imageGenerationStatus,
        jobId: currentJob.id ?? null,
        recommendedCount,
        status: currentJob.status ?? null,
      });

      return report;
    }

    if (currentJob.status === 'failed') {
      throw new BackendApiError(
        currentJob.errorMessage ?? '\u0041\u0049 \ubd84\uc11d \uc791\uc5c5\uc774 \uc2e4\ud328\ud588\uc5b4\uc694. \ub2e4\uc2dc \ucd2c\uc601\ud574 \uc8fc\uc138\uc694.',
        502,
        'ANALYSIS_JOB_FAILED',
        {jobId: currentJob.id ?? null},
      );
    }

    if (currentJob.status === 'completed') {
      throw new BackendApiError(
        '분석 보고서 내용을 아직 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
        502,
        'ANALYSIS_REPORT_TEXT_REQUIRED',
        {
          generatedImageCount,
          imageGenerationStatus,
          jobId: currentJob.id ?? null,
          recommendedCount,
        },
      );
    }

    if (!currentJob.id) {
      throw new Error('Analysis job did not return a report id.');
    }

    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs >= ANALYSIS_REPORT_POLL_TIMEOUT_MS) {
      throw new BackendApiError(
        '\ucd94\ucc9c \uba54\uc774\ud06c\uc5c5 \uc774\ubbf8\uc9c0 \uc0dd\uc131\uc774 \uc544\uc9c1 \uc644\ub8cc\ub418\uc9c0 \uc54a\uc558\uc5b4\uc694. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574 \uc8fc\uc138\uc694.',
        504,
        'ANALYSIS_REPORT_TIMEOUT',
        {
          generatedImageCount,
          imageGenerationStatus,
          jobId: currentJob.id,
          recommendedCount,
          status: currentJob.status ?? null,
        },
      );
    }

    console.info('[aura:analysis] analysis-report:wait-images', {
      elapsedMs,
      generatedImageCount,
      imageGenerationStatus,
      jobId: currentJob.id,
      nextPollMs: ANALYSIS_REPORT_POLL_INTERVAL_MS,
      recommendedCount,
      status: currentJob.status ?? null,
    });

    await delay(Math.min(ANALYSIS_REPORT_POLL_INTERVAL_MS, ANALYSIS_REPORT_POLL_TIMEOUT_MS - elapsedMs));

    const {report: nextJob} = await requestBackendJson<GetAnalysisReportResponse>(
      '/analysis/reports/' + currentJob.id,
    );

    currentJob = nextJob;
  }
}

function buildFallbackReportFromCapture(
  capture?: FaceAnalysisCaptureInput | null,
): FaceAnalysisReport {
  const fallback = faceAnalysisReportsMock[0];
  const capturedImageSource = capture?.imageUri ? {uri: capture.imageUri} : fallback.imageSource;

  return {
    ...fallback,
    id: `capture-analysis-${Date.now()}`,
    analyzedAt: new Date().toISOString(),
    environmentLabel: '촬영 이미지',
    imageSource: capturedImageSource,
    reportTitle: '맞춤 분석 보고서',
  };
}

function mapBackendJobToFaceAnalysisReport(
  job: BackendAnalysisJob,
  capture?: FaceAnalysisCaptureInput | null,
): FaceAnalysisReport {
  const fallback = buildFallbackReportFromCapture(capture);
  const result = job.detailPayload?.result ?? {};
  const reportId = firstText(job.id, fallback.id) ?? fallback.id;
  const reportImageSource = resolveFaceAnalysisReportImageSource(job, capture);
  const personalColor =
    firstText(result.personalColor, job.personalColor, fallback.personalColor) ??
    fallback.personalColor;
  const skinType =
    firstText(result.skinType, job.skinType, fallback.skinType) ?? fallback.skinType;
  const recommendedMood =
    firstText(result.recommendedMood, job.recommendedMood, fallback.recommendedMood) ??
    fallback.recommendedMood;

  return {
    ...fallback,
    id: reportId,
    analyzedAt:
      firstText(job.analyzedAt, fallback.analyzedAt) ?? fallback.analyzedAt,
    baseMakeupGuide:
      firstText(result.baseMakeupGuide, job.baseMakeupGuide, fallback.baseMakeupGuide) ??
      fallback.baseMakeupGuide,
    faceShape:
      firstText(result.faceShape, job.faceShape, fallback.faceShape) ?? fallback.faceShape,
    imageSource: reportImageSource ?? fallback.imageSource,
    makeupGuideline: mergeMakeupGuideline(
      result.makeupGuideline,
      fallback.makeupGuideline,
    ),
    personalColor,
    recommendedMakeups: mergeMakeupCards(
      reportId,
      result.recommendedMakeups,
      fallback.recommendedMakeups,
      false,
    ),
    recommendedMood,
    avoidedMakeups: [],
    reportTitle:
      firstText(job.reportTitle, fallback.reportTitle) ?? fallback.reportTitle,
    shortSummary:
      firstText(result.shortSummary, job.shortSummary, fallback.shortSummary) ??
      fallback.shortSummary,
    skinAnalysisSummary:
      firstText(
        result.skinAnalysisSummary,
        job.skinAnalysisSummary,
        fallback.skinAnalysisSummary,
      ) ?? fallback.skinAnalysisSummary,
    skinType,
    summary:
      firstText(result.summary, job.summary, fallback.summary) ?? fallback.summary,
    tags: firstStringArray(result.tags ?? job.tags, fallback.tags),
    title:
      firstText(job.title, `${personalColor}, ${skinType}`, fallback.title) ??
      fallback.title,
    toneSummary:
      firstText(result.toneSummary, job.toneSummary, fallback.toneSummary) ??
      fallback.toneSummary,
  };
}

function buildAnalysisReportsPath({
  limit,
  withRecommendedMakeups,
}: GetFaceAnalysisReportsOptions = {}): string {
  const params = new URLSearchParams();

  if (withRecommendedMakeups) {
    params.set('withRecommendedMakeups', 'true');
  }

  if (limit) {
    params.set('limit', String(limit));
  }

  const query = params.toString();

  return query ? `/analysis/reports?${query}` : '/analysis/reports';
}

export const getFaceAnalysisReports = async (
  options: GetFaceAnalysisReportsOptions = {},
): Promise<FaceAnalysisReport[]> => {
  if (!getBackendApiBaseUrl()) {
    return Promise.resolve(faceAnalysisReportsMock);
  }

  const {reports} = await requestBackendJson<ListAnalysisReportsResponse>(
    buildAnalysisReportsPath(options),
  );

  return reports.map((report) => mapBackendJobToFaceAnalysisReport(report));
};

export const getLatestFaceAnalysisReport =
  async (): Promise<FaceAnalysisReport | null> => {
    if (!getBackendApiBaseUrl()) {
      return Promise.resolve(faceAnalysisReportsMock[0] ?? null);
    }

    const reports = await getFaceAnalysisReports();

    return reports[0] ?? null;
  };

export const getFaceAnalysisReportById = async (
  reportId: string,
): Promise<FaceAnalysisReport | null> => {
  if (!getBackendApiBaseUrl()) {
    const report = faceAnalysisReportsMock.find((item) => item.id === reportId);

    return Promise.resolve(report ?? null);
  }

  const {report} = await requestBackendJson<GetAnalysisReportResponse>(
    `/analysis/reports/${reportId}`,
  );

  return mapBackendJobToFaceAnalysisReport(report);
};

export const deleteFaceAnalysisReport = async (
  reportId: string,
): Promise<boolean> => {
  if (!getBackendApiBaseUrl()) {
    return true;
  }

  const response = await requestBackendJson<DeleteAnalysisReportResponse>(
    `/analysis/reports/${reportId}`,
    {method: 'DELETE'},
  );

  return response.deleted;
};

export const deleteFaceAnalysisRecommendedMakeup = async ({
  makeupIndex,
  reportId,
}: {
  makeupIndex: number;
  reportId: string;
}): Promise<FaceAnalysisReport | null> => {
  if (!getBackendApiBaseUrl()) {
    return null;
  }

  const {report} = await requestBackendJson<GetAnalysisReportResponse>(
    `/analysis/reports/${reportId}/recommended-makeups/${makeupIndex}`,
    {method: 'DELETE'},
  );

  return mapBackendJobToFaceAnalysisReport(report);
};

export async function createFaceAnalysisReportFromCapture(
  capture?: FaceAnalysisCaptureInput | null,
): Promise<FaceAnalysisReport> {
  const startedAt = Date.now();
  const hasBackendApiBaseUrl = Boolean(getBackendApiBaseUrl());

  console.info('[aura:analysis] create-report:start', {
    hasBackendApiBaseUrl,
    hasBucket: Boolean(capture?.bucket),
    hasObjectKey: Boolean(capture?.objectKey),
    mediaId: capture?.mediaId ?? null,
    photoCaptureId: capture?.photoCaptureId ?? null,
  });

  if (!hasBackendApiBaseUrl) {
    console.info('[aura:analysis] create-report:fallback-no-api-base');
    return buildFallbackReportFromCapture(capture);
  }

  if (!isUuid(capture?.photoCaptureId) || !isUuid(capture?.mediaId)) {
    console.info('[aura:analysis] create-report:invalid-capture-ids', {
      mediaId: capture?.mediaId ?? null,
      photoCaptureId: capture?.photoCaptureId ?? null,
    });

    throw new Error('촬영 이미지 업로드가 완료되지 않아 AI 분석을 시작할 수 없어요.');
  }

  console.info('[aura:analysis] analysis-job:start', {
    contentType: capture.contentType ?? 'image/jpeg',
    mediaId: capture.mediaId,
    photoCaptureId: capture.photoCaptureId,
  });

  const {job} = await requestBackendJson<CreateAnalysisJobResponse>('/analysis/jobs', {
    body: {
      environmentLabel: '촬영 이미지',
      photoCaptureId: capture.photoCaptureId,
      previewMediaId: capture.mediaId,
      reportTitle: '맞춤 분석 보고서',
      requestPayload: {
        bucket: capture.bucket ?? null,
        cdnUrl: capture.cdnUrl ?? null,
        contentType: capture.contentType ?? 'image/jpeg',
        imageUrl: capture.cdnUrl ?? null,
        objectKey: capture.objectKey ?? null,
        source: capture.source ?? 'camera',
        sourceUri: capture.imageUri ?? null,
        task: 'face_makeup_recommendation_report_v1',
      },
      runImmediately: true,
      sourceMediaId: capture.mediaId,
      title: 'AI 맞춤 메이크업 분석',
    },
    method: 'POST',
  });

  console.info('[aura:analysis] analysis-job:success', {
    durationMs: Date.now() - startedAt,
    generatedImageCount: Array.isArray(job.detailPayload?.result?.recommendedMakeups)
      ? job.detailPayload.result.recommendedMakeups.filter(card =>
          Boolean(card?.imageUrl ?? card?.cdnUrl ?? card?.previewUrl),
        ).length
      : 0,
    hasFaceShape: Boolean(job.faceShape ?? job.detailPayload?.result?.faceShape),
    hasPersonalColor: Boolean(job.personalColor ?? job.detailPayload?.result?.personalColor),
    hasRecommendedMood: Boolean(job.recommendedMood ?? job.detailPayload?.result?.recommendedMood),
    hasToneSummary: Boolean(job.toneSummary ?? job.detailPayload?.result?.toneSummary),
    jobId: job.id ?? null,
    recommendedCount: Array.isArray(job.detailPayload?.result?.recommendedMakeups)
      ? job.detailPayload.result.recommendedMakeups.length
      : 0,
    status: job.status ?? null,
    timing: job.detailPayload?.result?.timing ?? null,
  });
  console.info('[aura:analysis] analysis-report:poll-start', {
    durationMs: Date.now() - startedAt,
    jobId: job.id ?? null,
    status: job.status ?? null,
  });

  return waitForCompleteAnalysisReport(job, capture, startedAt);
}
