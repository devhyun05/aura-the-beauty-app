import {
  buildMakeupReportProductsPath,
  buildMakeupReportProductsRefreshPath,
  normalizeMakeupReportProductRecommendations,
  resolveMakeupReportSelection,
  sortMakeupReportsLatestFirst,
} from './makeupReportProductRecommendationService';
import type {MakeupReportRecommendationReport} from './makeupReportProductRecommendationTypes';

function expectEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function report(
  reportId: string,
  createdAt: string,
  lookId = `${reportId}-look`,
): MakeupReportRecommendationReport {
  return {
    reportId,
    scenarioText: `${reportId} 상황`,
    createdAt,
    imageStatus: 'ready',
    looks: lookId ? [{
      lookId,
      role: 'anchor',
      title: `${reportId} 룩`,
      summary: '요약',
      imageUrl: null,
      palette: [],
      targets: [],
    }] : [],
  };
}

expectEqual(
  buildMakeupReportProductsPath('report/id', 'look one', 99),
  '/products/recommendations/makeup-reports/report%2Fid?lookId=look+one&perCategoryLimit=8',
  'detail path encodes opaque ids and clamps limit',
);
expectEqual(
  buildMakeupReportProductsRefreshPath('report/id', 'look one'),
  '/products/recommendations/makeup-reports/report%2Fid/refresh?lookId=look+one',
  'refresh path encodes the selected report and look',
);

const normalizedLegacy = normalizeMakeupReportProductRecommendations({
  report: report('legacy', '2026-07-01T00:00:00.000Z'),
  selectedLook: report('legacy', '2026-07-01T00:00:00.000Z').looks[0],
  groups: [],
});
expectEqual(normalizedLegacy.status, 'ready', 'legacy responses remain displayable');
expectEqual(normalizedLegacy.snapshot.status, 'ready', 'legacy responses get a ready snapshot');
const normalizedPending = normalizeMakeupReportProductRecommendations({
  snapshot: {status: 'pending', revision: 1},
});
expectEqual(normalizedPending.status, 'pending', 'pending snapshot status drives polling');
expectEqual(normalizedPending.snapshot.revision, 1, 'snapshot revision is retained');

const ordered = sortMakeupReportsLatestFirst([
  report('older', '2026-06-01T00:00:00.000Z'),
  report('invalid-date', 'not-a-date'),
  report('newer', '2026-07-01T00:00:00.000Z'),
  report('no-looks', '2026-08-01T00:00:00.000Z', ''),
]);
expectEqual(ordered.map(item => item.reportId).join(','), 'newer,older,invalid-date', 'latest usable report ordering');
expectEqual(
  resolveMakeupReportSelection(ordered, 'older', 'newer')?.reportId,
  'older',
  'preferred report wins',
);
expectEqual(
  resolveMakeupReportSelection(ordered, 'missing', 'older')?.reportId,
  'older',
  'current report is preserved when preferred is unavailable',
);
expectEqual(
  resolveMakeupReportSelection(ordered)?.reportId,
  'newer',
  'latest report is the default',
);
