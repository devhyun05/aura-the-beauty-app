import {
  getStatusBarStyleForNavigationState,
  resolveActiveRouteName,
} from './navigationState';
import {mainTabRoutes, rootStackRoutes} from './routeTypes';
import {
  getDetailRouteContextLabel,
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
expectEqual(
  mainTabRoutes.join(','),
  'HomeTab,ProfileTab,ConsultingTab',
  'main tab route order includes consulting',
);
expectEqual(
  rootStackRoutes.map(routeName => String(routeName)).includes('Magazine'),
  false,
  'root stack routes exclude magazine',
);
expectEqual(getRouteChrome('ProfileEdit').kind, 'detail', 'profile edit chrome');
expectEqual(getRouteChrome('ProfileEdit').category, 'form-edit', 'profile edit category');
expectEqual(getRouteChrome('MakeupFeedbackLoading').kind, 'detail', 'makeup feedback loading chrome');
expectEqual(getRouteChrome('MakeupFeedbackLoading').category, 'progress', 'makeup feedback loading category');
expectEqual(getRouteChrome('FaceAnalysisIntro').kind, 'detail', 'face analysis intro chrome');
expectEqual(getRouteChrome('HairAnalysisIntro').kind, 'detail', 'hair analysis intro chrome');
expectEqual(getRouteChrome('HairAnalysisCapture').kind, 'fullscreen', 'hair capture chrome');
expectEqual(
  getDetailRouteTitle('HairSimulationResult'),
  '헤어 합성 결과',
  'hair simulation result route title',
);
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
  getDetailRouteTitle('MakeupFeedbackResultsList'),
  '피드백 목록',
  'makeup feedback results list route title',
);
expectEqual(
  getDetailRouteTitle('MakeupRecipeList'),
  '레시피 목록',
  'makeup recipe list route title',
);
expectEqual(
  getDetailRouteContextLabel('FloatingActionSettings'),
  'QUICK ACTION',
  'floating action settings detail route context label',
);
expectEqual(
  getDetailRouteTitle('AppSettings'),
  '앱 환경설정',
  'app settings detail route title',
);
expectEqual(getDetailRouteTitle('Faq'), 'FAQ', 'FAQ detail route title');
expectEqual(getDetailRouteContextLabel('Faq'), 'SUPPORT', 'FAQ context label');
expectEqual(
  getDetailRouteTitle('AccountManagement'),
  '계정 관리',
  'account management detail route title',
);
expectEqual(
  getDetailRouteTitle('AccountDeletion'),
  '회원 탈퇴',
  'account deletion detail route title',
);
expectEqual(
  getDetailRouteTitle('Community'),
  '룩톡',
  'community detail route title',
);
expectEqual(
  getDetailRouteTitle('Consulting'),
  '컨설팅',
  'consulting detail route title',
);
expectEqual(getFooterTargetRoute('home'), 'HomeTab', 'home footer target');
expectEqual(getFooterTargetRoute('profile'), 'ProfileTab', 'profile footer target');
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
            {name: 'ConsultingTab'},
          ],
        },
      },
    ],
  }),
  'ConsultingTab',
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
