import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {Camera, ChevronLeft, SlidersHorizontal, Video} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getDefaultMakeupFilter,
  getFiltersByCategory,
  getMockARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {
  FacePartId,
  FilterCategoryId,
  GuideMode,
  MakeupFilter,
  StyleOptionGroupId,
} from '../../../shared/types/makeupGuide';

type CaptureMode = 'photo' | 'video';

type ARMakeupFilterScreenProps = {
  initialGuideMode?: GuideMode;
  onBack?: () => void;
  onOpenLocationAdjust?: () => void;
  onOpenStyleAdjust?: () => void;
};

const STYLE_OPTION_GROUPS: readonly {id: StyleOptionGroupId; label: string}[] = [
  {id: 'color', label: '컬러'},
  {id: 'type', label: '타입'},
  {id: 'texture', label: '질감'},
];

export function ARMakeupFilterScreen({
  initialGuideMode = 'basic',
  onBack,
  onOpenLocationAdjust,
  onOpenStyleAdjust,
}: ARMakeupFilterScreenProps) {
  const insets = useSafeAreaInsets();
  const arGuideData = getMockARMakeupGuideData();
  const defaultFilter = getDefaultMakeupFilter(arGuideData);

  const [guideMode, setGuideMode] = useState<GuideMode>(initialGuideMode);
  const [selectedCategoryId, setSelectedCategoryId] = useState<FilterCategoryId>(
    arGuideData.categories[0].id,
  );
  const [selectedFilterId, setSelectedFilterId] = useState(defaultFilter.id);
  const [selectedFacePartId, setSelectedFacePartId] = useState<FacePartId>('all');
  const [selectedOptionGroup, setSelectedOptionGroup] =
    useState<StyleOptionGroupId>('color');
  const [selectedColorId, setSelectedColorId] = useState(defaultFilter.colorOptions[0].id);
  const [selectedTypeId, setSelectedTypeId] = useState(defaultFilter.typeOptions[0].id);
  const [selectedTextureId, setSelectedTextureId] = useState(
    defaultFilter.textureOptions[0].id,
  );
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');

  const categoryFilters = useMemo(
    () => getFiltersByCategory(selectedCategoryId, arGuideData),
    [arGuideData, selectedCategoryId],
  );
  const selectedFilter =
    arGuideData.filters.find(filter => filter.id === selectedFilterId) ?? defaultFilter;

  const handleCategoryPress = (categoryId: FilterCategoryId) => {
    const nextFilter = getFiltersByCategory(categoryId, arGuideData)[0] ?? defaultFilter;

    setSelectedCategoryId(categoryId);
    handleFilterPress(nextFilter);
  };

  const handleFilterPress = (filter: MakeupFilter) => {
    setSelectedFilterId(filter.id);
    setSelectedColorId(filter.colorOptions[0].id);
    setSelectedTypeId(filter.typeOptions[0].id);
    setSelectedTextureId(filter.textureOptions[0].id);
  };

  const selectedColor =
    selectedFilter.colorOptions.find(option => option.id === selectedColorId) ??
    selectedFilter.colorOptions[0];
  const selectedType =
    selectedFilter.typeOptions.find(option => option.id === selectedTypeId) ??
    selectedFilter.typeOptions[0];
  const selectedTexture =
    selectedFilter.textureOptions.find(option => option.id === selectedTextureId) ??
    selectedFilter.textureOptions[0];

  return (
    <View style={styles.screen}>
      <YStack style={[styles.topArea, {paddingTop: insets.top + spacing.md}]}>
        <XStack style={styles.header}>
          <Button
            accessibilityLabel="추천 결과 화면으로 돌아가기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onBack}
            pressStyle={{scale: 0.97}}
            style={styles.roundIconButton}
            unstyled>
            <ChevronLeft color={colors.white} size={iconSize.md} strokeWidth={2} />
          </Button>

          <YStack style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>AR MAKEUP FILTER</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {selectedFilter.title}
            </Text>
          </YStack>

          <Button
            accessibilityLabel="필터 위치 조정"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onOpenLocationAdjust}
            pressStyle={{scale: 0.97}}
            style={styles.roundIconButton}
            unstyled>
            <SlidersHorizontal color={colors.white} size={iconSize.sm} strokeWidth={2} />
          </Button>
        </XStack>

        <XStack style={styles.segmentedControl}>
          <SegmentButton
            isActive={guideMode === 'basic'}
            label="기본"
            onPress={() => setGuideMode('basic')}
          />
          <SegmentButton
            isActive={guideMode === 'half'}
            label="반반 가이드"
            onPress={() => setGuideMode('half')}
          />
        </XStack>
      </YStack>

      <YStack style={styles.previewArea}>
        <View style={styles.faceMock}>
          <View style={styles.faceOval} />
          <View style={[styles.eyeOverlay, {backgroundColor: selectedColor.hex}]} />
          <View style={[styles.cheekOverlayLeft, {backgroundColor: selectedColor.hex}]} />
          <View style={[styles.cheekOverlayRight, {backgroundColor: selectedColor.hex}]} />
          <View style={[styles.lipOverlay, {backgroundColor: selectedColor.hex}]} />
        </View>

        <YStack style={styles.previewBadge}>
          <Text style={styles.previewBadgeLabel}>
            {guideMode === 'basic' ? '기본 모드' : '반반 가이드'}
          </Text>
          <Text style={styles.previewBadgeText}>
            {selectedColor.label} · {selectedType.label} · {selectedTexture.label}
          </Text>
        </YStack>
      </YStack>

      <YStack style={[styles.controlsPanel, {paddingBottom: insets.bottom + spacing.md}]}>
        <ScrollView
          contentContainerStyle={styles.panelContent}
          horizontal={false}
          showsVerticalScrollIndicator={false}>
          <HorizontalSection label="필터 카테고리">
            {arGuideData.categories.map(category => (
              <ChipButton
                key={category.id}
                isActive={category.id === selectedCategoryId}
                label={category.label}
                onPress={() => handleCategoryPress(category.id)}
              />
            ))}
          </HorizontalSection>

          <ScrollView
            contentContainerStyle={styles.filterList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {categoryFilters.map(filter => (
              <FilterCard
                key={filter.id}
                filter={filter}
                isActive={filter.id === selectedFilter.id}
                onPress={() => handleFilterPress(filter)}
              />
            ))}
          </ScrollView>

          <HorizontalSection label="얼굴 부위">
            {arGuideData.faceParts.map(facePart => (
              <ChipButton
                key={facePart.id}
                isActive={facePart.id === selectedFacePartId}
                label={facePart.label}
                onPress={() => setSelectedFacePartId(facePart.id)}
              />
            ))}
          </HorizontalSection>

          <XStack style={styles.adjustRow}>
            <Button
              accessibilityLabel="필터 위치 조정 열기"
              accessibilityRole="button"
              onPress={onOpenLocationAdjust}
              pressStyle={{scale: 0.98}}
              style={styles.secondaryAction}
              unstyled>
              <Text style={styles.secondaryActionText}>위치 조정</Text>
            </Button>
            <Button
              accessibilityLabel="필터 스타일 조정 열기"
              accessibilityRole="button"
              onPress={onOpenStyleAdjust}
              pressStyle={{scale: 0.98}}
              style={styles.secondaryAction}
              unstyled>
              <Text style={styles.secondaryActionText}>스타일 조정</Text>
            </Button>
          </XStack>

          <HorizontalSection label="스타일 옵션">
            {STYLE_OPTION_GROUPS.map(group => (
              <ChipButton
                key={group.id}
                isActive={group.id === selectedOptionGroup}
                label={group.label}
                onPress={() => setSelectedOptionGroup(group.id)}
              />
            ))}
          </HorizontalSection>

          {selectedOptionGroup === 'color' ? (
            <XStack style={styles.optionList}>
              {selectedFilter.colorOptions.map(option => (
                <Button
                  key={option.id}
                  accessibilityLabel={`${option.label} 컬러 선택`}
                  accessibilityRole="button"
                  onPress={() => setSelectedColorId(option.id)}
                  pressStyle={{scale: 0.96}}
                  style={[
                    styles.colorOption,
                    {
                      backgroundColor: option.hex,
                      borderColor:
                        option.id === selectedColorId ? colors.white : colors.borderStrong,
                    },
                  ]}
                  unstyled>
                  <View style={styles.colorOptionInner} />
                </Button>
              ))}
            </XStack>
          ) : (
            <XStack style={styles.optionList}>
              {(selectedOptionGroup === 'type'
                ? selectedFilter.typeOptions
                : selectedFilter.textureOptions
              ).map(option => {
                const isActive =
                  selectedOptionGroup === 'type'
                    ? option.id === selectedTypeId
                    : option.id === selectedTextureId;

                return (
                  <ChipButton
                    key={option.id}
                    isActive={isActive}
                    label={option.label}
                    onPress={() => {
                      if (selectedOptionGroup === 'type') {
                        setSelectedTypeId(option.id);
                        return;
                      }

                      setSelectedTextureId(option.id);
                    }}
                  />
                );
              })}
            </XStack>
          )}
        </ScrollView>

        <XStack style={styles.captureRow}>
          <XStack style={styles.captureModeToggle}>
            <IconModeButton
              accessibilityLabel="사진 모드"
              icon={<Camera color={captureMode === 'photo' ? colors.black : colors.white} size={iconSize.sm} />}
              isActive={captureMode === 'photo'}
              onPress={() => setCaptureMode('photo')}
            />
            <IconModeButton
              accessibilityLabel="동영상 모드"
              icon={<Video color={captureMode === 'video' ? colors.black : colors.white} size={iconSize.sm} />}
              isActive={captureMode === 'video'}
              onPress={() => setCaptureMode('video')}
            />
          </XStack>

          <Button
            accessibilityLabel={captureMode === 'photo' ? '사진 촬영' : '동영상 촬영'}
            accessibilityRole="button"
            pressStyle={{scale: 0.96}}
            style={styles.captureButton}
            unstyled>
            <View style={styles.captureButtonInner} />
          </Button>
        </XStack>
      </YStack>
    </View>
  );
}

type SegmentButtonProps = {
  isActive: boolean;
  label: string;
  onPress: () => void;
};

function SegmentButton({isActive, label, onPress}: SegmentButtonProps) {
  return (
    <Button
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{scale: 0.98}}
      style={[styles.segmentButton, isActive ? styles.segmentButtonActive : undefined]}
      unstyled>
      <Text style={[styles.segmentText, isActive ? styles.segmentTextActive : undefined]}>
        {label}
      </Text>
    </Button>
  );
}

type HorizontalSectionProps = {
  children: React.ReactNode;
  label: string;
};

function HorizontalSection({children, label}: HorizontalSectionProps) {
  return (
    <YStack style={styles.horizontalSection}>
      <Text style={styles.panelLabel}>{label}</Text>
      <ScrollView
        contentContainerStyle={styles.chipList}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {children}
      </ScrollView>
    </YStack>
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

type FilterCardProps = {
  filter: MakeupFilter;
  isActive: boolean;
  onPress: () => void;
};

function FilterCard({filter, isActive, onPress}: FilterCardProps) {
  return (
    <Button
      accessibilityLabel={`${filter.title} 필터 선택`}
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{scale: 0.98}}
      style={[styles.filterCard, isActive ? styles.filterCardActive : undefined]}
      unstyled>
      <Text style={[styles.filterTitle, isActive ? styles.filterTitleActive : undefined]}>
        {filter.title}
      </Text>
      <Text style={[styles.filterSubtitle, isActive ? styles.filterSubtitleActive : undefined]}>
        {filter.subtitle}
      </Text>
      <Text style={[styles.filterMeta, isActive ? styles.filterMetaActive : undefined]}>
        {filter.intensityLabel}
      </Text>
    </Button>
  );
}

type IconModeButtonProps = {
  accessibilityLabel: string;
  icon: React.ReactNode;
  isActive: boolean;
  onPress: () => void;
};

function IconModeButton({accessibilityLabel, icon, isActive, onPress}: IconModeButtonProps) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{scale: 0.96}}
      style={[styles.modeButton, isActive ? styles.modeButtonActive : undefined]}
      unstyled>
      {icon}
    </Button>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  topArea: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
  },
  roundIconButton: {
    alignItems: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: iconSize.xl + spacing.md,
    justifyContent: 'center',
    padding: 0,
    width: iconSize.xl + spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  headerEyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.2,
    lineHeight: typography.lineHeight.xs,
  },
  headerTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  segmentedControl: {
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
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
    backgroundColor: colors.white,
  },
  segmentText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  segmentTextActive: {
    color: colors.black,
  },
  previewArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  faceMock: {
    alignItems: 'center',
    height: 268,
    justifyContent: 'center',
    width: 228,
  },
  faceOval: {
    backgroundColor: colors.guideSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 214,
    opacity: 0.86,
    transform: [{scaleY: 1.16}],
    width: 154,
  },
  eyeOverlay: {
    borderRadius: radius.pill,
    height: spacing.sm,
    opacity: 0.5,
    position: 'absolute',
    top: 106,
    width: 112,
  },
  cheekOverlayLeft: {
    borderRadius: radius.pill,
    height: spacing.md,
    left: 54,
    opacity: 0.42,
    position: 'absolute',
    top: 142,
    width: spacing.xxl,
  },
  cheekOverlayRight: {
    borderRadius: radius.pill,
    height: spacing.md,
    opacity: 0.42,
    position: 'absolute',
    right: 54,
    top: 142,
    width: spacing.xxl,
  },
  lipOverlay: {
    borderRadius: radius.pill,
    bottom: 58,
    height: spacing.sm,
    opacity: 0.72,
    position: 'absolute',
    width: 44,
  },
  previewBadge: {
    alignItems: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  previewBadgeLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  previewBadgeText: {
    color: colors.borderStrong,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  controlsPanel: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.md,
    maxHeight: 418,
    paddingTop: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  panelContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
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
  filterList: {
    gap: spacing.md,
    paddingRight: spacing.xl,
  },
  filterCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 112,
    padding: spacing.lg,
    width: 184,
  },
  filterCardActive: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  filterTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  filterTitleActive: {
    color: colors.white,
  },
  filterSubtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  filterSubtitleActive: {
    color: colors.borderStrong,
  },
  filterMeta: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  filterMetaActive: {
    color: colors.white,
  },
  adjustRow: {
    gap: spacing.md,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  optionList: {
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorOption: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 3,
    height: iconSize.xl + spacing.sm,
    justifyContent: 'center',
    padding: 0,
    width: iconSize.xl + spacing.sm,
  },
  colorOptionInner: {
    borderColor: colors.black,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: iconSize.sm,
    opacity: 0.18,
    width: iconSize.sm,
  },
  captureRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  captureModeToggle: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    gap: spacing.xs,
    left: spacing.xl,
    padding: spacing.xs,
    position: 'absolute',
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  modeButtonActive: {
    backgroundColor: colors.white,
  },
  captureButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.black,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 68,
    justifyContent: 'center',
    padding: 0,
    width: 68,
  },
  captureButtonInner: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: 52,
    width: 52,
  },
});
