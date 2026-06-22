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
const friendSoft =
  require('../../assets/images/analysis/analysis-friend-soft.png') as ImageSourcePropType;
const friendCool =
  require('../../assets/images/analysis/analysis-friend-cool.png') as ImageSourcePropType;

export const analysisResultsMock: AnalysisResult[] = [
  {
    id: 'analysis-2026-06-22-natural',
    title: '자연광 베이스 분석',
    analyzedAt: '2026.06.22',
    imageSource: naturalLight,
    subjectType: 'me',
    personLabel: '내 얼굴',
    environmentLabel: '창가 자연광',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '밝은 아이보리 톤',
    recommendedMood: '맑은 코랄 글로우',
    tags: ['자연광', '코랄', '글로우'],
    summary: '맑은 코랄과 얇은 윤광 베이스가 얼굴 톤을 가장 부드럽게 살려줘요.',
    shortSummary: '자연광에서는 코랄 윤광 조합이 가장 안정적으로 어울려요.',
  },
  {
    id: 'analysis-2026-06-20-vanity',
    title: '화장대 조명 재분석',
    analyzedAt: '2026.06.20',
    imageSource: vanityLight,
    subjectType: 'me',
    personLabel: '내 얼굴',
    environmentLabel: '실내 화장대 조명',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '노란기 적은 밝은 톤',
    recommendedMood: '피치 핑크 데일리',
    tags: ['실내조명', '피치', '데일리'],
    summary: '조명이 따뜻하게 잡혀 피치 핑크 립과 은은한 치크가 균형 있게 보여요.',
    shortSummary: '따뜻한 실내 조명에서는 피치 핑크 포인트가 좋아요.',
  },
  {
    id: 'analysis-2026-06-18-cafe',
    title: '카페 조도 분석',
    analyzedAt: '2026.06.18',
    imageSource: cafeLight,
    subjectType: 'me',
    personLabel: '내 얼굴',
    environmentLabel: '카페 간접 조명',
    personalColor: '봄웜 브라이트',
    skinType: '수부지 피부',
    toneSummary: '중간 밝기 웜 톤',
    recommendedMood: '살구 베이지 무드',
    tags: ['카페', '베이지', '살구'],
    summary: '카페 조도에서는 살구 베이지 섀도와 낮은 채도 립이 피부 결을 차분하게 보여줘요.',
    shortSummary: '간접 조명에서는 살구 베이지 무드가 자연스러워요.',
  },
  {
    id: 'analysis-2026-06-15-night',
    title: '밤 조명 촬영 분석',
    analyzedAt: '2026.06.15',
    imageSource: nightLamp,
    subjectType: 'me',
    personLabel: '내 얼굴',
    environmentLabel: '밤 스탠드 조명',
    personalColor: '가을뮤트 라이트',
    skinType: '건성 피부',
    toneSummary: '조명에 따라 붉어지는 톤',
    recommendedMood: '로즈 브라운 포인트',
    tags: ['밤조명', '로즈', '브라운'],
    summary: '낮은 조도에서는 로즈 브라운 컬러가 또렷함을 주면서 과하게 어둡지 않아요.',
    shortSummary: '밤 조명에서는 로즈 브라운 포인트가 선명해 보여요.',
  },
  {
    id: 'analysis-2026-06-12-window',
    title: '흐린 날 창가 분석',
    analyzedAt: '2026.06.12',
    imageSource: windowLight,
    subjectType: 'me',
    personLabel: '내 얼굴',
    environmentLabel: '흐린 날 창가',
    personalColor: '여름라이트',
    skinType: '복합성 피부',
    toneSummary: '차분한 밝은 뉴트럴 톤',
    recommendedMood: '라벤더 핑크 클린',
    tags: ['흐린날', '라벤더', '클린'],
    summary: '흐린 자연광에서는 라벤더 핑크 계열이 얼굴의 노란기를 덜어 보여줘요.',
    shortSummary: '흐린 날에는 라벤더 핑크가 맑은 인상을 만들어줘요.',
  },
  {
    id: 'analysis-2026-06-08-studio',
    title: '스튜디오 조명 분석',
    analyzedAt: '2026.06.08',
    imageSource: studioLight,
    subjectType: 'me',
    personLabel: '내 얼굴',
    environmentLabel: '밝은 스튜디오 조명',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '균일한 밝은 웜 톤',
    recommendedMood: '샴페인 글리터',
    tags: ['스튜디오', '샴페인', '화사함'],
    summary: '강한 조명에서는 샴페인 펄과 투명한 립 컬러가 입체감을 자연스럽게 살려요.',
    shortSummary: '밝은 조명에서는 샴페인 펄이 과하지 않게 어울려요.',
  },
  {
    id: 'analysis-2026-06-03-bright-wall',
    title: '밝은 배경 분석',
    analyzedAt: '2026.06.03',
    imageSource: brightWall,
    subjectType: 'me',
    personLabel: '내 얼굴',
    environmentLabel: '밝은 베이지 배경',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    toneSummary: '밝고 균일한 아이보리 톤',
    recommendedMood: '소프트 코랄 누드',
    tags: ['밝은배경', '누드', '소프트'],
    summary: '밝은 배경에서는 채도를 낮춘 코랄 누드가 얼굴 윤곽을 부드럽게 잡아줘요.',
    shortSummary: '밝은 배경에서는 코랄 누드가 편안하게 어울려요.',
  },
  {
    id: 'analysis-2026-05-29-dark-wall',
    title: '어두운 배경 분석',
    analyzedAt: '2026.05.29',
    imageSource: darkWall,
    subjectType: 'me',
    personLabel: '내 얼굴',
    environmentLabel: '어두운 실내 배경',
    personalColor: '가을뮤트',
    skinType: '수부지 피부',
    toneSummary: '명암 대비가 강한 웜 톤',
    recommendedMood: '뮤트 브릭 립',
    tags: ['어두운배경', '브릭', '뮤트'],
    summary: '어두운 배경에서는 뮤트 브릭 립이 얼굴을 또렷하게 잡아주고 피부가 덜 창백해 보여요.',
    shortSummary: '어두운 배경에서는 뮤트 브릭 컬러가 중심을 잡아줘요.',
  },
  {
    id: 'analysis-2026-05-25-friend-soft',
    title: '친구 촬영 분석',
    analyzedAt: '2026.05.25',
    imageSource: friendSoft,
    subjectType: 'friend',
    personLabel: '친구',
    environmentLabel: '공원 그늘 자연광',
    personalColor: '여름뮤트',
    skinType: '복합성 피부',
    toneSummary: '차분한 핑크 베이스 톤',
    recommendedMood: '모브 핑크 무드',
    tags: ['친구', '그늘', '모브'],
    summary: '친구 얼굴은 채도 낮은 모브 핑크가 피부 톤을 차분하고 세련되게 보여줘요.',
    shortSummary: '친구 촬영 결과로, 모브 핑크 계열이 가장 안정적이에요.',
  },
  {
    id: 'analysis-2026-05-22-friend-cool',
    title: '친구 쿨톤 분석',
    analyzedAt: '2026.05.22',
    imageSource: friendCool,
    subjectType: 'friend',
    personLabel: '친구',
    environmentLabel: '밝은 흰 벽 조명',
    personalColor: '겨울쿨 브라이트',
    skinType: '지성 피부',
    toneSummary: '선명한 쿨 베이스 톤',
    recommendedMood: '체리 핑크 포인트',
    tags: ['친구', '쿨톤', '체리핑크'],
    summary: '선명한 쿨톤 친구에게는 체리 핑크 립과 깔끔한 라인이 생기를 더해줘요.',
    shortSummary: '친구 쿨톤 결과로, 체리 핑크 포인트가 잘 맞아요.',
  },
];
