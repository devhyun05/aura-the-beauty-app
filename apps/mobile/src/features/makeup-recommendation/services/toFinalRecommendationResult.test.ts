import type {
  MakeupLookRecommendation,
  MakeupRecommendationFitAssessment,
  MakeupRecommendationGenerationSource,
  MakeupRecommendationMatchAssessment,
  MakeupRecommendationProduct,
  MakeupRecommendationQuestion,
  RecommendedMakeupAreaGuide,
} from '../types';
import {
  clampFinalLookMapCoordinate,
  toFinalRecommendationAnswerRows,
  toFinalRecommendationResult,
} from './toFinalRecommendationResult';
import {
  computeFinalMakeupImageTransform,
  projectFinalMakeupAlignmentPoint,
} from './finalMakeupImageAlignment';
import {mapBackendImageAlignmentMetadata} from './makeupRecommendationService';
function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}


function expectClose(actual: number, expected: number, label: string, tolerance = 0.001) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}
function makeProduct(matchRate?: number): MakeupRecommendationProduct {
  return {
    id: `product-${String(matchRate)}`,
    area: 'base',
    brandName: 'AURA',
    productName: '테스트 베이스',
    reason: '피부 톤과 잘 맞아요.',
    matchRate,
  };
}

function makeAreaGuide(products: MakeupRecommendationProduct[]): RecommendedMakeupAreaGuide {
  return {
    area: 'base',
    label: '베이스',
    goal: '얇고 균일한 피부 표현',
    color: {name: '뉴트럴 베이지', hex: '#D9B49A'},
    texture: '세미 매트',
    placement: '얼굴 중앙부터 바깥쪽',
    technique: '얇게 펴 발라요.',
    reason: '피부 톤을 균일하게 보여줘요.',
    avoid: [],
    steps: [{order: 1, instruction: '얇게 펴 발라요.'}],
    products,
    arSupported: true,
  };
}

function makeLook(
  role: MakeupLookRecommendation['role'],
  overrides: Partial<MakeupLookRecommendation> = {},
): MakeupLookRecommendation {
  return {
    id: `look-${role}`,
    arFilterId: `filter-${role}`,
    role,
    title: `${role} 룩`,
    summary: `${role} 요약`,
    imageSource: {uri: `https://example.com/${role}.jpg`},
    reasons: ['추천 이유'],
    appliedConditions: [],
    durationMinutes: 15,
    difficulty: 'easy',
    steps: [],
    products: [],
    ...overrides,
  };
}

function makeFitAssessment(overallScore = 87): MakeupRecommendationFitAssessment {
  return {
    scoringVersion: 'makeup-fit-v1',
    overallScore,
    dimensions: {
      situation: {available: true, score: 91, reason: '면접 상황의 단정한 인상과 맞아요.'},
      preference: {available: true, score: 84, reason: '역질문의 자연스러운 답변을 반영했어요.'},
      personalColor: {available: true, score: 88, reason: '여름 쿨 팔레트와 조화로워요.'},
      faceStructure: {available: true, score: 85, reason: '얼굴 구조의 균형을 보완해요.'},
      skinCompatibility: {available: true, score: 82, reason: '건성 피부에 얇은 레이어를 사용해요.'},
      lookCoherence: {available: true, score: 90, reason: '추천 이미지와 부위별 설계가 일치해요.'},
    },
    evidence: [
      {source: 'situation', label: '면접', reason: '단정한 상황 인상을 반영했어요.'},
      {source: 'preference', label: '자연스럽게', reason: '역질문 답변을 반영했어요.'},
      {source: 'personal_color', label: '여름 쿨', reason: '팔레트에 반영했어요.'},
      {source: 'face_structure', label: '얼굴 구조', reason: '배치 설계에 반영했어요.'},
      {source: 'skin_type', label: '건성', reason: '피부 표현에 반영했어요.'},
      {source: 'look_coherence', label: '추천 이미지 일관성', reason: '이미지와 가이드가 연결돼요.'},
    ],
  };
}

function makeMatchAssessment(
  score: number | null = 87,
  generationSource: MakeupRecommendationGenerationSource = 'claude',
): MakeupRecommendationMatchAssessment {
  const fullyEvaluated = score !== null;
  return {
    version: 'makeup-match-v1',
    score,
    evaluatedWeight: fullyEvaluated ? 100 : 35,
    components: [
      {
        key: 'preference',
        weight: 35,
        score: 88,
        evaluated: true,
        reason: '역질문과 추가 요청을 비교했어요.',
        evidence: ['역질문 답변: 자연스럽게'],
      },
      {
        key: 'situation',
        weight: 25,
        score: fullyEvaluated ? 90 : null,
        evaluated: fullyEvaluated,
        reason: '상황과 원하는 인상을 비교했어요.',
        evidence: fullyEvaluated ? ['상황: 면접'] : [],
      },
      {
        key: 'colorHarmony',
        weight: 25,
        score: fullyEvaluated ? 84 : null,
        evaluated: fullyEvaluated,
        reason: '추천 HEX와 퍼스널컬러 팔레트를 비교했어요.',
        evidence: fullyEvaluated ? ['퍼스널컬러: 여름 쿨'] : [],
      },
      {
        key: 'skinFinish',
        weight: 15,
        score: fullyEvaluated ? 82 : null,
        evaluated: fullyEvaluated,
        reason: '피부 타입과 베이스 마무리를 비교했어요.',
        evidence: fullyEvaluated ? ['피부 타입: 건성'] : [],
      },
    ],
    reflectedInputs: fullyEvaluated
      ? [
          {
            sourceType: 'question_answer',
            sourceId: 'intensity',
            inputLabel: '자연스럽게',
            decisionPath: 'looks[0].areaGuides[2].technique',
            reflectedValue: '옅게 블렌딩',
          },
        ]
      : [],
    generationSource,
  };
}

const QUESTIONS: readonly MakeupRecommendationQuestion[] = [
  {
    id: 'occasion',
    dimension: 'occasion',
    title: '  어떤 자리인가요?  ',
    options: [{id: 'date', label: '  데이트  '}],
  },
  {
    id: 'mood',
    dimension: 'mood',
    title: '원하는 분위기',
    options: [],
  },
  {
    id: 'duplicate',
    dimension: 'mood',
    title: '원하는 분위기',
    options: [{id: 'soft', label: '소프트 매트'}],
  },
];

const answerRows = toFinalRecommendationAnswerRows(QUESTIONS, [
  {questionId: 'mood', optionId: 'missing', freeText: '  소프트 매트  '},
  {questionId: 'occasion', optionId: 'date', freeText: '무시할 자유 입력'},
  {questionId: 'duplicate', optionId: 'soft'},
  {questionId: 'unknown', freeText: '노출하지 않음'},
]);
expectEqual(answerRows.length, 2, 'answer rows trim and dedupe');
expectEqual(answerRows[0]?.id, 'occasion', 'answer rows expose a stable question id');
expectEqual(answerRows[0]?.questionLabel, '어떤 자리인가요?', 'answer rows keep question order');
expectEqual(answerRows[1]?.id, 'mood', 'free-text rows keep their question id');
expectEqual(answerRows[0]?.answerLabel, '데이트', 'answer rows prefer option labels');
expectEqual(answerRows[1]?.questionLabel, '원하는 분위기', 'free text question label');
expectEqual(answerRows[1]?.answerLabel, '소프트 매트', 'answer rows fall back to free text');

const orderedResults = [makeLook('bold'), makeLook('anchor')];
const originalOrder = orderedResults.map(result => result.id).join(',');
const anchorModel = toFinalRecommendationResult(orderedResults, {
  questions: QUESTIONS,
  answers: [{questionId: 'occasion', optionId: 'date', additionalConstraints: '답변 제약'}],
  additionalConstraints: '  글리터 제외  ',
});
expectEqual(anchorModel?.sourceLook.role, 'anchor', 'anchor look is selected');
expectEqual(anchorModel?.additionalConstraints, '글리터 제외', 'direct constraints stay separate and trimmed');
expectEqual(
  orderedResults.map(result => result.id).join(','),
  originalOrder,
  'source result order is not mutated',
);

const firstLookModel = toFinalRecommendationResult([makeLook('bold')], {
  answers: [
    {questionId: 'occasion', additionalConstraints: '첫 요청'},
    {questionId: 'mood', additionalConstraints: '  마지막 요청  '},
  ],
});
expectEqual(firstLookModel?.sourceLook.role, 'bold', 'first look is the fallback');
expectEqual(
  firstLookModel?.additionalConstraints,
  '마지막 요청',
  'last answer constraint is restored when the direct value is absent',
);

const evidenceLook = makeLook('anchor', {
  summary: 'Interview makeup for Summer Cool with a matte base and soft coral lip',
  reasons: ['Dry Skin needs thin layers', 'No glitter keeps the finish restrained'],
  appliedConditions: ['Interview', 'Natural', 'Summer Cool', 'Dry Skin', 'No glitter'],
  products: [makeProduct(1), makeProduct(100)],
  generationSource: 'claude',
  fitAssessment: makeFitAssessment(),
  matchAssessment: makeMatchAssessment(),
  lookMap: {
    version: 'makeup-look-map-v1',
    naturalityToPersonality: 63,
    casualToGlam: 77,
    rationale: '채도와 질감, 면접 상황을 함께 계산했어요.',
  },
});
const scoredModel = toFinalRecommendationResult([evidenceLook]);
expectEqual(scoredModel?.match.source, 'server-match', 'look score uses matchAssessment only');
expectEqual(scoredModel?.match.value, 87, 'server match score is preserved');
expectEqual(scoredModel?.look.match, 87, 'view-model mirrors the server match score');
expectEqual(
  scoredModel?.match.explanation,
  '선택한 상황과 분석 정보를 기준으로 계산한 예상값이에요.',
  'the UI exposes one neutral explanation without internal source details',
);
expectEqual(scoredModel?.look.mx, 63, 'LOOK MAP personality coordinate comes from the server');
expectEqual(scoredModel?.look.my, 77, 'LOOK MAP glam coordinate comes from the server');
expectEqual(
  scoredModel?.look.mapRationale,
  '채도와 질감, 면접 상황을 함께 계산했어요.',
  'LOOK MAP rationale comes from the server',
);

const productIndependentModel = toFinalRecommendationResult([
  {...evidenceLook, products: [makeProduct(999)]},
]);
expectEqual(
  productIndependentModel?.match.value,
  scoredModel?.match.value,
  'catalog product matchRate does not affect look suitability',
);

const echoOnlyModel = toFinalRecommendationResult([makeLook('anchor', {
  appliedConditions: ['Interview', 'Natural', 'Summer Cool', 'Dry Skin', 'No glitter'],
  reasons: ['Generic recommendation'],
  summary: 'Generic recommendation',
})]);
expectEqual(
  echoOnlyModel?.match.value,
  null,
  'old echoed text cannot create a recommendation match score',
);
expectEqual(echoOnlyModel?.match.source, 'legacy-unavailable', 'old results do not invent a score');

const fallbackModel = toFinalRecommendationResult([makeLook('anchor', {
  generationSource: 'deterministic_fallback',
  fitAssessment: makeFitAssessment(99),
  matchAssessment: makeMatchAssessment(99, 'deterministic_fallback'),
})]);
expectEqual(fallbackModel?.match.value, 99, 'generation source does not cap the deterministic score');
expectEqual(fallbackModel?.match.source, 'server-match', 'fallback uses the same match contract');

const guideProduct = {
  ...makeProduct(93),
  id: 'guide-product',
  brandName: '가이드 브랜드',
  productName: '가이드 제품',
};
const lookProduct = {
  ...makeProduct(88),
  id: 'look-product',
  brandName: '룩 브랜드',
  productName: '룩 제품',
};
const guideFirstModel = toFinalRecommendationResult([
  makeLook('anchor', {
    products: [lookProduct],
    areaGuides: [makeAreaGuide([guideProduct])],
  }),
]);
expectEqual(
  guideFirstModel?.look.parts.base.prod.name,
  '가이드 제품',
  'area guide product takes precedence over look-level product',
);

const lookFallbackModel = toFinalRecommendationResult([
  makeLook('anchor', {
    products: [lookProduct],
    areaGuides: [makeAreaGuide([])],
  }),
]);
expectEqual(
  lookFallbackModel?.look.parts.base.prod.name,
  '룩 제품',
  'empty area guide products fall back to the matching look-level product',
);

const PRODUCT_AREAS = ['base', 'brow', 'eye', 'cheek', 'lip'] as const;
const fixtureFallbackModel = toFinalRecommendationResult([
  makeLook('bold', {
    products: [],
    areaGuides: [makeAreaGuide([])],
  }),
]);
for (const area of PRODUCT_AREAS) {
  expectEqual(
    fixtureFallbackModel?.look.parts[area].prod.name,
    '',
    'empty guide and look products stay empty instead of using a fixture for ' + area,
  );
}

const invalidScoreModel = toFinalRecommendationResult([
  makeLook('anchor', {products: [makeProduct(0), makeProduct(999)]}),
]);
expectEqual(
  invalidScoreModel?.match.source,
  'legacy-unavailable',
  'products do not create a score when the stored result has no matchAssessment',
);
expectEqual(
  invalidScoreModel?.match.value,
  null,
  'missing server assessment does not use a fake neutral value',
);

const estimatedModel = toFinalRecommendationResult([
  makeLook('anchor', {reasons: [' ', ''], summary: '  요약 추천 이유  '}),
]);
expectEqual(
  estimatedModel?.match.source,
  'legacy-unavailable',
  'old results without matchAssessment are explicitly labeled',
);
expectEqual(estimatedModel?.match.value, null, 'old results do not display a made-up percentage');

const insufficientModel = toFinalRecommendationResult([
  makeLook('anchor', {matchAssessment: makeMatchAssessment(null)}),
]);
expectEqual(
  insufficientModel?.match.source,
  'insufficient-evidence',
  'new results preserve the server insufficient-evidence state',
);
expectEqual(insufficientModel?.match.value, null, 'insufficient evidence hides the percentage');

expectEqual(toFinalRecommendationResult([]), null, 'empty recommendations return null');
expectEqual(clampFinalLookMapCoordinate(-4), 0, 'map coordinate lower clamp');
expectEqual(clampFinalLookMapCoordinate(104), 100, 'map coordinate upper clamp');
expectEqual(clampFinalLookMapCoordinate(Number.NaN), 50, 'invalid map coordinate uses center');

const alignmentMetadata = mapBackendImageAlignmentMetadata({
  version: 'makeup-face-alignment-v1',
  source: {
    imageSize: {width: 1000, height: 1000},
    faceBox: {left: 0.2, top: 0.12, right: 0.8, bottom: 0.92},
    eyeCenters: {
      imageLeft: {x: 0.3, y: 0.4},
      imageRight: {x: 0.7, y: 0.4},
    },
    rollDeg: 0,
  },
  generated: {
    imageSize: {width: 800, height: 1200},
    faceBox: {left: 0.18, top: 0.1, right: 0.82, bottom: 0.9},
    eyeCenters: {
      imageLeft: {x: 0.32, y: 0.55},
      imageRight: {x: 0.68, y: 0.49},
    },
  },
});
if (!alignmentMetadata?.source.eyeCenters || !alignmentMetadata.generated.eyeCenters) {
  throw new Error('valid face alignment metadata was not parsed');
}

const alignmentViewport = {width: 400, height: 500};
expectEqual(
  computeFinalMakeupImageTransform(undefined, alignmentViewport),
  null,
  'missing alignment metadata keeps the full-photo fallback',
);
const sourceTransform = computeFinalMakeupImageTransform(
  alignmentMetadata.source,
  alignmentViewport,
  alignmentMetadata.source,
);
const generatedTransform = computeFinalMakeupImageTransform(
  alignmentMetadata.generated,
  alignmentViewport,
  alignmentMetadata.source,
);
if (!sourceTransform || !generatedTransform) {
  throw new Error('valid face alignment transform was not computed');
}

const sourceLeftEye = projectFinalMakeupAlignmentPoint(
  sourceTransform,
  alignmentMetadata.source.eyeCenters.imageLeft,
);
const sourceRightEye = projectFinalMakeupAlignmentPoint(
  sourceTransform,
  alignmentMetadata.source.eyeCenters.imageRight,
);
const generatedLeftEye = projectFinalMakeupAlignmentPoint(
  generatedTransform,
  alignmentMetadata.generated.eyeCenters.imageLeft,
);
const generatedRightEye = projectFinalMakeupAlignmentPoint(
  generatedTransform,
  alignmentMetadata.generated.eyeCenters.imageRight,
);
const midpoint = (left: {x: number; y: number}, right: {x: number; y: number}) => ({
  x: (left.x + right.x) / 2,
  y: (left.y + right.y) / 2,
});
const distance = (left: {x: number; y: number}, right: {x: number; y: number}) =>
  Math.hypot(right.x - left.x, right.y - left.y);
const sourceMidpoint = midpoint(sourceLeftEye, sourceRightEye);
const generatedMidpoint = midpoint(generatedLeftEye, generatedRightEye);
expectClose(sourceMidpoint.x, 200, 'source eye midpoint x preserves the captured frame');
expectClose(sourceMidpoint.y, 210, 'source eye midpoint y preserves the captured frame');
expectClose(generatedMidpoint.x, sourceMidpoint.x, 'generated eye midpoint x');
expectClose(generatedMidpoint.y, sourceMidpoint.y, 'generated eye midpoint y');
expectClose(distance(sourceLeftEye, sourceRightEye), 160, 'source eye distance is not zoomed');
expectClose(distance(generatedLeftEye, generatedRightEye), 160, 'generated eye distance');
expectClose(sourceLeftEye.y, sourceRightEye.y, 'source eye line roll');
expectClose(generatedLeftEye.y, generatedRightEye.y, 'generated eye line roll');
expectClose(sourceTransform.scale, 1, 'source keeps its original scale');
expectClose(sourceTransform.rotationDeg, 0, 'source keeps its original angle');
expectClose(sourceTransform.renderedWidth, 400, 'source contain width');
expectClose(sourceTransform.renderedHeight, 400, 'source contain height');
expectClose(sourceTransform.originY, 50, 'source remains centered without cropping');

const faceBoxFallbackMetadata = mapBackendImageAlignmentMetadata({
  version: 'makeup-face-alignment-v1',
  source: {
    imageSize: {width: 1000, height: 1000},
    faceBox: {left: 0.2, top: 0.1, right: 0.8, bottom: 0.9},
    eyeCenters: {
      imageLeft: {x: -0.2, y: 0.4},
      imageRight: {x: 0.7, y: 0.4},
    },
  },
  generated: alignmentMetadata.generated,
});
if (!faceBoxFallbackMetadata) throw new Error('face-box fallback metadata was not parsed');
expectEqual(
  faceBoxFallbackMetadata.source.eyeCenters,
  undefined,
  'invalid eye centers fall back to face box',
);
const faceBoxTransform = computeFinalMakeupImageTransform(
  faceBoxFallbackMetadata.source,
  alignmentViewport,
);
if (!faceBoxTransform) throw new Error('face-box fallback transform was not computed');
const faceCenter = projectFinalMakeupAlignmentPoint(faceBoxTransform, {x: 0.5, y: 0.5});
expectClose(faceCenter.x, 200, 'face-box fallback center x');
expectClose(faceCenter.y, 250, 'face-box fallback center y');

expectEqual(
  mapBackendImageAlignmentMetadata({...alignmentMetadata, version: 'unknown'}),
  undefined,
  'unknown alignment metadata version is ignored',
);
expectEqual(
  mapBackendImageAlignmentMetadata({
    ...alignmentMetadata,
    generated: {...alignmentMetadata.generated, faceBox: {left: 0.8, top: 0.1, right: 0.2, bottom: 0.9}},
  }),
  undefined,
  'invalid generated face box rejects alignment metadata',
);
