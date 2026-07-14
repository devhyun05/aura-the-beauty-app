import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {CalendarClock, MessageCircle} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingStatusBadge,
  ExpertAvatar,
  PrimaryButton,
} from '../components/consultingComponents';
import {resolveConsultingExpert} from '../consultingCatalog';
import {
  getConsultingBookings,
  getConsultingExperts,
} from '../services/consultingService';
import {
  getConsultingUnreadRecordIds,
  markConsultingInboxRead,
} from '../services/consultingReadStateService';
import {
  isConsultingActiveStatus,
  isConsultingChatAvailable,
} from '../services/consultingFlow';
import {
  connectConsultingConversationSocket,
  type ConsultingConversationSocketClient,
} from '../services/consultingRealtimeService';
import type {
  ConsultingExpert,
  ConsultingRecord,
  ConsultingRecordStatus,
} from '../types';

type ConsultingMessagesScreenProps = {
  authToken?: string | null;
  onPressConversation: (record: ConsultingRecord) => void;
  onPressFindExpert: () => void;
};

export function ConsultingMessagesScreen({
  authToken,
  onPressConversation,
  onPressFindExpert,
}: ConsultingMessagesScreenProps) {
  const [records, setRecords] = useState<readonly ConsultingRecord[]>([]);
  const [experts, setExperts] = useState<readonly ConsultingExpert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadMessageBookingIds, setUnreadMessageBookingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const subscriptionRecordsRef = useRef<readonly ConsultingRecord[]>([]);

  const refreshRecords = useCallback(() => {
    void getConsultingBookings(undefined, {force: true}).then(async recordData => {
      setRecords(recordData);
      setUnreadMessageBookingIds(
        await getConsultingUnreadRecordIds('messages', recordData),
      );
      await markConsultingInboxRead('messages', recordData);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      if (!authToken) {
        setRecords([]);
        setIsLoading(false);
        return () => {
          isMounted = false;
        };
      }

      setIsLoading(true);

      Promise.all([getConsultingBookings(), getConsultingExperts()])
        .then(async ([recordData, expertData]) => {
          if (isMounted) {
            setRecords(recordData);
            setExperts(expertData);
            setUnreadMessageBookingIds(
              await getConsultingUnreadRecordIds('messages', recordData),
            );
            await markConsultingInboxRead('messages', recordData);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }, [authToken]),
  );

  const activeRecords = useMemo(() => {
    const visibleConversationIds = new Set<string>();
    return records.filter(record => {
      const conversationId = record.conversationId ?? record.expertId;
      if (
        record.customerLeftAt ||
        !isConsultingChatAvailable(record) ||
        visibleConversationIds.has(conversationId)
      ) {
        return false;
      }
      visibleConversationIds.add(conversationId);
      return true;
    });
  }, [records]);
  const subscriptionRecords = useMemo(
    () =>
      records.filter(
        record =>
          !record.customerLeftAt &&
          (isConsultingActiveStatus(record.status) ||
            isConsultingChatAvailable(record)),
      ),
    [records],
  );
  const subscriptionRecordsKey = useMemo(
    () =>
      subscriptionRecords
        .map(record => `${record.id}:${record.status}:${record.chatAvailable}`)
        .join(','),
    [subscriptionRecords],
  );

  useEffect(() => {
    subscriptionRecordsRef.current = subscriptionRecords;
  }, [subscriptionRecords]);

  useEffect(() => {
    if (!authToken) {
      return undefined;
    }

    const sockets: ConsultingConversationSocketClient[] = subscriptionRecordsRef.current.map(
      record =>
        connectConsultingConversationSocket({
          authToken,
          bookingId: record.id,
          onEvent: event => {
            if (event.type === 'booking.status' || event.type === 'call.status') {
              refreshRecords();
              return;
            }
            if (
              event.type === 'message.new' &&
              event.senderType !== 'user'
            ) {
              setUnreadMessageBookingIds(current => {
                if (current.has(record.id)) {
                  return current;
                }
                return new Set([...current, record.id]);
              });
            }
          },
          participantType: 'user',
        }),
    );

    return () => {
      sockets.forEach(socket => socket.close());
    };
  }, [authToken, refreshRecords, subscriptionRecordsKey]);

  return (
    <ConsultingScreenScaffold contentGap={spacing.xl}>
      <View style={styles.hero}>
        <RNView style={styles.heroIcon}>
          <MessageCircle color={consultingColors.roseStrong} size={22} />
        </RNView>
        <RNView style={styles.heroBody}>
          <Text style={styles.heroTitle}>상담 톡</Text>
          <Text style={styles.heroText}>
            톡은 일정 확인과 사전 질문 공간이에요. 실제 상담은 예약 확정 후
            통화로 진행돼요.
          </Text>
        </RNView>
      </View>

      {activeRecords.length > 0 ? (
        <View style={styles.list}>
          {activeRecords.map(record => {
            const expert = resolveConsultingExpert(experts, record.expertId);
            return (
              <MessageCard
                expert={expert}
                hasUnread={unreadMessageBookingIds.has(record.id)}
                key={record.id}
                onPress={() => {
                  setUnreadMessageBookingIds(current => {
                    if (!current.has(record.id)) {
                      return current;
                    }
                    const next = new Set(current);
                    next.delete(record.id);
                    return next;
                  });
                  onPressConversation(record);
                }}
                record={record}
              />
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <CalendarClock color={consultingColors.textSoft} size={32} />
          <Text style={styles.emptyTitle}>
            {isLoading ? '상담 톡을 불러오는 중이에요' : '열린 상담 톡이 없어요'}
          </Text>
          <Text style={styles.emptyText}>
            {isLoading
              ? '확정된 상담을 확인하고 있어요.'
              : '예약이 확정되면 전문가와 나눌 상담 톡이 여기에 열려요.'}
          </Text>
          {!isLoading ? (
            <PrimaryButton label="프리랜서 둘러보기" onPress={onPressFindExpert} />
          ) : null}
        </View>
      )}
    </ConsultingScreenScaffold>
  );
}

function MessageCard({
  expert,
  hasUnread,
  record,
  onPress,
}: {
  expert: ConsultingExpert;
  hasUnread: boolean;
  record: ConsultingRecord;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expert.name} 상담 톡 열기`}
      onPress={onPress}
      style={({pressed}) => [styles.card, pressed ? styles.pressed : null]}>
      <RNView style={styles.cardTopRow}>
        <ConsultingStatusBadge status={record.status} />
        <RNView style={styles.cardMeta}>
          {hasUnread ? <Text style={styles.unreadBadge}>새 메시지</Text> : null}
          <Text style={styles.cardDate}>{record.dateLabel}</Text>
        </RNView>
      </RNView>
      <RNView style={styles.cardBodyRow}>
        <ExpertAvatar expert={expert} size={46} />
        <RNView style={styles.cardBody}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {expert.name} · {record.durationLabel}
          </Text>
          <Text numberOfLines={2} style={styles.cardText}>
            {getMessagePreview(record.status)}
          </Text>
        </RNView>
        <RNView style={styles.talkBadge}>
          <Text style={styles.talkBadgeText}>톡 열기</Text>
        </RNView>
      </RNView>
    </Pressable>
  );
}

function getMessagePreview(status: ConsultingRecordStatus): string {
  if (status === 'in_progress') {
    return '상담이 진행 중이에요. 화상 상담으로 다시 입장할 수 있어요.';
  }

  if (status === 'scheduled') {
    return '상담 시간이 확정됐어요. 안내와 화상 상담 버튼을 확인하세요.';
  }

  if (status === 'confirmed') {
    return '예약이 확정됐어요. 안내와 화상 상담 버튼을 확인하세요.';
  }

  if (status === 'contacting') {
    return '가능 일정 확인 중이에요. 필요한 메시지를 톡으로 주고받아요.';
  }

  if (status === 'completed') {
    return '상담은 완료됐지만 이 톡에서 후속 질문을 계속 주고받을 수 있어요.';
  }

  return '신청이 접수됐어요. 아직 예약 완료 전이에요.';
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: 16,
  },
  cardBody: {
    flex: 1,
  },
  cardBodyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardDate: {
    color: consultingColors.textSoft,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  cardMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cardText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: 3,
  },
  cardTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  cardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  empty: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.sheet,
    gap: spacing.md,
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  emptyText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'flex-start',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 16,
  },
  heroBody: {
    flex: 1,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  heroText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: 4,
  },
  heroTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  list: {
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  talkBadge: {
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  talkBadgeText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  unreadBadge: {
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
});
