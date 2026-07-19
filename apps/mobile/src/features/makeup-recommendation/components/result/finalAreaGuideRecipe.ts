import type {PartGuide, PartKey} from '../../screens/recommendationResultTypes';
import type {
  MakeupRecommendationApplicationColor,
  MakeupRecommendationApplicationStep,
  RecommendedMakeupAreaGuide,
} from '../../types';

export const FINAL_RECIPE_AREA_ORDER: readonly PartKey[] = [
  'base',
  'brow',
  'eye',
  'cheek',
  'lip',
];

export type FinalRecipeStep = MakeupRecommendationApplicationStep & {
  key: string;
  legacy: boolean;
};

export type FinalAreaRecipe = {
  area: PartKey;
  applicationOrder: number;
  displayOrder: number;
  label: string;
  goal: string;
  texture: string;
  estimatedMinutes?: number;
  completionCriteria: string[];
  steps: FinalRecipeStep[];
  detailed: boolean;
  sourceGuide?: RecommendedMakeupAreaGuide;
};

function validOrder(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : fallback;
}

function uniqueColors(colors: readonly MakeupRecommendationApplicationColor[]) {
  const seen = new Set<string>();
  return colors.filter(color => {
    const key = `${color.role}\u0000${color.name}\u0000${color.hex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detailedSteps(
  area: PartKey,
  guide: RecommendedMakeupAreaGuide,
): FinalRecipeStep[] {
  const plan = guide.applicationPlan;
  if (!plan) return [];
  return plan.steps.map(step => ({
    ...step,
    colors: uniqueColors(step.colors),
    key: `${area}:${step.order}:${step.title}:${step.productType}`,
    legacy: false,
  }));
}

function legacySteps(
  area: PartKey,
  label: string,
  guide: RecommendedMakeupAreaGuide | undefined,
  part: PartGuide,
): FinalRecipeStep[] {
  const instructions = guide?.steps.map(step => step.instruction) ?? part.steps;
  return instructions.filter(Boolean).map((instruction, index) => {
    const legacyTechnique = index === 0 ? guide?.technique?.trim() : '';
    const technique = legacyTechnique && legacyTechnique !== instruction
      ? `${instruction}\n${legacyTechnique}`
      : instruction;
    return {
      order: index + 1,
      title: `${label} ${index + 1}단계`,
      productType: '',
      tool: '',
      colors: index === 0 && guide?.color.name
        ? [{role: '', name: guide.color.name, hex: guide.color.hex}]
        : [],
      amount: '',
      placement: index === 0 ? guide?.placement ?? part.textureNote : '',
      technique,
      blending: '',
      finishCheck: '',
      key: `${area}:legacy:${index + 1}:${instruction}`,
      legacy: true,
    };
  });
}

export function buildFinalAreaRecipes(
  guides: readonly RecommendedMakeupAreaGuide[] | undefined,
  parts: Record<PartKey, PartGuide>,
): FinalAreaRecipe[] {
  const recipes = FINAL_RECIPE_AREA_ORDER.map((area, index) => {
    const guide = guides?.find(candidate => candidate.area === area);
    const part = parts[area];
    const label = guide?.label || part.label || area;
    const detail = guide ? detailedSteps(area, guide) : [];
    const detailed = detail.length > 0;
    return {
      area,
      applicationOrder: validOrder(guide?.applicationOrder, index + 1),
      displayOrder: 0,
      label,
      goal: guide?.goal?.trim() || '',
      texture: guide?.texture?.trim() || part.texture,
      estimatedMinutes: detailed ? guide?.applicationPlan?.estimatedMinutes : undefined,
      completionCriteria: detailed
        ? guide?.applicationPlan?.completionCriteria.filter(Boolean) ?? []
        : [],
      steps: detailed ? detail : legacySteps(area, label, guide, part),
      detailed,
      sourceGuide: guide,
    };
  });

  return recipes
    .sort((left, right) => {
      const byOrder = left.applicationOrder - right.applicationOrder;
      if (byOrder !== 0) return byOrder;
      return FINAL_RECIPE_AREA_ORDER.indexOf(left.area)
        - FINAL_RECIPE_AREA_ORDER.indexOf(right.area);
    })
    .map((recipe, index) => ({...recipe, displayOrder: index + 1}));
}
