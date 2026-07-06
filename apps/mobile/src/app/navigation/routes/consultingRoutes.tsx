import {Alert} from 'react-native';

import {
  ConsultingBookingCompleteScreen,
  ConsultingBookingScreen,
  ConsultingCallScreen,
  ConsultingExpertListScreen,
  ConsultingExpertProfileScreen,
  ConsultingHistoryScreen,
  ConsultingHomeScreen,
  ConsultingMembershipScreen,
  ConsultingPaymentScreen,
  ConsultingSummaryScreen,
  consultingMembershipPlans,
  findConsultingExpertOrFirst,
  findConsultingRecord,
} from '../../../features/consulting';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {
  navigateMainTab,
  type RootNavigation,
  type RootScreenProps,
} from './routeUtils';

export function renderConsultingHome(navigation: RootNavigation) {
  return (
    <ConsultingHomeScreen
      onPressStartWithReport={() => navigation.navigate('ConsultingExpertList')}
      onPressCategory={categoryId =>
        navigation.navigate('ConsultingExpertList', {categoryId})
      }
      onPressExpert={expertId =>
        navigation.navigate('ConsultingExpertProfile', {expertId})
      }
      onPressExpertList={() => navigation.navigate('ConsultingExpertList')}
      onPressMembership={() => navigation.navigate('ConsultingMembership')}
      onPressHistory={() => navigation.navigate('ConsultingHistory')}
      onPressEnterUpcoming={recordId => {
        const record = findConsultingRecord(recordId);
        if (!record) {
          return;
        }

        navigation.navigate('ConsultingCall', {
          expertId: record.expertId,
          durationId: 'd30',
        });
      }}
    />
  );
}

function goBackToConsulting(navigation: RootNavigation) {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }

  navigateMainTab(navigation, 'ConsultingTab');
}

export function ConsultingExpertListRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingExpertList'>) {
  return (
    <DetailRouteChrome
      routeName="ConsultingExpertList"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingExpertListScreen
        initialCategoryId={route.params?.categoryId ?? null}
        onPressExpert={expertId =>
          navigation.navigate('ConsultingExpertProfile', {expertId})
        }
      />
    </DetailRouteChrome>
  );
}

export function ConsultingExpertProfileRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingExpertProfile'>) {
  const expert = findConsultingExpertOrFirst(route.params?.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingExpertProfile"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingExpertProfileScreen
        expert={expert}
        onReserve={durationId =>
          navigation.navigate('ConsultingBooking', {
            expertId: expert.id,
            durationId,
          })
        }
      />
    </DetailRouteChrome>
  );
}

export function ConsultingBookingRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingBooking'>) {
  const expert = findConsultingExpertOrFirst(route.params?.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingBooking"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingBookingScreen
        durationId={route.params.durationId}
        expert={expert}
        onNext={draft => navigation.navigate('ConsultingPayment', {draft})}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingPaymentRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingPayment'>) {
  const {draft} = route.params;
  const expert = findConsultingExpertOrFirst(draft.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingPayment"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingPaymentScreen
        draft={draft}
        expert={expert}
        onPay={() => navigation.navigate('ConsultingBookingComplete', {draft})}
        onPressMembershipDetail={() =>
          navigation.navigate('ConsultingMembership')
        }
      />
    </DetailRouteChrome>
  );
}

export function ConsultingBookingCompleteRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingBookingComplete'>) {
  const {draft} = route.params;
  const expert = findConsultingExpertOrFirst(draft.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingBookingComplete"
      onBack={() => navigateMainTab(navigation, 'ConsultingTab')}>
      <ConsultingBookingCompleteScreen
        draft={draft}
        expert={expert}
        onEnterCall={() =>
          navigation.navigate('ConsultingCall', {
            expertId: draft.expertId,
            durationId: draft.durationId,
          })
        }
        onGoToConsultingHome={() =>
          navigateMainTab(navigation, 'ConsultingTab')
        }
      />
    </DetailRouteChrome>
  );
}

export function ConsultingCallRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingCall'>) {
  const expert = findConsultingExpertOrFirst(route.params?.expertId);

  return (
    <ConsultingCallScreen
      durationId={route.params.durationId}
      expert={expert}
      onEndCall={() =>
        navigation.replace('ConsultingSummary', {expertId: expert.id})
      }
    />
  );
}

export function ConsultingSummaryRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingSummary'>) {
  const record = findConsultingRecord(route.params?.recordId);
  const expert = findConsultingExpertOrFirst(
    record?.expertId ?? route.params?.expertId,
  );

  return (
    <DetailRouteChrome
      routeName="ConsultingSummary"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingSummaryScreen
        expert={expert}
        heroTitle={record ? '상담 요약 리포트' : undefined}
        summary={record?.summary}
        onGoToConsultingHome={() =>
          navigateMainTab(navigation, 'ConsultingTab')
        }
        onPressHistory={() => navigation.navigate('ConsultingHistory')}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingHistoryRouteScreen({
  navigation,
}: RootScreenProps<'ConsultingHistory'>) {
  return (
    <DetailRouteChrome
      routeName="ConsultingHistory"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingHistoryScreen
        onPressUpcoming={record =>
          navigation.navigate('ConsultingCall', {
            expertId: record.expertId,
            durationId: 'd30',
          })
        }
        onPressCompleted={record =>
          navigation.navigate('ConsultingSummary', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onPressFindExpert={() => navigation.navigate('ConsultingExpertList')}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingMembershipRouteScreen({
  navigation,
}: RootScreenProps<'ConsultingMembership'>) {
  return (
    <DetailRouteChrome
      routeName="ConsultingMembership"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingMembershipScreen
        onSubscribe={planId => {
          const plan = consultingMembershipPlans.find(
            membershipPlan => membershipPlan.id === planId,
          );

          Alert.alert(
            '멤버십 구독',
            `${plan?.name ?? ''} 플랜 결제는 준비 중이에요. 곧 만나요!`,
            [{text: '확인'}],
          );
        }}
      />
    </DetailRouteChrome>
  );
}
