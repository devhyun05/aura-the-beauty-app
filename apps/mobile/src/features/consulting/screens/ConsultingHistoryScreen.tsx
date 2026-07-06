import {useMemo, useState} from 'react';
import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {CalendarX2, ChevronRight, Video} from 'lucide-react-native';
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
  consultingRecords,
  findConsultingExpertOrFirst,
} from '../mocks/consulting.mock';
import type {ConsultingRecord, ConsultingRecordStatus} from '../types';

type HistoryFilterId = 'all' | ConsultingRecordStatus;

const historyFilters: readonly {id: HistoryFilterId; label: string}[] = [
  {id: 'all', label: '전체'},
  {id: 'upcoming', label: '예정'},
  {id: 'completed', label: '완료'},
];

type ConsultingHistoryScreenProps = {
  onPressUpcoming: (record: ConsultingRecord) => void;
  onPressCompleted: (record: ConsultingRecord) => void;
  onPressFindExpert: () => void;
};

export function ConsultingHistoryScreen({
  onPressUpcoming,
  onPressCompleted,
  onPressFindExpert,
}: ConsultingHistoryScreenProps) {
  const [filter, setFilter] = useState<HistoryFilterId>('all');

  const filteredRecords = useMemo(() => {
    if (filter === 'all') {
      return consultingRecords;
    }

    return consultingRecords.filter(record => record.status === filter);
  }, [filter]);

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
          {filteredRecords.map(record => (
            <HistoryCard
              key={record.id}
              onPress={() =>
                record.status === 'upcoming'
                  ? onPressUpcoming(record)
                  : onPressCompleted(record)
              }
              record={record}
            />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <CalendarX2 color={consultingColors.textSoft} size={32} />
          <Text style={styles.emptyTitle}>
            {filter === 'upcoming'
              ? '예정된 상담이 없어요'
              : '상담 내역이 없어요'}
          </Text>
          <Text style={styles.emptyDescription}>
            전문가와 첫 상담을 시작해 보세요.
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
  onPress,
}: {
  record: ConsultingRecord;
  onPress: () => void;
}) {
  const expert = findConsultingExpertOrFirst(record.expertId);
  const isUpcoming = record.status === 'upcoming';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expert.name} ${record.dateLabel} 상담 ${
        isUpcoming ? '입장하기' : '요약 보기'
      }`}
      onPress={onPress}
      style={({pressed}) => [styles.card, pressed ? styles.pressed : null]}>
      <RNView style={styles.cardTopRow}>
        <ConsultingStatusBadge status={record.status} />
        <Text style={styles.cardDate}>{record.dateLabel}</Text>
      </RNView>
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
            <Video color={consultingColors.onAccent} size={13} />
            <Text style={styles.enterCtaText}>입장</Text>
          </RNView>
        ) : (
          <RNView style={styles.summaryCta}>
            <Text style={styles.summaryCtaText}>요약 보기</Text>
            <ChevronRight color={consultingColors.textMuted} size={14} />
          </RNView>
        )}
      </RNView>
    </Pressable>
  );
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
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  enterCtaText: {
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
  pressed: {
    opacity: 0.85,
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
