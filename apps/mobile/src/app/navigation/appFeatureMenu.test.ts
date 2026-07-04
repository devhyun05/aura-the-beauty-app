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
const makeupFeedbackTarget = getAppFeatureMenuTarget('makeupFeedback');
const appSettingsTarget = getAppFeatureMenuTarget('appSettings');

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
expectEqual(settingsSection?.items.map(item => item.label).join(','), '빠른 실행 설정,프로필 수정,앱 환경설정', 'settings menu labels');
expectEqual(makeupFeedbackTarget.kind, 'root', 'makeup feedback menu target kind');
expectEqual(
  makeupFeedbackTarget.kind === 'root' ? makeupFeedbackTarget.routeName : null,
  'MakeupFeedbackAlbumUpload',
  'makeup feedback menu opens available feedback flow',
);
expectEqual(appSettingsTarget.kind, 'root', 'app settings target kind');
expectEqual(
  appSettingsTarget.kind === 'root' ? appSettingsTarget.routeName : null,
  'AppSettings',
  'app settings menu route',
);
