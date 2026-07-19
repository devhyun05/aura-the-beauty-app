import type {Face3DProfile} from '../../features/face-3d/types';
import {
  buildFaceAnalysisMeasurementsPayload,
  buildMeasuredPersonalColorAiPayload,
  parseFaceAnalysisMeasurements,
  type PersonalColorMeasurementInput,
} from '../../features/face-analysis/services/faceAnalysisMeasurements';
import {parseFaceAnalysisV2} from '../../features/face-analysis/services/faceAnalysisV2';
import type {FaceGeometryAnalysisPayload} from '../../features/face-geometry/services/faceGeometryAiPayload';
import type {FaceGeometryResult} from '../../features/face-geometry/types';
import type {FaceVerticalThirdsAnalysisPayload} from '../../features/face-ratio/services/faceVerticalThirdsAiPayload';
import type {FaceVerticalThirdsResult} from '../../features/face-ratio/types';
import type {
  FaceAnalysisImpressionNotes,
  FaceAnalysisMakeupCard,
  FaceAnalysisMakeupGuideline,
  FaceAnalysisRegionNote,
  FaceAnalysisRegionNotes,
  FaceAnalysisReport,
  FaceAnalysisStylingLook,
  FaceAnalysisStylingLookRowCategory,
  FaceAnalysisStylingLooks,
} from '../types/faceAnalysis';
import {
  buildFaceAnalysisRequestPayload,
} from '../../features/face-capture/services/faceCaptureUploadContract';
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

type BackendRegionNote = {insight?: string | null; evidence?: string | null; recommendation?: string | null};
type BackendRegionNotes = Partial<Record<'upper' | 'mid' | 'lower' | 'jaw', BackendRegionNote | string | null>>;
type BackendImpressionNotes = {
  overallMood?: string | null;
  keywords?: string[] | null;
  paragraph?: string | null;
  axes?: unknown;
};
type BackendStylingLookRow = {
  category?: string | null;
  note?: string | null;
  why?: string | null;
};
type BackendStylingLook = {
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  rows?: BackendStylingLookRow[] | null;
};
type BackendStylingLooks = {
  natural?: BackendStylingLook | null;
  glam?: BackendStylingLook | null;
};

type BackendAnalysisResult = {
  avoidedMakeups?: BackendMakeupCard[] | null;
  baseMakeupGuide?: string | null;
  faceShape?: string | null;
  faceAnalysisV2?: unknown;
  makeupGuideline?: BackendMakeupGuideline | null;
  personalColor?: string | null;
  imageGenerationStatus?: string | null;
  recommendedMakeups?: BackendMakeupCard[] | null;
  recommendedMood?: string | null;
  regionNotes?: BackendRegionNotes | null;
  impressionNotes?: BackendImpressionNotes | null;
  stylingLooks?: BackendStylingLooks | null;
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
  // 측정 원본 4축(faceAnalysisMeasurements 계약) — camelize 응답이므로 unknown 으로
  // 받아 parseFaceAnalysisMeasurements 로 깊은 검증·역정규화한다.
  measurements?: unknown;
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
  timeoutMs?: number;
  withRecommendedMakeups?: boolean;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// 고정 5초 대신 5→8→13초 백오프: 서버 분석이 길어질수록 폴링 밀도를 낮춘다.
const ANALYSIS_REPORT_POLL_INTERVALS_MS = [5000, 8000, 13000];
const ANALYSIS_REPORT_POLL_TIMEOUT_MS = 240000;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && uuidPattern.test(value));
}

function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find(value => Boolean(value?.trim()))?.trim();
}

function getBackendCdnBaseUrl(): string | null {
  const explicitCdnBaseUrl = process.env.EXPO_PUBLIC_CDN_BASE_URL?.trim();

  if (explicitCdnBaseUrl) {
    return explicitCdnBaseUrl.replace(/\/+$/, '');
  }

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
    resolveBackendMediaImageUrl(job.previewMedia),
    capture?.cdnUrl,
    request?.previewUrl,
    request?.cdnUrl,
    request?.imageUrl,
    resolveBackendMediaImageUrl(job.sourceMedia),
    capture?.imageUri,
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

// imageSource 는 ImageSourcePropType(배열·번들 number 도 허용)이라 `?.uri` 접근이
// 타입 안전하지 않다 — 문자열 URL 만 필요한 소비자(measurements 복원)용 resolver.
export function resolveFaceAnalysisReportImageUrl(
  job: BackendAnalysisJob,
  capture?: FaceAnalysisCaptureInput | null,
): string | undefined {
  const source = resolveFaceAnalysisReportImageSource(job, capture);

  if (
    source &&
    typeof source === 'object' &&
    !Array.isArray(source) &&
    'uri' in source &&
    typeof source.uri === 'string'
  ) {
    return source.uri;
  }

  return undefined;
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

function parseMakeupGuideline(
  aiGuideline: BackendMakeupGuideline | null | undefined,
): FaceAnalysisMakeupGuideline {
  return {
    brow: firstText(aiGuideline?.brow) ?? '',
    blush: firstText(aiGuideline?.blush) ?? '',
    highlight: firstText(aiGuideline?.highlight) ?? '',
    eyeshadow: firstText(aiGuideline?.eyeshadow) ?? '',
    eyeliner: firstText(aiGuideline?.eyeliner) ?? '',
    lip: firstText(aiGuideline?.lip) ?? '',
  };
}

const STYLING_LOOK_ROW_CATEGORIES: readonly FaceAnalysisStylingLookRowCategory[] = [
  'base',
  'brow',
  'eyeshadow',
  'eyeliner',
  'blush',
  'lip',
];

function isStylingLookRowCategory(value: unknown): value is FaceAnalysisStylingLookRowCategory {
  return (
    typeof value === 'string' &&
    (STYLING_LOOK_ROW_CATEGORIES as readonly string[]).includes(value)
  );
}

// 이 필드들은 구버전 보고서에는 없다(추가 이전 생성분) — 없거나 형태가 깨지면
// undefined 로 강등해 어댑터가 섹션을 숨기게 한다(지어내지 않음).
function toRegionNote(
  raw: BackendRegionNote | string | null | undefined,
): FaceAnalysisRegionNote | undefined {
  if (raw && typeof raw === 'object') {
    const insight = firstText(raw.insight);
    if (!insight) return undefined;
    return {
      insight,
      evidence: firstText(raw.evidence) ?? '',
      recommendation: firstText(raw.recommendation) ?? '',
    };
  }
  const insight = firstText(typeof raw === 'string' ? raw : undefined);
  return insight ? {insight, evidence: '', recommendation: ''} : undefined;
}

function parseRegionNotes(value: BackendRegionNotes | null | undefined): FaceAnalysisRegionNotes | undefined {
  const upper = toRegionNote(value?.upper);
  const mid = toRegionNote(value?.mid);
  const lower = toRegionNote(value?.lower);
  const jaw = toRegionNote(value?.jaw);
  return upper && mid && lower && jaw ? {upper, mid, lower, jaw} : undefined;
}

function parseImpressionNotes(
  value: BackendImpressionNotes | null | undefined,
): FaceAnalysisImpressionNotes | undefined {
  const overallMood = firstText(value?.overallMood);
  const paragraph = firstText(value?.paragraph);
  const keywords = firstStringArray(value?.keywords ?? null, []);
  const rawAxes = Array.isArray((value as {axes?: unknown})?.axes) ? (value as {axes: unknown[]}).axes : [];
  const axes = rawAxes
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .slice(0, 2)
    .map(a => ({
      key: firstText(typeof a.key === 'string' ? a.key : undefined) ?? '',
      leftLabel: firstText(typeof a.leftLabel === 'string' ? a.leftLabel : undefined) ?? '',
      rightLabel: firstText(typeof a.rightLabel === 'string' ? a.rightLabel : undefined) ?? '',
      value: typeof a.value === 'number' && Number.isFinite(a.value) ? Math.max(-1, Math.min(1, a.value)) : 0,
    }))
    .filter(a => a.leftLabel && a.rightLabel);

  return overallMood && paragraph && keywords.length > 0
    ? {overallMood, paragraph, keywords, ...(axes.length === 2 ? {axes} : {})}
    : undefined;
}

function parseStylingLook(value: BackendStylingLook | null | undefined): FaceAnalysisStylingLook | undefined {
  const title = firstText(value?.title);
  const subtitle = firstText(value?.subtitle);
  const description = firstText(value?.description);
  const rows = (value?.rows ?? [])
    .map(row => {
      const category = row?.category;
      const note = firstText(row?.note);
      const why = firstText(row?.why);
      return isStylingLookRowCategory(category) && note
        ? {category, note, why: why ?? ''}
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return title && subtitle && description && rows.length > 0
    ? {title, subtitle, description, rows}
    : undefined;
}

function parseStylingLooks(value: BackendStylingLooks | null | undefined): FaceAnalysisStylingLooks | undefined {
  const natural = parseStylingLook(value?.natural);
  const glam = parseStylingLook(value?.glam);

  return natural && glam ? {natural, glam} : undefined;
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

function mapMakeupCards(
  reportId: string,
  aiCards: BackendMakeupCard[] | null | undefined,
  reportImageSource: FaceAnalysisReport['imageSource'],
): FaceAnalysisMakeupCard[] {
  const normalizedAiCards = Array.isArray(aiCards)
    ? aiCards.filter((card): card is BackendMakeupCard => Boolean(card))
    : [];

  return normalizedAiCards.slice(0, 1).map((aiCard, index) => {
    const generatedImageUrl = resolveMakeupImageUrl(aiCard);

    return {
      id: `${reportId}-ai-makeup-${index + 1}`,
      title: firstText(aiCard.title) ?? '',
      subtitle: firstText(aiCard.subtitle) ?? '',
      description: firstText(aiCard.description) ?? '',
      imageSource: generatedImageUrl
        ? {uri: generatedImageUrl}
        : reportImageSource,
      imageStatus: resolveMakeupImageStatus(aiCard, generatedImageUrl),
      tags: firstStringArray(aiCard.tags, []),
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
  const faceAnalysisV2 = parseFaceAnalysisV2(result?.faceAnalysisV2);
  const guideline = parseMakeupGuideline(result?.makeupGuideline);
  const recommendedMakeup = result?.recommendedMakeups?.[0];
  const regionNotes = parseRegionNotes(result?.regionNotes);
  const impressionNotes = parseImpressionNotes(result?.impressionNotes);
  const hasGuideline = Object.values(guideline).every(value => value.length > 0);
  const hasRegionNotes = Boolean(
    regionNotes &&
      Object.values(regionNotes).every(
        note => note.insight && note.evidence && note.recommendation,
      ),
  );
  // 목록 응답은 SQL(#-)이 faceAnalysisV2 의 perception/consulting 키 자체를 제거한
  // 경량 투영이다 — 키 부재는 "상세 GET 에서 받는 필드"이지 AI 결과 누락이 아니다.
  const rawFaceAnalysisV2 = result?.faceAnalysisV2;
  const isListProjectedV2 =
    typeof rawFaceAnalysisV2 === 'object' &&
    rawFaceAnalysisV2 !== null &&
    !Array.isArray(rawFaceAnalysisV2) &&
    !('perception' in rawFaceAnalysisV2) &&
    !('consulting' in rawFaceAnalysisV2);
  const hasV2AiResult = rawFaceAnalysisV2 == null || isListProjectedV2
    ? true
    : Boolean(faceAnalysisV2?.perception && faceAnalysisV2.consulting);

  return Boolean(
    result &&
      hasV2AiResult &&
      getRecommendedMakeupCount(job) === 1 &&
      firstText(result.faceShape, job.faceShape) &&
      firstText(result.personalColor, job.personalColor) &&
      firstText(result.recommendedMood, job.recommendedMood) &&
      firstText(result.baseMakeupGuide, job.baseMakeupGuide) &&
      firstText(result.shortSummary, job.shortSummary) &&
      firstText(result.summary, job.summary) &&
      firstText(result.skinAnalysisSummary, job.skinAnalysisSummary) &&
      firstText(result.skinType, job.skinType) &&
      firstText(result.toneSummary, job.toneSummary) &&
      firstText(recommendedMakeup?.title) &&
      firstText(recommendedMakeup?.subtitle) &&
      firstText(recommendedMakeup?.description) &&
      hasGuideline &&
      hasRegionNotes &&
      impressionNotes,
  );
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, {once: true});
  });
}

function abortedAnalysisWait(job: BackendAnalysisJob): BackendApiError {
  return new BackendApiError(
    '얼굴 분석 대기를 중단했어요.',
    499,
    'ANALYSIS_WAIT_ABORTED',
    {jobId: job.id ?? null},
  );
}

async function waitForCompleteAnalysisReport(
  initialJob: BackendAnalysisJob,
  capture: FaceAnalysisCaptureInput | null | undefined,
  startedAt: number,
  // 화면 이탈 시 최대 240초짜리 폴링이 백그라운드에 매달리지 않게 하는 중단 신호.
  signal?: AbortSignal,
): Promise<FaceAnalysisReport> {
  let currentJob = initialJob;
  let pollAttempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw abortedAnalysisWait(currentJob);
    }
    const generatedImageCount = getGeneratedMakeupImageCount(currentJob);
    const imageGenerationStatus = getImageGenerationStatus(currentJob);
    const recommendedCount = getRecommendedMakeupCount(currentJob);

    if (hasCompleteBackendReportText(currentJob)) {
      const perceivedMs = Date.now() - startedAt;
      console.info('[aura:analysis] analysis-report:ready', {
        durationMs: perceivedMs,
        generatedImageCount,
        imageGenerationStatus,
        jobId: currentJob.id ?? null,
        recommendedCount,
        status: currentJob.status ?? null,
      });

      // 실험 계측(로컬 전용): 사용자가 실제로 기다린 벽시계 시간을 서버 지표 파일에
      // 남긴다. fire-and-forget — 실패해도 보고서 반환을 막지 않는다.
      if (currentJob.id) {
        void requestBackendJson(
          `/analysis/reports/${currentJob.id}?clientElapsedMs=${perceivedMs}`,
        ).catch(() => undefined);
      }

      return mapBackendJobToFaceAnalysisReport(currentJob, capture);
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
      throw incompleteAnalysisResult(currentJob, 'completeAiResult');
    }

    if (!currentJob.id) {
      throw new Error('Analysis job did not return a report id.');
    }

    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs >= ANALYSIS_REPORT_POLL_TIMEOUT_MS) {
      throw new BackendApiError(
        '얼굴 분석을 완료하지 못했어요. 다시 촬영해 주세요.',
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

    const nextPollMs =
      ANALYSIS_REPORT_POLL_INTERVALS_MS[
        Math.min(pollAttempt, ANALYSIS_REPORT_POLL_INTERVALS_MS.length - 1)
      ];
    pollAttempt += 1;

    console.info('[aura:analysis] analysis-report:wait-images', {
      elapsedMs,
      generatedImageCount,
      imageGenerationStatus,
      jobId: currentJob.id,
      nextPollMs,
      recommendedCount,
      status: currentJob.status ?? null,
    });

    await delay(
      Math.min(nextPollMs, ANALYSIS_REPORT_POLL_TIMEOUT_MS - elapsedMs),
      signal,
    );

    if (signal?.aborted) {
      throw abortedAnalysisWait(currentJob);
    }

    const {report: nextJob} = await requestBackendJson<GetAnalysisReportResponse>(
      '/analysis/reports/' + currentJob.id,
    );

    currentJob = nextJob;
  }
}

function incompleteAnalysisResult(
  job: BackendAnalysisJob,
  missingField: string,
): BackendApiError {
  return new BackendApiError(
    '얼굴 분석을 완료하지 못했어요. 다시 촬영해 주세요.',
    502,
    'FACE_ANALYSIS_RESULT_INCOMPLETE',
    {jobId: job.id ?? null, missingField},
  );
}

function requireAnalysisText(
  job: BackendAnalysisJob,
  field: string,
  ...values: Array<string | null | undefined>
): string {
  const value = firstText(...values);
  if (!value) {
    throw incompleteAnalysisResult(job, field);
  }
  return value;
}

function mapBackendJobToFaceAnalysisReport(
  job: BackendAnalysisJob,
  capture?: FaceAnalysisCaptureInput | null,
): FaceAnalysisReport {
  const result = job.detailPayload?.result ?? {};
  const faceAnalysisV2 = parseFaceAnalysisV2(result.faceAnalysisV2);
  if (!hasCompleteBackendReportText(job)) {
    throw incompleteAnalysisResult(job, 'completeAiResult');
  }

  const reportId = requireAnalysisText(job, 'id', job.id);
  const reportImageSource = resolveFaceAnalysisReportImageSource(job, capture);
  if (!reportImageSource) {
    throw incompleteAnalysisResult(job, 'imageSource');
  }
  const personalColor = requireAnalysisText(
    job,
    'personalColor',
    result.personalColor,
    job.personalColor,
  );
  const skinType = requireAnalysisText(job, 'skinType', result.skinType, job.skinType);
  const recommendedMood = requireAnalysisText(
    job,
    'recommendedMood',
    result.recommendedMood,
    job.recommendedMood,
  );
  const makeupGuideline = parseMakeupGuideline(result.makeupGuideline);

  return {
    id: reportId,
    analyzedAt: requireAnalysisText(job, 'analyzedAt', job.analyzedAt),
    // 과거 보고서 복원용 측정 원본 — 서버 사진 URL 을 오버레이 이미지로 주입한다.
    measurements: parseFaceAnalysisMeasurements(job.detailPayload?.request?.measurements, {
      imageUrl: resolveFaceAnalysisReportImageUrl(job, capture),
    }),
    faceAnalysisV2,
    baseMakeupGuide: requireAnalysisText(
      job,
      'baseMakeupGuide',
      result.baseMakeupGuide,
      job.baseMakeupGuide,
    ),
    faceShape: requireAnalysisText(job, 'faceShape', result.faceShape, job.faceShape),
    imageSource: reportImageSource,
    makeupGuideline,
    personalColor,
    regionNotes: parseRegionNotes(result.regionNotes),
    impressionNotes: parseImpressionNotes(result.impressionNotes),
    stylingLooks: parseStylingLooks(result.stylingLooks),
    recommendedMakeups: mapMakeupCards(
      reportId,
      result.recommendedMakeups,
      reportImageSource,
    ),
    recommendedMood,
    avoidedMakeups: [],
    reportTitle: requireAnalysisText(job, 'reportTitle', job.reportTitle),
    shortSummary: requireAnalysisText(
      job,
      'shortSummary',
      result.shortSummary,
      job.shortSummary,
    ),
    skinAnalysisSummary: requireAnalysisText(
      job,
      'skinAnalysisSummary',
      result.skinAnalysisSummary,
      job.skinAnalysisSummary,
    ),
    skinType,
    summary: requireAnalysisText(job, 'summary', result.summary, job.summary),
    tags: firstStringArray(result.tags ?? job.tags, []),
    title: requireAnalysisText(job, 'title', job.title),
    toneSummary: requireAnalysisText(
      job,
      'toneSummary',
      result.toneSummary,
      job.toneSummary,
    ),
    environmentLabel: requireAnalysisText(job, 'environmentLabel', job.environmentLabel),
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
    return [];
  }

  const {reports} = await requestBackendJson<ListAnalysisReportsResponse>(
    buildAnalysisReportsPath(options),
    {timeoutMs: options.timeoutMs},
  );

  return reports.flatMap(report => {
    try {
      return [mapBackendJobToFaceAnalysisReport(report)];
    } catch (error) {
      if (
        error instanceof BackendApiError &&
        error.code === 'FACE_ANALYSIS_RESULT_INCOMPLETE'
      ) {
        return [];
      }
      throw error;
    }
  });
};

export const getLatestFaceAnalysisReport =
  async (): Promise<FaceAnalysisReport | null> => {
    if (!getBackendApiBaseUrl()) {
      return null;
    }

    // 목록 응답은 measurements 를 제외해 경량화되므로(백엔드 #- 처리),
    // 최신 1건을 고른 뒤 상세 GET 으로 측정 원본까지 받은 전체본을 돌려준다.
    const reports = await getFaceAnalysisReports({limit: 1});
    const latest = reports[0];

    if (!latest) {
      return null;
    }

    return (await getFaceAnalysisReportById(latest.id)) ?? latest;
  };

export const getFaceAnalysisReportById = async (
  reportId: string,
): Promise<FaceAnalysisReport | null> => {
  if (!getBackendApiBaseUrl()) {
    return null;
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

// 측정 데이터 3-반영 규칙의 저장·복원층 입력 — 원본 Result 4축.
// AI 요약층(faceVerticalThirds/face3d/faceGeometry2d 파라미터)과 별개로
// measurements(원본)와 measuredPersonalColor(AI 요약)를 여기서 함께 만든다.
export type FaceAnalysisOnDeviceMeasurementsInput = {
  face3d: Face3DProfile | null;
  faceGeometry2d: FaceGeometryResult | null;
  faceVerticalThirds: FaceVerticalThirdsResult | null;
  personalColor: PersonalColorMeasurementInput | null;
};

export type FaceAnalysisReportCallbacks = {
  onAnalysisCreated?: (reportId: string) => Promise<void> | void;
};

export async function createFaceAnalysisReportFromCapture(
  capture?: FaceAnalysisCaptureInput | null,
  faceVerticalThirds?: FaceVerticalThirdsAnalysisPayload,
  // ARKit 3D 측정 프로필(정규화 11지표; 구버전 G1은 5지표) — 측정 성공 세션에서만 전달된다.
  face3d?: Face3DProfile,
  // 2D 얼굴 기하 요약 — 산출 성공 세션에서만 전달된다.
  faceGeometry2d?: FaceGeometryAnalysisPayload,
  onDeviceMeasurements?: FaceAnalysisOnDeviceMeasurementsInput,
  callbacks?: FaceAnalysisReportCallbacks,
  // 호출 화면 이탈 시 폴링을 중단하기 위한 신호(없으면 기존 동작 유지).
  signal?: AbortSignal,
): Promise<FaceAnalysisReport> {
  const startedAt = Date.now();
  const hasBackendApiBaseUrl = Boolean(getBackendApiBaseUrl());
  const measuredPersonalColor = buildMeasuredPersonalColorAiPayload(
    onDeviceMeasurements?.personalColor ?? null,
  );

  console.info('[aura:analysis] create-report:start', {
    hasBackendApiBaseUrl,
    hasBucket: Boolean(capture?.bucket),
    hasFace3d: Boolean(onDeviceMeasurements?.face3d),
    hasFaceGeometry2d: Boolean(faceGeometry2d),
    hasFaceVerticalThirds: Boolean(faceVerticalThirds),
    hasMeasuredPersonalColor: Boolean(measuredPersonalColor),
    hasObjectKey: Boolean(capture?.objectKey),
    face3dSchemaVersion: onDeviceMeasurements?.face3d?.schemaVersion ?? null,
    mediaId: capture?.mediaId ?? null,
    photoCaptureId: capture?.photoCaptureId ?? null,
  });

  if (!hasBackendApiBaseUrl) {
    throw new BackendApiError(
      '얼굴 분석 서버에 연결할 수 없어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
      503,
      'ANALYSIS_API_UNAVAILABLE',
    );
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
      requestPayload: buildFaceAnalysisRequestPayload(
        capture,
        faceVerticalThirds,
        face3d,
        faceGeometry2d,
        measuredPersonalColor,
        onDeviceMeasurements
          ? buildFaceAnalysisMeasurementsPayload({
              captureId: capture.photoCaptureId,
              face3d: onDeviceMeasurements.face3d,
              faceGeometry2d: onDeviceMeasurements.faceGeometry2d,
              faceVerticalThirds: onDeviceMeasurements.faceVerticalThirds,
              personalColor: onDeviceMeasurements.personalColor,
            })
          : undefined,
      ),
      runImmediately: true,
      sourceMediaId: capture.mediaId,
      title: 'AI 맞춤 메이크업 분석',
    },
    method: 'POST',
  });
  if (!job.id) {
    throw new Error('Analysis job did not return a report id.');
  }
  await callbacks?.onAnalysisCreated?.(job.id);

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

  return waitForCompleteAnalysisReport(job, capture, startedAt, signal);
}
