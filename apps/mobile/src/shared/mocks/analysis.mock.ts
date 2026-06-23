import type { ImageSourcePropType } from 'react-native';

import type { AnalysisResult } from '../types/analysis';

const analysisSpringLight =
  require('../../assets/images/analysis/analysis-seojin-spring-light.png') as ImageSourcePropType;
const analysisAutumnWarm =
  require('../../assets/images/analysis/analysis-autumn-warm.png') as ImageSourcePropType;
const analysisSummerCool =
  require('../../assets/images/analysis/analysis-summer-cool.png') as ImageSourcePropType;

export const analysisMock: AnalysisResult[] = [
  {
    id: 'analysis-spring-light-20260623',
    title: '봄웜 라이트, 건성 피부',
    reportTitle: '맞춤 분석 보고서',
    analyzedAt: '2026-06-23',
    imageSource: analysisSpringLight,
    environmentLabel: '밝은 자연광',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '밝고 맑은 아이보리 톤',
    recommendedMood: '맑은 코랄 글로우',
    tags: ['봄웜', '코랄', '윤광'],
    summary: '코랄 윤광 조합이 가장 안정적으로 어울려요',
    shortSummary: '코랄 윤광 조합이 가장 안정적으로 어울려요',
    skinAnalysisSummary:
      '밝은 피부 톤과 건조한 피부 결을 고려하면 얇은 윤광 베이스와 맑은 코랄 립이 안정적입니다.',
    baseMakeupGuide:
      '두꺼운 매트 베이스보다 촉촉한 쿠션을 얇게 올리고, 광은 T존보다 볼 중심으로 살려주세요.',
    facePointGuide: {
      brow: '부드러운 브라운으로 결을 살립니다.',
      blush: '볼 중앙에 코랄을 넓고 옅게 연결합니다.',
      highlight: '광대와 콧대에 작은 면적으로만 올립니다.',
      eyeshadow: '밝은 베이지와 코랄 브라운을 사용합니다.',
      eyeliner: '블랙보다 브라운 라인으로 자연스럽게 마무리합니다.',
      lip: '맑은 코랄 글로스나 워터 틴트가 잘 맞습니다.',
    },
    recommendedMakeups: [],
    avoidedMakeups: [],
  },
  {
    id: 'analysis-autumn-warm-20260614',
    title: '가을웜 라이트, 건성 피부',
    reportTitle: '맞춤 분석 보고서',
    analyzedAt: '2026-06-14',
    imageSource: analysisAutumnWarm,
    environmentLabel: '실내 조명',
    personalColor: '가을웜 라이트',
    skinType: '건성 피부',
    toneSummary: '차분한 웜 아이보리 톤',
    recommendedMood: '소프트 베이지 코랄',
    tags: ['웜톤', '베이지', '소프트'],
    summary: '베이지 코랄 조합이 차분하게 어울려요',
    shortSummary: '베이지 코랄 조합이 차분하게 어울려요',
    skinAnalysisSummary: '조명이 낮을 때는 채도보다 결 정돈이 먼저 보입니다.',
    baseMakeupGuide: '얇은 베이스와 크림 블러셔로 건조함을 줄여주세요.',
    facePointGuide: {
      brow: '회갈색보다 따뜻한 브라운이 좋습니다.',
      blush: '코랄 베이지를 낮게 올립니다.',
      highlight: '펄감이 적은 제품을 선택합니다.',
      eyeshadow: '베이지 브라운 음영을 사용합니다.',
      eyeliner: '눈꼬리만 짧게 정리합니다.',
      lip: '누디 코랄 립을 추천합니다.',
    },
    recommendedMakeups: [],
    avoidedMakeups: [],
  },
  {
    id: 'analysis-summer-cool-20260602',
    title: '여름쿨 라이트, 복합성 피부',
    reportTitle: '맞춤 분석 보고서',
    analyzedAt: '2026-06-02',
    imageSource: analysisSummerCool,
    environmentLabel: '창가 자연광',
    personalColor: '여름쿨 라이트',
    skinType: '복합성 피부',
    toneSummary: '맑은 쿨 아이보리 톤',
    recommendedMood: '클린 로즈 글로우',
    tags: ['쿨톤', '로즈', '클린'],
    summary: '맑은 로즈 컬러가 얼굴을 깨끗하게 보여줘요',
    shortSummary: '맑은 로즈 컬러가 얼굴을 깨끗하게 보여줘요',
    skinAnalysisSummary: '번들거림은 낮추고 투명한 색감을 살리는 편이 좋습니다.',
    baseMakeupGuide: 'T존은 얇게 픽싱하고 볼은 촉촉하게 남깁니다.',
    facePointGuide: {
      brow: '붉은기 적은 브라운을 사용합니다.',
      blush: '라이트 로즈를 광대 안쪽에 올립니다.',
      highlight: '화이트 펄은 최소화합니다.',
      eyeshadow: '쿨 베이지와 로즈 브라운을 사용합니다.',
      eyeliner: '라인은 얇고 선명하게 정리합니다.',
      lip: '맑은 로즈 틴트를 추천합니다.',
    },
    recommendedMakeups: [],
    avoidedMakeups: [],
  },
];
