// apps/mobile/src/features/recommendation/mocks/auradin.mock.ts
//
// Draft data for the redesigned Auradin search screen. Copy is short, calm and
// natural Korean. Candidate `matchSummary` is shown as the "왜 맞는지" line.

import type {ImageSourcePropType} from 'react-native';

import {appAssetSource} from '../../../shared/config/mediaAssets';
import type {AuradinDraftData} from '../types';

const roseGlossTint = appAssetSource('images/products/laurelle-gloss-rose-veil.png') as ImageSourcePropType;
const airyTint = appAssetSource('images/products/lunera-airy-tint-rose-mist.png') as ImageSourcePropType;
const liquidBlush = appAssetSource('images/products/lunera-liquid-blush-peach-dusk.png') as ImageSourcePropType;

export const auradinDraftMock: AuradinDraftData = {
  conditionChips: ['쿨톤', '글로시', '2만원 이하', '덜 진하게'],
  quickPrompts: [
    {
      id: 'cool-gloss-lip',
      label: '쿨톤 글로시 립',
      prompt: '쿨톤인데 너무 진하지 않은 글로시 립 찾아줘',
    },
    {
      id: 'recipe-match',
      label: 'AR 립이랑 비슷하게',
      prompt: 'AR에서 저장한 립 색이랑 비슷한 제품 찾아줘',
    },
    {
      id: 'interview-cheek',
      label: '면접용 블러셔',
      prompt: '면접용으로 자연스럽고 붉지 않은 블러셔 찾아줘',
    },
    {
      id: 'oliveyoung-only',
      label: '올리브영에서만',
      prompt: '올리브영에서 살 수 있는 데일리 제품만 보여줘',
    },
  ],
  sourceCards: [
    {
      id: 'recipe',
      title: '저장한 레시피',
      description: '립 색상과 질감을 기준으로 찾기',
      tone: 'AR',
    },
    {
      id: 'photo',
      title: '사진으로 찾기',
      description: '이미지 속 색감과 비슷하게',
      tone: 'PHOTO',
    },
    {
      id: 'profile',
      title: '내 톤 기준',
      description: '얼굴 분석 결과로 좁히기',
      tone: 'TONE',
    },
  ],
  thinkingSteps: [
    {
      id: 'tone',
      label: '색감 정리',
      status: 'done',
    },
    {
      id: 'candidates',
      label: '후보 좁히는 중',
      status: 'active',
    },
    {
      id: 'offers',
      label: '구매 링크 확인',
      status: 'pending',
    },
  ],
  question: {
    id: 'color-family',
    title: '맑은 핑크와 차분한 로즈, 어느 쪽이 좋아요?',
    options: [
      {
        id: 'clear-pink',
        label: '맑은 핑크',
        swatch: '#EFA3B4',
      },
      {
        id: 'calm-rose',
        label: '차분한 로즈',
        swatch: '#B85E68',
      },
      {
        id: 'either',
        label: '둘 다 좋아요',
      },
    ],
  },
  candidates: [
    {
      id: 'laurelle-gloss-rose-veil',
      brandName: '로렐',
      productName: '글로스 틴트',
      shadeName: '로즈 베일',
      priceText: '19,000원',
      matchSummary: '차분한 로즈 광택이 요청 조건과 가장 가까워요.',
      palette: ['#C95E68', '#EDB1B5'],
      tags: ['로즈', '글로시', '맑은 발색'],
      imageSource: roseGlossTint,
    },
    {
      id: 'lunera-airy-tint-rose-mist',
      brandName: '루네라',
      productName: '에어리 틴트',
      shadeName: '로즈 미스트',
      priceText: '17,000원',
      matchSummary: '진하지 않은 로즈라 데일리 립으로 잘 맞아요.',
      palette: ['#C75E68', '#E79196'],
      tags: ['로즈미스트', '소프트', '데일리'],
      imageSource: airyTint,
    },
    {
      id: 'lunera-liquid-blush-peach-dusk',
      brandName: '루네라',
      productName: '리퀴드 블러쉬',
      shadeName: '피치 더스크',
      priceText: '22,000원',
      matchSummary: '립과 이어지는 부드러운 혈색 후보예요.',
      palette: ['#D77A75', '#F0AAA0'],
      tags: ['치크', '소프트', '혈색'],
      imageSource: liquidBlush,
    },
  ],
};
