/**
 * 헤어스타일 추천 규칙 엔진 — 헤어 프로필(얼굴형·두상·모발, 영속)과 세션 조건(원하는
 * 기장·손질 여유)으로 카탈로그의 각 스타일을 채점해 순위를 낸다. 순수 로직(Unity/브리지
 * 무관), 결정론적이라 테스트 가능. 패널(HairstylePanel)이 칩을 바꿀 때마다 recommend()를
 * 다시 부른다.
 *
 * 채점 모델: 각 스타일은 얼굴형별 적합도(0/1/2), 모발 결·굵기·숱 적합도, 스타일이
 * 만들어 주는 정수리·뒤통수 볼륨(0/1/2), 필요한 손질 수준을 데이터로 가진다. 납작한
 * 두상엔 볼륨을 채우는 스타일이 가산점을, 두상을 드러내는 스타일(슬릭·태슬·크롭)은
 * 감점을 받는 식으로 가중 합산하고, 발동한 규칙이 곧 추천 이유/주의 문장이 된다.
 *
 * 예측의 한계: 헤어라인 모양·이목구비·목 길이·피부톤은 입력에 없다. caveat 필드로
 * "시술 전 디자이너 상담" 안내를 항상 노출한다.
 */
import {DENSITY_LABEL, FACE_LABEL, TEXTURE_LABEL} from './hairProfile';
import type {BackHead, Crown, FaceShape, HairDensity, HairProfile, HairTexture, HairThickness, StyleLane} from './hairProfile';

export type StyleLength = 'short' | 'bob' | 'medium' | 'long';
export type LengthPref = StyleLength | 'any';
export type Effort = 'low' | 'medium' | 'high';

/** 세션 조건 — 그때그때 바뀌는 취향이라 프로필과 달리 저장하지 않는다. */
export interface HairContext {
  lengthPref: LengthPref;
  effort: Effort;
}

/** 적합도 눈금: 0=비추천, 1=무난, 2=최적. */
type Fit = 0 | 1 | 2;

export interface HairStyle {
  id: string;
  name: string;
  lane: StyleLane;
  length: StyleLength;
  summary: string;
  /** 명시 안 된 얼굴형은 1(무난)로 취급. */
  faceFit: Partial<Record<FaceShape, Fit>>;
  /** faceFit 2인 얼굴형에 붙는 맞춤 이유 문장(없으면 범용 문장). */
  faceReason?: Partial<Record<FaceShape, string>>;
  textureFit: Record<HairTexture, Fit>;
  /** 직모일 때 펌 시술이 있어야 완성되는 스타일. */
  permForStraight?: boolean;
  thicknessFit: Record<HairThickness, Fit>;
  densityFit: Record<HairDensity, Fit>;
  /** 이 스타일이 정수리/뒤통수에 만들어 주는 볼륨. */
  crownVolume: Fit;
  backVolume: Fit;
  effortNeed: Effort;
  tips: string[];
  cautions?: string[];
}

// ── 스타일 카탈로그 (여성 10종 · 남성 8종) ───────────────────────────────────
export const HAIR_STYLES: HairStyle[] = [
  // 여성
  {
    id: 'pixie',
    name: '픽시컷',
    lane: 'female',
    length: 'short',
    summary: '귀가 드러나는 과감한 숏컷. 이목구비를 시원하게 여는 개성파.',
    faceFit: {oval: 2, heart: 2, diamond: 2, round: 0, square: 0},
    faceReason: {
      oval: '균형 잡힌 얼굴형의 이목구비를 시원하게 드러내요',
      heart: '이마와 광대 라인을 세련되게 살려요',
      diamond: '광대 중심의 얼굴형에 개성 있게 어울려요',
    },
    textureFit: {straight: 2, wavy: 2, curly: 1},
    thicknessFit: {fine: 2, medium: 2, coarse: 1},
    densityFit: {sparse: 1, medium: 2, dense: 2},
    crownVolume: 1,
    backVolume: 1,
    effortNeed: 'medium',
    tips: ['왁스나 포마드로 결만 잡아도 완성', '2~3주 간격으로 다듬어야 라인 유지'],
    cautions: ['얼굴 라인이 그대로 드러나 커트 디자인이 중요'],
  },
  {
    id: 'tassel',
    name: '태슬컷',
    lane: 'female',
    length: 'bob',
    summary: '턱 라인에서 일자로 뚝 떨어지는 미니멀 단발.',
    faceFit: {oval: 2, long: 2, round: 0, square: 0},
    faceReason: {
      long: '턱 라인에서 끝나는 커트가 얼굴 길이를 짧아 보이게 해요',
      oval: '군더더기 없는 라인이 균형 잡힌 얼굴형을 돋보이게 해요',
    },
    textureFit: {straight: 2, wavy: 1, curly: 0},
    thicknessFit: {fine: 1, medium: 2, coarse: 2},
    densityFit: {sparse: 1, medium: 2, dense: 2},
    crownVolume: 0,
    backVolume: 0,
    effortNeed: 'low',
    tips: ['에센스로 끝 라인만 정돈하면 끝'],
    cautions: ['곱슬 모발이면 매일 아이론이 필요'],
  },
  {
    id: 'c-bob',
    name: 'C컬 보브 단발',
    lane: 'female',
    length: 'bob',
    summary: '끝이 안으로 말리는 C컬로 얼굴을 감싸는 클래식 단발.',
    faceFit: {round: 2, square: 2, oval: 2},
    faceReason: {
      round: '턱 아래로 흐르는 C컬이 볼 라인을 감싸 갸름해 보여요',
      square: '각진 턱 라인을 부드러운 컬이 자연스럽게 커버해요',
      oval: '단정한 인컬 라인이 얼굴형의 균형을 살려요',
    },
    textureFit: {straight: 1, wavy: 2, curly: 1},
    permForStraight: true,
    thicknessFit: {fine: 2, medium: 2, coarse: 1},
    densityFit: {sparse: 2, medium: 2, dense: 1},
    crownVolume: 1,
    backVolume: 2,
    effortNeed: 'medium',
    tips: ['드라이 때 롤브러시로 끝만 안으로', '셋팅펌을 하면 손질 시간이 크게 줄어요'],
  },
  {
    id: 'jelly-bob',
    name: '젤리펌 단발',
    lane: 'female',
    length: 'bob',
    summary: '탱글한 컬을 얹은 발랄한 단발. 곱슬 결을 그대로 살리기 좋다.',
    faceFit: {oval: 2, square: 2},
    faceReason: {
      square: '탱글한 컬이 턱각을 감싸 부드러운 인상을 줘요',
      oval: '생기 있는 컬이 단정한 얼굴형에 포인트가 돼요',
    },
    textureFit: {straight: 1, wavy: 2, curly: 2},
    permForStraight: true,
    thicknessFit: {fine: 2, medium: 2, coarse: 1},
    densityFit: {sparse: 2, medium: 2, dense: 1},
    crownVolume: 1,
    backVolume: 2,
    effortNeed: 'low',
    tips: ['컬 크림 후 디퓨저로 말리면 컬이 살아나요'],
  },
  {
    id: 'hush',
    name: '허쉬컷',
    lane: 'female',
    length: 'medium',
    summary: '잘게 층을 낸 레이어드 미디움. 시크하면서 얼굴을 갸름하게.',
    faceFit: {round: 2, square: 2, diamond: 2, oval: 2},
    faceReason: {
      round: '레이어드 층이 시선을 세로로 분산시켜 갸름해 보여요',
      square: '얼굴 옆 라인을 잘게 친 층이 자연스럽게 가려 줘요',
      diamond: '광대 주변으로 떨어지는 층이 라인을 부드럽게 해요',
      oval: '가벼운 층이 얼굴형을 해치지 않고 분위기를 더해요',
    },
    textureFit: {straight: 1, wavy: 2, curly: 1},
    permForStraight: true,
    thicknessFit: {fine: 1, medium: 2, coarse: 2},
    densityFit: {sparse: 1, medium: 2, dense: 2},
    crownVolume: 2,
    backVolume: 1,
    effortNeed: 'medium',
    tips: ['고데기로 바깥 층만 살려도 완성', '숱을 살리는 질감펌과 궁합이 좋아요'],
  },
  {
    id: 'cloud-medium',
    name: '구름펌 미디움',
    lane: 'female',
    length: 'medium',
    summary: '몽글몽글한 컬 볼륨. 부드러운 인상과 풍성함을 한 번에.',
    faceFit: {square: 2, long: 2, oval: 2, round: 0},
    faceReason: {
      square: '몽글한 컬이 각진 라인을 완전히 부드럽게 바꿔요',
      long: '옆으로 퍼지는 볼륨이 얼굴 길이를 보완해요',
      oval: '풍성한 컬이 얼굴형을 해치지 않고 분위기를 살려요',
    },
    textureFit: {straight: 1, wavy: 2, curly: 2},
    permForStraight: true,
    thicknessFit: {fine: 2, medium: 2, coarse: 1},
    densityFit: {sparse: 2, medium: 2, dense: 1},
    crownVolume: 2,
    backVolume: 2,
    effortNeed: 'low',
    tips: ['디퓨저로 말리기만 해도 컬이 살아나요', '펌 직후 2~3일은 샴푸를 미뤄 컬 고정'],
  },
  {
    id: 'build-long',
    name: '빌드펌 롱',
    lane: 'female',
    length: 'long',
    summary: '얼굴 옆에서 부드럽게 흐르는 물결 웨이브의 정석 롱펌.',
    faceFit: {oval: 2, long: 2, heart: 2},
    faceReason: {
      heart: '얼굴 아래쪽에 볼륨을 더해 좁은 턱 라인의 균형을 맞춰요',
      long: '부드러운 웨이브가 세로로 떨어지는 시선을 끊어 줘요',
      oval: '흐르는 웨이브가 얼굴형의 우아함을 살려요',
    },
    textureFit: {straight: 1, wavy: 2, curly: 1},
    permForStraight: true,
    thicknessFit: {fine: 2, medium: 2, coarse: 1},
    densityFit: {sparse: 1, medium: 2, dense: 2},
    crownVolume: 1,
    backVolume: 2,
    effortNeed: 'medium',
    tips: ['미스트를 뿌려 컬을 쥐어 주면 웨이브가 되살아나요'],
  },
  {
    id: 'hippie',
    name: '히피펌 롱',
    lane: 'female',
    length: 'long',
    summary: '뿌리부터 잔잔하게 구불거리는 자유분방한 풍성 롱펌.',
    faceFit: {long: 2, oval: 2, round: 0},
    faceReason: {
      long: '풍성한 잔웨이브가 옆 볼륨을 만들어 긴 얼굴을 보완해요',
      oval: '자유로운 컬이 얼굴형을 가리지 않으면서 분위기를 바꿔요',
    },
    textureFit: {straight: 1, wavy: 2, curly: 2},
    permForStraight: true,
    thicknessFit: {fine: 0, medium: 2, coarse: 2},
    densityFit: {sparse: 0, medium: 2, dense: 2},
    crownVolume: 2,
    backVolume: 2,
    effortNeed: 'low',
    tips: ['젖은 상태에 에센스를 바르고 자연 건조하면 끝'],
    cautions: ['가는 모발은 손상·컬 처짐이 심할 수 있음', '숱이 적으면 빈약해 보일 수 있음'],
  },
  {
    id: 'layer-long',
    name: '레이어드컷 롱',
    lane: 'female',
    length: 'long',
    summary: '얼굴 옆으로 층이 흐르는 긴 머리의 스테디셀러.',
    faceFit: {round: 2, square: 2, oval: 2, heart: 2},
    faceReason: {
      round: '얼굴 옆으로 흐르는 층이 볼을 자연스럽게 가려요',
      square: '턱 라인 바깥으로 떨어지는 층이 각을 감춰요',
      heart: '턱 쪽으로 모이는 층이 좁은 하관을 채워 보여요',
      oval: '어떤 가르마와도 어울리는 무난하고 우아한 선택',
    },
    textureFit: {straight: 2, wavy: 2, curly: 1},
    thicknessFit: {fine: 1, medium: 2, coarse: 2},
    densityFit: {sparse: 1, medium: 2, dense: 2},
    crownVolume: 1,
    backVolume: 1,
    effortNeed: 'medium',
    tips: ['드라이 후 층 부분만 롤브러시로 바깥으로'],
  },
  {
    id: 'sleek-long',
    name: '슬릭 스트레이트 롱',
    lane: 'female',
    length: 'long',
    summary: '찰랑이는 생머리 그대로. 단정하고 도회적인 무드.',
    faceFit: {oval: 2, square: 0, long: 0},
    faceReason: {oval: '찰랑이는 일자 라인이 계란형의 단정함을 극대화해요'},
    textureFit: {straight: 2, wavy: 1, curly: 0},
    thicknessFit: {fine: 1, medium: 2, coarse: 2},
    densityFit: {sparse: 0, medium: 2, dense: 2},
    crownVolume: 0,
    backVolume: 0,
    effortNeed: 'low',
    tips: ['주 1회 헤어팩으로 윤기 유지'],
    cautions: ['곱슬 모발은 매직 스트레이트가 선행돼야 함'],
  },
  // 남성
  {
    id: 'crop',
    name: '크롭컷',
    lane: 'male',
    length: 'short',
    summary: '짧은 앞머리를 일자로 내린 깔끔하고 강한 인상의 숏컷.',
    faceFit: {long: 2, oval: 2},
    faceReason: {
      long: '이마를 덮는 짧은 앞머리가 얼굴 길이를 줄여 보여요',
      oval: '균형 잡힌 얼굴형이라 짧은 기장도 부담 없어요',
    },
    textureFit: {straight: 2, wavy: 2, curly: 2},
    thicknessFit: {fine: 2, medium: 2, coarse: 2},
    densityFit: {sparse: 1, medium: 2, dense: 2},
    crownVolume: 0,
    backVolume: 0,
    effortNeed: 'low',
    tips: ['매트 왁스 소량으로 결만 살려요'],
  },
  {
    id: 'ivy-league',
    name: '아이비리그',
    lane: 'male',
    length: 'short',
    summary: '옆은 짧게, 윗머리는 사선으로 넘기는 단정한 클래식 숏컷.',
    faceFit: {oval: 2, round: 2, heart: 2},
    faceReason: {
      round: '윗머리를 사선으로 넘겨 세로 라인을 만들어요',
      oval: '어디서나 통하는 단정하고 신뢰감 있는 인상',
      heart: '이마를 적당히 가리면서 깔끔한 균형을 잡아요',
    },
    textureFit: {straight: 2, wavy: 2, curly: 1},
    thicknessFit: {fine: 2, medium: 2, coarse: 2},
    densityFit: {sparse: 1, medium: 2, dense: 2},
    crownVolume: 1,
    backVolume: 1,
    effortNeed: 'low',
    tips: ['드라이로 방향만 잡고 소프트 왁스로 마무리'],
  },
  {
    id: 'regent',
    name: '리젠트 펌',
    lane: 'male',
    length: 'short',
    summary: '이마를 드러내고 윗볼륨을 뒤로 세우는 남성미 스타일.',
    faceFit: {round: 2, square: 2, oval: 2, long: 0},
    faceReason: {
      round: '이마를 드러내고 윗볼륨을 세워 얼굴이 길어 보여요',
      square: '시선을 위로 끌어 턱각의 존재감을 줄여요',
      oval: '균형 잡힌 얼굴형에 남성적인 볼륨감을 더해요',
    },
    textureFit: {straight: 1, wavy: 2, curly: 1},
    permForStraight: true,
    thicknessFit: {fine: 1, medium: 2, coarse: 2},
    densityFit: {sparse: 0, medium: 2, dense: 2},
    crownVolume: 2,
    backVolume: 1,
    effortNeed: 'high',
    tips: ['드라이로 뿌리를 세운 뒤 포마드로 고정'],
    cautions: ['이마·헤어라인이 넓다면 부담스러울 수 있음'],
  },
  {
    id: 'dandy',
    name: '댄디컷',
    lane: 'male',
    length: 'short',
    summary: '자연스러운 앞머리를 내린 부드럽고 단정한 국민 숏컷.',
    faceFit: {oval: 2, long: 2, heart: 2},
    faceReason: {
      long: '자연스러운 앞머리가 이마를 덮어 얼굴 비율을 맞춰요',
      heart: '넓은 이마를 가리고 부드러운 인상을 만들어요',
      oval: '누구에게나 무난하게 어울리는 안전한 선택',
    },
    textureFit: {straight: 2, wavy: 1, curly: 0},
    thicknessFit: {fine: 2, medium: 2, coarse: 1},
    densityFit: {sparse: 1, medium: 2, dense: 2},
    crownVolume: 1,
    backVolume: 1,
    effortNeed: 'low',
    tips: ['앞머리 방향만 드라이로 잡으면 손질 끝'],
    cautions: ['곱슬 모발은 다운펌 없이는 뻗침이 심함'],
  },
  {
    id: 'shadow-perm',
    name: '쉐도우펌',
    lane: 'male',
    length: 'short',
    summary: '자연스러운 S컬 볼륨을 얹은 손질 편한 인기 펌.',
    faceFit: {square: 2, round: 2, oval: 2, diamond: 2},
    faceReason: {
      square: '자연스러운 컬이 딱딱한 인상을 풀어 줘요',
      round: '윗볼륨이 살아 얼굴이 갸름해 보여요',
      diamond: '이마 쪽 볼륨이 광대의 존재감을 줄여요',
      oval: '볼륨과 컬이 얼굴형의 균형 위에 분위기를 더해요',
    },
    textureFit: {straight: 1, wavy: 2, curly: 2},
    permForStraight: true,
    thicknessFit: {fine: 2, medium: 2, coarse: 1},
    densityFit: {sparse: 2, medium: 2, dense: 1},
    crownVolume: 2,
    backVolume: 2,
    effortNeed: 'low',
    tips: ['아침에 물만 묻혀 드라이해도 컬이 살아나요'],
  },
  {
    id: 'leaf',
    name: '리프컷',
    lane: 'male',
    length: 'medium',
    summary: '귀를 살짝 덮는 층진 미디움. 나뭇잎처럼 가볍게 흐르는 라인.',
    faceFit: {oval: 2, heart: 2, diamond: 2},
    faceReason: {
      diamond: '광대를 살짝 덮는 층이 라인을 부드럽게 해요',
      heart: '턱이 좁은 얼굴형에 층진 라인이 잘 어울려요',
      oval: '트렌디한 기장감이 얼굴형의 장점을 살려요',
    },
    textureFit: {straight: 1, wavy: 2, curly: 1},
    permForStraight: true,
    thicknessFit: {fine: 1, medium: 2, coarse: 2},
    densityFit: {sparse: 0, medium: 2, dense: 2},
    crownVolume: 2,
    backVolume: 2,
    effortNeed: 'medium',
    tips: ['가르마 없이 털어 말린 뒤 에센스로 결 정리'],
  },
  {
    id: 'two-block-down',
    name: '투블럭 다운펌',
    lane: 'male',
    length: 'short',
    summary: '옆·뒷머리를 짧게 치고 뻗침을 눌러 정리한 실용 스타일.',
    faceFit: {round: 2, oval: 2},
    faceReason: {
      round: '옆머리를 바짝 붙여 얼굴 폭을 줄여 보이게 해요',
      oval: '군더더기 없는 라인으로 언제나 깔끔한 인상',
    },
    textureFit: {straight: 1, wavy: 2, curly: 2},
    thicknessFit: {fine: 1, medium: 2, coarse: 2},
    densityFit: {sparse: 1, medium: 2, dense: 2},
    crownVolume: 1,
    backVolume: 0,
    effortNeed: 'low',
    tips: ['숱 많고 뻗치는 모발을 가장 깔끔하게 눌러 줘요'],
  },
  {
    id: 'middle-part',
    name: '미들파트 댄디',
    lane: 'male',
    length: 'medium',
    summary: '가운데 가르마로 이마를 반쯤 여는 세련된 미디움.',
    faceFit: {oval: 2, round: 2, long: 0},
    faceReason: {
      round: '가운데 가르마가 세로 라인을 강조해 갸름해 보여요',
      oval: '트렌디한 가르마 라인이 얼굴형과 잘 어울려요',
    },
    textureFit: {straight: 1, wavy: 2, curly: 1},
    permForStraight: true,
    thicknessFit: {fine: 1, medium: 2, coarse: 2},
    densityFit: {sparse: 0, medium: 2, dense: 2},
    crownVolume: 1,
    backVolume: 2,
    effortNeed: 'high',
    tips: ['가르마 뿌리를 반대로 들며 드라이하면 볼륨이 살아요'],
    cautions: ['헤어라인이 M자형이면 이마가 도드라질 수 있음'],
  },
];

// ── 가중치·두상 테이블 ───────────────────────────────────────────────────────
// 얼굴형이 인상을 가장 크게 좌우하고, 모발 결은 "재현 가능한가"의 문제라 그다음.
// 두상은 이 엔진의 차별점(납작 뒤통수 보완). 합계 100 → score는 /100으로 0..1.
const WEIGHT = {face: 30, texture: 22, head: 18, effort: 12, density: 10, thickness: 8};

const EFFORT_RANK: Record<Effort, number> = {low: 0, medium: 1, high: 2};

// [스타일의 볼륨 0,1,2]일 때 두상별 적합도 — 납작할수록 볼륨 스타일이 유리하고,
// 이미 볼록하면 두상을 드러내는 스타일이 오히려 장점이 된다.
const BACK_TABLE: Record<BackHead, [number, number, number]> = {
  flat: [0.1, 0.6, 1],
  normal: [0.8, 1, 0.9],
  full: [1, 0.9, 0.6],
};
const CROWN_TABLE: Record<Crown, [number, number, number]> = {
  flat: [0.2, 0.7, 1],
  normal: [0.8, 1, 0.85],
  high: [1, 0.85, 0.6],
};

// ── 출력 타입 ─────────────────────────────────────────────────────────────
export interface RankedStyle {
  id: string;
  name: string;
  length: StyleLength;
  lengthLabel: string;
  summary: string;
  score: number; // 0..1
  reasons: string[];
  cautions: string[];
  tips: string[];
}

export interface HairRecommendation {
  /** 원하는 기장과 일치하는 스타일 순위(기장 무관이면 레인 전체). */
  picks: RankedStyle[];
  /** 기장을 바꾸면 고려할 만한 스타일 순위. */
  alternates: RankedStyle[];
  caveat: string;
}

export const LENGTH_LABEL: Record<StyleLength, string> = {
  short: '숏',
  bob: '단발',
  medium: '미디움',
  long: '롱',
};

/** 스타일 하나를 프로필·세션 조건으로 채점. 발동한 규칙이 이유/주의 문장이 된다. */
export function scoreStyle(style: HairStyle, profile: HairProfile, ctx: HairContext): RankedStyle {
  const reasons: string[] = [];
  const cautions: string[] = [];

  const faceFit = style.faceFit[profile.faceShape] ?? 1;
  if (faceFit === 2) {
    reasons.push(style.faceReason?.[profile.faceShape] ?? `${FACE_LABEL[profile.faceShape]}에 특히 잘 어울리는 라인`);
  } else if (faceFit === 0) {
    cautions.push(`${FACE_LABEL[profile.faceShape]}에는 단점이 부각될 수 있어요`);
  }

  const textureFit = style.textureFit[profile.texture];
  if (textureFit === 2) {
    reasons.push(
      profile.texture === 'straight'
        ? '직모의 결을 그대로 살릴 수 있어요'
        : profile.texture === 'wavy'
          ? '타고난 반곱슬 웨이브와 잘 어울려요'
          : '곱슬 결을 살리기 좋은 스타일이에요',
    );
  } else if (textureFit === 0) {
    cautions.push(`${TEXTURE_LABEL[profile.texture]} 모발에는 잘 맞지 않아요`);
  }
  if (style.permForStraight && profile.texture === 'straight' && textureFit >= 1) {
    reasons.push('직모는 펌 시술로 연출해요');
  }

  const backScore = BACK_TABLE[profile.backHead][style.backVolume];
  const crownScore = CROWN_TABLE[profile.crown][style.crownVolume];
  if (profile.backHead === 'flat' && style.backVolume === 2) {
    reasons.push('납작한 뒤통수를 볼륨으로 채워 두상 라인을 살려요');
  }
  if (profile.backHead === 'flat' && style.backVolume === 0) {
    cautions.push('납작한 뒤통수가 드러나기 쉬운 스타일이에요');
  }
  if (profile.crown === 'flat' && style.crownVolume === 2) {
    reasons.push('꺼진 정수리에 볼륨을 만들어 줘요');
  }
  if (profile.backHead === 'full' && style.backVolume === 0) {
    reasons.push('예쁜 두상 라인을 깔끔하게 드러내요');
  }

  const thicknessFit = style.thicknessFit[profile.thickness];
  if (profile.thickness === 'fine' && thicknessFit === 2 && (style.crownVolume >= 1 || style.backVolume >= 1)) {
    reasons.push('가는 모발에도 볼륨이 잘 살아요');
  }

  const densityFit = style.densityFit[profile.density];
  if (profile.density === 'sparse' && densityFit === 2) {
    reasons.push('숱이 적어도 풍성해 보여요');
  } else if (densityFit === 0) {
    cautions.push(`${DENSITY_LABEL[profile.density]} 모발에는 아쉬울 수 있어요`);
  }

  // 손질 여유보다 손이 많이 가는 스타일은 감점 + 주의.
  const effortGap = EFFORT_RANK[style.effortNeed] - EFFORT_RANK[ctx.effort];
  const effortScore = effortGap <= 0 ? 1 : effortGap === 1 ? 0.5 : 0.1;
  if (style.effortNeed === 'low' && ctx.effort === 'low') {
    reasons.push('아침 손질이 간단해요');
  }
  if (effortGap > 0) {
    cautions.push('매일 어느 정도 스타일링 시간이 필요해요');
  }

  if (reasons.length === 0) reasons.push('무난한 선택');

  const score =
    ((faceFit / 2) * WEIGHT.face +
      (textureFit / 2) * WEIGHT.texture +
      (backScore * 0.6 + crownScore * 0.4) * WEIGHT.head +
      effortScore * WEIGHT.effort +
      (densityFit / 2) * WEIGHT.density +
      (thicknessFit / 2) * WEIGHT.thickness) /
    100;

  return {
    id: style.id,
    name: style.name,
    length: style.length,
    lengthLabel: LENGTH_LABEL[style.length],
    summary: style.summary,
    score: Math.round(score * 100) / 100,
    reasons: reasons.slice(0, 3),
    cautions: cautions.slice(0, 2),
    // 시술 전 알아야 할 스타일 고유 주의는 팁 목록 끝에 ⚠로 합류.
    tips: [...style.tips, ...(style.cautions ?? []).map(c => `⚠ ${c}`)],
  };
}

/** 상단 진입점 — 레인 카탈로그를 채점·정렬하고 기장 선호로 picks/alternates를 가른다. */
export function recommend(profile: HairProfile, ctx: HairContext): HairRecommendation {
  const ranked = HAIR_STYLES.filter(s => s.lane === profile.lane)
    .map(s => scoreStyle(s, profile, ctx))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));

  const caveat =
    '얼굴형·두상·모발 조건 기반의 규칙 추천이에요. 실제 인상은 헤어라인·이목구비·목 길이에 ' +
    '따라 달라지니, 시술 전 디자이너와 사진을 두고 상담하는 것을 권해요.';

  if (ctx.lengthPref === 'any') {
    return {picks: ranked, alternates: [], caveat};
  }
  return {
    picks: ranked.filter(s => s.length === ctx.lengthPref),
    alternates: ranked.filter(s => s.length !== ctx.lengthPref),
    caveat,
  };
}

// ── UI가 공유하는 옵션 목록 ───────────────────────────────────────────────
export const LENGTH_OPTIONS: Record<StyleLane, {id: LengthPref; label: string}[]> = {
  female: [
    {id: 'any', label: '상관없음'},
    {id: 'short', label: '숏'},
    {id: 'bob', label: '단발'},
    {id: 'medium', label: '미디움'},
    {id: 'long', label: '롱'},
  ],
  // 남성 카탈로그는 숏·미디움 기장만 있어 선택지도 거기에 맞춘다.
  male: [
    {id: 'any', label: '상관없음'},
    {id: 'short', label: '숏'},
    {id: 'medium', label: '미디움'},
  ],
};

export const EFFORT_OPTIONS: {id: Effort; label: string}[] = [
  {id: 'low', label: '5분 이내'},
  {id: 'medium', label: '10분 정도'},
  {id: 'high', label: '공들여도 좋음'},
];

export const DEFAULT_HAIR_CONTEXT: HairContext = {lengthPref: 'any', effort: 'medium'};
