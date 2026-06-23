import type { ImageSourcePropType } from 'react-native';

import type { MakeupLook } from '../types/userPage';

const lookOjiGirl =
  require('../../assets/images/looks/look-ojigirl.png') as ImageSourcePropType;
const lookMoriGirl =
  require('../../assets/images/looks/look-morigirl.png') as ImageSourcePropType;
const lookCleanSmoky =
  require('../../assets/images/looks/look-clean-smoky.png') as ImageSourcePropType;
const lookPeachCoral =
  require('../../assets/images/looks/look-peach-coral.png') as ImageSourcePropType;
const lookCoolRose =
  require('../../assets/images/looks/look-cool-rose.png') as ImageSourcePropType;
const lookWarmBeige =
  require('../../assets/images/looks/look-warm-beige-natural.png') as ImageSourcePropType;

export const makeupLooksMock: MakeupLook[] = [
  {
    id: 'look-ojigirl',
    title: '오지걸',
    moodLabel: 'clear coral',
    shortDescription: '맑은 코랄과 윤광 피부를 살린 데일리 룩',
    imageSource: lookOjiGirl,
    isSaved: true,
  },
  {
    id: 'look-morigirl',
    title: '모리걸',
    moodLabel: 'soft natural',
    shortDescription: '부드러운 베이지와 자연스러운 혈색 중심의 룩',
    imageSource: lookMoriGirl,
    isSaved: true,
  },
  {
    id: 'look-clean-smoky',
    title: '클린 스모키',
    moodLabel: 'clean smoky',
    shortDescription: '깔끔한 라인과 차분한 음영을 더한 룩',
    imageSource: lookCleanSmoky,
    isSaved: true,
  },
  {
    id: 'look-peach-coral',
    title: '피치 코랄',
    moodLabel: 'peach glow',
    shortDescription: '봄웜 톤에 맞는 피치빛 글로우 룩',
    imageSource: lookPeachCoral,
    isSaved: false,
  },
  {
    id: 'look-cool-rose',
    title: '쿨 로즈',
    moodLabel: 'rose tone',
    shortDescription: '로즈 톤을 낮게 얹은 차분한 룩',
    imageSource: lookCoolRose,
    isSaved: false,
  },
  {
    id: 'look-warm-beige-natural',
    title: '웜 베이지',
    moodLabel: 'warm beige',
    shortDescription: '베이지 톤으로 부드럽게 정돈한 내추럴 룩',
    imageSource: lookWarmBeige,
    isSaved: false,
  },
];
