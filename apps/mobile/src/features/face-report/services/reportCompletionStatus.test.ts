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
  '기본 분석 완료, 얼굴 특징 해석 진행 중, 스타일 추천 진행 중',
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
  '기본 분석 완료, 얼굴 특징 해석 완료, 스타일 추천 진행 중',
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
  '기본 분석 완료, 얼굴 특징 해석 완료, 스타일 추천 완료 · 보고서 준비 완료',
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

const savedLegacy = resolveReportCompletionStatus(report({}));
expectEqual(
  savedLegacy.compactLabel,
  '기본 분석 완료, 얼굴 특징 해석 완료, 스타일 추천 완료 · 보고서 준비 완료',
  'saved reports without stage metadata remain complete',
);
