import type {PartGuide, PartKey} from '../../screens/recommendationResultTypes';
import type {
  MakeupLookRecommendation,
  MakeupRecommendationApplicationColor,
  MakeupRecommendationApplicationStep,
  RecommendedMakeupAreaGuide,
} from '../../types';
import {buildRecommendedAreaGuides, type ApiAreaGuide} from '../../services/makeupRecommendationMappers';
import {buildFinalAreaRecipes} from './finalAreaGuideRecipe';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const PARTS = Object.fromEntries(
  (['base', 'brow', 'eye', 'cheek', 'lip'] as const).map(area => [
    area,
    {
      label: area,
      en: area.toUpperCase(),
      colorName: '',
      hex: '#C6CFE9',
      texture: '',
      textureNote: '',
      steps: [],
      finish: '',
      prod: {brand: '', name: '', price: '', why: '', ini: ''},
    } satisfies PartGuide,
  ]),
) as unknown as Record<PartKey, PartGuide>;

function guide(
  area: PartKey,
  applicationOrder?: number,
): RecommendedMakeupAreaGuide {
  return {
    area,
    applicationOrder,
    label: area,
    goal: `${area} 목표`,
    color: {name: '로즈 브라운', hex: '#9B6B67'},
    texture: '새틴',
    placement: '정해진 범위',
    technique: '얇게 펴 바르기',
    reason: '추천 이유',
    avoid: [],
    steps: [{order: 1, instruction: '기존 단계'}],
    products: [],
    arSupported: true,
  };
}

function recipeStep(
  order: number,
  title: string,
  colors: MakeupRecommendationApplicationColor[],
): MakeupRecommendationApplicationStep {
  return {
    order,
    title,
    productType: '아이섀도우',
    tool: '플랫 브러시',
    amount: '브러시 한 면의 1/3',
    colors,
    placement: '쌍꺼풀 라인 위 3mm까지',
    technique: '눈 앞머리부터 얇게 쌓아요.',
    blending: '경계를 깨끗한 브러시로 풀어요.',
    finishCheck: '두 눈의 높이가 같으면 완료예요.',
  };
}

const eye = guide('eye', 1);
eye.applicationPlan = {
  recipeVersion: 'makeup-application-v1',
  estimatedMinutes: 7,
  completionCriteria: ['경계가 보이지 않아요.'],
  steps: [
    recipeStep(1, '베이스 아이섀도우', [
      {role: '베이스', name: '라이트 베이지', hex: '#DCC9BB'},
    ]),
    recipeStep(2, '전환 아이섀도우', [
      {role: '전환색', name: '소프트 토프', hex: '#A58B82'},
    ]),
    recipeStep(3, '깊이 아이섀도우', [
      {role: '중간 음영', name: '로즈 브라운', hex: '#9B6B67'},
    ]),
    {...recipeStep(4, '아이라이너로 속눈썹 사이 채우기', [
      {role: '라인', name: '딥 브라운', hex: '#5D4037'},
    ]), productType: '젤 아이라이너'},
    recipeStep(5, '포인트 아이섀도우', [
      {role: '포인트', name: '샴페인 베이지', hex: '#E5D3BA'},
    ]),
  ],
};

const lip = guide('lip', 5);
lip.applicationPlan = {
  recipeVersion: 'makeup-application-v1',
  estimatedMinutes: 4,
  completionCriteria: ['입술 경계가 얼룩 없이 연결됐어요.'],
  steps: [
    {...recipeStep(1, '베이스 립', [
      {role: '베이스', name: '누드 로즈', hex: '#B97878'},
    ]), productType: '립 틴트'},
    {...recipeStep(2, '안쪽 포인트를 겹쳐 그라데이션', [
      {role: '안쪽 포인트', name: '딥 베리', hex: '#8E3F56'},
    ]), productType: '립 틴트'},
    {...recipeStep(3, '글로우 마무리', [
      {role: '광택', name: '클리어 로즈', hex: '#D69A9A'},
    ]), productType: '립 글로스'},
  ],
};

const recipes = buildFinalAreaRecipes([
  guide('base', 2),
  guide('brow', 3),
  eye,
  guide('cheek', 4),
  lip,
], PARTS);
expectEqual(recipes[0]?.area, 'eye', 'applicationOrder decides the first area');
expectEqual(recipes[0]?.displayOrder, 1, 'display order is contiguous');
expectEqual(recipes[0]?.estimatedMinutes, 7, 'estimated minutes are preserved');
expectEqual(recipes[0]?.steps.length, 5, 'eye recipe preserves all five application steps');
expectEqual(
  new Set(recipes[0]?.steps.flatMap(step => step.colors.map(color => color.hex))).size,
  5,
  'eye recipe preserves at least three distinct color layers',
);
expectEqual(
  recipes[0]?.summaryColors.map(color => color.name).join('|'),
  '라이트 베이지|소프트 토프|로즈 브라운|딥 브라운|샴페인 베이지',
  'eye summary exposes every application color in step order',
);
expectEqual(recipes[0]?.steps[0]?.tool, '플랫 브러시', 'step tool is preserved');
expectEqual(recipes[0]?.completionCriteria[0], '경계가 보이지 않아요.', 'completion criteria are preserved');
expectEqual(recipes[4]?.steps.length, 3, 'lip recipe preserves all three application steps');
expectEqual(
  new Set(recipes[4]?.steps.flatMap(step => step.colors.map(color => color.hex))).size,
  3,
  'lip recipe preserves at least two mixed colors',
);

const legacy = buildFinalAreaRecipes([guide('base')], PARTS)[0];
expectEqual(legacy?.area, 'base', 'canonical order is the legacy fallback');
expectEqual(legacy?.detailed, false, 'legacy guide is marked as non-detailed');
expectEqual(
  legacy?.steps[0]?.technique,
  '기존 단계\n얇게 펴 바르기',
  'legacy instruction and stored technique stay visible',
);
expectEqual(legacy?.steps[0]?.placement, '정해진 범위', 'legacy stored placement stays visible');
expectEqual(
  legacy?.summaryColors[0]?.name,
  '로즈 브라운',
  'legacy summary falls back to the area guide primary color',
);
expectEqual(legacy?.steps[0]?.tool, '', 'legacy fallback does not invent a tool');
expectEqual(legacy?.steps[0]?.amount, '', 'legacy fallback does not invent an amount');
expectEqual(legacy?.completionCriteria.length, 0, 'legacy fallback does not invent completion criteria');

const LOOK: MakeupLookRecommendation = {
  id: 'strict-plan-look',
  arFilterId: 'filter',
  role: 'anchor',
  title: '테스트 룩',
  summary: '요약',
  imageSource: {uri: 'https://example.com/look.jpg'},
  reasons: [],
  appliedConditions: [],
  durationMinutes: 15,
  difficulty: 'easy',
  steps: [],
  products: [],
};
const validMappedPlan = buildRecommendedAreaGuides({
  directGuides: [eye],
  look: LOOK,
}).find(item => item.area === 'eye')?.applicationPlan;
expectEqual(validMappedPlan?.recipeVersion, 'makeup-application-v1', 'strict valid plan is accepted');

const invalidColorPlan: ApiAreaGuide = {
  ...eye,
  applicationPlan: {
    ...eye.applicationPlan!,
    steps: eye.applicationPlan!.steps.map((step, index) => ({
      ...step,
      colors: index === 0 ? [{role: '베이스', name: '오류 색상', hex: 'rose'}] : step.colors,
    })),
  },
};
const rejectedPlan = buildRecommendedAreaGuides({
  directGuides: [invalidColorPlan],
  look: LOOK,
}).find(item => item.area === 'eye')?.applicationPlan;
expectEqual(rejectedPlan, undefined, 'one invalid color rejects the entire detailed plan');
const rejectedGuide = buildRecommendedAreaGuides({
  directGuides: [invalidColorPlan],
  look: LOOK,
}).find(item => item.area === 'eye');
expectEqual(rejectedGuide?.applicationOrder, undefined, 'invalid plan also rejects its application order');

const gappedOrderPlan: ApiAreaGuide = {
  ...eye,
  applicationPlan: {
    ...eye.applicationPlan!,
    steps: eye.applicationPlan!.steps.map((step, index) => ({
      ...step,
      order: index === 0 ? 1 : 3,
    })),
  },
};
const rejectedGappedPlan = buildRecommendedAreaGuides({
  directGuides: [gappedOrderPlan],
  look: LOOK,
}).find(item => item.area === 'eye')?.applicationPlan;
expectEqual(rejectedGappedPlan, undefined, 'non-contiguous step orders reject the entire detailed plan');

const unpairedPlan: ApiAreaGuide = {...eye, applicationOrder: undefined};
const rejectedUnpairedPlan = buildRecommendedAreaGuides({
  directGuides: [unpairedPlan],
  look: LOOK,
}).find(item => item.area === 'eye')?.applicationPlan;
expectEqual(rejectedUnpairedPlan, undefined, 'plan without a valid application order stays legacy');

const incompleteBase = guide('base', 1);
incompleteBase.applicationPlan = {
  recipeVersion: 'makeup-application-v1',
  estimatedMinutes: 6,
  completionCriteria: ['피부 표현이 균일해요.'],
  steps: [1, 2, 3, 4].map(order => recipeStep(
    order,
    '베이스 ' + order + '단계',
    [{role: '피부 바탕', name: '뉴트럴 베이지', hex: '#D9B49A'}],
  )),
};
expectEqual(
  buildRecommendedAreaGuides({directGuides: [incompleteBase], look: LOOK})
    .find(item => item.area === 'base')?.applicationPlan,
  undefined,
  'base plan without selective powder and preserved glow zones stays legacy',
);

const partialEyePlan: ApiAreaGuide = {
  ...eye,
  applicationPlan: {
    ...eye.applicationPlan!,
    steps: eye.applicationPlan!.steps.slice(0, 4),
  },
};
expectEqual(
  buildRecommendedAreaGuides({directGuides: [partialEyePlan], look: LOOK})
    .find(item => item.area === 'eye')?.applicationPlan,
  undefined,
  'eye plan with fewer than five steps stays legacy',
);

const incompleteLipPlan: ApiAreaGuide = {
  ...lip,
  applicationPlan: {
    ...lip.applicationPlan!,
    steps: lip.applicationPlan!.steps.map(step => ({
      ...step,
      colors: [{role: '단일 색상', name: '누드 로즈', hex: '#B97878'}],
      title: step.title.replace('안쪽', '').replace('그라데이션', '').replace('글로우', ''),
      productType: '립 틴트',
    })),
  },
};
expectEqual(
  buildRecommendedAreaGuides({directGuides: [incompleteLipPlan], look: LOOK})
    .find(item => item.area === 'lip')?.applicationPlan,
  undefined,
  'single-color lip plan without gradient or gloss stays legacy',
);