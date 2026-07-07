import {useEffect, useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View as RNView} from 'react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {ExpertListCard} from '../components/consultingComponents';
import {consultingExperts} from '../mocks/consulting.mock';
import {getConsultingExperts} from '../services/consultingService';
import type {ConsultingCategoryId, ConsultingExpert} from '../types';

type CategoryFilterId = ConsultingCategoryId | 'all';

type CategoryFilter = {
  id: CategoryFilterId;
  label: string;
};

const categoryFilters: readonly CategoryFilter[] = [
  {id: 'all', label: '전체'},
  {id: 'personalColor', label: '퍼스널컬러'},
  {id: 'makeupClinic', label: '메이크업'},
  {id: 'lipColor', label: '패션'},
  {id: 'hairStyle', label: '헤어'},
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
  const [experts, setExperts] =
    useState<readonly ConsultingExpert[]>(consultingExperts);

  useEffect(() => {
    let isMounted = true;

    getConsultingExperts().then(data => {
      if (isMounted) {
        setExperts(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredExperts = useMemo(() => {
    if (selectedCategory === 'all') {
      return experts;
    }

    return experts.filter(expert =>
      expert.categoryIds.includes(selectedCategory),
    );
  }, [experts, selectedCategory]);

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
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}>
        {categoryFilters.map(filter => (
          <CategoryFilterCard
            key={filter.id}
            onPress={() => setSelectedCategory(filter.id)}
            filter={filter}
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

function CategoryFilterCard({
  filter,
  selected,
  onPress,
}: {
  filter: CategoryFilter;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={({pressed}) => [
        styles.filterPill,
        selected && styles.filterPillSelected,
        pressed ? styles.pressed : null,
      ]}>
      <Text
        numberOfLines={1}
        style={[
          styles.filterLabel,
          selected && styles.filterLabelSelected,
        ]}>
        {filter.label}
      </Text>
    </Pressable>
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
  filterPill: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: 999,
    borderWidth: 1.5,
    justifyContent: 'center',
    height: 34,
    minWidth: 64,
    paddingHorizontal: 13,
  },
  filterPillSelected: {
    backgroundColor: consultingColors.text,
    borderColor: consultingColors.text,
  },
  filterLabel: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  filterLabelSelected: {
    color: '#FFFFFF',
  },
  filterRow: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  filterScroll: {
    flexGrow: 0,
    maxHeight: 38,
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
  pressed: {
    opacity: 0.85,
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
