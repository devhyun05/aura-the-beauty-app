import {ActivityIndicator, Alert, StyleSheet, View} from 'react-native';
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
  createConsultingBooking,
  createConsultingReview,
  endConsultingCall,
  getConsultingBooking,
  getConsultingBookings,
  isConsultingChatAvailable,
  isConsultingPendingStatus,
  markConsultingInboxRead,
  updateConsultingBooking,
  useConsultingBookingStatusSync,
  useConsultingExpert,
  type ConsultingRecord,
  type ConsultingReviewDraft,
} from '../../../features/consulting';
import {DetailRouteChrome} from '../detailHeaderChrome';
import type {AppScreenTopPadding} from '../../../shared/ui/AppScreen';
import {
  navigateMainTab,
  type RootNavigation,
  type RootScreenProps,
} from './routeUtils';

export function renderConsultingHome(
  navigation: RootNavigation,
  options?: {topPadding?: AppScreenTopPadding},
) {
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
        isConsultingChatAvailable(record)
          ? navigation.navigate('ConsultingConversation', {
              expertId: record.expertId,
              recordId: record.id,
            })
          : navigation.navigate('ConsultingHistory')
      }
      topPadding={options?.topPadding}
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

function ConsultingRouteLoading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator />
    </View>
  );
}

export function ConsultingExpertListRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingExpertList'>) {
  return (
    <DetailRouteChrome
      routeName="ConsultingExpertList"
      onBack={() => navigateMainTab(navigation, 'ConsultingTab')}>
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
  const {getAuthToken} = useAuthSession();
  const expert = useConsultingExpert(route.params?.expertId);
  const [activeRecord, setActiveRecord] = useState<ConsultingRecord | null>(null);

  useConsultingBookingStatusSync({
    authToken: getAuthToken(),
    records: activeRecord ? [activeRecord] : [],
    onStatusChange: bookingId => {
      void getConsultingBooking(bookingId).then(nextRecord => {
        setActiveRecord(
          nextRecord &&
            ['requested', 'contacting', 'confirmed', 'scheduled', 'in_progress'].includes(
              nextRecord.status,
            )
            ? nextRecord
            : null,
        );
      });
    },
  });

  useEffect(() => {
    let isMounted = true;

    if (!expert) {
      setActiveRecord(null);
      return () => {
        isMounted = false;
      };
    }

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
  }, [expert]);

  if (!expert) {
    return (
      <DetailRouteChrome
        routeName="ConsultingExpertProfile"
        onBack={() => goBackToConsulting(navigation)}>
        <ConsultingRouteLoading />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="ConsultingExpertProfile"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingExpertProfileScreen
        activeRecord={activeRecord}
        expert={expert}
        onPressActiveRecord={record =>
          isConsultingChatAvailable(record)
            ? navigation.navigate('ConsultingConversation', {
                expertId: record.expertId,
                recordId: record.id,
              })
            : navigation.navigate('ConsultingHistory')
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

  if (!expert) {
    return (
      <DetailRouteChrome
        routeName="ConsultingBooking"
        onBack={() => goBackToConsulting(navigation)}>
        <ConsultingRouteLoading />
      </DetailRouteChrome>
    );
  }

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

  if (!expert) {
    return (
      <DetailRouteChrome
        routeName="ConsultingRequestConfirm"
        onBack={() => goBackToConsulting(navigation)}>
        <ConsultingRouteLoading />
      </DetailRouteChrome>
    );
  }

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
                '잠시 연결이 원활하지 않아요. 네트워크를 확인한 뒤 다시 시도해 주세요.',
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

  if (!expert) {
    return (
      <DetailRouteChrome
        routeName="ConsultingBookingComplete"
        onBack={() => navigateMainTab(navigation, 'ConsultingTab')}>
        <ConsultingRouteLoading />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="ConsultingBookingComplete"
      onBack={() => navigateMainTab(navigation, 'ConsultingTab')}>
      <ConsultingBookingCompleteScreen
        draft={draft}
        expert={expert}
        record={record}
        onPressConsultingHome={() => navigateMainTab(navigation, 'ConsultingTab')}
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

  if (!expert) {
    return <ConsultingRouteLoading />;
  }

  const handleEndCall = async () => {
    if (route.params.bookingId) {
      await endConsultingCall(route.params.bookingId);
    }
    navigation.reset({
      index: 1,
      routes: [
        {name: 'MainTabs', params: {screen: 'ConsultingTab'}},
        {
          name: 'ConsultingSummary',
          params: {expertId: expert.id, recordId: route.params.bookingId},
        },
      ],
    });
  };

  return (
    <ConsultingCallScreen
      authToken={getAuthToken()}
      bookingId={route.params.bookingId}
      durationId={route.params.durationId}
      expert={expert}
      onEndCall={() => void handleEndCall()}
    />
  );
}

export function ConsultingSummaryRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingSummary'>) {
  const [record, setRecord] = useState<ConsultingRecord | null>(null);
  useEffect(() => {
    let isMounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attemptCount = 0;

    const loadRecord = () => {
      if (!route.params?.recordId) return;
      getConsultingBooking(route.params.recordId).then(data => {
        if (isMounted && data) {
          setRecord(data);
          if (!data.summary && attemptCount < 15) {
            attemptCount += 1;
            retryTimer = setTimeout(loadRecord, 2000);
          }
        }
      });
    };
    loadRecord();

    return () => {
      isMounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [route.params?.recordId]);

  const expert = useConsultingExpert(record?.expertId ?? route.params?.expertId);
  const summary =
    record && record.status !== 'completed' ? undefined : record?.summary;

  if (!expert) {
    return (
      <DetailRouteChrome
        routeName="ConsultingSummary"
        onBack={() => navigateMainTab(navigation, 'ConsultingTab')}>
        <ConsultingRouteLoading />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="ConsultingSummary"
      onBack={() => navigateMainTab(navigation, 'ConsultingTab')}>
      <ConsultingSummaryScreen
        expert={expert}
        heroTitle={record ? 'AI 상담 요약' : undefined}
        summary={summary}
        onGoToConsultingHome={() => navigateMainTab(navigation, 'ConsultingTab')}
        onPressHistory={() => navigation.navigate('ConsultingHistory')}
        onPressReview={
          record?.status === 'completed' && !record.reviewId
            ? () => navigation.navigate('ConsultingReview', {
                expertId: record.expertId,
                recordId: record.id,
              })
            : undefined
        }
        reviewCompleted={Boolean(record?.reviewId)}
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
      onBack={() => navigateMainTab(navigation, 'ConsultingTab')}>
      <ConsultingHistoryScreen
        authToken={getAuthToken()}
        onPressBookAgain={record =>
          navigation.navigate('ConsultingBooking', {
            expertId: record.expertId,
            durationId: record.durationId ?? 'd30',
            sessionMode: record.sessionMode ?? 'online',
          })
        }
        onPressReview={record =>
          navigation.navigate('ConsultingReview', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onPressUpcoming={record =>
          isConsultingPendingStatus(record.status)
            ? navigation.navigate('ConsultingBooking', {
                expertId: record.expertId,
                durationId: record.durationId ?? 'd30',
                bookingId: record.id,
                sessionMode: record.sessionMode ?? 'online',
              })
            : navigation.navigate('ConsultingConversation', {
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
        onPressFindExpert={() => navigation.navigate('ConsultingExpertList')}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingNotificationsRouteScreen({
  navigation,
}: RootScreenProps<'ConsultingNotifications'>) {
  const {getAuthToken} = useAuthSession();
  return (
    <DetailRouteChrome
      routeName="ConsultingNotifications"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingNotificationsScreen
        authToken={getAuthToken()}
        onPressHistory={() => navigation.navigate('ConsultingHistory')}
        onPressRecord={record =>
          isConsultingChatAvailable(record)
            ? navigation.navigate('ConsultingConversation', {
                expertId: record.expertId,
                recordId: record.id,
                record,
              })
            : navigation.navigate('ConsultingHistory')
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
    route.params.record ?? null,
  );
  const expert = useConsultingExpert(route.params.expertId);

  useEffect(() => {
    let isMounted = true;

    if (route.params.record) {
      setRecord(route.params.record);
    }

    if (!authToken) {
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
  }, [authToken, route.params.record, route.params.recordId]);

  useEffect(() => {
    if (record && isConsultingChatAvailable(record)) {
      void markConsultingInboxRead('messages', [record]);
    }
  }, [record]);

  useEffect(() => {
    if (record && !isConsultingChatAvailable(record)) {
      navigation.replace('ConsultingHistory');
    }
  }, [navigation, record]);

  if (!expert || !record || !isConsultingChatAvailable(record)) {
    return (
      <DetailRouteChrome
        routeName="ConsultingConversation"
        onBack={() => goBackToConsulting(navigation)}>
        <ConsultingRouteLoading />
      </DetailRouteChrome>
    );
  }

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
        onConversationLeft={() => goBackToConsulting(navigation)}
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
  const [record, setRecord] = useState<ConsultingRecord | null>(null);
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

      setRecord(current => current ? {...current, reviewId: review.id} : current);
      Alert.alert('리뷰 저장', '상담사 프로필에 리뷰가 반영됐어요.', [
        {
          text: '확인',
          onPress: () => navigation.reset({
            index: 1,
            routes: [
              {name: 'MainTabs', params: {screen: 'ConsultingTab'}},
              {name: 'ConsultingHistory'},
            ],
          }),
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  if (!expert) {
    return (
      <DetailRouteChrome
        routeName="ConsultingReview"
        onBack={() => goBackToConsulting(navigation)}>
        <ConsultingRouteLoading />
      </DetailRouteChrome>
    );
  }

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
      <ConsultingMembershipScreen />
    </DetailRouteChrome>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 240,
  },
});
