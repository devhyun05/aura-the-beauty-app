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
type HairRemovalSimulationPathContract = ExpectType<
  TypeEquals<
    typeof rootStackLinkingScreens.HairRemovalSimulation,
    'hair-removal-simulation'
  >
>;
type HairAnalysisIntroPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.HairAnalysisIntro, 'hair-analysis'>
>;
type HairSimulationLoadingPathContract = ExpectType<
  TypeEquals<
    typeof rootStackLinkingScreens.HairSimulationLoading,
    'hair-analysis/simulation-loading/:analysisId/:styleId'
  >
>;
type SavedHairSimulationsPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.SavedHairSimulations, 'hair-analysis/saved'>
>;
type SavedMakeupListPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.SavedMakeupList, 'saved-makeup-list'>
>;
type ProductRecommendationPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.ProductRecommendation, 'product-recommendation'>
>;
type MakeupRecommendationPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.MakeupRecommendation, 'makeup-recommendation'>
>;
type FaceAnalysisIntroPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.FaceAnalysisIntro, 'face-analysis-intro'>
>;
type FloatingActionSettingsPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.FloatingActionSettings, 'floating-action-settings'>
>;
type AppSettingsPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.AppSettings, 'app-settings'>
>;
type FaqPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.Faq, 'faq'>
>;
type AccountManagementPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.AccountManagement, 'account-management'>
>;
type AccountDeletionPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.AccountDeletion, 'account-deletion'>
>;
type CommunityPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.Community, 'community'>
>;
type CommunityThreadDetailPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.CommunityThreadDetail, 'community/thread/:threadId'>
>;
type CommunityUserProfilePathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.CommunityUserProfile, 'community/user/:userId'>
>;
type CommunityThreadCreatePathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.CommunityThreadCreate, 'community/create'>
>;
type CommunityThreadEditPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.CommunityThreadEdit, 'community/thread/:threadId/edit'>
>;
type ConsultingPathContract = ExpectType<
  TypeEquals<typeof rootStackLinkingScreens.Consulting, 'consulting'>
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
type MakeupFeedbackResultsListPathContract = ExpectType<
  TypeEquals<
    typeof rootStackLinkingScreens.MakeupFeedbackResultsList,
    'makeup-feedback-results'
  >
>;
type MakeupRecipeListPathContract = ExpectType<
  TypeEquals<
    typeof rootStackLinkingScreens.MakeupRecipeList,
    'makeup-recipe-list'
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
  rootStackLinkingScreens.MakeupRecommendation,
  'makeup-recommendation',
  'makeup recommendation path',
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
  Object.keys(rootStackLinkingScreens).includes('Magazine'),
  false,
  'linking config excludes magazine path',
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
  navigationLinking.config?.screens?.HairRemovalSimulation,
  'hair-removal-simulation',
  'hair removal simulation path uses feature naming',
);
expectEqual(
  navigationLinking.config?.screens?.ProductRecommendation,
  'product-recommendation',
  'product recommendation path uses product naming',
);
expectEqual(
  navigationLinking.config?.screens?.FaceAnalysisIntro,
  'face-analysis-intro',
  'face analysis intro path uses analysis naming',
);
expectEqual(
  navigationLinking.config?.screens?.FloatingActionSettings,
  'floating-action-settings',
  'floating action settings path uses settings naming',
);
expectEqual(
  navigationLinking.config?.screens?.AppSettings,
  'app-settings',
  'app settings path uses settings naming',
);
expectEqual(
  navigationLinking.config?.screens?.Faq,
  'faq',
  'FAQ path uses support naming',
);
expectEqual(
  navigationLinking.config?.screens?.AccountManagement,
  'account-management',
  'account management path uses account naming',
);
expectEqual(
  navigationLinking.config?.screens?.AccountDeletion,
  'account-deletion',
  'account deletion path uses account naming',
);
expectEqual(
  navigationLinking.config?.screens?.Community,
  'community',
  'community path uses community naming',
);
expectEqual(
  navigationLinking.config?.screens?.CommunityThreadDetail,
  'community/thread/:threadId',
  'community thread detail path preserves required thread id',
);
expectEqual(
  navigationLinking.config?.screens?.CommunityThreadCreate,
  'community/create',
  'community create path uses create naming',
);
expectEqual(
  navigationLinking.config?.screens?.CommunityThreadEdit,
  'community/thread/:threadId/edit',
  'community thread edit path preserves required thread id',
);
expectEqual(
  navigationLinking.config?.screens?.Consulting,
  'consulting',
  'consulting path uses consulting naming',
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
  navigationLinking.config?.screens?.MakeupFeedbackResultsList,
  'makeup-feedback-results',
  'makeup feedback results list path uses document list naming',
);
expectEqual(
  navigationLinking.config?.screens?.MakeupRecipeList,
  'makeup-recipe-list',
  'makeup recipe list path uses reusable recipe naming',
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
