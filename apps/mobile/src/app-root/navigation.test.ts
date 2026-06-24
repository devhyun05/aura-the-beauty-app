import {
  getARMakeupFilterInitialGuideMode,
  getAppShellHeaderCopy,
  getFooterTabTargetScreen,
  getHomeFaceDiagnosisTargetScreen,
  getImageAnalysisLoadingCompleteTargetScreen,
  getImageAnalysisReportCloseTargetScreen,
  getImageAnalysisReportCreateFilterTargetScreen,
  getSavedContentTargetScreen,
  getScreenChrome,
  getScreensByChrome,
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
  getImageAnalysisReportCreateFilterTargetScreen(),
  'arFilterStyle',
  'image analysis report create AR filter target',
);
expectEqual(
  getImageAnalysisReportCloseTargetScreen(),
  'home',
  'image analysis report close target',
);
expectEqual(
  getImageAnalysisLoadingCompleteTargetScreen(),
  'imageAnalysisReportDetail',
  'image analysis loading complete target',
);
expectEqual(
  getHomeFaceDiagnosisTargetScreen(),
  'tutorial',
  'home face diagnosis target',
);
expectEqual(
  getSavedContentTargetScreen(),
  'myPage',
  'saved content target',
);
expectEqual(
  getAppShellHeaderCopy('home').title,
  'AI AR Makeup',
  'home shell header title',
);
expectEqual(
  getAppShellHeaderCopy('home').subtitle,
  'MAKEUP GUIDE',
  'home shell header subtitle',
);
expectEqual(
  getAppShellHeaderCopy('custom').title,
  '추천 제품',
  'custom shell header title',
);
expectEqual(
  getAppShellHeaderCopy('custom').subtitle,
  'AI PRODUCT MATCH',
  'custom shell header subtitle',
);
expectEqual(
  getAppShellHeaderCopy('default').title,
  'AI AR Makeup',
  'default shell header title',
);
expectEqual(
  getAppShellHeaderCopy('default').subtitle,
  'MAKEUP GUIDE',
  'default shell header subtitle',
);
expectEqual(getScreenChrome('home'), 'shell', 'home chrome');
expectEqual(getScreenChrome('custom'), 'shell', 'custom chrome');
expectEqual(getScreenChrome('myPage'), 'shell', 'my page chrome');
expectEqual(getScreenChrome('profileEdit'), 'header', 'profile edit chrome');
expectEqual(
  getScreenChrome('imageAnalysisReportDetail'),
  'header',
  'image analysis report detail chrome',
);
expectEqual(getScreenChrome('faceCapture'), 'fullscreen', 'face capture chrome');
expectEqual(getScreenChrome('arMakeupFilter'), 'fullscreen', 'AR makeup filter chrome');
expectEqual(
  getScreenChrome('filterSaved'),
  'fullscreen',
  'filter saved chrome',
);
expectEqual(
  getScreensByChrome('shell').join(','),
  'home,custom,myPage',
  'shell chrome screens',
);
