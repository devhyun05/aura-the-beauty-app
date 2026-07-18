// Maps real MakeupLookRecommendation[] into the redesigned result screen's Look[] view-model.
//
// A few fields the design shows are not (yet) first-class on MakeupLookRecommendation.
// They are derived here and marked DATA GAP so the source can be upgraded later:
//   - match %       : no look-level score exists; derived from products[].matchRate, else a role placeholder.
//   - map coords    : not modelled; deterministic per-role placement on the 자연↔개성 / 캐주얼↔글램 axes.
//   - matchLine     : short "…기준" line; sourced from personalColor when available, else a role default.
import type {MakeupGuideArea, MakeupLookRecommendation, MakeupRecommendationProduct} from '../types';
import {adaptLegacyLookToV2} from './makeupRecommendationMappers';
import type {Look, PartGuide, PartKey} from '../screens/recommendationResultTypes';

const ROLE_LABEL: Record<Look['id'], string> = {
  anchor: '가장 잘 어울리는',
  bold: '조금 더 과감한',
  discovery: '예상 밖의 발견',
};
const ROLE_EN: Record<Look['id'], string> = {anchor: 'BEST MATCH', bold: 'BOLDER PICK', discovery: 'DISCOVERY'};
const DIFF_LABEL: Record<MakeupLookRecommendation['difficulty'], string> = {easy: '쉬움', medium: '보통', advanced: '어려움'};
const PART_EN: Record<PartKey, string> = {base: 'BASE', brow: 'BROW', eye: 'EYE', cheek: 'CHEEK', lip: 'LIP'};
const PART_ORDER: PartKey[] = ['base', 'brow', 'eye', 'cheek', 'lip'];
const ROLE_ORDER: Look['id'][] = ['anchor', 'bold', 'discovery'];

// DATA GAP placeholders — deterministic, so the layout is stable until real signals arrive.
const ROLE_COORDS: Record<Look['id'], {mx: number; my: number}> = {
  anchor: {mx: 28, my: 56}, // natural · casual-mid
  bold: {mx: 78, my: 82}, // individual · glam
  discovery: {mx: 64, my: 38}, // individual-mid · casual
};
const ROLE_MATCH_FALLBACK: Record<Look['id'], number> = {anchor: 92, bold: 84, discovery: 78};
const ROLE_MATCH_LINE: Record<Look['id'], string> = {
  anchor: '가장 안정적으로 어울리는 기준',
  bold: '또렷한 인상을 더하는 기준',
  discovery: '의외의 포인트 기준',
};

function isLookRole(role: string): role is Look['id'] {
  return role === 'anchor' || role === 'bold' || role === 'discovery';
}

function formatPrice(price: number | undefined): string {
  return typeof price === 'number' && price > 0 ? `${price.toLocaleString('ko-KR')}원` : '가격 확인';
}

function productInitial(brandName: string): string {
  const trimmed = brandName.trim();
  return trimmed ? trimmed[0] : '·';
}

function toProd(product: MakeupRecommendationProduct | undefined): PartGuide['prod'] {
  if (!product) return {brand: '', name: '추천 제품 준비 중', price: '가격 확인', why: '', ini: '·'};
  return {
    brand: product.brandName,
    name: product.productName,
    price: formatPrice(product.price),
    why: product.reason,
    ini: productInitial(product.brandName),
  };
}

/** Best available real match signal for a look, or a role placeholder (DATA GAP). */
function deriveMatch(look: MakeupLookRecommendation, role: Look['id']): number {
  const rates = [
    ...look.products.map(p => p.matchRate),
    ...(look.areaGuides ?? []).flatMap(g => g.products.map(p => p.matchRate)),
  ].filter((r): r is number => typeof r === 'number' && r > 0);
  if (rates.length === 0) return ROLE_MATCH_FALLBACK[role];
  return Math.round(Math.max(...rates));
}

function buildParts(look: MakeupLookRecommendation): Record<PartKey, PartGuide> {
  const guides = adaptLegacyLookToV2(look).areaGuides ?? [];
  const byArea = new Map<MakeupGuideArea, (typeof guides)[number]>(guides.map(g => [g.area, g]));
  const entries = PART_ORDER.map((key): [PartKey, PartGuide] => {
    const guide = byArea.get(key);
    if (!guide) {
      return [key, {label: key, en: PART_EN[key], colorName: '', hex: '#C6CFE9', texture: '', textureNote: '', steps: [], finish: '', prod: toProd(undefined)}];
    }
    return [key, {
      label: guide.label,
      en: PART_EN[key],
      colorName: guide.color.name,
      hex: guide.color.hex,
      texture: guide.texture,
      textureNote: guide.placement,
      steps: guide.steps.map(step => step.instruction),
      finish: guide.reason,
      prod: toProd(guide.products[0]),
    }];
  });
  return Object.fromEntries(entries) as Record<PartKey, PartGuide>;
}

export function toRecommendationResultLooks(
  results: readonly MakeupLookRecommendation[],
  options?: {personalColor?: string},
): Look[] {
  const personalColor = options?.personalColor?.trim();
  return results
    .filter((look): look is MakeupLookRecommendation & {role: Look['id']} => isLookRole(look.role))
    .slice()
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .map(look => {
      const role = look.role;
      return {
        id: role,
        roleLabel: ROLE_LABEL[role],
        roleEn: ROLE_EN[role],
        name: look.title,
        image: look.imageSource,
        match: deriveMatch(look, role),
        diff: DIFF_LABEL[look.difficulty],
        time: `${look.durationMinutes}분`,
        matchLine: personalColor ? `${personalColor} 기준` : ROLE_MATCH_LINE[role],
        ...ROLE_COORDS[role],
        reasons: look.reasons.slice(0, 3),
        parts: buildParts(look),
      };
    });
}
