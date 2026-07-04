import React, {useMemo, useRef, useState} from 'react';
import {
  PanResponder,
  StyleSheet,
  View as NativeView,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import {Eye, EyeOff, Minus, Plus, RotateCcw, Save} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getDefaultMakeupFilter,
  getARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupArea} from '../../../shared/types/makeupGuide';
import {
  BottomOverlayPanel,
  FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY,
  FullscreenOverlayLayer,
  FullscreenOverlayScreen,
  AppHeader,
  LiveCameraLayer,
  OverlayChipButton,
  OverlayIconButton,
  OverlayPanelSection,
  OverlaySaveButton,
} from '../../../shared/ui';
import {
  createMakeupFilterShapePresetSaveValue,
  getFilterShapeState,
  getResolvedShapePointPosition,
  getShapePointOffsetFromDrag,
  resetFilterShapePointOffset,
  resetFilterShapePoints,
  updateFilterShapeAdjustment,
  updateFilterShapePointOffset,
  type FilterShapeAdjustment,
  type FilterShapeAdjustmentKey,
  type FilterShapePointCoordinate,
  type FilterShapePreviewSize,
  type FilterShapeState,
  type MakeupFilterShapePresetSaveValue,
} from '../services/filterCustomizationService';

type ARFilterShapeAdjustScreenProps = {
  onBack?: () => void;
  onSave?: (shapePresetSaveValue: MakeupFilterShapePresetSaveValue) => void;
};

const ADJUSTMENT_KEYS: readonly FilterShapeAdjustmentKey[] = [
  'horizontal',
  'vertical',
  'scale',
  'rotation',
];
const SELECTED_TAB_BACKGROUND_OPACITY = FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY;
const SHAPE_ADJUST_TITLE = '형태 수정';
const SHAPE_ADJUST_INTERACTION_MODE = 'drag-shape-point';
const SHAPE_PRESET_FILTER_ID = 'ar-filter-shape-preview';
const SHAPE_PRESET_LOOK_ID = 'current-makeup-look';
const SHAPE_POINT_PAN_RESPONDER_DEPENDENCY_MODE = 'shape-point-ids';

type ShapePreviewColorOverlayLayer = {
  id: string;
  style: ViewStyle;
};

export function getShapePreviewColorOverlayLayers(): readonly ShapePreviewColorOverlayLayer[] {
  return [];
}

export function getARFilterShapeAdjustCameraMode(): 'live-camera' {
  return 'live-camera';
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

export function ARFilterShapeAdjustScreen({
  onBack,
  onSave,
}: ARFilterShapeAdjustScreenProps) {
  const insets = useSafeAreaInsets();
  const arGuideData = getARMakeupGuideData();
  const filter = getDefaultMakeupFilter(arGuideData);
  const shapeFilterColor = filter.colorOptions[0]?.hex ?? colors.white;
  const [shapeState, setShapeState] = useState<FilterShapeState>(
    getFilterShapeState(),
  );
  const [selectedShapePointId, setSelectedShapePointId] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<FilterShapePreviewSize>({
    height: 0,
    width: 0,
  });
  const dragStartOffsetsRef = useRef<Record<string, FilterShapePointCoordinate>>({});
  const previewSizeRef = useRef(previewSize);
  const shapeStateRef = useRef(shapeState);
  const shapePointIds = shapeState.shapePoints.map(point => point.id).join(',');

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

            return updateFilterShapePointOffset(currentState, pointId, nextOffset);
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
  }, [shapePointIds]);

  const handlePreviewLayout = ({nativeEvent}: LayoutChangeEvent) => {
    const {height, width} = nativeEvent.layout;

    setPreviewSize({height, width});
  };

  const handleMakeupAreaOptionPress = (makeupAreaId: MakeupArea) => {
    setShapeState(currentState => ({
      ...currentState,
      selectedMakeupArea: makeupAreaId,
    }));
  };

  const handleAdjustmentPress = (
    key: FilterShapeAdjustmentKey,
    direction: 'decrease' | 'increase',
  ) => {
    setShapeState(currentState => {
      const adjustment = currentState.adjustments[key];
      const nextValue =
        adjustment.value + (direction === 'increase' ? adjustment.step : -adjustment.step);

      return updateFilterShapeAdjustment(currentState, key, nextValue);
    });
  };

  const handleResetAllShapePoints = () => {
    setShapeState(currentState => resetFilterShapePoints(currentState));
  };

  const handleResetSelectedShapePoint = () => {
    if (!selectedShapePointId) {
      return;
    }

    setShapeState(currentState =>
      resetFilterShapePointOffset(currentState, selectedShapePointId),
    );
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
          <LiveCameraLayer />
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

                return (
                  <NativeView
                    {...shapePointPanResponders[point.id]?.panHandlers}
                    accessibilityHint="손가락으로 끌어 메이크업 형태점을 옮겨요."
                    accessibilityLabel={`${point.id} 형태점`}
                    accessibilityRole="adjustable"
                    key={point.id}
                    style={[
                      styles.shapePointDot,
                      selectedShapePointId === point.id ? styles.shapePointDotActive : undefined,
                      {
                        left: `${resolvedPosition.x}%`,
                        top: `${resolvedPosition.y}%`,
                      },
                    ]}
                  />
                );
              })
            : null}
        </NativeView>
      </FullscreenOverlayLayer>

      <YStack style={[styles.headerArea, {paddingTop: insets.top + spacing.md}]}>
        <AppHeader
          containerProps={{style: styles.immersiveHeader}}
          contextLabel="FILTER CUSTOM"
          onBack={onBack}
          rightSlot={
            <OverlayIconButton
              accessibilityLabel="현재 형태 저장"
              onPress={handleSave}>
              <Save color={colors.white} size={iconSize.sm} strokeWidth={2} />
            </OverlayIconButton>
          }
          title={SHAPE_ADJUST_TITLE}
          topInset={0}
          variant="immersive"
        />

        <XStack style={styles.quickActions}>
          <ActionPill
            icon={<RotateCcw color={colors.white} size={iconSize.xs} strokeWidth={2} />}
            label="전체 점 초기화"
            onPress={handleResetAllShapePoints}
          />
          <ActionPill
            icon={<RotateCcw color={colors.white} size={iconSize.xs} strokeWidth={2} />}
            isDisabled={!selectedShapePointId}
            label="선택점 초기화"
            onPress={handleResetSelectedShapePoint}
          />
          <ActionPill
            icon={
              shapeState.isOverlayVisible ? (
                <EyeOff color={colors.white} size={iconSize.xs} strokeWidth={2} />
              ) : (
                <Eye color={colors.white} size={iconSize.xs} strokeWidth={2} />
              )
            }
            label={shapeState.isOverlayVisible ? '숨김' : '보기'}
            onPress={toggleOverlay}
          />
        </XStack>
      </YStack>

      <BottomOverlayPanel style={{paddingBottom: insets.bottom + spacing.lg}}>
        <OverlayPanelSection label="메이크업 영역">
          <XStack style={styles.makeupAreaList}>
            {arGuideData.makeupAreas.map(makeupArea => (
              <OverlayChipButton
                key={makeupArea.id}
                height={34}
                isActive={makeupArea.id === shapeState.selectedMakeupArea}
                label={makeupArea.label}
                onPress={() => handleMakeupAreaOptionPress(makeupArea.id)}
                paddingHorizontal={spacing.md}
              />
            ))}
          </XStack>
        </OverlayPanelSection>

        <YStack style={styles.adjustmentList}>
          {ADJUSTMENT_KEYS.map(key => (
            <AdjustmentRow
              key={key}
              adjustment={shapeState.adjustments[key]}
              onDecrease={() => handleAdjustmentPress(key, 'decrease')}
              onIncrease={() => handleAdjustmentPress(key, 'increase')}
            />
          ))}
        </YStack>

        <OverlaySaveButton
          accessibilityLabel="현재 필터 형태 저장"
          onPress={handleSave}
        />
      </BottomOverlayPanel>
    </FullscreenOverlayScreen>
  );
}

type ActionPillProps = {
  icon: React.ReactNode;
  isDisabled?: boolean;
  label: string;
  onPress: () => void;
};

function ActionPill({icon, isDisabled = false, label, onPress}: ActionPillProps) {
  return (
    <Button
      accessibilityState={{disabled: isDisabled}}
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={isDisabled ? undefined : onPress}
      pressStyle={{scale: 0.97}}
      style={[styles.actionPill, isDisabled ? styles.actionPillDisabled : undefined]}
      unstyled>
      {icon}
      <Text style={styles.actionPillText}>{label}</Text>
    </Button>
  );
}

type AdjustmentRowProps = {
  adjustment: FilterShapeAdjustment;
  onDecrease: () => void;
  onIncrease: () => void;
};

function AdjustmentRow({adjustment, onDecrease, onIncrease}: AdjustmentRowProps) {
  const range = adjustment.max - adjustment.min;
  const progress = ((adjustment.value - adjustment.min) / range) * 100;

  return (
    <YStack style={styles.adjustmentRow}>
      <XStack style={styles.adjustmentHeader}>
        <Text style={styles.adjustmentLabel}>{adjustment.label}</Text>
        <Text style={styles.adjustmentValue}>
          {adjustment.value}
          {adjustment.unit}
        </Text>
      </XStack>

      <XStack style={styles.adjustmentControl}>
        <Button
          accessibilityLabel={`${adjustment.label} 줄이기`}
          accessibilityRole="button"
          onPress={onDecrease}
          pressStyle={{scale: 0.95}}
          style={styles.stepButton}
          unstyled>
          <Minus color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
        </Button>

        <View style={styles.adjustmentTrack}>
          <View style={[styles.adjustmentFill, {width: `${progress}%`}]} />
        </View>

        <Button
          accessibilityLabel={`${adjustment.label} 늘리기`}
          accessibilityRole="button"
          onPress={onIncrease}
          pressStyle={{scale: 0.95}}
          style={styles.stepButton}
          unstyled>
          <Plus color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
        </Button>
      </XStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  headerArea: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    zIndex: 3,
  },
  immersiveHeader: {
    paddingHorizontal: 0,
  },
  previewGestureLayer: {
    ...StyleSheet.absoluteFill,
  },
  previewDim: {
    backgroundColor: colors.black,
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
  shapePointDot: {
    backgroundColor: colors.white,
    borderColor: colors.black,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: spacing.md,
    marginLeft: -spacing.sm,
    marginTop: -spacing.sm,
    position: 'absolute',
    width: spacing.md,
  },
  shapePointDotActive: {
    backgroundColor: colors.black,
    borderColor: colors.white,
    transform: [{scale: 1.18}],
  },
  quickActions: {
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  actionPill: {
    alignItems: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  actionPillDisabled: {
    opacity: 0.42,
  },
  actionPillText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  makeupAreaList: {
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  adjustmentList: {
    gap: spacing.md,
  },
  adjustmentRow: {
    gap: spacing.sm,
  },
  adjustmentHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  adjustmentLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  adjustmentValue: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  adjustmentControl: {
    alignItems: 'center',
    gap: spacing.md,
  },
  stepButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    padding: 0,
    width: 34,
  },
  adjustmentTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    flex: 1,
    height: spacing.sm,
    overflow: 'hidden',
  },
  adjustmentFill: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: '100%',
  },
});
