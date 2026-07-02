import {appAssetSource} from '../config/mediaAssets';
import type {MakeupLook} from '../types/profile';

const lookOjiGirl = appAssetSource('images/looks/look-ojigirl.png');
const lookMoriGirl = appAssetSource('images/looks/look-morigirl.png');
const lookCleanSmoky = appAssetSource('images/looks/look-clean-smoky.png');
const lookMuteRosy = appAssetSource('images/looks/look-mute-rosy-daily.png');
const lookRoyalBrown = appAssetSource('images/looks/look-royal-brown.png');
const lookWarmBeige = appAssetSource('images/looks/look-warm-beige-natural.png');
const lookCherryBlossom = appAssetSource('images/looks/look-cherry-blossom-pink.png');
const lookPeachCoral = appAssetSource('images/looks/look-peach-coral.png');
const lookCoolRose = appAssetSource('images/looks/look-cool-rose.png');
const lookBerryPlum = appAssetSource('images/looks/look-berry-plum.png');
const lookDryRose = appAssetSource('images/looks/look-dry-rose.png');
const lookTerracotta = appAssetSource('images/looks/look-terracotta.png');

export const makeupLooksMock: MakeupLook[] = [
  {
    id: 'look-ojigirl',
    title: '클린 오피스',
    moodLabel: 'neutral brown',
    shortDescription: '차분한 브라운 음영과 정돈된 라인으로 완성한 데일리 룩',
    imageSource: lookOjiGirl,
    isSaved: true,
    scope: 'totalMakeup',
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: 'neutral-brown',
      typeId: 'daily',
      textureId: 'soft-matte',
      shapeId: 'balanced',
    },
  },
  {
    id: 'look-morigirl',
    title: '소프트 모리',
    moodLabel: 'soft natural',
    shortDescription: '피치 베이지와 자연스러운 혈색을 살린 부드러운 룩',
    imageSource: lookMoriGirl,
    isSaved: true,
    scope: 'totalMakeup',
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: 'peach-beige',
      typeId: 'natural',
      textureId: 'soft-glow',
      shapeId: 'rounded',
    },
  },
  {
    id: 'look-clean-smoky',
    title: '클린 스모키',
    moodLabel: 'clean smoky',
    shortDescription: '깨끗한 피부 위에 브라운 라인으로 선명도를 더한 룩',
    imageSource: lookCleanSmoky,
    isSaved: true,
    scope: 'totalMakeup',
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: 'clean-brown',
      typeId: 'smoky',
      textureId: 'satin',
      shapeId: 'defined-eye',
    },
  },
  {
    id: 'look-mute-rosy-daily',
    title: '뮤트 로지 데일리',
    moodLabel: 'mute rosy',
    shortDescription: '낮은 채도의 로즈 컬러로 차분하게 정돈한 데일리 룩',
    imageSource: lookMuteRosy,
    isSaved: true,
    scope: 'totalMakeup',
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: 'mute-rose',
      typeId: 'daily',
      textureId: 'semi-glow',
      shapeId: 'soft-balance',
    },
  },
  {
    id: 'look-royal-brown',
    title: '로열 브라운 무드',
    moodLabel: 'royal brown',
    shortDescription: '깊이 있는 브라운 음영과 차분한 립을 조합한 무드 룩',
    imageSource: lookRoyalBrown,
    isSaved: true,
    scope: 'totalMakeup',
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: 'royal-brown',
      typeId: 'mood',
      textureId: 'velvet',
      shapeId: 'deep-contour',
    },
  },
  {
    id: 'look-warm-beige-natural',
    title: '웜 베이지 내추럴',
    moodLabel: 'warm beige',
    shortDescription: '베이지 톤으로 부드럽게 정돈한 자연스러운 메이크업 룩',
    imageSource: lookWarmBeige,
    isSaved: true,
    scope: 'totalMakeup',
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: 'warm-beige',
      typeId: 'natural',
      textureId: 'skin-like',
      shapeId: 'natural-fit',
    },
  },
  {
    id: 'look-cherry-blossom-pink',
    title: '체리 블라썸 핑크',
    moodLabel: 'cherry pink',
    shortDescription: '맑은 핑크 혈색과 은은한 광을 살린 화사한 룩',
    imageSource: lookCherryBlossom,
    isSaved: false,
    scope: 'totalMakeup',
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: 'cherry-pink',
      typeId: 'fresh',
      textureId: 'glow',
      shapeId: 'bright-center',
    },
  },
  {
    id: 'look-peach-coral',
    title: '피치 코랄',
    moodLabel: 'peach coral',
    shortDescription: '봄웜 톤에 어울리는 피치빛 글로우 메이크업 룩',
    imageSource: lookPeachCoral,
    isSaved: false,
    scope: 'totalMakeup',
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: 'peach-coral',
      typeId: 'fresh',
      textureId: 'glow',
      shapeId: 'warm-lift',
    },
  },
  {
    id: 'look-cool-rose',
    title: '쿨 로즈',
    moodLabel: 'cool rose',
    shortDescription: '차가운 로즈 톤을 맑게 얹은 쿨톤 데일리 룩',
    imageSource: lookCoolRose,
    isSaved: false,
    scope: 'totalMakeup',
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: 'cool-rose',
      typeId: 'daily',
      textureId: 'clear',
      shapeId: 'cool-balance',
    },
  },
  {
    id: 'look-berry-plum',
    title: '베리 플럼',
    moodLabel: 'berry plum',
    shortDescription: '선명한 베리 컬러로 입체감을 더한 포인트 룩',
    imageSource: lookBerryPlum,
    isSaved: false,
    scope: 'pointMakeup',
    makeupArea: 'lip',
    makeupPresetValues: {
      colorId: 'berry-plum',
      typeId: 'tint',
      textureId: 'gloss',
      shapeId: 'over-lip-soft',
    },
  },
  {
    id: 'look-dry-rose',
    title: '드라이 로즈',
    moodLabel: 'dry rose',
    shortDescription: '말린 장미빛 컬러로 성숙하게 정돈한 로즈 룩',
    imageSource: lookDryRose,
    isSaved: false,
    scope: 'pointMakeup',
    makeupArea: 'lip',
    makeupPresetValues: {
      colorId: 'dry-rose',
      typeId: 'lipstick',
      textureId: 'matte',
      shapeId: 'blurred-edge',
    },
  },
  {
    id: 'look-terracotta',
    title: '테라코타',
    moodLabel: 'terracotta',
    shortDescription: '따뜻한 테라코타 톤으로 선명한 분위기를 만든 룩',
    imageSource: lookTerracotta,
    isSaved: false,
    scope: 'pointMakeup',
    makeupArea: 'cheek',
    makeupPresetValues: {
      colorId: 'terracotta',
      typeId: 'blush',
      textureId: 'powder',
      shapeId: 'diagonal-cheek',
    },
  },
];
