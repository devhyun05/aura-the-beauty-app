import {Alert} from 'react-native';
import {useEffect, useState} from 'react';

import {
  ConsultingBookingCompleteScreen,
  ConsultingBookingScreen,
  ConsultingCallScreen,
  ConsultingConversationScreen,
  ConsultingExpertListScreen,
  ConsultingExpertProfileScreen,
  ConsultingHistoryScreen,
  ConsultingHomeScreen,
  ConsultingMembershipScreen,
  ConsultingPaymentScreen,
  ConsultingReviewScreen,
  ConsultingSummaryScreen,
  consultingMembershipPlans,
  createConsultingBooking,
  createConsultingPayment,
  createConsultingReview,
  findConsultingRecord,
  getConsultingBooking,
  subscribeConsultingMembership,
  updateConsultingBooking,
  useConsultingExpert,
  type ConsultingRecord,
  type ConsultingReviewDraft,
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
      onPressExpert={expertId =>
        navigation.navigate('ConsultingExpertProfile', {expertId})
      }
      onPressExpertList={() => navigation.navigate('ConsultingExpertList')}
      onPressMembership={() => navigation.navigate('ConsultingMembership')}
      onPressHistory={() => navigation.navigate('ConsultingHistory')}
      onPressUpcoming={record =>
        navigation.navigate('ConsultingConversation', {
          expertId: record.expertId,
          recordId: record.id,
        })
      }
    />
  );
}

function goBackToConsulting(navigation: RootNavigation) {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }

  navigation.navigate('Consulting');
}

export function ConsultingExpertListRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingExpertList'>) {
  return (
    <DetailRouteChrome
      routeName="ConsultingExpertList"
      onBack={() => navigation.navigate('Consulting')}>
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
  const expert = useConsultingExpert(route.params?.expertId);

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
  const expert = useConsultingExpert(route.params?.expertId);
  const [record, setRecord] = useState<ConsultingRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (route.params.bookingId) {
      getConsultingBooking(route.params.bookingId).then(data => {
        if (isMounted) {
          setRecord(data);
        }
      });
    } else {
      setRecord(null);
    }

    return () => {
      isMounted = false;
    };
  }, [route.params.bookingId]);

  return (
    <DetailRouteChrome
      routeName="ConsultingBooking"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingBookingScreen
        durationId={route.params.durationId}
        expert={expert}
        initialRecord={record}
        mode={route.params.bookingId ? 'edit' : 'create'}
        submitting={submitting}
        onNext={async draft => {
          if (!route.params.bookingId) {
            navigation.navigate('ConsultingPayment', {draft});
            return;
          }

          if (submitting) {
            return;
          }

          setSubmitting(true);
          try {
            const updatedRecord = await updateConsultingBooking(
              route.params.bookingId,
              draft,
            );
            if (!updatedRecord) {
              Alert.alert(
                '예약 수정 실패',
                '예약 시간을 변경하지 못했어요. 선택한 시간이 가능한지 확인해 주세요.',
                [{text: '확인'}],
              );
              return;
            }

            Alert.alert('예약 수정', '예약 시간이 변경됐어요.', [
              {
                text: '확인',
                onPress: () => navigation.replace('ConsultingHistory'),
              },
            ]);
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingPaymentRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingPayment'>) {
  const {draft} = route.params;
  const expert = useConsultingExpert(draft.expertId);
  const [submitting, setSubmitting] = useState(false);

  return (
    <DetailRouteChrome
      routeName="ConsultingPayment"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingPaymentScreen
        draft={draft}
        expert={expert}
        submitting={submitting}
        onPay={async () => {
          if (submitting) {
            return;
          }

          setSubmitting(true);
          try {
            const record = await createConsultingBooking(draft);
            if (!record) {
              Alert.alert(
                '예약 저장 실패',
                '백엔드에 예약을 저장하지 못했어요. 네트워크와 API 설정을 확인해 주세요.',
                [{text: '확인'}],
              );
              return;
            }

            void createConsultingPayment({
              kind: 'booking',
              bookingId: record.id,
            });
            navigation.navigate('ConsultingBookingComplete', {
              bookingId: record.id,
              draft,
              record,
            });
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingBookingCompleteRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingBookingComplete'>) {
  const {draft, record} = route.params;
  const expert = useConsultingExpert(draft.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingBookingComplete"
      onBack={() => navigation.navigate('Consulting')}>
      <ConsultingBookingCompleteScreen
        draft={draft}
        expert={expert}
        record={record}
        onPressHistory={() => navigation.navigate('ConsultingHistory')}
        onGoToConsultingHome={() =>
          navigation.navigate('Consulting')
        }
      />
    </DetailRouteChrome>
  );
}

export function ConsultingCallRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingCall'>) {
  const expert = useConsultingExpert(route.params?.expertId);

  return (
    <ConsultingCallScreen
      bookingId={route.params.bookingId}
      durationId={route.params.durationId}
      expert={expert}
      onEndCall={() => navigation.navigate('ConsultingHistory')}
    />
  );
}

export function ConsultingSummaryRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingSummary'>) {
  const [record, setRecord] = useState<ConsultingRecord | null>(() =>
    route.params?.recordId ? findConsultingRecord(route.params.recordId) ?? null : null,
  );
  useEffect(() => {
    let isMounted = true;

    if (route.params?.recordId) {
      getConsultingBooking(route.params.recordId).then(data => {
        if (isMounted && data) {
          setRecord(data);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [route.params?.recordId]);

  const expert = useConsultingExpert(record?.expertId ?? route.params?.expertId);
  const summary =
    record && record.status !== 'completed' ? undefined : record?.summary;

  return (
    <DetailRouteChrome
      routeName="ConsultingSummary"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingSummaryScreen
        expert={expert}
        heroTitle={record ? '상담 요약 리포트' : undefined}
        summary={summary}
        onGoToConsultingHome={() =>
          navigation.navigate('Consulting')
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
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <ConsultingHistoryScreen
        onPressCompleted={record =>
          navigation.navigate('ConsultingSummary', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onPressReview={record =>
          navigation.navigate('ConsultingReview', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onPressUpcoming={record =>
          navigation.navigate('ConsultingConversation', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onPressReschedule={record =>
          navigation.navigate('ConsultingBooking', {
            expertId: record.expertId,
            durationId: record.durationId ?? 'd30',
            bookingId: record.id,
          })
        }
        onPressFindExpert={() => navigation.navigate('ConsultingExpertList')}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingConversationRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingConversation'>) {
  const [record, setRecord] = useState<ConsultingRecord | null>(
    () => findConsultingRecord(route.params.recordId) ?? null,
  );
  const expert = useConsultingExpert(route.params.expertId);

  useEffect(() => {
    let isMounted = true;

    getConsultingBooking(route.params.recordId).then(data => {
      if (isMounted && data) {
        setRecord(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [route.params.recordId]);

  return (
    <DetailRouteChrome
      routeName="ConsultingConversation"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingConversationScreen
        expert={expert}
        onPressCall={() =>
          navigation.navigate('ConsultingCall', {
            bookingId: record?.id,
            durationId: record?.durationId ?? 'd30',
            expertId: expert.id,
          })
        }
        record={record}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingReviewRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingReview'>) {
  const expert = useConsultingExpert(route.params.expertId);
  const [record, setRecord] = useState<ConsultingRecord | null>(
    () => findConsultingRecord(route.params.recordId) ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getConsultingBooking(route.params.recordId).then(data => {
      if (isMounted && data) {
        setRecord(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [route.params.recordId]);

  const handleSubmit = async (draft: ConsultingReviewDraft) => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const review = await createConsultingReview(route.params.recordId, draft);
      if (!review) {
        Alert.alert(
          '리뷰 저장 실패',
          '리뷰를 저장하지 못했어요. 완료된 상담인지 확인해 주세요.',
          [{text: '확인'}],
        );
        return;
      }

      Alert.alert('리뷰 저장', '상담사 프로필에 리뷰가 반영됐어요.', [
        {text: '확인', onPress: () => navigation.replace('ConsultingHistory')},
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DetailRouteChrome
      routeName="ConsultingReview"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingReviewScreen
        expert={expert}
        onSubmit={handleSubmit}
        record={record}
        submitting={submitting}
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

          void subscribeConsultingMembership(planId);
          Alert.alert(
            '멤버십 구독',
            `${plan?.name ?? ''} 플랜 구독을 접수했어요. 결제 연동은 순차 적용됩니다.`,
            [{text: '확인'}],
          );
        }}
      />
    </DetailRouteChrome>
  );
}
