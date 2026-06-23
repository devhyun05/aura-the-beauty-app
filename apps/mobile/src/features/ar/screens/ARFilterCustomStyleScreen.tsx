import React, {useState} from 'react';
import {Image, ScrollView, StyleSheet} from 'react-native';
import {ChevronLeft, Save} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getDefaultMakeupFilter,
  getMockARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {FacePartId, StyleOptionGroupId} from '../../../shared/types/makeupGuide';
import {
  getMockFilterStyleState,
  updateFilterStyleSelection,
  type FilterStyleState,
} from '../services/filterCustomizationService';

type ARFilterCustomStyleScreenProps = {
  onBack?: () => void;
  onOpenLocationAdjust?: () => void;
  onSave?: () => void;
};

const STYLE_GROUPS: readonly {id: StyleOptionGroupId; label: string}[] = [
  {id: 'color', label: '컬러'},
  {id: 'type', label: '타입'},
  {id: 'texture', label: '질감'},
];

export function ARFilterCustomStyleScreen({
  onBack,
  onOpenLocationAdjust,
  onSave,
}: ARFilterCustomStyleScreenProps) {
  const insets = useSafeAreaInsets();
  const arGuideData = getMockARMakeupGuideData();
  const filter = getDefaultMakeupFilter(arGuideData);
  const [styleState, setStyleState] = useState<FilterStyleState>(getMockFilterStyleState());

  const selectedColor =
    filter.colorOptions.find(option => option.id === styleState.selectedColorId) ??
    filter.colorOptions[0];
  const selectedType =
    filter.typeOptions.find(option => option.id === styleState.selectedTypeId) ??
    filter.typeOptions[0];
  const selectedTexture =
    filter.textureOptions.find(option => option.id === styleState.selectedTextureId) ??
    filter.textureOptions[0];

  const handleFacePartPress = (facePartId: FacePartId) => {
    setStyleState(currentState => ({
      ...currentState,
      selectedFacePartId: facePartId,
    }));
  };

  const handleOptionGroupPress = (optionGroup: StyleOptionGroupId) => {
    setStyleState(currentState => ({
      ...currentState,
      selectedOptionGroup: optionGroup,
    }));
  };

  const handleOptionPress = (optionGroup: StyleOptionGroupId, optionId: string) => {
    setStyleState(currentState =>
      updateFilterStyleSelection(currentState, optionGroup, optionId),
    );
  };

  return (
    <View style={styles.screen}>
      <YStack style={[styles.headerArea, {paddingTop: insets.top + spacing.md}]}>
        <XStack style={styles.header}>
          <Button
            accessibilityLabel="AR 필터 화면으로 돌아가기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onBack}
            pressStyle={{scale: 0.97}}
            style={styles.iconButton}
            unstyled>
            <ChevronLeft color={colors.textPrimary} size={iconSize.md} strokeWidth={2} />
          </Button>

          <YStack style={styles.headerCopy}>
            <Text style={styles.eyebrow}>FILTER CUSTOM</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              스타일 조정
            </Text>
          </YStack>

          <Button
            accessibilityLabel="현재 스타일 저장"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onSave}
            pressStyle={{scale: 0.97}}
            style={styles.iconButton}
            unstyled>
            <Save color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
          </Button>
        </XStack>

        <XStack style={styles.segmentedControl}>
          <Button
            accessibilityRole="button"
            accessibilityState={{selected: false}}
            onPress={onOpenLocationAdjust}
            pressStyle={{scale: 0.98}}
            style={styles.segmentButton}
            unstyled>
            <Text style={styles.segmentText}>위치 조정</Text>
          </Button>
          <Button
            accessibilityRole="button"
            accessibilityState={{selected: true}}
            pressStyle={{scale: 0.98}}
            style={[styles.segmentButton, styles.segmentButtonActive]}
            unstyled>
            <Text style={[styles.segmentText, styles.segmentTextActive]}>스타일 조정</Text>
          </Button>
        </XStack>
      </YStack>

      <YStack style={styles.previewSection}>
        <View style={styles.previewFrame}>
          <Image resizeMode="cover" source={filter.imageSource} style={styles.previewImage} />
          <View style={styles.previewDim} />
          <View style={[styles.eyeLayer, {backgroundColor: selectedColor.hex}]} />
          <View style={[styles.cheekLayer, {backgroundColor: selectedColor.hex}]} />
          <View style={[styles.lipLayer, {backgroundColor: selectedColor.hex}]} />

          <YStack style={styles.selectionSummary}>
            <Text style={styles.summaryTitle}>{filter.title}</Text>
            <Text style={styles.summaryText}>
              {selectedColor.label} · {selectedType.label} · {selectedTexture.label}
            </Text>
          </YStack>
        </View>
      </YStack>

      <YStack style={[styles.controlPanel, {paddingBottom: insets.bottom + spacing.lg}]}>
        <YStack style={styles.panelSection}>
          <Text style={styles.panelLabel}>얼굴 부위</Text>
          <ScrollView
            contentContainerStyle={styles.horizontalList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {arGuideData.faceParts.map(facePart => (
              <ChipButton
                key={facePart.id}
                isActive={facePart.id === styleState.selectedFacePartId}
                label={facePart.label}
                onPress={() => handleFacePartPress(facePart.id)}
              />
            ))}
          </ScrollView>
        </YStack>

        <YStack style={styles.panelSection}>
          <Text style={styles.panelLabel}>스타일 옵션</Text>
          <XStack style={styles.optionGroupList}>
            {STYLE_GROUPS.map(group => (
              <ChipButton
                key={group.id}
                isActive={group.id === styleState.selectedOptionGroup}
                label={group.label}
                onPress={() => handleOptionGroupPress(group.id)}
              />
            ))}
          </XStack>
        </YStack>

        {styleState.selectedOptionGroup === 'color' ? (
          <YStack style={styles.panelSection}>
            <Text style={styles.panelLabel}>컬러 선택</Text>
            <XStack style={styles.swatchList}>
              {filter.colorOptions.map(option => (
                <Button
                  key={option.id}
                  accessibilityLabel={`${option.label} 컬러 선택`}
                  accessibilityRole="button"
                  accessibilityState={{selected: option.id === styleState.selectedColorId}}
                  onPress={() => handleOptionPress('color', option.id)}
                  pressStyle={{scale: 0.96}}
                  style={[
                    styles.swatchButton,
                    {
                      backgroundColor: option.hex,
                      borderColor:
                        option.id === styleState.selectedColorId
                          ? colors.black
                          : colors.borderStrong,
                    },
                  ]}
                  unstyled>
                  <View style={styles.swatchInner} />
                </Button>
              ))}
            </XStack>
          </YStack>
        ) : (
          <YStack style={styles.panelSection}>
            <Text style={styles.panelLabel}>
              {styleState.selectedOptionGroup === 'type' ? '타입 선택' : '질감 선택'}
            </Text>
            <XStack style={styles.textOptionList}>
              {(styleState.selectedOptionGroup === 'type'
                ? filter.typeOptions
                : filter.textureOptions
              ).map(option => {
                const isActive =
                  styleState.selectedOptionGroup === 'type'
                    ? option.id === styleState.selectedTypeId
                    : option.id === styleState.selectedTextureId;

                return (
                  <ChipButton
                    key={option.id}
                    isActive={isActive}
                    label={option.label}
                    onPress={() => handleOptionPress(styleState.selectedOptionGroup, option.id)}
                  />
                );
              })}
            </XStack>
          </YStack>
        )}

        <Button
          accessibilityLabel="현재 필터 스타일 저장"
          accessibilityRole="button"
          onPress={onSave}
          pressStyle={{scale: 0.98}}
          style={styles.saveButton}
          unstyled>
          <Text style={styles.saveButtonText}>현재 필터 저장</Text>
        </Button>
      </YStack>
    </View>
  );
}

type ChipButtonProps = {
  isActive: boolean;
  label: string;
  onPress: () => void;
};

function ChipButton({isActive, label, onPress}: ChipButtonProps) {
  return (
    <Button
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={[styles.chip, isActive ? styles.chipActive : undefined]}
      unstyled>
      <Text style={[styles.chipText, isActive ? styles.chipTextActive : undefined]}>
        {label}
      </Text>
    </Button>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  headerArea: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: iconSize.xl + spacing.md,
    justifyContent: 'center',
    padding: 0,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
    width: iconSize.xl + spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.2,
    lineHeight: typography.lineHeight.xs,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  segmentedControl: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: spacing.xs,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    height: 38,
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.black,
  },
  segmentText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  segmentTextActive: {
    color: colors.white,
  },
  previewSection: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  previewFrame: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    height: 300,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewDim: {
    backgroundColor: colors.black,
    bottom: 0,
    left: 0,
    opacity: 0.08,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  eyeLayer: {
    borderRadius: radius.pill,
    height: spacing.xs,
    left: '31%',
    opacity: 0.34,
    position: 'absolute',
    right: '31%',
    top: '39%',
  },
  cheekLayer: {
    borderRadius: radius.pill,
    height: spacing.lg,
    left: '24%',
    opacity: 0.24,
    position: 'absolute',
    right: '24%',
    top: '55%',
  },
  lipLayer: {
    borderRadius: radius.pill,
    bottom: '23%',
    height: spacing.sm,
    left: '43%',
    opacity: 0.74,
    position: 'absolute',
    right: '43%',
  },
  selectionSummary: {
    alignItems: 'flex-start',
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    bottom: spacing.md,
    gap: spacing.xs,
    left: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  summaryTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  summaryText: {
    color: colors.borderStrong,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'left',
  },
  controlPanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  panelSection: {
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
  horizontalList: {
    gap: spacing.sm,
    paddingRight: spacing.xl,
  },
  optionGroupList: {
    gap: spacing.sm,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  chipActive: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  chipText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  chipTextActive: {
    color: colors.white,
  },
  swatchList: {
    gap: spacing.md,
  },
  swatchButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 3,
    height: iconSize.xl + spacing.md,
    justifyContent: 'center',
    padding: 0,
    width: iconSize.xl + spacing.md,
  },
  swatchInner: {
    borderColor: colors.black,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: iconSize.sm,
    opacity: 0.16,
    width: iconSize.sm,
  },
  textOptionList: {
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: 52,
    justifyContent: 'center',
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
});
