import {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View as RNView} from 'react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingChip,
  ExpertListCard,
} from '../components/consultingComponents';
import {consultingExperts} from '../mocks/consulting.mock';
import type {ConsultingCategoryId} from '../types';

type CategoryFilterId = ConsultingCategoryId | 'all';

type CategoryFilter = {
  id: CategoryFilterId;
  label: string;
};

const categoryFilters: readonly CategoryFilter[] = [
  {id: 'all', label: '전체'},
  {id: 'personalColor', label: '퍼스널컬러'},
  {id: 'makeupClinic', label: '메이크업'},
  {id: 'lipColor', label: '립·컬러'},
  {id: 'hairStyle', label: '헤어·스타일'},
];

type ConsultingExpertListScreenProps = {
  initialCategoryId?: ConsultingCategoryId | null;
  onPressExpert: (expertId: string) => void;
};

export function ConsultingExpertListScreen({
  initialCategoryId,
  onPressExpert,
}: ConsultingExpertListScreenProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilterId>(
    initialCategoryId ?? 'all',
  );

  const filteredExperts = useMemo(() => {
    if (selectedCategory === 'all') {
      return consultingExperts;
    }

    return consultingExperts.filter(expert =>
      expert.categoryIds.includes(selectedCategory),
    );
  }, [selectedCategory]);

  return (
    <ConsultingScreenScaffold contentGap={spacing.xl}>
      <View style={styles.intro}>
        <Text style={styles.title}>전문가를 선택하세요</Text>
        <Text style={styles.subtitle}>
          내 AI 리포트를 함께 볼 전문가를 골라보세요.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {categoryFilters.map(filter => (
          <ConsultingChip
            key={filter.id}
            label={filter.label}
            onPress={() => setSelectedCategory(filter.id)}
            selected={filter.id === selectedCategory}
          />
        ))}
      </ScrollView>

      <View style={styles.listSection}>
        <Text style={styles.countText}>전문가 {filteredExperts.length}명</Text>
        {filteredExperts.length > 0 ? (
          <View style={styles.list}>
            {filteredExperts.map(expert => (
              <ExpertListCard
                expert={expert}
                key={expert.id}
                onPress={() => onPressExpert(expert.id)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              해당 분야의 전문가를 준비 중이에요.
            </Text>
          </View>
        )}
      </View>
    </ConsultingScreenScaffold>
  );
}

const styles = StyleSheet.create({
  countText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  empty: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: 18,
    paddingVertical: 40,
  },
  emptyText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  filterRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  intro: {
    gap: 6,
  },
  list: {
    gap: spacing.md,
  },
  listSection: {
    gap: spacing.md,
  },
  subtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
});
