import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {ChevronLeft, Sparkles} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {
  createUnityMakeupRecipeBatch,
  postUnityMakeupRecipe,
  UNITY_MAKEUP_BRIDGE_TARGET,
  UNITY_MAKEUP_REGION_PRESETS,
  type UnityMakeupRegion,
} from '../services/unityMakeupBridge';

type UnityMakeupCaptureScreenProps = {
  onBack?: () => void;
  onComplete?: () => void;
};

const REGION_OPTIONS: UnityMakeupRegion[] = ['lip', 'cheek', 'brow'];

export function UnityMakeupCaptureScreen({
  onBack,
  onComplete,
}: UnityMakeupCaptureScreenProps) {
  const insets = useSafeAreaInsets();
  const [activeRegion, setActiveRegion] = useState<UnityMakeupRegion>('lip');
  const recipeBatch = useMemo(
    () => createUnityMakeupRecipeBatch(activeRegion),
    [activeRegion],
  );
  const activePreset = UNITY_MAKEUP_REGION_PRESETS[activeRegion];

  const handleRegionPress = (region: UnityMakeupRegion) => {
    const nextRecipeBatch = createUnityMakeupRecipeBatch(region);

    setActiveRegion(region);
    postUnityMakeupRecipe(nextRecipeBatch);
  };

  return (
    <YStack
      style={[
        styles.screen,
        {
          paddingBottom: Math.max(insets.bottom, spacing.lg),
          paddingTop: Math.max(insets.top, spacing.lg),
        },
      ]}>
      <XStack style={styles.header}>
        <Pressable
          accessibilityLabel="홈으로 돌아가기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}>
          <ChevronLeft color={colors.white} size={iconSize.md} strokeWidth={2} />
        </Pressable>

        <YStack style={styles.headerTitleGroup}>
          <Text style={styles.headerEyebrow}>UNITY MAKEUP AR</Text>
          <Text style={styles.headerTitle}>Lip · Cheek · Brow</Text>
        </YStack>

        <View style={styles.headerSpacer} />
      </XStack>

      <YStack style={styles.cameraStage}>
        <View style={styles.unityMountPoint}>
          <View style={styles.faceGuide} />
          <View
            style={[
              styles.regionPreview,
              styles.lipPreview,
              activeRegion === 'lip' && styles.regionPreviewActive,
            ]}
          />
          <View
            style={[
              styles.regionPreview,
              styles.cheekPreviewLeft,
              activeRegion === 'cheek' && styles.regionPreviewActive,
            ]}
          />
          <View
            style={[
              styles.regionPreview,
              styles.cheekPreviewRight,
              activeRegion === 'cheek' && styles.regionPreviewActive,
            ]}
          />
          <View
            style={[
              styles.regionPreview,
              styles.browPreviewLeft,
              activeRegion === 'brow' && styles.regionPreviewActive,
            ]}
          />
          <View
            style={[
              styles.regionPreview,
              styles.browPreviewRight,
              activeRegion === 'brow' && styles.regionPreviewActive,
            ]}
          />
        </View>

        <XStack style={styles.statusPill}>
          <Sparkles color={colors.white} size={iconSize.xs} strokeWidth={2} />
          <Text style={styles.statusText}>{activePreset.label} AR recipe ready</Text>
        </XStack>
      </YStack>

      <YStack style={styles.controlPanel}>
        <XStack style={styles.regionTabs}>
          {REGION_OPTIONS.map(region => {
            const preset = UNITY_MAKEUP_REGION_PRESETS[region];
            const isActive = region === activeRegion;

            return (
              <Pressable
                accessibilityLabel={`${preset.label} AR 보기`}
                accessibilityRole="button"
                key={region}
                onPress={() => handleRegionPress(region)}
                style={({pressed}) => [
                  styles.regionButton,
                  isActive && styles.regionButtonActive,
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.regionButtonText,
                    isActive && styles.regionButtonTextActive,
                  ]}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </XStack>

        <YStack style={styles.payloadPanel}>
          <BridgeRow label="Branch" value={activePreset.branchSource} />
          <BridgeRow label="Target" value={UNITY_MAKEUP_BRIDGE_TARGET.gameObject} />
          <BridgeRow label="Method" value={UNITY_MAKEUP_BRIDGE_TARGET.applyRecipeMethod} />
          <BridgeRow label="Region" value={recipeBatch.activeRegions} />
          <BridgeRow label="Mask" value={activePreset.maskTextureId} />
        </YStack>
      </YStack>

      <Pressable
        accessibilityLabel="Unity AR 촬영 완료"
        accessibilityRole="button"
        onPress={onComplete}
        style={({pressed}) => [styles.captureButton, pressed && styles.capturePressed]}>
        <View style={styles.captureButtonInner} />
      </Pressable>
    </YStack>
  );
}

function BridgeRow({label, value}: {label: string; value: string}) {
  return (
    <XStack style={styles.bridgeRow}>
      <Text style={styles.bridgeLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.bridgeValue}>
        {value}
      </Text>
    </XStack>
  );
}

const styles = StyleSheet.create({
  bridgeLabel: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    width: 58,
  },
  bridgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  bridgeValue: {
    color: colors.white,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  browPreviewLeft: {
    backgroundColor: 'rgba(74, 52, 43, 0.62)',
    height: 12,
    left: '31%',
    top: '32%',
    transform: [{rotate: '-6deg'}],
    width: 58,
  },
  browPreviewRight: {
    backgroundColor: 'rgba(74, 52, 43, 0.62)',
    height: 12,
    right: '31%',
    top: '32%',
    transform: [{rotate: '6deg'}],
    width: 58,
  },
  cameraStage: {
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  captureButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderColor: 'rgba(255, 255, 255, 0.34)',
    borderRadius: radius.pill,
    borderWidth: 5,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  captureButtonInner: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: 54,
    width: 54,
  },
  capturePressed: {
    transform: [{scale: 0.96}],
  },
  cheekPreviewLeft: {
    backgroundColor: 'rgba(230, 123, 95, 0.42)',
    height: 46,
    left: '22%',
    top: '51%',
    width: 72,
  },
  cheekPreviewRight: {
    backgroundColor: 'rgba(230, 123, 95, 0.42)',
    height: 46,
    right: '22%',
    top: '51%',
    width: 72,
  },
  controlPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  faceGuide: {
    alignSelf: 'center',
    borderColor: 'rgba(255, 255, 255, 0.42)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: '74%',
    marginTop: spacing.xl,
    width: '58%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 48,
  },
  headerEyebrow: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  headerSpacer: {
    height: 42,
    width: 42,
  },
  headerTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
  headerTitleGroup: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  lipPreview: {
    backgroundColor: 'rgba(217, 75, 116, 0.58)',
    borderRadius: radius.pill,
    height: 28,
    left: '39%',
    top: '65%',
    width: 74,
  },
  payloadPanel: {
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.72,
  },
  regionButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    height: 42,
    justifyContent: 'center',
  },
  regionButtonActive: {
    backgroundColor: colors.white,
  },
  regionButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  regionButtonTextActive: {
    color: colors.black,
  },
  regionPreview: {
    borderRadius: radius.pill,
    opacity: 0.18,
    position: 'absolute',
  },
  regionPreviewActive: {
    opacity: 1,
  },
  regionTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  statusText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  unityMountPoint: {
    alignSelf: 'center',
    aspectRatio: 3 / 4,
    backgroundColor: '#151515',
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    width: '82%',
  },
});
