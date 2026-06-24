import {
  getAnalysisLoadingCompleteTargetScreen,
  getAnalysisReportCreateFilterTargetScreen,
  getARMakeupFilterInitialGuideMode,
  getFooterTabTargetScreen,
} from './navigation';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(getFooterTabTargetScreen('home'), 'home', 'home tab target');
expectEqual(
  getFooterTabTargetScreen('capture'),
  'arMakeupFilter',
  'capture tab target',
);
expectEqual(getFooterTabTargetScreen('custom'), 'custom', 'custom tab target');
expectEqual(
  getARMakeupFilterInitialGuideMode(),
  'basic',
  'AR makeup filter initial guide mode',
);
expectEqual(
  getAnalysisReportCreateFilterTargetScreen(),
  'arFilterStyle',
  'analysis report create AR filter target',
);
expectEqual(
  getAnalysisLoadingCompleteTargetScreen(),
  'analysisReportDetail',
  'analysis loading complete target',
);
