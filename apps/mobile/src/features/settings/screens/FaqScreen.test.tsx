import React from 'react';

import {AppSettingsScreen, APP_SETTINGS_LABELS} from './AppSettingsScreen';
import {FAQ_ITEMS, FaqScreen} from './FaqScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(APP_SETTINGS_LABELS.faq, 'FAQ', 'settings FAQ label');
expectEqual(
  FAQ_ITEMS.some(item => item.id === 'deletion-scope'),
  true,
  'FAQ includes account deletion scope',
);

<AppSettingsScreen
  onPressFaq={() => undefined}
  onPressProfile={() => undefined}
  onPressQuickActions={() => undefined}
/>;
<FaqScreen onDeleteAccount={async () => undefined} />;
