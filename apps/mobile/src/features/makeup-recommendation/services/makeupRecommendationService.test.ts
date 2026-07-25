import {
  answerGeneratedMakeupRecommendationQuestion,
  answerGeneratedMakeupRecommendationQuestionV2,
  createMakeupRecommendationIdempotencyKey,
  fetchMakeupRecommendationDiscovery,
  fetchGeneratedMakeupRecommendationSessionV2,
  generateMakeupRecommendationV2,
  answerMakeupRecommendationQuestion,
  getMakeupScenarioSet,
  getPopularMakeupScenarios,
  mapBackendCropRegions,
  mapBackendRecommendationReports,
  mapBackendRecommendationReportsPage,
  mapBackendRecommendationLooks,
  MakeupRecommendationRetryableError,
  refineGeneratedMakeupRecommendation,
  refineMakeupRecommendation,
  refreshGeneratedMakeupRecommendation,
  restoreMakeupRecommendationReport,
  rewindMakeupRecommendationHistoryOffset,
  retryGeneratedMakeupRecommendationImages,
  startGeneratedMakeupRecommendation,
  startGeneratedMakeupRecommendationV2,
  startMakeupRecommendation,
} from './makeupRecommendationService';
import {buildRecommendedAreaGuides} from './makeupRecommendationMappers';
import {
  getMakeupRecommendationPreviewPresentation,
  getMakeupRecommendationPreviewStatusLabel,
} from './makeupRecommendationPreview';
import {
  MAKEUP_RECOMMENDATION_EVENT_NAMES,
  markKnownMakeupRecommendationImageEvents,
  sanitizeMakeupRecommendationEventMetadata,
  takeNewMakeupRecommendationImageEvents,
  trackMakeupRecommendationEvent,
} from './makeupRecommendationTelemetry';
import {
  clearCurrentMakeupRecommendationSessionId,
  getMakeupRecommendationSessionRestoreDestination,
  MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY,
  readCurrentMakeupRecommendationSessionId,
  saveCurrentMakeupRecommendationSessionId,
  shouldDiscardStoredMakeupRecommendationSessionForError,
  type MakeupRecommendationSessionIdStorage,
} from './makeupRecommendationSessionPersistence';
import {BackendApiError, BackendNetworkError, requestBackendJson} from '../../../shared/services/backendApi';
import {MAKEUP_SITUATION_FIXTURES} from '../data/makeupRecommendationV2Catalog';
import type {MakeupRecommendationSession} from '../types';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expectThrows(action: () => unknown, label: string) {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  expectEqual(threw, true, label);
}

const COMPLETE_BACKEND_STEPS = ['base', 'brow', 'eye', 'cheek', 'lip'].map((area, index) => ({
  order: index + 1,
  area,
  instruction: `${area} 가이드를 적용해요.`,
}));
const COMPLETE_BACKEND_LOOK_FIELDS = {
  summary: '서버가 생성한 완전한 추천 요약',
  reasons: ['선택한 상황과 답변을 반영했어요.'],
  appliedConditions: ['사용자가 선택한 상황'],
  durationMinutes: 15,
  difficulty: 'medium',
  steps: COMPLETE_BACKEND_STEPS,
};

const intentKeyA = createMakeupRecommendationIdempotencyKey();
const intentKeyB = createMakeupRecommendationIdempotencyKey();
expectEqual(/^makeup-v2-[0-9a-f-]{36}$/.test(intentKeyA), true, 'v2 intent key format');
expectEqual(intentKeyA === intentKeyB, false, 'each new intent gets a distinct idempotency key');

const scenarios = getMakeupScenarioSet({seed: 0});
const popularScenarios = getPopularMakeupScenarios();
expectEqual(popularScenarios.length, 5, 'popular scenario count');
expectEqual(
  popularScenarios.map(item => item.displayText).join('|'),
  '데일리로 자연스럽게|출근·등교 단정하게|데이트·약속에서 매력적으로|사진에서 또렷하게|중요한 날 오래 유지되게',
  'popular scenario order and copy stay fixed',
);
expectEqual(
  scenarios.some(item => popularScenarios.some(popular => popular.id === item.id)),
  false,
  'general scenario pool excludes popular scenarios',
);
expectEqual(scenarios.length, 49, 'scenario set count');
expectEqual(new Set(scenarios.slice(0, 6).map(item => item.tone)).size, 3, 'first six tone coverage');
expectEqual(new Set(scenarios.map(item => item.copyStyle)).size, 5, 'five copy styles represented');
expectEqual(
  scenarios.every(item => item.preferredColumnSpan >= 3 && item.preferredColumnSpan <= 8),
  true,
  'puzzle spans stay in range',
);
expectEqual(scenarios.some(item => item.palette === 'accent'), true, 'accent chips represented');
expectEqual(
  scenarios.some(item => /여신|남신|고명딸/.test(item.displayText)),
  false,
  'default copy is gender neutral',
);
expectEqual(
  scenarios.filter(item => item.displayText.includes('오늘')).length <= 2,
  true,
  'today copy is not overused',
);

expectEqual(
  getMakeupScenarioSet({seed: 0}).map(item => item.id).join(','),
  scenarios.map(item => item.id).join(','),
  'same seed keeps general scenario order stable',
);
expectEqual(
  getMakeupScenarioSet({seed: 17}).map(item => item.id).join(',') === scenarios.map(item => item.id).join(','),
  false,
  'new seed reshuffles general scenarios',
);

const MEDIA_PIPE_CROP_METADATA = {
  version: 'makeup-face-crops-v1',
  imageSize: {width: 900, height: 1100},
  areas: {
    base: [{regionId: 'face', box: {left: 0.2, top: 0.1, right: 0.8, bottom: 0.9}}],
    brow: [
      {regionId: 'left_eye', box: {left: 0.5, top: 0.28, right: 0.75, bottom: 0.46}},
      {regionId: 'right_eye', box: {left: 0.25, top: 0.28, right: 0.5, bottom: 0.46}},
    ],
    eye: [
      {regionId: 'left_eye', box: {left: 0.5, top: 0.28, right: 0.75, bottom: 0.46}},
      {regionId: 'right_eye', box: {left: 0.25, top: 0.28, right: 0.5, bottom: 0.46}},
    ],
    cheek: [
      {regionId: 'left_cheek', box: {left: 0.52, top: 0.46, right: 0.78, bottom: 0.7}},
      {regionId: 'right_cheek', box: {left: 0.22, top: 0.46, right: 0.48, bottom: 0.7}},
    ],
    lip: [{regionId: 'lips', box: {left: 0.3605, top: 0.644, right: 0.6395, bottom: 0.796}}],
  },
} as const;

const mappedCropRegions = mapBackendCropRegions(MEDIA_PIPE_CROP_METADATA);
expectEqual(mappedCropRegions?.brow?.length, 2, 'MediaPipe brow keeps paired landmark boxes');
expectEqual(mappedCropRegions?.lip?.[0]?.top, 0.644, 'MediaPipe lip box is preserved');
expectEqual(
  mapBackendCropRegions({version: 'makeup-face-crops-v1', areas: {lip: [{box: {left: 0, top: 0, right: 1.2, bottom: 1}}]}}),
  undefined,
  'out-of-range crop metadata is rejected',
);

const BACKEND_LOOK_MAP = {
  version: 'makeup-look-map-v1',
  naturalityToPersonality: 61,
  casualToGlam: 74,
  rationale: '추천 팔레트의 채도와 질감, 선택한 상황을 계산했어요.',
} as const;
const BACKEND_FIT_ASSESSMENT = {
  scoringVersion: 'makeup-fit-v1',
  overallScore: 87,
  dimensions: {
    situation: {available: true, score: 91, reason: '상황과 어울려요.'},
    preference: {available: true, score: 84, reason: '답변과 어울려요.'},
    personalColor: {available: true, score: 88, reason: '퍼스널 컬러와 어울려요.'},
    faceStructure: {available: true, score: 85, reason: '얼굴 구조와 어울려요.'},
    skinCompatibility: {available: true, score: 82, reason: '피부 표현과 어울려요.'},
    lookCoherence: {available: true, score: 90, reason: '이미지와 가이드가 일관돼요.'},
  },
  evidence: [
    {source: 'situation', label: '면접', reason: '상황 근거'},
    {source: 'preference', label: '자연스럽게', reason: '답변 근거'},
    {source: 'personal_color', label: '여름 쿨', reason: '컬러 근거'},
    {source: 'face_structure', label: '얼굴 구조', reason: '구조 근거'},
    {source: 'skin_type', label: '건성', reason: '피부 근거'},
    {source: 'look_coherence', label: '추천 이미지 일관성', reason: '일관성 근거'},
  ],
} as const;
const BACKEND_MATCH_ASSESSMENT = {
  version: 'makeup-match-v1',
  score: 99,
  evaluatedWeight: 100,
  components: [
    {
      key: 'preference',
      weight: 35,
      score: 97,
      evaluated: true,
      reason: 'The recommendation reflects explicit answers.',
      evidence: ['answer.optionLabel', 'answer.additionalConstraints'],
    },
    {
      key: 'situation',
      weight: 25,
      score: 96,
      evaluated: true,
      reason: 'The recommendation fits the selected situation.',
      evidence: ['selection.situation.label'],
    },
    {
      key: 'colorHarmony',
      weight: 25,
      score: 94,
      evaluated: true,
      reason: 'The color palette is harmonious.',
      evidence: ['analysisReport.personalColor'],
    },
    {
      key: 'skinFinish',
      weight: 15,
      score: 92,
      evaluated: true,
      reason: 'The finish is compatible with the skin profile.',
      evidence: ['analysisReport.skinType'],
    },
  ],
  reflectedInputs: [{
    sourceType: 'answer',
    sourceId: 'finish',
    inputLabel: 'soft finish',
    decisionPath: 'looks.anchor.areaGuides.base.applicationPlan.steps',
    reflectedValue: 'soft matte base',
  }],
  generationSource: 'claude',
} as const;

const generatedLooks = mapBackendRecommendationLooks({
  reportId: 'report-1',
  prompt: '퇴근 후 약속',
  questions: [],
  answers: [],
  imageStatus: 'pending',
  recommendation: {
    generationSource: 'claude',
    matchAssessment: BACKEND_MATCH_ASSESSMENT,
    looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
      id: `look-${index + 1}`,
      role,
      title: role,
      summary: `${role} summary`,
      reasons: ['선택 이유'],
      appliedConditions: ['퇴근 후 약속'],
      durationMinutes: 15,
      difficulty: 'medium',
      steps: COMPLETE_BACKEND_STEPS,
      products: [{area: 'base', brandName: '브랜드', productName: '쿠션', reason: '얇은 표현'}],
      lookMap: BACKEND_LOOK_MAP,
      fitAssessment: BACKEND_FIT_ASSESSMENT,
      ...(index === 0
        ? {imageAsset: {provenance: {cropMetadata: MEDIA_PIPE_CROP_METADATA}}}
        : {}),
    })),
  },
});

expectEqual(generatedLooks.length, 3, 'three backend looks are mapped');
expectEqual(generatedLooks.map(look => look.role).join(','), 'anchor,bold,discovery', 'backend look roles are preserved');
expectEqual(generatedLooks[0].generationSource, 'claude', 'generation source is mapped onto each look');
expectEqual(generatedLooks[0].matchAssessment?.score, 99, 'server match score is preserved exactly');
expectEqual(
  generatedLooks[0].matchAssessment?.reflectedInputs[0]?.decisionPath,
  'looks.anchor.areaGuides.base.applicationPlan.steps',
  'server match reflected input path is preserved',
);
expectEqual(generatedLooks[1].matchAssessment, undefined, 'match assessment is attached only to the anchor look');
expectEqual(generatedLooks[0].fitAssessment?.overallScore, 87, 'server fit assessment is mapped');
expectEqual(
  generatedLooks[0].fitAssessment?.dimensions.lookCoherence.score,
  90,
  'fit dimension breakdown is preserved',
);
expectEqual(generatedLooks[0].lookMap?.casualToGlam, 74, 'server LOOK MAP coordinate is mapped');
expectEqual(generatedLooks[0].imageCropRegions?.lip?.[0]?.bottom, 0.796, 'landmark crop metadata is mapped onto the generated look');
expectEqual(
  generatedLooks[0].areaGuides?.find(guide => guide.area === 'base')?.products[0]?.brandName,
  '브랜드',
  'backend product data is preserved for its matching area',
);
expectEqual(
  generatedLooks[0].areaGuides?.find(guide => guide.area === 'eye')?.products.length,
  0,
  'missing backend area products stay empty instead of using fixture brands',
);

const legacyWithoutMatch = mapBackendRecommendationLooks({
  reportId: 'legacy-report-without-match',
  prompt: 'legacy result',
  questions: [],
  answers: [],
  imageStatus: 'pending',
  recommendation: {
    generationSource: 'claude',
    looks: [{
      ...COMPLETE_BACKEND_LOOK_FIELDS,
      id: 'legacy-anchor',
      role: 'anchor',
      title: 'legacy anchor',
    }],
  },
})[0];
expectEqual(
  legacyWithoutMatch.matchAssessment,
  undefined,
  'legacy result without matchAssessment does not invent a score',
);

const corruptMatch = mapBackendRecommendationLooks({
  reportId: 'report-with-corrupt-match',
  prompt: 'corrupt match result',
  questions: [],
  answers: [],
  imageStatus: 'pending',
  recommendation: {
    generationSource: 'claude',
    matchAssessment: {...BACKEND_MATCH_ASSESSMENT, score: 101},
    looks: [{
      ...COMPLETE_BACKEND_LOOK_FIELDS,
      id: 'corrupt-match-anchor',
      role: 'anchor',
      title: 'corrupt match anchor',
    }],
  },
})[0];
expectEqual(corruptMatch.matchAssessment, undefined, 'corrupt matchAssessment is ignored without a fallback score');

for (const {label, look} of [
  {label: 'missing title', look: {...COMPLETE_BACKEND_LOOK_FIELDS, id: 'missing-title', role: 'anchor', title: ' '}},
  {label: 'missing summary', look: {...COMPLETE_BACKEND_LOOK_FIELDS, id: 'missing-summary', role: 'anchor', title: 'title', summary: ' '}},
  {label: 'missing duration', look: {...COMPLETE_BACKEND_LOOK_FIELDS, id: 'missing-duration', role: 'anchor', title: 'title', durationMinutes: undefined}},
  {label: 'missing full steps', look: {...COMPLETE_BACKEND_LOOK_FIELDS, id: 'missing-steps', role: 'anchor', title: 'title', steps: []}},
]) {
  expectThrows(
    () => mapBackendRecommendationLooks({
      reportId: `report-${label}`,
      prompt: '면접',
      questions: [],
      answers: [],
      imageStatus: 'pending',
      recommendation: {generationSource: 'claude', looks: [look]},
    }),
    `${label} is rejected instead of being filled from a fixture`,
  );
}

for (const generationSource of [undefined] as const) {
  expectThrows(
    () => mapBackendRecommendationLooks({
      reportId: 'report-v2-without-ai-proof',
      prompt: '면접',
      questions: [],
      answers: [],
      imageStatus: 'pending',
      requireProductionGeneration: true,
      recommendation: {
        ...(generationSource ? {generationSource} : {}),
        looks: [{
          ...COMPLETE_BACKEND_LOOK_FIELDS,
          id: 'v2-without-ai-proof',
          role: 'anchor',
          title: 'V2 source 검증',
        }],
      },
    }),
    'V2 production result without a trusted generation source is rejected',
  );
}
const deterministicFallbackLooks = mapBackendRecommendationLooks({
  reportId: 'report-v2-fallback',
  prompt: '면접',
  questions: [],
  answers: [],
  imageStatus: 'pending',
  requireProductionGeneration: true,
  recommendation: {
    generationSource: 'deterministic_fallback',
    looks: [{
      ...COMPLETE_BACKEND_LOOK_FIELDS,
      id: 'v2-fallback',
      role: 'anchor',
      title: '기본 추천',
    }],
  },
});
expectEqual(
  deterministicFallbackLooks[0]?.generationSource,
  'deterministic_fallback',
  'V2 production accepts the safe deterministic fallback',
);
expectThrows(
  () => mapBackendRecommendationLooks({
    reportId: 'report-missing-completed-image',
    prompt: '면접',
    questions: [],
    answers: [],
    imageStatus: 'completed',
    recommendation: {
      generationSource: 'claude',
      looks: [{
        ...COMPLETE_BACKEND_LOOK_FIELDS,
        id: 'missing-image-anchor',
        role: 'anchor',
        title: '완료지만 URL 없는 룩',
      }],
    },
  }),
  'aggregate completed status without an image URL is rejected instead of using a fixture image',
);

const completedWithImageUrl = mapBackendRecommendationLooks({
  reportId: 'report-with-completed-image',
  prompt: '면접',
  questions: [],
  answers: [],
  imageStatus: 'completed',
  recommendation: {
    generationSource: 'claude',
    looks: [{
      ...COMPLETE_BACKEND_LOOK_FIELDS,
      id: 'completed-image-anchor',
      role: 'anchor',
      title: 'URL이 있는 완료 룩',
      imageUrl: ' https://cdn.example.com/generated-look.jpg ',
    }],
  },
})[0];
expectEqual(completedWithImageUrl.imageStatus, 'completed', 'completed image URL keeps completed status');
expectEqual(
  JSON.stringify(completedWithImageUrl.imageSource),
  JSON.stringify({uri: 'https://cdn.example.com/generated-look.jpg'}),
  'completed generated image URL is trimmed and preserved',
);

const legacyGuide = buildRecommendedAreaGuides({
  look: generatedLooks[0],
  directGuides: [{
    area: 'base',
    colors: [{name: '레거시 로즈', hex: '#AABBCC'}],
    steps: ['레거시 단계를 얇게 바르기'],
    avoid: '두껍게 쌓지 않기',
  }],
})[0];
expectEqual(legacyGuide.color.name, '레거시 로즈', 'legacy backend colors are preserved');
expectEqual(legacyGuide.steps[0].instruction, '레거시 단계를 얇게 바르기', 'legacy string steps are preserved');
expectEqual(legacyGuide.avoid[0], '두껍게 쌓지 않기', 'legacy string avoid is normalized');

const canonicalGuide = buildRecommendedAreaGuides({
  look: generatedLooks[0],
  directGuides: [{
    area: 'base',
    color: {name: '캐노니컬 베이지', hex: '#D9B49A'},
    steps: [{order: 2, instruction: '중앙부터 펴 바르기'}],
    avoid: ['경계 남기기'],
  }],
})[0];
expectEqual(canonicalGuide.color.name, '캐노니컬 베이지', 'canonical backend color is preserved');
expectEqual(canonicalGuide.steps[0].order, 2, 'canonical ordered step is preserved');
expectEqual(canonicalGuide.avoid[0], '경계 남기기', 'canonical avoid list is preserved');

const explicitEmptyProductGuide = buildRecommendedAreaGuides({
  look: generatedLooks[0],
  directGuides: [{area: 'base', products: []}],
})[0];
expectEqual(
  explicitEmptyProductGuide.products.length,
  0,
  'explicitly empty backend area products remain empty',
);
const missingBrandGuide = buildRecommendedAreaGuides({
  look: generatedLooks[0],
  directGuides: [{area: 'base', products: [{productName: '이름만 검증된 제품'}]}],
})[0];
expectEqual(missingBrandGuide.products[0].brandName, '', 'missing backend brand stays empty instead of using a label as a brand');

const invalidOnlyHistoryPage = mapBackendRecommendationReportsPage(
  [null, {id: 'invalid-report'}],
  {limit: 2, offset: 40},
);
expectEqual(invalidOnlyHistoryPage.reports.length, 0, 'invalid raw history records remain hidden');
expectEqual(invalidOnlyHistoryPage.rawCount, 2, 'history cursor counts every consumed raw record');
expectEqual(invalidOnlyHistoryPage.nextOffset, 42, 'history cursor advances past invalid raw records');
expectEqual(invalidOnlyHistoryPage.hasMore, true, 'a full raw page keeps pagination open even when every record is invalid');
expectEqual(rewindMakeupRecommendationHistoryOffset(42), 41, 'deleting one loaded raw row rewinds the next offset once');
expectEqual(rewindMakeupRecommendationHistoryOffset(0), 0, 'deletion cursor rewind never produces a negative offset');

const reportHistory = mapBackendRecommendationReports([
  {
    id: 'report-1',
    scenarioText: '퇴근 후 약속',
    recommendation: {
      generationSource: 'claude',
      matchAssessment: {
        ...BACKEND_MATCH_ASSESSMENT,
        score: 99,
        generationSource: 'claude',
      },
      looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
        id: `saved-look-${index + 1}`,
        role,
        title: `${role} title`,
        summary: `${role} summary`,
        reasons: ['저장된 추천 이유'],
        appliedConditions: ['퇴근 후 약속'],
        durationMinutes: 20,
        difficulty: 'medium',
        steps: COMPLETE_BACKEND_STEPS,
        products: [{area: 'base', brandName: '브랜드', productName: '쿠션', reason: '얇은 표현'}],
        lookMap: BACKEND_LOOK_MAP,
        fitAssessment: {...BACKEND_FIT_ASSESSMENT, overallScore: 74},
        imageUrl: `https://signed.example.com/report-1-${role}.jpg`,
      })),
    },
    imageStatus: 'completed',
    schema_version: 'makeup-recommendation-v2',
    previewImageUrl: 'https://signed.example.com/report-1-anchor.jpg',
    previewImageStatus: 'completed',
    createdAt: '2026-07-14T12:34:56Z',
    profileGender: 'unspecified',
    sourceAnalysisReportId: '11111111-1111-4111-8111-111111111111',
    questions: [{
      id: 'history-finish',
      title: '마무리 분위기',
      options: [
        {id: 'soft', label: '차분하게'},
        {id: 'clear', label: '또렷하게'},
        {id: 'bold', label: '과감하게'},
        {id: 'ai_pick', label: 'AI가 골라줘'},
      ],
    }],
    answers: [{
      questionId: 'history-finish',
      optionId: 'soft',
      additionalConstraints: '글리터 제외',
    }],
    contextSnapshot: JSON.stringify({
      analysisReport: {
        id: '11111111-1111-4111-8111-111111111111',
        personalColor: 'summer-cool',
      },
      profile: {gender: 'male'},
      selection: {
        situation: {
          id: 'situation-history',
          key: 'date',
          label: 'date situation',
          description: 'date situation description',
        },
        keyword: {
          id: 'keyword-history',
          label: 'keyword label',
          kind: 'curated',
          badge: 'CURATED',
          seedPrompt: 'keyword seed prompt',
          tags: ['clean'],
        },
        customSituationText: 'custom situation prompt',
        customSituationLabel: 'custom situation label',
        editorialPreset: {
          id: 'baseball-camera',
          displayText: 'editorial display text',
        },
      },
    }),
  },
]);
expectEqual(reportHistory.length, 1, 'saved report history count');
expectEqual(reportHistory[0].reportId, 'report-1', 'saved report id');
expectEqual(reportHistory[0].createdAt, '2026-07-14T12:34:56Z', 'saved report creation date');
expectEqual(
  reportHistory[0].previewImageUrl,
  'https://signed.example.com/report-1-anchor.jpg',
  'saved report maps its applied preview URL',
);
expectEqual(
  reportHistory[0].previewImageStatus,
  'completed',
  'saved report maps its applied preview status',
);
expectEqual(
  JSON.stringify(reportHistory[0].results[0].imageSource),
  JSON.stringify({uri: 'https://signed.example.com/report-1-anchor.jpg'}),
  'saved report anchor uses the received applied preview instead of a fixture',
);
expectEqual(
  reportHistory[0].results[0].imageStatus,
  'completed',
  'saved report anchor keeps the received preview renderable',
);
const previewOnlyAnchorHistory = mapBackendRecommendationReports([{
  id: 'report-preview-only-anchor',
  scenarioText: 'preview-only anchor',
  recommendation: {
    generationSource: 'claude',
    looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
      id: `preview-only-look-${index + 1}`,
      role,
      title: `${role} title`,
      summary: `${role} summary`,
      reasons: ['generated reason'],
      appliedConditions: ['preview-only anchor'],
      durationMinutes: 20,
      difficulty: 'medium',
      steps: COMPLETE_BACKEND_STEPS,
    })),
  },
  imageStatus: 'completed',
  schema_version: 'makeup-recommendation-v2',
  previewImageUrl: 'https://signed.example.com/report-preview-only-anchor.jpg',
  previewImageStatus: 'completed',
  createdAt: '2026-07-23T12:34:56Z',
}]);
expectEqual(
  previewOnlyAnchorHistory.length,
  1,
  'completed V2 history remains visible when its anchor URL is supplied only as the preview asset',
);
expectEqual(
  JSON.stringify(previewOnlyAnchorHistory[0].results[0].imageSource),
  JSON.stringify({uri: 'https://signed.example.com/report-preview-only-anchor.jpg'}),
  'preview-only anchor is applied before completed-look validation',
);
expectEqual(
  previewOnlyAnchorHistory[0].results[1].imageStatus,
  'pending',
  'aggregate anchor completion does not mark an image-less bold recipe completed',
);
expectEqual(
  previewOnlyAnchorHistory[0].results[2].imageStatus,
  'pending',
  'aggregate anchor completion does not mark an image-less discovery recipe completed',
);
expectEqual(
  getMakeupRecommendationPreviewStatusLabel('processing'),
  '적용 이미지 생성 중',
  'processing preview uses a neutral status label',
);
expectEqual(
  getMakeupRecommendationPreviewStatusLabel('failed'),
  '적용 이미지 없음',
  'failed preview does not claim a fixture is generated',
);
const appliedPreview = getMakeupRecommendationPreviewPresentation(reportHistory[0]);
expectEqual(
  appliedPreview.imageUrl,
  'https://signed.example.com/report-1-anchor.jpg',
  'history presentation uses only the applied preview URL',
);
const unavailablePreview = getMakeupRecommendationPreviewPresentation({
  imageStatus: 'failed',
  previewImageStatus: 'failed',
});
expectEqual(
  unavailablePreview.imageUrl,
  undefined,
  'missing applied preview stays empty instead of using a look fixture',
);
expectEqual(
  unavailablePreview.statusLabel,
  '적용 이미지 없음',
  'missing applied preview keeps its neutral status',
);
expectEqual(reportHistory[0].scenarioText, '퇴근 후 약속', 'saved report scenario');
expectEqual(reportHistory[0].profileGender, 'unspecified', 'history prefers scalar profile gender');
expectEqual(reportHistory[0].results.length, 3, 'saved report restores three looks');
expectEqual(reportHistory[0].results[0].title, 'anchor title', 'saved report restores look copy');
expectEqual(
  reportHistory[0].results[0].generationSource,
  'claude',
  'saved report restores AI generation source',
);
expectEqual(reportHistory[0].results[0].fitAssessment?.overallScore, 74, 'saved report restores fit score');
expectEqual(
  reportHistory[0].results[0].matchAssessment?.score,
  99,
  'saved AI report restores the exact server match score',
);
expectEqual(
  reportHistory[0].results[0].matchAssessment?.generationSource,
  'claude',
  'saved report restores match generation metadata without changing the score',
);
expectEqual(reportHistory[0].results[1].matchAssessment, undefined, 'saved match remains anchor-only');
const restoredReport = restoreMakeupRecommendationReport(reportHistory[0]);
expectEqual(restoredReport.phase, 'results', 'saved report opens in results phase');
expectEqual(restoredReport.reportId, 'report-1', 'restored session keeps report id');
expectEqual(restoredReport.createdAt, '2026-07-14T12:34:56Z', 'restored session keeps creation date');
expectEqual(restoredReport.profileGender, 'unspecified', 'restored report keeps snapshot gender');
expectEqual(restoredReport.generationMode, 'backend', 'restored report is server-backed');
expectEqual(restoredReport.results.length, 3, 'restored session keeps all looks');
expectEqual(
  JSON.stringify(restoredReport.results[0].imageSource),
  JSON.stringify({uri: 'https://signed.example.com/report-1-anchor.jpg'}),
  'detail refresh failure retains the list preview instead of restoring a fixture',
);
expectEqual(
  restoredReport.results[0].generationSource,
  'claude',
  'restored session keeps AI generation source',
);
expectEqual(
  restoredReport.results[0].matchAssessment?.score,
  99,
  'opening saved history preserves the same match score as the saved payload',
);
expectEqual(restoredReport.results[0].lookMap?.naturalityToPersonality, 61, 'restored session keeps LOOK MAP');
expectEqual(restoredReport.sourceAnalysisReportId, '11111111-1111-4111-8111-111111111111', 'history keeps source analysis report');
expectEqual(restoredReport.questions[0]?.id, 'history-finish', 'history keeps backend questions');
expectEqual(restoredReport.answers[0]?.optionId, 'soft', 'history keeps backend answers');
expectEqual(restoredReport.additionalConstraints, '글리터 제외', 'history derives the latest answer constraint');
expectEqual(restoredReport.situation?.id, 'situation-history', 'history keeps selected situation');
expectEqual(restoredReport.keyword?.id, 'keyword-history', 'history keeps selected keyword');
expectEqual(restoredReport.scenarioLabel, 'keyword label', 'history restores the selected scenario label');
expectEqual(restoredReport.editorialPresetId, 'baseball-camera', 'history keeps editorial preset id when present');
expectEqual(restoredReport.customSituationText, 'custom situation prompt', 'history keeps custom situation text when present');
expectEqual(restoredReport.personalColor, 'summer-cool', 'history keeps analysis personal color');
expectEqual(restoredReport.prompt, 'custom situation prompt', 'history restores the original custom prompt');

const mixedRuntimeArrayHistory = mapBackendRecommendationReports([
  {
    id: 'report-mixed-runtime-arrays',
    scenarioText: 'mixed runtime arrays',
    recommendation: {
      looks: [{
        id: 'mixed-look',
        role: 'anchor',
        title: 'mixed look',
        summary: 'mixed summary',
        reasons: ['valid reason'],
        appliedConditions: ['mixed runtime arrays'],
        durationMinutes: 15,
        difficulty: 'medium',
        steps: COMPLETE_BACKEND_STEPS,
        products: [],
        imageUrl: 'https://signed.example.com/mixed-look.jpg',
      }],
    },
    imageStatus: 'completed',
    questions: JSON.stringify([
      {
        id: 'mixed-question',
        title: 'finish preference',
        options: [
          {id: 'soft', label: 'soft'},
          null,
          {id: 'clear', label: 'clear'},
          17,
          {id: 'bold', label: 'bold'},
          {id: 'ai_pick', label: 'AI가 골라줘'},
        ],
      },
      null,
      'invalid question',
    ]),
    answers: JSON.stringify([
      {questionId: 'mixed-question', optionId: 'soft', additionalConstraints: 'no glitter'},
      null,
      {questionId: 17, optionId: 'clear'},
      'invalid answer',
    ]),
    contextSnapshot: JSON.stringify({
      selection: {
        keyword: {
          id: 'mixed-keyword',
          label: 'mixed keyword',
          kind: 'curated',
          badge: 'CURATED',
          seedPrompt: 'mixed seed prompt',
          tags: ['clean', null, 17, 'date', {bad: true}],
        },
      },
    }),
  },
  {
    id: 'report-unusable-runtime-row',
    scenarioText: 17,
    recommendation: JSON.stringify({looks: [null]}),
    imageStatus: 'completed',
  },
]);
expectEqual(mixedRuntimeArrayHistory.length, 1, 'one malformed row does not break the full history mapping');
expectEqual(mixedRuntimeArrayHistory[0].questions?.length, 1, 'invalid question elements are skipped');
expectEqual(mixedRuntimeArrayHistory[0].questions?.[0]?.options.length, 4, 'invalid option elements are skipped');
expectEqual(mixedRuntimeArrayHistory[0].answers?.length, 1, 'invalid answer elements are skipped');
expectEqual(mixedRuntimeArrayHistory[0].answers?.[0]?.optionId, 'soft', 'valid answer mapping is preserved');
expectEqual(mixedRuntimeArrayHistory[0].keyword?.tags.join(','), 'clean,date', 'invalid tag elements are skipped');

const started = startMakeupRecommendation({
  prompt: scenarios[0].seedPrompt,
  scenarioId: scenarios[0].id,
  useProfile: true,
  personalColor: '여름 쿨톤',
});
expectEqual(started.questions.length, 2, 'curated question cap');

const broadCustom = startMakeupRecommendation({
  prompt: '오늘 메이크업을 추천해줘',
  useProfile: false,
});
expectEqual(broadCustom.questions.length, 3, 'broad custom question cap');

expectThrows(
  () => answerMakeupRecommendationQuestion(started, {
    questionId: started.questions[0].id,
    optionId: 'not-an-option',
  }),
  'arbitrary option rejected',
);
expectThrows(
  () => answerMakeupRecommendationQuestion(started, {
    questionId: started.questions[0].id,
    freeText: '   ',
  }),
  'empty free text rejected',
);

const freeTextAnswered = answerMakeupRecommendationQuestion(started, {
  questionId: started.questions[0].id,
  freeText: '조명에서 맑게',
});
expectEqual(freeTextAnswered.answers[0].freeText, '조명에서 맑게', 'free text accepted');
const editedFirstAnswer = answerMakeupRecommendationQuestion(
  {...freeTextAnswered, currentQuestionIndex: 0},
  {questionId: started.questions[0].id, optionId: started.questions[0].options[0].id},
);
expectEqual(editedFirstAnswer.answers.length, 1, 'editing previous fixture answer does not duplicate it');
expectEqual(editedFirstAnswer.answers[0].optionId, started.questions[0].options[0].id, 'previous fixture answer is replaced');

const completed = started.questions.reduce(
  (session, question, index) => answerMakeupRecommendationQuestion(session, {
    questionId: question.id,
    optionId: question.options[0].id,
    additionalConstraints: index === started.questions.length - 1 ? '글리터 제외' : undefined,
  }),
  started,
);
expectEqual(completed.phase, 'results', 'session completes');
expectEqual(completed.results.length, 3, 'three result roles');
expectEqual(completed.results.map(item => item.role).join(','), 'anchor,bold,discovery', 'result role order');
expectEqual(completed.additionalConstraints, '글리터 제외', 'final constraints preserved');

const constrainedAfterFirst = answerMakeupRecommendationQuestion(started, {
  questionId: started.questions[0].id,
  optionId: started.questions[0].options[0].id,
  additionalConstraints: '향료 성분 제외',
});
expectEqual(
  constrainedAfterFirst.additionalConstraints,
  '향료 성분 제외',
  'intermediate constraints preserved',
);
const constrainedCompleted = answerMakeupRecommendationQuestion(constrainedAfterFirst, {
  questionId: started.questions[1].id,
  optionId: started.questions[1].options[0].id,
});
expectEqual(
  constrainedCompleted.additionalConstraints,
  '향료 성분 제외',
  'earlier constraints survive completion',
);
expectEqual(
  constrainedCompleted.results[0].appliedConditions[0],
  '향료 성분 제외',
  'latest constraints are first result condition',
);

expectEqual(
  constrainedCompleted.results.map(result => result.arFilterId).join(','),
  'filter-milky-strawberry-pink,filter-clean-smoky-city,filter-plum-syrup-gloss',
  'results map to distinct AR filters',
);

const productsOnce = refineMakeupRecommendation(constrainedCompleted, 'replaceProducts');
const productsTwice = refineMakeupRecommendation(productsOnce, 'replaceProducts');
expectEqual(
  productsOnce.results[0].products[0].id === productsTwice.results[0].products[0].id,
  false,
  'repeated product replacement rotates products',
);

const natural = refineMakeupRecommendation(constrainedCompleted, 'natural');
const hipAfterNatural = refineMakeupRecommendation(natural, 'hip');
const hipRepeated = refineMakeupRecommendation(hipAfterNatural, 'hip');
expectEqual(
  hipAfterNatural.results[0].appliedConditions.includes('더 자연스럽게'),
  false,
  'new refinement replaces old condition',
);
expectEqual(
  hipRepeated.results[0].summary,
  hipAfterNatural.results[0].summary,
  'repeated refinement does not duplicate summary',
);

async function expectGeneratedQuestionFailureIsSurfaced() {
  async function failingBackendRequest<T>(): Promise<T> {
    throw new Error('backend unavailable');
  }

  let error: unknown;
  try {
    await startGeneratedMakeupRecommendation(
      {
        prompt: scenarios[0].seedPrompt,
        scenarioId: scenarios[0].id,
        useProfile: false,
      },
      scenarios[0].intentTags,
      failingBackendRequest,
    );
  } catch (caught) {
    error = caught;
  }
  expectEqual(error instanceof Error, true, 'question generation failure is surfaced');
  expectEqual((error as Error).message, 'backend unavailable', 'question failure is not replaced by local fallback');
}

async function expectGeneratedQuestionsRejectSixOptions() {
  async function sixOptionBackendRequest<T>(): Promise<T> {
    return {
      questions: [{
        id: 'mood',
        title: '어떤 방향이 좋아요?',
        options: Array.from({length: 6}, (_, index) => ({
          id: `option-${index + 1}`,
          label: index === 5 ? 'AI가 골라줘' : `선택 ${index + 1}`,
        })),
      }],
    } as T;
  }

  let error: unknown;
  try {
    await startGeneratedMakeupRecommendation(
      {prompt: '긴 하루 뒤 약속', useProfile: false},
      [],
      sixOptionBackendRequest,
    );
  } catch (caught) {
    error = caught;
  }

  expectEqual(error instanceof Error, true, 'six-option backend question is rejected');
  expectEqual(
    (error as Error).message,
    '추천 질문을 준비하지 못했어요. 잠시 후 다시 시도해주세요.',
    'malformed option count is surfaced instead of displayed',
  );
}

async function expectAuthFailureDoesNotMasqueradeAsFallback() {
  async function unauthorizedBackendRequest<T>(): Promise<T> {
    throw new BackendApiError('로그인이 만료됐어요.', 401, 'AUTH_REQUIRED');
  }

  let error: unknown;
  try {
    await startGeneratedMakeupRecommendation(
      {prompt: '긴 하루 뒤 약속', useProfile: false},
      [],
      unauthorizedBackendRequest,
    );
  } catch (caught) {
    error = caught;
  }

  expectEqual(error instanceof BackendApiError, true, 'auth error is surfaced instead of local fallback');
}

async function expectAbortSignalIsForwarded() {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null | undefined;
  async function backendRequest<T>(
    _path: string,
    init?: Parameters<typeof requestBackendJson>[1],
  ): Promise<T> {
    receivedSignal = init?.signal;
    return {
      questions: [{
        id: 'mood',
        title: '어떤 방향이 좋아요?',
        options: Array.from({length: 4}, (_, index) => ({
          id: index === 3 ? 'ai_pick' : `option-${index + 1}`,
          label: index === 3 ? 'AI가 골라줘' : `선택 ${index + 1}`,
        })),
      }],
    } as T;
  }

  await startGeneratedMakeupRecommendation(
    {prompt: '긴 하루 뒤 약속', useProfile: false},
    [],
    backendRequest,
    controller.signal,
  );

  expectEqual(receivedSignal, controller.signal, 'screen cancellation signal reaches backend request');
}

async function expectGeneratedBackendFlowCompletesAndKeepsSavedReport() {
  let callCount = 0;
  const requestBodies: unknown[] = [];
  async function successfulBackendRequest<T>(
    path: string,
    init?: Parameters<typeof requestBackendJson>[1],
  ): Promise<T> {
    callCount += 1;
    requestBodies.push(init?.body);
    if (path.endsWith('/questions')) {
      return {
        questions: [{
          id: 'mood',
          title: '어떤 방향이 좋아요?',
          options: [
            {id: 'soft', label: '은은하게'},
            {id: 'clear', label: '또렷하게'},
            {id: 'bold', label: '과감하게'},
            {id: 'ai_pick', label: 'AI가 골라줘'},
          ],
        }],
      } as T;
    }
    return {
      reportId: 'report-success',
      imageStatus: 'pending',
      recommendation: {
        looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
          id: `look-${index + 1}`,
          role,
          title: `추천 ${index + 1}`,
          summary: `서로 다른 추천 ${index + 1}`,
          reasons: ['선택한 조건을 반영했어요.'],
          appliedConditions: ['퇴근 후 약속'],
          durationMinutes: 20,
          difficulty: 'medium',
          steps: COMPLETE_BACKEND_STEPS,
          products: [{area: 'base', brandName: '브랜드', productName: '제품', reason: '조화로워요.'}],
        })),
      },
    } as T;
  }

  const startInput = {
    prompt: '사진에서 또렷하되 과하게 꾸민 느낌은 피하는 메이크업',
    scenarioId: 'airport-legend',
    scenarioLabel: '공항 출국 레전드',
    useProfile: false,
  };
  const started = await startGeneratedMakeupRecommendation(
    startInput,
    [],
    successfulBackendRequest,
  );
  const completed = await answerGeneratedMakeupRecommendationQuestion(
    started,
    {questionId: 'mood', optionId: 'soft'},
    [],
    successfulBackendRequest,
  );

  expectEqual(callCount, 2, 'successful backend flow makes question and recommendation requests');
  expectEqual(
    (requestBodies[0] as {scenarioLabel?: string}).scenarioLabel,
    '공항 출국 레전드',
    'question request includes selected card copy',
  );
  expectEqual(
    (requestBodies[1] as {scenarioLabel?: string}).scenarioLabel,
    '공항 출국 레전드',
    'recommendation request includes selected card copy',
  );
  expectEqual(
    (started as MakeupRecommendationSession & {scenarioLabel?: string}).scenarioLabel,
    '공항 출국 레전드',
    'question session preserves selected card copy',
  );
  expectEqual(completed.phase, 'results', 'successful backend flow reaches results');
  expectEqual(completed.generationMode, 'backend', 'successful flow remains in backend mode');
  expectEqual(completed.reportId, 'report-success', 'saved report id is retained');
  expectEqual(completed.imageStatus, 'pending', 'pending image state is retained for polling');
  expectEqual(completed.results.length, 3, 'all three backend roles are mapped');
}

async function expectGeneratedRecommendationFailureIsSurfaced() {
  let callCount = 0;
  async function failingRecommendationRequest<T>(): Promise<T> {
    callCount += 1;
    if (callCount === 1) {
      return {
        questions: [{
          id: 'presence',
          title: '평소보다 얼마나 과감해질까요?',
          options: [
            {id: 'familiar', label: '평소의 나답게'},
            {id: 'different', label: '조금 낯설게'},
            {id: 'bold', label: '확실히 달라지게'},
            {id: 'ai_pick', label: 'AI가 골라줘'},
          ],
        }],
      } as T;
    }
    throw new Error('recommendation unavailable');
  }

  const started = await startGeneratedMakeupRecommendation(
    {prompt: '공항 사진에서 또렷하게 보이는 메이크업', useProfile: false},
    [],
    failingRecommendationRequest,
  );
  let error: unknown;
  try {
    await answerGeneratedMakeupRecommendationQuestion(
      started,
      {questionId: 'presence', optionId: 'familiar'},
      [],
      failingRecommendationRequest,
    );
  } catch (caught) {
    error = caught;
  }

  expectEqual((error as Error).message, 'recommendation unavailable', 'recommendation failure is not replaced by fixtures');
}

async function expectPollingParsesJsonStringRecommendationAndKeepsResults() {
  const backendRecommendation = {
    looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
      id: `poll-look-${index + 1}`,
      role,
      title: `폴링 추천 ${index + 1}`,
      summary: `폴링 뒤에도 남는 추천 ${index + 1}`,
      reasons: ['저장된 추천을 유지해요.'],
      appliedConditions: ['공항 출국 레전드'],
      durationMinutes: 25,
      difficulty: 'medium',
      steps: COMPLETE_BACKEND_STEPS,
      products: [{area: 'base', brandName: '브랜드', productName: '제품', reason: '잘 맞아요.'}],
    })),
  };
  const initialResults = mapBackendRecommendationLooks({
    imageStatus: 'pending',
    reportId: 'report-poll',
    recommendation: backendRecommendation,
    prompt: '공항 출국 레전드',
    questions: [],
    answers: [],
  });
  const session: MakeupRecommendationSession = {
    id: 'report-poll',
    reportId: 'report-poll',
    phase: 'results',
    prompt: '공항 출국 레전드',
    questions: [],
    currentQuestionIndex: 0,
    answers: [],
    results: initialResults,
    useProfile: false,
    profileGender: 'unspecified',
    imageStatus: 'pending',
    generationMode: 'backend',
  };

  async function backendRequest<T>(): Promise<T> {
    return {
      id: 'report-poll',
      scenarioText: '공항 출국 레전드',
      recommendation: JSON.stringify(backendRecommendation),
      imageStatus: 'processing',
      contextSnapshot: {profile: {gender: 'male'}},
    } as T;
  }

  const refreshed = await refreshGeneratedMakeupRecommendation(session, undefined, backendRequest);

  expectEqual(refreshed.imageStatus, 'processing', 'polling image status updates');
  expectEqual(refreshed.profileGender, 'male', 'refresh restores report snapshot gender');
  expectEqual(refreshed.results.length, 3, 'polling keeps all three looks from json string recommendation');
  expectEqual(refreshed.results[0].title, '폴링 추천 1', 'polling parses saved recommendation copy');
}

async function expectV2DiscoverySessionAnswerGenerateContract() {
  const analysisReportId = '11111111-1111-4111-8111-111111111111';
  const situationId = '22222222-2222-4222-8222-222222222222';
  const keywordId = '33333333-3333-4333-8333-333333333333';
  const sessionId = '44444444-4444-4444-8444-444444444444';
  const reportId = '55555555-5555-4555-8555-555555555555';
  const requestLog: Array<{path: string; body?: unknown; headers?: HeadersInit}> = [];
  const question = {
    id: 'finish',
    title: '어떤 마무리가 좋아요?',
    options: [
      {id: 'soft', label: '은은하게'},
      {id: 'clear', label: '또렷하게'},
      {id: 'glossy', label: '촉촉하게'},
      {id: 'ai_pick', label: 'AI가 골라줘'},
    ],
  };
  async function backendRequest<T>(path: string, init?: Parameters<typeof requestBackendJson>[1]): Promise<T> {
    requestLog.push({path, body: init?.body, headers: init?.headers});
    if (path.endsWith('/discovery')) {
      return {
        generatedAt: '2026-07-16T00:00:00Z',
        sourceReports: [{id: analysisReportId}],
        situations: [
          {
            id: '21111111-1111-4111-8111-111111111111',
            key: 'daily',
            label: '일상',
            description: '출근, 등교와 가벼운 약속',
            imageAssetKey: 'daily',
            sortOrder: 10,
            keywords: [{
              id: '31111111-1111-4111-8111-111111111111',
              label: '출근·등교',
              kind: 'curated',
              badge: 'CURATED',
              seedPrompt: '평일 아침 출근이나 등교를 준비하는 상황',
              tags: ['daily', 'commute'],
            }],
          },
          {
            id: situationId,
            key: 'formal_event',
            label: '특별한 날',
            description: '데이트, 중요한 일정과 기념일',
            imageAssetKey: 'formal_event',
            sortOrder: 20,
            keywords: [{
              id: keywordId,
              label: '소개팅·데이트',
              kind: 'curated',
              badge: 'CURATED',
              seedPrompt: '소개팅이나 데이트를 앞둔 특별한 약속 상황',
              tags: ['formal_event', 'date'],
            }],
          },
          {
            id: '24444444-4444-4444-8444-444444444444',
            key: 'camera_content',
            label: '촬영',
            description: '사진과 영상 촬영',
            imageAssetKey: 'camera_content',
            sortOrder: 30,
            keywords: [{
              id: '34444444-4444-4444-8444-444444444444',
              label: '프로필 촬영',
              kind: 'curated',
              badge: 'CURATED',
              seedPrompt: '프로필 사진을 촬영하는 상황',
              tags: ['camera_content', 'profile'],
            }],
          },
          {
            id: '25555555-5555-4555-8555-555555555555',
            key: 'festival_performance',
            label: '독특한 날',
            description: '공연과 색다른 이벤트',
            imageAssetKey: 'festival_performance',
            sortOrder: 40,
            keywords: [{
              id: '35555555-5555-4555-8555-555555555555',
              label: '콘서트·페스티벌',
              kind: 'curated',
              badge: 'CURATED',
              seedPrompt: '콘서트나 페스티벌을 즐기는 상황',
              tags: ['festival_performance', 'concert'],
            }],
          },
        ],
      } as T;
    }
    if (path.endsWith('/sessions')) {
      return {
        id: sessionId,
        status: 'questioning',
        profileGender: 'female',
        currentQuestionIndex: 0,
        questions: [question],
        answers: [],
        sourceAnalysisReportId: analysisReportId,
        expiresAt: '2026-07-17T00:00:00Z',
      } as T;
    }
    if (path.endsWith('/answers')) {
      return {
        id: sessionId,
        status: 'ready',
        currentQuestionIndex: 1,
        questions: [question],
        answers: [{questionId: 'finish', optionId: 'soft'}],
        sourceAnalysisReportId: analysisReportId,
      } as T;
    }
    return {
      reportId,
      imageStatus: 'pending',
      recommendation: {
        generationSource: 'claude',
        looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
          id: `v2-look-${index + 1}`,
          role,
          title: `V2 룩 ${index + 1}`,
          summary: '보고서와 상황을 반영한 추천',
          reasons: ['선택한 얼굴 분석 보고서와 키워드를 반영했어요.'],
          appliedConditions: ['선택한 상황과 답변'],
          durationMinutes: 15,
          difficulty: 'medium',
          steps: COMPLETE_BACKEND_STEPS,
          areaGuides: [{
            area: 'base',
            label: '베이스',
            goal: '결을 정돈해요',
            color: {name: '뉴트럴 베이지', hex: '#D9B49A'},
            texture: '새틴',
            placement: '얼굴 중앙',
            technique: '얇게 펴 발라요',
            reason: '피부 분석을 반영했어요',
            avoid: [],
            steps: [{order: 1, instruction: '소량씩 바르기'}],
            products: [],
            arSupported: true,
          }],
        })),
      },
    } as T;
  }

  const discovery = await fetchMakeupRecommendationDiscovery(backendRequest);
  expectEqual(discovery.source, 'api', 'v2 discovery uses validated api payload');
  expectEqual(discovery.sourceReportIds?.[0], analysisReportId, 'discovery keeps owned completed report ids');
  expectEqual(discovery.situations[0].keywords[0].badge, 'CURATED', 'situation keyword stays curated');
  const specialSituation = discovery.situations.find(item => item.key === 'formal_event');
  if (!specialSituation) throw new Error('validated formal event situation is required');
  const keyword = specialSituation.keywords[0];

  const started = await startGeneratedMakeupRecommendationV2({
    analysisReportId,
    discoverySource: 'api',
    idempotencyKey: 'makeup-v2-test-intent',
    situation: specialSituation,
    keyword,
    imageMode: 'generic',
  }, backendRequest);
  expectEqual(started.phase, 'question', 'v2 session starts with reverse question');
  expectEqual(started.sourceAnalysisReportId, analysisReportId, 'selected report id is retained');
  expectEqual(started.profileGender, 'female', 'start keeps account gender');
  expectEqual(started.useProfile, true, 'v2 always uses selected analysis profile');
  const keywordRequest = requestLog.find(item => item.path.endsWith('/sessions'));
  const keywordBody = keywordRequest?.body as Record<string, unknown>;
  expectEqual(
    Object.keys(keywordBody).sort().join(','),
    'analysisReportId,imageMode,keywordId,situationId',
    'keyword request sends only its exactly-one selection branch',
  );
  expectEqual(
    (keywordRequest?.headers as Record<string, string>)?.['Idempotency-Key'],
    'makeup-v2-test-intent',
    'v2 session reuses the caller intent idempotency key',
  );

  const editorialStarted = await startGeneratedMakeupRecommendationV2({
    analysisReportId,
    idempotencyKey: 'makeup-v2-editorial-intent',
    editorialPresetId: 'baseball-camera',
    editorialPresetLabel: '야구장 전광판에 잡히고 싶은 날',
    editorialPresetPrompt: '야외 야구장에서 생기 있고 또렷하며 오래 유지되는 메이크업',
    imageMode: 'personalized',
  }, backendRequest);
  const editorialRequest = requestLog.filter(item => item.path.endsWith('/sessions')).at(-1);
  const editorialBody = editorialRequest?.body as Record<string, unknown>;
  expectEqual(editorialStarted.phase, 'question', 'editorial preset starts the reviewed reverse-question flow');
  expectEqual(editorialStarted.scenarioLabel, '야구장 전광판에 잡히고 싶은 날', 'editorial display label is preserved');
  expectEqual(editorialStarted.editorialPresetId, 'baseball-camera', 'editorial preset id is preserved');
  expectEqual(editorialBody.editorialPresetId, 'baseball-camera', 'editorial selection sends its reviewed preset id');
  expectEqual(editorialBody.customSituationText, undefined, 'editorial preset does not masquerade as custom user input');
  expectEqual(editorialBody.customSituationLabel, undefined, 'editorial copy is resolved from the trusted server preset');
  expectEqual(editorialBody.imageMode, 'personalized', 'editorial prompt requests the selected face image');
  expectEqual(editorialBody.situationId, undefined, 'independent editorial prompt has no parent situation id');
  expectEqual(editorialBody.keywordId, undefined, 'independent editorial prompt has no mapped keyword id');
  expectEqual(
    Object.keys(editorialBody).sort().join(','),
    'analysisReportId,editorialPresetId,imageMode',
    'editorial request sends only its exactly-one selection branch',
  );

  await startGeneratedMakeupRecommendationV2({
    analysisReportId,
    customSituationText: '로판 여주',
    imageMode: 'personalized',
  }, backendRequest);
  const customRequest = requestLog.filter(item => item.path.endsWith('/sessions')).at(-1);
  const customBody = customRequest?.body as Record<string, unknown>;
  expectEqual(customBody.customSituationText, '로판 여주', 'arbitrary safe custom text reaches the backend unchanged');
  expectEqual(
    Object.keys(customBody).sort().join(','),
    'analysisReportId,customSituationText,imageMode',
    'custom request sends only its exactly-one selection branch',
  );

  const ready = await answerGeneratedMakeupRecommendationQuestionV2(
    started,
    {questionId: 'finish', optionId: 'soft'},
    backendRequest,
  );
  expectEqual(ready.phase, 'ready', 'last reverse answer makes v2 session ready');
  expectEqual(ready.answers.length, 1, 'v2 answer is preserved');
  expectEqual(ready.profileGender, 'female', 'answer keeps previous account gender');

  const completed = await generateMakeupRecommendationV2(ready, backendRequest);
  expectEqual(completed.phase, 'results', 'v2 generate reaches results');
  expectEqual(completed.reportId, reportId, 'v2 saved report id is kept');
  expectEqual(completed.profileGender, 'female', 'generate keeps session account gender');
  expectEqual(completed.results.length, 3, 'v2 keeps three look roles');
  expectEqual(completed.results.every(look => (look.areaGuides?.length ?? 0) >= 5), true, 'v1/v2 adapter guarantees five area guides');
  expectEqual(
    completed.results.every(look => look.areaGuides?.every(guide => guide.products.length === 0)),
    true,
    'v2 empty area products never receive fixture brands',
  );
}

async function expectV2OnlyFallsBackForUnavailableEndpoint() {
  const situation = MAKEUP_SITUATION_FIXTURES[0];
  const analysisReportId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  async function legacyDiscoveryCollisionRequest<T>(): Promise<T> {
    throw new BackendApiError('Request validation failed.', 422, 'VALIDATION_ERROR');
  }
  let discoveryCollisionError: unknown;
  try {
    await fetchMakeupRecommendationDiscovery(legacyDiscoveryCollisionRequest);
  } catch (error) {
    discoveryCollisionError = error;
  }
  expectEqual(
    discoveryCollisionError instanceof MakeupRecommendationRetryableError,
    true,
    'legacy report-id route collision fails closed instead of loading a local catalog',
  );

  async function malformedDiscoveryRequest<T>(): Promise<T> {
    return {
      situations: [{
        id: 'not-a-uuid',
        key: 'daily',
        label: '일상',
        keywords: [{id: 'fixture-keyword', label: '출근', badge: 'CURATED'}],
      }],
    } as T;
  }
  let malformedDiscoveryError: unknown;
  try {
    await fetchMakeupRecommendationDiscovery(malformedDiscoveryRequest);
  } catch (error) {
    malformedDiscoveryError = error;
  }
  expectEqual(
    malformedDiscoveryError instanceof MakeupRecommendationRetryableError,
    true,
    'malformed discovery success fails closed instead of using fixture data',
  );

  async function duplicateDiscoveryRequest<T>(): Promise<T> {
    const keys = ['daily', 'formal_event', 'camera_content', 'festival_performance'];
    return {
      situations: keys.map((key, index) => ({
        id: index < 2
          ? 'd0000000-0000-4000-8000-000000000001'
          : `d0000000-0000-4000-8000-00000000000${index + 1}`,
        key,
        label: `상황 ${index + 1}`,
        keywords: [{
          id: `e0000000-0000-4000-8000-00000000000${index + 1}`,
          label: `키워드 ${index + 1}`,
          badge: 'CURATED',
        }],
      })),
    } as T;
  }
  let duplicateDiscoveryError: unknown;
  try {
    await fetchMakeupRecommendationDiscovery(duplicateDiscoveryRequest);
  } catch (error) {
    duplicateDiscoveryError = error;
  }
  expectEqual(
    duplicateDiscoveryError instanceof MakeupRecommendationRetryableError,
    true,
    'duplicate discovery ids fail closed instead of using fixture data',
  );

  async function networkDiscoveryRequest<T>(): Promise<T> {
    throw new BackendNetworkError();
  }
  let discoveryNetworkError: unknown;
  try {
    await fetchMakeupRecommendationDiscovery(networkDiscoveryRequest);
  } catch (error) {
    discoveryNetworkError = error;
  }
  expectEqual(
    discoveryNetworkError instanceof MakeupRecommendationRetryableError,
    true,
    'network discovery failure never becomes a local fixture success',
  );
  expectEqual(
    (discoveryNetworkError as Error).message.includes('네트워크'),
    true,
    'network discovery failure keeps the actionable retry message',
  );

  const fixtureKeyword = situation.keywords[0];
  const fixtureSessionId = 'f0000000-0000-4000-8000-000000000001';
  let fixtureStartBody: Record<string, unknown> | undefined;
  let fixtureAnswerBody: Record<string, unknown> | undefined;
  async function fixtureCompatibleV2Request<T>(
    path: string,
    init?: Parameters<typeof requestBackendJson>[1],
  ): Promise<T> {
    if (path === '/makeup-recommendations/sessions') {
      fixtureStartBody = init?.body as Record<string, unknown>;
      return {
        id: fixtureSessionId,
        status: 'questioning',
        currentQuestionIndex: 0,
        questions: [{
          id: 'finish',
          title: '어떤 마무리가 좋아요?',
          options: [
            {id: 'soft', label: '은은하게'},
            {id: 'clear', label: '또렷하게'},
            {id: 'glossy', label: '촉촉하게'},
            {id: 'ai_pick', label: 'AI가 골라줘'},
          ],
        }],
        answers: [],
        sourceAnalysisReportId: analysisReportId,
        customSituationText: fixtureKeyword.seedPrompt,
        customSituationLabel: fixtureKeyword.label,
      } as T;
    }
    if (path === `/makeup-recommendations/sessions/${fixtureSessionId}/answers`) {
      fixtureAnswerBody = init?.body as Record<string, unknown>;
      return {
        id: fixtureSessionId,
        status: 'ready',
        currentQuestionIndex: 1,
        questions: [{
          id: 'finish',
          title: '어떤 마무리가 좋아요?',
          options: [
            {id: 'soft', label: '은은하게'},
            {id: 'clear', label: '또렷하게'},
            {id: 'glossy', label: '촉촉하게'},
            {id: 'ai_pick', label: 'AI가 골라줘'},
          ],
        }],
        answers: [{questionId: 'finish', optionId: 'soft'}],
        sourceAnalysisReportId: analysisReportId,
        customSituationText: fixtureKeyword.seedPrompt,
        customSituationLabel: fixtureKeyword.label,
      } as T;
    }
    throw new Error(`Unexpected fixture-compatible V2 request: ${path}`);
  }
  const fixtureStarted = await startGeneratedMakeupRecommendationV2({
    analysisReportId,
    discoverySource: 'fixture',
    situation,
    keyword: fixtureKeyword,
  }, fixtureCompatibleV2Request);
  expectEqual(fixtureStarted.generationMode, 'v2', 'fixture catalog with a real report still uses backend AI');
  expectEqual(fixtureStarted.sourceAnalysisReportId, analysisReportId, 'fixture-backed V2 keeps selected report id');
  expectEqual(fixtureStarted.scenarioLabel, fixtureKeyword.label, 'fixture-backed V2 preserves the selected UI label');
  expectEqual(
    Object.keys(fixtureStartBody ?? {}).sort().join(','),
    'analysisReportId,customSituationLabel,customSituationText,imageMode',
    'fixture keyword is converted to the exactly-one custom wire contract',
  );
  expectEqual(fixtureStartBody?.customSituationText, fixtureKeyword.seedPrompt, 'fixture seed prompt becomes custom text');
  expectEqual(fixtureStartBody?.customSituationLabel, fixtureKeyword.label, 'fixture label remains server context');
  expectEqual(fixtureStartBody?.situationId, undefined, 'fixture situation id is never sent');
  expectEqual(fixtureStartBody?.keywordId, undefined, 'fixture keyword id is never sent');

  const fixtureAnswered = await answerGeneratedMakeupRecommendationQuestionV2(
    fixtureStarted,
    {questionId: 'finish', optionId: 'soft'},
    fixtureCompatibleV2Request,
  );
  expectEqual(fixtureAnswered.phase, 'ready', 'fixture-backed V2 continues through the real session');
  expectEqual(
    Object.keys(fixtureAnswerBody ?? {}).sort().join(','),
    'optionId,questionId',
    'answer wire payload contains only the selected answer',
  );
  expectEqual(
    JSON.stringify(fixtureAnswerBody).includes('fixture-'),
    false,
    'answer requests never reuse fixture ids',
  );

  const previousApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  try {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    let noApiError: unknown;
    try {
      await startGeneratedMakeupRecommendationV2({
        analysisReportId,
        discoverySource: 'fixture',
        situation,
        keyword: fixtureKeyword,
      });
    } catch (error) {
      noApiError = error;
    }
    expectEqual(
      noApiError instanceof MakeupRecommendationRetryableError,
      true,
      'missing API base fails closed instead of completing with local fixture looks',
    );
    expectEqual(
      (noApiError as Error).message.includes('추천 서버 연결 설정'),
      true,
      'missing API base explains the release configuration problem',
    );
  } finally {
    if (previousApiBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = previousApiBaseUrl;
  }

  let nonUuidFixtureRequestCount = 0;
  let fixtureReportError: unknown;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId: 'analysis-report-fixture',
      discoverySource: 'fixture',
      situation,
      keyword: fixtureKeyword,
    }, async () => {
      nonUuidFixtureRequestCount += 1;
      throw new Error('fixture report must never reach the backend');
    });
  } catch (error) {
    fixtureReportError = error;
  }
  expectEqual(
    fixtureReportError instanceof MakeupRecommendationRetryableError,
    true,
    'non-UUID fixture report fails closed instead of becoming a local preview',
  );
  expectEqual(nonUuidFixtureRequestCount, 0, 'non-UUID fixture report never reaches the backend');

  let networkFailure: unknown;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId,
      discoverySource: 'fixture',
      situation,
      keyword: fixtureKeyword,
    }, async () => {
      throw new BackendNetworkError();
    });
  } catch (error) {
    networkFailure = error;
  }
  expectEqual(networkFailure instanceof MakeupRecommendationRetryableError, true, 'network failure never becomes fake local success');
  expectEqual((networkFailure as Error).message.includes('네트워크'), true, 'network failure shows the reviewed Korean retry message');

  let providerFailureRequestCount = 0;
  let providerFailure: unknown;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId,
      discoverySource: 'fixture',
      situation,
      keyword: fixtureKeyword,
    }, async () => {
      providerFailureRequestCount += 1;
      throw new BackendApiError(
        'AI provider request failed.',
        502,
        'BEDROCK_REQUEST_FAILED',
      );
    });
  } catch (error) {
    providerFailure = error;
  }
  expectEqual(
    providerFailure instanceof MakeupRecommendationRetryableError,
    true,
    'Bedrock provider failure is surfaced as a retryable generation error',
  );
  expectEqual(
    (providerFailure as Error).message.includes('AI 메이크업 추천'),
    true,
    'Bedrock provider failure keeps the actionable AI retry message',
  );
  expectEqual(
    providerFailureRequestCount,
    1,
    'Bedrock provider failure never probes legacy generation or fixture success',
  );

  const legacyRequestPaths: string[] = [];
  let legacyV2Body: Record<string, unknown> | undefined;
  const question = {
    id: 'legacy-finish',
    title: '어떤 마무리가 좋아요?',
    options: [
      {id: 'soft', label: '은은하게'},
      {id: 'clear', label: '또렷하게'},
      {id: 'glossy', label: '촉촉하게'},
      {id: 'ai_pick', label: 'AI가 골라줘'},
    ],
  };
  async function legacyCompatibleRequest<T>(
    path: string,
    init?: Parameters<typeof requestBackendJson>[1],
  ): Promise<T> {
    legacyRequestPaths.push(path);
    if (path.endsWith('/sessions')) {
      legacyV2Body = init?.body as Record<string, unknown>;
      throw new BackendApiError('method not allowed', 405, 'HTTP_ERROR');
    }
    if (path.endsWith('/questions')) return {questions: [question]} as T;
    if (path === '/makeup-recommendations') {
      return {
        reportId: 'legacy-report',
        imageStatus: 'pending',
        recommendation: {
          looks: ['anchor', 'bold', 'discovery'].map((role, index) => ({
            id: `legacy-look-${index + 1}`,
            role,
            title: `레거시 룩 ${index + 1}`,
            summary: '선택한 트렌드를 반영한 추천',
            reasons: ['선택한 트렌드와 답변을 반영했어요.'],
            appliedConditions: ['선택한 트렌드와 답변'],
            durationMinutes: 15,
            difficulty: 'medium',
            steps: COMPLETE_BACKEND_STEPS,
          })),
        },
      } as T;
    }
    throw new Error(`Unexpected legacy request: ${path}`);
  }
  const legacyStarted = await startGeneratedMakeupRecommendationV2({
    analysisReportId,
    discoverySource: 'fixture',
    situation,
    keyword: fixtureKeyword,
  }, legacyCompatibleRequest);
  expectEqual(legacyStarted.generationMode, 'backend', 'old API uses its real legacy question flow');
  expectEqual(legacyStarted.sourceAnalysisReportId, analysisReportId, 'legacy compatibility keeps selected report context');
  expectEqual(legacyV2Body?.customSituationText, fixtureKeyword.seedPrompt, 'old API probe also uses the fixture custom contract');
  expectEqual(legacyV2Body?.situationId, undefined, 'old API probe never receives a fixture situation id');
  expectEqual(legacyV2Body?.keywordId, undefined, 'old API probe never receives a fixture keyword id');
  const legacyCompleted = await answerGeneratedMakeupRecommendationQuestionV2(
    legacyStarted,
    {questionId: question.id, optionId: 'soft'},
    legacyCompatibleRequest,
  );
  expectEqual(legacyCompleted.phase, 'results', 'legacy compatibility completes the selected fixture trend');
  expectEqual(legacyCompleted.results.length, 3, 'legacy compatibility keeps the three recommendation looks');
  expectEqual(
    legacyRequestPaths.join(','),
    '/makeup-recommendations/sessions,/makeup-recommendations/questions,/makeup-recommendations',
    'v2-unavailable flow falls back through legacy questions and recommendation generation',
  );

  let unexpectedRequestCount = 0;
  async function mustNotSendInvalidSelection<T>(): Promise<T> {
    unexpectedRequestCount += 1;
    throw new Error('invalid selection must not reach the backend');
  }

  let genericNotFound: unknown;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId,
      editorialPresetId: 'baseball-camera',
      editorialPresetLabel: '야구장 전광판에 잡히고 싶은 날',
      editorialPresetPrompt: '야외 야구장에서 생기 있고 또렷하며 오래 유지되는 메이크업',
    }, async () => {
      throw new BackendApiError('not found', 404, 'ANALYSIS_REPORT_NOT_FOUND');
    });
  } catch (error) {
    genericNotFound = error;
  }
  expectEqual(genericNotFound instanceof BackendApiError, true, 'resource 404 never falls back to legacy generation');

  let mixedSelection: unknown;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId,
      discoverySource: 'api',
      situation: {
        ...situation,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      keyword: {
        ...situation.keywords[0],
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      editorialPresetId: 'baseball-camera',
      editorialPresetLabel: '야구장 전광판에 잡히고 싶은 날',
      editorialPresetPrompt: '야외 야구장에서 생기 있고 또렷하며 오래 유지되는 메이크업',
    }, mustNotSendInvalidSelection);
  } catch (error) {
    mixedSelection = error;
  }
  expectEqual(mixedSelection instanceof MakeupRecommendationRetryableError, true, 'mixed selection is rejected before the request');

  let invalidUuid: unknown;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId: 'analysis-report-not-uuid',
      editorialPresetId: 'baseball-camera',
      editorialPresetLabel: '야구장 전광판에 잡히고 싶은 날',
      editorialPresetPrompt: '야외 야구장에서 생기 있고 또렷하며 오래 유지되는 메이크업',
    }, mustNotSendInvalidSelection);
  } catch (error) {
    invalidUuid = error;
  }
  expectEqual(invalidUuid instanceof MakeupRecommendationRetryableError, true, 'invalid analysis report uuid is rejected before the request');
  expectEqual(unexpectedRequestCount, 0, 'invalid mixed or UUID selections never reach the backend');

  let invalidSelectionUuid: unknown;
  let invalidSelectionRequestCount = 0;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId,
      discoverySource: 'api',
      situation,
      keyword: situation.keywords[0],
    }, async () => {
      invalidSelectionRequestCount += 1;
      throw new Error('invalid ids must not reach the backend');
    });
  } catch (error) {
    invalidSelectionUuid = error;
  }
  expectEqual(invalidSelectionUuid instanceof MakeupRecommendationRetryableError, true, 'invalid api selection uuids are rejected before the request');
  expectEqual(invalidSelectionRequestCount, 0, 'invalid api selection uuids never reach the backend');

  let validationError: unknown;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId,
      editorialPresetId: 'baseball-camera',
      editorialPresetLabel: '야구장 전광판에 잡히고 싶은 날',
      editorialPresetPrompt: '야외 야구장에서 생기 있고 또렷하며 오래 유지되는 메이크업',
    }, async () => {
      throw new BackendApiError('Request validation failed.', 422, 'VALIDATION_ERROR', {
        errors: [{msg: 'Value error, Exactly one selection is required.'}],
      });
    });
  } catch (error) {
    validationError = error;
  }
  expectEqual(validationError instanceof MakeupRecommendationRetryableError, true, 'raw backend 422 becomes a retryable Korean error');
  expectEqual(
    (validationError as Error).message.includes('Request validation failed'),
    false,
    'raw backend validation text is never shown to the user',
  );

  async function forbiddenRequest<T>(): Promise<T> {
    throw new BackendApiError('forbidden', 403, 'FORBIDDEN');
  }
  let forbidden: unknown;
  try {
    await startGeneratedMakeupRecommendationV2({
      analysisReportId,
      editorialPresetId: 'baseball-camera',
      editorialPresetLabel: '야구장 전광판에 잡히고 싶은 날',
      editorialPresetPrompt: '야외 야구장에서 생기 있고 또렷하며 오래 유지되는 메이크업',
    }, forbiddenRequest);
  } catch (error) {
    forbidden = error;
  }
  expectEqual(forbidden instanceof BackendApiError, true, 'ownership/auth errors never masquerade as fixture success');
}

async function expectLookRetryTargetsOnlyFailedLook() {
  let requestBody: unknown;
  async function backendRequest<T>(_path: string, init?: Parameters<typeof requestBackendJson>[1]): Promise<T> {
    requestBody = init?.body;
    return {reportId: 'report-retry', lookId: 'look-bold', imageStatus: 'pending'} as T;
  }
  const session = restoreMakeupRecommendationReport({...reportHistory[0], imageStatus: 'partial'});
  const retried = await retryGeneratedMakeupRecommendationImages(session, undefined, 'look-bold', backendRequest);
  expectEqual((requestBody as {lookId?: string}).lookId, 'look-bold', 'image retry sends selected look id');
  expectEqual(retried.imageStatus, 'pending', 'look retry returns pending aggregate state');
}

function expectMakeupRecommendationTelemetryContract() {
  expectEqual(MAKEUP_RECOMMENDATION_EVENT_NAMES.join(','), [
    'makeup_recommendation_opened',
    'analysis_report_selected',
    'makeup_situation_selected',
    'makeup_keyword_selected',
    'custom_situation_submitted',
    'recommendation_question_answered',
    'recommendation_generation_started',
    'recommendation_text_completed',
    'recommendation_image_completed',
    'recommendation_image_failed',
    'recommendation_area_opened',
    'recommendation_ar_applied',
  ].join(','), 'telemetry keeps the 12-event product contract');

  const safeMetadata = sanitizeMakeupRecommendationEventMetadata({
    id: ' report-1 ',
    category: 'trend',
    modelVersion: 'claude-test',
    durationMs: 12.6,
    status: 'completed',
    customPrompt: 'private custom prompt',
    faceShape: 'sensitive face value',
  });
  expectEqual(safeMetadata.id, 'report-1', 'telemetry trims safe identifiers');
  expectEqual(safeMetadata.durationMs, 13, 'telemetry rounds duration');
  expectEqual('customPrompt' in safeMetadata, false, 'telemetry rejects raw custom prompts');
  expectEqual('faceShape' in safeMetadata, false, 'telemetry rejects sensitive face values');

  const emittedKeys = new Set<string>();
  const failedInput = {
    contextId: 'report-1',
    reportStatus: 'partial' as const,
    looks: [{id: 'look-1', role: 'anchor' as const, imageStatus: 'failed' as const}],
  };
  expectEqual(takeNewMakeupRecommendationImageEvents(failedInput, emittedKeys).length, 1, 'first image terminal event emits');
  expectEqual(takeNewMakeupRecommendationImageEvents(failedInput, emittedKeys).length, 0, 'same image terminal event is deduplicated');
  const completedInput = {
    contextId: 'report-1',
    reportStatus: 'completed' as const,
    looks: [{id: 'look-1', role: 'anchor' as const, imageStatus: 'completed' as const}],
  };
  expectEqual(takeNewMakeupRecommendationImageEvents(completedInput, emittedKeys)[0]?.eventName, 'recommendation_image_completed', 'failed image retry may later complete once');

  const knownKeys = new Set<string>();
  markKnownMakeupRecommendationImageEvents(failedInput, knownKeys);
  expectEqual(takeNewMakeupRecommendationImageEvents(failedInput, knownKeys).length, 0, 'retry primes known terminal image state');
}

async function expectMakeupRecommendationTelemetryIsFireAndForget() {
  let capturedPath = '';
  let capturedBody: unknown;
  function backendRequest<T>(path: string, init?: Parameters<typeof requestBackendJson>[1]): Promise<T> {
    capturedPath = path;
    capturedBody = init?.body;
    return Promise.resolve({} as T);
  }
  trackMakeupRecommendationEvent('makeup_keyword_selected', {
    id: 'keyword-1',
    category: 'trend',
    status: 'selected',
  }, backendRequest);
  expectEqual(capturedPath, '/makeup-recommendations/events', 'telemetry uses the event endpoint');
  const captured = capturedBody as {eventName: string; metadata: Record<string, unknown>};
  expectEqual(captured.eventName, 'makeup_keyword_selected', 'telemetry sends the selected event name');
  expectEqual(captured.metadata.id, 'keyword-1', 'telemetry sends only safe metadata');

  trackMakeupRecommendationEvent('makeup_recommendation_opened', {}, async () => {
    throw new Error('telemetry unavailable');
  });
  let syncFailureEscaped = false;
  try {
    trackMakeupRecommendationEvent('makeup_recommendation_opened', {}, () => {
      throw new Error('telemetry unavailable synchronously');
    });
  } catch {
    syncFailureEscaped = true;
  }
  expectEqual(syncFailureEscaped, false, 'synchronous telemetry failure never interrupts the flow');
  await Promise.resolve();
}

async function expectMakeupRecommendationSessionIdPersistenceContract() {
  let storedValue: string | null = null;
  let removeCount = 0;
  const storage: MakeupRecommendationSessionIdStorage = {
    async getItem(key) {
      expectEqual(key, MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY, 'session storage read key');
      return storedValue;
    },
    async setItem(key, value) {
      expectEqual(key, MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY, 'session storage write key');
      storedValue = value;
    },
    async removeItem(key) {
      expectEqual(key, MAKEUP_RECOMMENDATION_CURRENT_SESSION_ID_STORAGE_KEY, 'session storage remove key');
      storedValue = null;
      removeCount += 1;
    },
  };

  await saveCurrentMakeupRecommendationSessionId(' session-v2 ', storage);
  expectEqual(storedValue, 'session-v2', 'AsyncStorage contains the opaque current session id only');
  expectEqual(String(storedValue).includes('customSituationText'), false, 'storage never contains custom prompt context');
  expectEqual(await readCurrentMakeupRecommendationSessionId(storage), 'session-v2', 'stored session id is readable');
  await clearCurrentMakeupRecommendationSessionId(storage, 'another-session');
  expectEqual(storedValue, 'session-v2', 'stale completion cannot clear a newer session id');
  await clearCurrentMakeupRecommendationSessionId(storage, 'session-v2');
  expectEqual(storedValue, null, 'matching completed or cancelled session is cleared');
  expectEqual(removeCount, 1, 'matching session cleanup removes once');

  storedValue = '   ';
  expectEqual(await readCurrentMakeupRecommendationSessionId(storage), null, 'invalid persisted id is discarded');
  expectEqual(removeCount, 2, 'invalid persisted id is removed');

  const unavailableStorage: MakeupRecommendationSessionIdStorage = {
    async getItem() { throw new Error('storage unavailable'); },
    async setItem() { throw new Error('storage unavailable'); },
    async removeItem() { throw new Error('storage unavailable'); },
  };
  await saveCurrentMakeupRecommendationSessionId('session-v2', unavailableStorage);
  await clearCurrentMakeupRecommendationSessionId(unavailableStorage);
  expectEqual(await readCurrentMakeupRecommendationSessionId(unavailableStorage), null, 'storage errors fail open');
}

async function expectGeneratedV2SessionRestoreContract() {
  const sessionId = '66666666-6666-4666-8666-666666666666';
  const analysisReportId = '77777777-7777-4777-8777-777777777777';
  const situationId = '88888888-8888-4888-8888-888888888888';
  const keywordId = '99999999-9999-4999-8999-999999999999';
  const reportId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  let requestPath = '';
  let requestMethod: string | undefined;
  let responseStatus: 'questioning' | 'ready' | 'generating' | 'completed' | 'failed' = 'generating';
  async function backendRequest<T>(path: string, init?: Parameters<typeof requestBackendJson>[1]): Promise<T> {
    requestPath = path;
    requestMethod = init?.method;
    return {
      id: sessionId,
      status: responseStatus,
      profileGender: 'male',
      currentQuestionIndex: responseStatus === 'questioning' ? 0 : 1,
      questions: [{
        id: 'finish',
        title: '어떤 마무리가 좋아요?',
        options: [
          {id: 'soft', label: '은은하게'},
          {id: 'clear', label: '또렷하게'},
          {id: 'glossy', label: '촉촉하게'},
          {id: 'ai_pick', label: 'AI가 골라줘'},
        ],
      }],
      answers: responseStatus === 'questioning' ? [] : [{questionId: 'finish', optionId: 'soft'}],
      sourceAnalysisReportId: analysisReportId,
      situation: {id: situationId, key: 'date', label: '데이트', description: '낮부터 저녁까지'},
      keyword: {
        id: keywordId,
        label: '스트로베리 밀크',
        kind: 'trend',
        badge: 'TREND_K_BEAUTY_2026',
        seedPrompt: '투명한 핑크 톤 메이크업',
        tags: ['date'],
      },
      reportId: responseStatus === 'completed' ? reportId : undefined,
      expiresAt: '2099-07-17T00:00:00Z',
    } as T;
  }

  const generating = await fetchGeneratedMakeupRecommendationSessionV2(sessionId, backendRequest);
  expectEqual(requestPath, `/makeup-recommendations/sessions/${sessionId}`, 'resume fetches the owned server session');
  expectEqual(requestMethod, undefined, 'resume uses GET');
  expectEqual(generating.phase, 'ready', 'generating server session maps to loading-capable client phase');
  expectEqual(generating.status, 'generating', 'generating status is preserved for polling');
  expectEqual(generating.profileGender, 'male', 'server session restore keeps account gender');
  expectEqual(generating.prompt, '투명한 핑크 톤 메이크업', 'prompt is reconstructed from server context, not local storage');
  expectEqual(generating.answers.length, 1, 'server-owned answers are restored');
  expectEqual(generating.sourceAnalysisReportId, analysisReportId, 'owned analysis report id is restored');
  responseStatus = 'questioning';
  const questioning = await fetchGeneratedMakeupRecommendationSessionV2(sessionId, backendRequest);
  expectEqual(questioning.phase, 'question', 'questioning session restores its current reverse question');
  expectEqual(questioning.currentQuestionIndex, 0, 'questioning session restores the server index');

  responseStatus = 'ready';
  const ready = await fetchGeneratedMakeupRecommendationSessionV2(sessionId, backendRequest);
  expectEqual(ready.phase, 'ready', 'ready session can resume generation');

  responseStatus = 'failed';
  const failed = await fetchGeneratedMakeupRecommendationSessionV2(sessionId, backendRequest);
  expectEqual(failed.phase, 'ready', 'failed server session remains generation-capable on the client');
  expectEqual(failed.status, 'failed', 'failed server status is preserved for explicit retry UX');
  expectEqual(failed.answers.length, 1, 'failed session restores server-owned answers for retry');

  responseStatus = 'completed';
  const completed = await fetchGeneratedMakeupRecommendationSessionV2(sessionId, backendRequest);
  expectEqual(completed.phase, 'results', 'completed session maps to results hydration');
  expectEqual(completed.reportId, reportId, 'completed session keeps its report id');

  const activeExpiry = '2099-07-17T00:00:00Z';
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'questioning', expiresAt: activeExpiry}), 'question', 'questioning resumes at question');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'ready', expiresAt: activeExpiry}), 'loading', 'ready resumes at loading');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'generating', expiresAt: activeExpiry}), 'loading', 'generating resumes at loading');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'failed', expiresAt: activeExpiry}), 'retry', 'failed session waits for explicit user retry');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'completed', reportId: 'report-v2', expiresAt: activeExpiry}), 'results', 'completed resumes through result hydration');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'completed', expiresAt: activeExpiry}), 'discard', 'completed session without report is discarded');
  expectEqual(getMakeupRecommendationSessionRestoreDestination({status: 'ready', expiresAt: '2020-01-01T00:00:00Z'}), 'discard', 'expired session is discarded');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('missing', 404, 'NOT_FOUND')), true, '404 clears persisted id');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('conflict', 409, 'CONFLICT')), true, '409 clears persisted id');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('generating', 409, 'MAKEUP_SESSION_GENERATING')), false, 'in-flight generation conflict keeps persisted id for polling');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('race', 409, 'MAKEUP_SESSION_STATE_CHANGED')), false, 'generation claim race also keeps persisted id for polling');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('expired', 410, 'EXPIRED')), true, 'expired response clears persisted id');
  expectEqual(shouldDiscardStoredMakeupRecommendationSessionForError(new BackendApiError('temporary', 500, 'TEMPORARY')), false, 'transient restore error keeps id for a later retry');
}
async function runAsyncContracts() {
  expectMakeupRecommendationTelemetryContract();
  await expectGeneratedQuestionFailureIsSurfaced();
  await expectGeneratedQuestionsRejectSixOptions();
  await expectAuthFailureDoesNotMasqueradeAsFallback();
  await expectAbortSignalIsForwarded();
  await expectGeneratedBackendFlowCompletesAndKeepsSavedReport();
  await expectGeneratedRecommendationFailureIsSurfaced();
  await expectPollingParsesJsonStringRecommendationAndKeepsResults();
  await expectV2DiscoverySessionAnswerGenerateContract();
  await expectV2OnlyFallsBackForUnavailableEndpoint();
  await expectLookRetryTargetsOnlyFailedLook();
  await expectMakeupRecommendationTelemetryIsFireAndForget();
  await expectMakeupRecommendationSessionIdPersistenceContract();
  await expectGeneratedV2SessionRestoreContract();
}

void runAsyncContracts().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
