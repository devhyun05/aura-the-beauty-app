/**
 * 체향 프로필 (#7 향수 추천 보강) — 사용자가 자기 피부·발향 성향을 "매번 칩으로 고르는" 대신
 * 한 번만 체감 기반 3문항으로 답하고 영속 저장하기 위한 순수 로직.
 *
 * 왜 체감 설문인가: 대부분의 사용자는 자기 피부타입 용어(건성/지성)나 향의 지속·확산 특성을
 * 정확히 모른다. 그래서 "세안 후 얼굴이 어떤가요?"처럼 스스로 관찰 가능한 경험을 물어
 * 내부 유니온 값(SkinType·FadeFeel·Warmth)으로 매핑한다.
 *
 * 여기서는 이 프로필을 추천 엔진(perfume.ts)이 곱/합으로 쓰는 개인 보정 계수(PersonalFactors)로
 * 환산만 한다. 결정론적 순수 함수라 테스트 가능하고, perfume.ts에서 SkinType 타입만 가져오므로
 * (런타임에 지워짐) 두 모듈 사이에 런타임 순환 의존이 생기지 않는다.
 */
import type {SkinType} from './perfume';

export type Warmth = 'cool' | 'neutral' | 'warm';
export type FadeFeel = 'fast' | 'normal' | 'slow';

/** 저장/전달되는 체향 프로필 한 벌. createdAt은 epoch ms(최초 저장 시각). */
export interface ScentProfile {
  skin: SkinType;
  warmth: Warmth;
  fade: FadeFeel;
  createdAt: number;
}

/** 설문 한 문항의 선택지 하나. id는 해당 필드 유니온 값과 정확히 일치(UI가 그대로 캐스팅). */
export interface ProfileOption {
  id: string;
  label: string;
}

/** 설문 한 문항. key는 이 답이 채우는 프로필 필드. */
export interface ProfileQuestion {
  key: 'skin' | 'fade' | 'warmth';
  question: string;
  options: ProfileOption[];
}

/**
 * 체감 설문 문항 3종 — 순서는 skin → fade → warmth.
 * 각 옵션 id는 반드시 해당 필드의 유니온 값이어야 한다(예: skin의 옵션 id는 'oily'|'normal'|'dry').
 */
export const PROFILE_QUESTIONS: ProfileQuestion[] = [
  {
    key: 'skin',
    question: '세안 후 얼굴이 어떤가요?',
    options: [
      {id: 'oily', label: '금방 번들거려요'},
      {id: 'normal', label: '오후쯤 약간 유분이 돌아요'},
      {id: 'dry', label: '하루 종일 당겨요'},
    ],
  },
  {
    key: 'fade',
    question: '향수를 뿌리면 남들보다…',
    options: [
      {id: 'fast', label: '빨리 사라지는 편이에요'},
      {id: 'normal', label: '비슷한 편이에요'},
      {id: 'slow', label: '오래 남는 편이에요'},
    ],
  },
  {
    key: 'warmth',
    question: '평소 체온 체감은?',
    options: [
      {id: 'warm', label: '더위를 잘 타고 손발이 따뜻해요'},
      {id: 'neutral', label: '보통이에요'},
      {id: 'cool', label: '손발이 찬 편이에요'},
    ],
  },
];

/** 추천 엔진이 지속(곱)·확산(합)에 반영하는 개인 보정 계수. */
export interface PersonalFactors {
  /** 지속 시간 배수(곱) — 1 = 보정 없음. */
  longevity: number;
  /** 확산 가감(합) — 0 = 보정 없음. */
  projection: number;
}

// ── 프로필 → 보정 계수 매핑 ────────────────────────────────────────────────
// fade: 향이 빨리 날아가는 체질일수록 지속을 깎고, 오래 남는 체질이면 늘린다(곱).
const FADE_LONGEVITY: Record<FadeFeel, number> = {fast: 0.85, normal: 1, slow: 1.15};
// warmth: 체온이 높으면 향이 빨리 피어 지속이 살짝 짧고 확산은 강해진다(곱+합).
const WARMTH_LONGEVITY: Record<Warmth, number> = {warm: 0.95, neutral: 1, cool: 1.05};
const WARMTH_PROJECTION: Record<Warmth, number> = {warm: 0.06, neutral: 0, cool: -0.05};

/**
 * 프로필을 개인 보정 계수로 환산. null/undefined(프로필 미설정)이면 무보정 {longevity:1, projection:0}.
 * 지속은 fade·warmth 배수의 곱, 확산은 warmth 가감의 합으로 결합한다.
 */
export const profileFactors = (p?: ScentProfile | null): PersonalFactors => {
  if (!p) return {longevity: 1, projection: 0};
  return {
    longevity: (FADE_LONGEVITY[p.fade] ?? 1) * (WARMTH_LONGEVITY[p.warmth] ?? 1),
    projection: WARMTH_PROJECTION[p.warmth] ?? 0,
  };
};

// ── 요약 라벨 ──────────────────────────────────────────────────────────────
const SKIN_SUMMARY: Record<SkinType, string> = {
  dry: '건성 피부',
  normal: '중성 피부',
  oily: '지성 피부',
};
const FADE_SUMMARY: Record<FadeFeel, string> = {
  fast: '향 빨리 사라짐',
  normal: '향 지속 보통',
  slow: '향 오래 남음',
};
const WARMTH_SUMMARY: Record<Warmth, string> = {
  warm: '열감 높음',
  neutral: '체온 보통',
  cool: '체온 낮음',
};

/** 프로필을 한 줄 요약으로. 예: "지성 피부 · 향 빨리 사라짐 · 열감 높음". */
export const summarizeProfile = (p: ScentProfile): string =>
  `${SKIN_SUMMARY[p.skin]} · ${FADE_SUMMARY[p.fade]} · ${WARMTH_SUMMARY[p.warmth]}`;

// 유니온 값 화이트리스트 — 손상 데이터 판별과 옵션 검증의 단일 출처.
const SKINS: SkinType[] = ['dry', 'normal', 'oily'];
const WARMTHS: Warmth[] = ['cool', 'neutral', 'warm'];
const FADES: FadeFeel[] = ['fast', 'normal', 'slow'];

/** 저장소에서 읽은 임의 값이 온전한 ScentProfile인지 판별(손상 데이터 방어). */
export const isScentProfile = (v: unknown): v is ScentProfile => {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    SKINS.includes(o.skin as SkinType) &&
    WARMTHS.includes(o.warmth as Warmth) &&
    FADES.includes(o.fade as FadeFeel) &&
    typeof o.createdAt === 'number'
  );
};
