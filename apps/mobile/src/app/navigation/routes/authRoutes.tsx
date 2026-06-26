import React from 'react';

import {LoginScreen} from '../../../features/auth';
import {TutorialIntroScreen} from '../../../features/onboarding';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

export function LoginRouteScreen({navigation}: RootScreenProps<'Login'>) {
  return <LoginScreen onLoginSuccess={() => navigation.replace('Tutorial')} />;
}

export function TutorialRouteScreen({navigation}: RootScreenProps<'Tutorial'>) {
  return (
    <TutorialIntroScreen
      onCloseToHome={() => navigateMainTab(navigation, 'HomeTab')}
      onStartCapture={() => navigation.navigate('FaceCapture')}
    />
  );
}
