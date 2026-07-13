import type {ImageSourcePropType} from 'react-native';

export type ConsultingCategoryId =
  | 'personalColor'
  | 'makeupClinic'
  | 'lipColor'
  | 'hairStyle';

export type ConsultingCategory = {
  id: ConsultingCategoryId;
  title: string;
  description: string;
  icon: 'palette' | 'brush' | 'sparkles' | 'scissors';
};

export type ConsultingDurationOption = {
  id: string;
  label: string;
  minutes: number;
  price: number;
  prices?: {
    online: number;
    offline: number;
  };
  description: string;
  recommended?: boolean;
};

export type ConsultingExpertReview = {
  id: string;
  author: string;
  category: string;
  body: string;
  rating: number;
  dateLabel: string;
};

export type ConsultingCareerItem = {
  id: string;
  period: string;
  role: string;
};

export type ConsultingExpert = {
  id: string;
  name: string;
  title: string;
  signatureLine: string;
  initials: string;
  avatarTone: 'rose' | 'sand' | 'mauve';
  imageSource?: ImageSourcePropType;
  imageUrl?: string;
  studioName?: string;
  careerYears: number;
  rating: number;
  reviewCount: number;
  sessionCount: number;
  rebookRate: number;
  responseMinutes: number;
  tags: readonly string[];
  intro: string;
  careerHistory: readonly ConsultingCareerItem[];
  certifications: readonly string[];
  availabilityNote: string;
  categoryIds: readonly ConsultingCategoryId[];
  durations: readonly ConsultingDurationOption[];
  reviews: readonly ConsultingExpertReview[];
};

export type ConsultingTimeSlot = {
  id: string;
  label: string;
  available: boolean;
};

export type ConsultingBookingDay = {
  id: string;
  weekday: string;
  day: number;
  slots: readonly ConsultingTimeSlot[];
};

export type ConsultingConcern = {
  id: string;
  label: string;
};

export type ConsultingSharedReport = {
  id: string;
  kind: 'faceAnalysis' | 'makeupFeedback';
  label: string;
  detail: string;
};

export type ConsultingPreferredContactMethod = 'sms' | 'call';
export type ConsultingSessionMode = 'online' | 'offline';

export type ConsultingBookingDraft = {
  expertId: string;
  durationId: string;
  sessionMode: ConsultingSessionMode;
  estimatedPrice: number;
  dayId: string;
  slotId: string;
  concernId: string | null;
  shareReports: boolean;
  sharedReportIds: readonly string[];
  question: string;
  contactName: string;
  contactPhone: string;
  preferredContactMethod: ConsultingPreferredContactMethod;
};

export type ConsultingSummaryNote = {
  id: string;
  label: string;
  body: string;
};

export type ConsultingRecommendedProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  tone: string;
};

export type ConsultingSummary = {
  expertId: string;
  durationLabel: string;
  dateLabel: string;
  notes: readonly ConsultingSummaryNote[];
  products: readonly ConsultingRecommendedProduct[];
};

export type ConsultingRecordStatus =
  | 'requested'
  | 'contacting'
  | 'confirmed'
  | 'scheduled'
  | 'in_progress'
  | 'unavailable'
  | 'completed'
  | 'canceled';

export type ConsultingRecord = {
  id: string;
  chatAvailable?: boolean;
  conversationId?: string;
  customerLeftAt?: string | null;
  expertLeftAt?: string | null;
  expertId: string;
  durationId?: string;
  dayId?: string | null;
  slotId?: string | null;
  status: ConsultingRecordStatus;
  categoryLabel: string;
  dateLabel: string;
  durationLabel: string;
  sessionMode?: ConsultingSessionMode | null;
  estimatedPrice?: number | null;
  sharedReportIds?: readonly string[];
  reviewId?: string | null;
  summary?: ConsultingSummary;
  contactName?: string | null;
  contactPhone?: string | null;
  preferredContactMethod?: ConsultingPreferredContactMethod | null;
  /** Latest message sent by the expert, used for the inbox notification badge. */
  lastExpertMessageAt?: string | null;
};

export type ConsultingMembershipPlan = {
  id: string;
  name: string;
  tagline: string;
  pricePerMonth: number;
  originalPricePerMonth?: number;
  benefits: readonly string[];
  badge?: string;
  highlight?: boolean;
};

export type ConsultingReviewDraft = {
  rating: number;
  body: string;
  category?: string;
};

export type ConsultingCallState = {
  callSessionId: string | null;
  bookingId: string;
  provider: 'chime';
  providerMeetingId?: string | null;
  mediaRegion?: string | null;
  status: 'not_started' | 'created' | 'active' | 'ended' | 'failed';
  startedAt?: string | null;
  endedAt?: string | null;
  chimeEnabled: boolean;
};

export type ConsultingCallJoinResult = {
  callSessionId: string;
  bookingId: string;
  participant: {
    id: string;
    type: 'customer' | 'partner';
  };
  meeting: Record<string, unknown>;
  attendee: Record<string, unknown>;
};
