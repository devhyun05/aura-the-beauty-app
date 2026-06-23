import type { ImageSourcePropType } from 'react-native';

import type { AnalysisResult } from '../types/analysis';

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

export const analysisResultsMock: AnalysisResult[] = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
];
