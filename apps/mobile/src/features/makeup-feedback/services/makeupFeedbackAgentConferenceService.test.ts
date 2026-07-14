import type {MakeupFeedbackPhotoSelection, MakeupFeedbackResult} from '../types';
import {
  MAKEUP_FEEDBACK_MIN_SAFE_CONFERENCE_MESSAGES,
  MAKEUP_FEEDBACK_REVIEW_CREW_LABELS,
  buildMakeupFeedbackClosingConferenceMessages,
  buildMakeupFeedbackConferencePreviewContext,
  buildMakeupFeedbackConferenceResultPayload,
  buildMakeupFeedbackSafeConferenceMessages,
  buildPreviewConferenceRequestPayload,
  canCommitMakeupFeedbackConferenceMessage,
  getMakeupFeedbackInitialTypingDelayMs,
  getNextMakeupFeedbackConferenceMessage,
  getMakeupFeedbackMessageExposureDelayMs,
  getMakeupFeedbackTypingDelayMs,
  mapMakeupFeedbackBackendConferenceMessages,
  mergeMakeupFeedbackPreviewMessages,
} from './makeupFeedbackAgentConferenceService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expectIncludes(value: string, expected: string, label: string) {
  expectEqual(value.includes(expected), true, label);
}

function expectOmits(value: string, forbidden: string, label: string) {
  expectEqual(value.includes(forbidden), false, label);
}

const result = {
  id: 'conference-result',
  analysisSource: 'ai',
  uploadedImage: {uri: 'file:///feedback.jpg'},
  photoSource: 'gallery',
  photoSourceLabel: '앨범 사진',
  score: 72,
  scoreLabel: '종합 점수',
  scoreReason: '목적 기준 세 가지 중 두 가지가 사진 근거와 연결됐어요.',
  interpretedGoal: {
    intensity: 'light',
    label: '봄 야외 촬영 메이크업',
    reason: '사용자가 밝은 야외 촬영을 요청했어요.',
    dynamicCriteria: [
      {
        id: 'goal-boundary',
        criterion: '경계가 밝은 자연광에서도 부드럽게 이어지는지',
        derivedFrom: '밝은 야외 촬영',
      },
    ],
  },
  captureQuality: {
    usable: true,
    detectorAvailable: true,
    colorConfidence: 'medium',
    issues: [
      {
        code: 'warm-light',
        message: '따뜻한 조명 때문에 색 판단에 영향이 있을 수 있어요.',
        affectedTopicIds: ['lip'],
      },
    ],
  },
  summary: {
    strengthSummary: '보이는 요약',
    improvementSummary: 'HIDDEN_SUMMARY_LIMITATION',
  },
  summaryBadges: [],
  annotations: [],
  evaluations: [
    {
      id: 'lip-strength-evaluation',
      topicId: 'lip',
      topicLabel: '립',
      status: 'strength',
      title: '립 경계가 고르게 이어져요',
      description: '입술 중앙부터 가장자리까지 경계가 고르게 보여요.',
      actionSteps: ['현재 경계를 유지해 주세요.'],
      kind: 'lip',
      visibility: 'clear',
      visibilityReason: null,
      goalCriterionIds: ['goal-boundary'],
      observations: [
        {
          id: 'obs-lip-boundary',
          claim: '입술 경계가 좌우로 고르게 이어져요.',
          evidenceLocation: '입술 윤곽',
          lightingSensitive: false,
        },
      ],
    },
    {
      id: 'blush-improvement-evaluation',
      topicId: 'blush',
      topicLabel: '블러셔',
      status: 'improvement',
      title: '블러셔 경계를 한 번 더 풀어주세요',
      description: '볼 바깥쪽 경계를 한 번 더 블렌딩하면 목적에 가까워져요.',
      actionSteps: ['깨끗한 브러시로 바깥 경계를 한 번 쓸어주세요.'],
      kind: 'cheek',
      visibility: 'partial',
      visibilityReason: '오른쪽 볼은 그림자 영향을 일부 받아요.',
      goalCriterionIds: ['goal-boundary'],
      observations: [
        {
          id: 'obs-blush-boundary',
          claim: '왼쪽 볼 바깥 경계가 안쪽보다 선명해요.',
          evidenceLocation: '왼쪽 볼 바깥쪽',
          lightingSensitive: true,
        },
      ],
    },
    {
      id: 'eyeliner-optional',
      topicId: 'eyeliner',
      topicLabel: '아이라인',
      status: 'optional',
      title: 'HIDDEN_OPTIONAL',
      description: '숨겨야 하는 선택 항목',
      actionSteps: ['숨겨야 하는 단계'],
      kind: 'eye',
      visibility: 'partial',
      visibilityReason: '오른쪽 눈꼬리가 머리카락에 일부 가려졌어요.',
      goalCriterionIds: ['goal-boundary'],
      observations: [
        {
          id: 'obs-eyeliner-tail',
          claim: '왼쪽 눈꼬리 선은 사진에서 확인돼요.',
          evidenceLocation: '왼쪽 눈꼬리',
          lightingSensitive: false,
        },
      ],
    },
    {
      id: 'highlight-not-assessable',
      topicId: 'highlight',
      topicLabel: '하이라이터',
      status: 'not_assessable',
      title: 'HIDDEN_NOT_ASSESSABLE',
      description: '숨겨야 하는 가시성 항목',
      actionSteps: [],
      kind: 'cheek',
    },
    {
      id: 'lens-not-applicable',
      topicId: 'lens',
      topicLabel: '렌즈',
      status: 'not_applicable',
      title: 'HIDDEN_NOT_APPLICABLE',
      description: '숨겨야 하는 비적용 항목',
      actionSteps: [],
      kind: 'eye',
    },
  ],
  strengths: [
    {
      id: 'lip-strength',
      topicId: 'lip',
      topicLabel: '립',
      title: 'Visible strength',
      description: 'The lip boundary is even.',
      actionSteps: ['Keep the current boundary.'],
      icon: 'sparkle',
      kind: 'lip',
    },
  ],
  points: [
    {
      id: 'blush-point',
      topicId: 'blush',
      topicLabel: '블러셔',
      title: 'Visible improvement',
      description: 'Blend the blush boundary once more.',
      actionSteps: ['Blend once more.'],
      actionLabel: '보완 방법',
      kind: 'cheek',
    },
    {
      id: 'eyeliner-promoted-point',
      topicId: 'eyeliner',
      topicLabel: '아이라인',
      title: 'Promoted user-visible point',
      description: 'This item is already user-visible.',
      actionSteps: ['Apply a thin line.'],
      actionLabel: '보완 방법',
      kind: 'eye',
    },
  ],
} as MakeupFeedbackResult;

const payload = buildMakeupFeedbackConferenceResultPayload(result);
const serializedPayload = JSON.stringify(payload);

expectEqual(payload.score, 72, 'score');
expectEqual(payload.scoreReason, result.scoreReason, 'score reason');
expectEqual(payload.interpretedGoal?.label, '봄 야외 촬영 메이크업', 'goal label');
expectEqual(payload.interpretedGoal?.dynamicCriteria.length, 1, 'dynamic criteria count');
expectEqual(payload.captureQuality?.issues[0]?.code, 'warm-light', 'capture issue');
expectEqual(payload.evaluations.length, 3, 'visible and promoted evaluations count');
expectEqual(payload.evaluations[0]?.observations[0]?.id, 'obs-lip-boundary', 'observation');
expectEqual(payload.evaluations[1]?.goalCriterionIds[0], 'goal-boundary', 'criterion link');
expectEqual(payload.evaluations[2]?.id, 'eyeliner-promoted-point', 'promoted point id');
expectEqual(payload.evaluations[2]?.status, 'improvement', 'promoted presentation status');
expectEqual(
  payload.evaluations[2]?.title,
  'Promoted user-visible point',
  'promoted point title is user-visible copy',
);
expectEqual(
  payload.evaluations[2]?.description,
  'This item is already user-visible.',
  'promoted point description is user-visible copy',
);
expectEqual(
  payload.evaluations[2]?.actionSteps[0],
  'Apply a thin line.',
  'promoted point action is user-visible copy',
);
expectEqual(
  payload.evaluations[2]?.observations[0]?.id,
  'obs-eyeliner-tail',
  'promoted point keeps observation evidence',
);
expectEqual(
  payload.evaluations[2]?.visibilityReason,
  '오른쪽 눈꼬리가 머리카락에 일부 가려졌어요.',
  'promoted point keeps visibility caveat',
);
expectEqual(payload.strengths[0]?.actionSteps[0], 'Keep the current boundary.', 'strength action');
expectEqual(payload.points[0]?.actionSteps[0], 'Blend once more.', 'point action');
expectEqual(payload.points.length, 2, 'all user-visible points remain');
expectEqual(Object.prototype.hasOwnProperty.call(payload, 'summary'), false, 'summary omitted');
expectOmits(serializedPayload, 'HIDDEN_OPTIONAL', 'optional raw item omitted');
expectOmits(serializedPayload.toLowerCase(), 'optional', 'raw optional enum and id omitted');
expectIncludes(serializedPayload, 'Promoted user-visible point', 'visible promoted copy included');
expectOmits(serializedPayload, 'HIDDEN_NOT_ASSESSABLE', 'not assessable raw item omitted');
expectOmits(serializedPayload, 'HIDDEN_NOT_APPLICABLE', 'not applicable raw item omitted');
expectOmits(serializedPayload, 'HIDDEN_SUMMARY_LIMITATION', 'summary limitation omitted');
expectOmits(serializedPayload, 'not_assessable', 'internal not assessable status omitted');
expectOmits(serializedPayload, 'not_applicable', 'internal not applicable status omitted');

const selection = {
  photoSource: 'gallery',
  feedbackContext: {userGoalText: '친구 결혼식 야외 촬영에서 화사해 보이고 싶어요'},
} satisfies MakeupFeedbackPhotoSelection;
const safeMessages = buildMakeupFeedbackSafeConferenceMessages(selection);
const safeText = safeMessages.map(item => item.text).join(' ');

expectEqual(MAKEUP_FEEDBACK_MIN_SAFE_CONFERENCE_MESSAGES, 4, 'minimum safe message count');
expectEqual(MAKEUP_FEEDBACK_REVIEW_CREW_LABELS.photo.name, '루미', 'photo character name');
expectEqual(MAKEUP_FEEDBACK_REVIEW_CREW_LABELS.photo.role, '사진 상태', 'photo role');
expectEqual(MAKEUP_FEEDBACK_REVIEW_CREW_LABELS.goal.name, '모아', 'goal character name');
expectEqual(MAKEUP_FEEDBACK_REVIEW_CREW_LABELS.detail.name, '루페', 'detail character name');
expectEqual(MAKEUP_FEEDBACK_REVIEW_CREW_LABELS.coach.name, '다듬', 'coach character name');
expectEqual(safeMessages.length, 4, 'four-message local fallback');
expectEqual(safeMessages.every(item => item.phase === 'safe'), true, 'safe phase only');
expectEqual(
  safeMessages.map(item => item.agentId).join(','),
  'goal,photo,detail,coach',
  'local fallback ends with a short coach handoff',
);
expectEqual(safeMessages[0]?.agentId, 'goal', 'goal seed opens the preview');
expectIncludes(safeMessages[0]?.text ?? '', '친구 결혼식 야외 촬영', 'seed uses user goal');
expectIncludes(safeMessages[0]?.text ?? '', '앨범에서 고른 사진', 'seed uses photo source');
expectEqual((safeMessages[0]?.text.length ?? 0) <= 120, true, 'seed stays within 120 chars');
expectIncludes(safeText, '친구 결혼식 야외 촬영', 'safe thread uses the user goal');
expectIncludes(safeText, '앨범에서 고른 사진', 'gallery source is reflected');
const cameraSafeText = buildMakeupFeedbackSafeConferenceMessages({photoSource: 'camera'})
  .map(item => item.text)
  .join(' ');
expectIncludes(cameraSafeText, '방금 촬영한 사진', 'camera source is reflected');
const punctuatedSeed = buildMakeupFeedbackSafeConferenceMessages({
  photoSource: 'gallery',
  feedbackContext: {userGoalText: '데이트예요! 화사하게. 자연스럽게?'},
})[0]!;
expectEqual(
  (punctuatedSeed.text.match(/[.!?。！？]/g) ?? []).length,
  1,
  'seed remains one sentence after goal sanitization',
);

const previewRequestPayload = buildPreviewConferenceRequestPayload(
  {
    ...selection,
    fileName: 'PRIVATE_FILE.jpg',
    imageUri: 'file:///PRIVATE_IMAGE.jpg',
    photoTitle: 'PRIVATE_PHOTO_TITLE',
  },
  {agentId: safeMessages[0]!.agentId, text: safeMessages[0]!.text},
);
const serializedPreviewRequestPayload = JSON.stringify(previewRequestPayload);
const aiFirstPreviewRequestPayload = buildPreviewConferenceRequestPayload(selection);
expectEqual(
  'conversationSeed' in aiFirstPreviewRequestPayload,
  false,
  'AI-first preview request omits local fixed seed',
);
expectEqual(previewRequestPayload.conversationSeed!.agentId, 'goal', 'payload includes seed agent');
expectEqual(previewRequestPayload.conversationSeed!.text, safeMessages[0]!.text, 'payload includes seed text');
expectEqual(previewRequestPayload.source, 'gallery', 'payload keeps safe photo source');
expectOmits(serializedPreviewRequestPayload, 'PRIVATE_FILE', 'preview payload omits file name');
expectOmits(serializedPreviewRequestPayload, 'PRIVATE_IMAGE', 'preview payload omits image uri');
expectOmits(serializedPreviewRequestPayload, 'PRIVATE_PHOTO_TITLE', 'preview payload omits photo title');
expectOmits(safeText, 'Visible strength', 'safe thread cannot claim a result strength');
expectOmits(safeText, 'Visible improvement', 'safe thread cannot claim a result point');
expectOmits(safeText, '72점', 'safe thread cannot claim a score');

const generated = mapMakeupFeedbackBackendConferenceMessages([
  {agentId: 'photo', text: '사진 조건부터 볼게요.', evidenceRefs: ['capture:usable', '', 2]},
  {agentId: 'goal', text: '목적 기준과 연결할게요.', evidenceRefs: ['goal:goal-boundary']},
  {agentId: 'detail', text: '관찰 근거가 이어져요.', evidenceRefs: ['observation:obs-lip-boundary']},
  {agentId: 'coach', text: '실행 순서로 묶을게요.', evidenceRefs: []},
  {agentId: 'unknown', text: 'invalid'},
  {agentId: 'photo', text: '   '},
]);

expectEqual(generated.length, 4, 'new agent messages mapped');
expectEqual(generated[0]?.agentId, 'photo', 'new photo id');
expectEqual(generated[1]?.agentId, 'goal', 'new goal id');
expectEqual(generated[2]?.agentId, 'detail', 'new detail id');
expectEqual(generated[3]?.agentId, 'coach', 'new coach id');
expectEqual(generated[0]?.evidenceRefs?.length, 1, 'evidence refs sanitized');
const cappedGenerated = mapMakeupFeedbackBackendConferenceMessages(
  Array.from({length: 9}, (_, index) => ({
    agentId: 'detail',
    text: `generated ${index}`,
  })),
);
expectEqual(cappedGenerated.length, 7, 'generated conversation capped at seven messages');

const previewGenerated = mapMakeupFeedbackBackendConferenceMessages(
  Array.from({length: 10}, (_, index) => ({
    agentId: index % 2 === 0 ? 'photo' : 'detail',
    contextRefs: ['preview:' + index],
    text: 'preview ' + index,
  })),
  'preview',
);
expectEqual(previewGenerated.length, 6, 'preview conversation capped at six messages');
expectEqual(previewGenerated.every(item => item.phase === 'preview'), true, 'preview phase');
expectEqual(previewGenerated[0]?.contextRefs?.[0], 'preview:0', 'preview context refs');

const mergedPreview = mergeMakeupFeedbackPreviewMessages(
  [
    {id: 'shown-photo', agentId: 'photo', phase: 'safe', text: 'Already shown'},
  ],
  [
    {id: 'boundary-speaker', agentId: 'photo', phase: 'preview', text: 'AI photo first'},
    {id: 'same-speaker', agentId: 'photo', phase: 'preview', text: 'Photo again'},
    {id: 'duplicate-copy', agentId: 'goal', phase: 'preview', text: ' already   shown '},
    {id: 'next-goal', agentId: 'goal', phase: 'preview', text: 'Goal next'},
    {id: 'same-goal', agentId: 'goal', phase: 'preview', text: 'Goal repeated'},
    {id: 'next-detail', agentId: 'detail', phase: 'preview', text: 'Detail next'},
  ],
);
expectEqual(
  mergedPreview.map(item => item.agentId).join(','),
  'photo,goal,detail',
  'preview merge removes a repeated boundary speaker and later repeats',
);
expectEqual(mergedPreview[0]?.id, 'shown-photo', 'preview merge preserves displayed messages');
expectEqual(
  mergedPreview[1]?.id,
  'next-goal',
  'preview merge continues with a different AI speaker at the local boundary',
);
expectEqual(
  mergeMakeupFeedbackPreviewMessages([], previewGenerated, 3).length,
  3,
  'preview merge respects maximum',
);
const seededPreview = mergeMakeupFeedbackPreviewMessages(
  [safeMessages[0]!],
  [
    {id: 'same-goal-seed', agentId: 'goal', phase: 'preview', text: 'Goal repeats'},
    {id: 'photo-after-seed', agentId: 'photo', phase: 'preview', text: 'Photo continues'},
  ],
);
expectEqual(
  seededPreview.map(item => item.agentId).join(','),
  'goal,photo',
  'conversation seed and first AI speaker never repeat',
);

const previewContext = buildMakeupFeedbackConferencePreviewContext({
  lastSpeaker: 'photo',
  messages: [
    safeMessages[0]!,
    {id: 'preview-goal', agentId: 'goal', phase: 'preview', text: '목적을 먼저 볼게요.'},
    {id: 'preview-coach', agentId: 'coach', phase: 'preview', text: '방법을 연결할게요.'},
    {id: 'closing-ignored', agentId: 'coach', phase: 'closing', text: '제외할 결론'},
    {id: 'preview-detail', agentId: 'detail', phase: 'preview', text: '사진을 더 살펴볼게요.'},
  ],
  summary: '  사진과 목적을 함께 확인 중  ',
});
expectEqual(previewContext?.messages.length, 3, 'only last three displayed previews kept');
expectEqual(
  previewContext?.messages.map(item => item.agentId).join(','),
  'goal,coach,detail',
  'preview context keeps displayed order',
);
expectEqual(previewContext?.lastSpeaker, 'detail', 'actual last displayed speaker wins');
expectEqual(previewContext?.summary, '사진과 목적을 함께 확인 중', 'preview summary trimmed');

expectEqual(getMakeupFeedbackInitialTypingDelayMs(0), 500, 'minimum initial typing delay');
expectEqual(getMakeupFeedbackInitialTypingDelayMs(1), 900, 'maximum initial typing delay');
expectEqual(getMakeupFeedbackTypingDelayMs(0), 800, 'minimum typing delay');
expectEqual(getMakeupFeedbackTypingDelayMs(1), 1400, 'maximum typing delay');
expectEqual(getMakeupFeedbackMessageExposureDelayMs('a'.repeat(45), 0), 1800, 'short minimum');
expectEqual(getMakeupFeedbackMessageExposureDelayMs('a'.repeat(45), 1), 2400, 'short maximum');
expectEqual(getMakeupFeedbackMessageExposureDelayMs('a'.repeat(46), 0), 2500, 'medium minimum');
expectEqual(getMakeupFeedbackMessageExposureDelayMs('a'.repeat(90), 1), 3200, 'medium maximum');
expectEqual(getMakeupFeedbackMessageExposureDelayMs('a'.repeat(91), 0), 3200, 'long minimum');
expectEqual(getMakeupFeedbackMessageExposureDelayMs('a'.repeat(91), 1), 4200, 'long maximum');

expectEqual(
  canCommitMakeupFeedbackConferenceMessage({
    activeAnalysisRunId: 2,
    scheduledAnalysisRunId: 2,
  }),
  true,
  'current-run preview can still commit after analysis becomes ready',
);
expectEqual(
  canCommitMakeupFeedbackConferenceMessage({
    activeAnalysisRunId: 3,
    scheduledAnalysisRunId: 2,
  }),
  false,
  'stale run cannot commit a conference message',
);
const legacy = mapMakeupFeedbackBackendConferenceMessages([
  {agentId: 'tone', text: 'legacy tone'},
  {agentId: 'color', text: 'legacy color'},
  {agentId: 'style', text: 'legacy style'},
  {agentId: 'quality', text: 'legacy quality'},
]);
const mixedLegacy = mapMakeupFeedbackBackendConferenceMessages([
  {agentId: 'photo', text: 'new photo'},
  {agentId: 'quality', text: 'legacy quality'},
  {agentId: 'detail', text: 'new detail'},
]);

expectEqual(legacy.length, 0, 'legacy-only response triggers grounded fallback');
expectEqual(mixedLegacy.length, 0, 'mixed legacy response triggers grounded fallback');
expectEqual(
  mapMakeupFeedbackBackendConferenceMessages(legacy, 'preview').length,
  0,
  'legacy preview response also triggers fallback',
);

const fallbackMessages = buildMakeupFeedbackClosingConferenceMessages(result);
const fallbackText = fallbackMessages.map(item => item.text).join(' ');
const fallbackSequence = fallbackMessages.map(item => item.agentId).join(',');
const fallbackRefs = fallbackMessages.map(item => (item.evidenceRefs ?? []).join(','));
expectEqual(
  getNextMakeupFeedbackConferenceMessage({
    analysisReady: true,
    closingMessages: fallbackMessages,
    displayedMessages: previewGenerated.slice(0, 1),
    previewGenerationSettled: true,
    previewMessages: previewGenerated,
  }),
  previewGenerated[1],
  'analysis result cannot skip remaining AI preview messages',
);
expectEqual(
  getNextMakeupFeedbackConferenceMessage({
    analysisReady: true,
    closingMessages: fallbackMessages,
    displayedMessages: [],
    previewGenerationSettled: false,
    previewMessages: [],
  }),
  undefined,
  'grounded closing waits while AI preview generation is pending',
);
expectEqual(
  getNextMakeupFeedbackConferenceMessage({
    analysisReady: true,
    closingMessages: fallbackMessages,
    displayedMessages: previewGenerated,
    previewGenerationSettled: true,
    previewMessages: previewGenerated,
  }),
  fallbackMessages[0],
  'grounded closing starts after AI preview messages are drained',
);

const continuedFallbackMessages = buildMakeupFeedbackClosingConferenceMessages(
  result,
  'photo',
);
expectEqual(
  continuedFallbackMessages[0]?.agentId === 'photo',
  false,
  'fallback first speaker differs from preview last speaker',
);
expectEqual(
  continuedFallbackMessages[0]?.text.startsWith('그 기준을 이어서, '),
  true,
  'fallback naturally continues displayed preview',
);

expectEqual(
  continuedFallbackMessages[0]?.id.includes('closing-preview-handoff'),
  true,
  'fallback inserts a dependency-free handoff instead of swapping messages',
);
expectEqual(continuedFallbackMessages[0]?.agentId, 'goal', 'handoff uses a different speaker');
expectEqual(continuedFallbackMessages[1]?.agentId, 'photo', 'original photo evidence stays ordered');

expectEqual(fallbackMessages.length, 6, 'full fallback message count');
expectEqual(fallbackSequence, 'photo,goal,detail,coach,goal,coach', 'full fallback sequence');
expectEqual(
  fallbackMessages.some(
    (item, index) => index > 0 && fallbackMessages[index - 1]?.agentId === item.agentId,
  ),
  false,
  'full fallback has no consecutive speaker',
);
expectEqual(fallbackRefs[0], 'capture:warm-light', 'photo evidence ref');
expectEqual(fallbackRefs[1], 'goal:goal-boundary', 'goal evidence ref');
expectEqual(
  fallbackRefs[2],
  'strength:lip-strength,point:blush-point,point:eyeliner-promoted-point',
  'combined detail evidence refs',
);
expectEqual(fallbackRefs[3], 'action:blush:1', 'action evidence follows backend catalog');
expectEqual(fallbackRefs[4], 'score-reason', 'score evidence follows backend catalog');
expectEqual(fallbackRefs[5], '', 'final invitation has no factual evidence');
expectIncludes(fallbackMessages[1]?.text ?? '', '루미', 'goal reacts to photo');
expectEqual(
  fallbackMessages[2]?.text,
  '잘한 점은 Visible strength예요.\n보완할 점은 Visible improvement · Promoted user-visible point예요.',
  'detail fallback uses the same two-line title digest as the server',
);
expectOmits(fallbackMessages[2]?.text ?? '', 'The lip boundary is even.', 'detail omits descriptions');
expectIncludes(fallbackMessages[3]?.text ?? '', '루페', 'coach reacts to detail');
expectIncludes(fallbackMessages[4]?.text ?? '', '종합', 'goal synthesizes prior discussion');
expectIncludes(fallbackMessages[5]?.text ?? '', '결과', 'coach invites result reveal');
expectIncludes(fallbackText, 'Visible strength', 'fallback uses visible strength');
expectIncludes(fallbackText, 'Visible improvement', 'fallback uses visible point');
expectIncludes(fallbackText, 'Blend once more.', 'fallback uses provided action step');
expectIncludes(fallbackText, result.scoreReason, 'fallback uses score reason');
expectOmits(fallbackText, 'HIDDEN_OPTIONAL', 'fallback omits optional evaluation');
expectOmits(fallbackText, 'HIDDEN_NOT_ASSESSABLE', 'fallback omits visibility limitation');
expectOmits(fallbackText, 'HIDDEN_NOT_APPLICABLE', 'fallback omits non-applicable item');
expectOmits(JSON.stringify(fallbackMessages), 'score:reason', 'legacy score ref omitted');
expectOmits(JSON.stringify(fallbackMessages), 'action:blush-point:0', 'legacy action ref omitted');

const manyStrengths = Array.from({length: 9}, (_, index) => ({
  ...result.strengths[0]!,
  id: `many-strength-${index}`,
  title: `Strength title ${index + 1}`,
  description: `STRENGTH_DESCRIPTION_${index + 1}`,
  topicLabel: `STRENGTH_TOPIC_${index + 1}`,
}));
const manyPoints = Array.from({length: 9}, (_, index) => ({
  ...result.points[0]!,
  id: `many-point-${index}`,
  title: `Point title ${index + 1}`,
  description: `POINT_DESCRIPTION_${index + 1}`,
  topicLabel: `POINT_TOPIC_${index + 1}`,
}));
const denseFallbackMessages = buildMakeupFeedbackClosingConferenceMessages({
  ...result,
  strengths: manyStrengths,
  points: manyPoints,
} as MakeupFeedbackResult);
const denseDetailMessage = denseFallbackMessages.find(item => item.agentId === 'detail');
const denseDetailText = denseDetailMessage?.text ?? '';

expectIncludes(denseDetailText, 'Strength title 9', 'digest keeps strengths beyond eight');
expectIncludes(denseDetailText, 'Point title 9', 'digest keeps points beyond eight');
expectIncludes(denseDetailText, '잘한 점은 Strength title 1', 'digest labels strengths');
expectIncludes(denseDetailText, '\n보완할 점은 Point title 1', 'digest uses two logical lines');
expectEqual(
  (denseDetailText.match(/\n/g) ?? []).length,
  1,
  'dense digest has exactly one line break',
);
expectOmits(denseDetailText, 'STRENGTH_DESCRIPTION_', 'dense digest omits strength descriptions');
expectOmits(denseDetailText, 'POINT_DESCRIPTION_', 'dense digest omits point descriptions');
expectOmits(denseDetailText, 'STRENGTH_TOPIC_', 'dense digest omits strength topic labels');
expectOmits(denseDetailText, 'POINT_TOPIC_', 'dense digest omits point topic labels');
expectEqual(
  denseDetailMessage?.evidenceRefs?.length,
  18,
  'dense digest retains evidence refs for every visible title',
);

const strengthOnlyMessages = buildMakeupFeedbackClosingConferenceMessages({
  ...result,
  captureQuality: undefined,
  points: [],
} as MakeupFeedbackResult);
const strengthOnlyText = strengthOnlyMessages.map(item => item.text).join(' ');

expectEqual(
  strengthOnlyMessages.map(item => item.agentId).join(','),
  'goal,detail,coach,goal,coach',
  'strength-only sequence',
);
expectEqual(
  strengthOnlyMessages[2]?.evidenceRefs?.[0],
  'action:lip:1',
  'strength action ref',
);
expectIncludes(strengthOnlyText, 'Visible strength', 'strength-only keeps visible strength');
expectOmits(strengthOnlyText, 'Visible improvement', 'strength-only does not invent point');

const pointOnlyMessages = buildMakeupFeedbackClosingConferenceMessages({
  ...result,
  captureQuality: undefined,
  points: [result.points[0]!],
  strengths: [],
} as MakeupFeedbackResult);
const pointOnlyText = pointOnlyMessages.map(item => item.text).join(' ');

expectEqual(
  pointOnlyMessages.map(item => item.agentId).join(','),
  'goal,detail,coach,goal,coach',
  'point-only sequence',
);
expectEqual(
  pointOnlyMessages[2]?.evidenceRefs?.[0],
  'action:blush:1',
  'point action ref',
);
expectIncludes(pointOnlyText, 'Visible improvement', 'point-only keeps visible point');
expectOmits(pointOnlyText, 'Visible strength', 'point-only does not invent strength');

const sparseResult = {
  ...result,
  captureQuality: undefined,
  evaluations: [],
  interpretedGoal: undefined,
  points: [],
  strengths: [],
} as MakeupFeedbackResult;
const sparseMessages = buildMakeupFeedbackClosingConferenceMessages(sparseResult);
const sparseFallbackText = sparseMessages.map(item => item.text).join(' ');

expectEqual(sparseMessages.length >= 3, true, 'sparse fallback has enough messages');
expectEqual(
  sparseMessages.map(item => item.agentId).join(','),
  'goal,detail,goal,coach',
  'sparse fallback sequence',
);
expectEqual(sparseMessages[2]?.evidenceRefs?.[0], 'score-reason', 'sparse score ref');
expectIncludes(sparseFallbackText, '단정하지 않고', 'sparse fallback stays neutral');
expectOmits(sparseFallbackText, 'Visible strength', 'sparse fallback does not invent strength');
expectOmits(sparseFallbackText, 'Visible improvement', 'sparse fallback does not invent point');

const noScoreSparseMessages = buildMakeupFeedbackClosingConferenceMessages({
  ...sparseResult,
  scoreReason: '',
} as MakeupFeedbackResult);

expectEqual(noScoreSparseMessages.length, 3, 'no-score sparse fallback completes');
expectEqual(
  noScoreSparseMessages.map(item => item.agentId).join(','),
  'goal,detail,coach',
  'no-score sparse sequence',
);
expectEqual(
  noScoreSparseMessages.every(item => item.phase === 'closing'),
  true,
  'all sparse messages are closing phase',
);
