import type {ImageSourcePropType} from 'react-native';

import type {RecommendationResult} from '../types/makeupGuide';

const reportBareFace =
  require('../../assets/images/user-page/report-bare-face-20260622.png') as ImageSourcePropType;
const styleOjiGirl =
  require('../../assets/images/user-page/style-oji-girl.png') as ImageSourcePropType;
const styleMoriGirl =
  require('../../assets/images/user-page/style-mori-girl.png') as ImageSourcePropType;
const styleCleanSmoky =
  require('../../assets/images/user-page/style-clean-smoky.png') as ImageSourcePropType;

export const mockRecommendationResult: RecommendationResult = {
  userName: '서진',
  analyzedAtLabel: '방금 촬영한 진단 사진 기준',
  previewImageSource: reportBareFace,
  summary:
    '맑고 정돈된 피부 표현에 뉴트럴 로즈 컬러를 얹으면 얼굴의 선이 부드럽게 살아나요.',
  analysis: {
    skinTone: {
      label: '밝은 뉴트럴 톤',
      description: '차갑거나 노란 톤으로 치우치지 않아 저채도 로즈와 소프트 브라운이 잘 맞아요.',
    },
    mood: {
      label: '클린 글로우 무드',
      description: '선명한 포인트보다 얇은 광과 결 정리가 얼굴 분위기를 더 고급스럽게 보여줘요.',
    },
    faceBalance: {
      label: '입술 중심 포인트',
      description: '눈매는 가볍게 열고 립에 자연스러운 깊이를 더하면 균형이 좋아요.',
    },
  },
  recommendationPoints: [
    '베이스는 세미 글로우로 얇게 정리',
    '아이 메이크업은 그레이 브라운 음영 위주',
    '립은 뉴트럴 로즈나 말린 장미 계열 추천',
  ],
  cautionPoints: [
    '매트 베이스를 두껍게 올리면 피부 결이 답답해 보일 수 있어요.',
    '채도가 강한 코랄은 얼굴 톤보다 컬러가 먼저 보일 수 있어요.',
  ],
  recommendedLooks: [
    {
      id: 'clean-glow-neutral',
      imageSource: styleOjiGirl,
      title: '클린 글로우 뉴트럴',
      subtitle: '맑은 피부와 로즈 립 중심',
      finish: 'Semi glow',
      matchScore: 96,
      keyColors: ['#F5EEE9', '#C9827D', '#7A5E58'],
      tags: ['데일리', '프리미엄', '차분함'],
    },
    {
      id: 'soft-rose-brown',
      imageSource: styleMoriGirl,
      title: '소프트 로즈 브라운',
      subtitle: '눈매 음영과 말린 장미 컬러',
      finish: 'Soft satin',
      matchScore: 91,
      keyColors: ['#EFE7E0', '#B87570', '#5F4A45'],
      tags: ['오피스', '분위기', '지속력'],
    },
    {
      id: 'clear-mono-chic',
      imageSource: styleCleanSmoky,
      title: '클리어 모노 시크',
      subtitle: '흑백 대비를 살린 얇은 포인트',
      finish: 'Natural matte',
      matchScore: 88,
      keyColors: ['#FAFAFA', '#A9A29C', '#262626'],
      tags: ['촬영', '시크', '미니멀'],
    },
  ],
  avoidExamples: [
    {
      id: 'high-chroma-coral',
      title: '고채도 코랄 풀 메이크업',
      reason: '피부 톤보다 색상이 먼저 보여 얼굴 중심이 분산될 수 있어요.',
    },
    {
      id: 'heavy-smoky',
      title: '두꺼운 블랙 스모키',
      reason: '눈매가 무거워 보여 클린한 분위기와 충돌할 수 있어요.',
    },
  ],
};
