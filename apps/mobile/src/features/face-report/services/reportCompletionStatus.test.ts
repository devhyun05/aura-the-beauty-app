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
  '측정 ✓  관찰 중  스타일 대기',
  'minimum report names the active and pending stages',
);
expectEqual(minimum.complete, false, 'minimum report is incomplete');

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
  '측정 ✓  관찰 ✓  스타일 중',
  'progressive report shows which sections are already complete',
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
  '측정 ✓  관찰 ✓  스타일 ✓ · 완료',
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
  true,
  'terminal fallback stages still complete the report',
);

const savedLegacy = resolveReportCompletionStatus(report({}));
expectEqual(
  savedLegacy.compactLabel,
  '측정 ✓  관찰 ✓  스타일 ✓ · 완료',
  'saved reports without stage metadata remain complete',
);
