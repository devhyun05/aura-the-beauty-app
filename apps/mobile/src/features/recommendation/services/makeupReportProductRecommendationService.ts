import {requestProductBackendJson} from '../../../shared/services/productBackendApi';
import type {
  MakeupReportProductCategory,
  MakeupReportProductResultStatus,
  MakeupReportProductSnapshot,
  MakeupReportProductSnapshotRunStatus,
  MakeupReportProductRecommendations,
  MakeupReportRecommendationReport,
  MakeupReportRecommendationReportsResponse,
} from './makeupReportProductRecommendationTypes';

const DEFAULT_PER_CATEGORY_LIMIT = 6;
const MAX_PER_CATEGORY_LIMIT = 8;
const SNAPSHOT_RUN_STATUSES = new Set<MakeupReportProductSnapshotRunStatus>([
  'pending',
  'processing',
  'ready',
  'partial',
  'failed',
]);
const RESULT_STATUSES = new Set<MakeupReportProductResultStatus>([
  ...SNAPSHOT_RUN_STATUSES,
  'noEligibleProducts',
]);

type MakeupReportProductRequestOptions = {
  signal?: AbortSignal;
  categories?: readonly MakeupReportProductCategory[];
};

type BackendMakeupReportProductRecommendations = Omit<
  MakeupReportProductRecommendations,
  'snapshot' | 'status'
> & {
  status?: unknown;
  snapshot?: Partial<MakeupReportProductSnapshot> | null;
};

function reportTimestamp(report: MakeupReportRecommendationReport): number {
  const value = new Date(report.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function sortMakeupReportsLatestFirst(
  reports: readonly MakeupReportRecommendationReport[],
): MakeupReportRecommendationReport[] {
  return reports
    .filter(report => Boolean(report.reportId.trim()) && report.looks.length > 0)
    .slice()
    .sort((left, right) => reportTimestamp(right) - reportTimestamp(left));
}

export function resolveMakeupReportSelection(
  reports: readonly MakeupReportRecommendationReport[],
  preferredReportId?: string | null,
  currentReportId?: string | null,
): MakeupReportRecommendationReport | null {
  if (reports.length === 0) return null;
  return (preferredReportId
    ? reports.find(report => report.reportId === preferredReportId)
    : undefined)
    ?? (currentReportId
      ? reports.find(report => report.reportId === currentReportId)
      : undefined)
    ?? reports[0];
}

export function buildMakeupReportProductsPath(
  reportId: string,
  lookId?: string | null,
  perCategoryLimit = DEFAULT_PER_CATEGORY_LIMIT,
  categories: readonly MakeupReportProductCategory[] = [],
): string {
  const normalizedReportId = reportId.trim();
  if (!normalizedReportId) throw new Error('추천 보고서를 선택해 주세요.');

  const params = new URLSearchParams();
  const normalizedLookId = lookId?.trim();
  if (normalizedLookId) params.set('lookId', normalizedLookId);
  const normalizedCategories = [...new Set(categories)];
  if (normalizedCategories.length > 0) params.set('categories', normalizedCategories.join(','));
  params.set(
    'perCategoryLimit',
    String(Math.min(MAX_PER_CATEGORY_LIMIT, Math.max(1, Math.round(perCategoryLimit)))),
  );
  return `/products/recommendations/makeup-reports/${encodeURIComponent(normalizedReportId)}?${params.toString()}`;
}

export function buildMakeupReportProductsRefreshPath(
  reportId: string,
  lookId?: string | null,
  categories: readonly MakeupReportProductCategory[] = [],
): string {
  const normalizedReportId = reportId.trim();
  if (!normalizedReportId) throw new Error('추천 보고서를 선택해 주세요.');

  const params = new URLSearchParams();
  const normalizedLookId = lookId?.trim();
  if (normalizedLookId) params.set('lookId', normalizedLookId);
  const normalizedCategories = [...new Set(categories)];
  if (normalizedCategories.length > 0) params.set('categories', normalizedCategories.join(','));
  const query = params.toString();
  return `/products/recommendations/makeup-reports/${encodeURIComponent(normalizedReportId)}/refresh${query ? `?${query}` : ''}`;
}

export function normalizeMakeupReportProductRecommendations(
  response: BackendMakeupReportProductRecommendations,
): MakeupReportProductRecommendations {
  const snapshotStatus = response.snapshot?.status;
  const validSnapshotStatus = typeof snapshotStatus === 'string'
    && SNAPSHOT_RUN_STATUSES.has(snapshotStatus as MakeupReportProductSnapshotRunStatus)
    ? snapshotStatus as MakeupReportProductSnapshotRunStatus
    : null;
  const validResultStatus = typeof response.status === 'string'
    && RESULT_STATUSES.has(response.status as MakeupReportProductResultStatus)
    ? response.status as MakeupReportProductResultStatus
    : null;
  const status = validResultStatus ?? validSnapshotStatus ?? 'ready';
  const runStatus = validSnapshotStatus
    ?? (status === 'noEligibleProducts' ? 'ready' : status);
  return {
    ...response,
    status,
    snapshot: {
      ...response.snapshot,
      status: runStatus,
    },
  };
}

function isRefreshEndpointUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = Number((error as {status?: unknown}).status);
  return status === 404 || status === 405 || status === 501;
}

export async function getMakeupReportRecommendationReports(): Promise<
  MakeupReportRecommendationReport[]
> {
  const response = await requestProductBackendJson<MakeupReportRecommendationReportsResponse>(
    '/products/recommendations/makeup-reports',
  );
  return sortMakeupReportsLatestFirst(Array.isArray(response.reports) ? response.reports : []);
}

export function getMakeupReportProductRecommendations(
  reportId: string,
  lookId?: string | null,
  perCategoryLimit = DEFAULT_PER_CATEGORY_LIMIT,
  options: MakeupReportProductRequestOptions = {},
): Promise<MakeupReportProductRecommendations> {
  return requestProductBackendJson<BackendMakeupReportProductRecommendations>(
    buildMakeupReportProductsPath(reportId, lookId, perCategoryLimit, options.categories),
    {signal: options.signal},
  ).then(normalizeMakeupReportProductRecommendations);
}

export async function refreshMakeupReportProductRecommendations(
  reportId: string,
  lookId?: string | null,
  perCategoryLimit = DEFAULT_PER_CATEGORY_LIMIT,
  options: MakeupReportProductRequestOptions = {},
): Promise<MakeupReportProductRecommendations> {
  try {
    const response = await requestProductBackendJson<BackendMakeupReportProductRecommendations>(
      buildMakeupReportProductsRefreshPath(reportId, lookId, options.categories),
      {method: 'POST', signal: options.signal},
    );
    return normalizeMakeupReportProductRecommendations(response);
  } catch (error) {
    if (!isRefreshEndpointUnavailable(error)) throw error;
    return getMakeupReportProductRecommendations(
      reportId,
      lookId,
      perCategoryLimit,
      options,
    );
  }
}
