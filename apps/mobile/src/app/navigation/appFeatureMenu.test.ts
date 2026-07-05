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
const makeupFeedbackTarget = getAppFeatureMenuTarget('makeupFeedback');
const magazineTarget = getAppFeatureMenuTarget('magazine');
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
expectEqual(
  analysisSection?.items.map(item => item.label).includes('매거진'),
  true,
  'analysis menu includes magazine',
);
expectEqual(makeupFeedbackTarget.kind, 'root', 'makeup feedback menu target kind');
expectEqual(
  makeupFeedbackTarget.kind === 'root' ? makeupFeedbackTarget.routeName : null,
  'MakeupFeedbackAlbumUpload',
  'makeup feedback menu opens available feedback flow',
);
expectEqual(magazineTarget.kind, 'root', 'magazine menu target kind');
expectEqual(
  magazineTarget.kind === 'root' ? magazineTarget.routeName : null,
  'Magazine',
  'magazine menu opens magazine route',
);
expectEqual(appSettingsTarget.kind, 'root', 'app settings target kind');
expectEqual(
  appSettingsTarget.kind === 'root' ? appSettingsTarget.routeName : null,
  'AppSettings',
  'app settings menu route',
);
