import React from 'react';
import {Image, ScrollView, StyleSheet} from 'react-native';
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
      <Text
        numberOfLines={1}
        style={[styles.optionCardTitle, isActive ? styles.optionCardTitleActive : undefined]}>
        {label}
      </Text>
    </Button>
  );
}

function OriginalOptionPreview() {
  return (
    <View style={styles.originalPreview}>
      <View style={styles.originalPreviewLine} />
    </View>
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
    gap: spacing.md,
    minHeight: 136,
    paddingRight: spacing.xl,
  },
  optionCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 136,
    overflow: 'hidden',
    padding: spacing.sm,
    width: 104,
  },
  optionCardActive: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  optionCardPreview: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 92,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 84,
  },
  optionCardImage: {
    height: '100%',
    width: '100%',
  },
  optionCardTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  optionCardTitleActive: {
    color: colors.white,
  },
  originalPreview: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: iconSize.xl,
    justifyContent: 'center',
    width: iconSize.xl,
  },
  originalPreviewLine: {
    backgroundColor: colors.textSecondary,
    height: 1,
    opacity: 0.8,
    transform: [{rotate: '-28deg'}],
    width: iconSize.lg,
  },
  colorPreview: {
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: iconSize.xl,
    width: iconSize.xl,
  },
  textualPreview: {
    alignItems: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  typePreviewLineStrong: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 8,
    width: 54,
  },
  typePreviewLine: {
    backgroundColor: colors.textSecondary,
    borderRadius: radius.pill,
    height: 6,
    opacity: 0.7,
    width: 44,
  },
  typePreviewLineShort: {
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 6,
    width: 30,
  },
  texturePreview: {
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  texturePreviewDot: {
    backgroundColor: colors.textSecondary,
    borderRadius: radius.pill,
    height: spacing.md,
    opacity: 0.75,
    width: spacing.md,
  },
  texturePreviewDotLarge: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: iconSize.xs,
    width: iconSize.xs,
  },
  shapePreview: {
    height: 54,
    position: 'relative',
    width: 64,
  },
  shapePreviewCurve: {
    borderBottomColor: colors.textPrimary,
    borderBottomWidth: 2,
    borderRadius: radius.pill,
    bottom: 8,
    height: 28,
    left: 8,
    position: 'absolute',
    right: 8,
  },
  shapePreviewPoint: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: spacing.sm,
    position: 'absolute',
    width: spacing.sm,
  },
  shapePreviewPointTop: {
    left: 28,
    top: 4,
  },
  shapePreviewPointLeft: {
    bottom: 12,
    left: 6,
  },
  shapePreviewPointRight: {
    bottom: 12,
    right: 6,
  },
});
