import type {ImageSourcePropType} from 'react-native';

import type {ARMakeupGuideData, RecommendationResult} from '../types/makeupGuide';

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
  analyzedAtLabel: '방금 촬영한 얼굴 진단 기준',
  previewImageSource: reportBareFace,
  summary:
    '맑고 정돈된 피부 표현과 뉴트럴 로즈 컬러가 얼굴의 선을 부드럽게 살려줘요.',
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
    '립은 뉴트럴 로즈와 말린 장미 계열이 자연스러움',
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

export const mockARMakeupGuideData: ARMakeupGuideData = {
  categories: [
    {id: 'recommended', label: '추천'},
    {id: 'trend', label: '트렌드'},
    {id: 'personalColor', label: '퍼스널컬러'},
    {id: 'popular', label: '인기'},
  ],
  faceParts: [
    {id: 'all', label: '전체'},
    {id: 'base', label: '베이스'},
    {id: 'eye', label: '아이'},
    {id: 'lip', label: '립'},
    {id: 'contour', label: '컨투어'},
  ],
  filters: [
    {
      id: 'neutral-rose-guide',
      imageSource: styleOjiGirl,
      categoryId: 'recommended',
      title: '뉴트럴 로즈 가이드',
      subtitle: '세미 글로우 베이스와 로즈 립',
      intensityLabel: '자연스럽게',
      facePartIds: ['all', 'base', 'eye', 'lip'],
      colorOptions: [
        {id: 'rose', label: '로즈', hex: '#C9827D'},
        {id: 'nude', label: '누드', hex: '#D9B8A8'},
        {id: 'brown', label: '브라운', hex: '#7A5E58'},
      ],
      typeOptions: [
        {id: 'lipstick', label: '립스틱'},
        {id: 'balm', label: '틴티드 밤'},
        {id: 'shadow', label: '음영 섀도우'},
      ],
      textureOptions: [
        {id: 'semi-glow', label: '세미 글로우'},
        {id: 'satin', label: '새틴'},
        {id: 'soft-matte', label: '소프트 매트'},
      ],
    },
    {
      id: 'clean-brown-eye',
      imageSource: styleMoriGirl,
      categoryId: 'recommended',
      title: '클린 브라운 아이',
      subtitle: '눈매 중심의 얇은 음영',
      intensityLabel: '가볍게',
      facePartIds: ['eye', 'contour'],
      colorOptions: [
        {id: 'ash-brown', label: '애쉬 브라운', hex: '#8A756E'},
        {id: 'taupe', label: '토프', hex: '#B8AAA2'},
        {id: 'deep', label: '딥 브라운', hex: '#4D403C'},
      ],
      typeOptions: [
        {id: 'powder-shadow', label: '파우더 섀도우'},
        {id: 'liner', label: '소프트 라이너'},
      ],
      textureOptions: [
        {id: 'matte', label: '매트'},
        {id: 'sheer', label: '쉬어'},
      ],
    },
    {
      id: 'mono-chic-filter',
      imageSource: styleCleanSmoky,
      categoryId: 'trend',
      title: '모노 시크 필터',
      subtitle: '무채색 대비를 살린 촬영용 룩',
      intensityLabel: '선명하게',
      facePartIds: ['all', 'eye', 'lip'],
      colorOptions: [
        {id: 'mono', label: '모노', hex: '#262626'},
        {id: 'cool-gray', label: '쿨 그레이', hex: '#9A9A9A'},
        {id: 'clear', label: '클리어', hex: '#F7F7F7'},
      ],
      typeOptions: [
        {id: 'gloss', label: '립글로즈'},
        {id: 'liner', label: '아이라이너'},
      ],
      textureOptions: [
        {id: 'clear-glow', label: '클리어 글로우'},
        {id: 'natural-matte', label: '내추럴 매트'},
      ],
    },
    {
      id: 'personal-muted-rose',
      imageSource: styleMoriGirl,
      categoryId: 'personalColor',
      title: '뮤트 로즈 퍼스널',
      subtitle: '뉴트럴 톤에 맞춘 저채도 컬러',
      intensityLabel: '차분하게',
      facePartIds: ['base', 'lip'],
      colorOptions: [
        {id: 'muted-rose', label: '뮤트 로즈', hex: '#B87570'},
        {id: 'beige', label: '베이지', hex: '#E7D8CF'},
        {id: 'soft-plum', label: '소프트 플럼', hex: '#80636B'},
      ],
      typeOptions: [
        {id: 'cream-blush', label: '크림 블러셔'},
        {id: 'lipstick', label: '립스틱'},
      ],
      textureOptions: [
        {id: 'velvet', label: '벨벳'},
        {id: 'satin', label: '새틴'},
      ],
    },
    {
      id: 'popular-glow-lip',
      imageSource: styleOjiGirl,
      categoryId: 'popular',
      title: '글로우 립 포커스',
      subtitle: '촬영에서 입술 존재감을 살리는 필터',
      intensityLabel: '촉촉하게',
      facePartIds: ['lip'],
      colorOptions: [
        {id: 'glow-rose', label: '글로우 로즈', hex: '#C76F75'},
        {id: 'clear-red', label: '클리어 레드', hex: '#B94B50'},
        {id: 'milk-tea', label: '밀크티', hex: '#C6A28E'},
      ],
      typeOptions: [
        {id: 'lip-gloss', label: '립글로즈'},
        {id: 'tint', label: '워터 틴트'},
      ],
      textureOptions: [
        {id: 'glass', label: '글래스'},
        {id: 'balmy', label: '밤 광'},
      ],
    },
  ],
};
