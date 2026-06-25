import type {ImageSourcePropType} from 'react-native';

import type {MakeupStyle} from '../types/profile';

const styleOjiGirl =
  require('../../assets/images/looks/look-ojigirl.png') as ImageSourcePropType;
const styleMoriGirl =
  require('../../assets/images/looks/look-morigirl.png') as ImageSourcePropType;
const styleCleanSmoky =
  require('../../assets/images/looks/look-clean-smoky.png') as ImageSourcePropType;
const styleMuteRosy =
  require('../../assets/images/looks/look-mute-rosy-daily.png') as ImageSourcePropType;
const styleRoyalBrown =
  require('../../assets/images/looks/look-royal-brown.png') as ImageSourcePropType;
const styleWarmBeige =
  require('../../assets/images/looks/look-warm-beige-natural.png') as ImageSourcePropType;
const styleCherryBlossom =
  require('../../assets/images/looks/look-cherry-blossom-pink.png') as ImageSourcePropType;
const stylePeachCoral =
  require('../../assets/images/looks/look-peach-coral.png') as ImageSourcePropType;
const styleCoolRose =
  require('../../assets/images/looks/look-cool-rose.png') as ImageSourcePropType;
const styleBerryPlum =
  require('../../assets/images/looks/look-berry-plum.png') as ImageSourcePropType;
const styleDryRose =
  require('../../assets/images/looks/look-dry-rose.png') as ImageSourcePropType;
const styleTerracotta =
  require('../../assets/images/looks/look-terracotta.png') as ImageSourcePropType;

export const makeupStylesMock: MakeupStyle[] = [
  {
    id: 'style-ojigirl',
    title: '클린 오피스',
    moodLabel: 'neutral brown',
    shortDescription: '차분한 브라운 음영과 정돈된 라인으로 완성한 데일리 스타일',
    imageSource: styleOjiGirl,
    isSaved: true,
  },
  {
    id: 'style-morigirl',
    title: '소프트 모리',
    moodLabel: 'soft natural',
    shortDescription: '피치 베이지와 자연스러운 혈색을 살린 부드러운 스타일',
    imageSource: styleMoriGirl,
    isSaved: true,
  },
  {
    id: 'style-clean-smoky',
    title: '클린 스모키',
    moodLabel: 'clean smoky',
    shortDescription: '깨끗한 피부 위에 브라운 라인으로 선명도를 더한 스타일',
    imageSource: styleCleanSmoky,
    isSaved: true,
  },
  {
    id: 'style-mute-rosy-daily',
    title: '뮤트 로지 데일리',
    moodLabel: 'mute rosy',
    shortDescription: '낮은 채도의 로즈 컬러로 차분하게 정돈한 데일리 스타일',
    imageSource: styleMuteRosy,
    isSaved: true,
  },
  {
    id: 'style-royal-brown',
    title: '로열 브라운 무드',
    moodLabel: 'royal brown',
    shortDescription: '깊이 있는 브라운 음영과 차분한 립을 조합한 무드 스타일',
    imageSource: styleRoyalBrown,
    isSaved: true,
  },
  {
    id: 'style-warm-beige-natural',
    title: '웜 베이지 내추럴',
    moodLabel: 'warm beige',
    shortDescription: '베이지 톤으로 부드럽게 정돈한 자연스러운 메이크업 스타일',
    imageSource: styleWarmBeige,
    isSaved: true,
  },
  {
    id: 'style-cherry-blossom-pink',
    title: '체리 블라썸 핑크',
    moodLabel: 'cherry pink',
    shortDescription: '맑은 핑크 혈색과 은은한 광을 살린 화사한 스타일',
    imageSource: styleCherryBlossom,
    isSaved: false,
  },
  {
    id: 'style-peach-coral',
    title: '피치 코랄',
    moodLabel: 'peach coral',
    shortDescription: '봄웜 톤에 어울리는 피치빛 글로우 메이크업 스타일',
    imageSource: stylePeachCoral,
    isSaved: false,
  },
  {
    id: 'style-cool-rose',
    title: '쿨 로즈',
    moodLabel: 'cool rose',
    shortDescription: '차가운 로즈 톤을 맑게 얹은 쿨톤 데일리 스타일',
    imageSource: styleCoolRose,
    isSaved: false,
  },
  {
    id: 'style-berry-plum',
    title: '베리 플럼',
    moodLabel: 'berry plum',
    shortDescription: '선명한 베리 컬러로 입체감을 더한 포인트 스타일',
    imageSource: styleBerryPlum,
    isSaved: false,
  },
  {
    id: 'style-dry-rose',
    title: '드라이 로즈',
    moodLabel: 'dry rose',
    shortDescription: '말린 장미빛 컬러로 성숙하게 정돈한 로즈 스타일',
    imageSource: styleDryRose,
    isSaved: false,
  },
  {
    id: 'style-terracotta',
    title: '테라코타',
    moodLabel: 'terracotta',
    shortDescription: '따뜻한 테라코타 톤으로 선명한 분위기를 만든 스타일',
    imageSource: styleTerracotta,
    isSaved: false,
  },
];