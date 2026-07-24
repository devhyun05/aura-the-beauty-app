import type {ReportData} from '../reportTypes';

export type ReportCompletionStageState =
  | 'complete'
  | 'active'
  | 'pending'
  | 'partial'
  | 'fallback'
  | 'failed';

export interface ReportCompletionStage {
  key: 'core' | 'narrative' | 'styling';
  label: string;
  state: ReportCompletionStageState;
}

export interface ReportCompletionStatus {
  complete: boolean;
  completedLabels: string[];
  currentLabel?: string;
  displayState: 'complete' | 'generating' | 'issues';
  failed: boolean;
  issueLabel?: string;
  stages: ReportCompletionStage[];
  successfulCount: number;
  totalCount: number;
  compactLabel: string;
  accessibilityLabel: string;
}

function resolveStageState({
  failed,
  hasStageMetadata,
  source,
  status,
}: {
  failed: boolean;
  hasStageMetadata: boolean;
  source?: 'llm' | 'template';
  status?: string;
}): ReportCompletionStageState {
  if (!hasStageMetadata) return 'complete';
  if (status === 'completed') return 'complete';
  if (status === 'partial') return 'partial';
  if (status === 'failed') return source === 'template' ? 'fallback' : 'failed';
  if (failed) return 'failed';
  if (status === 'processing') return 'active';
  if (status === 'pending' || !status) return 'pending';
  return 'active';
}

function stageStateLabel(state: ReportCompletionStageState): string {
  if (state === 'complete') return '완료';
  if (state === 'active') return '진행 중';
  if (state === 'pending') return '대기';
  if (state === 'partial') return '일부 완료';
  if (state === 'fallback') return '기본 내용 제공';
  return '중단';
}

/**
 * Turns backend content-stage metadata into a deliberately quiet header status.
 * Reports saved before progressive generation existed have no metadata, so they
 * are treated as already complete instead of looking permanently unfinished.
 */
export function resolveReportCompletionStatus(
  data: ReportData,
): ReportCompletionStatus {
  const hasStageMetadata = Boolean(
    data.contentStatus?.coreReadyAt ||
      data.contentStatus?.narrativeStatus ||
      data.contentStatus?.stylingStatus ||
      data.generationStatus,
  );
  const generationFailed = data.generationStatus === 'failed';
  const coreState: ReportCompletionStageState =
    !data.s2 || data.s2.hairlineMissing ? 'partial' : 'complete';

  const stages: ReportCompletionStage[] = [
    {key: 'core', label: '기본 분석', state: coreState},
    {
      key: 'narrative',
      label: '얼굴·피부 해석',
      state: resolveStageState({
        failed: generationFailed,
        hasStageMetadata,
        source: data.contentStatus?.sources?.narrative,
        status: data.contentStatus?.narrativeStatus,
      }),
    },
    {
      key: 'styling',
      label: '스타일 추천',
      state: resolveStageState({
        failed: generationFailed,
        hasStageMetadata,
        source: data.contentStatus?.sources?.styling,
        status: data.contentStatus?.stylingStatus,
      }),
    },
  ];
  const successfulStages = stages.filter(stage => stage.state === 'complete');
  const issueStages = stages.filter(stage =>
    ['partial', 'fallback', 'failed'].includes(stage.state),
  );
  const activeStages = stages.filter(stage => stage.state === 'active');
  const pendingStages = stages.filter(stage => stage.state === 'pending');
  const complete = successfulStages.length === stages.length;
  const settled = activeStages.length === 0 && pendingStages.length === 0;
  const displayState = complete
    ? 'complete'
    : settled && issueStages.length > 0
      ? 'issues'
      : 'generating';
  const completedLabels = successfulStages.map(stage => stage.label);
  const currentStages = activeStages.length > 0 ? activeStages : pendingStages;
  const currentLabel =
    currentStages.length > 0
      ? `${currentStages.map(stage => stage.label).join(' · ')} ${
          activeStages.length > 0 ? '진행 중' : '대기'
        }`
      : undefined;
  const issueDetails = issueStages.map(stage => {
    if (stage.state === 'partial') return `${stage.label} 일부 생성`;
    if (stage.state === 'fallback') return `${stage.label} 기본 내용 제공`;
    return `${stage.label} 실패`;
  });
  const issueLabel =
    issueDetails.length > 1
      ? `${issueDetails[0]} 외 ${issueDetails.length - 1}개`
      : issueDetails[0];

  const stageText = stages
    .map(stage => `${stage.label} ${stageStateLabel(stage.state)}`)
    .join(', ');
  const compactLabel =
    displayState === 'complete'
      ? '보고서 생성 완료'
      : displayState === 'issues'
        ? `${successfulStages.length}/${stages.length} 성공 · ${issueLabel}`
        : `${successfulStages.length}/${stages.length}${
            completedLabels.length > 0
              ? ` · ${completedLabels.join(' · ')} 완료`
              : ''
          }${currentLabel ? ` · ${currentLabel}` : ''}`;

  return {
    complete,
    completedLabels,
    currentLabel,
    displayState,
    failed: displayState === 'issues',
    issueLabel,
    stages,
    successfulCount: successfulStages.length,
    totalCount: stages.length,
    compactLabel,
    accessibilityLabel: `보고서 생성 상태: ${stageText}. ${compactLabel}`,
  };
}
