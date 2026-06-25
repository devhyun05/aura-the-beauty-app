import React, {useMemo, useState} from 'react';
import {Image, ScrollView, StyleSheet, type ViewStyle} from 'react-native';
import {Camera, ChevronLeft, SlidersHorizontal, Video} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getDefaultMakeupFilter,
  getFiltersByCategory,
  getARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  ComparisonMode,
  FacePartId,
  FilterColorOption,
  FilterCategoryId,
  GuideMode,
  MakeupFilter,
  StyleOptionGroupId,
} from '../../../shared/types/makeupGuide';
import {
  BottomOverlayPanel,
  CAMERA_CAPTURE_BUTTON_METRICS,
  FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY,
  CameraCaptureButton,
  FullscreenOverlayLayer,
  FullscreenOverlayScreen,
  LiveCameraLayer,
  OverlayChipButton,
  OverlayIconButton,
  OverlaySegmentButton,
} from '../../../shared/ui';

type CaptureMode = 'photo' | 'video';

type ARFilterScreenProps = {
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

const MODE_TAB_HEIGHT = 32;
const SELECTED_TAB_BACKGROUND_OPACITY = FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY;
const CAPTURE_BUTTON_METRICS = {
  outerSize: CAMERA_CAPTURE_BUTTON_METRICS.defaultSize,
  innerScale: CAMERA_CAPTURE_BUTTON_METRICS.innerScale,
} as const;

type ARFilterSelectedColor = Pick<FilterColorOption, 'hex' | 'label'>;

const AR_FILTER_FALLBACK_COLOR: ARFilterSelectedColor = {
  hex: colors.white,
  label: '기본',
};

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

export function getARFilterCameraMode(): 'live-camera' {
  return 'live-camera';
}

export function shouldShowARFilterHeaderCopy(): false {
  return false;
}

export function getARFilterModeTabHeight(): number {
  return MODE_TAB_HEIGHT;
}

export function getARFilterSelectedTabOpacity(): number {
  return SELECTED_TAB_BACKGROUND_OPACITY;
}

export function getARFilterCategoryTitle(): null {
  return null;
}

export function getARFilterComparisonTabs(): readonly string[] {
  return getARMakeupGuideData().comparisonModes.map(mode => mode.label);
}

export function getARFilterCaptureButtonMetrics(): typeof CAPTURE_BUTTON_METRICS {
  return CAPTURE_BUTTON_METRICS;
}

export function getARFilterSelectedColor(
  colorOptions: readonly FilterColorOption[],
  selectedColorId: string,
): ARFilterSelectedColor {
  return (
    colorOptions.find(option => option.id === selectedColorId) ??
    colorOptions[0] ??
    AR_FILTER_FALLBACK_COLOR
  );
}

export function getARFilterInitialColorId(
  colorOptions: readonly FilterColorOption[],
): string {
  return colorOptions[0]?.id ?? '';
}

export function ARFilterScreen({
  initialComparisonMode = 'left',
  initialGuideMode = 'basic',
  onBack,
  onComplete,
  onOpenLocationAdjust,
  onOpenStyleAdjust,
}: ARFilterScreenProps) {
  const insets = useSafeAreaInsets();
  const arGuideData = getARMakeupGuideData();
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
  const [selectedColorId, setSelectedColorId] = useState(
    getARFilterInitialColorId(defaultFilter.colorOptions),
  );
  const [selectedTypeId, setSelectedTypeId] = useState(defaultFilter.typeOptions[0]?.id ?? '');
  const [selectedTextureId, setSelectedTextureId] = useState(
    defaultFilter.textureOptions[0]?.id ?? '',
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
    setSelectedColorId(getARFilterInitialColorId(filter.colorOptions));
    setSelectedTypeId(filter.typeOptions[0]?.id ?? '');
    setSelectedTextureId(filter.textureOptions[0]?.id ?? '');
  };

  const selectedColor = getARFilterSelectedColor(
    selectedFilter.colorOptions,
    selectedColorId,
  );
  const previewColorOverlayLayers = getMakeupPreviewColorOverlayLayers();
  const shouldShowLeftCheekOverlay =
    guideMode !== 'half' || selectedComparisonMode !== 'right';
  const shouldShowRightCheekOverlay =
    guideMode !== 'half' || selectedComparisonMode !== 'left';
  const leftComparisonLabel = selectedComparisonMode === 'left' ? 'After' : 'Before';
  const rightComparisonLabel = selectedComparisonMode === 'left' ? 'Before' : 'After';

  return (
    <FullscreenOverlayScreen>
      <FullscreenOverlayLayer>
        <LiveCameraLayer />
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
      </FullscreenOverlayLayer>

      <YStack style={[styles.topArea, {paddingTop: insets.top + spacing.md}]}>
        <XStack style={styles.header}>
          <OverlayIconButton
            accessibilityLabel="생성 결과 화면으로 돌아가기"
            onPress={onBack}
          >
            <ChevronLeft color={colors.white} size={iconSize.md} strokeWidth={2} />
          </OverlayIconButton>

          <OverlayIconButton
            accessibilityLabel="필터 위치 조정"
            onPress={onOpenLocationAdjust}
          >
            <SlidersHorizontal color={colors.white} size={iconSize.sm} strokeWidth={2} />
          </OverlayIconButton>
        </XStack>

        <XStack style={styles.segmentedControl}>
          <OverlaySegmentButton
            height={MODE_TAB_HEIGHT}
            isActive={guideMode === 'basic'}
            label="기본"
            onPress={() => setGuideMode('basic')}
          />
          <OverlaySegmentButton
            height={MODE_TAB_HEIGHT}
            isActive={guideMode === 'half'}
            label="반반 가이드"
            onPress={() => setGuideMode('half')}
          />
        </XStack>

        {guideMode === 'half' ? (
          <XStack style={styles.comparisonBar}>
            {arGuideData.comparisonModes.map(mode => (
              <OverlaySegmentButton
                key={mode.id}
                height={MODE_TAB_HEIGHT}
                isActive={mode.id === selectedComparisonMode}
                label={mode.label}
                onPress={() => setSelectedComparisonMode(mode.id)}
                style={styles.comparisonButton}
                textStyle={styles.comparisonButtonText}
              />
            ))}
          </XStack>
        ) : null}
      </YStack>

      <BottomOverlayPanel style={[styles.controlsPanel, {paddingBottom: insets.bottom + spacing.md}]}>
        <ScrollView
          contentContainerStyle={styles.panelContent}
          horizontal={false}
          showsVerticalScrollIndicator={false}>
          <HorizontalSection label={getARFilterCategoryTitle()}>
            {arGuideData.categories.map(category => (
              <OverlayChipButton
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
              <OverlayChipButton
                key={facePart.id}
                isActive={facePart.id === selectedFacePartId}
                label={facePart.label}
                onPress={() => setSelectedFacePartId(facePart.id)}
              />
            ))}
          </HorizontalSection>

          <HorizontalSection label="스타일 옵션">
            {STYLE_OPTION_GROUPS.map(group => (
              <OverlayChipButton
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
                  <OverlayChipButton
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

          <CameraCaptureButton
            accessibilityLabel={captureMode === 'photo' ? 'AR 사진 촬영 후 홈으로 이동' : 'AR 동영상 촬영 후 홈으로 이동'}
            onPress={onComplete}
          />
        </XStack>
      </BottomOverlayPanel>
    </FullscreenOverlayScreen>
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
  topArea: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    zIndex: 3,
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  segmentedControl: {
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: spacing.xs,
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
    minHeight: MODE_TAB_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
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
    gap: spacing.md,
    maxHeight: 392,
    paddingHorizontal: 0,
    paddingTop: spacing.lg,
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
});
