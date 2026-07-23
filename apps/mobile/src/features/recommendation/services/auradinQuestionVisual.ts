import type {ImageSourcePropType} from 'react-native';
import type {
  AuradinQuestionAttribute,
  AuradinQuestionCategory,
  AuradinQuestionOption,
  AuradinQuestionVisual,
} from '../types';
type AuradinQuestionVisualContext = {
  attribute?: AuradinQuestionAttribute;
};

const CATEGORY_IMAGES: Record<AuradinQuestionCategory, ImageSourcePropType> = {
  lip: require('../assets/question-visuals-v2/categories/lip.jpg'),
  cheek: require('../assets/question-visuals-v2/categories/cheek.jpg'),
  shadow: require('../assets/question-visuals-v2/categories/shadow.jpg'),
  base: require('../assets/question-visuals-v2/categories/base.jpg'),
  brow: require('../assets/question-visuals-v2/categories/brow.jpg'),
  liner: require('../assets/question-visuals-v2/categories/liner.jpg'),
};

const FINISH_IMAGES: Readonly<Record<string, ImageSourcePropType>> = {
  glossy: require('../assets/question-visuals-v2/finish/glossy.jpg'),
  matte: require('../assets/question-visuals-v2/finish/matte.jpg'),
  velvet: require('../assets/question-visuals-v2/finish/velvet.jpg'),
  satin: require('../assets/question-visuals-v2/finish/satin.jpg'),
  sheer: require('../assets/question-visuals-v2/finish/sheer.jpg'),
  shimmer: require('../assets/question-visuals-v2/finish/shimmer.jpg'),
};

const TEXTURE_IMAGES: Readonly<Record<string, ImageSourcePropType>> = {
  tint: require('../assets/question-visuals-v2/texture/tint.jpg'),
  balm: require('../assets/question-visuals-v2/texture/balm.jpg'),
  gloss: require('../assets/question-visuals-v2/texture/gloss.jpg'),
  cream: require('../assets/question-visuals-v2/texture/cream.jpg'),
  powder: require('../assets/question-visuals-v2/texture/powder.jpg'),
  liquid: require('../assets/question-visuals-v2/texture/liquid.jpg'),
  palette: require('../assets/question-visuals-v2/texture/palette.jpg'),
};

const COLOR_FAMILY_GRADIENT: Record<string, [string, string, string]> = {
  pink: ['#F8CBD7', '#F2A6B8', '#D97E95'],
  rose: ['#EAB6C3', '#D98BA0', '#B96A82'],
  coral: ['#F8B39C', '#F2896B', '#D6684C'],
  red: ['#EA8B95', '#D65563', '#AC3A48'],
  orange: ['#F3AC7E', '#E8844A', '#C56430'],
  mauve: ['#D2B3C6', '#B58AA6', '#936785'],
  brown: ['#B28B79', '#8B5E4E', '#663F31'],
  nude: ['#EAD5C4', '#D8B79E', '#BA9276'],
  peach: ['#F7C6B1', '#F0A488', '#D67F60'],
  burgundy: ['#A4576A', '#7B2E3B', '#571C27'],
  plum: ['#B0879F', '#8E5A79', '#6B3F5A'],
};

const PRICE_TIERS = new Set<string>(['under_15k', '15k_25k', '25k_40k', 'over_40k']);

const CHANNELS = new Set(['oliveyoung', 'department_store', 'naver'] as const);

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function categoryVisual(value: string): AuradinQuestionVisual {
  if (Object.prototype.hasOwnProperty.call(CATEGORY_IMAGES, value)) {
    const category = value as AuradinQuestionCategory;
    return {kind: 'category', category, source: CATEGORY_IMAGES[category]};
  }
  return {kind: 'neutral'};
}

function descriptorVisual(
  attribute: 'finish' | 'texture',
): AuradinQuestionVisual {
  const description =
    attribute === 'finish'
      ? '\uc6d0\ud558\ub294 \ub9c8\ubb34\ub9ac\uac10\uc744 \uace8\ub77c\uc8fc\uc138\uc694'
      : '\uc6d0\ud558\ub294 \uc81c\ud615\uacfc \uc0ac\uc6a9\uac10\uc744 \uace8\ub77c\uc8fc\uc138\uc694';

  return {kind: 'descriptor', description};
}

/**
 * Resolves question visuals only from the server's semantic filter delta.
 * Finish and texture previews are universal: a semantic value always resolves
 * to the same local image without category-specific payload duplication.
 * Only unsupported semantic values stay descriptive.
 */
export function resolveAuradinQuestionVisual(
  option: AuradinQuestionOption,
  context: AuradinQuestionVisualContext = {},
): AuradinQuestionVisual {
  const op = normalize(option.op);
  if (op === 'noop') {
    return {kind: 'noop'};
  }

  const attribute = normalize(option.attribute) || normalize(context.attribute);
  const value = normalize(option.value);

  if (attribute === 'category') {
    return categoryVisual(value);
  }

  if (attribute === 'colorfamily') {
    const colors = COLOR_FAMILY_GRADIENT[value];
    return colors ? {kind: 'gradient', colors} : {kind: 'neutral'};
  }

  if (attribute === 'finish') {
    const source = FINISH_IMAGES[value];
    if (source) {
      return {kind: 'application', attribute: 'finish', value, source};
    }

    return descriptorVisual('finish');
  }

  if (attribute === 'texture') {
    const source = TEXTURE_IMAGES[value];
    if (source) {
      return {kind: 'application', attribute: 'texture', value, source};
    }

    return descriptorVisual('texture');
  }

  if (attribute === 'pricetier') {
    return PRICE_TIERS.has(value) ? {kind: 'price'} : {kind: 'neutral'};
  }

  if (attribute === 'channel' && CHANNELS.has(value as 'oliveyoung' | 'department_store' | 'naver')) {
    return {
      kind: 'channel',
      channel: value as 'oliveyoung' | 'department_store' | 'naver',
    };
  }

  return {kind: 'neutral'};
}
