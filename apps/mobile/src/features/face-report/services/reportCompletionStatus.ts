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
  failed: boolean;
  stages: ReportCompletionStage[];
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
  if (status === 'processing') return 'active';
  if (status === 'pending' || !status) return failed ? 'failed' : 'pending';
  return failed ? 'failed' : 'active';
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
  const failed = data.generationStatus === 'failed';

  const stages: ReportCompletionStage[] = [
    {key: 'core', label: '기본 분석', state: 'complete'},
    {
      key: 'narrative',
      label: '얼굴 특징 해석',
      state: resolveStageState({
        failed,
        hasStageMetadata,
        source: data.contentStatus?.sources?.narrative,
        status: data.contentStatus?.narrativeStatus,
      }),
    },
    {
      key: 'styling',
      label: '스타일 추천',
      state: resolveStageState({
        failed,
        hasStageMetadata,
        source: data.contentStatus?.sources?.styling,
        status: data.contentStatus?.stylingStatus,
      }),
    },
  ];
  const complete =
    !failed &&
    stages.every(stage =>
      ['complete', 'partial', 'fallback'].includes(stage.state),
    );

  const stageText = stages
    .map(stage => `${stage.label} ${stageStateLabel(stage.state)}`)
    .join(', ');
  const suffix = complete ? ' · 보고서 준비 완료' : failed ? ' · 생성 중단' : '';

  return {
    complete,
    failed,
    stages,
    compactLabel: `${stageText}${suffix}`,
    accessibilityLabel: `보고서 생성 상태: ${stageText}${suffix}`,
  };
}
