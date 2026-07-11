import {useCallback, useMemo, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  Alert,
  type GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View as RNView,
} from 'react-native';
import {
  CalendarX2,
  ChevronRight,
  MessageCircle,
  MoreHorizontal,
} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingChip,
  ConsultingStatusBadge,
  ExpertAvatar,
} from '../components/consultingComponents';
import {
  consultingExperts,
  findConsultingExpertOrFirst,
} from '../mocks/consulting.mock';
import {
  cancelConsultingBooking,
  getConsultingBookings,
  getConsultingExperts,
} from '../services/consultingService';
import type {
  ConsultingExpert,
  ConsultingRecord,
  ConsultingRecordStatus,
} from '../types';

type HistoryFilterId = 'all' | Exclude<ConsultingRecordStatus, 'unavailable'>;

const historyFilters: readonly {id: HistoryFilterId; label: string}[] = [
  {id: 'all', label: '전체'},
  {id: 'requested', label: '신청'},
  {id: 'contacting', label: '확인 중'},
  {id: 'confirmed', label: '확정'},
  {id: 'completed', label: '완료'},
  {id: 'canceled', label: '취소'},
];

type ConsultingHistoryScreenProps = {
  onPressUpcoming: (record: ConsultingRecord) => void;
  onPressReschedule: (record: ConsultingRecord) => void;
  onPressReview: (record: ConsultingRecord) => void;
  onPressFindExpert: () => void;
};

export function ConsultingHistoryScreen({
  onPressUpcoming,
  onPressReschedule,
  onPressReview,
  onPressFindExpert,
}: ConsultingHistoryScreenProps) {
  const [filter, setFilter] = useState<HistoryFilterId>('all');
  const [records, setRecords] = useState<readonly ConsultingRecord[]>([]);
  const [experts, setExperts] =
    useState<readonly ConsultingExpert[]>(consultingExperts);
  const [isLoading, setIsLoading] = useState(true);
  const [openMenuRecordId, setOpenMenuRecordId] = useState<string | null>(null);
  const [cancellingRecordId, setCancellingRecordId] = useState<string | null>(
    null,
  );

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      setIsLoading(true);

      Promise.all([getConsultingBookings(), getConsultingExperts()]).then(
        ([data, expertData]) => {
          if (isMounted) {
            setRecords(data);
            setExperts(expertData);
          }
        },
      ).finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

      return () => {
        isMounted = false;
      };
    }, []),
  );

  const handleCancel = useCallback((record: ConsultingRecord) => {
    setOpenMenuRecordId(null);
    Alert.alert(
      '신청을 취소할까요?',
      '취소하면 운영팀과 프리랜서에게 더 이상 일정 확인을 요청하지 않아요.',
      [
        {text: '아니요', style: 'cancel'},
        {
          text: '취소하기',
          style: 'destructive',
          onPress: async () => {
            setCancellingRecordId(record.id);
            try {
              const canceled = await cancelConsultingBooking(record.id);
              if (!canceled) {
                Alert.alert(
                  '취소 실패',
                  '신청 상태를 변경하지 못했어요. 네트워크와 API 연결을 확인해 주세요.',
                  [{text: '확인'}],
                );
                return;
              }
              setRecords(current =>
                current.map(item => (item.id === canceled.id ? canceled : item)),
              );
            } finally {
              setCancellingRecordId(null);
            }
          },
        },
      ],
    );
  }, []);

  const visibleRecords = useMemo(
    () => records.filter(record => record.status !== 'unavailable'),
    [records],
  );

  const filteredRecords = useMemo(() => {
    if (filter === 'all') {
      return visibleRecords;
    }

    return visibleRecords.filter(record => record.status === filter);
  }, [filter, visibleRecords]);

  return (
    <ConsultingScreenScaffold contentGap={spacing.xl}>
      <ScrollView
        contentContainerStyle={styles.filterRow}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}>
        {historyFilters.map(item => (
          <ConsultingChip
            key={item.id}
            label={item.label}
            onPress={() => setFilter(item.id)}
            selected={item.id === filter}
          />
        ))}
      </ScrollView>

      {filteredRecords.length > 0 ? (
        <View style={styles.list}>
          {filteredRecords.map(record => (
            <HistoryCard
              expert={
                experts.find(item => item.id === record.expertId) ??
                findConsultingExpertOrFirst(record.expertId)
              }
              key={record.id}
              onPress={() =>
                isActiveRecordStatus(record.status)
                  ? onPressUpcoming(record)
                  : undefined
              }
              onPressCancel={() => handleCancel(record)}
              onPressReschedule={() => onPressReschedule(record)}
              onPressReview={() => onPressReview(record)}
              menuOpen={openMenuRecordId === record.id}
              onToggleMenu={() =>
                setOpenMenuRecordId(current =>
                  current === record.id ? null : record.id,
                )
              }
              record={record}
              cancelling={cancellingRecordId === record.id}
            />
          ))}
        </View>
      ) : isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>상담 내역을 불러오는 중이에요</Text>
          <Text style={styles.emptyDescription}>
            신청 접수 내역을 확인하고 있어요.
          </Text>
        </View>
      ) : (
        <View style={styles.empty}>
          <CalendarX2 color={consultingColors.textSoft} size={32} />
          <Text style={styles.emptyTitle}>
            {filter === 'requested'
              ? '접수된 신청이 없어요'
              : filter === 'contacting'
                ? '확인 중인 신청이 없어요'
              : filter === 'confirmed'
                ? '확정된 상담이 없어요'
              : filter === 'canceled'
                ? '취소된 상담이 없어요'
              : '상담 내역이 없어요'}
          </Text>
          <Text style={styles.emptyDescription}>
            프리랜서에게 첫 상담 신청을 보내보세요.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onPressFindExpert}
            style={({pressed}) => [
              styles.emptyCta,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={styles.emptyCtaText}>프리랜서 둘러보기</Text>
          </Pressable>
        </View>
      )}
    </ConsultingScreenScaffold>
  );
}

function isActiveRecordStatus(status: ConsultingRecordStatus): boolean {
  return (
    status === 'requested' ||
    status === 'contacting' ||
    status === 'confirmed' ||
    status === 'scheduled' ||
    status === 'in_progress'
  );
}

function HistoryCard({
  record,
  expert,
  onPress,
  onPressCancel,
  onPressReschedule,
  onPressReview,
  menuOpen,
  onToggleMenu,
  cancelling,
}: {
  record: ConsultingRecord;
  expert: ConsultingExpert;
  onPress: () => void;
  onPressCancel: () => void;
  onPressReschedule: () => void;
  onPressReview: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  cancelling: boolean;
}) {
  const isActive = isActiveRecordStatus(record.status);
  const canReschedule =
    record.status === 'requested' || record.status === 'contacting';
  const canCancel = isActive;
  const isCanceled = record.status === 'canceled';
  const canManage = canCancel;
  const canReview = record.status === 'completed' && !record.reviewId;
  const handleReviewPress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onPressReview();
  };
  const handleMenuPress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onToggleMenu();
  };
  const handleReschedulePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onToggleMenu();
    onPressReschedule();
  };
  const handleCancelPress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onPressCancel();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expert.name} ${record.dateLabel} 상담 ${
        isActive ? '신청 대화' : '진행 상태'
      }`}
      onPress={onPress}
      style={({pressed}) => [
        styles.card,
        isActive && styles.cardUpcoming,
        isCanceled && styles.cardCanceled,
        pressed && !isCanceled ? styles.pressed : null,
      ]}>
      <RNView style={styles.cardTopRow}>
        <RNView style={styles.cardStatusRow}>
          <ConsultingStatusBadge status={record.status} />
          <Text style={styles.cardDate}>{record.dateLabel}</Text>
        </RNView>
        {canManage ? (
          <Pressable
            accessibilityLabel="예약 관리 메뉴"
            accessibilityRole="button"
            hitSlop={8}
            onPress={handleMenuPress}
            style={({pressed}) => [
              styles.moreButton,
              pressed ? styles.pressed : null,
            ]}>
            <MoreHorizontal color={consultingColors.textMuted} size={18} />
          </Pressable>
        ) : null}
      </RNView>
      {menuOpen ? (
        <RNView style={styles.actionMenu}>
          {canReschedule ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={handleReschedulePress}
                style={({pressed}) => [
                  styles.actionMenuItem,
                  pressed ? styles.pressed : null,
                ]}>
                <Text style={styles.actionMenuText}>신청 수정</Text>
              </Pressable>
            </>
          ) : null}
          {canCancel ? (
            <>
              <Pressable
                accessibilityRole="button"
                disabled={cancelling}
                onPress={handleCancelPress}
                style={({pressed}) => [
                  styles.actionMenuItem,
                  cancelling && styles.actionMenuItemDisabled,
                  pressed && !cancelling ? styles.pressed : null,
                ]}>
                <Text style={styles.actionMenuDangerText}>
                  {cancelling ? '취소 중' : '신청 취소'}
                </Text>
              </Pressable>
            </>
          ) : null}
        </RNView>
      ) : null}
      <RNView style={styles.cardBodyRow}>
        <ExpertAvatar expert={expert} size={44} />
        <RNView style={styles.cardBody}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {expert.name} · {record.durationLabel}
          </Text>
          <Text numberOfLines={1} style={styles.cardMeta}>
            {record.categoryLabel}
          </Text>
        </RNView>
        {isActive ? (
          <RNView style={styles.enterCta}>
            <MessageCircle color={consultingColors.roseStrong} size={13} />
            <Text style={styles.enterCtaText}>대화 보기</Text>
          </RNView>
        ) : isCanceled ? (
          <RNView style={styles.canceledCta}>
            <Text style={styles.canceledCtaText}>취소됨</Text>
          </RNView>
        ) : record.status === 'completed' ? (
          <RNView style={styles.completedCta}>
            <Text style={styles.completedCtaText}>상담 완료</Text>
          </RNView>
        ) : (
          <RNView style={styles.summaryCta}>
            <Text style={styles.summaryCtaText}>상태 확인</Text>
            <ChevronRight color={consultingColors.textMuted} size={14} />
          </RNView>
        )}
      </RNView>
      {isCanceled ? (
        <Text style={styles.canceledNotice}>
          예약이 취소되었습니다. 전문가와 고객의 확인을 위해 이 내역은 보관됩니다.
        </Text>
      ) : null}
      {canReview ? (
        <Pressable
          accessibilityRole="button"
          onPress={handleReviewPress}
          style={({pressed}) => [
            styles.reviewCta,
            pressed ? styles.pressed : null,
          ]}>
          <Text style={styles.reviewCtaText}>리뷰 작성</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionMenu: {
    alignSelf: 'flex-end',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    minWidth: 142,
    overflow: 'hidden',
  },
  actionMenuDangerText: {
    color: consultingColors.danger,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  actionMenuItem: {
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  actionMenuItemDisabled: {
    opacity: 0.45,
  },
  actionMenuText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  card: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: 16,
  },
  cardUpcoming: {
    backgroundColor: consultingColors.surfaceSoft,
  },
  cardCanceled: {
    opacity: 0.68,
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
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  cardMeta: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
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
    justifyContent: 'space-between',
  },
  canceledCta: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  canceledCtaText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  canceledNotice: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  completedCta: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  completedCtaText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  cardStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.sheet,
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 44,
  },
  emptyCta: {
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    marginTop: 14,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  emptyCtaText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  emptyDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 10,
  },
  enterCta: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  enterCtaText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  reviewCta: {
    alignItems: 'center',
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  reviewCtaText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.xl,
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  list: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  moreButton: {
    alignItems: 'center',
    borderRadius: consultingRadius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  pressed: {
    opacity: 0.85,
  },
  reportCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: 16,
  },
  reportCardEyebrow: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  reportIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  reportIntro: {
    backgroundColor: consultingColors.surfaceSoft,
    borderRadius: consultingRadius.card,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  reportIntroDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  reportIntroTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  reportPreview: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: 3,
  },
  reportTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryCta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    minHeight: 36,
  },
  summaryCtaText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
});
