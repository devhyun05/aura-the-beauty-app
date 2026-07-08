/**
 * Offline mock — used when the dev API is unreachable (or
 * EXPO_PUBLIC_BEARD_SIM_USE_MOCK=1). Stage images reuse the input photo URI
 * so the result screen renders end-to-end without a server; the slider will
 * show no visual difference, which is expected and labeled in the lab app.
 */

import type {
  BeardSimulationResult,
  BeardSimulationStage,
  BeardSurvey,
} from '../types';

function mockGuard(stage: BeardSimulationStage) {
  return {
    passed: true,
    checks: [
      {id: 'mask_protect_overlap' as const, passed: true, value: 0.004, threshold: 0.02},
      {id: 'landmark_drift' as const, passed: true, value: 0.005, threshold: 0.015},
      {id: 'jawline_iou' as const, passed: true, value: 0.99, threshold: 0.97},
      {id: 'seam_score' as const, passed: true, value: 1.02, threshold: 1.35},
    ],
    mitigationsApplied: stage === 'strong' ? ['strength_down'] : [],
  };
}

export function buildMockBeardSimulationResult(
  photoUri: string,
  survey: BeardSurvey,
): BeardSimulationResult & {inputImageRef: string} {
  const stages: BeardSimulationStage[] = ['mild', 'medium', 'strong'];
  return {
    requestId: `mock-${Date.now()}`,
    createdAt: new Date().toISOString(),
    inputImageRef: photoUri,
    analysis: {
      beardType: survey.shavingState === 'dense' ? 'dense' : 'shadow_dominant',
      densityScore: 0.34,
      shadowScore: 0.71,
      regionCoverage: {mustache: 0.42, chin: 0.66, jaw: 0.28},
    },
    maskPackage: {
      imageWidth: 1024,
      imageHeight: 1365,
      encoding: 'png-gray8',
      masks: {
        hardHair: photoUri,
        beardShadow: photoUri,
        protect: photoUri,
        softBlend: photoUri,
      },
      regions: ['mustache', 'chin', 'mouth_side', 'jaw'],
      regionCoverage: {mustache: 0.42, chin: 0.66, jaw: 0.28},
      stats: {hardHairMean: 0.18, beardShadowMean: 0.31, protectOverlapRatio: 0.004},
    },
    stages: stages.map(stage => ({
      stage,
      imageRef: photoUri,
      guard: mockGuard(stage),
      paramsUsed: {mock: true},
    })),
    failures: [],
    consultQuestions: [
      '제 피부톤과 모발 굵기를 기준으로 어떤 시술 방식이 고려될 수 있는지 여쭤봐도 될까요?',
      '면도 후 푸른 그림자가 고민인데, 레이저 제모로 어느 정도 개선을 기대할 수 있을까요?',
    ],
    disclaimers: [
      '이 이미지는 참고용 합성 이미지이며 실제 시술 결과를 예측하지 않습니다.',
      '시술 결과는 개인의 모발·피부 상태에 따라 다릅니다. 정확한 상담은 의료 전문가와 진행하세요.',
    ],
  };
}

export async function mockSimulateBeardRemoval(
  photoUri: string,
  survey: BeardSurvey,
  delayMs = 1200,
): Promise<BeardSimulationResult & {inputImageRef: string}> {
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return buildMockBeardSimulationResult(photoUri, survey);
}
