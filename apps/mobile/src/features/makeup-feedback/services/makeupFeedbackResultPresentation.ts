import type {
  MakeupFeedbackAnalysisSource,
  MakeupFeedbackEvaluation,
  MakeupFeedbackPhotoSource,
} from '../types';

export type MakeupFeedbackEvaluationGroups = {
  improvements: MakeupFeedbackEvaluation[];
  notApplicable: MakeupFeedbackEvaluation[];
  notAssessable: MakeupFeedbackEvaluation[];
  optional: MakeupFeedbackEvaluation[];
  strengths: MakeupFeedbackEvaluation[];
};

const analysisSourceLabels: Record<MakeupFeedbackAnalysisSource, string> = {
  ai: 'AI 실분석',
  server: '서버 분석',
  server_fallback: '서버 기본 분석',
  mock: '데모 예시',
};

const recommendationLabels: Record<MakeupFeedbackAnalysisSource, string> = {
  ai: 'AI 추천 방법',
  server: '서버 추천 방법',
  server_fallback: '기본 추천 방법',
  mock: '데모 추천 방법',
};

export function getMakeupFeedbackAnalysisSourceLabel(
  source: MakeupFeedbackAnalysisSource,
): string {
  return analysisSourceLabels[source];
}

export function getMakeupFeedbackRecommendationLabel(
  source: MakeupFeedbackAnalysisSource,
): string {
  return recommendationLabels[source];
}
export function getMakeupFeedbackEvidenceRows(
  evaluation: MakeupFeedbackEvaluation,
): Array<{id: string; text: string}> {
  return (evaluation.observations ?? []).map(observation => ({
    id: observation.id,
    text: `${observation.claim} (${observation.evidenceLocation})`,
  }));
}



export function getMakeupFeedbackRetakeActionLabels(
  photoSource: MakeupFeedbackPhotoSource,
) {
  return photoSource === 'camera'
    ? {
        primary: '다시 촬영',
        secondary: '앨범에서 다른 사진 선택',
      }
    : {
        primary: '다른 사진 선택',
        secondary: '카메라로 다시 촬영',
      };
}


export function groupMakeupFeedbackEvaluations(
  evaluations: readonly MakeupFeedbackEvaluation[],
): MakeupFeedbackEvaluationGroups {
  return evaluations.reduce<MakeupFeedbackEvaluationGroups>(
    (groups, evaluation) => {
      if (evaluation.status === 'improvement') {
        groups.improvements.push(evaluation);
      } else if (evaluation.status === 'strength') {
        groups.strengths.push(evaluation);
      } else if (evaluation.status === 'optional') {
        groups.optional.push(evaluation);
      } else if (evaluation.status === 'not_assessable') {
        groups.notAssessable.push(evaluation);
      } else {
        groups.notApplicable.push(evaluation);
      }

      return groups;
    },
    {
      improvements: [],
      notApplicable: [],
      notAssessable: [],
      optional: [],
      strengths: [],
    },
  );
}
