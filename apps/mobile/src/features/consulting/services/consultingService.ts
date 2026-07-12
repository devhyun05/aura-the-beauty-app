import {
  getBackendApiBaseUrl,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import {prefetchImageSources} from '../../../shared/services/imageCacheService';
import {getMyPageProfileSummary} from '../../../shared/services/profileService';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {
  ConsultingBookingDay,
  ConsultingCallJoinResult,
  ConsultingCallLanguageCode,
  ConsultingCallState,
  ConsultingCaptionTranslation,
  ConsultingCallTranscription,
  ConsultingBookingDraft,
  ConsultingCategory,
  ConsultingDurationOption,
  ConsultingExpert,
  ConsultingExpertReview,
  ConsultingRecord,
  ConsultingReviewDraft,
  ConsultingSessionMode,
  ConsultingSummary,
} from '../types';

export type ConsultingHomeData = {
  categories: readonly ConsultingCategory[];
  experts: readonly ConsultingExpert[];
  activeRecord: ConsultingRecord | null;
  activeRecords: readonly ConsultingRecord[];
};

export type ConsultingTextMessageDelivery = {
  id: string;
  sentAt: string;
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
// Coercion helpers guard against incomplete API fields without inventing
// consultant profiles or pricing.
// ---------------------------------------------------------------------------
function normalizeSessionMode(value: unknown): ConsultingSessionMode {
  return value === 'offline' ? 'offline' : 'online';
}

function coerceDuration(raw: any, index: number): ConsultingDurationOption {
  const onlinePrice = Number(raw?.prices?.online ?? raw?.onlinePrice ?? raw?.price ?? 0);
  const offlinePrice = Number(
    raw?.prices?.offline ?? raw?.offlinePrice ?? onlinePrice,
  );

  return {
    id: String(raw?.id ?? `d${index}`),
    label: String(raw?.label ?? ''),
    minutes: Number(raw?.minutes ?? 0),
    price: onlinePrice,
    prices: {
      online: onlinePrice,
      offline: offlinePrice,
    },
    description: String(raw?.description ?? ''),
    recommended: Boolean(raw?.recommended),
  };
}

function coerceExpert(raw: any): ConsultingExpert {
  const name = String(raw?.name ?? '').trim();
  const rawAvatarTone = raw?.avatarTone;
  const avatarTone: ConsultingExpert['avatarTone'] =
    rawAvatarTone === 'sand' || rawAvatarTone === 'mauve'
      ? rawAvatarTone
      : 'rose';

  return {
    id: String(raw?.id ?? ''),
    name,
    title: String(raw?.title ?? ''),
    signatureLine: String(raw?.signatureLine ?? ''),
    initials: String(raw?.initials ?? (name.slice(-2) || 'A')),
    avatarTone,
    imageUrl: raw?.imageUrl ? String(raw.imageUrl) : undefined,
    studioName: raw?.studioName ? String(raw.studioName) : undefined,
    careerYears: Number(raw?.careerYears ?? 0),
    rating: Number(raw?.rating ?? 0),
    reviewCount: Number(raw?.reviewCount ?? 0),
    sessionCount: Number(raw?.sessionCount ?? 0),
    rebookRate: Number(raw?.rebookRate ?? 0),
    responseMinutes: Number(raw?.responseMinutes ?? 0),
    tags: arr<string>(raw?.tags, []),
    intro: String(raw?.intro ?? ''),
    careerHistory: arr(raw?.careerHistory, []),
    certifications: arr<string>(raw?.certifications, []),
    availabilityNote: String(raw?.availabilityNote ?? ''),
    categoryIds: arr(raw?.categoryIds, []),
    durations: (arr<any>(raw?.durations, []) as any[]).map(coerceDuration),
    reviews: arr<ConsultingExpertReview>(raw?.reviews, []),
  };
}

function coerceRecord(raw: any): ConsultingRecord {
  const preferredContactMethod =
    raw?.preferredContactMethod === 'call'
      ? 'call'
      : raw?.preferredContactMethod === 'sms'
        ? 'sms'
        : null;
  const rawSessionMode = raw?.sessionMode ?? raw?.session_mode;
  const sessionMode = rawSessionMode == null
    ? null
    : normalizeSessionMode(rawSessionMode);
  const estimatedPrice = Number(
    raw?.estimatedPrice ?? raw?.estimated_price ?? raw?.price,
  );
  const rawLastExpertMessageAt =
    raw?.lastExpertMessageAt ?? raw?.last_expert_message_at;

  return {
    id: String(raw?.id ?? ''),
    conversationId: raw?.conversationId ? String(raw.conversationId) : undefined,
    customerLeftAt: raw?.customerLeftAt ? String(raw.customerLeftAt) : null,
    expertLeftAt: raw?.expertLeftAt ? String(raw.expertLeftAt) : null,
    expertId: String(raw?.expertId ?? ''),
    durationId: raw?.durationId ? String(raw.durationId) : undefined,
    dayId: raw?.dayId ? String(raw.dayId) : null,
    slotId: raw?.slotId ? String(raw.slotId) : null,
    status: (raw?.status ?? 'requested') as ConsultingRecord['status'],
    categoryLabel: String(raw?.categoryLabel ?? ''),
    dateLabel: String(raw?.dateLabel ?? ''),
    durationLabel: String(raw?.durationLabel ?? ''),
    sessionMode,
    estimatedPrice: Number.isFinite(estimatedPrice) ? estimatedPrice : null,
    sharedReportIds: arr<string>(raw?.sharedReportIds, []),
    reviewId: raw?.reviewId ? String(raw.reviewId) : null,
    summary: raw?.summary ? (raw.summary as ConsultingSummary) : undefined,
    contactName: raw?.contactName ? String(raw.contactName) : null,
    contactPhone: raw?.contactPhone ? String(raw.contactPhone) : null,
    preferredContactMethod,
    lastExpertMessageAt:
      rawLastExpertMessageAt == null ? null : String(rawLastExpertMessageAt),
  };
}

function coerceTextMessageDelivery(raw: unknown): ConsultingTextMessageDelivery | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as {id?: unknown; sentAt?: unknown};
  if (typeof value.id !== 'string' || !value.id || typeof value.sentAt !== 'string') {
    return null;
  }
  return {id: value.id, sentAt: value.sentAt};
}

function withDraftReservationDetails(
  record: ConsultingRecord,
  draft: ConsultingBookingDraft,
): ConsultingRecord {
  return {
    ...record,
    estimatedPrice: record.estimatedPrice ?? draft.estimatedPrice,
    sessionMode: record.sessionMode ?? draft.sessionMode,
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

function coerceCallLanguageCode(value: unknown): ConsultingCallLanguageCode | null {
  return value === 'ko-KR' || value === 'en-US' ? value : null;
}

function coerceCallTranscription(raw: any): ConsultingCallTranscription {
  const mode = raw?.mode === 'identify' ? 'identify' : 'fixed';
  return {
    enabled: Boolean(raw?.enabled),
    translationEnabled: Boolean(raw?.translationEnabled),
    status:
      raw?.status === 'starting' ||
      raw?.status === 'active' ||
      raw?.status === 'stopping' ||
      raw?.status === 'stopped' ||
      raw?.status === 'failed'
        ? raw.status
        : 'disabled',
    mode,
    languageCode: coerceCallLanguageCode(raw?.languageCode),
    customerLanguageCode: coerceCallLanguageCode(raw?.customerLanguageCode),
    expertLanguageCode: coerceCallLanguageCode(raw?.expertLanguageCode),
  };
}

function coerceCallState(raw: any, bookingId: string): ConsultingCallState {
  const status = raw?.status;
  return {
    callSessionId: raw?.callSessionId ? String(raw.callSessionId) : null,
    bookingId: String(raw?.bookingId ?? bookingId),
    provider: 'chime',
    providerMeetingId: raw?.providerMeetingId ? String(raw.providerMeetingId) : null,
    mediaRegion: raw?.mediaRegion ? String(raw.mediaRegion) : null,
    status:
      status === 'created' ||
      status === 'active' ||
      status === 'ended' ||
      status === 'failed'
        ? status
        : 'not_started',
    startedAt: raw?.startedAt ? String(raw.startedAt) : null,
    endedAt: raw?.endedAt ? String(raw.endedAt) : null,
    chimeEnabled: Boolean(raw?.chimeEnabled),
    transcription: coerceCallTranscription(raw?.transcription),
  };
}

function coerceCallJoinResult(raw: any, bookingId: string): ConsultingCallJoinResult | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const languageCode =
    coerceCallLanguageCode(raw?.participant?.languageCode) ??
    coerceCallLanguageCode(raw?.participantLanguageCode) ??
    'ko-KR';
  const participantType = raw?.participant?.type ?? raw?.participantType;
  return {
    callSessionId: String(raw.callSessionId ?? ''),
    bookingId: String(raw.bookingId ?? bookingId),
    participant: {
      id: String(raw?.participant?.id ?? ''),
      type: participantType === 'partner' || participantType === 'expert' ? 'partner' : 'customer',
      languageCode,
    },
    meeting: raw?.meeting && typeof raw.meeting === 'object' ? raw.meeting : {},
    attendee: raw?.attendee && typeof raw.attendee === 'object' ? raw.attendee : {},
    transcription: coerceCallTranscription(raw?.transcription),
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

function isActiveRecordStatus(status: ConsultingRecord['status']): boolean {
  return (
    status === 'requested' ||
    status === 'contacting' ||
    status === 'confirmed' ||
    status === 'scheduled' ||
    status === 'in_progress'
  );
}

function activeRecordsFrom(
  records: readonly ConsultingRecord[],
): readonly ConsultingRecord[] {
  return records.filter(record => isActiveRecordStatus(record.status));
}

function upsertCachedBooking(record: ConsultingRecord): void {
  const current = bookingsCache?.data ?? [];
  const next = [
    record,
    ...current.filter(item => item.id !== record.id),
  ];
  cacheBookings(next);

  if (isActiveRecordStatus(record.status)) {
    const activeRecords = activeRecordsFrom(next);
    homeCache = homeCache
      ? {
          createdAt: Date.now(),
          data: {
            ...homeCache.data,
            activeRecord: activeRecords[0] ?? record,
            activeRecords,
          },
        }
      : homeCache;
  } else if (homeCache?.data.activeRecord?.id === record.id) {
    const activeRecords = activeRecordsFrom(next);
    homeCache = {
      createdAt: Date.now(),
      data: {
        ...homeCache.data,
        activeRecord: activeRecords[0] ?? null,
        activeRecords,
      },
    };
  }
}

function removeCachedBooking(bookingId: string): void {
  if (!bookingsCache) {
    return;
  }

  cacheBookings(bookingsCache.data.filter(record => record.id !== bookingId));

  if (homeCache?.data.activeRecord?.id === bookingId) {
    const activeRecords = activeRecordsFrom(bookingsCache.data);
    homeCache = {
      createdAt: Date.now(),
      data: {
        ...homeCache.data,
        activeRecord: activeRecords[0] ?? null,
        activeRecords,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getConsultingHome(): Promise<ConsultingHomeData> {
  const empty: ConsultingHomeData = {
    categories: [],
    experts: [],
    activeRecord: null,
    activeRecords: [],
  };
  if (!hasBackend()) {
    return empty;
  }
  if (isFresh(homeCache)) {
    warmExpertImages(homeCache.data.experts);
    return homeCache.data;
  }
  try {
    const res = await requestBackendJson<{
      categories?: unknown;
      experts?: unknown;
      activeRecord?: unknown;
      activeRecords?: unknown;
      upcomingRecord?: unknown;
      upcomingRecords?: unknown;
    }>('/consulting/home');
    const activeRecord = res.activeRecord ?? res.upcomingRecord;
    const activeRecords = (arr<any>(
      res.activeRecords ?? res.upcomingRecords,
      activeRecord ? [activeRecord] : [],
    ) as any[]).map(coerceRecord);
    const home = {
      categories: arr<ConsultingCategory>(res.categories, []),
      experts: (arr<any>(res.experts, []) as any[]).map(coerceExpert),
      activeRecord: activeRecord
        ? coerceRecord(activeRecord)
        : activeRecords[0] ?? null,
      activeRecords,
    };
    homeCache = {createdAt: Date.now(), data: home};
    cacheExperts(home.experts);
    return home;
  } catch (error) {
    logFallback('home', error);
    return empty;
  }
}

export async function getConsultingExperts(
  categoryId?: string | null,
): Promise<readonly ConsultingExpert[]> {
  if (!hasBackend()) {
    return [];
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
      (arr<any>(res.experts, []) as any[]).map(coerceExpert),
      categoryId,
    );
  } catch (error) {
    logFallback('experts', error);
    return [];
  }
}

export async function getConsultingExpert(
  expertId: string,
): Promise<ConsultingExpert | null> {
  if (!hasBackend()) {
    return null;
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
    return res.expert ? coerceExpert(res.expert) : null;
  } catch (error) {
    logFallback('expert', error);
    return null;
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

export async function getConsultingBookings(
  status?: string,
  options?: {force?: boolean},
): Promise<readonly ConsultingRecord[]> {
  if (!hasBackend()) {
    return [];
  }
  const forceRefresh = options?.force === true;
  if ((!status || status === 'all') && !forceRefresh) {
    if (isFresh(bookingsCache)) {
      return bookingsCache.data;
    }

    if (bookingsRequest) {
      return bookingsRequest;
    }
  } else if (!forceRefresh && isFresh(bookingsCache)) {
    return bookingsCache.data.filter(record => record.status === status);
  }

  const query = status && status !== 'all'
    ? `?status=${encodeURIComponent(status)}`
    : '';
  const request = requestBackendJson<{records?: unknown}>(
    `/consulting/bookings${query}`,
  ).then(res => (arr<any>(res.records, []) as any[]).map(coerceRecord));

  if (!status || status === 'all') {
    bookingsRequest = request
      .then(records => cacheBookings(records))
      .catch(error => {
        logFallback('bookings', error);
        return [] as ConsultingRecord[];
      })
      .finally(() => {
        bookingsRequest = null;
      });
    return await bookingsRequest;
  }

  try {
    return await request;
  } catch (error) {
    logFallback('bookings', error);
    return [];
  }
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

export async function leaveConsultingConversation(bookingId: string): Promise<void> {
  if (!hasBackend()) {
    return;
  }
  await requestBackendJson(`/consulting/bookings/${encodeURIComponent(bookingId)}/chat/leave`, {
    method: 'POST',
  });
  bookingsCache = null;
  bookingsRequest = null;
  homeCache = null;
}

export async function getConsultingCallState(
  bookingId: string,
): Promise<ConsultingCallState | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{call?: unknown}>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}/call`,
    );
    return res.call ? coerceCallState(res.call, bookingId) : null;
  } catch (error) {
    logFallback('call:state', error);
    return null;
  }
}

export async function joinConsultingCall(
  bookingId: string,
  languageCode: ConsultingCallLanguageCode = 'ko-KR',
): Promise<ConsultingCallJoinResult | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{call?: unknown}>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}/call/join`,
      {method: 'POST', body: {languageCode}},
    );
    return coerceCallJoinResult(res.call, bookingId);
  } catch (error) {
    logFallback('call:join', error);
    return null;
  }
}

export async function endConsultingCall(
  bookingId: string,
): Promise<ConsultingCallState | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{call?: unknown}>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}/call/end`,
      {method: 'POST'},
    );
    return res.call ? coerceCallState(res.call, bookingId) : null;
  } catch (error) {
    logFallback('call:end', error);
    return null;
  }
}

export async function startConsultingCallTranscription(
  bookingId: string,
  languageCode: ConsultingCallLanguageCode,
  sourceLanguageCode: ConsultingCallLanguageCode,
): Promise<ConsultingCallState | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{call?: unknown}>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}/call/transcription/start`,
      {
        method: 'POST',
        body: {
          languageCode,
          sourceLanguageCode,
          transcriptionConsentAccepted: true,
        },
      },
    );
    return res.call ? coerceCallState(res.call, bookingId) : null;
  } catch (error) {
    logFallback('call:transcription:start', error);
    return null;
  }
}

export async function translateConsultingCallCaption(
  bookingId: string,
  payload: {
    resultId: string;
    sourceLanguageCode: ConsultingCallLanguageCode;
    content: string;
  },
): Promise<ConsultingCaptionTranslation | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<Partial<ConsultingCaptionTranslation>>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}/call/captions/translate`,
      {method: 'POST', body: payload},
    );
    if (!res.resultId || !res.sourceLanguageCode || !res.targetLanguageCode || !res.translatedContent) {
      return null;
    }
    return {
      resultId: res.resultId,
      sourceLanguageCode: res.sourceLanguageCode,
      targetLanguageCode: res.targetLanguageCode,
      translatedContent: res.translatedContent,
    };
  } catch (error) {
    logFallback('call:caption:translate', error);
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
    const record = res.record
      ? withDraftReservationDetails(coerceRecord(res.record), draft)
      : null;
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
    const review = res.review ? coerceReview(res.review) : null;
    const cachedRecord = bookingsCache?.data.find(record => record.id === bookingId);
    if (review && cachedRecord) {
      upsertCachedBooking({...cachedRecord, reviewId: review.id});
    }
    return review;
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

export async function sendConsultingTextMessage(
  bookingId: string,
  payload: {body: string; clientMessageId: string},
): Promise<ConsultingTextMessageDelivery> {
  if (!hasBackend()) {
    throw new Error('상담 메시지 서버에 연결되어 있지 않아요.');
  }
  const response = await requestBackendJson<{message?: unknown}>(
    `/consulting/bookings/${encodeURIComponent(bookingId)}/messages`,
    {
      body: payload,
      method: 'POST',
    },
  );
  const message = coerceTextMessageDelivery(response.message);
  if (!message) {
    throw new Error('메시지 전송 결과를 확인하지 못했어요.');
  }
  return message;
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
    const record = res.record
      ? withDraftReservationDetails(coerceRecord(res.record), draft)
      : null;
    if (record) {
      upsertCachedBooking(record);
    }
    return record;
  } catch (error) {
    logFallback('booking:update', error);
    return null;
  }
}
