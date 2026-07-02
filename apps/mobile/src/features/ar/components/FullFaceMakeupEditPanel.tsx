import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {Minus, Plus} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {
  OverlayChipButton,
  OverlayDisclosureSection,
  OverlayPanelSection,
} from '../../../shared/ui';
import {
  FULL_FACE_MAKEUP_EDIT_REGIONS,
  getFullFaceMakeupRegionLabel,
} from '../services/fullFaceMakeupEditService';
import type {UseFullFaceMakeupEditStateResult} from '../hooks/useFullFaceMakeupEditState';

type FullFaceMakeupEditPanelProps = UseFullFaceMakeupEditStateResult;

export function FullFaceMakeupEditPanel({
  activeFullFaceCandidateOptions,
  activeFullFaceColorOptions,
  activeFullFaceControl,
  activeFullFaceFields,
  activeFullFaceFinishOptions,
  fullFaceState,
  handleFullFaceCandidatePress,
  handleFullFaceColorPress,
  handleFullFaceEnabledToggle,
  handleFullFaceFinishPress,
  handleFullFaceIntensityPress,
  handleFullFaceParamPress,
  handleFullFaceRegionPress,
}: FullFaceMakeupEditPanelProps) {
  return (
    <>
      <OverlayPanelSection label="부위">
        <ScrollView
          contentContainerStyle={styles.horizontalList}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {FULL_FACE_MAKEUP_EDIT_REGIONS.map(region => (
            <OverlayChipButton
              key={region}
              isActive={region === fullFaceState.selectedRegion}
              label={getFullFaceMakeupRegionLabel(region)}
              onPress={() => handleFullFaceRegionPress(region)}
            />
          ))}
        </ScrollView>
      </OverlayPanelSection>

      <OverlayPanelSection label="색">
        <XStack style={styles.swatchList}>
          {activeFullFaceColorOptions.map(option => (
            <Button
              key={option.id}
              accessibilityLabel={`${option.label} 색 선택`}
              accessibilityRole="button"
              accessibilityState={{selected: option.hex === activeFullFaceControl.colorHex}}
              onPress={() => handleFullFaceColorPress(option.hex)}
              pressStyle={{scale: 0.96}}
              style={[
                styles.swatchButton,
                {
                  backgroundColor: option.hex,
                  borderColor:
                    option.hex === activeFullFaceControl.colorHex
                      ? colors.white
                      : colors.borderStrong,
                },
              ]}
              unstyled>
              <View style={styles.swatchInner} />
            </Button>
          ))}
        </XStack>
      </OverlayPanelSection>

      <OverlayPanelSection label="조정">
        <YStack style={styles.fullFaceAdjustmentList}>
          <FullFaceAdjustmentRow
            label="적용"
            onDecrease={handleFullFaceEnabledToggle}
            onIncrease={handleFullFaceEnabledToggle}
            value={activeFullFaceControl.enabled ? '켬' : '끔'}
          />
          <FullFaceAdjustmentRow
            label="세기"
            onDecrease={() => handleFullFaceIntensityPress('decrease')}
            onIncrease={() => handleFullFaceIntensityPress('increase')}
            value={formatFullFaceAdjustmentValue(activeFullFaceControl.intensity)}
          />
        </YStack>
      </OverlayPanelSection>

      <OverlayDisclosureSection label="세부 조정">
        <OverlayPanelSection label="표현">
          <ScrollView
            contentContainerStyle={styles.horizontalList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {activeFullFaceFinishOptions.map(option => (
              <OverlayChipButton
                key={option.id}
                isActive={option.finish === activeFullFaceControl.finish}
                label={option.label}
                onPress={() => handleFullFaceFinishPress(option.id)}
              />
            ))}
          </ScrollView>
        </OverlayPanelSection>

        <OverlayPanelSection label="스타일">
          <ScrollView
            contentContainerStyle={styles.horizontalList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {activeFullFaceCandidateOptions.map(option => (
              <OverlayChipButton
                key={option.id}
                isActive={option.maskTextureId === activeFullFaceControl.maskTextureId}
                label={option.label}
                onPress={() => handleFullFaceCandidatePress(option.id)}
              />
            ))}
          </ScrollView>
        </OverlayPanelSection>

        {activeFullFaceFields.length > 0 ? (
          <OverlayPanelSection label="모양">
            <YStack style={styles.fullFaceAdjustmentList}>
              {activeFullFaceFields.map(field => (
                <FullFaceAdjustmentRow
                  key={field.name}
                  label={field.label}
                  onDecrease={() => handleFullFaceParamPress(field, 'decrease')}
                  onIncrease={() => handleFullFaceParamPress(field, 'increase')}
                  value={formatFullFaceAdjustmentValue(
                    activeFullFaceControl.params[field.name] ?? field.defaultValue,
                  )}
                />
              ))}
            </YStack>
          </OverlayPanelSection>
        ) : null}
      </OverlayDisclosureSection>
    </>
  );
}

function FullFaceAdjustmentRow({
  label,
  onDecrease,
  onIncrease,
  value,
}: {
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
  value: string;
}) {
  return (
    <XStack style={styles.fullFaceAdjustmentRow}>
      <Text style={styles.fullFaceAdjustmentLabel}>{label}</Text>
      <XStack style={styles.fullFaceAdjustmentControl}>
        <Button
          accessibilityLabel={`${label} 낮추기`}
          accessibilityRole="button"
          onPress={onDecrease}
          pressStyle={{scale: 0.96}}
          style={styles.adjustmentStepButton}
          unstyled>
          <Minus color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
        </Button>
        <Text style={styles.fullFaceAdjustmentValue}>{value}</Text>
        <Button
          accessibilityLabel={`${label} 높이기`}
          accessibilityRole="button"
          onPress={onIncrease}
          pressStyle={{scale: 0.96}}
          style={styles.adjustmentStepButton}
          unstyled>
          <Plus color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
        </Button>
      </XStack>
    </XStack>
  );
}

function formatFullFaceAdjustmentValue(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

const styles = StyleSheet.create({
  horizontalList: {
    gap: spacing.sm,
    paddingRight: spacing.xl,
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
  fullFaceAdjustmentList: {
    gap: spacing.sm,
  },
  fullFaceAdjustmentRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  fullFaceAdjustmentLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  fullFaceAdjustmentControl: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  fullFaceAdjustmentValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    minWidth: 42,
    textAlign: 'center',
  },
  adjustmentStepButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: iconSize.lg,
    justifyContent: 'center',
    padding: 0,
    width: iconSize.lg,
  },
});
