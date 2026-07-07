import React from 'react';
import {Image, ScrollView, StyleSheet} from 'react-native';
import {Check, CircleOff} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  ARMakeupGuideData,
  FilterCategoryId,
  FilterCategory,
  MakeupArea,
  MakeupFilter,
} from '../../../shared/types/makeupGuide';
import {
  ORIGINAL_OPTION_CARD_ID,
  ORIGINAL_OPTION_CARD_LABEL,
  isTotalMakeupArea,
  resolveAreaColorOptions,
  resolveAreaTextureOptions,
  resolveAreaTypeOptions,
  type ARMakeupOptionGroupId,
  type ShapeOption,
} from '../services/arFilterOptionRules';

type ARFilterOptionCardListProps = {
  arGuideData: ARMakeupGuideData;
  availableMakeupFilters: readonly MakeupFilter[];
  onCategoryPress: (categoryId: FilterCategoryId) => void;
  onColorOptionPress: (optionId: string) => void;
  onMakeupFilterPress: (makeupFilter: MakeupFilter) => void;
  onOriginalOptionPress: () => void;
  onShapeOptionPress: (optionId: string) => void;
  onTextureOptionPress: (optionId: string) => void;
  onTypeOptionPress: (optionId: string) => void;
  selectedCategoryId: FilterCategoryId;
  selectedColorId: string;
  selectedMakeupArea: MakeupArea;
  selectedMakeupFilter: MakeupFilter;
  selectedMakeupOptionGroup: ARMakeupOptionGroupId;
  selectedPointMakeupLookId: string;
  selectedShapeId: string;
  selectedTextureId: string;
  selectedTotalMakeupLookId: string | null;
  selectedTypeId: string;
  shapeOptions: readonly ShapeOption[];
};

export const AR_FILTER_OPTION_CARD_ASPECT_RATIO = 1;
export const AR_FILTER_OPTION_CARD_COPY_PLACEMENT = 'outsideBelow' as const;
export const AR_FILTER_OPTION_CARD_LABEL_ALIGNMENT = 'center' as const;
export const AR_FILTER_OPTION_CARD_META_PLACEMENT = 'none' as const;
export const AR_FILTER_OPTION_CARD_ACTIVE_INDICATOR = 'pressedInset' as const;
export const AR_FILTER_OPTION_CARD_ACTIVE_DEPTH_EFFECT = 'insetShadow' as const;
export const AR_FILTER_OPTION_CARD_ACTIVE_EDGE_TREATMENT = 'shadowOnly' as const;
export const AR_FILTER_OPTION_CARD_ACTIVE_OUTLINE_VISIBILITY = 'hidden' as const;
export const AR_FILTER_OPTION_CARD_SELECTED_LABEL_VISIBILITY =
  'accessibilityOnly' as const;
export const AR_FILTER_OPTION_CARD_SELECTED_BADGE = 'topRightInsetCheck' as const;
export const AR_FILTER_OPTION_CARD_SELECTED_BADGE_OFFSET = spacing.sm;
export const AR_FILTER_OPTION_CARD_SELECTED_EFFECT =
  'innerGlowAndPressedDepth' as const;
export const AR_FILTER_OPTION_CARD_SURFACE_OVERFLOW = 'hidden' as const;
export const AR_FILTER_OPTION_CARD_PREVIEW_KINDS = [
  'makeupLook',
  'color',
  'type',
  'texture',
  'shape',
  'original',
] as const;

export const AR_FILTER_OPTION_CARD_WIDTH = 72;
export const AR_FILTER_OPTION_PICKER_MIN_HEIGHT = 104;
export const AR_FILTER_ORIGINAL_OPTION_ICON_SOURCE = 'lucide-react-native' as const;
export const AR_FILTER_ORIGINAL_OPTION_ICON_LIBRARY_NAME = 'CircleOff' as const;
export const AR_FILTER_ORIGINAL_OPTION_ICON_SIZE = iconSize.lg;
export const AR_FILTER_CATEGORY_SELECTOR_STYLE = 'compactTextTabs' as const;
export const AR_FILTER_CATEGORY_SELECTOR_CHROME = 'none' as const;
export const AR_FILTER_CATEGORY_SELECTOR_ACTIVE_INDICATOR = 'underline' as const;
export const AR_FILTER_CATEGORY_SELECTOR_HEIGHT = spacing.xxl;
export const AR_FILTER_CATEGORY_SELECTOR_VERTICAL_FOOTPRINT =
  AR_FILTER_CATEGORY_SELECTOR_HEIGHT + spacing.xs;

export function getARFilterCategoryTitle(): null {
  return null;
}

export function ARFilterOptionCardList({
  arGuideData,
  availableMakeupFilters,
  onCategoryPress,
  onColorOptionPress,
  onMakeupFilterPress,
  onOriginalOptionPress,
  onShapeOptionPress,
  onTextureOptionPress,
  onTypeOptionPress,
  selectedCategoryId,
  selectedColorId,
  selectedMakeupArea,
  selectedMakeupFilter,
  selectedMakeupOptionGroup,
  selectedPointMakeupLookId,
  selectedShapeId,
  selectedTextureId,
  selectedTotalMakeupLookId,
  selectedTypeId,
  shapeOptions,
}: ARFilterOptionCardListProps) {
  if (selectedMakeupOptionGroup === 'makeupLook') {
    const selectedMakeupLookId = isTotalMakeupArea(selectedMakeupArea)
      ? selectedTotalMakeupLookId
      : selectedPointMakeupLookId;

    return (
      <>
        {isTotalMakeupArea(selectedMakeupArea) ? (
          <HorizontalSection label={getARFilterCategoryTitle()}>
            {arGuideData.categories.map(category => (
              <CategoryTextTab
                category={category}
                key={category.id}
                isActive={category.id === selectedCategoryId}
                onPress={() => onCategoryPress(category.id)}
              />
            ))}
          </HorizontalSection>
        ) : null}

        <ScrollView
          contentContainerStyle={styles.optionPickerList}
          horizontal
          showsHorizontalScrollIndicator={false}>
          <OptionCard
            accessibilityLabel={
              isTotalMakeupArea(selectedMakeupArea)
                ? '원본 토탈메이크업룩 선택'
                : '원본 포인트메이크업룩 선택'
            }
            isActive={selectedMakeupLookId === ORIGINAL_OPTION_CARD_ID}
            label={ORIGINAL_OPTION_CARD_LABEL}
            onPress={onOriginalOptionPress}>
            <OriginalOptionPreview />
          </OptionCard>
          {availableMakeupFilters.map(makeupFilter => (
            <OptionCard
              key={makeupFilter.id}
              accessibilityLabel={`${makeupFilter.title} 룩 선택`}
              imageSource={makeupFilter.imageSource}
              isActive={makeupFilter.id === selectedMakeupLookId}
              label={makeupFilter.title}
              onPress={() => onMakeupFilterPress(makeupFilter)}
            />
          ))}
        </ScrollView>
      </>
    );
  }

  if (selectedMakeupOptionGroup === 'color') {
    return (
      <ScrollView
        contentContainerStyle={styles.optionPickerList}
        horizontal
        showsHorizontalScrollIndicator={false}>
        <OptionCard
          accessibilityLabel="원본 컬러 선택"
          isActive={selectedColorId === ORIGINAL_OPTION_CARD_ID}
          label={ORIGINAL_OPTION_CARD_LABEL}
          onPress={onOriginalOptionPress}>
          <OriginalOptionPreview />
        </OptionCard>
        {resolveAreaColorOptions(
          selectedMakeupArea,
          selectedMakeupFilter.colorOptions,
        ).map(option => (
          <OptionCard
            key={option.id}
            accessibilityLabel={`${option.label} 컬러 선택`}
            isActive={option.id === selectedColorId}
            label={option.label}
            onPress={() => onColorOptionPress(option.id)}
          >
            <ColorOptionPreview color={option.hex} />
          </OptionCard>
        ))}
      </ScrollView>
    );
  }

  if (selectedMakeupOptionGroup === 'type') {
    return (
      <ScrollView
        contentContainerStyle={styles.optionPickerList}
        horizontal
        showsHorizontalScrollIndicator={false}>
        <OptionCard
          accessibilityLabel="원본 타입 선택"
          isActive={selectedTypeId === ORIGINAL_OPTION_CARD_ID}
          label={ORIGINAL_OPTION_CARD_LABEL}
          onPress={onOriginalOptionPress}>
          <OriginalOptionPreview />
        </OptionCard>
        {resolveAreaTypeOptions(
          selectedMakeupArea,
          selectedMakeupFilter.typeOptions,
        ).map(option => (
          <OptionCard
            key={option.id}
            accessibilityLabel={`${option.label} 타입 선택`}
            isActive={option.id === selectedTypeId}
            label={option.label}
            onPress={() => onTypeOptionPress(option.id)}>
            <TypeOptionPreview />
          </OptionCard>
        ))}
      </ScrollView>
    );
  }

  if (selectedMakeupOptionGroup === 'texture') {
    return (
      <ScrollView
        contentContainerStyle={styles.optionPickerList}
        horizontal
        showsHorizontalScrollIndicator={false}>
        <OptionCard
          accessibilityLabel="원본 질감 선택"
          isActive={selectedTextureId === ORIGINAL_OPTION_CARD_ID}
          label={ORIGINAL_OPTION_CARD_LABEL}
          onPress={onOriginalOptionPress}>
          <OriginalOptionPreview />
        </OptionCard>
        {resolveAreaTextureOptions(
          selectedMakeupArea,
          selectedMakeupFilter.textureOptions,
        ).map(option => (
          <OptionCard
            key={option.id}
            accessibilityLabel={`${option.label} 질감 선택`}
            isActive={option.id === selectedTextureId}
            label={option.label}
            onPress={() => onTextureOptionPress(option.id)}>
            <TextureOptionPreview />
          </OptionCard>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.optionPickerList}
      horizontal
      showsHorizontalScrollIndicator={false}>
      <OptionCard
        accessibilityLabel="원본 핏 선택"
        isActive={selectedShapeId === ORIGINAL_OPTION_CARD_ID}
        label={ORIGINAL_OPTION_CARD_LABEL}
        onPress={onOriginalOptionPress}>
        <OriginalOptionPreview />
      </OptionCard>
      {shapeOptions.map(option => (
        <OptionCard
          key={option.id}
          accessibilityLabel={`${option.label} 핏 선택`}
          isActive={option.id === selectedShapeId}
          label={option.label}
          onPress={() => onShapeOptionPress(option.id)}>
          <ShapeOptionPreview />
        </OptionCard>
      ))}
    </ScrollView>
  );
}

type HorizontalSectionProps = {
  children: React.ReactNode;
  label?: string | null;
};

function HorizontalSection({children, label}: HorizontalSectionProps) {
  return (
    <YStack style={styles.horizontalSection}>
      {label ? <Text style={styles.panelLabel}>{label}</Text> : null}
      <ScrollView
        contentContainerStyle={styles.chipList}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {children}
      </ScrollView>
    </YStack>
  );
}

type CategoryTextTabProps = {
  category: FilterCategory;
  isActive: boolean;
  onPress: () => void;
};

function CategoryTextTab({category, isActive, onPress}: CategoryTextTabProps) {
  return (
    <Button
      accessibilityLabel={`${category.label} 카테고리 선택`}
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{opacity: 0.72}}
      style={styles.categoryTextTab}
      unstyled>
      <Text
        numberOfLines={1}
        style={[
          styles.categoryTextTabLabel,
          isActive ? styles.categoryTextTabLabelActive : undefined,
        ]}>
        {category.label}
      </Text>
      <View
        style={[
          styles.categoryTextTabIndicator,
          !isActive ? styles.categoryTextTabIndicatorInactive : undefined,
        ]}
      />
    </Button>
  );
}

type OptionCardProps = {
  accessibilityLabel: string;
  children?: React.ReactNode;
  imageSource?: MakeupFilter['imageSource'];
  isActive: boolean;
  label: string;
  onPress: () => void;
};

function OptionCard({
  accessibilityLabel,
  children,
  imageSource,
  isActive,
  label,
  onPress,
}: OptionCardProps) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{scale: 0.98}}
      style={[styles.optionCard, isActive ? styles.optionCardActive : undefined]}
      unstyled>
      <View
        style={[
          styles.optionCardSurface,
          isActive ? styles.optionCardSurfaceActive : undefined,
        ]}>
        <View style={styles.optionCardPreview}>
          {imageSource ? (
            <Image resizeMode="cover" source={imageSource} style={styles.optionCardImage} />
          ) : (
            children
          )}
        </View>
        {isActive ? <View pointerEvents="none" style={styles.optionCardActiveOverlay} /> : null}
      </View>
      <View style={[styles.optionCardCopy, isActive ? styles.optionCardCopyActive : undefined]}>
        <Text
          numberOfLines={2}
          style={[styles.optionCardTitle, isActive ? styles.optionCardTitleActive : undefined]}>
          {label}
        </Text>
      </View>
      {isActive ? (
        <View pointerEvents="none" style={styles.optionCardSelectedBadge}>
          <Check color={colors.textPrimary} size={iconSize.xs} strokeWidth={2.4} />
        </View>
      ) : null}
    </Button>
  );
}

function OriginalOptionPreview() {
  return (
    <CircleOff
      color={colors.textSecondary}
      pointerEvents="none"
      size={AR_FILTER_ORIGINAL_OPTION_ICON_SIZE}
      strokeWidth={1.9}
    />
  );
}

function ColorOptionPreview({color}: {color: string}) {
  return <View style={[styles.colorPreview, {backgroundColor: color}]} />;
}

function TypeOptionPreview() {
  return (
    <YStack style={styles.textualPreview}>
      <View style={styles.typePreviewLineStrong} />
      <View style={styles.typePreviewLine} />
      <View style={styles.typePreviewLineShort} />
    </YStack>
  );
}

function TextureOptionPreview() {
  return (
    <XStack style={styles.texturePreview}>
      <View style={styles.texturePreviewDot} />
      <View style={styles.texturePreviewDotLarge} />
      <View style={styles.texturePreviewDot} />
    </XStack>
  );
}

function ShapeOptionPreview() {
  return (
    <View style={styles.shapePreview}>
      <View style={[styles.shapePreviewPoint, styles.shapePreviewPointTop]} />
      <View style={[styles.shapePreviewPoint, styles.shapePreviewPointLeft]} />
      <View style={[styles.shapePreviewPoint, styles.shapePreviewPointRight]} />
      <View style={styles.shapePreviewCurve} />
    </View>
  );
}

const styles = StyleSheet.create({
  horizontalSection: {
    gap: spacing.xs,
  },
  panelLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  chipList: {
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: AR_FILTER_CATEGORY_SELECTOR_VERTICAL_FOOTPRINT,
  },
  categoryTextTab: {
    alignItems: 'center',
    gap: spacing.xs / 2,
    height: AR_FILTER_CATEGORY_SELECTOR_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  categoryTextTabIndicator: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 2,
    width: 16,
  },
  categoryTextTabIndicatorInactive: {
    opacity: 0,
  },
  categoryTextTabLabel: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  categoryTextTabLabelActive: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontWeight: typography.fontWeight.bold,
  },
  optionPickerList: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    minHeight: AR_FILTER_OPTION_PICKER_MIN_HEIGHT,
    paddingRight: spacing.sm,
  },
  optionCard: {
    alignItems: 'center',
    gap: spacing.xs,
    overflow: 'visible',
    position: 'relative',
    width: AR_FILTER_OPTION_CARD_WIDTH,
  },
  optionCardActive: {
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.18,
    shadowRadius: 9,
    transform: [{scale: 0.98}],
  },
  optionCardSurface: {
    alignItems: 'stretch',
    aspectRatio: AR_FILTER_OPTION_CARD_ASPECT_RATIO,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: AR_FILTER_OPTION_CARD_SURFACE_OVERFLOW,
    position: 'relative',
    width: '100%',
  },
  optionCardSurfaceActive: {
    borderColor: 'transparent',
    borderWidth: 1,
  },
  optionCardActiveOverlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    borderColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: radius.lg,
    borderWidth: 1,
    bottom: 4,
    left: 4,
    position: 'absolute',
    right: 4,
    shadowColor: colors.white,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.38,
    shadowRadius: 8,
    top: 4,
    zIndex: 2,
  },
  optionCardSelectedBadge: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetControlSurface,
    borderColor: colors.liquidGlassBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: AR_FILTER_OPTION_CARD_SELECTED_BADGE_OFFSET,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.16,
    shadowRadius: 6,
    top: AR_FILTER_OPTION_CARD_SELECTED_BADGE_OFFSET,
    width: 20,
    zIndex: 4,
  },
  optionCardPreview: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  optionCardImage: {
    height: '100%',
    width: '100%',
  },
  optionCardCopy: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: typography.lineHeight.xs * 2,
    paddingHorizontal: 0,
  },
  optionCardCopyActive: {
    opacity: 1,
  },
  optionCardTitle: {
    alignSelf: 'stretch',
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: AR_FILTER_OPTION_CARD_LABEL_ALIGNMENT,
  },
  optionCardTitleActive: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontWeight: typography.fontWeight.bold,
  },
  colorPreview: {
    height: '100%',
    opacity: 0.92,
    width: '100%',
  },
  textualPreview: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    borderRadius: radius.lg,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 58,
    width: 68,
  },
  typePreviewLineStrong: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: 6,
    width: 38,
  },
  typePreviewLine: {
    backgroundColor: colors.textSecondary,
    borderRadius: radius.pill,
    height: 4,
    opacity: 0.7,
    width: 32,
  },
  typePreviewLineShort: {
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 22,
  },
  texturePreview: {
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  texturePreviewDot: {
    backgroundColor: colors.textSecondary,
    borderRadius: radius.pill,
    height: spacing.sm,
    opacity: 0.75,
    width: spacing.sm,
  },
  texturePreviewDotLarge: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: spacing.md,
    width: spacing.md,
  },
  shapePreview: {
    height: 38,
    position: 'relative',
    width: 44,
  },
  shapePreviewCurve: {
    borderBottomColor: colors.textPrimary,
    borderBottomWidth: 2,
    borderRadius: radius.pill,
    bottom: 6,
    height: 20,
    left: 6,
    position: 'absolute',
    right: 6,
  },
  shapePreviewPoint: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: spacing.xs,
    position: 'absolute',
    width: spacing.xs,
  },
  shapePreviewPointTop: {
    left: 20,
    top: 4,
  },
  shapePreviewPointLeft: {
    bottom: 10,
    left: 4,
  },
  shapePreviewPointRight: {
    bottom: 10,
    right: 4,
  },
});
