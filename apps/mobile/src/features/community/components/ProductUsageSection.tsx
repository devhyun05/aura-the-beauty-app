import {Timer} from 'lucide-react-native';
import {StyleSheet} from 'react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, communityColors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {CommunityDifficulty, CommunityProductUsage, CommunityProductUsageItem} from '../types';
import {difficultyLabels} from '../utils/format';

const groups: Array<{key: keyof CommunityProductUsage; label: string; tone: string}> = [
  {key: 'base', label: '베이스', tone: communityColors.swatchBase},
  {key: 'eye', label: '아이', tone: communityColors.swatchEye},
  {key: 'cheek', label: '치크', tone: communityColors.swatchCheek},
  {key: 'lip', label: '립', tone: communityColors.swatchLip},
];

/**
 * 레시피 카드.
 * 스펙: 제품 0개면 섹션 자체를 숨기고, 1개 이상이면 입력된 그룹만 렌더한다(빈 그룹 행 미노출).
 * 난이도·소요시간은 값이 있을 때만 헤더 우측 스트립으로 노출한다.
 */
export function ProductUsageSection({
  difficulty,
  durationMinutes,
  productUsage,
}: {
  difficulty?: CommunityDifficulty | null;
  durationMinutes?: number | null;
  productUsage: CommunityProductUsage;
}) {
  const visibleGroups = groups.filter(group => productUsage[group.key].length > 0);

  if (visibleGroups.length === 0) {
    return null;
  }

  const hasDuration = durationMinutes != null;
  const hasDifficulty = difficulty != null;

  return (
    <YStack style={styles.card}>
      <XStack style={styles.headRow}>
        <Text style={styles.headText}>RECIPE · 사용 제품</Text>
        {hasDuration || hasDifficulty ? (
          <XStack style={styles.recipeStrip}>
            <Timer color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
            {hasDuration ? <Text style={styles.recipeText}>{durationMinutes}분</Text> : null}
            {hasDuration && hasDifficulty ? <Text style={styles.recipeSeparator}>·</Text> : null}
            {hasDifficulty && difficulty ? (
              <Text style={styles.recipeText}>{difficultyLabels[difficulty]}</Text>
            ) : null}
          </XStack>
        ) : null}
      </XStack>

      {visibleGroups.map(group => (
        <XStack key={group.key} style={styles.group}>
          <View style={[styles.swatch, {backgroundColor: group.tone}]} />
          <YStack style={styles.groupCopy}>
            <Text style={styles.groupTitle}>{group.label}</Text>
            <XStack style={styles.items}>
              {productUsage[group.key].map((item, index) => (
                <ProductChip item={item} key={`${group.key}-${item.name}-${index}`} />
              ))}
            </XStack>
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

function ProductChip({item}: {item: CommunityProductUsageItem}) {
  return (
    <XStack style={styles.productChip}>
      <Text numberOfLines={1} style={styles.productName}>{item.name}</Text>
      {item.shade ? <Text numberOfLines={1} style={styles.productShade}> · {item.shade}</Text> : null}
    </XStack>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  group: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    // 추후 퍼스널컬러 매칭 배지가 들어올 우측 여백 예약.
    paddingRight: spacing.xxl,
  },
  groupCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  groupTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  headRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headText: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  items: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  productChip: {
    alignItems: 'center',
    backgroundColor: communityColors.surfaceWarm,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    maxWidth: 220,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  productName: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  productShade: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  recipeSeparator: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  recipeStrip: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  recipeText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  swatch: {
    borderColor: 'rgba(17, 17, 17, 0.08)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 20,
    marginTop: 1,
    width: 20,
  },
});
