import {
  getConsultingHistoryBackAction,
  getMainTabHeaderBorderWidth,
} from './routeUtils';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  getMainTabHeaderBorderWidth('HomeTab'),
  0,
  'home tab header border is hidden',
);
expectEqual(
  getMainTabHeaderBorderWidth('ProfileTab'),
  0,
  'profile tab header border is hidden',
);
expectEqual(
  getMainTabHeaderBorderWidth('ConsultingTab'),
  0,
  'consulting tab header border is hidden',
);
expectEqual(
  getConsultingHistoryBackAction('profile', true).kind,
  'goBack',
  'consulting history pops the current route when a previous screen exists',
);
expectEqual(
  JSON.stringify(getConsultingHistoryBackAction('profile', false)),
  JSON.stringify({kind: 'mainTab', screen: 'ProfileTab'}),
  'consulting history falls back to profile only when there is no back stack',
);
expectEqual(
  JSON.stringify(getConsultingHistoryBackAction(undefined, false)),
  JSON.stringify({kind: 'mainTab', screen: 'ConsultingTab'}),
  'consulting history keeps consulting as the default fallback',
);
