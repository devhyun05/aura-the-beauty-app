import type {ImageSourcePropType} from 'react-native';

import type {ARMakeupGuideData} from '../types/makeupGuide';

const styleOjiGirl =
  require('../../assets/images/looks/style-oji-girl.png') as ImageSourcePropType;
const styleMoriGirl =
  require('../../assets/images/looks/style-mori-girl.png') as ImageSourcePropType;
const styleCleanSmoky =
  require('../../assets/images/looks/style-clean-smoky.png') as ImageSourcePropType;

export const mockARMakeupGuideData: ARMakeupGuideData = {
  categories: [
    {id: 'recommended', label: 'AI 생성'},
    {id: 'trend', label: '트렌드'},
    {id: 'personalColor', label: '퍼스널컬러'},
    {id: 'popular', label: '인기'},
  ],
  comparisonModes: [
    {
      id: 'left',
      label: '왼쪽',
      description: '왼쪽 얼굴 영역에만 필터가 적용된 상태를 mock으로 표현해요.',
    },
    {
      id: 'right',
      label: '오른쪽',
      description: '오른쪽 얼굴 영역에만 필터가 적용된 상태를 mock으로 표현해요.',
    },
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
      title: '뉴트럴 로즈',
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
