import {
  getStatusBarStyleForNavigationState,
  resolveActiveRouteName,
} from './navigationState';
import {
  getFooterTargetRoute,
  getDetailRouteTitle,
  getRouteChrome,
  getRoutesByDepth,
} from './routeChrome';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(getRouteChrome('HomeTab').kind, 'mainTab', 'home tab chrome');
expectEqual(getRouteChrome('HomeTab').depth, 'main', 'home tab depth');
expectEqual(getRouteChrome('ProfileEdit').kind, 'detail', 'profile edit chrome');
expectEqual(getRouteChrome('ProfileEdit').category, 'form-edit', 'profile edit category');
expectEqual(getRouteChrome('MakeupFeedbackLoading').kind, 'detail', 'makeup feedback loading chrome');
expectEqual(getRouteChrome('MakeupFeedbackLoading').category, 'progress', 'makeup feedback loading category');
expectEqual(getRouteChrome('FaceAnalysisIntro').kind, 'detail', 'face analysis intro chrome');
expectEqual(
  getDetailRouteTitle('FaceAnalysisIntro'),
  '얼굴 분석',
  'face analysis intro detail route title',
);
expectEqual(getRouteChrome('ARFilter').kind, 'fullscreen', 'AR chrome');
expectEqual(getRouteChrome('ARFilter').depth, 'immersive', 'AR depth');
expectEqual(
  getDetailRouteTitle('FaceAnalysisReportDetail'),
  '맞춤 분석 보고서',
  'detail route title',
);
expectEqual(
  getDetailRouteTitle('HomeFilterStore'),
  '필터 스토어',
  'home filter store detail route title',
);
expectEqual(
  getDetailRouteTitle('Magazine'),
  '매거진',
  'magazine detail route title',
);
expectEqual(
  getDetailRouteTitle('SavedMakeupList'),
  '저장된 메이크업',
  'saved makeup list detail route title',
);
expectEqual(
  getDetailRouteTitle('ProductRecommendation'),
  '추천 제품',
  'product recommendation detail route title',
);
expectEqual(
  getDetailRouteTitle('FloatingActionSettings'),
  '빠른 실행 설정',
  'floating action settings detail route title',
);
expectEqual(
  getDetailRouteTitle('AppSettings'),
  '앱 환경설정',
  'app settings detail route title',
);
expectEqual(
  getDetailRouteTitle('Community'),
  '커뮤니티',
  'community detail route title',
);
expectEqual(
  getDetailRouteTitle('Consulting'),
  '컨설팅',
  'consulting detail route title',
);
expectEqual(getFooterTargetRoute('home'), 'HomeTab', 'home footer target');
expectEqual(getFooterTargetRoute('profile'), 'ProfileTab', 'profile footer target');
expectEqual(getFooterTargetRoute('community'), 'CommunityTab', 'community footer target');
expectEqual(getFooterTargetRoute('consulting'), 'ConsultingTab', 'consulting footer target');
expectEqual(
  getRoutesByDepth('terminal').join(','),
  'MakeupFilterSaveComplete,MakeupRecipeSaveComplete',
  'terminal route order',
);
expectEqual(
  getRouteChrome('ReferenceMakeupExtractionUpload').kind,
  'detail',
  'reference makeup extraction upload chrome',
);
expectEqual(
  resolveActiveRouteName({
    index: 0,
    routes: [
      {
        name: 'MainTabs',
        state: {
          index: 2,
          routes: [
            {name: 'HomeTab'},
            {name: 'ProfileTab'},
            {name: 'CommunityTab'},
            {name: 'ConsultingTab'},
          ],
        },
      },
    ],
  }),
  'CommunityTab',
  'nested active route',
);
expectEqual(
  getStatusBarStyleForNavigationState({
    index: 0,
    routes: [{name: 'MakeupFeedbackCapture'}],
  }),
  'light',
  'immersive status bar style',
);
expectEqual(
  getStatusBarStyleForNavigationState({
    index: 0,
    routes: [
      {
        name: 'MainTabs',
        state: {
          index: 0,
          routes: [{name: 'HomeTab'}],
        },
      },
    ],
  }),
  'dark',
  'main tab status bar style',
);
