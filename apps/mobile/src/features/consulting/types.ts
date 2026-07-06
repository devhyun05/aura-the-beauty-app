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

export type ConsultingPurchaseOptionId = 'single' | 'package3' | 'membership';

export type ConsultingBookingDraft = {
  expertId: string;
  durationId: string;
  dayId: string;
  slotId: string;
  concernId: string | null;
  shareReports: boolean;
  question: string;
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

export type ConsultingRecordStatus = 'upcoming' | 'completed' | 'canceled';

export type ConsultingRecord = {
  id: string;
  expertId: string;
  status: ConsultingRecordStatus;
  categoryLabel: string;
  dateLabel: string;
  durationLabel: string;
  summary?: ConsultingSummary;
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
