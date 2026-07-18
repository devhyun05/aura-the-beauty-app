import React from 'react';
import {Alert} from 'react-native';

import {useAuthSession} from '../../../features/auth';
import {
  AccountDeletionScreen,
  AccountManagementScreen,
  APP_SETTINGS_BACKGROUND_COLOR,
  AppSettingsScreen,
  type AccountDeletionReasonId,
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
      backgroundColor={APP_SETTINGS_BACKGROUND_COLOR}
      headerBackgroundColor="rgba(248, 245, 239, 0.94)"
      headerBorderColor="rgba(100, 116, 99, 0.06)"
      routeName="AppSettings"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <AppSettingsScreen
        onPressAccountManagement={() => navigation.navigate('AccountManagement')}
        onPressFaq={() => navigation.navigate('Faq')}
        onPressProfile={() => navigation.navigate('ProfileEdit')}
        onPressQuickActions={() => navigation.navigate('FloatingActionSettings')}
      />
    </DetailRouteChrome>
  );
}

export function FaqRouteScreen({navigation}: RootScreenProps<'Faq'>) {
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
      <FaqScreen />
    </DetailRouteChrome>
  );
}

export function AccountManagementRouteScreen({
  navigation,
}: RootScreenProps<'AccountManagement'>) {
  const {clearSession, session} = useAuthSession();
  const {resetNavigationFlowState} = useNavigationFlowState();

  const confirmLogout = () => {
    Alert.alert('로그아웃', '이 기기에서 로그아웃할까요?', [
      {style: 'cancel', text: '취소'},
      {
        onPress: () => {
          resetNavigationFlowState();
          void clearSession().finally(() => {
            navigation.reset({index: 0, routes: [{name: 'Login'}]});
          });
        },
        text: '로그아웃',
      },
    ]);
  };

  return (
    <DetailRouteChrome
      routeName="AccountManagement"
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate('AppSettings');
      }}>
      <AccountManagementScreen
        accountEmail={session?.user.email}
        accountName={session?.user.nickname || session?.user.name || 'AURA 사용자'}
        onLogout={confirmLogout}
        onPressAccountDeletion={() => navigation.navigate('AccountDeletion')}
      />
    </DetailRouteChrome>
  );
}

export function AccountDeletionRouteScreen({
  navigation,
}: RootScreenProps<'AccountDeletion'>) {
  const {clearSession, session} = useAuthSession();
  const {resetNavigationFlowState} = useNavigationFlowState();

  const handleDeleteAccount = async (reason: AccountDeletionReasonId | null) => {
    if (!session) {
      throw new Error('로그인 세션을 확인할 수 없어요. 다시 로그인해 주세요.');
    }

    let result: Awaited<ReturnType<typeof deleteMyAccount>>;

    try {
      result = await deleteMyAccount(reason);
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
      routeName="AccountDeletion"
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate('AccountManagement');
      }}>
      <AccountDeletionScreen onDeleteAccount={handleDeleteAccount} />
    </DetailRouteChrome>
  );
}
