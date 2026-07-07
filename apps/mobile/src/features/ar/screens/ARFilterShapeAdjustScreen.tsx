import React, {useMemo, useRef, useState} from 'react';
import {
  type GestureResponderEvent,
  Image,
  PanResponder,
  StyleSheet,
  View as NativeView,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import {Check, Eye, EyeOff, RotateCcw, Sparkles} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {getRecommendedMakeupFilterById} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupArea} from '../../../shared/types/makeupGuide';
import {
  BottomOverlayPanel,
  FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY,
  FullscreenOverlayLayer,
  FullscreenOverlayScreen,
  OverlaySaveButton,
} from '../../../shared/ui';
import {ARFilterEditModeTabs} from '../components/ARFilterEditModeTabs';
import {
  createMakeupFilterShapePresetSaveValue,
  getFilterShapeAdjustmentValueFromRatio,
  getFilterShapeState,
  getResolvedShapePointPosition,
  getShapePointOffsetFromDrag,
  resetFilterShapePointOffset,
  resetFilterShapePointOffsetWithSymmetry,
  updateFilterShapeAdjustment,
  updateFilterShapePointOffsetWithSymmetry,
  type FilterShapeAdjustment,
  type FilterShapeAdjustmentKey,
  type FilterShapePointCoordinate,
  type FilterShapePreviewSize,
  type FilterShapeState,
  type MakeupFilterShapePresetSaveValue,
} from '../services/filterCustomizationService';

type ARFilterShapeAdjustScreenProps = {
  editSourceImageSource?: ImageSourcePropType | null;
  editSourceImageUri?: string | null;
  initialMakeupFilterId?: string;
  onBack?: () => void;
  onOpenProductEdit?: () => void;
  onSave?: (shapePresetSaveValue: MakeupFilterShapePresetSaveValue) => void;
};

type FitWarpControlGroupId =
  | 'eye-tail'
  | 'wing-length'
  | 'over-lip'
  | 'brow-arch';

type FitWarpAxis = {
  adjustmentKey: FilterShapeAdjustmentKey;
  label: string;
};

type FitWarpControlGroup = {
  axes: readonly FitWarpAxis[];
  id: FitWarpControlGroupId;
  label: string;
  makeupArea: MakeupArea;
  pointIds: readonly string[];
};

const FIT_WARP_CONTROL_GROUPS: readonly FitWarpControlGroup[] = [
  {
    id: 'eye-tail',
    label: '눈꼬리',
    makeupArea: 'eye',
    pointIds: ['left-brow', 'right-brow'],
    axes: [
      {adjustmentKey: 'horizontal', label: '바깥'},
      {adjustmentKey: 'vertical', label: '올림'},
    ],
  },
  {
    id: 'wing-length',
    label: '윙 길이',
    makeupArea: 'eye',
    pointIds: ['left-brow', 'right-brow'],
    axes: [
      {adjustmentKey: 'scale', label: '길이'},
      {adjustmentKey: 'rotation', label: '각도'},
    ],
  },
  {
    id: 'over-lip',
    label: '오버립',
    makeupArea: 'lip',
    pointIds: ['lip-top'],
    axes: [
      {adjustmentKey: 'scale', label: '오버립'},
      {adjustmentKey: 'vertical', label: '윗입술'},
    ],
  },
  {
    id: 'brow-arch',
    label: '아치',
    makeupArea: 'brow',
    pointIds: ['left-brow', 'right-brow'],
    axes: [
      {adjustmentKey: 'vertical', label: '아치 높이'},
      {adjustmentKey: 'scale', label: '두께'},
    ],
  },
];

const SELECTED_TAB_BACKGROUND_OPACITY = FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY;
const SHAPE_ADJUST_TITLE = '핏 수정';
const SHAPE_ADJUST_INTERACTION_MODE = 'drag-shape-point';
const SHAPE_PRESET_FILTER_ID = 'ar-filter-shape-preview';
const SHAPE_PRESET_LOOK_ID = 'current-makeup-look';
const SHAPE_POINT_PAN_RESPONDER_DEPENDENCY_MODE = 'shape-point-ids';
const DEFAULT_FIT_WARP_CONTROL_GROUP_ID: FitWarpControlGroupId = 'eye-tail';
const DEFAULT_FIT_WARP_SYMMETRY_ENABLED = true;
const FIT_WARP_GOLD = '#D6A44C';
const FIT_WARP_GOLD_STRONG = '#F0C66A';
const FIT_WARP_GOLD_SOFT = 'rgba(214, 164, 76, 0.34)';
const FIT_WARP_GOLD_MUTED = 'rgba(214, 164, 76, 0.16)';
const FIT_WARP_PANEL_SURFACE = 'rgba(15, 12, 14, 0.88)';
const FIT_WARP_HANDLE_SIZE = 26;
const FIT_WARP_CLAMP_RANGE_SIZE = 58;
const FIT_WARP_SLIDER_TRACK_HEIGHT = 8;

type ShapePreviewColorOverlayLayer = {
  id: string;
  style: ViewStyle;
};

export function getShapePreviewColorOverlayLayers(): readonly ShapePreviewColorOverlayLayer[] {
  return [];
}

export function getARFilterShapeAdjustCameraMode(): 'photo-preview' {
  return 'photo-preview';
}

export function getARFilterShapeAdjustSelectedTabOpacity(): number {
  return SELECTED_TAB_BACKGROUND_OPACITY;
}

export function getARFilterShapeAdjustTitle(): string {
  return SHAPE_ADJUST_TITLE;
}

export function getARFilterShapeAdjustInteractionMode(): 'drag-shape-point' {
  return SHAPE_ADJUST_INTERACTION_MODE;
}

export function getShapePointPanResponderDependencyMode(): 'shape-point-ids' {
  return SHAPE_POINT_PAN_RESPONDER_DEPENDENCY_MODE;
}

export function getARFilterShapeAdjustControlGroupLabels(): readonly string[] {
  return FIT_WARP_CONTROL_GROUPS.map(group => group.label);
}

export function getARFilterShapeAdjustAccentColor(): string {
  return FIT_WARP_GOLD;
}

export function getARFilterShapeAdjustDefaultSymmetryEnabled(): boolean {
  return DEFAULT_FIT_WARP_SYMMETRY_ENABLED;
}

function getFitWarpControlGroupById(
  controlGroupId: FitWarpControlGroupId,
): FitWarpControlGroup {
  return (
    FIT_WARP_CONTROL_GROUPS.find(group => group.id === controlGroupId) ??
    FIT_WARP_CONTROL_GROUPS.find(group => group.id === DEFAULT_FIT_WARP_CONTROL_GROUP_ID)!
  );
}

function getFitWarpControlGroupForPointId(
  pointId: string,
): FitWarpControlGroup | undefined {
  return FIT_WARP_CONTROL_GROUPS.find(group => group.pointIds.includes(pointId));
}

function getInitialFitWarpShapeState(): FilterShapeState {
  return {
    ...getFilterShapeState(),
    selectedMakeupArea: getFitWarpControlGroupById(DEFAULT_FIT_WARP_CONTROL_GROUP_ID).makeupArea,
  };
}

export function ARFilterShapeAdjustScreen({
  editSourceImageSource,
  editSourceImageUri,
  initialMakeupFilterId,
  onBack,
  onOpenProductEdit,
  onSave,
}: ARFilterShapeAdjustScreenProps) {
  const insets = useSafeAreaInsets();
  const filter = getRecommendedMakeupFilterById(initialMakeupFilterId);
  const shapeFilterColor = filter.colorOptions[0]?.hex ?? colors.white;
  const [shapeState, setShapeState] = useState<FilterShapeState>(
    getInitialFitWarpShapeState,
  );
  const [selectedShapePointId, setSelectedShapePointId] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<FilterShapePreviewSize>({
    height: 0,
    width: 0,
  });
  const [selectedFitControlGroupId, setSelectedFitControlGroupId] =
    useState<FitWarpControlGroupId>(DEFAULT_FIT_WARP_CONTROL_GROUP_ID);
  const [isSymmetryEnabled, setIsSymmetryEnabled] = useState(
    DEFAULT_FIT_WARP_SYMMETRY_ENABLED,
  );
  const [adjustmentTrackWidths, setAdjustmentTrackWidths] = useState<
    Partial<Record<FilterShapeAdjustmentKey, number>>
  >({});
  const dragStartOffsetsRef = useRef<Record<string, FilterShapePointCoordinate>>({});
  const previewSizeRef = useRef(previewSize);
  const shapeStateRef = useRef(shapeState);
  const shapePointIds = shapeState.shapePoints.map(point => point.id).join(',');
  const selectedFitControlGroup = getFitWarpControlGroupById(selectedFitControlGroupId);
  const activeShapePointIds = useMemo(
    () => new Set(selectedFitControlGroup.pointIds),
    [selectedFitControlGroup],
  );
  const previewImageSource: ImageSourcePropType =
    editSourceImageUri ? {uri: editSourceImageUri} : editSourceImageSource ?? filter.imageSource;

  previewSizeRef.current = previewSize;
  shapeStateRef.current = shapeState;

  const shapePointPanResponders = useMemo(() => {
    const responders: Record<string, ReturnType<typeof PanResponder.create>> = {};

    shapePointIds.split(',').filter(Boolean).forEach(pointId => {
      responders[pointId] = PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          const currentPoint = shapeStateRef.current.shapePoints.find(
            shapePoint => shapePoint.id === pointId,
          );

          if (!currentPoint) {
            return;
          }

          setSelectedShapePointId(pointId);
          const currentControlGroup =
            getFitWarpControlGroupById(selectedFitControlGroupId);
          const pointControlGroup = currentControlGroup.pointIds.includes(pointId)
            ? currentControlGroup
            : getFitWarpControlGroupForPointId(pointId);

          if (pointControlGroup) {
            setSelectedFitControlGroupId(pointControlGroup.id);
          }

          dragStartOffsetsRef.current[pointId] = currentPoint.offset;
        },
        onPanResponderMove: (_event, gestureState) => {
          const startOffset = dragStartOffsetsRef.current[pointId];

          setShapeState(currentState => {
            const currentPoint = currentState.shapePoints.find(
              shapePoint => shapePoint.id === pointId,
            );

            if (!currentPoint || !startOffset) {
              return currentState;
            }

            const nextOffset = getShapePointOffsetFromDrag({
              shapePoint: {
                ...currentPoint,
                offset: startOffset,
              },
              translation: {
                x: gestureState.dx,
                y: gestureState.dy,
              },
              previewSize: previewSizeRef.current,
            });

            return updateFilterShapePointOffsetWithSymmetry(
              currentState,
              pointId,
              nextOffset,
              isSymmetryEnabled,
            );
          });
        },
        onPanResponderRelease: () => {
          delete dragStartOffsetsRef.current[pointId];
        },
        onPanResponderTerminate: () => {
          delete dragStartOffsetsRef.current[pointId];
        },
      });
    });

    return responders;
  }, [isSymmetryEnabled, selectedFitControlGroupId, shapePointIds]);

  const handlePreviewLayout = ({nativeEvent}: LayoutChangeEvent) => {
    const {height, width} = nativeEvent.layout;

    setPreviewSize({height, width});
  };

  const handleFitControlGroupPress = (group: FitWarpControlGroup) => {
    setSelectedFitControlGroupId(group.id);
    setSelectedShapePointId(group.pointIds[0] ?? null);
    setShapeState(currentState => ({
      ...currentState,
      selectedMakeupArea: group.makeupArea,
    }));
  };

  const handleAdjustmentTrackLayout = (
    key: FilterShapeAdjustmentKey,
    {nativeEvent}: LayoutChangeEvent,
  ) => {
    setAdjustmentTrackWidths(currentWidths => ({
      ...currentWidths,
      [key]: nativeEvent.layout.width,
    }));
  };

  const handleAdjustmentTrackTouch = (
    key: FilterShapeAdjustmentKey,
    {nativeEvent}: GestureResponderEvent,
  ) => {
    const trackWidth = adjustmentTrackWidths[key];

    if (!trackWidth) {
      return;
    }

    setShapeState(currentState => {
      const adjustment = currentState.adjustments[key];
      const nextValue = getFilterShapeAdjustmentValueFromRatio(
        adjustment,
        nativeEvent.locationX / trackWidth,
      );

      return updateFilterShapeAdjustment(currentState, key, nextValue);
    });
  };

  const handleResetSelectedShapePoint = () => {
    if (!selectedShapePointId) {
      return;
    }

    setShapeState(currentState =>
      resetFilterShapePointOffsetWithSymmetry(
        currentState,
        selectedShapePointId,
        isSymmetryEnabled,
      ),
    );
  };

  const handleResetActiveFitControls = () => {
    setShapeState(currentState => {
      let nextState = currentState;

      selectedFitControlGroup.pointIds.forEach(pointId => {
        nextState = resetFilterShapePointOffset(nextState, pointId);
      });
      selectedFitControlGroup.axes.forEach(axis => {
        nextState = updateFilterShapeAdjustment(nextState, axis.adjustmentKey, 0);
      });

      return nextState;
    });
  };

  const handleSave = () => {
    onSave?.(
      createMakeupFilterShapePresetSaveValue({
        state: shapeState,
        makeupFilterId: SHAPE_PRESET_FILTER_ID,
        makeupLookId: SHAPE_PRESET_LOOK_ID,
      }),
    );
  };

  const toggleOverlay = () => {
    setShapeState(currentState => ({
      ...currentState,
      isOverlayVisible: !currentState.isOverlayVisible,
    }));
  };

  return (
    <FullscreenOverlayScreen>
      <FullscreenOverlayLayer>
        <NativeView
          onLayout={handlePreviewLayout}
          style={styles.previewGestureLayer}>
          <Image
            resizeMode="cover"
            source={previewImageSource}
            style={styles.previewPhoto}
          />
          <View style={styles.previewDim} />
          <View
            style={[
              styles.filterLayer,
              {
                transform: [
                  {translateX: shapeState.adjustments.horizontal.value},
                  {translateY: shapeState.adjustments.vertical.value},
                  {scale: 1 + shapeState.adjustments.scale.value / 100},
                  {rotate: `${shapeState.adjustments.rotation.value}deg`},
                ],
              },
            ]}>
            <View style={[styles.filterEyeLayer, {backgroundColor: shapeFilterColor}]} />
            <View style={[styles.filterCheekLayer, {backgroundColor: shapeFilterColor}]} />
            <View style={[styles.filterLipLayer, {backgroundColor: shapeFilterColor}]} />
          </View>

          {shapeState.isOverlayVisible
            ? shapeState.shapePoints.map(point => {
                const resolvedPosition = getResolvedShapePointPosition(point);
                const isActivePoint = activeShapePointIds.has(point.id);
                const isSelectedPoint = selectedShapePointId === point.id;

                return (
                  <React.Fragment key={point.id}>
                    <NativeView
                      pointerEvents="none"
                      style={[
                        styles.shapePointClampRange,
                        isActivePoint ? styles.shapePointClampRangeActive : undefined,
                        {
                          left: `${resolvedPosition.x}%`,
                          top: `${resolvedPosition.y}%`,
                        },
                      ]}
                    />
                    <NativeView
                      {...shapePointPanResponders[point.id]?.panHandlers}
                      accessibilityHint="손가락으로 끌어 메이크업 핏 포인트를 옮겨요."
                      accessibilityLabel={`${point.id} 핏 포인트`}
                      accessibilityRole="adjustable"
                      style={[
                        styles.shapePointDot,
                        isActivePoint ? styles.shapePointDotActiveGroup : styles.shapePointDotMuted,
                        isSelectedPoint ? styles.shapePointDotSelected : undefined,
                        {
                          left: `${resolvedPosition.x}%`,
                          top: `${resolvedPosition.y}%`,
                        },
                      ]}
                    />
                  </React.Fragment>
                );
              })
            : null}
        </NativeView>
      </FullscreenOverlayLayer>

      <ARFilterEditModeTabs
        activeMode="fit"
        onBack={onBack}
        onModeChange={mode => {
          if (mode === 'product') {
            onOpenProductEdit?.();
          }
        }}
        onSave={handleSave}
        topInset={insets.top}
      />

      <YStack pointerEvents="box-none" style={styles.fitBadgeArea}>
        <XStack style={styles.fitModeBadge}>
          <Sparkles color={FIT_WARP_GOLD_STRONG} size={iconSize.xs} strokeWidth={2} />
          <Text style={styles.fitModeBadgeText}>
            핏 조정 · {selectedFitControlGroup.label}
          </Text>
        </XStack>
      </YStack>

      <BottomOverlayPanel
        style={[
          styles.fitControlPanel,
          {paddingBottom: insets.bottom + spacing.lg},
        ]}>
        <YStack style={styles.fitControlSection}>
          <XStack style={styles.fitControlGroupTabs}>
            {FIT_WARP_CONTROL_GROUPS.map(group => (
              <FitControlGroupTab
                key={group.id}
                isActive={group.id === selectedFitControlGroup.id}
                label={group.label}
                onPress={() => handleFitControlGroupPress(group)}
              />
            ))}
          </XStack>
        </YStack>

        <YStack style={styles.precisionSliderList}>
          {selectedFitControlGroup.axes.map(axis => (
            <AdjustmentSliderRow
              key={`${selectedFitControlGroup.id}-${axis.adjustmentKey}`}
              adjustment={shapeState.adjustments[axis.adjustmentKey]}
              label={axis.label}
              onTrackLayout={event =>
                handleAdjustmentTrackLayout(axis.adjustmentKey, event)
              }
              onTrackTouch={event =>
                handleAdjustmentTrackTouch(axis.adjustmentKey, event)
              }
            />
          ))}
        </YStack>

        <XStack style={styles.fitPanelActions}>
          <PanelActionButton
            icon={<RotateCcw color={FIT_WARP_GOLD_STRONG} size={iconSize.xs} strokeWidth={2} />}
            label="리셋"
            onPress={handleResetActiveFitControls}
          />
          <PanelActionButton
            icon={<RotateCcw color={FIT_WARP_GOLD_STRONG} size={iconSize.xs} strokeWidth={2} />}
            isDisabled={!selectedShapePointId}
            label="선택점"
            onPress={handleResetSelectedShapePoint}
          />
          <PanelActionButton
            icon={
              isSymmetryEnabled ? (
                <Check color="#192016" size={iconSize.xs} strokeWidth={2.4} />
              ) : (
                <Check color={FIT_WARP_GOLD_STRONG} size={iconSize.xs} strokeWidth={2} />
              )
            }
            isActive={isSymmetryEnabled}
            label="대칭 적용"
            onPress={() => setIsSymmetryEnabled(currentValue => !currentValue)}
          />
          <PanelActionButton
            icon={
              shapeState.isOverlayVisible ? (
                <EyeOff color={FIT_WARP_GOLD_STRONG} size={iconSize.xs} strokeWidth={2} />
              ) : (
                <Eye color={FIT_WARP_GOLD_STRONG} size={iconSize.xs} strokeWidth={2} />
              )
            }
            label={shapeState.isOverlayVisible ? '숨김' : '보기'}
            onPress={toggleOverlay}
          />
        </XStack>

        <OverlaySaveButton
          accessibilityLabel="현재 필터 핏 저장"
          label="핏 저장"
          onPress={handleSave}
          style={styles.fitSaveButton}
        />
      </BottomOverlayPanel>
    </FullscreenOverlayScreen>
  );
}

type FitControlGroupTabProps = {
  isActive: boolean;
  label: string;
  onPress: () => void;
};

function FitControlGroupTab({isActive, label, onPress}: FitControlGroupTabProps) {
  return (
    <Button
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={[
        styles.fitControlGroupTab,
        isActive ? styles.fitControlGroupTabActive : undefined,
      ]}
      unstyled>
      <Text
        style={[
          styles.fitControlGroupTabText,
          isActive ? styles.fitControlGroupTabTextActive : undefined,
        ]}>
        {label}
      </Text>
    </Button>
  );
}

type PanelActionButtonProps = {
  icon: React.ReactNode;
  isActive?: boolean;
  isDisabled?: boolean;
  label: string;
  onPress: () => void;
};

function PanelActionButton({
  icon,
  isActive = false,
  isDisabled = false,
  label,
  onPress,
}: PanelActionButtonProps) {
  return (
    <Button
      accessibilityRole="button"
      accessibilityState={{disabled: isDisabled}}
      disabled={isDisabled}
      onPress={isDisabled ? undefined : onPress}
      pressStyle={{scale: 0.97}}
      style={[
        styles.panelActionButton,
        isActive ? styles.panelActionButtonActive : undefined,
        isDisabled ? styles.panelActionButtonDisabled : undefined,
      ]}
      unstyled>
      {icon}
      <Text
        style={[
          styles.panelActionButtonText,
          isActive ? styles.panelActionButtonTextActive : undefined,
        ]}>
        {label}
      </Text>
    </Button>
  );
}

type AdjustmentSliderRowProps = {
  adjustment: FilterShapeAdjustment;
  label: string;
  onTrackLayout: (event: LayoutChangeEvent) => void;
  onTrackTouch: (event: GestureResponderEvent) => void;
};

function AdjustmentSliderRow({
  adjustment,
  label,
  onTrackLayout,
  onTrackTouch,
}: AdjustmentSliderRowProps) {
  const range = adjustment.max - adjustment.min;
  const progress = ((adjustment.value - adjustment.min) / range) * 100;

  return (
    <YStack style={styles.precisionSliderRow}>
      <XStack style={styles.precisionSliderHeader}>
        <Text style={styles.precisionSliderLabel}>{label}</Text>
        <Text style={styles.precisionSliderValue}>
          {adjustment.value}
          {adjustment.unit}
        </Text>
      </XStack>

      <NativeView
        onLayout={onTrackLayout}
        onResponderGrant={onTrackTouch}
        onResponderMove={onTrackTouch}
        onStartShouldSetResponder={() => true}
        style={styles.precisionSliderTrack}>
        <View style={[styles.precisionSliderFill, {width: `${progress}%`}]} />
        <View style={styles.precisionSliderZeroMarker} />
        <View
          style={[
            styles.precisionSliderThumb,
            {
              left: `${progress}%`,
            },
          ]}
        />
      </NativeView>
    </YStack>
  );
}

const styles = StyleSheet.create({
  previewGestureLayer: {
    ...StyleSheet.absoluteFill,
  },
  previewPhoto: {
    height: '100%',
    width: '100%',
  },
  previewDim: {
    backgroundColor: colors.blackSurface,
    bottom: 0,
    left: 0,
    opacity: 0.18,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  filterLayer: {
    alignItems: 'center',
    height: 220,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -90,
    marginTop: -110,
    position: 'absolute',
    top: '50%',
    width: 180,
  },
  filterEyeLayer: {
    borderRadius: radius.pill,
    height: spacing.sm,
    opacity: 0.32,
    position: 'absolute',
    top: 78,
    width: 106,
  },
  filterCheekLayer: {
    borderRadius: radius.pill,
    height: spacing.lg,
    opacity: 0.22,
    position: 'absolute',
    top: 118,
    width: 138,
  },
  filterLipLayer: {
    borderRadius: radius.pill,
    bottom: 54,
    height: spacing.sm,
    opacity: 0.62,
    position: 'absolute',
    width: 42,
  },
  shapePointClampRange: {
    backgroundColor: FIT_WARP_GOLD_MUTED,
    borderColor: FIT_WARP_GOLD_SOFT,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: FIT_WARP_CLAMP_RANGE_SIZE,
    marginLeft: -FIT_WARP_CLAMP_RANGE_SIZE / 2,
    marginTop: -FIT_WARP_CLAMP_RANGE_SIZE / 2,
    opacity: 0.42,
    position: 'absolute',
    width: FIT_WARP_CLAMP_RANGE_SIZE,
  },
  shapePointClampRangeActive: {
    opacity: 1,
  },
  shapePointDot: {
    backgroundColor: FIT_WARP_GOLD_STRONG,
    borderColor: 'rgba(28, 18, 7, 0.86)',
    borderRadius: radius.pill,
    borderWidth: 3,
    height: FIT_WARP_HANDLE_SIZE,
    marginLeft: -FIT_WARP_HANDLE_SIZE / 2,
    marginTop: -FIT_WARP_HANDLE_SIZE / 2,
    position: 'absolute',
    shadowColor: FIT_WARP_GOLD,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.5,
    shadowRadius: 10,
    width: FIT_WARP_HANDLE_SIZE,
  },
  shapePointDotActiveGroup: {
    opacity: 1,
  },
  shapePointDotMuted: {
    opacity: 0.48,
  },
  shapePointDotSelected: {
    borderColor: colors.white,
    transform: [{scale: 1.16}],
  },
  fitBadgeArea: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    zIndex: 3,
  },
  fitModeBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: FIT_WARP_GOLD_MUTED,
    borderColor: FIT_WARP_GOLD_SOFT,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  fitModeBadgeText: {
    color: '#F4D999',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  fitControlPanel: {
    backgroundColor: FIT_WARP_PANEL_SURFACE,
    borderColor: FIT_WARP_GOLD_SOFT,
    borderWidth: 1,
    gap: spacing.md,
  },
  fitControlSection: {
    gap: spacing.sm,
  },
  fitControlGroupTabs: {
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fitControlGroupTab: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  fitControlGroupTabActive: {
    backgroundColor: FIT_WARP_GOLD,
    borderColor: FIT_WARP_GOLD_STRONG,
  },
  fitControlGroupTabText: {
    color: 'rgba(244, 217, 153, 0.72)',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  fitControlGroupTabTextActive: {
    color: '#1C1408',
  },
  precisionSliderList: {
    gap: spacing.md,
  },
  precisionSliderRow: {
    gap: spacing.sm,
  },
  precisionSliderHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  precisionSliderLabel: {
    color: '#F1D38B',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  precisionSliderValue: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  precisionSliderTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: radius.pill,
    height: FIT_WARP_SLIDER_TRACK_HEIGHT,
    justifyContent: 'center',
    overflow: 'visible',
  },
  precisionSliderFill: {
    backgroundColor: FIT_WARP_GOLD,
    borderRadius: radius.pill,
    height: FIT_WARP_SLIDER_TRACK_HEIGHT,
  },
  precisionSliderThumb: {
    backgroundColor: colors.white,
    borderColor: FIT_WARP_GOLD_STRONG,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 20,
    marginLeft: -10,
    marginTop: -10,
    position: 'absolute',
    top: FIT_WARP_SLIDER_TRACK_HEIGHT / 2,
    width: 20,
  },
  precisionSliderZeroMarker: {
    backgroundColor: 'rgba(255, 255, 255, 0.44)',
    height: 18,
    left: '50%',
    marginTop: -9,
    position: 'absolute',
    top: FIT_WARP_SLIDER_TRACK_HEIGHT / 2,
    width: 1,
  },
  fitPanelActions: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  panelActionButton: {
    alignItems: 'center',
    backgroundColor: FIT_WARP_GOLD_MUTED,
    borderColor: FIT_WARP_GOLD_SOFT,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  panelActionButtonActive: {
    backgroundColor: '#6BA568',
    borderColor: '#6BA568',
  },
  panelActionButtonDisabled: {
    opacity: 0.42,
  },
  panelActionButtonText: {
    color: '#F4D999',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  panelActionButtonTextActive: {
    color: '#192016',
  },
  fitSaveButton: {
    backgroundColor: FIT_WARP_GOLD,
  },
});
