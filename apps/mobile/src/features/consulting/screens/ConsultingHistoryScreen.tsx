import {useCallback, useMemo, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  Alert,
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  View as RNView,
} from 'react-native';
import {
  CalendarX2,
  ChevronRight,
  FileText,
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
  deleteConsultingBooking,
  getConsultingBookings,
  getConsultingExperts,
} from '../services/consultingService';
import type {
  ConsultingExpert,
  ConsultingRecord,
  ConsultingRecordStatus,
} from '../types';

type HistoryFilterId = 'all' | ConsultingRecordStatus | 'reports';

const historyFilters: readonly {id: HistoryFilterId; label: string}[] = [
  {id: 'all', label: '전체'},
  {id: 'upcoming', label: '예정'},
  {id: 'completed', label: '완료'},
  {id: 'reports', label: '리포트'},
  {id: 'canceled', label: '취소'},
];

type ConsultingHistoryScreenProps = {
  onPressCompleted: (record: ConsultingRecord) => void;
  onPressUpcoming: (record: ConsultingRecord) => void;
  onPressReschedule: (record: ConsultingRecord) => void;
  onPressReview: (record: ConsultingRecord) => void;
  onPressFindExpert: () => void;
};

export function ConsultingHistoryScreen({
  onPressCompleted,
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
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

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
      '예약을 취소할까요?',
      '상담 시작 24시간 전까지는 무료 취소되고, 이후에는 환불 금액이 달라질 수 있어요.',
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
                  '예약 상태를 변경하지 못했어요. 네트워크와 API 연결을 확인해 주세요.',
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

  const handleDelete = useCallback((record: ConsultingRecord) => {
    setOpenMenuRecordId(null);
    Alert.alert(
      '취소 내역을 삭제할까요?',
      '삭제하면 내 상담 내역에서 사라져요. 이미 취소된 예약만 삭제할 수 있어요.',
      [
        {text: '아니요', style: 'cancel'},
        {
          text: '삭제하기',
          style: 'destructive',
          onPress: async () => {
            setDeletingRecordId(record.id);
            try {
              const deleted = await deleteConsultingBooking(record.id);
              if (!deleted) {
                Alert.alert(
                  '삭제 실패',
                  '취소 내역을 삭제하지 못했어요. 네트워크와 API 연결을 확인해 주세요.',
                  [{text: '확인'}],
                );
                return;
              }

              setRecords(current =>
                current.filter(item => item.id !== record.id),
              );
            } finally {
              setDeletingRecordId(null);
            }
          },
        },
      ],
    );
  }, []);

  const reportRecords = useMemo(
    () =>
      records.filter(
        record => record.status === 'completed' && Boolean(record.summary),
      ),
    [records],
  );

  const filteredRecords = useMemo(() => {
    if (filter === 'all') {
      return records;
    }

    if (filter === 'reports') {
      return reportRecords;
    }

    return records.filter(record => record.status === filter);
  }, [filter, records, reportRecords]);

  return (
    <ConsultingScreenScaffold contentGap={spacing.xl}>
      <View style={styles.filterRow}>
        {historyFilters.map(item => (
          <ConsultingChip
            key={item.id}
            label={item.label}
            onPress={() => setFilter(item.id)}
            selected={item.id === filter}
          />
        ))}
      </View>

      {filteredRecords.length > 0 ? (
        <View style={styles.list}>
          {filter === 'reports' ? (
            <View style={styles.reportIntro}>
              <Text style={styles.reportIntroTitle}>저장된 상담 리포트</Text>
              <Text style={styles.reportIntroDescription}>
                전화 상담 후 전문가가 저장한 요약을 한 곳에 모았어요.
              </Text>
            </View>
          ) : null}
          {filteredRecords.map(record => (
            filter === 'reports' ? (
              <SummaryReportCard
                expert={
                  experts.find(item => item.id === record.expertId) ??
                  findConsultingExpertOrFirst(record.expertId)
                }
                key={record.id}
                onPress={() => onPressCompleted(record)}
                record={record}
              />
            ) : (
              <HistoryCard
                expert={
                  experts.find(item => item.id === record.expertId) ??
                  findConsultingExpertOrFirst(record.expertId)
                }
                key={record.id}
                onPress={() =>
                  record.status === 'upcoming'
                    ? onPressUpcoming(record)
                    : record.status === 'completed'
                      ? onPressCompleted(record)
                      : undefined
                }
                onPressCancel={() => handleCancel(record)}
                onPressDelete={() => handleDelete(record)}
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
                deleting={deletingRecordId === record.id}
              />
            )
          ))}
        </View>
      ) : isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>상담 내역을 불러오는 중이에요</Text>
          <Text style={styles.emptyDescription}>
            예약 저장 내역을 확인하고 있어요.
          </Text>
        </View>
      ) : (
        <View style={styles.empty}>
          <CalendarX2 color={consultingColors.textSoft} size={32} />
          <Text style={styles.emptyTitle}>
            {filter === 'upcoming'
              ? '예정된 상담이 없어요'
              : filter === 'canceled'
                ? '취소된 상담이 없어요'
              : filter === 'reports'
                ? '저장된 상담 리포트가 없어요'
              : '상담 내역이 없어요'}
          </Text>
          <Text style={styles.emptyDescription}>
            {filter === 'reports'
              ? '상담 완료 후 전문가가 요약을 저장하면 여기에 모아 보여드려요.'
              : '전문가와 첫 상담을 시작해 보세요.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onPressFindExpert}
            style={({pressed}) => [
              styles.emptyCta,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={styles.emptyCtaText}>전문가 둘러보기</Text>
          </Pressable>
        </View>
      )}
    </ConsultingScreenScaffold>
  );
}

function HistoryCard({
  record,
  expert,
  onPress,
  onPressCancel,
  onPressDelete,
  onPressReschedule,
  onPressReview,
  menuOpen,
  onToggleMenu,
  cancelling,
  deleting,
}: {
  record: ConsultingRecord;
  expert: ConsultingExpert;
  onPress: () => void;
  onPressCancel: () => void;
  onPressDelete: () => void;
  onPressReschedule: () => void;
  onPressReview: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  cancelling: boolean;
  deleting: boolean;
}) {
  const isUpcoming = record.status === 'upcoming';
  const isCanceled = record.status === 'canceled';
  const canManage = isUpcoming || isCanceled;
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
  const handleDeletePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onPressDelete();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expert.name} ${record.dateLabel} 상담 ${
        isUpcoming ? '예약됨' : '요약 보기'
      }`}
      onPress={onPress}
      style={({pressed}) => [
        styles.card,
        isUpcoming && styles.cardUpcoming,
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
          {isUpcoming ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={handleReschedulePress}
                style={({pressed}) => [
                  styles.actionMenuItem,
                  pressed ? styles.pressed : null,
                ]}>
                <Text style={styles.actionMenuText}>예약 수정</Text>
              </Pressable>
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
                  {cancelling ? '취소 중' : '예약 취소'}
                </Text>
              </Pressable>
            </>
          ) : null}
          {isCanceled ? (
            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={handleDeletePress}
              style={({pressed}) => [
                styles.actionMenuItem,
                deleting && styles.actionMenuItemDisabled,
                pressed && !deleting ? styles.pressed : null,
              ]}>
              <Text style={styles.actionMenuDangerText}>
                {deleting ? '삭제 중' : '취소 내역 삭제'}
              </Text>
            </Pressable>
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
        {isUpcoming ? (
          <RNView style={styles.enterCta}>
            <MessageCircle color={consultingColors.roseStrong} size={13} />
            <Text style={styles.enterCtaText}>대화 보기</Text>
          </RNView>
        ) : isCanceled ? (
          <RNView style={styles.canceledCta}>
            <Text style={styles.canceledCtaText}>취소됨</Text>
          </RNView>
        ) : (
          <RNView style={styles.summaryCta}>
            <Text style={styles.summaryCtaText}>요약 보기</Text>
            <ChevronRight color={consultingColors.textMuted} size={14} />
          </RNView>
        )}
      </RNView>
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

function SummaryReportCard({
  record,
  expert,
  onPress,
}: {
  record: ConsultingRecord;
  expert: ConsultingExpert;
  onPress: () => void;
}) {
  const firstNote = record.summary?.notes[0];

  return (
    <Pressable
      accessibilityLabel={`${expert.name} ${record.dateLabel} 상담 리포트 보기`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.reportCard,
        pressed ? styles.pressed : null,
      ]}>
      <RNView style={styles.cardTopRow}>
        <RNView style={styles.reportTitleRow}>
          <RNView style={styles.reportIcon}>
            <FileText color={consultingColors.roseStrong} size={16} />
          </RNView>
          <Text style={styles.reportCardEyebrow}>상담 요약 리포트</Text>
        </RNView>
        <Text style={styles.cardDate}>{record.dateLabel}</Text>
      </RNView>
      <RNView style={styles.cardBodyRow}>
        <ExpertAvatar expert={expert} size={44} />
        <RNView style={styles.cardBody}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {expert.name} · {record.durationLabel}
          </Text>
          <Text numberOfLines={2} style={styles.reportPreview}>
            {firstNote
              ? `${firstNote.label} ${firstNote.body}`
              : '전문가가 저장한 상담 요약을 확인해 보세요.'}
          </Text>
        </RNView>
        <RNView style={styles.summaryCta}>
          <Text style={styles.summaryCtaText}>열기</Text>
          <ChevronRight color={consultingColors.textMuted} size={14} />
        </RNView>
      </RNView>
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
  },
  list: {
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
