/**
 * 헤어 프로필 — 얼굴형·두상(뒤통수·정수리)·모발(결·굵기·숱)처럼 사람마다 다르고
 * 잘 안 변하는 개인 특성을 최초 1회 설문으로 답하고 영속 저장하기 위한 순수 로직.
 * 체향 프로필(scentProfile)·체형 체크(bodyProfile)와 같은 UX 규약.
 *
 * 왜 체감 설문인가: "긴 얼굴형인가요?" 대신 거울 앞에서 스스로 관찰 가능한 특징을
 * 물어 내부 유니온 값으로 매핑한다. 저장하는 것은 설문 원답(=특성 그 자체) —
 * 추천 규칙(hairstyle.ts)을 나중에 튜닝해도 저장 데이터 마이그레이션이 없다.
 */

export type StyleLane = 'female' | 'male';
export type FaceShape = 'oval' | 'round' | 'square' | 'long' | 'heart' | 'diamond';
export type BackHead = 'flat' | 'normal' | 'full';
export type Crown = 'flat' | 'normal' | 'high';
export type HairTexture = 'straight' | 'wavy' | 'curly';
export type HairThickness = 'fine' | 'medium' | 'coarse';
export type HairDensity = 'sparse' | 'medium' | 'dense';

/** 저장/전달되는 헤어 프로필 한 벌. createdAt은 epoch ms(최초 저장 시각). */
export interface HairProfile {
  lane: StyleLane;
  faceShape: FaceShape;
  backHead: BackHead;
  crown: Crown;
  texture: HairTexture;
  thickness: HairThickness;
  density: HairDensity;
  createdAt: number;
}

/** 설문 한 문항의 선택지 하나. id는 해당 필드 유니온 값과 정확히 일치(UI가 그대로 캐스팅). */
export interface HairOption {
  id: string;
  label: string;
}

/** 설문 한 문항. key는 이 답이 채우는 프로필 필드. */
export interface HairQuestion {
  key: 'lane' | 'faceShape' | 'backHead' | 'crown' | 'texture' | 'thickness' | 'density';
  question: string;
  options: HairOption[];
}

/**
 * 헤어 설문 문항 7종 — 순서는 lane → 얼굴형 → 두상(뒤통수·정수리) → 모발(결·굵기·숱).
 * 각 옵션 id는 반드시 해당 필드의 유니온 값이어야 한다.
 */
export const HAIR_QUESTIONS: HairQuestion[] = [
  {
    key: 'lane',
    question: '어느 쪽 스타일을 볼까요?',
    options: [
      {id: 'female', label: '여성 스타일'},
      {id: 'male', label: '남성 스타일'},
    ],
  },
  {
    key: 'faceShape',
    question: '거울 정면, 얼굴형에 가장 가까운 건?',
    options: [
      {id: 'oval', label: '계란형 — 이마·광대·턱 균형'},
      {id: 'round', label: '둥근형 — 볼 통통, 턱 둥긂'},
      {id: 'square', label: '각진형 — 턱각 또렷'},
      {id: 'long', label: '긴 형 — 세로가 긴 편'},
      {id: 'heart', label: '하트형 — 이마 넓고 턱 좁음'},
      {id: 'diamond', label: '다이아형 — 광대 도드라짐'},
    ],
  },
  {
    key: 'backHead',
    question: '옆모습에서 뒤통수 볼륨은?',
    options: [
      {id: 'flat', label: '납작한 편'},
      {id: 'normal', label: '보통'},
      {id: 'full', label: '볼록한 편'},
    ],
  },
  {
    key: 'crown',
    question: '정수리 높이는?',
    options: [
      {id: 'flat', label: '꺼진 편'},
      {id: 'normal', label: '보통'},
      {id: 'high', label: '높은 편'},
    ],
  },
  {
    key: 'texture',
    question: '감고 그냥 말렸을 때 모발 결은?',
    options: [
      {id: 'straight', label: '직모'},
      {id: 'wavy', label: '반곱슬'},
      {id: 'curly', label: '곱슬'},
    ],
  },
  {
    key: 'thickness',
    question: '머리카락 한 올의 굵기는?',
    options: [
      {id: 'fine', label: '가는 편'},
      {id: 'medium', label: '보통'},
      {id: 'coarse', label: '굵은 편'},
    ],
  },
  {
    key: 'density',
    question: '숱은?',
    options: [
      {id: 'sparse', label: '적은 편'},
      {id: 'medium', label: '보통'},
      {id: 'dense', label: '많은 편'},
    ],
  },
];

// ── 표시 라벨 — 추천 이유 문장(hairstyle.ts)과 요약 행(패널)이 공유하는 단일 출처 ──
export const FACE_LABEL: Record<FaceShape, string> = {
  oval: '계란형',
  round: '둥근형',
  square: '각진형',
  long: '긴 얼굴형',
  heart: '하트형',
  diamond: '다이아몬드형',
};
export const BACK_LABEL: Record<BackHead, string> = {
  flat: '납작',
  normal: '보통',
  full: '볼록',
};
export const TEXTURE_LABEL: Record<HairTexture, string> = {
  straight: '직모',
  wavy: '반곱슬',
  curly: '곱슬',
};
export const DENSITY_LABEL: Record<HairDensity, string> = {
  sparse: '숱 적음',
  medium: '숱 보통',
  dense: '숱 많음',
};

/** 프로필을 한 줄 요약으로. 예: "둥근형 · 뒤통수 납작 · 직모 · 숱 보통". */
export const summarizeHairProfile = (p: HairProfile): string =>
  `${FACE_LABEL[p.faceShape]} · 뒤통수 ${BACK_LABEL[p.backHead]} · ${TEXTURE_LABEL[p.texture]} · ${DENSITY_LABEL[p.density]}`;

// 유니온 값 화이트리스트 — 손상 데이터 판별과 옵션 검증의 단일 출처.
const LANES: StyleLane[] = ['female', 'male'];
const FACES: FaceShape[] = ['oval', 'round', 'square', 'long', 'heart', 'diamond'];
const BACKS: BackHead[] = ['flat', 'normal', 'full'];
const CROWNS: Crown[] = ['flat', 'normal', 'high'];
const TEXTURES: HairTexture[] = ['straight', 'wavy', 'curly'];
const THICKNESSES: HairThickness[] = ['fine', 'medium', 'coarse'];
const DENSITIES: HairDensity[] = ['sparse', 'medium', 'dense'];

/** 저장소에서 읽은 임의 값이 온전한 HairProfile인지 판별(손상 데이터 방어). */
export const isHairProfile = (v: unknown): v is HairProfile => {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    LANES.includes(o.lane as StyleLane) &&
    FACES.includes(o.faceShape as FaceShape) &&
    BACKS.includes(o.backHead as BackHead) &&
    CROWNS.includes(o.crown as Crown) &&
    TEXTURES.includes(o.texture as HairTexture) &&
    THICKNESSES.includes(o.thickness as HairThickness) &&
    DENSITIES.includes(o.density as HairDensity) &&
    typeof o.createdAt === 'number'
  );
};
