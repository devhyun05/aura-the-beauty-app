import {Image, Pressable, ScrollView, StyleSheet} from 'react-native';
import {Palette, Sparkles} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import type {ReferenceMakeupPhoto} from '../types';

export type MakeupRecipeListItem = {
  id: string;
  photo: ReferenceMakeupPhoto;
  subtitle: string;
  tags: string[];
  title: string;
};

type MakeupRecipeListScreenProps = {
  onPressRecipe?: (item: MakeupRecipeListItem) => void;
  recipes: MakeupRecipeListItem[];
};

export function MakeupRecipeListScreen({
  onPressRecipe,
  recipes,
}: MakeupRecipeListScreenProps) {
  return (
    <AppScreen contentGap={spacing.lg} scroll={false} topPadding="none">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {recipes.length > 0 ? (
          recipes.map((recipe) => (
            <MakeupRecipeCard
              key={recipe.id}
              onPress={() => onPressRecipe?.(recipe)}
              recipe={recipe}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>저장된 메이크업 레시피가 없어요.</Text>
          </View>
        )}
      </ScrollView>
    </AppScreen>
  );
}

function MakeupRecipeCard({
  onPress,
  recipe,
}: {
  onPress: () => void;
  recipe: MakeupRecipeListItem;
}) {
  return (
    <Pressable
      accessibilityLabel={`${recipe.title} 레시피 보기`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <Image resizeMode="cover" source={recipe.photo.imageSource} style={styles.thumbnail} />
      <YStack style={styles.cardBody}>
        <XStack style={styles.titleRow}>
          <YStack style={styles.titleGroup}>
            <Text numberOfLines={1} style={styles.eyebrow}>
              {recipe.photo.referenceSource === 'album' ? '앨범 레퍼런스' : '촬영 레퍼런스'}
            </Text>
            <Text numberOfLines={2} style={styles.title}>
              {recipe.title}
            </Text>
          </YStack>
          <View style={styles.recipeIcon}>
            <Palette color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
          </View>
        </XStack>

        <Text numberOfLines={2} style={styles.subtitle}>
          {recipe.subtitle}
        </Text>

        <XStack style={styles.tagRow}>
          {recipe.tags.slice(0, 3).map((tag) => (
            <XStack key={tag} style={styles.tag}>
              <Sparkles color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
              <Text numberOfLines={1} style={styles.tagText}>
                {tag}
              </Text>
            </XStack>
          ))}
        </XStack>
      </YStack>
    </Pressable>
  );
}

const cardShadow = {
  shadowColor: shadows.soft.shadowColor,
  shadowOffset: shadows.soft.shadowOffset,
  shadowOpacity: shadows.soft.shadowOpacity,
  shadowRadius: shadows.soft.shadowRadius,
} as const;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    ...cardShadow,
  },
  cardBody: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  cardPressed: {
    opacity: 0.74,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyState: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 180,
    padding: spacing.xl,
  },
  emptyStateText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  recipeIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  tag: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    gap: spacing.xs,
    maxWidth: '48%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagRow: {
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tagText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  thumbnail: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 118,
    width: 94,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  titleGroup: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'flex-start',
    gap: spacing.md,
  },
});
