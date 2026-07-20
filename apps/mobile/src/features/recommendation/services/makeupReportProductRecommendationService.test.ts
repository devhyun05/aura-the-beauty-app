import {
  buildMakeupReportProductsPath,
  buildMakeupReportProductsRefreshPath,
  normalizeMakeupReportProductRecommendations,
  resolveMakeupReportSelection,
  sortMakeupReportsLatestFirst,
} from './makeupReportProductRecommendationService';
import {buildMakeupReportTargetPresentation} from './makeupReportTargetPresentation';
import {normalizeProductMatchRate, sortCatalogProductsByMatchRate} from './productMatchPresentation';
import type {CatalogProduct} from '../types';
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
expectEqual(
  buildMakeupReportProductsPath('report/id', 'look one', 8, ['lip', 'shadow', 'lip']),
  '/products/recommendations/makeup-reports/report%2Fid?lookId=look+one&categories=lip%2Cshadow&perCategoryLimit=8',
  'detail path scopes the stored snapshot to unique requested categories',
);

const shadowTarget = buildMakeupReportTargetPresentation('shadow', {
  category: 'shadow',
  colors: [
    {role: 'main', name: '로즈 브라운', hex: '#aa6677'},
    {role: 'point', name: '딥 플럼', hex: '#552244'},
  ],
  finish: 'shimmer',
  texture: 'powder',
});
const linerTarget = buildMakeupReportTargetPresentation('liner', {
  category: 'liner',
  colorName: '블랙 브라운',
  colorHex: '#332211',
  finish: 'matte',
  texture: 'pencil',
});
const baseTarget = buildMakeupReportTargetPresentation('base', {
  category: 'base',
  colorName: '표시하면 안 되는 베이스 색',
  colorHex: '#EFEFEF',
  finish: 'glow',
  texture: 'cream',
});
expectEqual(shadowTarget.swatches.map(item => item.hex).join(','), '#AA6677,#552244', 'shadow target keeps its own verified colors');
expectEqual(linerTarget.swatches.map(item => item.hex).join(','), '#332211', 'liner target remains separate from shadow');
expectEqual(baseTarget.label, '피니시·제형 기준', 'base target is described without a shade claim');
expectEqual(baseTarget.swatches.length, 0, 'base target never renders a synthetic color swatch');

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

expectEqual(normalizeProductMatchRate(92.4), 92, 'match rate rounds finite scores');
expectEqual(normalizeProductMatchRate(118), 100, 'match rate clamps high scores');
expectEqual(normalizeProductMatchRate(-5), 0, 'match rate clamps low scores');
expectEqual(normalizeProductMatchRate('95'), null, 'match rate rejects non-server numeric strings');

const productBase: Omit<CatalogProduct, 'productId' | 'productName' | 'matchRate'> = {
  brandName: '테스트',
  category: 'lip',
  price: {amount: 1000, currency: 'KRW'},
  viewerState: {liked: false},
};
const sortedByMatch = sortCatalogProductsByMatchRate([
  {...productBase, productId: 'low', productName: '낮음', matchRate: 71},
  {...productBase, productId: 'missing', productName: '점수 없음'},
  {...productBase, productId: 'high', productName: '높음', matchRate: 93},
]);
expectEqual(
  sortedByMatch.map(product => product.productId).join(','),
  'high,low,missing',
  'makeup report products sort by real server matchRate with missing scores last',
);
