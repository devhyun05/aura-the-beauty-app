import {Image} from 'react-native';

import {uploadFaceCaptureImage} from '../../face-capture/services/faceCaptureUploadService';
import {notifyNotificationStateChanged} from '../../notifications/services/notificationService';
import {BackendApiError, getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import * as SecureStore from '../../../shared/services/localSecureStore';
import {referenceMakeupExtractionMock} from '../mocks/referenceMakeupExtraction.mock';
import type {
  MakeupExtractionProgressUpdate,
  MakeupExtractionStep,
  ReferenceMakeupAreaGuide,
  ReferenceMakeupExtractionData,
  ReferenceMakeupExtractionReportHistoryItem,
  ReferenceMakeupExtractionResult,
  ReferenceMakeupPhoto,
} from '../types';

type BackendReferenceMakeupExtractionLook = Partial<ReferenceMakeupExtractionResult> & {
  areaGuides?: Array<Partial<ReferenceMakeupAreaGuide>>;
};

type BackendReferenceMakeupExtractionResponse = {
  aiStatus?: string;
  extractedMakeupLook?: BackendReferenceMakeupExtractionLook;
  loadingSteps?: MakeupExtractionStep[];
  productSource?: string;
};

const REFERENCE_EXTRACTION_TIMEOUT_MS = 180000;
const REFERENCE_EXTRACTION_POLL_INTERVAL_MS = 2000;
const REFERENCE_EXTRACTION_REPORT_IDS_STORAGE_KEY =
  'aura.referenceMakeupExtraction.reportIds.v1';
const MAX_STORED_REFERENCE_EXTRACTION_REPORTS = 50;

type StoredReferenceExtractionReport = {
  createdAt: string;
  reportId: string;
};

type BackendFilterExtractionResultPayload = {
  aiError?: unknown;
  aiStatus?: string;
  error?: {message?: string | null} | null;
  productSource?: string;
  request?: {
    cdnUrl?: string | null;
    contentType?: string | null;
    referenceImageId?: string | null;
    referenceSource?: 'camera' | 'gallery' | null;
    referenceTitle?: string | null;
    sourceUrl?: string | null;
  } | null;
  result?: BackendReferenceMakeupExtractionResponse | null;
};

type BackendFilterExtractionJob = {
  createdAt?: string | null;
  id?: string | null;
  resultPayload?: BackendFilterExtractionResultPayload | null;
  status?: 'cancelled' | 'completed' | 'failed' | 'pending' | 'processing' | null;
};

type CreateFilterExtractionJobResponse = {
  job: BackendFilterExtractionJob;
};

type GetFilterExtractionReportResponse = {
  report: BackendFilterExtractionJob;
};

type ListFilterExtractionReportsResponse = {
  reports: BackendFilterExtractionJob[];
};

type FilterExtractionNotification = {
  createdAt?: string | null;
  data?: unknown;
  notificationType?: string | null;
};

type FilterExtractionNotificationListResponse = {
  notifications?: FilterExtractionNotification[];
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

let latestReferenceMakeupExtractionData: ReferenceMakeupExtractionData = referenceMakeupExtractionMock;

function isPlainBackendObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function camelizeBackendKey(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function camelizeBackendValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => camelizeBackendValue(item));
  }

  if (!isPlainBackendObject(value)) {
    return value;
  }

  return Object.entries(value).reduce<Record<string, unknown>>((nextValue, [key, nestedValue]) => {
    nextValue[camelizeBackendKey(key)] = camelizeBackendValue(nestedValue);
    return nextValue;
  }, {});
}

function parseStoredReferenceExtractionReports(
  value: string | null,
): StoredReferenceExtractionReport[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap(item => {
      if (!isPlainBackendObject(item)) {
        return [];
      }

      const reportId =
        typeof item.reportId === 'string' ? item.reportId.trim() : '';
      const createdAt =
        typeof item.createdAt === 'string' ? item.createdAt.trim() : '';

      return reportId ? [{createdAt, reportId}] : [];
    });
  } catch {
    return [];
  }
}

async function getStoredReferenceExtractionReports(): Promise<
  StoredReferenceExtractionReport[]
> {
  return parseStoredReferenceExtractionReports(
    await SecureStore.getItemAsync(
      REFERENCE_EXTRACTION_REPORT_IDS_STORAGE_KEY,
    ),
  );
}

async function rememberReferenceExtractionReport(
  reportId: string,
  createdAt = new Date().toISOString(),
): Promise<void> {
  const normalizedReportId = reportId.trim();

  if (!normalizedReportId) {
    return;
  }

  const storedReports = await getStoredReferenceExtractionReports();
  const nextReports = [
    {createdAt, reportId: normalizedReportId},
    ...storedReports.filter(report => report.reportId !== normalizedReportId),
  ].slice(0, MAX_STORED_REFERENCE_EXTRACTION_REPORTS);

  await SecureStore.setItemAsync(
    REFERENCE_EXTRACTION_REPORT_IDS_STORAGE_KEY,
    JSON.stringify(nextReports),
  );
}

function getNotificationReportId(data: unknown): string | null {
  let normalizedData = data;

  if (typeof normalizedData === 'string') {
    try {
      normalizedData = JSON.parse(normalizedData) as unknown;
    } catch {
      return null;
    }
  }

  if (!isPlainBackendObject(normalizedData)) {
    return null;
  }

  const reportId = normalizedData.reportId ?? normalizedData.report_id;

  return typeof reportId === 'string' && reportId.trim()
    ? reportId.trim()
    : null;
}

function extractionResponseFromJob(
  job: BackendFilterExtractionJob,
): BackendReferenceMakeupExtractionResponse | null {
  const payload = job.resultPayload;

  if (!payload?.result) {
    return null;
  }

  return {
    ...payload.result,
    aiStatus: payload.aiStatus,
    productSource: payload.productSource,
  };
}

async function waitForCompleteFilterExtractionJob(
  initialJob: BackendFilterExtractionJob,
  onProgress: ((update: MakeupExtractionProgressUpdate) => void) | undefined,
  startedAt: number,
): Promise<BackendReferenceMakeupExtractionResponse> {
  let currentJob = initialJob;

  while (true) {
    const completedResponse = extractionResponseFromJob(currentJob);

    if (completedResponse?.extractedMakeupLook) {
      console.info('[aura:reference-extraction] report:ready', {
        durationMs: Date.now() - startedAt,
        jobId: currentJob.id ?? null,
        status: currentJob.status ?? null,
      });
      return completedResponse;
    }

    if (currentJob.status === 'failed') {
      throw new BackendApiError(
        currentJob.resultPayload?.error?.message ?? '레퍼런스 메이크업 추출 작업이 실패했어요.',
        502,
        'FILTER_EXTRACTION_JOB_FAILED',
        {jobId: currentJob.id ?? null},
      );
    }

    if (currentJob.status === 'completed') {
      throw new BackendApiError(
        '레퍼런스 메이크업 추출 결과를 불러오지 못했어요.',
        502,
        'FILTER_EXTRACTION_RESULT_REQUIRED',
        {jobId: currentJob.id ?? null},
      );
    }

    if (!currentJob.id) {
      throw new Error('Filter extraction job did not return a report id.');
    }

    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs >= REFERENCE_EXTRACTION_TIMEOUT_MS) {
      throw new BackendApiError(
        '레퍼런스 분석이 아직 완료되지 않았어요. 잠시 후 다시 시도해 주세요.',
        504,
        'FILTER_EXTRACTION_REPORT_TIMEOUT',
        {jobId: currentJob.id, status: currentJob.status ?? null},
      );
    }

    const progress = Math.min(0.82, 0.46 + (elapsedMs / REFERENCE_EXTRACTION_TIMEOUT_MS) * 0.36);
    onProgress?.({activeStepId: 'area-guides', phase: 'analyzing', progress});

    console.info('[aura:reference-extraction] report:poll', {
      elapsedMs,
      jobId: currentJob.id,
      nextPollMs: REFERENCE_EXTRACTION_POLL_INTERVAL_MS,
      status: currentJob.status ?? null,
    });

    await delay(
      Math.min(
        REFERENCE_EXTRACTION_POLL_INTERVAL_MS,
        REFERENCE_EXTRACTION_TIMEOUT_MS - elapsedMs,
      ),
    );

    const response = await requestBackendJson<unknown>(
      '/filter-extractions/' + currentJob.id,
    );
    const normalizedResponse = camelizeBackendValue(
      response,
    ) as GetFilterExtractionReportResponse;
    currentJob = normalizedResponse.report;
  }
}

function buildFallbackDataForPhoto(photo?: ReferenceMakeupPhoto | null): ReferenceMakeupExtractionData {
  if (!photo) {
    return referenceMakeupExtractionMock;
  }

  return {
    ...referenceMakeupExtractionMock,
    extractedMakeupLook: {
      ...referenceMakeupExtractionMock.extractedMakeupLook,
      imageSource: photo.imageSource,
    },
  };
}

function getFallbackAreaGuide(id: string | undefined): ReferenceMakeupAreaGuide | undefined {
  return referenceMakeupExtractionMock.extractedMakeupLook.areaGuides.find(
    (guide) => guide.id === id,
  );
}

function mergeBackendAreaGuide(
  backendGuide: Partial<ReferenceMakeupAreaGuide>,
): ReferenceMakeupAreaGuide | null {
  const fallbackGuide = getFallbackAreaGuide(backendGuide.id);

  if (!fallbackGuide) {
    return null;
  }

  const backendProduct = backendGuide.productRecommendation?.product;
  const fallbackProduct = fallbackGuide.productRecommendation.product;

  return {
    ...fallbackGuide,
    ...backendGuide,
    color: {
      ...fallbackGuide.color,
      ...backendGuide.color,
    },
    productRecommendation: {
      ...fallbackGuide.productRecommendation,
      ...backendGuide.productRecommendation,
      product: backendProduct && fallbackProduct
        ? {
            ...fallbackProduct,
            ...backendProduct,
            imageSource: fallbackProduct.imageSource,
          }
        : fallbackProduct,
    },
  };
}

function mergeBackendExtractionLook(
  backendLook: BackendReferenceMakeupExtractionResponse['extractedMakeupLook'],
  photo: ReferenceMakeupPhoto,
): ReferenceMakeupExtractionResult {
  const fallbackLook = referenceMakeupExtractionMock.extractedMakeupLook;
  const backendGuides = Array.isArray(backendLook?.areaGuides)
    ? backendLook.areaGuides
        .map((guide) => mergeBackendAreaGuide(guide))
        .filter((guide): guide is ReferenceMakeupAreaGuide => Boolean(guide))
    : [];

  return {
    ...fallbackLook,
    ...backendLook,
    imageSource: photo.imageSource,
    lookDna: {
      ...fallbackLook.lookDna,
      ...backendLook?.lookDna,
      keyAreas: backendLook?.lookDna?.keyAreas ?? fallbackLook.lookDna.keyAreas,
      moodKeywords: backendLook?.lookDna?.moodKeywords ?? fallbackLook.lookDna.moodKeywords,
      textureBalance: backendLook?.lookDna?.textureBalance ?? fallbackLook.lookDna.textureBalance,
    },
    palette: backendLook?.palette ?? fallbackLook.palette,
    points: backendLook?.points ?? fallbackLook.points,
    tags: backendLook?.tags ?? fallbackLook.tags,
    areaGuides: backendGuides.length > 0 ? backendGuides : fallbackLook.areaGuides,
  };
}

function resolveReferencePhotoUri(photo: ReferenceMakeupPhoto): string | null {
  const resolvedSource = Image.resolveAssetSource(photo.imageSource);

  return resolvedSource?.uri ?? null;
}

function resolveReferencePhotoContentType(photo: ReferenceMakeupPhoto, uri: string): string | null {
  if (photo.contentType?.trim()) {
    return photo.contentType.trim();
  }

  const normalizedUri = uri.split('?')[0].toLowerCase();

  if (normalizedUri.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedUri.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalizedUri.endsWith('.jpg') || normalizedUri.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  return typeof photo.imageSource === 'number' ? 'image/png' : null;
}

function getReferencePhotoUploadExtension(contentType: string | null): string {
  if (contentType === 'image/png') {
    return 'png';
  }

  if (contentType === 'image/webp') {
    return 'webp';
  }

  return 'jpg';
}

function shouldRunReferenceMakeupAi(): boolean {
  return process.env.EXPO_PUBLIC_REFERENCE_MAKEUP_AI_ENABLED === 'true';
}

export const getReferenceMakeupExtractionData = async (): Promise<ReferenceMakeupExtractionData> => {
  return Promise.resolve(latestReferenceMakeupExtractionData);
};

export const getReferenceMakeupExtractionDataSync = (): ReferenceMakeupExtractionData =>
  latestReferenceMakeupExtractionData;

function mapCompletedFilterExtractionReport(
  job: BackendFilterExtractionJob,
  fallbackReportId = '',
): ReferenceMakeupExtractionReportHistoryItem | null {
  const completedResponse = extractionResponseFromJob(job);
  const reportId = job.id?.trim() || fallbackReportId.trim();

  if (!reportId || !completedResponse?.extractedMakeupLook) {
    return null;
  }

  const request = job.resultPayload?.request;
  const fallbackPhoto = referenceMakeupExtractionMock.photos[0];
  const imageUri = request?.cdnUrl?.trim() || request?.sourceUrl?.trim();
  const photo: ReferenceMakeupPhoto = {
    ...fallbackPhoto,
    contentType: request?.contentType?.trim() || fallbackPhoto.contentType,
    id: request?.referenceImageId?.trim() || `filter-extraction-${reportId}`,
    imageSource: imageUri ? {uri: imageUri} : fallbackPhoto.imageSource,
    referenceSource:
      request?.referenceSource === 'camera' ? 'camera' : 'album',
    title:
      request?.referenceTitle?.trim() ||
      completedResponse.extractedMakeupLook.title ||
      fallbackPhoto.title,
  };
  const data: ReferenceMakeupExtractionData = {
    ...referenceMakeupExtractionMock,
    photos: [
      photo,
      ...referenceMakeupExtractionMock.photos.filter(item => item.id !== photo.id),
    ],
    loadingSteps:
      completedResponse.loadingSteps ??
      referenceMakeupExtractionMock.loadingSteps,
    extractedMakeupLook: mergeBackendExtractionLook(
      completedResponse.extractedMakeupLook,
      photo,
    ),
  };

  return {
    createdAt: job.createdAt?.trim() || '',
    data,
    photo,
    reportId,
  };
}

export async function fetchReferenceMakeupExtractionReport(
  reportId: string,
): Promise<{data: ReferenceMakeupExtractionData; photo: ReferenceMakeupPhoto}> {
  const response = await requestBackendJson<unknown>(
    '/filter-extractions/' + encodeURIComponent(reportId),
  );
  const normalizedResponse = camelizeBackendValue(
    response,
  ) as GetFilterExtractionReportResponse;
  const job = normalizedResponse.report;
  const mappedReport = mapCompletedFilterExtractionReport(job, reportId);

  if (!mappedReport) {
    throw new BackendApiError(
      '완료된 메이크업 추출 보고서를 불러오지 못했어요.',
      409,
      'FILTER_EXTRACTION_REPORT_NOT_COMPLETED',
      {reportId, status: job.status ?? null},
    );
  }

  latestReferenceMakeupExtractionData = mappedReport.data;
  await rememberReferenceExtractionReport(
    mappedReport.reportId,
    mappedReport.createdAt || new Date().toISOString(),
  );

  return {data: latestReferenceMakeupExtractionData, photo: mappedReport.photo};
}

export async function fetchReferenceMakeupExtractionReports({
  limit = 20,
  offset = 0,
}: {
  limit?: number;
  offset?: number;
} = {}): Promise<ReferenceMakeupExtractionReportHistoryItem[]> {
  try {
    const response = await requestBackendJson<unknown>(
      `/filter-extractions?limit=${limit}&offset=${offset}`,
    );
    const normalizedResponse = camelizeBackendValue(
      response,
    ) as ListFilterExtractionReportsResponse;

    return (normalizedResponse.reports ?? []).flatMap(report => {
      const mappedReport = mapCompletedFilterExtractionReport(report);
      return mappedReport ? [mappedReport] : [];
    });
  } catch {
    return fetchReferenceMakeupExtractionReportsFromNotifications({
      limit,
      offset,
    });
  }
}

async function fetchReferenceMakeupExtractionReportsFromNotifications({
  limit,
  offset,
}: {
  limit: number;
  offset: number;
}): Promise<ReferenceMakeupExtractionReportHistoryItem[]> {
  const notificationLimit = Math.min(100, Math.max(50, limit + offset));
  const [storedReports, response] = await Promise.all([
    getStoredReferenceExtractionReports(),
    requestBackendJson<FilterExtractionNotificationListResponse>(
      `/notifications?limit=${notificationLimit}&offset=0`,
    ).catch(() => ({notifications: []})),
  ]);
  const notificationReportIds = new Set<string>();
  const notificationReports = (response.notifications ?? []).flatMap(
    notification => {
      const reportId = getNotificationReportId(notification.data);

      if (
        notification.notificationType !== 'filter_extraction_completed' ||
        !reportId ||
        notificationReportIds.has(reportId)
      ) {
        return [];
      }

      notificationReportIds.add(reportId);
      return [{createdAt: notification.createdAt?.trim() || '', reportId}];
    },
  );
  const seenReportIds = new Set<string>();
  const reportCandidates = [...storedReports, ...notificationReports].filter(
    report => {
      if (seenReportIds.has(report.reportId)) {
        return false;
      }

      seenReportIds.add(report.reportId);
      return true;
    },
  );
  const selectedReports = reportCandidates.slice(
    offset,
    offset + limit,
  );
  const reports = await Promise.all(
    selectedReports.map(async storedReport => {
      try {
        const response = await requestBackendJson<unknown>(
          '/filter-extractions/' + encodeURIComponent(storedReport.reportId),
        );
        const normalizedResponse = camelizeBackendValue(
          response,
        ) as GetFilterExtractionReportResponse;
        const mappedReport = mapCompletedFilterExtractionReport(
          normalizedResponse.report,
          storedReport.reportId,
        );

        return mappedReport
          ? {
              ...mappedReport,
              createdAt: mappedReport.createdAt || storedReport.createdAt,
            }
          : null;
      } catch {
        return null;
      }
    }),
  );

  return reports.filter(
    (report): report is ReferenceMakeupExtractionReportHistoryItem =>
      report !== null,
  );
}

export async function runReferenceMakeupExtraction(
  photo: ReferenceMakeupPhoto,
  onProgress?: (update: MakeupExtractionProgressUpdate) => void,
): Promise<ReferenceMakeupExtractionData> {
  const hasBackendApiBaseUrl = Boolean(getBackendApiBaseUrl());
  const fallbackData = buildFallbackDataForPhoto(photo);

  onProgress?.({activeStepId: 'reference-read', phase: 'queued', progress: 0.03});

  if (!hasBackendApiBaseUrl) {
    console.info('[aura:reference-extraction] fallback:no-api-base');
    latestReferenceMakeupExtractionData = fallbackData;
    onProgress?.({activeStepId: 'ar-filter-ready', phase: 'fallback', progress: 1});
    return latestReferenceMakeupExtractionData;
  }

  const photoUri = resolveReferencePhotoUri(photo);

  if (!photoUri) {
    console.info('[aura:reference-extraction] fallback:no-photo-uri', {photoId: photo.id});
    latestReferenceMakeupExtractionData = fallbackData;
    onProgress?.({activeStepId: 'ar-filter-ready', phase: 'fallback', progress: 1});
    return latestReferenceMakeupExtractionData;
  }

  try {
    onProgress?.({activeStepId: 'reference-read', phase: 'uploading', progress: 0.1});

    console.info('[aura:reference-extraction] upload:start', {
      photoId: photo.id,
      referenceSource: photo.referenceSource,
      runAi: shouldRunReferenceMakeupAi(),
    });

    const referencePhotoContentType = resolveReferencePhotoContentType(photo, photoUri);
    const referencePhotoExtension = getReferencePhotoUploadExtension(referencePhotoContentType);
    const upload = await uploadFaceCaptureImage({
      captureType: 'filter_extraction',
      contentType: referencePhotoContentType,
      fileName: `${photo.id}.${referencePhotoExtension}`,
      mediaKind: 'filter-extraction',
      source: photo.referenceSource === 'camera' ? 'camera' : 'gallery',
      uri: photoUri,
    });

    onProgress?.({activeStepId: 'core-points', phase: 'uploaded', progress: 0.24});
    onProgress?.({activeStepId: 'area-guides', phase: 'analyzing', progress: 0.46});

    const startedAt = Date.now();

    const response = await requestBackendJson<unknown>(
      '/filter-extractions/analyze',
      {
        body: {
          photoCaptureId: upload.photoCaptureId,
          referenceImageId: photo.id,
          resultMediaId: upload.mediaId,
          runAi: shouldRunReferenceMakeupAi(),
          subtitle: null,
          title: photo.title,
          requestPayload: {
            referenceImageId: photo.id,
            referenceSource: photo.referenceSource,
            referenceTitle: photo.title,
            task: 'reference_makeup_extraction_report_v1',
          },
        },
        method: 'POST',
        timeoutMs: 30000,
      },
    );
    const createResponse = camelizeBackendValue(
      response,
    ) as CreateFilterExtractionJobResponse;
    const reportId = createResponse.job.id?.trim() || '';
    const normalizedResponse = await waitForCompleteFilterExtractionJob(
      createResponse.job,
      onProgress,
      startedAt,
    );

    onProgress?.({activeStepId: 'product-criteria', phase: 'products', progress: 0.86});

    latestReferenceMakeupExtractionData = {
      ...referenceMakeupExtractionMock,
      photos: [
        photo,
        ...referenceMakeupExtractionMock.photos.filter(
          item => item.id !== photo.id,
        ),
      ],
      loadingSteps: normalizedResponse.loadingSteps ?? referenceMakeupExtractionMock.loadingSteps,
      extractedMakeupLook: mergeBackendExtractionLook(normalizedResponse.extractedMakeupLook, photo),
    };

    if (reportId) {
      await rememberReferenceExtractionReport(reportId);
    }
    notifyNotificationStateChanged();
    onProgress?.({activeStepId: 'ar-filter-ready', phase: 'complete', progress: 1});

    console.info('[aura:reference-extraction] analyze:success', {
      aiStatus: normalizedResponse.aiStatus,
      areaGuideCount: latestReferenceMakeupExtractionData.extractedMakeupLook.areaGuides.length,
      productSource: normalizedResponse.productSource,
      title: latestReferenceMakeupExtractionData.extractedMakeupLook.title,
    });

    return latestReferenceMakeupExtractionData;
  } catch (error) {
    console.info('[aura:reference-extraction] fallback:backend-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    latestReferenceMakeupExtractionData = fallbackData;
    onProgress?.({activeStepId: 'ar-filter-ready', phase: 'fallback', progress: 1});
    return latestReferenceMakeupExtractionData;
  }
}
