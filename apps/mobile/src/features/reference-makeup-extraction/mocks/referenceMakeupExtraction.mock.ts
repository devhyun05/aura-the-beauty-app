import type {ImageSourcePropType} from 'react-native';

import type {ReferenceMakeupExtractionData} from '../types';

const styleOjiGirl =
  require('../../../assets/images/looks/style-oji-girl.png') as ImageSourcePropType;
const styleMoriGirl =
  require('../../../assets/images/looks/style-mori-girl.png') as ImageSourcePropType;
const styleCleanSmoky =
  require('../../../assets/images/looks/style-clean-smoky.png') as ImageSourcePropType;
const reportBareFace =
  require('../../../assets/images/analysis/report-bare-face-20260622.png') as ImageSourcePropType;
const reportRetake =
  require('../../../assets/images/analysis/report-retake-20260608.png') as ImageSourcePropType;
const analysisStudio =
  require('../../../assets/images/analysis/analysis-studio.png') as ImageSourcePropType;
const analysisWindow =
  require('../../../assets/images/analysis/analysis-window.png') as ImageSourcePropType;
const analysisSoftLight =
  require('../../../assets/images/analysis/analysis-soft-light.png') as ImageSourcePropType;

export const referenceMakeupExtractionMock: ReferenceMakeupExtractionData = {
  photos: [
    {
      id: 'influencer-muted-rose',
      title: '뮤트 로즈 인플루언서 스타일',
      source: 'album',
      imageSource: styleOjiGirl,
    },
    {
      id: 'trend-soft-mori',
      title: '소프트 모리 트렌드 스타일',
      source: 'album',
      imageSource: styleMoriGirl,
    },
    {
      id: 'clean-smoky',
      title: '클린 스모키 화보 스타일',
      source: 'album',
      imageSource: styleCleanSmoky,
    },
    {
      id: 'bright-portrait',
      title: '밝은 피부 로즈 스타일',
      source: 'album',
      imageSource: reportBareFace,
    },
    {
      id: 'daily-style',
      title: '데일리 스타일 샘플',
      source: 'album',
      imageSource: reportRetake,
    },
    {
      id: 'studio-cool-rose',
      title: '스튜디오 쿨 로즈',
      source: 'album',
      imageSource: analysisStudio,
    },
    {
      id: 'window-glow',
      title: '윈도우 글로우 스타일',
      source: 'album',
      imageSource: analysisWindow,
    },
    {
      id: 'soft-light',
      title: '소프트 라이트 스타일',
      source: 'album',
      imageSource: analysisSoftLight,
    },
  ],
  loadingSteps: [
    {
      id: 'face-tone',
      label: '얼굴 윤곽과 피부 톤 분석',
      status: 'done',
    },
    {
      id: 'eye-makeup',
      label: '눈 메이크업 색감 추출',
      status: 'done',
    },
    {
      id: 'lip-cheek',
      label: '립과 치크 밸런스 분석',
      status: 'active',
    },
    {
      id: 'style-map',
      label: '메이크업 스타일 맵 생성',
      status: 'waiting',
    },
  ],
  extractedMakeupStyle: {
    id: 'muted-pink-daily-style',
    title: '어리어리 핑크 데일리 스타일',
    subtitle: '차분한 로즈 베이지 톤에 눈매 음영과 맑은 립을 더한 스타일이에요.',
    imageSource: styleOjiGirl,
    tags: ['#데일리', '#뮤트톤', '#로즈베이지', '#은은한음영'],
    accuracy: 92,
    palette: [
      {
        id: 'base',
        label: '베이스',
        hex: '#E9D6CB',
        description: '밝은 아이보리 베이스에 광을 낮게 정리',
      },
      {
        id: 'eye',
        label: '아이',
        hex: '#B47A70',
        description: '로즈 브라운 음영으로 눈매를 또렷하게',
      },
      {
        id: 'cheek',
        label: '치크',
        hex: '#D6948B',
        description: '볼 중앙보다 살짝 위에 얇게 번지는 혈색',
      },
      {
        id: 'lip',
        label: '립',
        hex: '#B85E61',
        description: '입술 중심은 선명하게, 외곽은 부드럽게',
      },
    ],
    points: [
      {
        id: 'eye-shadow',
        title: '눈매 음영',
        description: '쌍꺼풀 라인 위로 로즈 브라운을 얇게 올려 깊이를 만들어요.',
      },
      {
        id: 'cheek-placement',
        title: '치크 위치',
        description: '광대 위쪽에 넓게 퍼지는 형태라 얼굴 중심이 맑아 보여요.',
      },
      {
        id: 'lip-gradient',
        title: '립 그라데이션',
        description: '외곽은 흐리고 중앙은 또렷해서 자연스러운 생기가 살아나요.',
      },
    ],
  },
};
