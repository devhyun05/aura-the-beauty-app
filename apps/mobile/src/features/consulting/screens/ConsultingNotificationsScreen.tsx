import {useCallback, useMemo, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {Bell, CalendarCheck2, ChevronRight} from 'lucide-react-native';
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
  SecondaryButton,
} from '../components/consultingComponents';
import {resolveConsultingExpert} from '../consultingCatalog';
import {
  getConsultingBookings,
  getConsultingExperts,
} from '../services/consultingService';
import {useConsultingBookingStatusSync} from '../hooks/useConsultingBookingStatusSync';
import {
  isConsultingNotificationStatus,
  markConsultingInboxRead,
} from '../services/consultingReadStateService';
import type {
  ConsultingExpert,
  ConsultingRecord,
  ConsultingRecordStatus,
} from '../types';

type ConsultingNotificationsScreenProps = {
  authToken?: string | null;
  onPressHistory: () => void;
  onPressRecord: (record: ConsultingRecord) => void;
};

export function ConsultingNotificationsScreen({
  authToken,
  onPressHistory,
  onPressRecord,
}: ConsultingNotificationsScreenProps) {
  const [records, setRecords] = useState<readonly ConsultingRecord[]>([]);
  const [experts, setExperts] = useState<readonly ConsultingExpert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshRecords = useCallback(() => {
    void getConsultingBookings(undefined, {force: true}).then(async nextRecords => {
      setRecords(nextRecords);
      await markConsultingInboxRead('notifications', nextRecords);
    });
  }, []);

  useConsultingBookingStatusSync({
    authToken,
    onStatusChange: refreshRecords,
    records,
  });

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      setIsLoading(true);

      Promise.all([
        getConsultingBookings(undefined, {force: true}),
        getConsultingExperts(),
      ])
        .then(async ([recordData, expertData]) => {
          if (isMounted) {
            setRecords(recordData);
            setExperts(expertData);
            await markConsultingInboxRead('notifications', recordData);
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
    }, []),
  );

  const notifications = useMemo(
    () =>
      records
        .filter(record => isConsultingNotificationStatus(record.status))
        .map(record => ({
          expert: resolveConsultingExpert(experts, record.expertId),
          record,
        })),
    [experts, records],
  );

  return (
    <ConsultingScreenScaffold contentGap={spacing.xl}>
      <View style={styles.hero}>
        <RNView style={styles.heroIcon}>
          <Bell color={consultingColors.roseStrong} size={22} />
        </RNView>
        <RNView style={styles.heroBody}>
          <Text style={styles.heroTitle}>알림</Text>
          <Text style={styles.heroText}>
            신청 접수, 일정 확인, 예약 확정처럼 놓치기 쉬운 진행 상태를 모아
            보여드려요.
          </Text>
        </RNView>
      </View>

      {notifications.length > 0 ? (
        <View style={styles.list}>
          {notifications.map(({expert, record}) => (
            <NotificationCard
              expert={expert}
              key={record.id}
              onPress={() => onPressRecord(record)}
              record={record}
            />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <CalendarCheck2 color={consultingColors.textSoft} size={32} />
          <Text style={styles.emptyTitle}>
            {isLoading ? '알림을 확인하고 있어요' : '새 알림이 없어요'}
          </Text>
          <Text style={styles.emptyText}>
            {isLoading
              ? '상담 신청 상태를 불러오는 중이에요.'
              : '예약 신청을 보내면 접수와 확정 상태가 여기에 표시돼요.'}
          </Text>
        </View>
      )}

      <SecondaryButton label="내 상담 내역 보기" onPress={onPressHistory} />
    </ConsultingScreenScaffold>
  );
}

function NotificationCard({
  expert,
  record,
  onPress,
}: {
  expert: ConsultingExpert;
  record: ConsultingRecord;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expert.name} 상담 알림 확인`}
      onPress={onPress}
      style={({pressed}) => [
        styles.notificationCard,
        pressed ? styles.pressed : null,
      ]}>
      <RNView style={styles.notificationTopRow}>
        <ConsultingStatusBadge status={record.status} />
        <Text style={styles.notificationDate}>{record.dateLabel}</Text>
      </RNView>
      <RNView style={styles.notificationBodyRow}>
        <ExpertAvatar expert={expert} size={42} />
        <RNView style={styles.notificationBody}>
          <Text numberOfLines={1} style={styles.notificationTitle}>
            {getNotificationTitle(record.status)}
          </Text>
          <Text numberOfLines={2} style={styles.notificationText}>
            {expert.name} · {getNotificationBody(record.status)}
          </Text>
        </RNView>
        <ChevronRight color={consultingColors.textSoft} size={17} />
      </RNView>
    </Pressable>
  );
}

function getNotificationTitle(status: ConsultingRecordStatus): string {
  if (status === 'in_progress') {
    return '상담이 진행 중이에요';
  }

  if (status === 'scheduled') {
    return '상담 일정이 확정됐어요';
  }

  if (status === 'confirmed') {
    return '예약이 확정됐어요';
  }

  if (status === 'contacting') {
    return '가능 시간을 확인 중이에요';
  }

  if (status === 'unavailable') {
    return '해당 일정은 조율이 어려워요';
  }

  return '예약 신청이 접수됐어요';
}

function getNotificationBody(status: ConsultingRecordStatus): string {
  if (status === 'in_progress') {
    return '톡에서 화상 상담으로 다시 입장할 수 있어요.';
  }

  if (status === 'scheduled') {
    return '톡에서 안내를 확인하고 상담 시간에 화상 상담을 시작하세요.';
  }

  if (status === 'confirmed') {
    return '톡에서 안내를 확인하고 상담 시간에 화상 상담을 시작하세요.';
  }

  if (status === 'contacting') {
    return '프리랜서 일정 확인 후 확정 여부를 알려드릴게요.';
  }

  if (status === 'unavailable') {
    return '내역에서 다른 시간으로 다시 신청할 수 있어요.';
  }

  return '아직 예약 완료 전이며 운영팀이 신청 내용을 확인하고 있어요.';
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.sheet,
    gap: spacing.sm,
    paddingHorizontal: 24,
    paddingVertical: 38,
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
  notificationBody: {
    flex: 1,
  },
  notificationBodyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  notificationCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: 16,
  },
  notificationDate: {
    color: consultingColors.textSoft,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  notificationText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: 3,
  },
  notificationTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  notificationTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.85,
  },
});
