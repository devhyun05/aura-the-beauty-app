import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupLookPreview} from '../../../shared/types/profile';
import {
  AppScreen,
  ImagePlaceholder,
  PagedGrid,
} from '../../../shared/ui';

type MakeupLookListScreenProps = {
  likedMakeupLooks?: readonly MakeupLookPreview[];
  onPressMakeupLook?: (makeupLook: MakeupLookPreview) => void;
};

export function MakeupLookListScreen({
  likedMakeupLooks = [],
  onPressMakeupLook,
}: MakeupLookListScreenProps = {}) {
  const {width} = useWindowDimensions();
  const gap = spacing.md;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);
  const visibleMakeupLooks = [...likedMakeupLooks];

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      {visibleMakeupLooks.length > 0 ? (
        <PagedGrid
          data={visibleMakeupLooks}
          keyExtractor={(makeupLook) => makeupLook.id}
          pageSize={10}
          pageStyle={[styles.grid, {gap}]}
          pageWidth={contentWidth}
          renderItem={(makeupLook) => (
            <Pressable
              accessibilityLabel={`${makeupLook.title} 필터 열기`}
              accessibilityRole="button"
              disabled={!makeupLook.makeupPresetValues.sourceFilterId}
              onPress={() => onPressMakeupLook?.(makeupLook)}
              style={({pressed}) => [
                styles.card,
                {width: cardWidth},
                pressed && styles.pressed,
              ]}>
              <View style={styles.imageArea}>
                <ImagePlaceholder
                  borderRadius={radius.md}
                  resizeMode="cover"
                  source={makeupLook.imageSource}
                />
              </View>
              <Text numberOfLines={1} style={styles.title}>
                {makeupLook.title}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>좋아요한 메이크업 필터가 없어요.</Text>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    minWidth: 0,
  },
  empty: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 180,
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  imageArea: {
    aspectRatio: 0.82,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  pressed: {
    opacity: 0.78,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
});
