import {
  appFeatureMenuSections,
  getAppFeatureMenuSectionLabels,
  getAppFeatureMenuTarget,
} from './appFeatureMenu';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const sectionLabels = getAppFeatureMenuSectionLabels();
const settingsSection = appFeatureMenuSections.find(section => section.id === 'settings');
const analysisSection = appFeatureMenuSections.find(section => section.id === 'analysis');
const mainSection = appFeatureMenuSections.find(section => section.id === 'main');
const makeupSection = appFeatureMenuSections.find(section => section.id === 'makeup');
const makeupFeedbackTarget = getAppFeatureMenuTarget('makeupFeedback');
const consultingTarget = getAppFeatureMenuTarget('consulting');
const communityTarget = getAppFeatureMenuTarget('community');
const appSettingsTarget = getAppFeatureMenuTarget('appSettings');
const makeupRecommendationTarget = getAppFeatureMenuTarget('makeupRecommendation');

expectEqual(
  sectionLabels.join(','),
  '주요 화면,메이크업 도구,분석과 추천,설정',
  'feature menu section order',
);
expectEqual(
  appFeatureMenuSections.flatMap(section => section.items).some(item => item.id === 'appSettings'),
  true,
  'feature menu includes app settings',
);
expectEqual(
  settingsSection?.items.map(item => item.label).join(','),
  '앱 환경설정',
  'settings menu keeps only the app settings entry',
);
expectEqual(
  analysisSection?.items.map(item => item.label).includes('매거진'),
  false,
  'analysis menu excludes magazine',
);
expectEqual(
  mainSection?.items.map(item => item.label).join(','),
  '홈,프로필,커뮤니티,컨설팅',
  'main menu labels include community and consulting',
);
expectEqual(
  makeupSection?.items.map(item => item.label).join(','),
  '메이크업 필터,메이크업 추출,메이크업 피드백',
  'makeup menu labels use makeup filter copy',
);
expectEqual(makeupFeedbackTarget.kind, 'root', 'makeup feedback menu target kind');
expectEqual(
  makeupFeedbackTarget.kind === 'root' ? makeupFeedbackTarget.routeName : null,
  'MakeupFeedbackAlbumUpload',
  'makeup feedback menu opens available feedback flow',
);
expectEqual(consultingTarget.kind, 'mainTab', 'consulting menu target kind');
expectEqual(
  consultingTarget.kind === 'mainTab' ? consultingTarget.routeName : null,
  'ConsultingTab',
  'consulting menu opens consulting tab',
);
expectEqual(communityTarget.kind, 'root', 'community menu target kind');
expectEqual(
  communityTarget.kind === 'root' ? communityTarget.routeName : null,
  'Community',
  'community menu preserves community root route',
);
expectEqual(appSettingsTarget.kind, 'root', 'app settings target kind');
expectEqual(
  appSettingsTarget.kind === 'root' ? appSettingsTarget.routeName : null,
  'AppSettings',
  'app settings menu route',
);
expectEqual(
  makeupRecommendationTarget.kind,
  'root',
  'makeup recommendation target kind',
);
expectEqual(
  makeupRecommendationTarget.kind === 'root' ? makeupRecommendationTarget.routeName : null,
  'MakeupRecommendation',
  'makeup recommendation target route',
);
expectEqual(
  analysisSection?.items.some(item => item.label === 'AI 메이크업 추천'),
  true,
  'analysis menu includes makeup recommendation',
);
