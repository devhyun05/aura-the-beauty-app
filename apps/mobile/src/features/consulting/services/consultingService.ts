import {
  getBackendApiBaseUrl,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import {prefetchImageSources} from '../../../shared/services/imageCacheService';
import {getMyPageProfileSummary} from '../../../shared/services/profileService';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {
  consultingCategories,
  consultingExperts,
  consultingMembershipPlans,
  findConsultingExpertOrFirst,
} from '../mocks/consulting.mock';
import type {
  ConsultingBookingDay,
  ConsultingBookingDraft,
  ConsultingCategory,
  ConsultingDurationOption,
  ConsultingExpert,
  ConsultingExpertReview,
  ConsultingMembershipPlan,
  ConsultingRecord,
  ConsultingReviewDraft,
  ConsultingSummary,
} from '../types';

export type ConsultingHomeData = {
  categories: readonly ConsultingCategory[];
  experts: readonly ConsultingExpert[];
  upcomingRecord: ConsultingRecord | null;
};

function arr<T>(value: unknown, fallback: readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

function logFallback(scope: string, error: unknown): void {
  console.info(`[aura:consulting] ${scope}:fallback`, {
    message: error instanceof Error ? error.message : String(error),
  });
}

// ---------------------------------------------------------------------------
// Coercion helpers — the backend already returns camelCase matching the
// frontend types; these guard against missing/partial fields and fall back to
// the mock so the UI never renders undefined.
// ---------------------------------------------------------------------------
function coerceDuration(raw: any, index: number): ConsultingDurationOption {
  return {
    id: String(raw?.id ?? `d${index}`),
    label: String(raw?.label ?? ''),
    minutes: Number(raw?.minutes ?? 0),
    price: Number(raw?.price ?? 0),
    description: String(raw?.description ?? ''),
    recommended: Boolean(raw?.recommended),
  };
}

function coerceExpert(raw: any): ConsultingExpert {
  const fallback = findConsultingExpertOrFirst(raw?.id);
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const durations = Array.isArray(raw.durations) && raw.durations.length
    ? raw.durations.map(coerceDuration)
    : fallback.durations;
  return {
    id: String(raw.id ?? fallback.id),
    name: String(raw.name ?? fallback.name),
    title: String(raw.title ?? fallback.title),
    signatureLine: String(raw.signatureLine ?? fallback.signatureLine),
    initials: String(raw.initials ?? fallback.initials),
    avatarTone: (raw.avatarTone ?? fallback.avatarTone) as ConsultingExpert['avatarTone'],
    imageSource: fallback.imageSource,
    imageUrl: raw.imageUrl ? String(raw.imageUrl) : fallback.imageUrl,
    studioName: raw.studioName ? String(raw.studioName) : fallback.studioName,
    careerYears: Number(raw.careerYears ?? fallback.careerYears),
    rating: Number(raw.rating ?? fallback.rating),
    reviewCount: Number(raw.reviewCount ?? fallback.reviewCount),
    sessionCount: Number(raw.sessionCount ?? fallback.sessionCount),
    rebookRate: Number(raw.rebookRate ?? fallback.rebookRate),
    responseMinutes: Number(raw.responseMinutes ?? fallback.responseMinutes),
    tags: arr(raw.tags, fallback.tags),
    intro: String(raw.intro ?? fallback.intro),
    careerHistory: arr(raw.careerHistory, fallback.careerHistory),
    certifications: arr(raw.certifications, fallback.certifications),
    availabilityNote: String(raw.availabilityNote ?? fallback.availabilityNote),
    categoryIds: arr(raw.categoryIds, fallback.categoryIds),
    durations,
    reviews: arr(raw.reviews, fallback.reviews),
  };
}

function coerceRecord(raw: any): ConsultingRecord {
  return {
    id: String(raw?.id ?? ''),
    expertId: String(raw?.expertId ?? ''),
    durationId: raw?.durationId ? String(raw.durationId) : undefined,
    dayId: raw?.dayId ? String(raw.dayId) : null,
    slotId: raw?.slotId ? String(raw.slotId) : null,
    status: (raw?.status ?? 'upcoming') as ConsultingRecord['status'],
    categoryLabel: String(raw?.categoryLabel ?? ''),
    dateLabel: String(raw?.dateLabel ?? ''),
    durationLabel: String(raw?.durationLabel ?? ''),
    sharedReportIds: arr<string>(raw?.sharedReportIds, []),
    reviewId: raw?.reviewId ? String(raw.reviewId) : null,
    summary: raw?.summary ? (raw.summary as ConsultingSummary) : undefined,
  };
}

function coerceReview(raw: any): ConsultingExpertReview {
  return {
    id: String(raw?.id ?? ''),
    author: String(raw?.author ?? '익명'),
    category: String(raw?.category ?? ''),
    body: String(raw?.body ?? ''),
    rating: Number(raw?.rating ?? 5),
    dateLabel: String(raw?.dateLabel ?? ''),
  };
}

const hasBackend = (): boolean => Boolean(getBackendApiBaseUrl());
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONSULTING_CACHE_TTL_MS = 30000;

type TimedCache<T> = {
  createdAt: number;
  data: T;
};

let homeCache: TimedCache<ConsultingHomeData> | null = null;
let expertsCache: TimedCache<readonly ConsultingExpert[]> | null = null;
const expertsByCategoryCache = new Map<string, TimedCache<readonly ConsultingExpert[]>>();
let bookingsCache: TimedCache<readonly ConsultingRecord[]> | null = null;
let bookingsRequest: Promise<readonly ConsultingRecord[]> | null = null;
let shareableReportsCache: TimedCache<readonly FaceAnalysisReport[]> | null = null;

function isFresh<T>(cache: TimedCache<T> | null): cache is TimedCache<T> {
  return Boolean(cache && Date.now() - cache.createdAt < CONSULTING_CACHE_TTL_MS);
}

function warmExpertImages(experts: readonly ConsultingExpert[]): void {
  prefetchImageSources(
    experts.map(expert =>
      expert.imageUrl ? {uri: expert.imageUrl} : expert.imageSource,
    ),
  );
}

function warmReportImages(reports: readonly FaceAnalysisReport[]): void {
  prefetchImageSources(reports.map(report => report.imageSource));
}

function cacheExperts(
  experts: readonly ConsultingExpert[],
  categoryId?: string | null,
): readonly ConsultingExpert[] {
  const cache = {createdAt: Date.now(), data: experts};

  if (categoryId && categoryId !== 'all') {
    expertsByCategoryCache.set(categoryId, cache);
  } else {
    expertsCache = cache;
  }

  warmExpertImages(experts);

  return experts;
}

function cacheBookings(records: readonly ConsultingRecord[]): readonly ConsultingRecord[] {
  bookingsCache = {createdAt: Date.now(), data: records};
  return records;
}

function upsertCachedBooking(record: ConsultingRecord): void {
  const current = bookingsCache?.data ?? [];
  const next = [
    record,
    ...current.filter(item => item.id !== record.id),
  ];
  cacheBookings(next);

  if (record.status === 'upcoming') {
    homeCache = homeCache
      ? {
          createdAt: Date.now(),
          data: {...homeCache.data, upcomingRecord: record},
        }
      : homeCache;
  }
}

function removeCachedBooking(bookingId: string): void {
  if (!bookingsCache) {
    return;
  }

  cacheBookings(bookingsCache.data.filter(record => record.id !== bookingId));

  if (homeCache?.data.upcomingRecord?.id === bookingId) {
    homeCache = {
      createdAt: Date.now(),
      data: {...homeCache.data, upcomingRecord: null},
    };
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getConsultingHome(): Promise<ConsultingHomeData> {
  const fallback: ConsultingHomeData = {
    categories: consultingCategories,
    experts: consultingExperts,
    upcomingRecord: null,
  };
  if (!hasBackend()) {
    return fallback;
  }
  if (isFresh(homeCache)) {
    warmExpertImages(homeCache.data.experts);
    return homeCache.data;
  }
  try {
    const res = await requestBackendJson<{
      categories?: unknown;
      experts?: unknown;
      upcomingRecord?: unknown;
    }>('/consulting/home');
    const home = {
      categories: arr<ConsultingCategory>(res.categories, consultingCategories),
      experts: (arr<any>(res.experts, consultingExperts) as any[]).map(coerceExpert),
      upcomingRecord: res.upcomingRecord
        ? coerceRecord(res.upcomingRecord)
        : null,
    };
    homeCache = {createdAt: Date.now(), data: home};
    cacheExperts(home.experts);
    return home;
  } catch (error) {
    logFallback('home', error);
    return fallback;
  }
}

export async function getConsultingExperts(
  categoryId?: string | null,
): Promise<readonly ConsultingExpert[]> {
  if (!hasBackend()) {
    return consultingExperts;
  }
  const cacheKey = categoryId && categoryId !== 'all' ? categoryId : null;
  const cached = cacheKey ? expertsByCategoryCache.get(cacheKey) ?? null : expertsCache;

  if (isFresh(cached)) {
    warmExpertImages(cached.data);
    return cached.data;
  }

  try {
    const query = categoryId && categoryId !== 'all'
      ? `?category=${encodeURIComponent(categoryId)}`
      : '';
    const res = await requestBackendJson<{experts?: unknown}>(
      `/consulting/experts${query}`,
    );
    return cacheExperts(
      (arr<any>(res.experts, consultingExperts) as any[]).map(coerceExpert),
      categoryId,
    );
  } catch (error) {
    logFallback('experts', error);
    return consultingExperts;
  }
}

export async function getConsultingExpert(
  expertId: string,
): Promise<ConsultingExpert> {
  const fallback = findConsultingExpertOrFirst(expertId);
  if (!hasBackend()) {
    return fallback;
  }
  if (isFresh(expertsCache)) {
    const cached = expertsCache.data.find(expert => expert.id === expertId);

    if (cached) {
      warmExpertImages([cached]);
      return cached;
    }
  }
  try {
    const res = await requestBackendJson<{expert?: unknown}>(
      `/consulting/experts/${encodeURIComponent(expertId)}`,
    );
    return res.expert ? coerceExpert(res.expert) : fallback;
  } catch (error) {
    logFallback('expert', error);
    return fallback;
  }
}

export async function getConsultingExpertSlots(
  expertId: string,
  durationId?: string | null,
): Promise<readonly ConsultingBookingDay[]> {
  if (!hasBackend()) {
    return [];
  }
  try {
    const query = durationId
      ? `?durationId=${encodeURIComponent(durationId)}`
      : '';
    const res = await requestBackendJson<{days?: unknown}>(
      `/consulting/experts/${encodeURIComponent(expertId)}/slots${query}`,
    );
    return arr<ConsultingBookingDay>(res.days, []);
  } catch (error) {
    logFallback('slots', error);
    return [];
  }
}

export async function getConsultingShareableReports(): Promise<
  readonly FaceAnalysisReport[]
> {
  if (isFresh(shareableReportsCache)) {
    warmReportImages(shareableReportsCache.data);
    return shareableReportsCache.data;
  }

  try {
    const profileSummary = await getMyPageProfileSummary();
    const reports =
      profileSummary.faceAnalysisReports.length > 0
        ? profileSummary.faceAnalysisReports
        : profileSummary.faceAnalysisReport
          ? [profileSummary.faceAnalysisReport]
          : [];

    const shareableReports = reports.filter(report => uuidPattern.test(report.id));
    shareableReportsCache = {createdAt: Date.now(), data: shareableReports};
    warmReportImages(shareableReports);
    return shareableReports;
  } catch (error) {
    logFallback('shareableReports', error);
    return [];
  }
}

export async function getConsultingMembershipPlans(): Promise<
  readonly ConsultingMembershipPlan[]
> {
  if (!hasBackend()) {
    return consultingMembershipPlans;
  }
  try {
    const res = await requestBackendJson<{plans?: unknown}>(
      '/consulting/membership/plans',
    );
    const plans = arr<ConsultingMembershipPlan>(res.plans, consultingMembershipPlans);
    return plans.length > 0 ? plans : consultingMembershipPlans;
  } catch (error) {
    logFallback('plans', error);
    return consultingMembershipPlans;
  }
}

export async function getConsultingBookings(
  status?: string,
): Promise<readonly ConsultingRecord[]> {
  if (!hasBackend()) {
    return [];
  }
  if (!status || status === 'all') {
    if (isFresh(bookingsCache)) {
      return bookingsCache.data;
    }

    if (bookingsRequest) {
      return bookingsRequest;
    }
  } else if (isFresh(bookingsCache)) {
    return bookingsCache.data.filter(record => record.status === status);
  }

  const query = status && status !== 'all'
    ? `?status=${encodeURIComponent(status)}`
    : '';
  const request = requestBackendJson<{records?: unknown}>(
    `/consulting/bookings${query}`,
  )
    .then(res => (arr<any>(res.records, []) as any[]).map(coerceRecord))
    .catch(error => {
      logFallback('bookings', error);
      return [] as ConsultingRecord[];
    });

  if (!status || status === 'all') {
    bookingsRequest = request
      .then(records => cacheBookings(records))
      .finally(() => {
        bookingsRequest = null;
      });
    return await bookingsRequest;
  }

  return await request;
}

export async function getConsultingBooking(
  bookingId: string,
): Promise<ConsultingRecord | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{record?: unknown}>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}`,
    );
    return res.record ? coerceRecord(res.record) : null;
  } catch (error) {
    logFallback('booking', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Writes (best-effort; return null/false on failure so callers can show an error)
// ---------------------------------------------------------------------------
export async function createConsultingBooking(
  draft: ConsultingBookingDraft,
): Promise<ConsultingRecord | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{record?: unknown}>(
      '/consulting/bookings',
      {method: 'POST', body: draft},
    );
    const record = res.record ? coerceRecord(res.record) : null;
    if (record) {
      upsertCachedBooking(record);
    }
    return record;
  } catch (error) {
    logFallback('booking:create', error);
    return null;
  }
}

export async function createConsultingReview(
  bookingId: string,
  draft: ConsultingReviewDraft,
): Promise<ConsultingExpertReview | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{review?: unknown}>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}/reviews`,
      {method: 'POST', body: draft},
    );
    return res.review ? coerceReview(res.review) : null;
  } catch (error) {
    logFallback('review:create', error);
    return null;
  }
}

export async function cancelConsultingBooking(
  bookingId: string,
): Promise<ConsultingRecord | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{record?: unknown}>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}/cancel`,
      {method: 'POST'},
    );
    const record = res.record ? coerceRecord(res.record) : null;
    if (record) {
      upsertCachedBooking(record);
    }
    return record;
  } catch (error) {
    logFallback('booking:cancel', error);
    return null;
  }
}

export async function deleteConsultingBooking(bookingId: string): Promise<boolean> {
  if (!hasBackend()) {
    return false;
  }
  try {
    await requestBackendJson(
      `/consulting/bookings/${encodeURIComponent(bookingId)}`,
      {method: 'DELETE'},
    );
    removeCachedBooking(bookingId);
    return true;
  } catch (error) {
    logFallback('booking:delete', error);
    return false;
  }
}

export async function updateConsultingBooking(
  bookingId: string,
  draft: ConsultingBookingDraft,
): Promise<ConsultingRecord | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{record?: unknown}>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}`,
      {method: 'PATCH', body: draft},
    );
    const record = res.record ? coerceRecord(res.record) : null;
    if (record) {
      upsertCachedBooking(record);
    }
    return record;
  } catch (error) {
    logFallback('booking:update', error);
    return null;
  }
}

export async function createConsultingPayment(payload: {
  kind: 'booking' | 'membership';
  optionId?: string;
  bookingId?: string;
  planId?: string;
  method?: string;
}): Promise<boolean> {
  if (!hasBackend()) {
    return false;
  }
  try {
    await requestBackendJson('/consulting/payments', {
      method: 'POST',
      body: payload,
    });
    return true;
  } catch (error) {
    logFallback('payment', error);
    return false;
  }
}

export async function subscribeConsultingMembership(
  planId: string,
  method?: string,
): Promise<boolean> {
  if (!hasBackend()) {
    return false;
  }
  try {
    await requestBackendJson('/consulting/membership/subscribe', {
      method: 'POST',
      body: {planId, method},
    });
    return true;
  } catch (error) {
    logFallback('membership:subscribe', error);
    return false;
  }
}
