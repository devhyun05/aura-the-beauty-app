import React, {useState} from 'react';
import {StyleSheet, type ViewStyle} from 'react-native';
import {ChevronLeft, Eye, EyeOff, Minus, Plus, RotateCcw, Save} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getDefaultMakeupFilter,
  getMockARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {FacePartId} from '../../../shared/types/makeupGuide';
import {LiveCameraLayer} from '../../../shared/ui';
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
const SELECTED_TAB_BACKGROUND_OPACITY = 0.62;
const SELECTED_TAB_BACKGROUND_COLOR = `rgba(255, 255, 255, ${SELECTED_TAB_BACKGROUND_OPACITY})`;

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
    <View style={styles.screen}>
      <View style={styles.cameraLayer}>
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
      </View>

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
            <ChevronLeft color={colors.white} size={iconSize.md} strokeWidth={2} />
          </Button>

          <YStack style={styles.headerCopy}>
            <Text style={styles.eyebrow}>FILTER CUSTOM</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              위치 조정
            </Text>
          </YStack>

          <Button
            accessibilityLabel="현재 위치 저장"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onSave}
            pressStyle={{scale: 0.97}}
            style={styles.iconButton}
            unstyled>
            <Save color={colors.white} size={iconSize.sm} strokeWidth={2} />
          </Button>
        </XStack>

        <XStack style={styles.segmentedControl}>
          <Button
            accessibilityRole="button"
            accessibilityState={{selected: true}}
            pressStyle={{scale: 0.98}}
            style={[styles.segmentButton, styles.segmentButtonActive]}
            unstyled>
            <Text style={[styles.segmentText, styles.segmentTextActive]}>위치 조정</Text>
          </Button>
          <Button
            accessibilityRole="button"
            accessibilityState={{selected: false}}
            onPress={onOpenStyleAdjust}
            pressStyle={{scale: 0.98}}
            style={styles.segmentButton}
            unstyled>
            <Text style={styles.segmentText}>스타일 조정</Text>
          </Button>
        </XStack>

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

      <YStack style={[styles.controlPanel, {paddingBottom: insets.bottom + spacing.lg}]}>
        <YStack style={styles.panelSection}>
          <Text style={styles.panelLabel}>얼굴 부위</Text>
          <XStack style={styles.facePartList}>
            {arGuideData.faceParts.map(facePart => (
              <Button
                key={facePart.id}
                accessibilityRole="button"
                accessibilityState={{
                  selected: facePart.id === locationState.selectedFacePartId,
                }}
                onPress={() => handleFacePartPress(facePart.id)}
                pressStyle={{scale: 0.97}}
                style={[
                  styles.facePartChip,
                  facePart.id === locationState.selectedFacePartId
                    ? styles.facePartChipActive
                    : undefined,
                ]}
                unstyled>
                <Text
                  style={[
                    styles.facePartText,
                    facePart.id === locationState.selectedFacePartId
                      ? styles.facePartTextActive
                      : undefined,
                  ]}>
                  {facePart.label}
                </Text>
              </Button>
            ))}
          </XStack>
        </YStack>

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

        <Button
          accessibilityLabel="현재 필터 위치 저장"
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
  headerArea: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    zIndex: 3,
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
  },
  iconButton: {
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
  eyebrow: {
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
    backgroundColor: SELECTED_TAB_BACKGROUND_COLOR,
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
  controlPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    bottom: spacing.md,
    gap: spacing.lg,
    left: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    position: 'absolute',
    right: spacing.md,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
    zIndex: 4,
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
  facePartList: {
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  facePartChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  facePartChipActive: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  facePartText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  facePartTextActive: {
    color: colors.white,
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
