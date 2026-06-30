import type {ImageSourcePropType} from 'react-native';

import type {
  ARMakeupGuideData,
  FilterCategoryId,
  FilterColorOption,
  FilterTextOption,
  MakeupArea,
  RecommendedMakeupFilter,
} from '../types/makeupGuide';

const filterCleanSmokyCity =
  require('../../assets/images/makeup-filters/filter-clean-smoky-city.png') as ImageSourcePropType;
const filterGyaruGlow =
  require('../../assets/images/makeup-filters/filter-gyaru-glow.png') as ImageSourcePropType;
const filterKuroGyaruBronze =
  require('../../assets/images/makeup-filters/filter-kuro-gyaru-bronze.png') as ImageSourcePropType;
const filterOneGyaruRose =
  require('../../assets/images/makeup-filters/filter-one-gyaru-rose.png') as ImageSourcePropType;
const filterWaterGlowClean =
  require('../../assets/images/makeup-filters/filter-water-glow-clean.png') as ImageSourcePropType;
const filterGlassSkinNude =
  require('../../assets/images/makeup-filters/filter-glass-skin-nude.png') as ImageSourcePropType;
const filterMilkyStrawberryPink =
  require('../../assets/images/makeup-filters/filter-milky-strawberry-pink.png') as ImageSourcePropType;
const filterMoriGirlNatural =
  require('../../assets/images/makeup-filters/filter-mori-girl-natural.png') as ImageSourcePropType;
const filterDollyLarme =
  require('../../assets/images/makeup-filters/filter-dolly-larme.png') as ImageSourcePropType;
const filterIgariBlush =
  require('../../assets/images/makeup-filters/filter-igari-blush.png') as ImageSourcePropType;
const filterJuiceCoral =
  require('../../assets/images/makeup-filters/filter-juice-coral.png') as ImageSourcePropType;
const filterDouyinPink =
  require('../../assets/images/makeup-filters/filter-douyin-pink.png') as ImageSourcePropType;
const filterLatteBrown =
  require('../../assets/images/makeup-filters/filter-latte-brown.png') as ImageSourcePropType;
const filterOfficeSiren =
  require('../../assets/images/makeup-filters/filter-office-siren.png') as ImageSourcePropType;
const filterSoftGoth =
  require('../../assets/images/makeup-filters/filter-soft-goth.png') as ImageSourcePropType;
const filterWanghongGlassPink =
  require('../../assets/images/makeup-filters/filter-wanghong-glass-pink.png') as ImageSourcePropType;
const filterCloudBlurMatte =
  require('../../assets/images/makeup-filters/filter-cloud-blur-matte.png') as ImageSourcePropType;
const filterAuraBlushLift =
  require('../../assets/images/makeup-filters/filter-aura-blush-lift.png') as ImageSourcePropType;
const filterPlumSyrupGloss =
  require('../../assets/images/makeup-filters/filter-plum-syrup-gloss.png') as ImageSourcePropType;
const filterChromePearlEye =
  require('../../assets/images/makeup-filters/filter-chrome-pearl-eye.png') as ImageSourcePropType;

type RecommendedFilterSeed = Omit<
  RecommendedMakeupFilter,
  'intensityLabel' | 'sourceImageId' | 'subtitle' | 'title'
>;

function colorOptions(
  options: readonly (readonly [string, string, string])[],
): readonly FilterColorOption[] {
  return options.map(([id, label, hex]) => ({id, label, hex}));
}

function textOptions(
  options: readonly (readonly [string, string])[],
): readonly FilterTextOption[] {
  return options.map(([id, label]) => ({id, label}));
}

function createRecommendedFilter(
  filter: RecommendedFilterSeed,
): RecommendedMakeupFilter {
  return {
    ...filter,
    intensityLabel: `${filter.matchScore}% match`,
    sourceImageId: filter.id,
    subtitle: filter.description,
    title: filter.displayTitle,
  };
}

const allPresetArea: MakeupArea = 'all';

export const mockRecommendedMakeupFilters: readonly RecommendedMakeupFilter[] = [
  createRecommendedFilter({
    id: 'filter-clean-smoky-city',
    imageSource: filterCleanSmokyCity,
    categoryId: 'recommended',
    headline: '차가운 도시의',
    displayTitle: '클린 스모키',
    description: '쿨 브라운과 그레이 베이지로 또렷하게 정돈한 도시형 스모키 룩',
    categoryTags: ['smoky', 'brown', 'trend'],
    keywords: ['쿨', '스모키', '브라운', '그레이', '차도녀'],
    embeddingVector: [0.92, 0.18, 0.22, 0.78, 0.26],
    matchScore: 96,
    makeupAreas: ['eye', 'brow', 'lip', 'cheek'],
    colorOptions: colorOptions([
      ['cool-brown', '쿨 브라운', '#6F5A55'],
      ['gray-beige', '그레이 베이지', '#9A8F88'],
      ['rose-nude', '로즈 누드', '#B9777D'],
    ]),
    typeOptions: textOptions([
      ['soft-smoky', '소프트 스모키'],
      ['thin-liner', '얇은 라인'],
      ['mute-lip', '뮤트 립'],
    ]),
    textureOptions: textOptions([
      ['satin', '새틴'],
      ['soft-matte', '소프트 매트'],
      ['sheer', '쉬어'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'cool-brown',
      typeId: 'soft-smoky',
      textureId: 'satin',
      shapeId: 'defined',
      intensity: 0.72,
      finish: 'cool smoky satin',
    },
  }),
  createRecommendedFilter({
    id: 'filter-gyaru-glow',
    imageSource: filterGyaruGlow,
    categoryId: 'trend',
    headline: '빛나는 거리의',
    displayTitle: '갸루 글로우',
    description: '샴페인 펄과 코랄 글로스로 선명도를 살린 하이틴 글로우 룩',
    categoryTags: ['glow', 'trend', 'unique'],
    keywords: ['글로우', '코랄', '펄', '라이너', '갸루'],
    embeddingVector: [0.38, 0.7, 0.6, 0.36, 0.96],
    matchScore: 94,
    makeupAreas: ['eye', 'cheek', 'lip'],
    colorOptions: colorOptions([
      ['champagne-coral', '샴페인 코랄', '#F0B7A2'],
      ['pearl-pink', '펄 핑크', '#F4C7D4'],
      ['clear-liner', '또렷한 라인', '#382A28'],
    ]),
    typeOptions: textOptions([
      ['pearl-shadow', '펄 섀도우'],
      ['sharp-liner', '선명 라이너'],
      ['gloss-lip', '글로스 립'],
    ]),
    textureOptions: textOptions([
      ['pearl-glow', '펄 글로우'],
      ['glass', '글래스'],
      ['balmy', '밤 광'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'champagne-coral',
      typeId: 'pearl-shadow',
      textureId: 'pearl-glow',
      shapeId: 'soft-focus',
      intensity: 0.78,
      finish: 'champagne glow',
    },
  }),
  createRecommendedFilter({
    id: 'filter-kuro-gyaru-bronze',
    imageSource: filterKuroGyaruBronze,
    categoryId: 'trend',
    headline: '브론즈 태닝의',
    displayTitle: '쿠로갸루 무드',
    description: '브론즈 베이스와 골드 하이라이트로 건강한 광을 강조한 룩',
    categoryTags: ['glow', 'brown', 'unique'],
    keywords: ['브론즈', '골드', '태닝', '누드', '갸루'],
    embeddingVector: [0.2, 0.96, 0.32, 0.82, 0.86],
    matchScore: 90,
    makeupAreas: ['base', 'eye', 'cheek', 'lip'],
    colorOptions: colorOptions([
      ['bronze-gold', '브론즈 골드', '#B97943'],
      ['nude-gloss', '누드 글로스', '#B98770'],
      ['deep-cocoa', '딥 코코아', '#4F332A'],
    ]),
    typeOptions: textOptions([
      ['bronze-base', '브론즈 베이스'],
      ['gold-highlight', '골드 하이라이트'],
      ['defined-eye', '강한 아이'],
    ]),
    textureOptions: textOptions([
      ['sun-glow', '선 글로우'],
      ['metallic', '메탈릭'],
      ['gloss', '글로스'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'bronze-gold',
      typeId: 'bronze-base',
      textureId: 'sun-glow',
      shapeId: 'defined',
      intensity: 0.82,
      finish: 'bronze golden glow',
    },
  }),
  createRecommendedFilter({
    id: 'filter-one-gyaru-rose',
    imageSource: filterOneGyaruRose,
    categoryId: 'popular',
    headline: '단정한 어른빛',
    displayTitle: '오네갸루 로즈',
    description: '로즈 브라운 음영과 새틴 립으로 단정하게 깊이를 만든 룩',
    categoryTags: ['brown', 'trend'],
    keywords: ['로즈', '브라운', '새틴', '소프트 래쉬', '성숙'],
    embeddingVector: [0.48, 0.62, 0.58, 0.8, 0.44],
    matchScore: 91,
    makeupAreas: ['eye', 'brow', 'lip'],
    colorOptions: colorOptions([
      ['rose-brown', '로즈 브라운', '#9A5F5F'],
      ['soft-taupe', '소프트 토프', '#A28A80'],
      ['satin-rose', '새틴 로즈', '#B56E79'],
    ]),
    typeOptions: textOptions([
      ['soft-lash', '소프트 래쉬'],
      ['rose-shadow', '로즈 음영'],
      ['satin-lip', '새틴 립'],
    ]),
    textureOptions: textOptions([
      ['satin', '새틴'],
      ['velvet', '벨벳'],
      ['soft-matte', '소프트 매트'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'rose-brown',
      typeId: 'soft-lash',
      textureId: 'satin',
      shapeId: 'balanced',
      intensity: 0.66,
      finish: 'rose satin',
    },
  }),
  createRecommendedFilter({
    id: 'filter-water-glow-clean',
    imageSource: filterWaterGlowClean,
    categoryId: 'personalColor',
    headline: '하얀 조명의',
    displayTitle: '물광 클린',
    description: '클리어 베이스와 젤리 핑크로 투명한 수분감을 만든 룩',
    categoryTags: ['glow', 'pink'],
    keywords: ['물광', '클린', '젤리핑크', '투명', '베이스'],
    embeddingVector: [0.72, 0.34, 0.78, 0.2, 0.98],
    matchScore: 95,
    makeupAreas: ['base', 'cheek', 'lip'],
    colorOptions: colorOptions([
      ['jelly-pink', '젤리 핑크', '#F2AFC2'],
      ['clear-base', '클리어 베이스', '#F6DED7'],
      ['water-rose', '워터 로즈', '#D98998'],
    ]),
    typeOptions: textOptions([
      ['clear-base', '클리어 베이스'],
      ['water-blush', '물빛 치크'],
      ['jelly-lip', '젤리 립'],
    ]),
    textureOptions: textOptions([
      ['water-glow', '물광'],
      ['glass', '글래스'],
      ['sheer', '쉬어'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'jelly-pink',
      typeId: 'clear-base',
      textureId: 'water-glow',
      shapeId: 'soft-focus',
      intensity: 0.54,
      finish: 'clear water glow',
    },
  }),
  createRecommendedFilter({
    id: 'filter-glass-skin-nude',
    imageSource: filterGlassSkinNude,
    categoryId: 'personalColor',
    headline: '유리알 피부의',
    displayTitle: '윤광 누디',
    description: '누드 베이지와 피부광을 중심으로 얇게 입체감을 준 룩',
    categoryTags: ['glow', 'brown'],
    keywords: ['윤광', '누디', '베이지', '컨투어', '글래스'],
    embeddingVector: [0.58, 0.55, 0.24, 0.68, 0.94],
    matchScore: 92,
    makeupAreas: ['base', 'contour', 'lip'],
    colorOptions: colorOptions([
      ['nude-beige', '누드 베이지', '#C9A18A'],
      ['skin-glow', '스킨 글로우', '#E2C6B4'],
      ['soft-brown', '연한 브라운', '#A47F6B'],
    ]),
    typeOptions: textOptions([
      ['glass-base', '윤광 베이스'],
      ['soft-contour', '소프트 컨투어'],
      ['nude-lip', '누디 립'],
    ]),
    textureOptions: textOptions([
      ['glass', '글래스'],
      ['skin-like', '스킨 라이크'],
      ['satin', '새틴'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'nude-beige',
      typeId: 'glass-base',
      textureId: 'glass',
      shapeId: 'balanced',
      intensity: 0.58,
      finish: 'glass nude sheen',
    },
  }),
  createRecommendedFilter({
    id: 'filter-milky-strawberry-pink',
    imageSource: filterMilkyStrawberryPink,
    categoryId: 'popular',
    headline: '딸기 우유빛',
    displayTitle: '밀키 핑크',
    description: '밀키 핑크와 라이트 모브로 말랑한 혈색을 얹은 룩',
    categoryTags: ['pink', 'trend'],
    keywords: ['딸기우유', '핑크', '코켓', '발레코어', '블러셔'],
    embeddingVector: [0.5, 0.42, 0.98, 0.18, 0.7],
    matchScore: 93,
    makeupAreas: ['cheek', 'lip', 'eye'],
    colorOptions: colorOptions([
      ['milky-pink', '밀키 핑크', '#F3AFC8'],
      ['light-mauve', '라이트 모브', '#C99AB4'],
      ['soft-blush', '소프트 블러셔', '#F1B7BC'],
    ]),
    typeOptions: textOptions([
      ['blur-blush', '블러 치크'],
      ['mauve-shadow', '모브 섀도우'],
      ['milk-lip', '밀크 립'],
    ]),
    textureOptions: textOptions([
      ['soft-blur', '소프트 블러'],
      ['balmy', '밤 광'],
      ['sheer', '쉬어'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'milky-pink',
      typeId: 'blur-blush',
      textureId: 'soft-blur',
      shapeId: 'soft-focus',
      intensity: 0.62,
      finish: 'milky pink blur',
    },
  }),
  createRecommendedFilter({
    id: 'filter-mori-girl-natural',
    imageSource: filterMoriGirlNatural,
    categoryId: 'personalColor',
    headline: '숲속 오후의',
    displayTitle: '모리걸 내추럴',
    description: '세이지 브라운과 살구 베이지로 담백하게 정돈한 내추럴 룩',
    categoryTags: ['brown', 'unique'],
    keywords: ['모리걸', '내추럴', '세이지', '살구', '소프트매트'],
    embeddingVector: [0.42, 0.76, 0.34, 0.72, 0.38],
    matchScore: 86,
    makeupAreas: ['brow', 'cheek', 'lip'],
    colorOptions: colorOptions([
      ['sage-brown', '세이지 브라운', '#7D7663'],
      ['apricot-beige', '살구 베이지', '#D7A37D'],
      ['soft-clay', '소프트 클레이', '#B5826B'],
    ]),
    typeOptions: textOptions([
      ['natural-brow', '내추럴 브로우'],
      ['apricot-cheek', '살구 치크'],
      ['soft-lip', '소프트 립'],
    ]),
    textureOptions: textOptions([
      ['soft-matte', '소프트 매트'],
      ['powder', '파우더'],
      ['sheer', '쉬어'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'sage-brown',
      typeId: 'natural-brow',
      textureId: 'soft-matte',
      shapeId: 'balanced',
      intensity: 0.5,
      finish: 'natural soft matte',
    },
  }),
  createRecommendedFilter({
    id: 'filter-dolly-larme',
    imageSource: filterDollyLarme,
    categoryId: 'trend',
    headline: '인형 같은 시선의',
    displayTitle: '돌리 라르무',
    description: '핑크 베이지와 언더 포인트로 또렷한 눈매를 만든 글로시 룩',
    categoryTags: ['pink', 'trend', 'unique'],
    keywords: ['돌리', '라르무', '핑크베이지', '언더', '글로시'],
    embeddingVector: [0.54, 0.35, 0.9, 0.28, 0.82],
    matchScore: 89,
    makeupAreas: ['eye', 'cheek', 'lip'],
    colorOptions: colorOptions([
      ['pink-beige', '핑크 베이지', '#E1A9AE'],
      ['under-point', '언더 포인트', '#F4D3D4'],
      ['glossy-rose', '글로시 로즈', '#C67788'],
    ]),
    typeOptions: textOptions([
      ['under-eye', '언더 포인트'],
      ['dolly-lash', '돌리 래쉬'],
      ['gloss-lip', '글로시 립'],
    ]),
    textureOptions: textOptions([
      ['gloss', '글로스'],
      ['pearl', '펄'],
      ['sheer', '쉬어'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'pink-beige',
      typeId: 'under-eye',
      textureId: 'gloss',
      shapeId: 'soft-focus',
      intensity: 0.7,
      finish: 'dolly glossy pink',
    },
  }),
  createRecommendedFilter({
    id: 'filter-igari-blush',
    imageSource: filterIgariBlush,
    categoryId: 'popular',
    headline: '붉게 번진',
    displayTitle: '이가리 블러시',
    description: '애프리콧 레드 치크와 촉촉한 립으로 생기를 높인 룩',
    categoryTags: ['pink', 'glow', 'trend'],
    keywords: ['이가리', '블러시', '코랄', '애프리콧', '촉촉한립'],
    embeddingVector: [0.46, 0.74, 0.76, 0.24, 0.78],
    matchScore: 88,
    makeupAreas: ['cheek', 'lip'],
    colorOptions: colorOptions([
      ['apricot-red', '애프리콧 레드', '#E77765'],
      ['coral-blush', '코랄 블러셔', '#F09A7F'],
      ['moist-lip', '촉촉한 립', '#C85862'],
    ]),
    typeOptions: textOptions([
      ['high-blush', '높은 치크'],
      ['moist-tint', '촉촉 틴트'],
      ['diffused-cheek', '번진 치크'],
    ]),
    textureOptions: textOptions([
      ['dewy', '듀이'],
      ['cream', '크림'],
      ['sheer', '쉬어'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'apricot-red',
      typeId: 'high-blush',
      textureId: 'dewy',
      shapeId: 'soft-focus',
      intensity: 0.68,
      finish: 'diffused dewy blush',
    },
  }),
  createRecommendedFilter({
    id: 'filter-juice-coral',
    imageSource: filterJuiceCoral,
    categoryId: 'popular',
    headline: '과즙 터지는',
    displayTitle: '자몽 코랄',
    description: '자몽 코랄과 투명 글로스로 밝은 과즙감을 만든 룩',
    categoryTags: ['glow', 'trend'],
    keywords: ['과즙', '자몽', '코랄', '투명글로스', '밝은치크'],
    embeddingVector: [0.36, 0.9, 0.65, 0.18, 0.9],
    matchScore: 87,
    makeupAreas: ['cheek', 'lip', 'eye'],
    colorOptions: colorOptions([
      ['grapefruit-coral', '자몽 코랄', '#F07F67'],
      ['clear-gloss', '투명 글로스', '#F6C5AF'],
      ['bright-cheek', '밝은 치크', '#F5A076'],
    ]),
    typeOptions: textOptions([
      ['juice-tint', '과즙 틴트'],
      ['clear-gloss', '투명 글로스'],
      ['fresh-cheek', '프레시 치크'],
    ]),
    textureOptions: textOptions([
      ['glass', '글래스'],
      ['glow', '글로우'],
      ['sheer', '쉬어'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'grapefruit-coral',
      typeId: 'juice-tint',
      textureId: 'glass',
      shapeId: 'soft-focus',
      intensity: 0.64,
      finish: 'clear juicy coral',
    },
  }),
  createRecommendedFilter({
    id: 'filter-douyin-pink',
    imageSource: filterDouyinPink,
    categoryId: 'trend',
    headline: '렌즈광 같은',
    displayTitle: '도우인 핑크',
    description: '핑크 펄과 애교살 글리터 포인트로 반짝이는 눈매를 만든 룩',
    categoryTags: ['pink', 'glow', 'trend'],
    keywords: ['도우인', '핑크펄', '애교살', '글리터', '왕홍'],
    embeddingVector: [0.68, 0.38, 0.96, 0.2, 0.94],
    matchScore: 97,
    makeupAreas: ['eye', 'cheek', 'lip'],
    colorOptions: colorOptions([
      ['pink-pearl', '핑크 펄', '#F2B8D1'],
      ['glitter-point', '글리터 포인트', '#F8DDEB'],
      ['lens-rose', '렌즈 로즈', '#CC6E94'],
    ]),
    typeOptions: textOptions([
      ['aegyo-sal', '애교살'],
      ['glitter-eye', '글리터 아이'],
      ['gloss-tint', '글로스 틴트'],
    ]),
    textureOptions: textOptions([
      ['pearl', '펄'],
      ['glitter', '글리터'],
      ['glass', '글래스'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'pink-pearl',
      typeId: 'aegyo-sal',
      textureId: 'pearl',
      shapeId: 'defined',
      intensity: 0.76,
      finish: 'pink pearl sparkle',
    },
  }),
  createRecommendedFilter({
    id: 'filter-latte-brown',
    imageSource: filterLatteBrown,
    categoryId: 'recommended',
    headline: '따뜻한 카페의',
    displayTitle: '라떼 브라운',
    description: '밀크 브라운과 토스트 베이지로 음영을 부드럽게 쌓은 룩',
    categoryTags: ['brown'],
    keywords: ['라떼', '브라운', '베이지', '음영', '컨투어'],
    embeddingVector: [0.28, 0.88, 0.2, 0.94, 0.5],
    matchScore: 85,
    makeupAreas: ['eye', 'contour', 'lip'],
    colorOptions: colorOptions([
      ['milk-brown', '밀크 브라운', '#9B725E'],
      ['toast-beige', '토스트 베이지', '#C69B7C'],
      ['soft-contour', '소프트 컨투어', '#8A6658'],
    ]),
    typeOptions: textOptions([
      ['brown-shadow', '브라운 음영'],
      ['soft-contour', '소프트 컨투어'],
      ['nude-lip', '누드 립'],
    ]),
    textureOptions: textOptions([
      ['soft-matte', '소프트 매트'],
      ['satin', '새틴'],
      ['powder', '파우더'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'milk-brown',
      typeId: 'brown-shadow',
      textureId: 'soft-matte',
      shapeId: 'balanced',
      intensity: 0.56,
      finish: 'latte soft matte',
    },
  }),
  createRecommendedFilter({
    id: 'filter-office-siren',
    imageSource: filterOfficeSiren,
    categoryId: 'recommended',
    headline: '날카로운 출근길',
    displayTitle: '오피스 사이렌',
    description: '쿨 토프와 얇은 아이라인으로 세련된 긴장감을 만든 룩',
    categoryTags: ['smoky', 'brown', 'trend'],
    keywords: ['오피스', '쿨토프', '얇은아이라인', '뮤트립', '슬릭'],
    embeddingVector: [0.88, 0.22, 0.25, 0.82, 0.32],
    matchScore: 93,
    makeupAreas: ['eye', 'brow', 'contour', 'lip'],
    colorOptions: colorOptions([
      ['cool-taupe', '쿨 토프', '#80716D'],
      ['mute-lip', '뮤트 립', '#A46B72'],
      ['slate-brow', '슬레이트 브로우', '#4F4746'],
    ]),
    typeOptions: textOptions([
      ['thin-liner', '얇은 아이라인'],
      ['sleek-brow', '슬릭 브로우'],
      ['soft-contour', '소프트 컨투어'],
    ]),
    textureOptions: textOptions([
      ['satin', '새틴'],
      ['soft-matte', '소프트 매트'],
      ['sheer', '쉬어'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'cool-taupe',
      typeId: 'thin-liner',
      textureId: 'satin',
      shapeId: 'defined',
      intensity: 0.74,
      finish: 'sleek taupe satin',
    },
  }),
  createRecommendedFilter({
    id: 'filter-soft-goth',
    imageSource: filterSoftGoth,
    categoryId: 'trend',
    headline: '희미한 밤의',
    displayTitle: '소프트 고스',
    description: '플럼 브라운 스모키와 딥 로즈 립으로 부드러운 어둠을 얹은 룩',
    categoryTags: ['smoky', 'brown', 'unique'],
    keywords: ['소프트고스', '그런지', '플럼', '스모키', '딥로즈'],
    embeddingVector: [0.82, 0.28, 0.48, 0.86, 0.34],
    matchScore: 84,
    makeupAreas: ['eye', 'lip', 'contour'],
    colorOptions: colorOptions([
      ['plum-brown', '플럼 브라운', '#5D3C48'],
      ['deep-rose', '딥 로즈', '#7A3C50'],
      ['smoked-taupe', '번진 토프', '#6B5B62'],
    ]),
    typeOptions: textOptions([
      ['diffused-smoky', '번진 스모키'],
      ['deep-lip', '딥 립'],
      ['soft-contour', '소프트 컨투어'],
    ]),
    textureOptions: textOptions([
      ['velvet', '벨벳'],
      ['soft-matte', '소프트 매트'],
      ['satin', '새틴'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'plum-brown',
      typeId: 'diffused-smoky',
      textureId: 'velvet',
      shapeId: 'defined',
      intensity: 0.8,
      finish: 'soft goth velvet',
    },
  }),
  createRecommendedFilter({
    id: 'filter-wanghong-glass-pink',
    imageSource: filterWanghongGlassPink,
    categoryId: 'trend',
    headline: '렌즈광이 번지는',
    displayTitle: '왕홍 글래스 핑크',
    description: '핑크 펄과 유리알 피부광으로 화면 속 선명도를 높인 왕홍 무드 룩',
    categoryTags: ['pink', 'glow', 'trend'],
    keywords: ['왕홍', '도우인', '핑크', '글로우', '트렌드'],
    embeddingVector: [0.74, 0.4, 0.98, 0.24, 0.98],
    matchScore: 98,
    makeupAreas: ['base', 'eye', 'cheek', 'lip'],
    colorOptions: colorOptions([
      ['glass-pink', '글래스 핑크', '#F2A7C4'],
      ['pearl-rose', '펄 로즈', '#F8D5E2'],
      ['clear-gloss', '클리어 글로스', '#F5C4D2'],
    ]),
    typeOptions: textOptions([
      ['lens-pearl-eye', '렌즈광 아이'],
      ['glass-base', '글래스 베이스'],
      ['gloss-tint', '글로스 틴트'],
    ]),
    textureOptions: textOptions([
      ['glass', '글래스'],
      ['pearl', '펄'],
      ['glow', '글로우'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'glass-pink',
      typeId: 'lens-pearl-eye',
      textureId: 'glass',
      shapeId: 'defined',
      intensity: 0.78,
      finish: 'wanghong pink glass glow',
    },
  }),
  createRecommendedFilter({
    id: 'filter-cloud-blur-matte',
    imageSource: filterCloudBlurMatte,
    categoryId: 'popular',
    headline: '구름처럼 흐린',
    displayTitle: '클라우드 블러',
    description: '블러 베이스와 벨벳 로즈 립으로 부드럽게 초점을 맞춘 룩',
    categoryTags: ['pink', 'brown', 'trend'],
    keywords: ['블러', '소프트매트', '핑크', '베이지', '트렌드'],
    embeddingVector: [0.62, 0.54, 0.78, 0.5, 0.68],
    matchScore: 92,
    makeupAreas: ['base', 'eye', 'cheek', 'lip'],
    colorOptions: colorOptions([
      ['blur-rose', '블러 로즈', '#C9828D'],
      ['cloud-beige', '클라우드 베이지', '#D9B6A5'],
      ['taupe-haze', '토프 헤이즈', '#9C8780'],
    ]),
    typeOptions: textOptions([
      ['blur-base', '블러 베이스'],
      ['velvet-lip', '벨벳 립'],
      ['soft-shadow', '소프트 음영'],
    ]),
    textureOptions: textOptions([
      ['soft-matte', '소프트 매트'],
      ['velvet', '벨벳'],
      ['powder', '파우더'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'blur-rose',
      typeId: 'blur-base',
      textureId: 'soft-matte',
      shapeId: 'soft-focus',
      intensity: 0.6,
      finish: 'cloud blur soft matte',
    },
  }),
  createRecommendedFilter({
    id: 'filter-aura-blush-lift',
    imageSource: filterAuraBlushLift,
    categoryId: 'popular',
    headline: '볼 위로 피어난',
    displayTitle: '아우라 블러시',
    description: '높은 위치의 워터 로즈 치크와 쉬어 립으로 생기를 끌어올린 룩',
    categoryTags: ['pink', 'glow', 'trend'],
    keywords: ['블러셔', '핑크', '글로우', '로즈', '트렌드'],
    embeddingVector: [0.48, 0.66, 0.88, 0.18, 0.84],
    matchScore: 91,
    makeupAreas: ['cheek', 'lip', 'eye'],
    colorOptions: colorOptions([
      ['water-rose', '워터 로즈', '#E88EA6'],
      ['aura-pink', '아우라 핑크', '#F3B4C5'],
      ['sheer-lilac', '쉬어 라일락', '#C9A9D7'],
    ]),
    typeOptions: textOptions([
      ['lifted-blush', '리프트 치크'],
      ['sheer-lip', '쉬어 립'],
      ['feather-lash', '페더 래쉬'],
    ]),
    textureOptions: textOptions([
      ['sheer', '쉬어'],
      ['water-glow', '물광'],
      ['balmy', '밤 광'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'water-rose',
      typeId: 'lifted-blush',
      textureId: 'sheer',
      shapeId: 'soft-focus',
      intensity: 0.66,
      finish: 'lifted aura blush',
    },
  }),
  createRecommendedFilter({
    id: 'filter-plum-syrup-gloss',
    imageSource: filterPlumSyrupGloss,
    categoryId: 'trend',
    headline: '시럽처럼 맺힌',
    displayTitle: '플럼 시럽 글로스',
    description: '투명한 플럼 립과 모브 음영으로 촉촉하게 깊이를 만든 룩',
    categoryTags: ['glow', 'smoky', 'trend'],
    keywords: ['플럼', '글로스', '스모키', '글로우', '트렌드'],
    embeddingVector: [0.78, 0.32, 0.58, 0.72, 0.76],
    matchScore: 90,
    makeupAreas: ['eye', 'cheek', 'lip'],
    colorOptions: colorOptions([
      ['plum-syrup', '플럼 시럽', '#8E4B66'],
      ['mauve-haze', '모브 헤이즈', '#A87994'],
      ['berry-gloss', '베리 글로스', '#B45B78'],
    ]),
    typeOptions: textOptions([
      ['syrup-lip', '시럽 립'],
      ['mauve-shadow', '모브 음영'],
      ['soft-blush', '소프트 치크'],
    ]),
    textureOptions: textOptions([
      ['gloss', '글로스'],
      ['satin', '새틴'],
      ['sheer', '쉬어'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'plum-syrup',
      typeId: 'syrup-lip',
      textureId: 'gloss',
      shapeId: 'balanced',
      intensity: 0.7,
      finish: 'plum syrup glossy',
    },
  }),
  createRecommendedFilter({
    id: 'filter-chrome-pearl-eye',
    imageSource: filterChromePearlEye,
    categoryId: 'trend',
    headline: '빛 조각 같은',
    displayTitle: '크롬 펄 아이',
    description: '실버 펄 아이와 누드 글로스로 깨끗한 반짝임을 더한 룩',
    categoryTags: ['glow', 'trend', 'unique'],
    keywords: ['크롬', '펄', '글로우', '글리터', '트렌드'],
    embeddingVector: [0.66, 0.36, 0.72, 0.44, 0.96],
    matchScore: 89,
    makeupAreas: ['eye', 'cheek', 'lip'],
    colorOptions: colorOptions([
      ['pearl-silver', '펄 실버', '#D8D9DE'],
      ['champagne-light', '샴페인 라이트', '#E8D4B8'],
      ['clear-nude', '클리어 누드', '#C99A8E'],
    ]),
    typeOptions: textOptions([
      ['chrome-eye', '크롬 아이'],
      ['nude-gloss', '누드 글로스'],
      ['clean-cheek', '클린 치크'],
    ]),
    textureOptions: textOptions([
      ['pearl', '펄'],
      ['glitter', '글리터'],
      ['glass', '글래스'],
    ]),
    presetValues: {
      makeupArea: allPresetArea,
      colorId: 'pearl-silver',
      typeId: 'chrome-eye',
      textureId: 'pearl',
      shapeId: 'defined',
      intensity: 0.72,
      finish: 'chrome pearl clean glow',
    },
  }),
];

export const mockARMakeupGuideData: ARMakeupGuideData = {
  categories: [
    {id: 'recommended', label: 'AI 추천'},
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
  makeupAreas: [
    {id: 'all', label: '전체'},
    {id: 'base', label: '베이스'},
    {id: 'eye', label: '아이'},
    {id: 'brow', label: '브로우'},
    {id: 'cheek', label: '치크'},
    {id: 'lip', label: '립'},
    {id: 'contour', label: '컨투어'},
  ],
  filters: mockRecommendedMakeupFilters,
};
