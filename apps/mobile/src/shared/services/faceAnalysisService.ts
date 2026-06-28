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
    sourceImageReadMs?: number | null;
    textAnalysisMs?: number | null;
    totalMs?: number | null;
  } | null;
  toneSummary?: string | null;
};

type BackendAnalysisJob = {
  analyzedAt?: string | null;
  baseMakeupGuide?: string | null;
  detailPayload?: {
    result?: BackendAnalysisResult | null;
  } | null;
  environmentLabel?: string | null;
  faceShape?: string | null;
  id?: string | null;
  personalColor?: string | null;
  recommendedMood?: string | null;
  reportTitle?: string | null;
  shortSummary?: string | null;
  skinAnalysisSummary?: string | null;
  skinType?: string | null;
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

type ListAnalysisReportsResponse = {
  reports: BackendAnalysisJob[];
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function mergeMakeupCards(
  reportId: string,
  aiCards: BackendMakeupCard[] | null | undefined,
  fallbackCards: FaceAnalysisMakeupCard[],
  useFallback: boolean,
): FaceAnalysisMakeupCard[] {
  const aiOnlyCards = Array.isArray(aiCards)
    ? aiCards.filter(card => Boolean(card && resolveMakeupImageUrl(card)))
    : [];

  if (!useFallback && aiOnlyCards.length > 0) {
    return aiOnlyCards.slice(0, 3).map((aiCard, index) => {
      const fallbackCard = fallbackCards[index] ?? fallbackCards[0];
      const generatedImageUrl = resolveMakeupImageUrl(aiCard);

      return {
        ...fallbackCard,
        id: `${reportId}-ai-makeup-${index + 1}`,
        title: firstText(aiCard.title) ?? `추천 룩 ${index + 1}`,
        subtitle: firstText(aiCard.subtitle) ?? '맞춤 추천',
        description: firstText(aiCard.description) ?? 'AI 분석 결과를 바탕으로 생성한 룩이에요.',
        imageSource: {uri: generatedImageUrl},
        tags: firstStringArray(aiCard.tags, []),
      };
    });
  }

  if (!useFallback) {
    return [];
  }

  const cards = fallbackCards.slice(0, 3);

  return cards.map((fallbackCard, index) => {
    const aiCard = aiCards?.[index];
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
      tags: firstStringArray(aiCard?.tags, fallbackCard.tags),
    };
  });
}

function hasGeneratedMakeupImage(card: FaceAnalysisMakeupCard): boolean {
  const source = card.imageSource as {uri?: unknown};

  return (
    typeof source?.uri === 'string' &&
    (source.uri.startsWith('http://') || source.uri.startsWith('https://'))
  );
}

function assertCompleteRecommendedMakeups(report: FaceAnalysisReport): void {
  const generatedCards = report.recommendedMakeups.filter(hasGeneratedMakeupImage);

  if (report.recommendedMakeups.length !== 3 || generatedCards.length !== 3) {
    throw new BackendApiError(
      '추천 메이크업 이미지 3개가 아직 생성되지 않았어요.',
      502,
      'RECOMMENDED_MAKEUP_IMAGES_REQUIRED',
      {
        generatedCount: generatedCards.length,
        receivedCount: report.recommendedMakeups.length,
      },
    );
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
  const hasBackendResult = Boolean(job.detailPayload?.result) || job.status === 'completed';
  const reportId = firstText(job.id, fallback.id) ?? fallback.id;
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
    makeupGuideline: mergeMakeupGuideline(
      result.makeupGuideline,
      fallback.makeupGuideline,
    ),
    personalColor,
    recommendedMakeups: mergeMakeupCards(
      reportId,
      result.recommendedMakeups,
      fallback.recommendedMakeups,
      !hasBackendResult,
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

export const getFaceAnalysisReports = async (): Promise<FaceAnalysisReport[]> => {
  if (!getBackendApiBaseUrl()) {
    return Promise.resolve(faceAnalysisReportsMock);
  }

  const {reports} = await requestBackendJson<ListAnalysisReportsResponse>('/analysis/reports');

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

  const report = mapBackendJobToFaceAnalysisReport(job, capture);

  assertCompleteRecommendedMakeups(report);

  return report;
}
