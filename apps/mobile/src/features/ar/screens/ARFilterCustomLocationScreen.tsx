import React, {useState} from 'react';
import {StyleSheet, type ViewStyle} from 'react-native';
import {ChevronLeft, Eye, EyeOff, Minus, Plus, RotateCcw, Save} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getDefaultMakeupFilter,
  getMockARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {FacePartId} from '../../../shared/types/makeupGuide';
import {
  BottomOverlayPanel,
  FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY,
  FullscreenOverlayLayer,
  FullscreenOverlayScreen,
  LiveCameraLayer,
  OverlayAdjustmentTabs,
  OverlayChipButton,
  OverlayIconButton,
  OverlayPanelSection,
  OverlaySaveButton,
  OverlayTopBar,
} from '../../../shared/ui';
import {
  getMockFilterLocationState,
  updateFilterLocationAdjustment,
  type FilterLocationAdjustment,
  type FilterLocationAdjustmentKey,
  type FilterLocationState,
} from '../services/filterCustomizationService';

type ARFilterCustomLocationScreenProps = {
  onBack?: () => void;
  onOpenStyleAdjust?: () => void;
  onSave?: () => void;
};

const ADJUSTMENT_KEYS: readonly FilterLocationAdjustmentKey[] = [
  'horizontal',
  'vertical',
  'scale',
  'rotation',
];
const SELECTED_TAB_BACKGROUND_OPACITY = FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY;

type LocationPreviewColorOverlayLayer = {
  id: string;
  style: ViewStyle;
};

export function getLocationPreviewColorOverlayLayers(): readonly LocationPreviewColorOverlayLayer[] {
  return [];
}

export function getARFilterCustomLocationCameraMode(): 'live-camera' {
  return 'live-camera';
}

export function getARFilterCustomLocationSelectedTabOpacity(): number {
  return SELECTED_TAB_BACKGROUND_OPACITY;
}

export function ARFilterCustomLocationScreen({
  onBack,
  onOpenStyleAdjust,
  onSave,
}: ARFilterCustomLocationScreenProps) {
  const insets = useSafeAreaInsets();
  const arGuideData = getMockARMakeupGuideData();
  const filter = getDefaultMakeupFilter(arGuideData);
  const locationFilterColor = filter.colorOptions[0]?.hex ?? colors.white;
  const [locationState, setLocationState] = useState<FilterLocationState>(
    getMockFilterLocationState(),
  );

  const handleFacePartPress = (facePartId: FacePartId) => {
    setLocationState(currentState => ({
      ...currentState,
      selectedFacePartId: facePartId,
    }));
  };

  const handleAdjustmentPress = (
    key: FilterLocationAdjustmentKey,
    direction: 'decrease' | 'increase',
  ) => {
    setLocationState(currentState => {
      const adjustment = currentState.adjustments[key];
      const nextValue =
        adjustment.value + (direction === 'increase' ? adjustment.step : -adjustment.step);

      return updateFilterLocationAdjustment(currentState, key, nextValue);
    });
  };

  const handleReset = () => {
    setLocationState(getMockFilterLocationState());
  };

  const toggleOverlay = () => {
    setLocationState(currentState => ({
      ...currentState,
      isOverlayVisible: !currentState.isOverlayVisible,
    }));
  };

  return (
    <FullscreenOverlayScreen>
      <FullscreenOverlayLayer>
        <LiveCameraLayer />
        <View style={styles.previewDim} />
        <View
          style={[
            styles.filterLayer,
            {
              transform: [
                {translateX: locationState.adjustments.horizontal.value},
                {translateY: locationState.adjustments.vertical.value},
                {scale: 1 + locationState.adjustments.scale.value / 100},
                {rotate: `${locationState.adjustments.rotation.value}deg`},
              ],
            },
          ]}>
          <View style={[styles.filterEyeLayer, {backgroundColor: locationFilterColor}]} />
          <View style={[styles.filterCheekLayer, {backgroundColor: locationFilterColor}]} />
          <View style={[styles.filterLipLayer, {backgroundColor: locationFilterColor}]} />
        </View>

        {locationState.isOverlayVisible
          ? locationState.landmarks.map(point => (
              <View
                key={point.id}
                accessibilityLabel={`${point.id} 랜드마크`}
                style={[
                  styles.landmarkDot,
                  {
                    left: `${point.x}%`,
                    top: `${point.y}%`,
                  },
                ]}
              />
            ))
          : null}
      </FullscreenOverlayLayer>

      <YStack style={[styles.headerArea, {paddingTop: insets.top + spacing.md}]}>
        <OverlayTopBar
          eyebrow="FILTER CUSTOM"
          leftSlot={
            <OverlayIconButton
              accessibilityLabel="AR 필터 화면으로 돌아가기"
              onPress={onBack}>
              <ChevronLeft color={colors.white} size={iconSize.md} strokeWidth={2} />
            </OverlayIconButton>
          }
          rightSlot={
            <OverlayIconButton
              accessibilityLabel="현재 위치 저장"
              onPress={onSave}>
              <Save color={colors.white} size={iconSize.sm} strokeWidth={2} />
            </OverlayIconButton>
          }
          title="위치 조정"
        />

        <OverlayAdjustmentTabs
          activeTab="location"
          onPressStyle={onOpenStyleAdjust}
        />

        <XStack style={styles.quickActions}>
          <ActionPill
            icon={<RotateCcw color={colors.white} size={iconSize.xs} strokeWidth={2} />}
            label="되돌리기"
            onPress={handleReset}
          />
          <ActionPill
            icon={
              locationState.isOverlayVisible ? (
                <EyeOff color={colors.white} size={iconSize.xs} strokeWidth={2} />
              ) : (
                <Eye color={colors.white} size={iconSize.xs} strokeWidth={2} />
              )
            }
            label={locationState.isOverlayVisible ? '숨김' : '보기'}
            onPress={toggleOverlay}
          />
        </XStack>
      </YStack>

      <BottomOverlayPanel style={{paddingBottom: insets.bottom + spacing.lg}}>
        <OverlayPanelSection label="얼굴 부위">
          <XStack style={styles.facePartList}>
            {arGuideData.faceParts.map(facePart => (
              <OverlayChipButton
                key={facePart.id}
                height={34}
                isActive={facePart.id === locationState.selectedFacePartId}
                label={facePart.label}
                onPress={() => handleFacePartPress(facePart.id)}
                paddingHorizontal={spacing.md}
              />
            ))}
          </XStack>
        </OverlayPanelSection>

        <YStack style={styles.adjustmentList}>
          {ADJUSTMENT_KEYS.map(key => (
            <AdjustmentRow
              key={key}
              adjustment={locationState.adjustments[key]}
              onDecrease={() => handleAdjustmentPress(key, 'decrease')}
              onIncrease={() => handleAdjustmentPress(key, 'increase')}
            />
          ))}
        </YStack>

        <OverlaySaveButton
          accessibilityLabel="현재 필터 위치 저장"
          onPress={onSave}
        />
      </BottomOverlayPanel>
    </FullscreenOverlayScreen>
  );
}

type ActionPillProps = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
};

function ActionPill({icon, label, onPress}: ActionPillProps) {
  return (
    <Button
      accessibilityRole="button"
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={styles.actionPill}
      unstyled>
      {icon}
      <Text style={styles.actionPillText}>{label}</Text>
    </Button>
  );
}

type AdjustmentRowProps = {
  adjustment: FilterLocationAdjustment;
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
  landmarkDot: {
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
  actionPillText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  facePartList: {
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
