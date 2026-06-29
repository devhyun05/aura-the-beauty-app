import appConfig from '../../../app.json';
import {
  APP_DEEP_LINK_SCHEME,
  getMissingMainTabLinkingRoutes,
  getMissingRootStackLinkingRoutes,
  getUnknownMainTabLinkingRoutes,
  getUnknownRootStackLinkingRoutes,
  navigationLinking,
  rootStackLinkingScreens,
} from './linkingConfig';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

type TypeEquals<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends
  (<Value>() => Value extends Expected ? 1 : 2)
    ? true
    : false;

type ExpectType<Condition extends true> = Condition;

type FaceAnalysisReportDetailPathContract = ExpectType<
  TypeEquals<
    typeof rootStackLinkingScreens.FaceAnalysisReportDetail,
    'face-analysis-report/:reportId?'
  >
>;
type MakeupCorrectionTipPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.MakeupCorrectionTip, 'makeup-correction-tip/:pointId'>
>;
type MakeupLookListPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.MakeupLookList, 'makeup-look-list'>
>;
type HomeFilterStorePathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.HomeFilterStore, 'filter-store'>
>;
type SavedMakeupListPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.SavedMakeupList, 'saved-makeup-list'>
>;
type ReferenceMakeupExtractionUploadPathContract = ExpectType<
  TypeEquals<
    typeof rootStackLinkingScreens.ReferenceMakeupExtractionUpload,
    'reference-makeup-extraction-upload'
  >
>;
type MakeupFilterSavePathContract = ExpectType<
  TypeEquals<
    typeof rootStackLinkingScreens.MakeupFilterSave,
    'makeup-filter-save'
  >
>;
type MakeupFilterSaveCompletePathContract = ExpectType<
  TypeEquals<
    typeof rootStackLinkingScreens.MakeupFilterSaveComplete,
    'makeup-filter-save-complete'
  >
>;
type MakeupRecipeDetailPathContract = ExpectType<
  TypeEquals<
    typeof rootStackLinkingScreens.MakeupRecipeDetail,
    'makeup-recipe-detail'
  >
>;
type MakeupRecipeSaveCompletePathContract = ExpectType<
  TypeEquals<
    typeof rootStackLinkingScreens.MakeupRecipeSaveComplete,
    'makeup-recipe-save-complete'
  >
>;

expectEqual(
  appConfig.expo.scheme,
  APP_DEEP_LINK_SCHEME,
  'Expo app scheme matches navigation deep link scheme',
);
expectEqual(
  navigationLinking.prefixes.includes(`${APP_DEEP_LINK_SCHEME}://`),
  true,
  'navigation prefixes include native app scheme',
);
expectEqual(
  navigationLinking.prefixes.includes('exp://127.0.0.1:8082/--/'),
  true,
  'navigation prefixes include local Expo dev URL',
);
expectEqual(
  getMissingRootStackLinkingRoutes().join(','),
  '',
  'all root stack routes have linking paths',
);
expectEqual(
  getUnknownRootStackLinkingRoutes().join(','),
  '',
  'linking config has no unknown root stack routes',
);
expectEqual(
  getMissingMainTabLinkingRoutes().join(','),
  '',
  'all main tab routes have linking paths',
);
expectEqual(
  getUnknownMainTabLinkingRoutes().join(','),
  '',
  'linking config has no unknown main tab routes',
);
expectEqual(
  navigationLinking.config?.screens?.FaceAnalysisReportDetail,
  'face-analysis-report/:reportId?',
  'face analysis report detail path preserves optional report id',
);
expectEqual(
  navigationLinking.config?.screens?.MakeupCorrectionTip,
  'makeup-correction-tip/:pointId',
  'makeup correction tip path preserves required point id',
);
expectEqual(
  navigationLinking.config?.screens?.MakeupLookList,
  'makeup-look-list',
  'makeup look list path uses look naming',
);
expectEqual(
  navigationLinking.config?.screens?.HomeFilterStore,
  'filter-store',
  'filter store path uses home store naming',
);
expectEqual(
  navigationLinking.config?.screens?.SavedMakeupList,
  'saved-makeup-list',
  'saved makeup list path uses saved makeup naming',
);
expectEqual(
  navigationLinking.config?.screens?.ReferenceMakeupExtractionUpload,
  'reference-makeup-extraction-upload',
  'reference makeup extraction upload path uses extraction naming',
);
expectEqual(
  navigationLinking.config?.screens?.MakeupFilterSave,
  'makeup-filter-save',
  'makeup filter save path uses screen-level route naming',
);
expectEqual(
  navigationLinking.config?.screens?.MakeupFilterSaveComplete,
  'makeup-filter-save-complete',
  'makeup filter save complete path distinguishes completion route',
);
expectEqual(
  navigationLinking.config?.screens?.MakeupRecipeDetail,
  'makeup-recipe-detail',
  'makeup recipe detail path uses reusable recipe naming',
);
expectEqual(
  navigationLinking.config?.screens?.MakeupRecipeSaveComplete,
  'makeup-recipe-save-complete',
  'makeup recipe save complete path uses reusable recipe naming',
);
