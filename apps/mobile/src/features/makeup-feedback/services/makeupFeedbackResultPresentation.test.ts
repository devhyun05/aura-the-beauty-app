import type {MakeupFeedbackEvaluation} from '../types';
import {MAKEUP_FEEDBACK_TOPICS} from '../types';
import {
  getMakeupFeedbackAnalysisSourceLabel,
  getMakeupFeedbackEvidenceRows,
  getPriorityMakeupFeedbackEvaluation,
  getPriorityMakeupFeedbackPoint,
  getMakeupFeedbackRecommendationLabel,
  getMakeupFeedbackRetakeActionLabels,
  groupMakeupFeedbackEvaluations,
} from './makeupFeedbackResultPresentation';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const evaluations: MakeupFeedbackEvaluation[] = MAKEUP_FEEDBACK_TOPICS.map(
  (topic, index) => ({
    actionSteps: index >= 7 ? [] : [`Apply ${topic.id}.`],
    description: `${topic.id} description`,
    id: `${topic.id}-evaluation`,
    kind: topic.kind,
    observations:
      index < 6
        ? [
            {
              claim: `${topic.id} claim`,
              evidenceLocation: `${topic.id} location`,
              id: `${topic.id}-observation`,
              lightingSensitive: false,
            },
          ]
        : [],
    status:
      index < 3
        ? 'improvement'
        : index < 6
          ? 'strength'
          : index === 6
            ? 'optional'
            : index < 9
              ? 'not_assessable'
              : 'not_applicable',
    title: `${topic.id} title`,
    topicId: topic.id,
    topicLabel: topic.label,
  }),
);

const groups = groupMakeupFeedbackEvaluations(evaluations);

expectEqual(
  groups.improvements.length +
    groups.strengths.length +
    groups.optional.length +
    groups.notAssessable.length +
    groups.notApplicable.length,
  MAKEUP_FEEDBACK_TOPICS.length,
  'grouped topic count',
);
expectEqual(groups.optional.length, 1, 'optional count');
expectEqual(groups.notAssessable.length, 2, 'not assessable count');
expectEqual(
  getPriorityMakeupFeedbackEvaluation(evaluations)?.topicId,
  'brow',
  'first improvement wins when impacts tie',
);
expectEqual(
  getPriorityMakeupFeedbackEvaluation(
    evaluations.map(evaluation => ({
      ...evaluation,
      scoreImpact: evaluation.topicId === 'lens' ? 'high' : 'low',
    })),
  )?.topicId,
  'lens',
  'higher-impact item is prioritized within the improvement group',
);
const priorityEvaluation = getPriorityMakeupFeedbackEvaluation(evaluations)!;
const topicFallbackPoint = {
  actionLabel: '보완 포인트',
  actionSteps: priorityEvaluation.actionSteps,
  description: priorityEvaluation.description,
  id: 'topic-fallback',
  kind: priorityEvaluation.kind,
  title: priorityEvaluation.title,
  topicId: priorityEvaluation.topicId,
  topicLabel: priorityEvaluation.topicLabel,
};
const exactPoint = {
  ...topicFallbackPoint,
  evaluationId: priorityEvaluation.id,
  id: 'exact-evaluation-point',
};
expectEqual(
  getPriorityMakeupFeedbackPoint(evaluations, [topicFallbackPoint, exactPoint])?.id,
  'exact-evaluation-point',
  'exact evaluation id wins before same-topic fallback',
);
const improvementEvidence = getMakeupFeedbackEvidenceRows(groups.improvements[0]!);
const strengthEvidence = getMakeupFeedbackEvidenceRows(groups.strengths[0]!);
expectEqual(
  improvementEvidence[0]?.text,
  'brow claim (brow location)',
  'improvement evidence text',
);
expectEqual(
  strengthEvidence[0]?.text.includes('location'),
  true,
  'strength evidence includes location',
);
expectEqual(groups.notApplicable.some(evaluation => evaluation.topicId === 'lip'), true, 'not applicable lip');
const cameraActions = getMakeupFeedbackRetakeActionLabels('camera');
const galleryActions = getMakeupFeedbackRetakeActionLabels('gallery');
expectEqual(cameraActions.primary, '다시 촬영', 'camera primary action');
expectEqual(
  cameraActions.secondary,
  '앨범에서 다른 사진 선택',
  'camera secondary action',
);
expectEqual(galleryActions.primary, '다른 사진 선택', 'gallery primary action');
expectEqual(galleryActions.secondary, '카메라로 다시 촬영', 'gallery secondary action');
expectEqual(getMakeupFeedbackAnalysisSourceLabel('ai'), 'AI \uc2e4\ubd84\uc11d', 'AI source label');
expectEqual(getMakeupFeedbackAnalysisSourceLabel('mock'), '\ub370\ubaa8 \uc608\uc2dc', 'mock source label');
expectEqual(getMakeupFeedbackRecommendationLabel('ai'), 'AI \ucd94\ucc9c \ubc29\ubc95', 'AI recommendation label');
