import React from 'react';

import {LoginScreen, type AuthSession, useAuthSession} from '../../../features/auth';
import {TutorialIntroScreen} from '../../../features/onboarding';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

export function LoginRouteScreen({navigation}: RootScreenProps<'Login'>) {
  const {isRestoringSession, session, setSession} = useAuthSession();

  React.useEffect(() => {
    if (!isRestoringSession && session) {
      navigation.replace('Tutorial');
    }
  }, [isRestoringSession, navigation, session]);

  const handleLoginSuccess = (nextSession: AuthSession) => {
    void setSession(nextSession);
    navigation.replace('Tutorial');
  };

  return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
}

export function TutorialRouteScreen({navigation}: RootScreenProps<'Tutorial'>) {
  return (
    <TutorialIntroScreen
      onCloseToHome={() => navigateMainTab(navigation, 'HomeTab')}
      onStartCapture={() => navigation.navigate('FaceCapture')}
    />
  );
}