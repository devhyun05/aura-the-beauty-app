import React from 'react';
import {Image, ScrollView, StyleSheet} from 'react-native';
import {CircleOff} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  ARMakeupGuideData,
  FilterCategoryId,
  MakeupArea,
  MakeupFilter,
} from '../../../shared/types/makeupGuide';
import {OverlayChipButton} from '../../../shared/ui';
import {
  ORIGINAL_OPTION_CARD_ID,
  ORIGINAL_OPTION_CARD_LABEL,
  isTotalMakeupArea,
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

export const AR_FILTER_OPTION_CARD_ASPECT_RATIO = 0.78;
export const AR_FILTER_OPTION_CARD_COPY_PLACEMENT = 'bottomScrim' as const;
export const AR_FILTER_OPTION_CARD_META_PLACEMENT = 'none' as const;
export const AR_FILTER_OPTION_CARD_ACTIVE_INDICATOR = 'pressedInset' as const;
export const AR_FILTER_OPTION_CARD_ACTIVE_DEPTH_EFFECT = 'insetShadow' as const;
export const AR_FILTER_OPTION_CARD_ACTIVE_EDGE_TREATMENT = 'shadowOnly' as const;
export const AR_FILTER_OPTION_CARD_ACTIVE_OUTLINE_VISIBILITY = 'hidden' as const;
export const AR_FILTER_OPTION_CARD_SELECTED_LABEL_VISIBILITY =
  'accessibilityOnly' as const;
export const AR_FILTER_OPTION_CARD_PREVIEW_KINDS = [
  'makeupLook',
  'color',
  'type',
  'texture',
  'shape',
  'original',
] as const;

export const AR_FILTER_OPTION_CARD_WIDTH = 84;
export const AR_FILTER_OPTION_PICKER_MIN_HEIGHT = 112;
export const AR_FILTER_ORIGINAL_OPTION_ICON_SOURCE = 'lucide-react-native' as const;
export const AR_FILTER_ORIGINAL_OPTION_ICON_LIBRARY_NAME = 'CircleOff' as const;
export const AR_FILTER_ORIGINAL_OPTION_ICON_SIZE = iconSize.lg;

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
              <OverlayChipButton
                key={category.id}
                isActive={category.id === selectedCategoryId}
                label={category.label}
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
        {selectedMakeupFilter.colorOptions.map(option => (
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
        {selectedMakeupFilter.typeOptions.map(option => (
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
        {selectedMakeupFilter.textureOptions.map(option => (
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
        accessibilityLabel="원본 형태 선택"
        isActive={selectedShapeId === ORIGINAL_OPTION_CARD_ID}
        label={ORIGINAL_OPTION_CARD_LABEL}
        onPress={onOriginalOptionPress}>
        <OriginalOptionPreview />
      </OptionCard>
      {shapeOptions.map(option => (
        <OptionCard
          key={option.id}
          accessibilityLabel={`${option.label} 형태 선택`}
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
      <View style={styles.optionCardPreview}>
        {imageSource ? (
          <Image resizeMode="cover" source={imageSource} style={styles.optionCardImage} />
        ) : (
          children
        )}
      </View>
      <View style={styles.optionCardCopy}>
        <Text numberOfLines={1} style={styles.optionCardTitle}>
          {label}
        </Text>
      </View>
      {isActive ? <View pointerEvents="none" style={styles.optionCardActiveOverlay} /> : null}
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
    gap: spacing.sm,
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
    gap: spacing.sm,
  },
  optionPickerList: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: AR_FILTER_OPTION_PICKER_MIN_HEIGHT,
    paddingRight: spacing.sm,
  },
  optionCard: {
    alignItems: 'stretch',
    aspectRatio: AR_FILTER_OPTION_CARD_ASPECT_RATIO,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    width: AR_FILTER_OPTION_CARD_WIDTH,
  },
  optionCardActive: {
    borderColor: 'transparent',
    borderWidth: 1,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.14,
    shadowRadius: 4,
    transform: [{scale: 0.98}],
  },
  optionCardActiveOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.10)',
    borderRadius: radius.lg,
    bottom: 4,
    left: 4,
    position: 'absolute',
    right: 4,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.34,
    shadowRadius: 10,
    top: 4,
    zIndex: 2,
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
    backgroundColor: 'rgba(17, 17, 17, 0.70)',
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: 0,
    zIndex: 1,
  },
  optionCardTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 7,
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
    backgroundColor: colors.textPrimary,
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
    backgroundColor: colors.textPrimary,
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
    backgroundColor: colors.textPrimary,
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
