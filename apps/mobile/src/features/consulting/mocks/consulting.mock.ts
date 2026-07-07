import type {
  ConsultingBookingDay,
  ConsultingCategory,
  ConsultingConcern,
  ConsultingExpert,
  ConsultingMembershipPlan,
  ConsultingRecord,
  ConsultingSharedReport,
  ConsultingSummary,
} from '../types';

const consultingCdnBaseUrl = (
  process.env.EXPO_PUBLIC_CDN_BASE_URL?.trim().replace(/\/+$/, '') ??
  'https://d3t1pbvtir1lj.cloudfront.net'
);

function consultingImageUrl(fileName: string): string {
  return `${consultingCdnBaseUrl}/uploads/optimized/consulting/${fileName}`;
}

export const consultingCategories: readonly ConsultingCategory[] = [
  {
    id: 'personalColor',
    title: '퍼스널컬러 진단',
    description: '내 톤이 헷갈릴 때',
    icon: 'palette',
  },
  {
    id: 'makeupClinic',
    title: '메이크업 클리닉',
    description: 'AI 피드백 심화 상담',
    icon: 'brush',
  },
  {
    id: 'lipColor',
    title: '패션 · 골격 진단',
    description: '어울리는 옷 스타일',
    icon: 'sparkles',
  },
  {
    id: 'hairStyle',
    title: '헤어 · 스타일',
    description: '이미지 전체 코디',
    icon: 'scissors',
  },
];

export const consultingExperts: readonly ConsultingExpert[] = [
  {
    id: 'exp_sea',
    name: '김세아',
    title: '메이크업 아티스트',
    signatureLine: '진단으로 끝나지 않는, 손에 잡히는 메이크업 처방',
    initials: '세아',
    avatarTone: 'rose',
    imageUrl: consultingImageUrl('expert-sea.jpg'),
    studioName: 'AURA 성수 메이크업 스튜디오',
    careerYears: 12,
    rating: 4.9,
    reviewCount: 128,
    sessionCount: 1024,
    rebookRate: 87,
    responseMinutes: 30,
    tags: ['여름 쿨 전문', '데일리 메이크업', '웨딩', '퍼스널컬러 처방'],
    intro:
      'AI 진단 결과를 함께 보며 톤을 확정하고, 지금 화장에서 딱 한 가지만 바꿔도 달라지는 포인트를 짚어드려요. 상담이 끝나면 바로 따라 할 수 있는 단계별 처방 노트를 남겨드립니다.',
    careerHistory: [
      {id: 'c1', period: '2020 — 현재', role: 'AURA 파트너 수석 컨설턴트'},
      {id: 'c2', period: '2016 — 2020', role: '뷰티 아카데미 메이크업 강사'},
      {id: 'c3', period: '2013 — 2016', role: '방송 · 화보 메이크업 아티스트'},
    ],
    certifications: [
      '퍼스널컬러 컨설턴트 1급',
      '메이크업 국가자격 2급',
      '색채심리 지도사',
    ],
    availabilityNote: '평일 저녁 · 주말 오전 상담 가능',
    categoryIds: ['personalColor', 'makeupClinic'],
    durations: [
      {
        id: 'd30',
        label: '30분',
        minutes: 30,
        price: 19000,
        description: '핵심 진단 + 우선 교정',
        recommended: true,
      },
      {
        id: 'd60',
        label: '1시간',
        minutes: 60,
        price: 34000,
        description: '진단 + 실습 + 제품 루틴',
      },
    ],
    reviews: [
      {
        id: 'rv_sea_1',
        author: '지은*',
        category: '퍼스널컬러 진단',
        body: '퍼스널컬러가 계속 애매했는데, 진단부터 어울리는 화장법까지 한 번에 잡아주셨어요. 처방 노트 덕분에 다음 날 바로 적용했어요.',
        rating: 5,
        dateLabel: '6월 28일',
      },
      {
        id: 'rv_sea_2',
        author: '수민*',
        category: '메이크업 클리닉',
        body: '블러셔가 붉게 뜨는 이유가 색이 아니라 위치였다는 걸 알려주셔서 놀랐어요. 30분이 아깝지 않았습니다.',
        rating: 5,
        dateLabel: '6월 21일',
      },
      {
        id: 'rv_sea_3',
        author: '하영*',
        category: '메이크업 클리닉',
        body: '평소 화장이 답답해 보이는 이유를 순서대로 잡아주셔서 다음 날 바로 따라 했어요.',
        rating: 4,
        dateLabel: '6월 12일',
      },
    ],
  },
  {
    id: 'exp_doa',
    name: '정도아',
    title: '퍼스널컬러 컬러리스트',
    signatureLine: '조명이 달라져도 흔들리지 않는 정밀 톤 진단',
    initials: '도아',
    avatarTone: 'mauve',
    imageUrl: consultingImageUrl('expert-doa.jpg'),
    studioName: 'AURA 컬러 랩',
    careerYears: 8,
    rating: 4.9,
    reviewCount: 210,
    sessionCount: 1560,
    rebookRate: 91,
    responseMinutes: 15,
    tags: ['사계절 세분 진단', '컬러 코디', '드레이핑', '베스트 컬러 팔레트'],
    intro:
      '화상 카메라의 조명 편차까지 고려해 여러 각도로 확인하며 톤을 진단해요. 진단 후에는 나만의 베스트 컬러 팔레트와 피해야 할 컬러 리스트를 함께 정리해 드려요.',
    careerHistory: [
      {id: 'c1', period: '2021 — 현재', role: 'AURA 파트너 컬러리스트'},
      {id: 'c2', period: '2018 — 2021', role: '백화점 뷰티 브랜드 컬러 컨설턴트'},
    ],
    certifications: ['컬러리스트 기사', '이미지 컨설팅 전문가'],
    availabilityNote: '평일 오후 · 저녁 상담 가능',
    categoryIds: ['personalColor'],
    durations: [
      {
        id: 'd30',
        label: '30분',
        minutes: 30,
        price: 22000,
        description: '정밀 진단 + 컬러 팔레트',
        recommended: true,
      },
      {
        id: 'd60',
        label: '1시간',
        minutes: 60,
        price: 39000,
        description: '정밀 진단 + 쇼핑 가이드',
      },
    ],
    reviews: [
      {
        id: 'rv_doa_1',
        author: '현지*',
        category: '퍼스널컬러 진단',
        body: '앱 진단이랑 결과가 거의 같았는데, 왜 그런지 이유까지 설명해 주셔서 확신이 생겼어요.',
        rating: 5,
        dateLabel: '7월 1일',
      },
      {
        id: 'rv_doa_2',
        author: '보라*',
        category: '퍼스널컬러 진단',
        body: '피해야 할 컬러 리스트가 진짜 유용해요. 옷 살 때도 계속 보게 돼요.',
        rating: 5,
        dateLabel: '6월 25일',
      },
    ],
  },
  {
    id: 'exp_lian',
    name: '박리안',
    title: '패션 · 이미지 디렉터',
    signatureLine: '얼굴형과 톤을 함께 읽는 스타일 설계',
    initials: '리안',
    avatarTone: 'sand',
    imageUrl: consultingImageUrl('expert-lian.jpg'),
    studioName: 'AURA 청담 이미지 살롱',
    careerYears: 9,
    rating: 4.8,
    reviewCount: 96,
    sessionCount: 720,
    rebookRate: 82,
    responseMinutes: 60,
    tags: ['골격 진단', '패션 스타일링', '얼굴형 분석'],
    intro:
      '얼굴형과 골격, 퍼스널 톤을 함께 고려해 어울리는 옷 실루엣과 헤어 방향을 제안해요. 쇼핑할 때 바로 참고할 수 있는 스타일 가이드를 만들어 드립니다.',
    careerHistory: [
      {id: 'c1', period: '2019 — 현재', role: '청담 헤어살롱 원장'},
      {id: 'c2', period: '2015 — 2019', role: '헤어 디자이너 · 이미지 코치'},
    ],
    certifications: ['미용사(일반) 국가자격', '퍼스널 이미지 코치'],
    availabilityNote: '화 · 목 저녁, 주말 상담 가능',
    categoryIds: ['lipColor', 'hairStyle', 'makeupClinic'],
    durations: [
      {
        id: 'd30',
        label: '30분',
        minutes: 30,
        price: 18000,
        description: '골격 진단 + 스타일 방향',
        recommended: true,
      },
      {
        id: 'd60',
        label: '1시간',
        minutes: 60,
        price: 32000,
        description: '골격 + 헤어 + 쇼핑 가이드',
      },
    ],
    reviews: [
      {
        id: 'rv_lian_1',
        author: '유나*',
        category: '패션 · 골격 진단',
        body: '상체 골격에 맞는 재킷 길이와 네크라인 기준을 잡아주셔서 옷 고르기가 훨씬 쉬워졌어요.',
        rating: 5,
        dateLabel: '6월 30일',
      },
    ],
  },
];

export const consultingBookingDays: readonly ConsultingBookingDay[] = [
  {
    id: '2026-07-07',
    weekday: '월',
    day: 7,
    slots: [
      {id: '18:00', label: '18:00', available: false},
      {id: '18:30', label: '18:30', available: true},
      {id: '19:00', label: '19:00', available: true},
      {id: '19:30', label: '19:30', available: true},
    ],
  },
  {
    id: '2026-07-08',
    weekday: '화',
    day: 8,
    slots: [
      {id: '18:00', label: '18:00', available: true},
      {id: '18:30', label: '18:30', available: true},
      {id: '19:00', label: '19:00', available: false},
      {id: '19:30', label: '19:30', available: true},
      {id: '20:00', label: '20:00', available: true},
    ],
  },
  {
    id: '2026-07-09',
    weekday: '수',
    day: 9,
    slots: [
      {id: '19:00', label: '19:00', available: true},
      {id: '19:30', label: '19:30', available: true},
      {id: '20:00', label: '20:00', available: true},
    ],
  },
  {
    id: '2026-07-10',
    weekday: '목',
    day: 10,
    slots: [
      {id: '18:00', label: '18:00', available: true},
      {id: '18:30', label: '18:30', available: false},
      {id: '19:00', label: '19:00', available: true},
    ],
  },
  {
    id: '2026-07-11',
    weekday: '금',
    day: 11,
    slots: [
      {id: '20:00', label: '20:00', available: true},
      {id: '20:30', label: '20:30', available: true},
    ],
  },
  {
    id: '2026-07-12',
    weekday: '토',
    day: 12,
    slots: [
      {id: '11:00', label: '11:00', available: true},
      {id: '11:30', label: '11:30', available: true},
      {id: '14:00', label: '14:00', available: true},
    ],
  },
];

export const consultingConcerns: readonly ConsultingConcern[] = [
  {id: 'concern_tone', label: '퍼스널컬러가 헷갈려요'},
  {id: 'concern_makeup', label: '메이크업 피드백 심화'},
  {id: 'concern_product', label: '골격에 맞는 옷 스타일'},
  {id: 'concern_hair', label: '헤어 · 스타일 고민'},
];

export const consultingSharedReports: readonly ConsultingSharedReport[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'faceAnalysis',
    label: '얼굴 분석 리포트',
    detail: '여름 쿨 뮤트 · 7월 2일',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'makeupFeedback',
    label: 'AI 메이크업 피드백',
    detail: '데일리 룩 · 82점 · 7월 4일',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'makeupFeedback',
    label: 'AI 메이크업 피드백',
    detail: '오피스 룩 · 88점 · 7월 5일',
  },
];

export const consultingSummary: ConsultingSummary = {
  expertId: 'exp_sea',
  durationLabel: '30분',
  dateLabel: '7월 8일 (화) 오후 6:30',
  notes: [
    {
      id: 'note_diag',
      label: '진단',
      body: '여름 쿨 뮤트로 확정 (라이트 서머와 인접). 채도 낮은 컬러가 가장 잘 어울려요.',
    },
    {
      id: 'note_cheek',
      label: '블러셔',
      body: '광대 안쪽이 아니라 바깥쪽으로 사선을 그리면 얼굴이 붉게 뜨지 않아요.',
    },
    {
      id: 'note_lip',
      label: '립',
      body: '로지 브라운 계열 MLBB 컬러가 가장 잘 어울려요. 채도만 한 단계 낮춰보세요.',
    },
  ],
  products: [
    {
      id: 'prod_lip_1',
      name: '무드 블러 틴트 — 로지 브라운',
      category: '립',
      price: 24000,
      tone: 'rose',
    },
    {
      id: 'prod_cheek_1',
      name: '실키 치크 — 쿨 피치',
      category: '블러셔',
      price: 21000,
      tone: 'mauve',
    },
  ],
};

const pastSummaryDoa: ConsultingSummary = {
  expertId: 'exp_doa',
  durationLabel: '30분',
  dateLabel: '6월 24일 (수) 오후 7:00',
  notes: [
    {
      id: 'note_palette',
      label: '팔레트',
      body: '베스트 컬러는 라벤더 그레이 · 소프트 로즈 · 더스티 블루. 오렌지 계열은 피하는 게 좋아요.',
    },
    {
      id: 'note_base',
      label: '베이스',
      body: '현재 파운데이션이 반 톤 어두워요. 21N보다 21C가 얼굴 톤과 잘 맞아요.',
    },
  ],
  products: [
    {
      id: 'prod_base_1',
      name: '베어 핏 쿠션 — 21C 쿨 아이보리',
      category: '베이스',
      price: 32000,
      tone: 'sand',
    },
  ],
};

export const consultingRecords: readonly ConsultingRecord[] = [
  {
    id: 'rec_upcoming_1',
    expertId: 'exp_sea',
    durationId: 'd30',
    dayId: '2026-07-08',
    slotId: '18:30',
    status: 'upcoming',
    categoryLabel: '퍼스널컬러 진단',
    dateLabel: '7월 8일 (화) 오후 6:30',
    durationLabel: '30분',
    sharedReportIds: ['11111111-1111-4111-8111-111111111111'],
  },
  {
    id: 'rec_done_1',
    expertId: 'exp_doa',
    durationId: 'd30',
    dayId: '2026-06-24',
    slotId: '19:00',
    status: 'completed',
    categoryLabel: '퍼스널컬러 진단',
    dateLabel: '6월 24일 (수) 오후 7:00',
    durationLabel: '30분',
    summary: pastSummaryDoa,
  },
  {
    id: 'rec_done_2',
    expertId: 'exp_lian',
    durationId: 'd30',
    dayId: '2026-06-10',
    slotId: '20:00',
    status: 'completed',
    categoryLabel: '헤어 · 스타일',
    dateLabel: '6월 10일 (수) 오후 8:00',
    durationLabel: '30분',
    summary: {
      expertId: 'exp_lian',
      durationLabel: '30분',
      dateLabel: '6월 10일 (수) 오후 8:00',
      notes: [
        {
          id: 'note_hair',
          label: '헤어',
          body: '턱선 기준 C컬 단발이 얼굴형과 가장 잘 어울려요. 뿌리 볼륨은 유지하세요.',
        },
      ],
      products: [],
    },
  },
];

export const consultingMembershipPlans: readonly ConsultingMembershipPlan[] = [
  {
    id: 'plan_lite',
    name: '라이트',
    tagline: '가볍게 시작하는 뷰티 케어',
    pricePerMonth: 9900,
    benefits: [
      '모든 상담 10% 상시 할인',
      '월 1회 포토 질문권',
      '상담 요약 리포트 무제한 보관',
    ],
  },
  {
    id: 'plan_standard',
    name: '스탠다드',
    tagline: '가장 많이 선택하는 플랜',
    pricePerMonth: 14900,
    originalPricePerMonth: 19900,
    benefits: [
      '모든 상담 20% 상시 할인',
      '월 1회 30분 화상 체크인 포함',
      '전문가 우선 예약',
      '신제품 샘플 박스 분기 1회',
    ],
    badge: '인기',
    highlight: true,
  },
  {
    id: 'plan_premium',
    name: '프리미엄',
    tagline: '나만의 뷰티 디렉터',
    pricePerMonth: 29900,
    benefits: [
      '모든 상담 30% 상시 할인',
      '월 1회 30분 화상 상담 포함',
      '전담 전문가 지정',
      '시즌별 퍼스널 스타일 리포트',
    ],
  },
];

export function findConsultingExpert(
  expertId: string,
): ConsultingExpert | undefined {
  return consultingExperts.find(expert => expert.id === expertId);
}

export function findConsultingExpertOrFirst(
  expertId: string | undefined,
): ConsultingExpert {
  const matched = expertId ? findConsultingExpert(expertId) : undefined;
  return matched ?? consultingExperts[0];
}

export function findConsultingDuration(
  expert: ConsultingExpert,
  durationId: string | undefined,
) {
  const matched = durationId
    ? expert.durations.find(duration => duration.id === durationId)
    : undefined;
  return matched ?? expert.durations[0];
}

export function findConsultingCategory(
  categoryId: string | undefined,
): ConsultingCategory | undefined {
  return consultingCategories.find(category => category.id === categoryId);
}

export function findConsultingRecord(
  recordId: string | undefined,
): ConsultingRecord | undefined {
  return consultingRecords.find(record => record.id === recordId);
}

export function getUpcomingConsultingRecord(): ConsultingRecord | undefined {
  return consultingRecords.find(record => record.status === 'upcoming');
}

export function formatConsultingPrice(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

export function findConsultingBookingDay(dayId: string) {
  return consultingBookingDays.find(day => day.id === dayId);
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
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return `${month}월 ${day}일 (${
    koreanWeekdays[date.getDay()]
  })`;
}

export function formatConsultingSlotLabel(
  dayId: string,
  slotId: string,
): string {
  const day = findConsultingBookingDay(dayId);
  const dayLabel = day
    ? formatIsoConsultingDayLabel(day.id) ?? `${day.day}일 (${day.weekday})`
    : formatIsoConsultingDayLabel(dayId);

  if (!day) {
    return dayLabel ? `${dayLabel} ${slotId}` : slotId;
  }

  return `${dayLabel} ${slotId}`;
}
