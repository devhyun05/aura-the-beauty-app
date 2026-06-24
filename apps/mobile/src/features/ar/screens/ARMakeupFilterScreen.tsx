import React, {useMemo, useState} from 'react';
import {Image, ScrollView, StyleSheet, type ViewStyle} from 'react-native';
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
  ComparisonMode,
  FacePartId,
  FilterCategoryId,
  GuideMode,
  MakeupFilter,
  StyleOptionGroupId,
} from '../../../shared/types/makeupGuide';

type CaptureMode = 'photo' | 'video';

type ARMakeupFilterScreenProps = {
  initialComparisonMode?: ComparisonMode;
  initialGuideMode?: GuideMode;
  onBack?: () => void;
  onComplete?: () => void;
  onOpenLocationAdjust?: () => void;
  onOpenStyleAdjust?: () => void;
};

const STYLE_OPTION_GROUPS: readonly {id: StyleOptionGroupId; label: string}[] = [
  {id: 'color', label: '컬러'},
  {id: 'type', label: '타입'},
  {id: 'texture', label: '질감'},
];

type MakeupPreviewColorOverlayLayer = {
  id: string;
  style: ViewStyle;
};

export function getMakeupPreviewColorOverlayLayers(): readonly MakeupPreviewColorOverlayLayer[] {
  return [];
}

export function getMakeupPreviewBadgeContent(): null {
  return null;
}

export function ARMakeupFilterScreen({
  initialComparisonMode = 'full',
  initialGuideMode = 'basic',
  onBack,
  onComplete,
  onOpenLocationAdjust,
  onOpenStyleAdjust,
}: ARMakeupFilterScreenProps) {
  const insets = useSafeAreaInsets();
  const arGuideData = getMockARMakeupGuideData();
  const defaultFilter = getDefaultMakeupFilter(arGuideData);

  const [guideMode, setGuideMode] = useState<GuideMode>(initialGuideMode);
  const [selectedComparisonMode, setSelectedComparisonMode] =
    useState<ComparisonMode>(initialComparisonMode);
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
  const previewColorOverlayLayers = getMakeupPreviewColorOverlayLayers();
  const shouldShowLeftCheekOverlay =
    guideMode !== 'half' || selectedComparisonMode !== 'right';
  const shouldShowRightCheekOverlay =
    guideMode !== 'half' || selectedComparisonMode !== 'left';
  const leftComparisonLabel = selectedComparisonMode === 'left' ? 'After' : 'Before';
  const rightComparisonLabel = selectedComparisonMode === 'left' ? 'Before' : 'After';

  return (
    <View style={styles.screen}>
      <View style={styles.cameraLayer}>
        <Image
          resizeMode="cover"
          source={selectedFilter.imageSource}
          style={styles.previewImage}
        />
        <View style={styles.previewDim} />
        <View style={[styles.eyePreviewOverlay, {backgroundColor: selectedColor.hex}]} />
        {shouldShowLeftCheekOverlay ? (
          <View
            style={[styles.cheekPreviewOverlayLeft, {backgroundColor: selectedColor.hex}]}
          />
        ) : null}
        {shouldShowRightCheekOverlay ? (
          <View
            style={[styles.cheekPreviewOverlayRight, {backgroundColor: selectedColor.hex}]}
          />
        ) : null}
        <View style={[styles.lipPreviewOverlay, {backgroundColor: selectedColor.hex}]} />
        {previewColorOverlayLayers.map(layer => (
          <View
            key={layer.id}
            style={[layer.style, {backgroundColor: selectedColor.hex}]}
          />
        ))}
        {guideMode === 'half' ? (
          <>
            {selectedComparisonMode !== 'full' ? (
              <View
                style={[
                  styles.comparisonShade,
                  selectedComparisonMode === 'left'
                    ? styles.comparisonShadeRight
                    : styles.comparisonShadeLeft,
                ]}
              />
            ) : null}
            <View style={styles.comparisonDivider} />
            <Text style={[styles.comparisonLabel, styles.comparisonLabelBefore]}>
              {leftComparisonLabel}
            </Text>
            <Text style={[styles.comparisonLabel, styles.comparisonLabelAfter]}>
              {rightComparisonLabel}
            </Text>
          </>
        ) : null}
      </View>

      <YStack style={[styles.topArea, {paddingTop: insets.top + spacing.md}]}>
        <XStack style={styles.header}>
          <Button
            accessibilityLabel="생성 결과 화면으로 돌아가기"
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

        {guideMode === 'half' ? (
          <XStack style={styles.comparisonBar}>
            {arGuideData.comparisonModes.map(mode => (
              <ComparisonModeButton
                key={mode.id}
                isActive={mode.id === selectedComparisonMode}
                label={mode.label}
                onPress={() => setSelectedComparisonMode(mode.id)}
              />
            ))}
          </XStack>
        ) : null}
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
            accessibilityLabel={captureMode === 'photo' ? 'AR 사진 촬영 후 홈으로 이동' : 'AR 동영상 촬영 후 홈으로 이동'}
            accessibilityRole="button"
            onPress={onComplete}
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

type ComparisonModeButtonProps = {
  isActive: boolean;
  label: string;
  onPress: () => void;
};

function ComparisonModeButton({isActive, label, onPress}: ComparisonModeButtonProps) {
  return (
    <Button
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{scale: 0.98}}
      style={[styles.comparisonButton, isActive ? styles.comparisonButtonActive : undefined]}
      unstyled>
      <Text
        style={[
          styles.comparisonButtonText,
          isActive ? styles.comparisonButtonTextActive : undefined,
        ]}>
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
      <Image resizeMode="cover" source={filter.imageSource} style={styles.filterImage} />
      <YStack style={styles.filterCopy}>
        <Text numberOfLines={1} style={[styles.filterTitle, isActive ? styles.filterTitleActive : undefined]}>
          {filter.title}
        </Text>
        <Text numberOfLines={1} style={[styles.filterSubtitle, isActive ? styles.filterSubtitleActive : undefined]}>
          {filter.subtitle}
        </Text>
        <Text style={[styles.filterMeta, isActive ? styles.filterMetaActive : undefined]}>
          {filter.intensityLabel}
        </Text>
      </YStack>
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
    overflow: 'hidden',
  },
  cameraLayer: {
    backgroundColor: colors.black,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  topArea: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    zIndex: 3,
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
  comparisonBar: {
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.xs,
  },
  comparisonButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  comparisonButtonActive: {
    backgroundColor: colors.white,
  },
  comparisonButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  comparisonButtonTextActive: {
    color: colors.black,
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
  eyePreviewOverlay: {
    borderRadius: radius.pill,
    height: 34,
    left: '27%',
    opacity: 0.16,
    position: 'absolute',
    right: '27%',
    top: '38%',
  },
  cheekPreviewOverlayLeft: {
    borderRadius: radius.pill,
    height: 54,
    left: '20%',
    opacity: 0.18,
    position: 'absolute',
    top: '52%',
    transform: [{rotate: '-14deg'}],
    width: 92,
  },
  cheekPreviewOverlayRight: {
    borderRadius: radius.pill,
    height: 54,
    opacity: 0.18,
    position: 'absolute',
    right: '20%',
    top: '52%',
    transform: [{rotate: '14deg'}],
    width: 92,
  },
  lipPreviewOverlay: {
    borderRadius: radius.pill,
    bottom: '24%',
    height: 24,
    left: '39%',
    opacity: 0.4,
    position: 'absolute',
    width: 82,
  },
  comparisonShade: {
    backgroundColor: colors.black,
    bottom: 0,
    opacity: 0.34,
    position: 'absolute',
    top: 0,
    width: '50%',
  },
  comparisonShadeLeft: {
    left: 0,
  },
  comparisonShadeRight: {
    right: 0,
  },
  comparisonDivider: {
    backgroundColor: colors.white,
    bottom: '28%',
    opacity: 0.86,
    position: 'absolute',
    top: '24%',
    width: 2,
    left: '50%',
  },
  comparisonLabel: {
    backgroundColor: colors.glassSurface,
    borderRadius: radius.pill,
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: 'absolute',
    bottom: '31%',
  },
  comparisonLabelBefore: {
    left: spacing.xl,
  },
  comparisonLabelAfter: {
    right: spacing.xl,
  },
  controlsPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    bottom: spacing.md,
    gap: spacing.md,
    left: spacing.md,
    maxHeight: 392,
    position: 'absolute',
    right: spacing.md,
    paddingTop: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
    zIndex: 4,
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
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-start',
    minHeight: 92,
    overflow: 'hidden',
    padding: spacing.sm,
    width: 226,
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
  filterImage: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 74,
    width: 58,
  },
  filterCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
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
    borderTopColor: colors.divider,
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
