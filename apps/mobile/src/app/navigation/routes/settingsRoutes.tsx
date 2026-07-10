import React from 'react';

import {useAuthSession} from '../../../features/auth';
import {
  AppSettingsScreen,
  clearLocalAccountData,
  deleteMyAccount,
  FaqScreen,
} from '../../../features/settings';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

export function AppSettingsRouteScreen({
  navigation,
}: RootScreenProps<'AppSettings'>) {
  return (
    <DetailRouteChrome
      routeName="AppSettings"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <AppSettingsScreen
        onPressFaq={() => navigation.navigate('Faq')}
        onPressProfile={() => navigation.navigate('ProfileEdit')}
        onPressQuickActions={() => navigation.navigate('FloatingActionSettings')}
      />
    </DetailRouteChrome>
  );
}

export function FaqRouteScreen({navigation}: RootScreenProps<'Faq'>) {
  const {clearSession, session} = useAuthSession();
  const {resetNavigationFlowState} = useNavigationFlowState();

  const handleDeleteAccount = async () => {
    if (!session) {
      throw new Error('로그인 세션을 확인할 수 없어요. 다시 로그인해 주세요.');
    }

    let result: Awaited<ReturnType<typeof deleteMyAccount>>;

    try {
      result = await deleteMyAccount();
    } catch {
      throw new Error('회원 탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }

    if (!result.deleted) {
      throw new Error('계정 삭제가 완료되지 않았어요.');
    }

    await clearLocalAccountData(session.user);
    resetNavigationFlowState();

    try {
      await clearSession();
    } finally {
      navigation.reset({index: 0, routes: [{name: 'Login'}]});
    }
  };

  return (
    <DetailRouteChrome
      routeName="Faq"
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate('AppSettings');
      }}>
      <FaqScreen onDeleteAccount={handleDeleteAccount} />
    </DetailRouteChrome>
  );
}
