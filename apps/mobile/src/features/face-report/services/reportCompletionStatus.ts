import type {ReportData} from '../reportTypes';

export type ReportCompletionStageState = 'complete' | 'active' | 'pending';

export interface ReportCompletionStage {
  key: 'measurement' | 'narrative' | 'styling';
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

const TERMINAL_STAGE_STATUSES = new Set(['completed', 'partial', 'failed']);

function isTerminal(status: string | undefined): boolean {
  return status != null && TERMINAL_STAGE_STATUSES.has(status);
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
    data.contentStatus?.narrativeStatus ||
      data.contentStatus?.stylingStatus ||
      data.generationStatus,
  );
  const failed = data.generationStatus === 'failed';
  const narrativeComplete = hasStageMetadata
    ? isTerminal(data.contentStatus?.narrativeStatus)
    : true;
  const stylingComplete = hasStageMetadata
    ? isTerminal(data.contentStatus?.stylingStatus)
    : true;
  const complete = !failed && narrativeComplete && stylingComplete;

  const stages: ReportCompletionStage[] = [
    {key: 'measurement', label: '측정', state: 'complete'},
    {
      key: 'narrative',
      label: '관찰',
      state: narrativeComplete ? 'complete' : failed ? 'pending' : 'active',
    },
    {
      key: 'styling',
      label: '스타일',
      state: stylingComplete
        ? 'complete'
        : failed || !narrativeComplete
          ? 'pending'
          : 'active',
    },
  ];

  const stageText = stages
    .map(stage => {
      if (stage.state === 'complete') return `${stage.label} ✓`;
      if (stage.state === 'active') return `${stage.label} 중`;
      return `${stage.label} 대기`;
    })
    .join('  ');
  const suffix = complete ? ' · 완료' : failed ? ' · 생성 중단' : '';

  return {
    complete,
    failed,
    stages,
    compactLabel: `${stageText}${suffix}`,
    accessibilityLabel: `보고서 생성 상태: ${stageText}${suffix}`,
  };
}
