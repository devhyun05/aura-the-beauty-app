import React from 'react';

import {
  PROFILE_BIRTH_DATE_PICKER_MODE,
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
expectEqual(headerPresentation.contextLabel, 'PROFILE', 'profile edit header context label');
expectEqual(headerPresentation.title, '프로필 수정', 'profile edit header title');
expectEqual(
  PROFILE_BIRTH_DATE_PICKER_MODE,
  'wheel',
  'profile birth date picker uses a scroll wheel',
);

<ProfileEditScreen onBack={() => undefined} onLogout={() => undefined} />;
