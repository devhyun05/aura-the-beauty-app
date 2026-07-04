import React from 'react';

import {
  ProfileEditScreen,
  getProfileEditHeaderPresentation,
} from './ProfileEditScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const headerPresentation = getProfileEditHeaderPresentation();

expectEqual(
  headerPresentation.headerComponent,
  'AppHeader',
  'profile edit header component',
);
expectEqual(headerPresentation.title, '프로필 수정', 'profile edit header title');

<ProfileEditScreen onBack={() => undefined} onLogout={() => undefined} />;
