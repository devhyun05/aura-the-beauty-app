import type {
  ConsultingConcern,
  ConsultingExpert,
  ConsultingSessionMode,
} from './types';

export const consultingConcerns: readonly ConsultingConcern[] = [
  {id: 'concern_tone', label: '퍼스널컬러가 헷갈려요'},
  {id: 'concern_makeup', label: '메이크업 피드백 심화'},
  {id: 'concern_product', label: '골격에 맞는 옷 스타일'},
  {id: 'concern_hair', label: '헤어 · 스타일 고민'},
];

export function createUnavailableConsultingExpert(
  expertId: string | undefined,
): ConsultingExpert {
  return {
    id: expertId ?? 'unavailable',
    name: '상담사',
    title: '정보를 불러오지 못했어요',
    signatureLine: '',
    initials: 'A',
    avatarTone: 'rose',
    careerYears: 0,
    rating: 0,
    reviewCount: 0,
    sessionCount: 0,
    rebookRate: 0,
    responseMinutes: 0,
    tags: [],
    intro: '',
    careerHistory: [],
    certifications: [],
    availabilityNote: '',
    categoryIds: [],
    durations: [],
    reviews: [],
  };
}

export function resolveConsultingExpert(
  experts: readonly ConsultingExpert[],
  expertId: string | undefined,
): ConsultingExpert {
  return (
    experts.find(expert => expert.id === expertId) ??
    createUnavailableConsultingExpert(expertId)
  );
}

export function findConsultingDuration(
  expert: ConsultingExpert,
  durationId: string | undefined,
): ConsultingExpert['durations'][number] {
  const duration = durationId
    ? expert.durations.find(item => item.id === durationId)
    : expert.durations[0];

  if (!duration) {
    throw new Error(`Consulting duration is unavailable for expert ${expert.id}.`);
  }

  return duration;
}

export function getConsultingDurationPrice(
  duration: ConsultingExpert['durations'][number],
  sessionMode: ConsultingSessionMode,
): number {
  return duration.prices?.[sessionMode] ?? duration.price;
}

export function getConsultingSessionModeLabel(
  sessionMode: ConsultingSessionMode,
): string {
  return sessionMode === 'offline' ? '오프라인' : '온라인';
}

export function formatConsultingPrice(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

const koreanWeekdays = ['일', '월', '화', '수', '목', '금', '토'];

function formatIsoConsultingDayLabel(dayId: string): string | null {
  const parts = dayId.split('-');
  if (parts.length !== 3) {
    return null;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${month}월 ${day}일 (${koreanWeekdays[date.getDay()]})`;
}

export function formatConsultingSlotLabel(
  dayId: string,
  slotId: string,
): string {
  const dayLabel = formatIsoConsultingDayLabel(dayId);
  return dayLabel ? `${dayLabel} ${slotId}` : slotId;
}
