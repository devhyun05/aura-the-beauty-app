// Maps real MakeupLookRecommendation[] into the redesigned result screen's Look[] view-model.
//
// User-facing match percentage comes only from persisted makeup-match-v1 data.
// LOOK MAP remains a separate persisted visualization.
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
  if (!product) return {brand: '', name: '', price: '', why: '', ini: ''};
  return {
    brand: product.brandName,
    name: product.productName,
    price: formatPrice(product.price),
    why: product.reason,
    ini: productInitial(product.brandName),
  };
}

function buildParts(look: MakeupLookRecommendation): Record<PartKey, PartGuide> {
  const guides = adaptLegacyLookToV2(look).areaGuides ?? [];
  const byArea = new Map<MakeupGuideArea, (typeof guides)[number]>(guides.map(g => [g.area, g]));
  const entries = PART_ORDER.map((key): [PartKey, PartGuide] => {
    const guide = byArea.get(key);
    const product = guide?.products[0] ?? look.products.find(candidate => candidate.area === key);
    if (!guide) {
      return [key, {label: key, en: PART_EN[key], colorName: '', hex: '#C6CFE9', texture: '', textureNote: '', steps: [], finish: '', prod: toProd(product)}];
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
      prod: toProd(product),
    }];
  });
  return Object.fromEntries(entries) as Record<PartKey, PartGuide>;
}

export function toRecommendationResultLooks(
  results: readonly MakeupLookRecommendation[],
  _options?: {personalColor?: string},
): Look[] {
  return results
    .filter((look): look is MakeupLookRecommendation & {role: Look['id']} => isLookRole(look.role))
    .slice()
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .map(look => {
      const role = look.role;
      const lookMap = look.lookMap;
      const matchAssessment = look.matchAssessment;
      const matchScore = matchAssessment?.score ?? null;
      return {
        id: role,
        roleLabel: ROLE_LABEL[role],
        roleEn: ROLE_EN[role],
        name: look.title,
        image: look.imageSource,
        match: matchScore,
        diff: DIFF_LABEL[look.difficulty],
        matchLine: matchScore !== null
          ? '상황·취향·퍼스널컬러·피부 표현 기준'
          : matchAssessment
            ? '매칭률 계산 정보가 부족해요'
            : '매칭률 정보가 없는 이전 결과예요',
        mx: lookMap?.naturalityToPersonality ?? 50,
        my: lookMap?.casualToGlam ?? 50,
        mapRationale: lookMap?.rationale
          ?? '이전 결과에는 LOOK MAP 분석값이 없어 중앙에 표시했어요.',
        reasons: look.reasons.slice(0, 3),
        parts: buildParts(look),
      };
    });
}
