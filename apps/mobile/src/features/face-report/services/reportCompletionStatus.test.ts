import type {ReportData} from '../reportTypes';
import {resolveReportCompletionStatus} from './reportCompletionStatus';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function report(
  overrides: Partial<ReportData>,
): ReportData {
  return {
    reportId: 'report-status-test',
    topBarTitle: '얼굴 분석 보고서',
    s1: {} as ReportData['s1'],
    s2: null,
    s3: null,
    s4: null,
    s5: null,
    s6: null,
    s7: null,
    s8: null,
    s9: null,
    footer: {disclaimer: '', cta: ''},
    ...overrides,
  };
}

const minimum = resolveReportCompletionStatus(
  report({
    generationStatus: 'loading',
    contentStatus: {
      narrativeStatus: 'processing',
      stylingStatus: 'processing',
    },
  }),
);
expectEqual(
  minimum.compactLabel,
  '1/3 · 기본 분석 완료 · 얼굴 해석 · 스타일링 분석 진행 중',
  'minimum report names both independently active generation stages',
);
expectEqual(minimum.complete, false, 'minimum report is incomplete');
expectEqual(
  minimum.stages[1]?.state,
  'active',
  'narrative stage reflects its backend status',
);
expectEqual(
  minimum.stages[2]?.state,
  'active',
  'styling stage reflects its backend status',
);

const progressive = resolveReportCompletionStatus(
  report({
    generationStatus: 'loading',
    contentStatus: {
      narrativeStatus: 'completed',
      stylingStatus: 'processing',
    },
  }),
);
expectEqual(
  progressive.compactLabel,
  '2/3 · 기본 분석 · 얼굴 해석 완료 · 스타일링 분석 진행 중',
  'progressive report shows which sections are already complete',
);
expectEqual(progressive.successfulCount, 2, 'progressive report counts successes');
expectEqual(
  progressive.currentLabel,
  '스타일링 분석 진행 중',
  'progressive report names the active work',
);

const complete = resolveReportCompletionStatus(
  report({
    contentStatus: {
      narrativeStatus: 'completed',
      stylingStatus: 'completed',
    },
  }),
);
expectEqual(
  complete.compactLabel,
  '보고서 생성 완료',
  'completed report says it is complete',
);
expectEqual(complete.complete, true, 'terminal stages complete the report');

const fallbackComplete = resolveReportCompletionStatus(
  report({
    contentStatus: {
      narrativeStatus: 'failed',
      stylingStatus: 'partial',
      sources: {narrative: 'template', styling: 'template'},
    },
  }),
);
expectEqual(
  fallbackComplete.complete,
  false,
  'fallback and partial stages are not labelled as full success',
);
expectEqual(fallbackComplete.failed, true, 'terminal issues remain visible');
expectEqual(
  fallbackComplete.stages[1]?.state,
  'fallback',
  'template narrative is labelled as a provided fallback',
);
expectEqual(
  fallbackComplete.stages[2]?.state,
  'partial',
  'partial styling keeps its actual terminal state',
);

const partialFailure = resolveReportCompletionStatus(
  report({
    generationStatus: 'failed',
    contentStatus: {
      narrativeStatus: 'completed',
      stylingStatus: 'failed',
      sources: {narrative: 'llm', styling: 'llm'},
    },
  }),
);
expectEqual(
  partialFailure.compactLabel,
  '2/3 성공 · 스타일링 분석 실패',
  'partial failure uses the selected compact wording',
);
expectEqual(
  partialFailure.displayState,
  'issues',
  'partial failure uses the terminal issue state',
);

const savedLegacy = resolveReportCompletionStatus(report({}));
expectEqual(
  savedLegacy.compactLabel,
  '보고서 생성 완료',
  'saved reports without stage metadata remain complete',
);
