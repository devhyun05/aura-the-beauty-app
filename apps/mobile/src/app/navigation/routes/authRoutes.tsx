import React from 'react';

import {
  getAuthUserClaimsFromIdToken,
  hasCompletedProfileSetup,
  LoginScreen,
  markProfileSetupCompleted,
  ProfileSetupScreen,
  type AuthSession,
  type AuthUser,
  type ProfileSetupFormValues,
  useAuthSession,
} from '../../../features/auth';
import {
  hasCompletedFaceCaptureTutorial,
  markFaceCaptureTutorialCompleted,
  TutorialIntroScreen,
} from '../../../features/onboarding';
import {getUserProfile, updateUserProfile} from '../../../shared/services/userService';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

type PostLoginRouteName = 'ProfileSetup' | 'MainTabs';
type PostLoginRoute = {
  routeName: PostLoginRouteName;
  shouldShowBeautyJourneyGuide: boolean;
};

function getProfileSetupUser(session: AuthSession): AuthUser {
  const tokenUser = getAuthUserClaimsFromIdToken(session.idToken);

  return {
    ...session.user,
    email: tokenUser.email ?? session.user.email,
    id: tokenUser.id ?? session.user.id,
    name: tokenUser.name ?? session.user.name,
    nickname: tokenUser.nickname ?? session.user.nickname,
  };
}

function getProfileSetupSession(session: AuthSession): AuthSession {
  return {
    ...session,
    user: getProfileSetupUser(session),
  };
}

function isStoredProfileForUser(profileEmail: string, profileId: string, user: AuthUser) {
  const normalizedProfileEmail = profileEmail.trim().toLowerCase();
  const normalizedUserEmail = user.email?.trim().toLowerCase();

  return profileId === user.id || Boolean(normalizedUserEmail && normalizedProfileEmail === normalizedUserEmail);
}

async function hasStoredProfileForUser(user: AuthUser): Promise<boolean> {
  const profile = await getUserProfile();

  return isStoredProfileForUser(profile.email, profile.id, user);
}

export function getPostLoginRouteForFlags({
  hasCompletedInitialGuide,
  hasCompletedProfile,
  hasStoredProfile,
}: {
  hasCompletedInitialGuide: boolean;
  hasCompletedProfile: boolean;
  hasStoredProfile: boolean;
}): PostLoginRoute {
  if (!hasCompletedProfile || !hasStoredProfile) {
    return {
      routeName: 'ProfileSetup',
      shouldShowBeautyJourneyGuide: false,
    };
  }

  return {
    routeName: 'MainTabs',
    shouldShowBeautyJourneyGuide: !hasCompletedInitialGuide,
  };
}

async function getPostLoginRoute(session: AuthSession): Promise<PostLoginRoute> {
  const [
    hasCompletedProfile,
    hasStoredProfile,
    hasCompletedInitialGuide,
  ] = await Promise.all([
    hasCompletedProfileSetup(session.user),
    hasStoredProfileForUser(session.user),
    hasCompletedFaceCaptureTutorial(session.user),
  ]);

  return getPostLoginRouteForFlags({
    hasCompletedInitialGuide,
    hasCompletedProfile,
    hasStoredProfile,
  });
}

function replacePostLoginRoute(
  navigation: RootScreenProps<'Login'>['navigation'],
  routeName: PostLoginRouteName,
) {
  if (routeName === 'ProfileSetup') {
    navigation.replace('ProfileSetup');
    return;
  }

  navigation.replace('MainTabs', {screen: 'HomeTab'});
}

export function LoginRouteScreen({navigation}: RootScreenProps<'Login'>) {
  const {isRestoringSession, session, setSession} = useAuthSession();
  const {setShouldShowBeautyJourneyGuide} = useNavigationFlowState();
  const isRoutingAfterLoginRef = React.useRef(false);

  React.useEffect(() => {
    if (isRestoringSession || !session || isRoutingAfterLoginRef.current) {
      return;
    }

    isRoutingAfterLoginRef.current = true;
    void (async () => {
      const nextSession = getProfileSetupSession(session);
      const nextRoute = await getPostLoginRoute(nextSession);

      await setSession(nextSession);
      setShouldShowBeautyJourneyGuide(nextRoute.shouldShowBeautyJourneyGuide);
      replacePostLoginRoute(navigation, nextRoute.routeName);
    })();
  }, [
    isRestoringSession,
    navigation,
    session,
    setSession,
    setShouldShowBeautyJourneyGuide,
  ]);

  const handleLoginSuccess = (nextSession: AuthSession) => {
    isRoutingAfterLoginRef.current = true;
    void (async () => {
      const normalizedSession = getProfileSetupSession(nextSession);
      const nextRoute = await getPostLoginRoute(normalizedSession);

      await setSession(normalizedSession);
      setShouldShowBeautyJourneyGuide(nextRoute.shouldShowBeautyJourneyGuide);
      replacePostLoginRoute(navigation, nextRoute.routeName);
    })();
  };

  return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
}

export function ProfileSetupRouteScreen({navigation}: RootScreenProps<'ProfileSetup'>) {
  const {isRestoringSession, session, setSession} = useAuthSession();
  const {setShouldShowBeautyJourneyGuide} = useNavigationFlowState();

  React.useEffect(() => {
    if (!isRestoringSession && !session) {
      navigation.replace('Login');
    }
  }, [isRestoringSession, navigation, session]);

  const handleProfileSetupSubmit = (values: ProfileSetupFormValues) => {
    if (!session) {
      navigation.replace('Login');
      return;
    }

    void (async () => {
      const currentProfile = await getUserProfile();
      const profileSetupUser = getProfileSetupUser(session);
      const nextProfile = {
        ...currentProfile,
        birthDate: values.birthDate,
        email: values.email,
        gender: values.gender,
        id: profileSetupUser.id,
        name: values.name,
        nickname: values.nickname,
      };
      const nextSession: AuthSession = {
        ...session,
        user: {
          ...profileSetupUser,
          email: values.email,
          name: values.name,
          nickname: values.nickname,
          profileCompleted: true,
        },
      };

      await updateUserProfile(nextProfile);
      await markProfileSetupCompleted(nextSession.user);
      await setSession(nextSession);
      setShouldShowBeautyJourneyGuide(true);
      navigation.replace('MainTabs', {screen: 'HomeTab'});
    })();
  };

  if (isRestoringSession || !session) {
    return null;
  }

  return (
    <ProfileSetupScreen
      onSubmit={handleProfileSetupSubmit}
      user={getProfileSetupUser(session)}
    />
  );
}

export function TutorialRouteScreen({navigation}: RootScreenProps<'Tutorial'>) {
  const {clearSession, isRestoringSession, session} = useAuthSession();

  React.useEffect(() => {
    if (!isRestoringSession && !session) {
      navigation.replace('Login');
    }
  }, [isRestoringSession, navigation, session]);

  const markTutorialCompleted = React.useCallback(async () => {
    if (!session) {
      return;
    }

    await markFaceCaptureTutorialCompleted(getProfileSetupUser(session));
  }, [session]);

  const handleCloseToHome = React.useCallback(() => {
    void markTutorialCompleted().finally(() => {
      navigateMainTab(navigation, 'HomeTab');
    });
  }, [markTutorialCompleted, navigation]);

  const handleStartCapture = React.useCallback(() => {
    void markTutorialCompleted().finally(() => {
      navigation.navigate('FaceCapture');
    });
  }, [markTutorialCompleted, navigation]);

  const handleSwitchAccount = React.useCallback(() => {
    void clearSession().finally(() => {
      navigation.replace('Login');
    });
  }, [clearSession, navigation]);

  if (isRestoringSession || !session) {
    return null;
  }

  return (
    <TutorialIntroScreen
      onCloseToHome={handleCloseToHome}
      onStartCapture={handleStartCapture}
      onSwitchAccount={handleSwitchAccount}
    />
  );
}
