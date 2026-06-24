import type {ImageSourcePropType} from 'react-native';

import type {MakeupLook} from '../types/myPage';

const lookOjiGirl =
  require('../../assets/images/looks/look-ojigirl.png') as ImageSourcePropType;
const lookMoriGirl =
  require('../../assets/images/looks/look-morigirl.png') as ImageSourcePropType;
const lookCleanSmoky =
  require('../../assets/images/looks/look-clean-smoky.png') as ImageSourcePropType;
const lookMuteRosy =
  require('../../assets/images/looks/look-mute-rosy-daily.png') as ImageSourcePropType;
const lookRoyalBrown =
  require('../../assets/images/looks/look-royal-brown.png') as ImageSourcePropType;
const lookWarmBeige =
  require('../../assets/images/looks/look-warm-beige-natural.png') as ImageSourcePropType;
const lookCherryBlossom =
  require('../../assets/images/looks/look-cherry-blossom-pink.png') as ImageSourcePropType;
const lookPeachCoral =
  require('../../assets/images/looks/look-peach-coral.png') as ImageSourcePropType;
const lookCoolRose =
  require('../../assets/images/looks/look-cool-rose.png') as ImageSourcePropType;
const lookBerryPlum =
  require('../../assets/images/looks/look-berry-plum.png') as ImageSourcePropType;
const lookDryRose =
  require('../../assets/images/looks/look-dry-rose.png') as ImageSourcePropType;
const lookTerracotta =
  require('../../assets/images/looks/look-terracotta.png') as ImageSourcePropType;

export const makeupLooksMock: MakeupLook[] = [
  {
    id: 'look-ojigirl',
    title: '클린 오피스',
    moodLabel: 'neutral brown',
    shortDescription: '차분한 브라운 음영과 정돈된 라인으로 완성한 데일리 룩',
    imageSource: lookOjiGirl,
    isSaved: true,
  },
  {
    id: 'look-morigirl',
    title: '소프트 모리',
    moodLabel: 'soft natural',
    shortDescription: '피치 베이지와 자연스러운 혈색을 살린 부드러운 룩',
    imageSource: lookMoriGirl,
    isSaved: true,
  },
  {
    id: 'look-clean-smoky',
    title: '클린 스모키',
    moodLabel: 'clean smoky',
    shortDescription: '깨끗한 피부 위에 브라운 라인으로 선명도를 더한 룩',
    imageSource: lookCleanSmoky,
    isSaved: true,
  },
  {
    id: 'look-mute-rosy-daily',
    title: '뮤트 로지 데일리',
    moodLabel: 'mute rosy',
    shortDescription: '낮은 채도의 로즈 컬러로 차분하게 정돈한 데일리 룩',
    imageSource: lookMuteRosy,
    isSaved: true,
  },
  {
    id: 'look-royal-brown',
    title: '로열 브라운 무드',
    moodLabel: 'royal brown',
    shortDescription: '깊이 있는 브라운 음영과 차분한 립을 조합한 무드 룩',
    imageSource: lookRoyalBrown,
    isSaved: true,
  },
  {
    id: 'look-warm-beige-natural',
    title: '웜 베이지 내추럴',
    moodLabel: 'warm beige',
    shortDescription: '베이지 톤으로 부드럽게 정돈한 자연스러운 메이크업 룩',
    imageSource: lookWarmBeige,
    isSaved: true,
  },
  {
    id: 'look-cherry-blossom-pink',
    title: '체리 블라썸 핑크',
    moodLabel: 'cherry pink',
    shortDescription: '맑은 핑크 혈색과 은은한 광을 살린 화사한 룩',
    imageSource: lookCherryBlossom,
    isSaved: false,
  },
  {
    id: 'look-peach-coral',
    title: '피치 코랄',
    moodLabel: 'peach coral',
    shortDescription: '봄웜 톤에 어울리는 피치빛 글로우 메이크업 룩',
    imageSource: lookPeachCoral,
    isSaved: false,
  },
  {
    id: 'look-cool-rose',
    title: '쿨 로즈',
    moodLabel: 'cool rose',
    shortDescription: '차가운 로즈 톤을 맑게 얹은 쿨톤 데일리 룩',
    imageSource: lookCoolRose,
    isSaved: false,
  },
  {
    id: 'look-berry-plum',
    title: '베리 플럼',
    moodLabel: 'berry plum',
    shortDescription: '선명한 베리 컬러로 입체감을 더한 포인트 룩',
    imageSource: lookBerryPlum,
    isSaved: false,
  },
  {
    id: 'look-dry-rose',
    title: '드라이 로즈',
    moodLabel: 'dry rose',
    shortDescription: '말린 장미빛 컬러로 성숙하게 정돈한 로즈 룩',
    imageSource: lookDryRose,
    isSaved: false,
  },
  {
    id: 'look-terracotta',
    title: '테라코타',
    moodLabel: 'terracotta',
    shortDescription: '따뜻한 테라코타 톤으로 선명한 분위기를 만든 룩',
    imageSource: lookTerracotta,
    isSaved: false,
  },
];