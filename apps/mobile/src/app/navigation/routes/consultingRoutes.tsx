import {Alert} from 'react-native';
import {useEffect, useState} from 'react';

import {useAuthSession} from '../../../features/auth';
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
  ConsultingMessagesScreen,
  ConsultingNotificationsScreen,
  ConsultingRequestConfirmScreen,
  ConsultingReviewScreen,
  ConsultingSummaryScreen,
  consultingMembershipPlans,
  createConsultingBooking,
  createConsultingReview,
  findConsultingRecord,
  getConsultingBooking,
  getConsultingBookings,
  markConsultingInboxRead,
  updateConsultingBooking,
  useConsultingExpert,
  type ConsultingRecord,
  type ConsultingReviewDraft,
} from '../../../features/consulting';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {
  type RootNavigation,
  type RootScreenProps,
} from './routeUtils';

export function renderConsultingHome(navigation: RootNavigation) {
  return (
    <ConsultingHomeScreen
      onPressHeroSlide={categoryId =>
        navigation.navigate(
          'ConsultingExpertList',
          categoryId ? {categoryId} : undefined,
        )
      }
      onPressExpert={expertId =>
        navigation.navigate('ConsultingExpertProfile', {expertId})
      }
      onPressExpertList={() => navigation.navigate('ConsultingExpertList')}
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
  const [activeRecord, setActiveRecord] = useState<ConsultingRecord | null>(null);

  useEffect(() => {
    let isMounted = true;

    getConsultingBookings().then(records => {
      if (!isMounted) {
        return;
      }

      setActiveRecord(
        records.find(
          record =>
            record.expertId === expert.id &&
            ['requested', 'contacting', 'confirmed', 'scheduled', 'in_progress'].includes(record.status),
        ) ?? null,
      );
    });

    return () => {
      isMounted = false;
    };
  }, [expert.id]);

  return (
    <DetailRouteChrome
      routeName="ConsultingExpertProfile"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingExpertProfileScreen
        activeRecord={activeRecord}
        expert={expert}
        onPressActiveRecord={record =>
          navigation.navigate('ConsultingConversation', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onReserve={(durationId, sessionMode) =>
          navigation.navigate('ConsultingBooking', {
            expertId: expert.id,
            durationId,
            sessionMode,
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
        sessionMode={
          record?.sessionMode ?? route.params.sessionMode ?? 'online'
        }
        submitting={submitting}
        onNext={async draft => {
          if (!route.params.bookingId) {
            navigation.navigate('ConsultingRequestConfirm', {draft});
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
                '신청 수정 실패',
                '희망 일정을 변경하지 못했어요. 선택한 시간이 가능한지 확인해 주세요.',
                [{text: '확인'}],
              );
              return;
            }

            Alert.alert('신청 수정', '희망 일정이 변경됐어요.', [
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

export function ConsultingRequestConfirmRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingRequestConfirm'>) {
  const {draft} = route.params;
  const expert = useConsultingExpert(draft.expertId);
  const [submitting, setSubmitting] = useState(false);

  return (
    <DetailRouteChrome
      routeName="ConsultingRequestConfirm"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingRequestConfirmScreen
        draft={draft}
        expert={expert}
        submitting={submitting}
        onSubmit={async () => {
          if (submitting) {
            return;
          }

          setSubmitting(true);
          try {
            const record = await createConsultingBooking(draft);
            if (!record) {
              Alert.alert(
                '신청 접수 실패',
                '예약 신청을 접수하지 못했어요. 네트워크와 API 설정을 확인해 주세요.',
                [{text: '확인'}],
              );
              return;
            }

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
        onPressConversation={() =>
          navigation.navigate('ConsultingConversation', {
            recordId: route.params.bookingId,
            expertId: draft.expertId,
          })
        }
        onPressHistory={() => navigation.navigate('ConsultingHistory')}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingCallRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingCall'>) {
  const {getAuthToken} = useAuthSession();
  const expert = useConsultingExpert(route.params?.expertId);

  return (
    <ConsultingCallScreen
      authToken={getAuthToken()}
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
        heroTitle={record ? 'AI 상담 요약' : undefined}
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
  const {getAuthToken} = useAuthSession();

  return (
    <DetailRouteChrome
      routeName="ConsultingHistory"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingHistoryScreen
        authToken={getAuthToken()}
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
            sessionMode: record.sessionMode ?? 'online',
          })
        }
        onPressFindExpert={() => navigation.navigate('ConsultingExpertList')}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingMessagesRouteScreen({
  navigation,
}: RootScreenProps<'ConsultingMessages'>) {
  const {getAuthToken} = useAuthSession();
  return (
    <DetailRouteChrome
      routeName="ConsultingMessages"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingMessagesScreen
        authToken={getAuthToken()}
        onPressConversation={record =>
          navigation.navigate('ConsultingConversation', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onPressIncomingCall={record =>
          navigation.navigate('ConsultingCall', {
            bookingId: record.id,
            durationId: record.durationId ?? 'd30',
            expertId: record.expertId,
          })
        }
        onPressFindExpert={() => navigation.navigate('ConsultingExpertList')}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingNotificationsRouteScreen({
  navigation,
}: RootScreenProps<'ConsultingNotifications'>) {
  return (
    <DetailRouteChrome
      routeName="ConsultingNotifications"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingNotificationsScreen
        onPressHistory={() => navigation.navigate('ConsultingHistory')}
        onPressRecord={record =>
          navigation.navigate('ConsultingConversation', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
      />
    </DetailRouteChrome>
  );
}

export function ConsultingConversationRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingConversation'>) {
  const {getAuthToken} = useAuthSession();
  const authToken = getAuthToken();
  const [record, setRecord] = useState<ConsultingRecord | null>(
    () => findConsultingRecord(route.params.recordId) ?? null,
  );
  const expert = useConsultingExpert(route.params.expertId);

  useEffect(() => {
    let isMounted = true;

    if (!authToken) {
      setRecord(null);
      return () => {
        isMounted = false;
      };
    }

    getConsultingBooking(route.params.recordId).then(data => {
      if (isMounted && data) {
        setRecord(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [authToken, route.params.recordId]);

  useEffect(() => {
    if (record) {
      void markConsultingInboxRead('messages', [record]);
    }
  }, [record]);

  return (
    <DetailRouteChrome
      routeName="ConsultingConversation"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingConversationScreen
        authToken={authToken}
        bookingId={route.params.recordId}
        expert={expert}
        onBookingStatusChange={() => {
          void getConsultingBooking(route.params.recordId).then(nextRecord => {
            if (nextRecord) {
              setRecord(nextRecord);
            }
          });
        }}
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

          Alert.alert(
            '멤버십 준비 중',
            `${plan?.name ?? '멤버십'} 플랜은 사업자 등록 이후 다시 검토할 예정이에요.`,
            [{text: '확인'}],
          );
        }}
      />
    </DetailRouteChrome>
  );
}
