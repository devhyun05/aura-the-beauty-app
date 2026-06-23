import type {ImageSourcePropType} from 'react-native';

import type {AnalysisMakeupCard, AnalysisResult} from '../types/analysis';

const analysisSpringLight =
  require('../../assets/images/analysis/analysis-seojin-spring-light.png') as ImageSourcePropType;
const analysisWindow =
  require('../../assets/images/analysis/analysis-window.png') as ImageSourcePropType;
const analysisCafe =
  require('../../assets/images/analysis/analysis-cafe.png') as ImageSourcePropType;
const analysisNightLamp =
  require('../../assets/images/analysis/analysis-night-lamp.png') as ImageSourcePropType;
const analysisBrightWall =
  require('../../assets/images/analysis/analysis-bright-wall.png') as ImageSourcePropType;
const analysisSoftLight =
  require('../../assets/images/analysis/analysis-soft-light.png') as ImageSourcePropType;
const analysisVanityLight =
  require('../../assets/images/analysis/analysis-vanity-light.png') as ImageSourcePropType;
const analysisNaturalLight =
  require('../../assets/images/analysis/analysis-natural-light.png') as ImageSourcePropType;
const analysisDarkWall =
  require('../../assets/images/analysis/analysis-dark-wall.png') as ImageSourcePropType;
const analysisWinterCool =
  require('../../assets/images/analysis/analysis-winter-cool.png') as ImageSourcePropType;
const analysisAutumnWarm =
  require('../../assets/images/analysis/analysis-autumn-warm.png') as ImageSourcePropType;
const analysisDifferentFace =
  require('../../assets/images/analysis/analysis-different-face.png') as ImageSourcePropType;

const lookClearGloss =
  require('../../assets/images/analysis-detail/look-clear-gloss.png') as ImageSourcePropType;
const lookFruityJuice =
  require('../../assets/images/analysis-detail/look-fruity-juice.png') as ImageSourcePropType;
const lookCleanLine =
  require('../../assets/images/analysis-detail/look-clean-line.png') as ImageSourcePropType;
const avoidHeavyMatte =
  require('../../assets/images/analysis-detail/avoid-heavy-matte.png') as ImageSourcePropType;
const avoidMuddyShadow =
  require('../../assets/images/analysis-detail/avoid-muddy-shadow.png') as ImageSourcePropType;
const avoidOverLip =
  require('../../assets/images/analysis-detail/avoid-over-lip.png') as ImageSourcePropType;

type AnalysisMockSeed = {
  id: string;
  analyzedAt: string;
  imageSource: ImageSourcePropType;
  environmentLabel: string;
  personalColor: string;
  skinType: string;
  toneSummary: string;
  recommendedMood: string;
  tags: string[];
  summary: string;
  skinAnalysisSummary: string;
  baseMakeupGuide: string;
};

const createRecommendedMakeups = (
  resultId: string,
  mood: string,
): AnalysisMakeupCard[] => [
  {
    id: `${resultId}-clear-gloss`,
    title: '클리어 & 글로시',
    subtitle: mood,
    description: '얇은 윤광 베이스와 투명한 립 표현으로 얼굴을 맑게 보여줘요.',
    imageSource: lookClearGloss,
    tags: ['윤광', '맑은 립'],
  },
  {
    id: `${resultId}-fruity-juice`,
    title: '과즙상',
    subtitle: '생기 포인트',
    description: '볼과 입술에 같은 계열 색을 낮게 얹어 자연스러운 생기를 더해요.',
    imageSource: lookFruityJuice,
    tags: ['생기', '톤온톤'],
  },
  {
    id: `${resultId}-clean-line`,
    title: '깔끔한 또렷함',
    subtitle: '브라운 라인',
    description: '눈매는 얇게 정돈하고 컬러 포인트는 입술과 볼에 집중해요.',
    imageSource: lookCleanLine,
    tags: ['브라운', '정돈감'],
  },
];

const createAvoidedMakeups = (resultId: string): AnalysisMakeupCard[] => [
  {
    id: `${resultId}-avoid-smoky`,
    title: '너무 진한 스모키',
    subtitle: '무거운 음영',
    description: '넓은 블랙 음영은 피부 톤을 답답하게 보이게 할 수 있어요.',
    imageSource: avoidHeavyMatte,
    tags: ['진한 음영', '매트'],
  },
  {
    id: `${resultId}-avoid-contour`,
    title: '과한 컨투어링',
    subtitle: '강한 윤곽',
    description: '진한 음영 경계는 얼굴의 맑은 분위기를 약하게 만들 수 있어요.',
    imageSource: avoidMuddyShadow,
    tags: ['강한 쉐딩', '경계감'],
  },
  {
    id: `${resultId}-avoid-lip`,
    title: '채도 높은 립',
    subtitle: '강한 포인트',
    description: '선명한 고채도 립은 전체 조화를 깨고 입술만 도드라질 수 있어요.',
    imageSource: avoidOverLip,
    tags: ['고채도', '오버립'],
  },
];

const facePointGuide = {
  brow: '자연스러운 아치형으로 결을 살리고 애쉬 브라운을 추천해요.',
  blush: '뉴트럴 핑크를 광대 위에 넓고 얇게 연결해요.',
  highlight: 'T존과 눈밑 삼각존에 은은한 광채만 더해요.',
  eyeshadow: '뉴트럴 베이지 톤을 얇고 부드럽게 쌓아요.',
  eyeliner: '점막을 가볍게 채우고 브라운 아이라인으로 마무리해요.',
  lip: 'MLBB 계열의 로지 누드 립이 가장 안정적이에요.',
};

const buildAnalysisResult = (seed: AnalysisMockSeed): AnalysisResult => ({
  ...seed,
  title: `${seed.personalColor}, ${seed.skinType}`,
  reportTitle: '맞춤 분석 보고서',
  shortSummary: seed.summary,
  facePointGuide,
  recommendedMakeups: createRecommendedMakeups(seed.id, seed.recommendedMood),
  avoidedMakeups: createAvoidedMakeups(seed.id),
});

export const analysisMock: AnalysisResult[] = [
  buildAnalysisResult({
    id: 'analysis-spring-light-20260622',
    analyzedAt: '2026-06-22',
    imageSource: analysisSpringLight,
    environmentLabel: '밝은 자연광',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '밝고 맑은 아이보리 톤',
    recommendedMood: '맑은 코랄 글로우',
    tags: ['봄웜', '코랄', '윤광'],
    summary: '코랄 윤광 조합이 가장 안정적으로 어울려요',
    skinAnalysisSummary:
      '밝은 피부 톤과 건조한 피부 결을 고려하면 얇은 윤광 베이스와 맑은 코랄 립이 안정적입니다.',
    baseMakeupGuide:
      '두꺼운 매트 베이스보다 촉촉한 쿠션을 얇게 올리고, 광은 볼 중심으로 살려주세요.',
  }),
  buildAnalysisResult({
    id: 'analysis-summer-cool-20260621',
    analyzedAt: '2026-06-21',
    imageSource: analysisWindow,
    environmentLabel: '창가 자연광',
    personalColor: '여름 쿨',
    skinType: '복합성 피부',
    toneSummary: '맑은 쿨 아이보리 톤',
    recommendedMood: '뮤트 로즈 데일리 룩',
    tags: ['쿨톤', '로즈', '데일리'],
    summary: '낮은 채도의 로즈 컬러가 피부를 깨끗하게 보여줘요',
    skinAnalysisSummary:
      'T존은 얇게 픽싱하고 볼은 촉촉하게 남기면 투명한 피부 표현이 살아납니다.',
    baseMakeupGuide:
      '쿨 베이지 베이스에 라이트 로즈 블러셔를 얇게 연결해 주세요.',
  }),
  buildAnalysisResult({
    id: 'analysis-autumn-warm-20260620',
    analyzedAt: '2026-06-20',
    imageSource: analysisCafe,
    environmentLabel: '카페 조명',
    personalColor: '가을 웜',
    skinType: '건성 피부',
    toneSummary: '차분한 웜 아이보리 톤',
    recommendedMood: '브릭 코랄 무드 룩',
    tags: ['웜톤', '브릭', '무드'],
    summary: '브릭 코랄과 베이지 조합이 차분하게 어울려요',
    skinAnalysisSummary:
      '조명이 낮을 때는 채도보다 피부 결 정돈과 부드러운 음영이 먼저 보입니다.',
    baseMakeupGuide:
      '크림 베이스를 얇게 바르고 브릭 코랄을 낮은 채도로 올려주세요.',
  }),
  buildAnalysisResult({
    id: 'analysis-winter-cool-20260619',
    analyzedAt: '2026-06-19',
    imageSource: analysisWinterCool,
    environmentLabel: '차분한 실내광',
    personalColor: '겨울 쿨 딥',
    skinType: '중성 피부',
    toneSummary: '선명한 쿨 베이스 톤',
    recommendedMood: '플럼 모브 포인트 룩',
    tags: ['쿨딥', '플럼', '포인트'],
    summary: '모브 컬러를 포인트로 쓰면 얼굴 윤곽이 또렷해져요',
    skinAnalysisSummary:
      '선명한 대비가 잘 받지만 전체를 어둡게 만들기보다 포인트를 좁게 쓰는 편이 좋습니다.',
    baseMakeupGuide:
      '피부는 깨끗하게 정돈하고 립이나 눈꼬리에만 플럼 포인트를 주세요.',
  }),
  buildAnalysisResult({
    id: 'analysis-summer-light-20260618',
    analyzedAt: '2026-06-18',
    imageSource: analysisBrightWall,
    environmentLabel: '밝은 배경',
    personalColor: '여름 쿨 라이트',
    skinType: '복합성 피부',
    toneSummary: '투명한 핑크 아이보리 톤',
    recommendedMood: '라벤더 핑크 데일리 룩',
    tags: ['라이트', '핑크', '라벤더'],
    summary: '은은한 라벤더 핑크가 얼굴을 화사하게 밝혀줘요',
    skinAnalysisSummary:
      '밝은 조명에서는 색감이 쉽게 날아가므로 낮은 채도의 핑크를 얇게 쌓는 편이 좋습니다.',
    baseMakeupGuide:
      '톤업 베이스는 최소화하고 라벤더 핑크 블러셔를 넓게 연결해 주세요.',
  }),
  buildAnalysisResult({
    id: 'analysis-spring-bright-20260617',
    analyzedAt: '2026-06-17',
    imageSource: analysisSoftLight,
    environmentLabel: '소프트 조명',
    personalColor: '봄웜 브라이트',
    skinType: '건성 피부',
    toneSummary: '맑고 생기 있는 웜 톤',
    recommendedMood: '피치 코랄 생기 룩',
    tags: ['피치', '브라이트', '생기'],
    summary: '피치 코랄을 얇게 올리면 표정이 밝아 보여요',
    skinAnalysisSummary:
      '윤광 베이스와 밝은 코랄 포인트가 피부의 맑은 느낌을 잘 살립니다.',
    baseMakeupGuide:
      '피치 톤 블러셔와 코랄 립을 같은 채도로 맞추면 조화롭습니다.',
  }),
  buildAnalysisResult({
    id: 'analysis-vanity-20260616',
    analyzedAt: '2026-06-16',
    imageSource: analysisVanityLight,
    environmentLabel: '화장대 조명',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '밝은 웜 아이보리 톤',
    recommendedMood: '코랄 베이지 내추럴 룩',
    tags: ['베이지', '코랄', '내추럴'],
    summary: '코랄 베이지가 자연스럽고 편안한 인상을 만들어요',
    skinAnalysisSummary:
      '직접 조명에서는 베이스 두께가 도드라지므로 얇은 레이어링이 중요합니다.',
    baseMakeupGuide:
      '촉촉한 베이스 뒤에 파우더는 코 주변만 최소로 사용해 주세요.',
  }),
  buildAnalysisResult({
    id: 'analysis-natural-20260615',
    analyzedAt: '2026-06-15',
    imageSource: analysisNaturalLight,
    environmentLabel: '야외 자연광',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '맑은 아이보리 톤',
    recommendedMood: '클린 코랄 데일리 룩',
    tags: ['클린', '코랄', '데일리'],
    summary: '가벼운 코랄 포인트가 자연광에서 가장 안정적이에요',
    skinAnalysisSummary:
      '야외에서는 피부 질감이 선명하게 보이므로 가벼운 베이스와 립 광택이 잘 맞습니다.',
    baseMakeupGuide:
      '자외선 차단 베이스 위에 얇은 쿠션을 덧대고 립은 투명하게 마무리해 주세요.',
  }),
  buildAnalysisResult({
    id: 'analysis-dark-wall-20260614',
    analyzedAt: '2026-06-14',
    imageSource: analysisDarkWall,
    environmentLabel: '어두운 배경',
    personalColor: '가을 웜 뮤트',
    skinType: '중성 피부',
    toneSummary: '차분한 베이지 톤',
    recommendedMood: '소프트 브라운 무드 룩',
    tags: ['브라운', '뮤트', '소프트'],
    summary: '부드러운 브라운 음영이 차분한 분위기와 잘 맞아요',
    skinAnalysisSummary:
      '어두운 배경에서는 립보다 피부 밝기와 눈매 정돈이 먼저 보입니다.',
    baseMakeupGuide:
      '베이스는 반톤 밝게, 음영은 넓지 않게 눈가 중심으로 정리해 주세요.',
  }),
  buildAnalysisResult({
    id: 'analysis-night-lamp-20260613',
    analyzedAt: '2026-06-13',
    imageSource: analysisNightLamp,
    environmentLabel: '밤 조명',
    personalColor: '여름 쿨 뮤트',
    skinType: '복합성 피부',
    toneSummary: '낮은 채도의 쿨 톤',
    recommendedMood: '뮤트 로지 나이트 룩',
    tags: ['뮤트', '로지', '나이트'],
    summary: '낮은 채도의 로지 컬러가 밤 조명에서도 부드럽게 보여요',
    skinAnalysisSummary:
      '노란 조명에서는 색이 따뜻하게 보이므로 쿨 로즈를 아주 얇게 쓰는 편이 안정적입니다.',
    baseMakeupGuide:
      'T존 번들거림은 눌러주고 볼과 입술은 촉촉하게 남겨 주세요.',
  }),
  buildAnalysisResult({
    id: 'analysis-autumn-soft-20260612',
    analyzedAt: '2026-06-12',
    imageSource: analysisAutumnWarm,
    environmentLabel: '실내 간접광',
    personalColor: '가을 웜 라이트',
    skinType: '건성 피부',
    toneSummary: '부드러운 웜 베이지 톤',
    recommendedMood: '웜 베이지 내추럴 룩',
    tags: ['웜베이지', '내추럴', '소프트'],
    summary: '웜 베이지와 누디 코랄이 편안한 인상을 만들어줘요',
    skinAnalysisSummary:
      '간접광에서는 과한 색보다 피부 결을 촉촉하게 정돈하는 쪽이 자연스럽습니다.',
    baseMakeupGuide:
      '베이지 쿠션을 얇게 바르고 누디 코랄 립으로 마무리해 주세요.',
  }),
  buildAnalysisResult({
    id: 'analysis-friend-20260611',
    analyzedAt: '2026-06-11',
    imageSource: analysisDifferentFace,
    environmentLabel: '친구 촬영',
    personalColor: '겨울 쿨 브라이트',
    skinType: '중성 피부',
    toneSummary: '선명한 쿨 핑크 톤',
    recommendedMood: '클리어 로즈 포인트 룩',
    tags: ['친구', '쿨브라이트', '로즈'],
    summary: '선명한 로즈 포인트가 또렷한 인상을 만들어줘요',
    skinAnalysisSummary:
      '선명한 대비가 잘 받는 얼굴이라 피부는 깨끗하게, 포인트는 좁게 쓰는 편이 좋습니다.',
    baseMakeupGuide:
      '깨끗한 세미매트 베이스에 로즈 립을 선명하게 얹어 주세요.',
  }),
];
