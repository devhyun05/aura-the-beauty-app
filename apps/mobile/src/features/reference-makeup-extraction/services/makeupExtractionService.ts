import {Image} from 'react-native';

import {uploadFaceCaptureImage} from '../../face-capture/services/faceCaptureUploadService';
import {notifyNotificationStateChanged} from '../../notifications/services/notificationService';
import {
  BackendApiError,
  getBackendApiBaseUrl,
  RequestAbortedError,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import * as SecureStore from '../../../shared/services/localSecureStore';
import {referenceMakeupExtractionMock} from '../mocks/referenceMakeupExtraction.mock';
import type {
  MakeupExtractionProgressUpdate,
  MakeupExtractionStep,
  MakeupLookPalette,
  MakeupLookPoint,
  ReferenceMakeupAreaGuide,
  ReferenceMakeupAreaId,
  ReferenceMakeupAreaProductRecommendation,
  ReferenceMakeupExtractionData,
  ReferenceMakeupExtractionReportHistoryItem,
  ReferenceMakeupExtractionResult,
  ReferenceMakeupLookDna,
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

export type ReferenceMakeupExtractionRunResult = {
  data: ReferenceMakeupExtractionData;
  reportId: string;
};

export type ReferenceMakeupExtractionOperationOptions = {
  signal?: AbortSignal;
};

export type ReferenceMakeupExtractionRunOptions =
  ReferenceMakeupExtractionOperationOptions;

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
    referenceSource?: 'album' | 'camera' | 'gallery' | null;
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

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RequestAbortedError());
      return;
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);
    const handleAbort = () => {
      clearTimeout(timeoutId);
      reject(new RequestAbortedError());
    };

    signal?.addEventListener('abort', handleAbort, {once: true});
  });
}

let latestReferenceMakeupExtractionData: ReferenceMakeupExtractionData = referenceMakeupExtractionMock;
let hasCompletedReferenceMakeupExtraction = false;
let referenceMakeupExtractionOperationSequence = 0;
const deletedReferenceMakeupExtractionReportIds = new Set<string>();

function assertReferenceMakeupExtractionOperationIsCurrent(
  operationSequence: number,
  signal?: AbortSignal,
): void {
  if (signal?.aborted || operationSequence !== referenceMakeupExtractionOperationSequence) {
    throw new RequestAbortedError();
  }
}

function assertReferenceMakeupExtractionReportIsNotDeleted(
  reportId: string,
): void {
  if (deletedReferenceMakeupExtractionReportIds.has(reportId.trim())) {
    throw new RequestAbortedError();
  }
}

function invalidateReferenceMakeupExtractionReport(reportId: string): void {
  const normalizedReportId = reportId.trim();

  if (!normalizedReportId) {
    return;
  }

  deletedReferenceMakeupExtractionReportIds.add(normalizedReportId);
  if (deletedReferenceMakeupExtractionReportIds.size > MAX_STORED_REFERENCE_EXTRACTION_REPORTS) {
    const oldestReportId = deletedReferenceMakeupExtractionReportIds.values().next().value;
    if (typeof oldestReportId === 'string') {
      deletedReferenceMakeupExtractionReportIds.delete(oldestReportId);
    }
  }

  if (latestReferenceMakeupExtractionData.reportId?.trim() === normalizedReportId) {
    latestReferenceMakeupExtractionData = referenceMakeupExtractionMock;
    hasCompletedReferenceMakeupExtraction = false;
  }
}

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

let referenceExtractionStorageMutationTail = Promise.resolve();

async function withReferenceExtractionStorageMutationLock<T>(
  mutation: () => Promise<T>,
): Promise<T> {
  const previousMutation = referenceExtractionStorageMutationTail;
  let releaseMutationLock: () => void = () => {};
  referenceExtractionStorageMutationTail = new Promise<void>(resolve => {
    releaseMutationLock = resolve;
  });

  await previousMutation;
  try {
    return await mutation();
  } finally {
    releaseMutationLock();
  }
}

async function forgetReferenceExtractionReport(reportId: string): Promise<void> {
  const normalizedReportId = reportId.trim();

  await withReferenceExtractionStorageMutationLock(async () => {
    const storedReports = await getStoredReferenceExtractionReports();

    await SecureStore.setItemAsync(
      REFERENCE_EXTRACTION_REPORT_IDS_STORAGE_KEY,
      JSON.stringify(
        storedReports.filter(report => report.reportId !== normalizedReportId),
      ),
    );
  });
}

type ReferenceExtractionCommitInput = {
  assertCurrent: () => void;
  createdAt?: string;
  data: ReferenceMakeupExtractionData;
  notify: boolean;
  reportId: string;
};

async function commitReferenceMakeupExtractionResult({
  assertCurrent,
  createdAt = new Date().toISOString(),
  data,
  notify,
  reportId,
}: ReferenceExtractionCommitInput): Promise<void> {
  const normalizedReportId = reportId.trim();

  if (!normalizedReportId) {
    throw new BackendApiError(
      '메이크업 추출 보고서 번호가 없어 결과를 저장하지 못했어요.',
      502,
      'FILTER_EXTRACTION_REPORT_ID_REQUIRED',
    );
  }

  await withReferenceExtractionStorageMutationLock(async () => {
    assertCurrent();
    assertReferenceMakeupExtractionReportIsNotDeleted(normalizedReportId);
    const storedReports = await getStoredReferenceExtractionReports();
    assertCurrent();
    const nextReports = [
      {createdAt, reportId: normalizedReportId},
      ...storedReports.filter(report => report.reportId !== normalizedReportId),
    ].slice(0, MAX_STORED_REFERENCE_EXTRACTION_REPORTS);

    await SecureStore.setItemAsync(
      REFERENCE_EXTRACTION_REPORT_IDS_STORAGE_KEY,
      JSON.stringify(nextReports),
    );

    try {
      assertCurrent();
      assertReferenceMakeupExtractionReportIsNotDeleted(normalizedReportId);
    } catch (error) {
      await SecureStore.setItemAsync(
        REFERENCE_EXTRACTION_REPORT_IDS_STORAGE_KEY,
        JSON.stringify(storedReports),
      );
      throw error;
    }

    // Storage and module-global state share one logical commit boundary. Once
    // this final ownership check passes there is no await before the globals,
    // so a newer detail fetch/run cannot interleave and be rolled back.
    latestReferenceMakeupExtractionData = data;
    hasCompletedReferenceMakeupExtraction = true;
    if (notify) {
      notifyNotificationStateChanged();
    }
  });
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
  signal: AbortSignal | undefined,
  assertCurrent: () => void,
): Promise<BackendReferenceMakeupExtractionResponse> {
  let currentJob = initialJob;

  while (true) {
    assertCurrent();
    const completedResponse = extractionResponseFromJob(currentJob);

    if (currentJob.status === 'failed' || currentJob.status === 'cancelled') {
      throw new BackendApiError(
        currentJob.resultPayload?.error?.message ?? '레퍼런스 메이크업 추출 작업이 실패했어요.',
        502,
        'FILTER_EXTRACTION_JOB_FAILED',
        {jobId: currentJob.id ?? null, status: currentJob.status},
      );
    }

    if (
      currentJob.status === 'completed' &&
      completedResponse?.extractedMakeupLook &&
      completedResponse.aiStatus === 'bedrock_completed'
    ) {
      console.info('[aura:reference-extraction] report:ready', {
        durationMs: Date.now() - startedAt,
        jobId: currentJob.id ?? null,
        status: currentJob.status ?? null,
      });
      return completedResponse;
    }

    if (
      currentJob.status === 'completed' &&
      completedResponse?.aiStatus !== 'bedrock_completed'
    ) {
      throw new BackendApiError(
        '실제 AI 메이크업 추출 결과를 만들지 못했어요. 다시 시도해 주세요.',
        502,
        'FILTER_EXTRACTION_AI_RESULT_REQUIRED',
        {
          aiStatus: completedResponse?.aiStatus ?? null,
          jobId: currentJob.id ?? null,
        },
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
    assertCurrent();
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
      signal,
    );
    assertCurrent();

    const response = await requestBackendJson<unknown>(
      '/filter-extractions/' + currentJob.id,
      {signal},
    );
    assertCurrent();
    const normalizedResponse = camelizeBackendValue(
      response,
    ) as GetFilterExtractionReportResponse;
    currentJob = normalizedResponse.report;
  }
}
const REFERENCE_MAKEUP_AREA_IDS: readonly ReferenceMakeupAreaId[] = [
  'skin',
  'eye',
  'brow',
  'cheek',
  'lip',
  'contour',
];
const REFERENCE_PRODUCT_CATEGORIES = ['base', 'shadow', 'liner', 'cheek', 'lip'] as const;

function readBackendText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBackendStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value.flatMap(item => {
    const text = readBackendText(item);
    return text ? [text] : [];
  });
  return items.length > 0 ? items : null;
}

function isReferenceMakeupAreaId(value: string): value is ReferenceMakeupAreaId {
  return REFERENCE_MAKEUP_AREA_IDS.some(areaId => areaId === value);
}

function isReferenceProductCategory(
  value: string,
): value is ReferenceMakeupAreaProductRecommendation['category'] {
  return REFERENCE_PRODUCT_CATEGORIES.some(category => category === value);
}

function parseBackendPalette(value: unknown): MakeupLookPalette[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const palette = value.flatMap(item => {
    if (!isPlainBackendObject(item)) {
      return [];
    }

    const id = readBackendText(item.id);
    const label = readBackendText(item.label);
    const hex = readBackendText(item.hex);
    const description = readBackendText(item.description);

    return id && label && hex && description
      ? [{description, hex, id, label}]
      : [];
  });

  return palette.length === value.length ? palette : null;
}

function parseBackendPoints(value: unknown): MakeupLookPoint[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const points = value.flatMap(item => {
    if (!isPlainBackendObject(item)) {
      return [];
    }

    const id = readBackendText(item.id);
    const title = readBackendText(item.title);
    const description = readBackendText(item.description);

    return id && title && description ? [{description, id, title}] : [];
  });

  return points.length === value.length ? points : null;
}

function parseBackendLookDna(value: unknown): ReferenceMakeupLookDna | null {
  if (!isPlainBackendObject(value)) {
    return null;
  }

  const difficulty = readBackendText(value.difficulty);
  const keyAreas = readBackendStringList(value.keyAreas);
  const moodKeywords = readBackendStringList(value.moodKeywords);
  const rawTextureBalance = value.textureBalance;

  if (!difficulty || !keyAreas || !moodKeywords || !Array.isArray(rawTextureBalance)) {
    return null;
  }

  const textureBalance = rawTextureBalance.flatMap(item => {
    if (!isPlainBackendObject(item)) {
      return [];
    }

    const id = readBackendText(item.id);
    const label = readBackendText(item.label);
    const color = readBackendText(item.color);
    const metricValue = typeof item.value === 'number' && Number.isFinite(item.value)
      ? item.value
      : null;

    return id && label && color && metricValue !== null
      ? [{color, id, label, value: metricValue}]
      : [];
  });

  return textureBalance.length === rawTextureBalance.length && textureBalance.length > 0
    ? {difficulty, keyAreas, moodKeywords, textureBalance}
    : null;
}

function parseBackendAreaGuide(value: unknown): ReferenceMakeupAreaGuide | null {
  if (!isPlainBackendObject(value)) {
    return null;
  }

  const id = readBackendText(value.id);
  const label = readBackendText(value.label);
  const title = readBackendText(value.title);
  const texture = readBackendText(value.texture);
  const quickTip = readBackendText(value.quickTip);
  const analysis = readBackendText(value.analysis);
  const howTo = readBackendText(value.howTo);
  const professionalPoint = readBackendText(value.professionalPoint);
  const colorValue = value.color;
  const recommendationValue = value.productRecommendation;

  if (
    !id ||
    !isReferenceMakeupAreaId(id) ||
    !label ||
    !title ||
    !texture ||
    !quickTip ||
    !analysis ||
    !howTo ||
    !professionalPoint ||
    !isPlainBackendObject(colorValue) ||
    !isPlainBackendObject(recommendationValue)
  ) {
    return null;
  }

  const colorName = readBackendText(colorValue.name);
  const colorHex = readBackendText(colorValue.hex);
  const category = readBackendText(recommendationValue.category);
  const searchQuery = readBackendText(recommendationValue.searchQuery);
  const productReason = readBackendText(recommendationValue.reason);

  if (
    !colorName ||
    !colorHex ||
    !category ||
    !isReferenceProductCategory(category) ||
    !searchQuery ||
    !productReason
  ) {
    return null;
  }

  const productValue = recommendationValue.product;
  let product: ReferenceMakeupAreaProductRecommendation['product'];

  if (isPlainBackendObject(productValue)) {
    const productId = readBackendText(productValue.id);
    const brandName = readBackendText(productValue.brandName);
    const productName = readBackendText(productValue.productName);
    const imageUrl = readBackendText(productValue.imageUrl);
    const purchaseUrl = readBackendText(productValue.purchaseUrl);
    const price = typeof productValue.price === 'number' && Number.isFinite(productValue.price)
      ? productValue.price
      : null;

    if (productId && brandName && productName && imageUrl && price !== null) {
      product = {
        brandName,
        id: productId,
        imageSource: {uri: imageUrl},
        imageUrl,
        price,
        productName,
        purchaseUrl,
      };
    }
  }

  const avoid = readBackendStringList(value.avoid) ?? undefined;
  const steps = Array.isArray(value.steps)
    ? value.steps.flatMap((step, index) => {
        if (!isPlainBackendObject(step)) {
          return [];
        }
        const instruction = readBackendText(step.instruction);
        const order = typeof step.order === 'number' && Number.isFinite(step.order)
          ? step.order
          : index + 1;
        return instruction ? [{instruction, order}] : [];
      })
    : undefined;

  return {
    analysis,
    avoid,
    color: {hex: colorHex, name: colorName},
    goal: readBackendText(value.goal) ?? undefined,
    howTo,
    id,
    label,
    placement: readBackendText(value.placement) ?? undefined,
    productRecommendation: {
      category,
      product,
      reason: productReason,
      searchQuery,
    },
    professionalPoint,
    quickTip,
    reason: readBackendText(value.reason) ?? undefined,
    steps,
    technique: readBackendText(value.technique) ?? undefined,
    texture,
    title,
  };
}

function parseBackendExtractionLook(
  backendLook: BackendReferenceMakeupExtractionResponse['extractedMakeupLook'],
  photo: ReferenceMakeupPhoto,
): ReferenceMakeupExtractionResult | null {
  if (!isPlainBackendObject(backendLook)) {
    return null;
  }

  const id = readBackendText(backendLook.id);
  const title = readBackendText(backendLook.title);
  const subtitle = readBackendText(backendLook.subtitle);
  const tags = readBackendStringList(backendLook.tags);
  const palette = parseBackendPalette(backendLook.palette);
  const points = parseBackendPoints(backendLook.points);
  const lookDna = parseBackendLookDna(backendLook.lookDna);
  const accuracy = typeof backendLook.accuracy === 'number' && Number.isFinite(backendLook.accuracy)
    ? backendLook.accuracy
    : null;
  const rawGuides = backendLook.areaGuides;
  const areaGuides = Array.isArray(rawGuides)
    ? rawGuides.flatMap(guide => {
        const parsedGuide = parseBackendAreaGuide(guide);
        return parsedGuide ? [parsedGuide] : [];
      })
    : [];
  const areaIds = new Set(areaGuides.map(guide => guide.id));
  const hasAllAreas = REFERENCE_MAKEUP_AREA_IDS.every(areaId => areaIds.has(areaId));

  if (
    !id ||
    !title ||
    !subtitle ||
    !tags ||
    !palette ||
    !points ||
    !lookDna ||
    accuracy === null ||
    !hasAllAreas ||
    areaGuides.length !== REFERENCE_MAKEUP_AREA_IDS.length
  ) {
    return null;
  }

  return {
    accuracy,
    areaGuides,
    id,
    imageSource: photo.imageSource,
    lookDna,
    palette,
    points,
    subtitle,
    tags,
    title,
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

export function shouldRunReferenceMakeupAi(): boolean {
  // 프로덕션 추출은 실제 AI 결과만 성공으로 인정한다. 환경값 하나로 정적
  // 결과가 사용자 보고서처럼 노출되지 않도록 런타임 토글을 두지 않는다.
  return true;
}

export const getReferenceMakeupExtractionData = async (): Promise<ReferenceMakeupExtractionData> => {
  return Promise.resolve(latestReferenceMakeupExtractionData);
};

export const getReferenceMakeupExtractionDataSync = (): ReferenceMakeupExtractionData =>
  latestReferenceMakeupExtractionData;

export const hasCompletedReferenceMakeupExtractionSync = (): boolean =>
  hasCompletedReferenceMakeupExtraction;

function mapCompletedFilterExtractionReport(
  job: BackendFilterExtractionJob,
  fallbackReportId = '',
): ReferenceMakeupExtractionReportHistoryItem | null {
  const completedResponse = extractionResponseFromJob(job);
  const reportId = job.id?.trim() || fallbackReportId.trim();

  if (
    job.status !== 'completed' ||
    !reportId ||
    !completedResponse?.extractedMakeupLook ||
    completedResponse.aiStatus !== 'bedrock_completed'
  ) {
    return null;
  }

  const request = job.resultPayload?.request;
  const imageUri = request?.cdnUrl?.trim() || request?.sourceUrl?.trim();
  const extractedMakeupLook = imageUri
    ? parseBackendExtractionLook(
        completedResponse.extractedMakeupLook,
        {
          contentType: request?.contentType?.trim() || null,
          id: request?.referenceImageId?.trim() || `filter-extraction-${reportId}`,
          imageSource: {uri: imageUri},
          referenceSource: request?.referenceSource === 'camera' ? 'camera' : 'album',
          title:
            request?.referenceTitle?.trim() ||
            completedResponse.extractedMakeupLook.title ||
            '메이크업 추출 보고서',
        },
      )
    : null;

  if (!imageUri || !extractedMakeupLook) {
    return null;
  }

  const photo: ReferenceMakeupPhoto = {
    contentType: request?.contentType?.trim() || null,
    id: request?.referenceImageId?.trim() || `filter-extraction-${reportId}`,
    imageSource: {uri: imageUri},
    referenceSource:
      request?.referenceSource === 'camera' ? 'camera' : 'album',
    title:
      request?.referenceTitle?.trim() ||
      completedResponse.extractedMakeupLook.title ||
      '메이크업 추출 보고서',
  };
  const data: ReferenceMakeupExtractionData = {
    createdAt: job.createdAt?.trim() || undefined,
    reportId,
    photos: [photo],
    loadingSteps:
      completedResponse.loadingSteps ??
      referenceMakeupExtractionMock.loadingSteps,
    extractedMakeupLook,
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
  options: ReferenceMakeupExtractionOperationOptions = {},
): Promise<{data: ReferenceMakeupExtractionData; photo: ReferenceMakeupPhoto}> {
  const operationSequence = ++referenceMakeupExtractionOperationSequence;
  const {signal} = options;
  const assertCurrent = () =>
    assertReferenceMakeupExtractionOperationIsCurrent(
      operationSequence,
      signal,
    );

  assertCurrent();
  const response = await requestBackendJson<unknown>(
    '/filter-extractions/' + encodeURIComponent(reportId),
    {signal},
  );
  assertCurrent();
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

  await commitReferenceMakeupExtractionResult({
    assertCurrent,
    createdAt: mappedReport.createdAt || new Date().toISOString(),
    data: mappedReport.data,
    notify: false,
    reportId: mappedReport.reportId,
  });

  return {data: mappedReport.data, photo: mappedReport.photo};
}
export async function deleteReferenceMakeupExtractionReport(
  reportId: string,
): Promise<void> {
  const normalizedReportId = reportId.trim();
  if (!normalizedReportId) {
    throw new BackendApiError(
      '삭제할 메이크업 추출 보고서 번호가 없어요.',
      400,
      'FILTER_EXTRACTION_REPORT_ID_REQUIRED',
    );
  }

  referenceMakeupExtractionOperationSequence += 1;
  await requestBackendJson(
    '/filter-extractions/' + encodeURIComponent(normalizedReportId),
    {method: 'DELETE'},
  );
  invalidateReferenceMakeupExtractionReport(normalizedReportId);
  await forgetReferenceExtractionReport(normalizedReportId);
}

export async function fetchReferenceMakeupExtractionReports({
  limit = 20,
  offset = 0,
  timeoutMs,
}: {
  limit?: number;
  offset?: number;
  timeoutMs?: number;
} = {}): Promise<ReferenceMakeupExtractionReportHistoryItem[]> {
  try {
    const response = await requestBackendJson<unknown>(
      `/filter-extractions?limit=${limit}&offset=${offset}`,
      {timeoutMs},
    );
    const normalizedResponse = camelizeBackendValue(
      response,
    ) as ListFilterExtractionReportsResponse;
    if (!Array.isArray(normalizedResponse.reports)) {
      throw new BackendApiError(
        '메이크업 추출 보고서 목록 응답이 올바르지 않아요.',
        502,
        'FILTER_EXTRACTION_REPORT_LIST_INVALID',
      );
    }

    return normalizedResponse.reports.flatMap(report => {
      const mappedReport = mapCompletedFilterExtractionReport(report);
      return mappedReport ? [mappedReport] : [];
    });
  } catch (primaryError) {
    try {
      return await fetchReferenceMakeupExtractionReportsFromNotifications({
        limit,
        offset,
        timeoutMs,
      });
    } catch (fallbackError) {
      throw new BackendApiError(
        '메이크업 추출 보고서 목록을 불러오지 못했어요. 다시 시도해 주세요.',
        503,
        'FILTER_EXTRACTION_REPORT_LIST_UNAVAILABLE',
        {
          fallbackReason:
            fallbackError instanceof Error ? fallbackError.name : typeof fallbackError,
          primaryReason:
            primaryError instanceof Error ? primaryError.name : typeof primaryError,
        },
      );
    }
  }
}

async function fetchReferenceMakeupExtractionReportsFromNotifications({
  limit,
  offset,
  timeoutMs,
}: {
  limit: number;
  offset: number;
  timeoutMs?: number;
}): Promise<ReferenceMakeupExtractionReportHistoryItem[]> {
  const notificationLimit = Math.min(100, Math.max(50, limit + offset));
  const [storedResult, notificationResult] = await Promise.allSettled([
    getStoredReferenceExtractionReports(),
    requestBackendJson<FilterExtractionNotificationListResponse>(
      `/notifications?limit=${notificationLimit}&offset=0`,
      {timeoutMs},
    ),
  ]);
  const storedReports = storedResult.status === 'fulfilled' ? storedResult.value : [];
  const notifications =
    notificationResult.status === 'fulfilled'
    && Array.isArray(notificationResult.value.notifications)
      ? notificationResult.value.notifications
      : null;
  const notificationReportIds = new Set<string>();
  const notificationReports = (notifications ?? []).flatMap(
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
  if (reportCandidates.length === 0) {
    if (notificationResult.status === 'rejected') {
      throw notificationResult.reason;
    }
    if (notifications === null) {
      throw new BackendApiError(
        '메이크업 추출 알림 목록 응답이 올바르지 않아요.',
        502,
        'FILTER_EXTRACTION_NOTIFICATION_LIST_INVALID',
      );
    }
    throw new BackendApiError(
      '기본 보고서 서버가 응답하지 않아 저장된 메이크업 추출 목록을 확인하지 못했어요.',
      503,
      'FILTER_EXTRACTION_FALLBACK_EMPTY',
    );
  }

  const reportResults = await Promise.allSettled(
    selectedReports.map(async storedReport => {
      const response = await requestBackendJson<unknown>(
        '/filter-extractions/' + encodeURIComponent(storedReport.reportId),
        {timeoutMs},
      );
      const normalizedResponse = camelizeBackendValue(
        response,
      ) as GetFilterExtractionReportResponse;
      const mappedReport = mapCompletedFilterExtractionReport(
        normalizedResponse.report,
        storedReport.reportId,
      );

      if (!mappedReport) {
        throw new BackendApiError(
          '완료된 메이크업 추출 보고서를 불러오지 못했어요.',
          409,
          'FILTER_EXTRACTION_REPORT_NOT_COMPLETED',
          {reportId: storedReport.reportId},
        );
      }

      return {
        ...mappedReport,
        createdAt: mappedReport.createdAt || storedReport.createdAt,
      };
    }),
  );
  const reports = reportResults.flatMap(result =>
    result.status === 'fulfilled' ? [result.value] : [],
  );

  if (selectedReports.length > 0 && reports.length === 0) {
    const firstFailure = reportResults.find(result => result.status === 'rejected');
    if (firstFailure?.status === 'rejected') {
      throw firstFailure.reason;
    }
  }

  return reports;
}

export async function runReferenceMakeupExtraction(
  photo: ReferenceMakeupPhoto,
  onProgress?: (update: MakeupExtractionProgressUpdate) => void,
  options: ReferenceMakeupExtractionRunOptions = {},
): Promise<ReferenceMakeupExtractionRunResult> {
  const operationSequence = ++referenceMakeupExtractionOperationSequence;
  const {signal} = options;
  const assertCurrent = () =>
    assertReferenceMakeupExtractionOperationIsCurrent(operationSequence, signal);
  const emitProgress = (update: MakeupExtractionProgressUpdate) => {
    assertCurrent();
    onProgress?.(update);
  };
  const hasBackendApiBaseUrl = Boolean(getBackendApiBaseUrl());

  assertCurrent();
  emitProgress({activeStepId: 'reference-read', phase: 'queued', progress: 0.03});

  if (!hasBackendApiBaseUrl) {
    throw new BackendApiError(
      '메이크업 추출 서버 주소가 설정되지 않았어요.',
      503,
      'FILTER_EXTRACTION_API_REQUIRED',
    );
  }

  const photoUri = resolveReferencePhotoUri(photo);

  if (!photoUri) {
    throw new BackendApiError(
      '선택한 사진을 불러오지 못했어요. 다른 사진을 선택해 주세요.',
      400,
      'FILTER_EXTRACTION_PHOTO_REQUIRED',
      {photoId: photo.id},
    );
  }

  try {
    emitProgress({activeStepId: 'reference-read', phase: 'uploading', progress: 0.1});

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
    assertCurrent();

    emitProgress({activeStepId: 'core-points', phase: 'uploaded', progress: 0.24});
    emitProgress({activeStepId: 'area-guides', phase: 'analyzing', progress: 0.46});

    const startedAt = Date.now();

    const response = await requestBackendJson<unknown>(
      '/filter-extractions/analyze',
      {
        body: {
          photoCaptureId: upload.photoCaptureId,
          referenceImageId: photo.id,
          resultMediaId: upload.mediaId,
          runAi: true,
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
        signal,
        timeoutMs: 30000,
      },
    );
    assertCurrent();
    const createResponse = camelizeBackendValue(
      response,
    ) as CreateFilterExtractionJobResponse;
    const reportId = createResponse.job.id?.trim() || '';

    if (!reportId) {
      throw new BackendApiError(
        '메이크업 추출 작업 번호를 받지 못했어요.',
        502,
        'FILTER_EXTRACTION_REPORT_ID_REQUIRED',
      );
    }

    const normalizedResponse = await waitForCompleteFilterExtractionJob(
      createResponse.job,
      onProgress,
      startedAt,
      signal,
      assertCurrent,
    );
    assertCurrent();

    emitProgress({activeStepId: 'product-criteria', phase: 'products', progress: 0.86});

    const extractedMakeupLook = parseBackendExtractionLook(
      normalizedResponse.extractedMakeupLook,
      photo,
    );

    if (!extractedMakeupLook) {
      throw new BackendApiError(
        '메이크업 추출 결과가 완전하지 않아요. 다시 시도해 주세요.',
        502,
        'FILTER_EXTRACTION_RESULT_INVALID',
        {reportId},
      );
    }

    const nextData: ReferenceMakeupExtractionData = {
      createdAt: createResponse.job.createdAt?.trim() || undefined,
      reportId,
      photos: [photo],
      loadingSteps: normalizedResponse.loadingSteps ?? referenceMakeupExtractionMock.loadingSteps,
      extractedMakeupLook,
    };

    await commitReferenceMakeupExtractionResult({
      assertCurrent,
      data: nextData,
      notify: true,
      reportId,
    });
    emitProgress({activeStepId: 'ar-filter-ready', phase: 'complete', progress: 1});

    console.info('[aura:reference-extraction] analyze:success', {
      aiStatus: normalizedResponse.aiStatus,
      areaGuideCount: nextData.extractedMakeupLook.areaGuides.length,
      productSource: normalizedResponse.productSource,
      title: nextData.extractedMakeupLook.title,
    });

    return {data: nextData, reportId};
  } catch (error) {
    console.info('[aura:reference-extraction] analyze:failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
