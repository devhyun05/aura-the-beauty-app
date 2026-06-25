import React, {useState} from 'react';
import {Image, ScrollView, StyleSheet, type ViewStyle} from 'react-native';
import {Camera, ChevronLeft, Video} from 'lucide-react-native';
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
type ARMakeupOptionGroupId = 'makeupStyle' | 'makeupPreset' | 'color' | 'type' | 'texture' | 'shape';
type ARMakeupOptionGroup = {
  id: ARMakeupOptionGroupId;
  label: string;
};
type ShapeOption = {
  id: string;
  label: string;
};

type ARFilterScreenProps = {
  initialComparisonMode?: ComparisonMode;
  initialGuideMode?: GuideMode;
  onBack?: () => void;
  onComplete?: () => void;
  onOpenShapeAdjust?: () => void;
  onSave?: () => void;
};

const ORIGINAL_OPTION_CARD_ID = 'original';
const ORIGINAL_OPTION_CARD_LABEL = '원본';

const MAKEUP_PART_OPTION_GROUPS: readonly ARMakeupOptionGroup[] = [
  {id: 'makeupPreset', label: '프리셋'},
  {id: 'color', label: '컬러'},
  {id: 'type', label: '타입'},
  {id: 'texture', label: '질감'},
  {id: 'shape', label: '형태'},
];

const ALL_MAKEUP_OPTION_GROUPS: readonly ARMakeupOptionGroup[] = [
  {id: 'makeupStyle', label: '스타일'},
  {id: 'shape', label: '형태'},
];

const SHAPE_OPTIONS_BY_FACE_PART: Record<FacePartId, readonly ShapeOption[]> = {
  all: [
    {id: 'balanced', label: '기본 밸런스'},
    {id: 'soft-focus', label: '소프트 확장'},
    {id: 'defined', label: '윤곽 강조'},
  ],
  base: [
    {id: 'base-default', label: '기본 베이스'},
    {id: 'base-center', label: '중앙 집중'},
    {id: 'base-wide', label: '광대 확장'},
  ],
  eye: [
    {id: 'eye-default', label: '기본 아이'},
    {id: 'eye-tail', label: '눈꼬리 확장'},
    {id: 'eye-under', label: '언더 포인트'},
  ],
  lip: [
    {id: 'lip-default', label: '기본 립'},
    {id: 'lip-over', label: '오버 립'},
    {id: 'lip-gradient', label: '그라데이션'},
  ],
  contour: [
    {id: 'contour-default', label: '기본 윤곽'},
    {id: 'contour-jaw', label: '턱선 강조'},
    {id: 'contour-nose', label: '코 쉐딩'},
  ],
};

const MODE_TAB_HEIGHT = 24;
const MODE_TAB_CONTAINER_PADDING = spacing.xs / 2;
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

function getARFilterOptionGroups(
  selectedFacePartId: FacePartId,
): readonly ARMakeupOptionGroup[] {
  return selectedFacePartId === 'all' ? ALL_MAKEUP_OPTION_GROUPS : MAKEUP_PART_OPTION_GROUPS;
}

function getARFilterShapeOptions(
  selectedFacePartId: FacePartId,
): readonly ShapeOption[] {
  return SHAPE_OPTIONS_BY_FACE_PART[selectedFacePartId];
}

export function getARFilterOptionGroupLabels(
  selectedFacePartId: FacePartId,
): readonly string[] {
  return getARFilterOptionGroups(selectedFacePartId).map(group => group.label);
}

export function getARFilterOriginalCardLabel(): string {
  return ORIGINAL_OPTION_CARD_LABEL;
}

export function getARFilterShapeOptionLabels(
  selectedFacePartId: FacePartId,
): readonly string[] {
  return getARFilterShapeOptions(selectedFacePartId).map(option => option.label);
}

export function getARFilterSaveButtonLabel(): string {
  return '저장';
}

export function getARFilterShapeEditButtonLabel(): string {
  return '형태 수정';
}

export function getARFilterMakeupStyleCardIdAfterOptionEdit({
  selectedMakeupStyleCardId,
}: {
  selectedMakeupStyleCardId: string | null;
}): string | null {
  if (selectedMakeupStyleCardId) {
    return null;
  }

  return selectedMakeupStyleCardId;
}

export function isARFilterSaveEnabled({
  hasUnsavedChanges,
}: {
  hasUnsavedChanges: boolean;
}): boolean {
  return hasUnsavedChanges;
}

function getMakeupFiltersForFacePart(
  makeupFilters: readonly MakeupFilter[],
  selectedFacePartId: FacePartId,
): readonly MakeupFilter[] {
  if (selectedFacePartId === 'all') {
    return makeupFilters;
  }

  const partMakeupFilters = makeupFilters.filter(makeupFilter =>
    makeupFilter.facePartIds.includes(selectedFacePartId),
  );

  return partMakeupFilters.length > 0 ? partMakeupFilters : makeupFilters;
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
  onOpenShapeAdjust,
  onSave,
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
  const [selectedMakeupStyleCardId, setSelectedMakeupStyleCardId] =
    useState<string | null>(defaultFilter.id);
  const [selectedMakeupPresetCardId, setSelectedMakeupPresetCardId] =
    useState(defaultFilter.id);
  const [selectedFacePartId, setSelectedFacePartId] = useState<FacePartId>('all');
  const [selectedMakeupOptionGroup, setSelectedMakeupOptionGroup] =
    useState<ARMakeupOptionGroupId>('makeupStyle');
  const [selectedColorId, setSelectedColorId] = useState(
    getARFilterInitialColorId(defaultFilter.colorOptions),
  );
  const [selectedTypeId, setSelectedTypeId] = useState(defaultFilter.typeOptions[0]?.id ?? '');
  const [selectedTextureId, setSelectedTextureId] = useState(
    defaultFilter.textureOptions[0]?.id ?? '',
  );
  const [selectedShapeId, setSelectedShapeId] = useState(ORIGINAL_OPTION_CARD_ID);
  const [hasUnsavedMakeupChanges, setHasUnsavedMakeupChanges] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');

  const selectedMakeupFilter =
    arGuideData.filters.find(makeupFilter =>
      makeupFilter.id ===
      (selectedFacePartId === 'all'
        ? selectedMakeupStyleCardId
        : selectedMakeupPresetCardId),
    ) ?? defaultFilter;
  const categoryMakeupFilters = getFiltersByCategory(selectedCategoryId, arGuideData);
  const availableMakeupFilters = getMakeupFiltersForFacePart(
    categoryMakeupFilters,
    selectedFacePartId,
  );
  const availableOptionGroups = getARFilterOptionGroups(selectedFacePartId);
  const shapeOptions = getARFilterShapeOptions(selectedFacePartId);

  const handleFacePartPress = (facePartId: FacePartId) => {
    const nextOptionGroups = getARFilterOptionGroups(facePartId);

    setSelectedFacePartId(facePartId);

    if (!nextOptionGroups.some(group => group.id === selectedMakeupOptionGroup)) {
      setSelectedMakeupOptionGroup(nextOptionGroups[0].id);
    }
  };

  const handleCategoryPress = (categoryId: FilterCategoryId) => {
    const nextCategoryMakeupFilters = getFiltersByCategory(categoryId, arGuideData);
    const nextMakeupFilter =
      getMakeupFiltersForFacePart(nextCategoryMakeupFilters, selectedFacePartId)[0] ??
      defaultFilter;

    setSelectedCategoryId(categoryId);
    handleMakeupFilterPress(nextMakeupFilter);
  };

  const handleMakeupFilterPress = (makeupFilter: MakeupFilter) => {
    if (selectedFacePartId === 'all') {
      setSelectedMakeupStyleCardId(makeupFilter.id);
      setHasUnsavedMakeupChanges(false);
    } else {
      setSelectedMakeupPresetCardId(makeupFilter.id);
      setHasUnsavedMakeupChanges(true);
      setSelectedMakeupStyleCardId(null);
    }

    setSelectedColorId(getARFilterInitialColorId(makeupFilter.colorOptions));
    setSelectedTypeId(makeupFilter.typeOptions[0]?.id ?? '');
    setSelectedTextureId(makeupFilter.textureOptions[0]?.id ?? '');
  };

  const markMakeupOptionEdited = () => {
    setSelectedMakeupStyleCardId(currentMakeupStyleCardId =>
      getARFilterMakeupStyleCardIdAfterOptionEdit({
        selectedMakeupStyleCardId: currentMakeupStyleCardId,
      }),
    );
    setHasUnsavedMakeupChanges(true);
  };

  const handleOriginalOptionPress = () => {
    if (selectedMakeupOptionGroup === 'makeupStyle') {
      setSelectedMakeupStyleCardId(ORIGINAL_OPTION_CARD_ID);
      setHasUnsavedMakeupChanges(false);
      return;
    }

    if (selectedMakeupOptionGroup === 'makeupPreset') {
      setSelectedMakeupPresetCardId(ORIGINAL_OPTION_CARD_ID);
      markMakeupOptionEdited();
      return;
    }

    if (selectedMakeupOptionGroup === 'color') {
      setSelectedColorId(ORIGINAL_OPTION_CARD_ID);
      markMakeupOptionEdited();
      return;
    }

    if (selectedMakeupOptionGroup === 'type') {
      setSelectedTypeId(ORIGINAL_OPTION_CARD_ID);
      markMakeupOptionEdited();
      return;
    }

    if (selectedMakeupOptionGroup === 'texture') {
      setSelectedTextureId(ORIGINAL_OPTION_CARD_ID);
      markMakeupOptionEdited();
      return;
    }

    setSelectedShapeId(ORIGINAL_OPTION_CARD_ID);
    markMakeupOptionEdited();
  };

  const selectedColor =
    selectedColorId === ORIGINAL_OPTION_CARD_ID
      ? AR_FILTER_FALLBACK_COLOR
      : getARFilterSelectedColor(selectedMakeupFilter.colorOptions, selectedColorId);
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
        </XStack>

        <XStack style={styles.segmentedControl}>
          <OverlaySegmentButton
            height={MODE_TAB_HEIGHT}
            isActive={guideMode === 'basic'}
            label="기본"
            minHeight={MODE_TAB_HEIGHT}
            onPress={() => setGuideMode('basic')}
            textStyle={styles.modeTabText}
          />
          <OverlaySegmentButton
            height={MODE_TAB_HEIGHT}
            isActive={guideMode === 'half'}
            label="반반 가이드"
            minHeight={MODE_TAB_HEIGHT}
            onPress={() => setGuideMode('half')}
            textStyle={styles.modeTabText}
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
                minHeight={MODE_TAB_HEIGHT}
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
          <HorizontalSection>
            {arGuideData.faceParts.map(facePart => (
              <OverlayChipButton
                key={facePart.id}
                isActive={facePart.id === selectedFacePartId}
                label={facePart.label}
                onPress={() => handleFacePartPress(facePart.id)}
              />
            ))}
          </HorizontalSection>

          <HorizontalSection>
            {availableOptionGroups.map(group => (
              <OverlayChipButton
                key={group.id}
                isActive={group.id === selectedMakeupOptionGroup}
                label={group.label}
                onPress={() => setSelectedMakeupOptionGroup(group.id)}
              />
            ))}
          </HorizontalSection>

          {selectedMakeupOptionGroup === 'makeupStyle' ||
          selectedMakeupOptionGroup === 'makeupPreset' ? (
            <>
              {selectedMakeupOptionGroup === 'makeupStyle' ? (
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
              ) : null}

              <ScrollView
                contentContainerStyle={styles.optionPickerList}
                horizontal
                showsHorizontalScrollIndicator={false}>
                <OptionCard
                  accessibilityLabel="원본 스타일 선택"
                  isActive={
                    selectedMakeupOptionGroup === 'makeupStyle'
                      ? selectedMakeupStyleCardId === ORIGINAL_OPTION_CARD_ID
                      : selectedMakeupPresetCardId === ORIGINAL_OPTION_CARD_ID
                  }
                  label={ORIGINAL_OPTION_CARD_LABEL}
                  onPress={handleOriginalOptionPress}>
                  <OriginalOptionPreview />
                </OptionCard>
                {availableMakeupFilters.map(makeupFilter => (
                  <OptionCard
                    key={makeupFilter.id}
                    accessibilityLabel={`${makeupFilter.title} ${
                      selectedMakeupOptionGroup === 'makeupStyle' ? '스타일' : '프리셋'
                    } 선택`}
                    imageSource={makeupFilter.imageSource}
                    isActive={
                      selectedMakeupOptionGroup === 'makeupStyle'
                        ? makeupFilter.id === selectedMakeupStyleCardId
                        : makeupFilter.id === selectedMakeupPresetCardId
                    }
                    label={makeupFilter.title}
                    onPress={() => handleMakeupFilterPress(makeupFilter)}
                  />
                ))}
              </ScrollView>
            </>
          ) : selectedMakeupOptionGroup === 'color' ? (
            <ScrollView
              contentContainerStyle={styles.optionPickerList}
              horizontal
              showsHorizontalScrollIndicator={false}>
              <OptionCard
                accessibilityLabel="원본 컬러 선택"
                isActive={selectedColorId === ORIGINAL_OPTION_CARD_ID}
                label={ORIGINAL_OPTION_CARD_LABEL}
                onPress={handleOriginalOptionPress}>
                <OriginalOptionPreview />
              </OptionCard>
              {selectedMakeupFilter.colorOptions.map(option => (
                <OptionCard
                  key={option.id}
                  accessibilityLabel={`${option.label} 컬러 선택`}
                  isActive={option.id === selectedColorId}
                  label={option.label}
                  onPress={() => {
                    setSelectedColorId(option.id);
                    markMakeupOptionEdited();
                  }}
                >
                  <ColorOptionPreview color={option.hex} />
                </OptionCard>
              ))}
            </ScrollView>
          ) : selectedMakeupOptionGroup === 'type' ? (
            <ScrollView
              contentContainerStyle={styles.optionPickerList}
              horizontal
              showsHorizontalScrollIndicator={false}>
              <OptionCard
                accessibilityLabel="원본 타입 선택"
                isActive={selectedTypeId === ORIGINAL_OPTION_CARD_ID}
                label={ORIGINAL_OPTION_CARD_LABEL}
                onPress={handleOriginalOptionPress}>
                <OriginalOptionPreview />
              </OptionCard>
              {selectedMakeupFilter.typeOptions.map(option => (
                <OptionCard
                  key={option.id}
                  accessibilityLabel={`${option.label} 타입 선택`}
                  isActive={option.id === selectedTypeId}
                  label={option.label}
                  onPress={() => {
                    setSelectedTypeId(option.id);
                    markMakeupOptionEdited();
                  }}>
                  <TypeOptionPreview />
                </OptionCard>
              ))}
            </ScrollView>
          ) : selectedMakeupOptionGroup === 'texture' ? (
            <ScrollView
              contentContainerStyle={styles.optionPickerList}
              horizontal
              showsHorizontalScrollIndicator={false}>
              <OptionCard
                accessibilityLabel="원본 질감 선택"
                isActive={selectedTextureId === ORIGINAL_OPTION_CARD_ID}
                label={ORIGINAL_OPTION_CARD_LABEL}
                onPress={handleOriginalOptionPress}>
                <OriginalOptionPreview />
              </OptionCard>
              {selectedMakeupFilter.textureOptions.map(option => (
                <OptionCard
                  key={option.id}
                  accessibilityLabel={`${option.label} 질감 선택`}
                  isActive={option.id === selectedTextureId}
                  label={option.label}
                  onPress={() => {
                    setSelectedTextureId(option.id);
                    markMakeupOptionEdited();
                  }}>
                  <TextureOptionPreview />
                </OptionCard>
              ))}
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={styles.optionPickerList}
              horizontal
              showsHorizontalScrollIndicator={false}>
              <OptionCard
                accessibilityLabel="원본 형태 선택"
                isActive={selectedShapeId === ORIGINAL_OPTION_CARD_ID}
                label={ORIGINAL_OPTION_CARD_LABEL}
                onPress={handleOriginalOptionPress}>
                <OriginalOptionPreview />
              </OptionCard>
              {shapeOptions.map(option => (
                <OptionCard
                  key={option.id}
                  accessibilityLabel={`${option.label} 형태 선택`}
                  isActive={option.id === selectedShapeId}
                  label={option.label}
                  onPress={() => {
                    setSelectedShapeId(option.id);
                    markMakeupOptionEdited();
                  }}>
                  <ShapeOptionPreview />
                </OptionCard>
              ))}
            </ScrollView>
          )}

          <XStack style={styles.makeupActionRow}>
            <Button
              accessibilityLabel="메이크업 형태 수정 화면 열기"
              accessibilityRole="button"
              onPress={onOpenShapeAdjust}
              pressStyle={{scale: 0.98}}
              style={styles.shapeEditButton}
              unstyled>
              <Text style={styles.shapeEditButtonText}>{getARFilterShapeEditButtonLabel()}</Text>
            </Button>
            <Button
              accessibilityLabel="현재 메이크업 필터 저장하기"
              accessibilityRole="button"
              accessibilityState={{disabled: !isARFilterSaveEnabled({hasUnsavedChanges: hasUnsavedMakeupChanges})}}
              disabled={!isARFilterSaveEnabled({hasUnsavedChanges: hasUnsavedMakeupChanges})}
              onPress={onSave}
              pressStyle={{scale: 0.98}}
              style={[
                styles.saveMakeupButton,
                !isARFilterSaveEnabled({hasUnsavedChanges: hasUnsavedMakeupChanges})
                  ? styles.saveMakeupButtonDisabled
                  : undefined,
              ]}
              unstyled>
              <Text
                style={[
                  styles.saveMakeupButtonText,
                  !isARFilterSaveEnabled({hasUnsavedChanges: hasUnsavedMakeupChanges})
                    ? styles.saveMakeupButtonTextDisabled
                    : undefined,
                ]}>
                {getARFilterSaveButtonLabel()}
              </Text>
            </Button>
          </XStack>
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
      <Text numberOfLines={1} style={[styles.optionCardTitle, isActive ? styles.optionCardTitleActive : undefined]}>
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
    padding: MODE_TAB_CONTAINER_PADDING,
  },
  comparisonBar: {
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing.xs,
    padding: MODE_TAB_CONTAINER_PADDING,
  },
  modeTabText: {
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
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
  makeupActionRow: {
    gap: spacing.md,
  },
  shapeEditButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  shapeEditButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  saveMakeupButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderColor: colors.black,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  saveMakeupButtonDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  saveMakeupButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  saveMakeupButtonTextDisabled: {
    color: colors.textTertiary,
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
