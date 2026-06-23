import type {ImageSourcePropType} from 'react-native';

import type {MakeupLook} from '../types/userPage';

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
  require('../../assets/images/makeup-look/look-muted-rose.png') as ImageSourcePropType;
const lookBerryPlum =
  require('../../assets/images/looks/look-berry-plum.png') as ImageSourcePropType;
const lookDryRose =
  require('../../assets/images/looks/look-dry-rose.png') as ImageSourcePropType;
const lookTerracotta =
  require('../../assets/images/looks/look-terracotta.png') as ImageSourcePropType;

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
    id: 'look-mute-rosy-daily',
    title: '뮤트 로지 데일리 룩',
    moodLabel: 'mute rosy',
    shortDescription: '낮은 채도의 로즈 컬러로 정돈한 데일리 룩',
    imageSource: lookMuteRosy,
    isSaved: true,
  },
  {
    id: 'look-royal-brown',
    title: '로얄 브라운 무드 룩',
    moodLabel: 'royal brown',
    shortDescription: '브라운 음영과 차분한 립을 조합한 무드 룩',
    imageSource: lookRoyalBrown,
    isSaved: true,
  },
  {
    id: 'look-warm-beige-natural',
    title: '웜 베이지 내추럴 룩',
    moodLabel: 'warm beige',
    shortDescription: '베이지 톤으로 부드럽게 정돈한 내추럴 룩',
    imageSource: lookWarmBeige,
    isSaved: true,
  },
  {
    id: 'look-cherry-blossom-pink',
    title: '벚꽃 핑크 룩',
    moodLabel: 'cherry pink',
    shortDescription: '은은한 핑크 혈색을 살린 화사한 룩',
    imageSource: lookCherryBlossom,
    isSaved: false,
  },
  {
    id: 'look-peach-coral',
    title: '피치 코랄 룩',
    moodLabel: 'peach coral',
    shortDescription: '봄웜 톤에 맞는 피치빛 글로우 룩',
    imageSource: lookPeachCoral,
    isSaved: false,
  },
  {
    id: 'look-cool-rose',
    title: '쿨 로즈 룩',
    moodLabel: 'cool rose',
    shortDescription: '로즈 톤을 낮게 얹은 차분한 룩',
    imageSource: lookCoolRose,
    isSaved: false,
  },
  {
    id: 'look-berry-plum',
    title: '베리 플럼 룩',
    moodLabel: 'berry plum',
    shortDescription: '쿨한 베리 컬러를 포인트로 둔 룩',
    imageSource: lookBerryPlum,
    isSaved: false,
  },
  {
    id: 'look-dry-rose',
    title: '말린 장미 룩',
    moodLabel: 'dry rose',
    shortDescription: '말린 장미빛으로 성숙하게 정돈한 룩',
    imageSource: lookDryRose,
    isSaved: false,
  },
  {
    id: 'look-terracotta',
    title: '테라코타 룩',
    moodLabel: 'terracotta',
    shortDescription: '따뜻한 테라코타 톤의 선명한 무드 룩',
    imageSource: lookTerracotta,
    isSaved: false,
  },
];
