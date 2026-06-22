import type { ImageSourcePropType } from 'react-native';

import type {
  AnalysisFacePointGuide,
  AnalysisMakeupCard,
  AnalysisResult,
} from '../types/analysis';

const naturalLight =
  require('../../assets/images/analysis/analysis-natural-light.png') as ImageSourcePropType;
const vanityLight =
  require('../../assets/images/analysis/analysis-vanity-light.png') as ImageSourcePropType;
const cafeLight =
  require('../../assets/images/analysis/analysis-cafe.png') as ImageSourcePropType;
const nightLamp =
  require('../../assets/images/analysis/analysis-night-lamp.png') as ImageSourcePropType;
const windowLight =
  require('../../assets/images/analysis/analysis-window.png') as ImageSourcePropType;
const studioLight =
  require('../../assets/images/analysis/analysis-studio.png') as ImageSourcePropType;
const brightWall =
  require('../../assets/images/analysis/analysis-bright-wall.png') as ImageSourcePropType;
const darkWall =
  require('../../assets/images/analysis/analysis-dark-wall.png') as ImageSourcePropType;
const softLight =
  require('../../assets/images/analysis/analysis-soft-light.png') as ImageSourcePropType;
const differentFace =
  require('../../assets/images/analysis/analysis-different-face.png') as ImageSourcePropType;

const clearGloss =
  require('../../assets/images/analysis-detail/look-clear-gloss.png') as ImageSourcePropType;
const fruityJuice =
  require('../../assets/images/analysis-detail/look-fruity-juice.png') as ImageSourcePropType;
const cleanLine =
  require('../../assets/images/analysis-detail/look-clean-line.png') as ImageSourcePropType;
const heavyMatte =
  require('../../assets/images/analysis-detail/avoid-heavy-matte.png') as ImageSourcePropType;
const muddyShadow =
  require('../../assets/images/analysis-detail/avoid-muddy-shadow.png') as ImageSourcePropType;
const overLip =
  require('../../assets/images/analysis-detail/avoid-over-lip.png') as ImageSourcePropType;

type MakeupCardSeed = Omit<AnalysisMakeupCard, 'id'>;

interface AnalysisResultSeed {
  id: string;
  title: string;
  analyzedAt: string;
  imageSource: ImageSourcePropType;
  environmentLabel: string;
  personalColor: string;
  skinType: string;
  toneSummary: string;
  recommendedMood: string;
  tags: string[];
  summary: string;
  shortSummary: string;
  skinAnalysisSummary: string;
  baseMakeupGuide: string;
  facePointGuide: AnalysisFacePointGuide;
  recommendedMakeups: MakeupCardSeed[];
  avoidedMakeups: MakeupCardSeed[];
}

const recommendedCardSeeds = {
  clearGloss: {
    title: '클리어 & 글로시',
    subtitle: '맑은 윤광 베이스',
    description:
      '얇은 베이스와 투명한 립 광택으로 피부 결을 살리고 얼굴 중심을 밝게 보여줘요.',
    imageSource: clearGloss,
    tags: ['윤광', '투명립'],
  },
  fruityJuice: {
    title: '과즙상 룩',
    subtitle: '피치 코랄 포인트',
    description:
      '피치 코랄 치크와 생기 있는 립을 연결해 자연스러운 혈색을 만들어줘요.',
    imageSource: fruityJuice,
    tags: ['코랄', '생기'],
  },
  cleanLine: {
    title: '깔끔한 라인 음영',
    subtitle: '또렷한 눈매 정리',
    description:
      '얇은 아이라인과 정돈된 음영으로 눈매를 선명하게 잡되 무겁지 않게 마무리해요.',
    imageSource: cleanLine,
    tags: ['아이라인', '음영'],
  },
} satisfies Record<string, MakeupCardSeed>;

const avoidedCardSeeds = {
  heavyMatte: {
    title: '두꺼운 매트 베이스',
    subtitle: '건조함 강조',
    description:
      '두껍고 매트한 베이스는 피부 결을 답답하게 보이게 하고 윤기를 줄일 수 있어요.',
    imageSource: heavyMatte,
    tags: ['매트', '두꺼움'],
  },
  muddyShadow: {
    title: '탁한 회갈색 음영',
    subtitle: '얼굴 톤 다운',
    description:
      '채도가 낮고 탁한 음영은 맑은 톤을 눌러 피곤한 인상을 만들 수 있어요.',
    imageSource: muddyShadow,
    tags: ['탁한음영', '톤다운'],
  },
  overLip: {
    title: '강한 오버 립',
    subtitle: '입술 경계 과장',
    description:
      '진하고 넓은 립 라인은 얼굴의 부드러운 균형보다 입술만 과하게 강조할 수 있어요.',
    imageSource: overLip,
    tags: ['오버립', '고채도'],
  },
} satisfies Record<string, MakeupCardSeed>;

const withIds = (
  resultId: string,
  section: 'recommend' | 'avoid',
  cards: MakeupCardSeed[],
): AnalysisMakeupCard[] => {
  return cards.map((card, index) => ({
    ...card,
    id: `${resultId}-${section}-${index + 1}`,
  }));
};

const makeResult = (seed: AnalysisResultSeed): AnalysisResult => {
  return {
    ...seed,
    reportTitle: '맞춤 분석 보고서',
    recommendedMakeups: withIds(seed.id, 'recommend', seed.recommendedMakeups),
    avoidedMakeups: withIds(seed.id, 'avoid', seed.avoidedMakeups),
  };
};

const softWarmGuide: AnalysisFacePointGuide = {
  brow: '결을 살려 자연스럽게 채우고 앞머리는 연하게 남겨요.',
  blush: '볼 중앙에서 관자 방향으로 코랄빛을 넓고 부드럽게 연결해요.',
  highlight: '콧대와 광대 상단은 얇은 윤광만 더해요.',
  eyeshadow: '피치 베이지 음영으로 눈두덩을 맑게 정리해요.',
  eyeliner: '점막 가까이에 얇게 채워 눈매만 또렷하게 만들어요.',
  lip: '코랄 글로스나 피치 틴트를 중앙부터 번지듯 올려요.',
};

const coolCleanGuide: AnalysisFacePointGuide = {
  brow: '눈썹 산을 과하게 만들지 않고 차분한 회갈색으로 정리해요.',
  blush: '라벤더 핑크 치크를 볼 앞쪽에 얇게 올려 맑은 혈색을 줘요.',
  highlight: '은은한 펄을 눈 앞머리와 광대 상단에만 제한해요.',
  eyeshadow: '쿨 베이지와 연핑크로 탁하지 않은 음영을 만들어요.',
  eyeliner: '브라운 블랙 라인을 짧게 빼서 깔끔하게 정리해요.',
  lip: '핑크나 체리 계열을 얇게 레이어링해 선명도를 맞춰요.',
};

const muteGuide: AnalysisFacePointGuide = {
  brow: '짙게 채우기보다 빈 곳만 메우고 결을 자연스럽게 빗어요.',
  blush: '로즈나 모브 치크를 낮은 채도로 얹어 차분하게 연결해요.',
  highlight: '강한 펄보다 새틴 광으로 건조함만 덜어내요.',
  eyeshadow: '브라운을 넓게 쓰기보다 로즈 베이지로 깊이를 줘요.',
  eyeliner: '꼬리는 짧게, 속눈썹 라인만 또렷하게 보강해요.',
  lip: '뮤트 로즈나 브릭을 얇게 발라 선명도를 조절해요.',
};

export const analysisResultsMock: AnalysisResult[] = [
  makeResult({
    id: 'analysis-2026-06-22',
    title: '2026.06.22',
    analyzedAt: '2026.06.22',
    imageSource: naturalLight,
    environmentLabel: '창가 자연광',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '밝은 아이보리 톤',
    recommendedMood: '맑은 코랄 글로우',
    tags: ['코랄', '글로우', '데일리'],
    summary: '맑은 코랄과 얇은 윤광 베이스가 얼굴 톤을 가장 부드럽게 살려줘요.',
    shortSummary: '코랄 윤광 조합이 가장 안정적으로 어울려요.',
    skinAnalysisSummary:
      '자연광에서 피부 밝기가 균일하게 보이고 노란기가 과하지 않아 투명한 웜톤 표현이 잘 맞아요.',
    baseMakeupGuide:
      '세미 글로우 베이스를 얇게 펴 바르고, 건조해 보이는 볼과 입가에는 촉촉한 프라이머를 먼저 사용해요.',
    facePointGuide: softWarmGuide,
    recommendedMakeups: [
      recommendedCardSeeds.clearGloss,
      recommendedCardSeeds.fruityJuice,
      recommendedCardSeeds.cleanLine,
    ],
    avoidedMakeups: [
      avoidedCardSeeds.heavyMatte,
      avoidedCardSeeds.muddyShadow,
      avoidedCardSeeds.overLip,
    ],
  }),
  makeResult({
    id: 'analysis-2026-06-20',
    title: '2026.06.20',
    analyzedAt: '2026.06.20',
    imageSource: vanityLight,
    environmentLabel: '실내 화장대 조명',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '노란기 적은 밝은 톤',
    recommendedMood: '피치 핑크 데일리',
    tags: ['피치', '핑크', '촉촉함'],
    summary: '따뜻한 조명에서는 피치 핑크 립과 은은한 치크가 균형 있게 보여요.',
    shortSummary: '피치 핑크 포인트가 얼굴을 화사하게 보여줘요.',
    skinAnalysisSummary:
      '실내 조명에서 얼굴 중앙이 밝게 잡히므로 피치 계열을 얇게 연결하면 생기가 자연스럽게 살아나요.',
    baseMakeupGuide:
      '코 옆과 턱 라인만 가볍게 보정하고 볼은 수분감 있는 쿠션으로 투명하게 남겨요.',
    facePointGuide: softWarmGuide,
    recommendedMakeups: [
      recommendedCardSeeds.fruityJuice,
      recommendedCardSeeds.clearGloss,
      recommendedCardSeeds.cleanLine,
    ],
    avoidedMakeups: [
      avoidedCardSeeds.overLip,
      avoidedCardSeeds.heavyMatte,
      avoidedCardSeeds.muddyShadow,
    ],
  }),
  makeResult({
    id: 'analysis-2026-06-18',
    title: '2026.06.18',
    analyzedAt: '2026.06.18',
    imageSource: cafeLight,
    environmentLabel: '카페 간접 조명',
    personalColor: '봄웜 브라이트',
    skinType: '수부지 피부',
    toneSummary: '중간 밝기 웜 톤',
    recommendedMood: '살구 베이지 무드',
    tags: ['살구', '베이지', '차분함'],
    summary: '살구 베이지 섀도와 낮은 채도 립이 피부 결을 차분하게 보여줘요.',
    shortSummary: '살구 베이지 무드가 자연스럽게 어울려요.',
    skinAnalysisSummary:
      '간접 조명에서 피부가 살짝 따뜻하게 보이므로 살구빛과 베이지 컬러가 안정적으로 이어져요.',
    baseMakeupGuide:
      'T존은 얇게 보송하게 잡고 볼에는 자연스러운 윤기를 남겨 복합적인 피부 결을 균형 있게 정리해요.',
    facePointGuide: softWarmGuide,
    recommendedMakeups: [
      recommendedCardSeeds.cleanLine,
      recommendedCardSeeds.fruityJuice,
      recommendedCardSeeds.clearGloss,
    ],
    avoidedMakeups: [
      avoidedCardSeeds.muddyShadow,
      avoidedCardSeeds.heavyMatte,
      avoidedCardSeeds.overLip,
    ],
  }),
  makeResult({
    id: 'analysis-2026-06-15',
    title: '2026.06.15',
    analyzedAt: '2026.06.15',
    imageSource: nightLamp,
    environmentLabel: '밤 스탠드 조명',
    personalColor: '가을뮤트 라이트',
    skinType: '건성 피부',
    toneSummary: '조명에 따라 붉어지는 톤',
    recommendedMood: '로즈 브라운 포인트',
    tags: ['로즈', '브라운', '선명함'],
    summary: '낮은 조도에서는 로즈 브라운 컬러가 또렷함을 주면서 과하게 어둡지 않아요.',
    shortSummary: '로즈 브라운 포인트가 선명하게 보여요.',
    skinAnalysisSummary:
      '어두운 조명에서는 얼굴 윤곽이 약해 보일 수 있어 로즈 브라운으로 부드럽게 중심을 잡는 편이 좋아요.',
    baseMakeupGuide:
      '광은 최소화하되 건조한 부위는 들뜨지 않게 얇게 보정하고, 턱선에는 가벼운 음영만 더해요.',
    facePointGuide: muteGuide,
    recommendedMakeups: [
      recommendedCardSeeds.cleanLine,
      recommendedCardSeeds.clearGloss,
      recommendedCardSeeds.fruityJuice,
    ],
    avoidedMakeups: [
      avoidedCardSeeds.heavyMatte,
      avoidedCardSeeds.overLip,
      avoidedCardSeeds.muddyShadow,
    ],
  }),
  makeResult({
    id: 'analysis-2026-06-12',
    title: '2026.06.12',
    analyzedAt: '2026.06.12',
    imageSource: windowLight,
    environmentLabel: '흐린 날 창가',
    personalColor: '여름라이트',
    skinType: '복합성 피부',
    toneSummary: '차분한 밝은 뉴트럴 톤',
    recommendedMood: '라벤더 핑크 클린',
    tags: ['라벤더', '핑크', '클린'],
    summary: '라벤더 핑크 계열이 얼굴의 노란기를 덜어 맑은 인상을 만들어줘요.',
    shortSummary: '라벤더 핑크가 맑은 인상을 만들어줘요.',
    skinAnalysisSummary:
      '흐린 자연광에서는 피부가 차분하게 보이므로 라벤더 핑크와 쿨 베이지가 깨끗하게 어울려요.',
    baseMakeupGuide:
      '베이스는 밝게 올리기보다 피부 톤을 균일하게 맞추고, 붉은 부위만 얇게 커버해요.',
    facePointGuide: coolCleanGuide,
    recommendedMakeups: [
      recommendedCardSeeds.clearGloss,
      recommendedCardSeeds.cleanLine,
      recommendedCardSeeds.fruityJuice,
    ],
    avoidedMakeups: [
      avoidedCardSeeds.muddyShadow,
      avoidedCardSeeds.overLip,
      avoidedCardSeeds.heavyMatte,
    ],
  }),
  makeResult({
    id: 'analysis-2026-06-08',
    title: '2026.06.08',
    analyzedAt: '2026.06.08',
    imageSource: studioLight,
    environmentLabel: '밝은 스튜디오 조명',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '균일한 밝은 웜 톤',
    recommendedMood: '샴페인 글리터',
    tags: ['샴페인', '펄', '화사함'],
    summary: '샴페인 펄과 투명한 립 컬러가 입체감을 자연스럽게 살려요.',
    shortSummary: '샴페인 펄이 과하지 않게 어울려요.',
    skinAnalysisSummary:
      '밝은 조명에서 피부 결이 잘 보이므로 얇은 윤광과 샴페인 포인트가 입체감을 살려줘요.',
    baseMakeupGuide:
      '파운데이션 양을 줄이고 하이라이트는 광대와 콧대에만 얇게 올려 사진에서 번들거림을 줄여요.',
    facePointGuide: softWarmGuide,
    recommendedMakeups: [
      recommendedCardSeeds.clearGloss,
      recommendedCardSeeds.cleanLine,
      recommendedCardSeeds.fruityJuice,
    ],
    avoidedMakeups: [
      avoidedCardSeeds.heavyMatte,
      avoidedCardSeeds.muddyShadow,
      avoidedCardSeeds.overLip,
    ],
  }),
  makeResult({
    id: 'analysis-2026-06-03',
    title: '2026.06.03',
    analyzedAt: '2026.06.03',
    imageSource: brightWall,
    environmentLabel: '밝은 베이지 배경',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '밝고 균일한 아이보리 톤',
    recommendedMood: '소프트 코랄 누드',
    tags: ['코랄', '누드', '소프트'],
    summary: '채도를 낮춘 코랄 누드가 얼굴 윤곽을 부드럽게 잡아줘요.',
    shortSummary: '코랄 누드가 편안하게 어울려요.',
    skinAnalysisSummary:
      '밝은 배경에서는 색이 쉽게 날아가므로 코랄 누드와 얇은 음영으로 균형을 잡는 편이 좋아요.',
    baseMakeupGuide:
      '목과 얼굴 경계가 자연스럽게 이어지도록 밝기 차이를 줄이고, 파우더는 필요한 부위만 사용해요.',
    facePointGuide: softWarmGuide,
    recommendedMakeups: [
      recommendedCardSeeds.fruityJuice,
      recommendedCardSeeds.cleanLine,
      recommendedCardSeeds.clearGloss,
    ],
    avoidedMakeups: [
      avoidedCardSeeds.overLip,
      avoidedCardSeeds.heavyMatte,
      avoidedCardSeeds.muddyShadow,
    ],
  }),
  makeResult({
    id: 'analysis-2026-05-29',
    title: '2026.05.29',
    analyzedAt: '2026.05.29',
    imageSource: darkWall,
    environmentLabel: '어두운 실내 배경',
    personalColor: '가을뮤트',
    skinType: '수부지 피부',
    toneSummary: '명암 대비가 강한 웜 톤',
    recommendedMood: '뮤트 브릭 립',
    tags: ['브릭', '뮤트', '또렷함'],
    summary: '뮤트 브릭 립이 얼굴을 또렷하게 잡아주고 피부가 덜 창백해 보여요.',
    shortSummary: '뮤트 브릭 컬러가 얼굴 중심을 잡아줘요.',
    skinAnalysisSummary:
      '어두운 배경에서는 얼굴 중심이 흐려질 수 있어 낮은 채도의 브릭 컬러가 안정적으로 보여요.',
    baseMakeupGuide:
      '베이스는 세미 매트로 정돈하고, 볼 중앙에는 옅은 혈색을 더해 어두운 배경에서 생기를 유지해요.',
    facePointGuide: muteGuide,
    recommendedMakeups: [
      recommendedCardSeeds.cleanLine,
      recommendedCardSeeds.fruityJuice,
      recommendedCardSeeds.clearGloss,
    ],
    avoidedMakeups: [
      avoidedCardSeeds.muddyShadow,
      avoidedCardSeeds.overLip,
      avoidedCardSeeds.heavyMatte,
    ],
  }),
  makeResult({
    id: 'analysis-2026-05-25',
    title: '2026.05.25',
    analyzedAt: '2026.05.25',
    imageSource: softLight,
    environmentLabel: '부드러운 그늘 조명',
    personalColor: '여름뮤트',
    skinType: '복합성 피부',
    toneSummary: '차분한 핑크 베이스 톤',
    recommendedMood: '모브 핑크 무드',
    tags: ['모브', '핑크', '차분함'],
    summary: '채도 낮은 모브 핑크가 피부 톤을 차분하고 세련되게 보여줘요.',
    shortSummary: '모브 핑크 계열이 차분하게 잘 어울려요.',
    skinAnalysisSummary:
      '부드러운 그늘에서는 채도가 높은 색보다 모브와 핑크 베이지가 피부 톤을 차분하게 정리해요.',
    baseMakeupGuide:
      '볼과 코 주변의 붉은기를 얇게 잡고, 피부 결은 너무 매트하게 누르지 않도록 마무리해요.',
    facePointGuide: coolCleanGuide,
    recommendedMakeups: [
      recommendedCardSeeds.cleanLine,
      recommendedCardSeeds.clearGloss,
      recommendedCardSeeds.fruityJuice,
    ],
    avoidedMakeups: [
      avoidedCardSeeds.overLip,
      avoidedCardSeeds.muddyShadow,
      avoidedCardSeeds.heavyMatte,
    ],
  }),
  makeResult({
    id: 'analysis-2026-05-22',
    title: '2026.05.22',
    analyzedAt: '2026.05.22',
    imageSource: differentFace,
    environmentLabel: '밝은 흰 벽 조명',
    personalColor: '겨울쿨 브라이트',
    skinType: '지성 피부',
    toneSummary: '선명한 쿨 베이스 톤',
    recommendedMood: '체리 핑크 포인트',
    tags: ['체리핑크', '쿨톤', '선명함'],
    summary: '다른 얼굴로 촬영된 기록에서는 체리 핑크 립과 깔끔한 라인이 생기를 더해줘요.',
    shortSummary: '다른 얼굴 기록으로, 체리 핑크 포인트가 잘 맞아요.',
    skinAnalysisSummary:
      '선명한 쿨 베이스가 잘 보이는 기록이라 깨끗한 라인과 체리 핑크 포인트가 가장 또렷해요.',
    baseMakeupGuide:
      '유분은 얇게 눌러 정리하고, 피부 표현은 너무 두껍지 않게 유지해 선명한 색감을 살려요.',
    facePointGuide: coolCleanGuide,
    recommendedMakeups: [
      recommendedCardSeeds.cleanLine,
      recommendedCardSeeds.clearGloss,
      recommendedCardSeeds.fruityJuice,
    ],
    avoidedMakeups: [
      avoidedCardSeeds.heavyMatte,
      avoidedCardSeeds.muddyShadow,
      avoidedCardSeeds.overLip,
    ],
  }),
];
