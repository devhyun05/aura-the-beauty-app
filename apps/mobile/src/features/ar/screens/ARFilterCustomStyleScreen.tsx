import React, {useState} from 'react';
import {ScrollView, StyleSheet, type ViewStyle} from 'react-native';
import {ChevronLeft, Save} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getDefaultMakeupFilter,
  getMockARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  FacePartId,
  FilterColorOption,
  StyleOptionGroupId,
} from '../../../shared/types/makeupGuide';
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
  getMockFilterStyleState,
  updateFilterStyleSelection,
  type FilterStyleState,
} from '../services/filterCustomizationService';

type ARFilterCustomStyleScreenProps = {
  onBack?: () => void;
  onOpenLocationAdjust?: () => void;
  onSave?: () => void;
};

const STYLE_GROUPS: readonly {id: StyleOptionGroupId; label: string}[] = [
  {id: 'color', label: '컬러'},
  {id: 'type', label: '타입'},
  {id: 'texture', label: '질감'},
];
const SELECTED_TAB_BACKGROUND_OPACITY = FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY;

type ARFilterCustomStyleSelectedColor = Pick<FilterColorOption, 'hex' | 'label'>;

const AR_FILTER_CUSTOM_STYLE_FALLBACK_COLOR: ARFilterCustomStyleSelectedColor = {
  hex: colors.white,
  label: '기본',
};

type StylePreviewColorOverlayLayer = {
  id: string;
  style: ViewStyle;
};

export function getStylePreviewColorOverlayLayers(): readonly StylePreviewColorOverlayLayer[] {
  return [];
}

export function getStylePreviewSummaryContent(): null {
  return null;
}

export function getARFilterCustomStyleCameraMode(): 'live-camera' {
  return 'live-camera';
}

export function getARFilterCustomStyleSelectedTabOpacity(): number {
  return SELECTED_TAB_BACKGROUND_OPACITY;
}

export function getARFilterCustomStyleSelectedColor(
  colorOptions: readonly FilterColorOption[],
  selectedColorId: string,
): ARFilterCustomStyleSelectedColor {
  return (
    colorOptions.find(option => option.id === selectedColorId) ??
    colorOptions[0] ??
    AR_FILTER_CUSTOM_STYLE_FALLBACK_COLOR
  );
}

export function ARFilterCustomStyleScreen({
  onBack,
  onOpenLocationAdjust,
  onSave,
}: ARFilterCustomStyleScreenProps) {
  const insets = useSafeAreaInsets();
  const arGuideData = getMockARMakeupGuideData();
  const filter = getDefaultMakeupFilter(arGuideData);
  const [styleState, setStyleState] = useState<FilterStyleState>(getMockFilterStyleState());
  const selectedColor = getARFilterCustomStyleSelectedColor(
    filter.colorOptions,
    styleState.selectedColorId,
  );

  const handleFacePartPress = (facePartId: FacePartId) => {
    setStyleState(currentState => ({
      ...currentState,
      selectedFacePartId: facePartId,
    }));
  };

  const handleOptionGroupPress = (optionGroup: StyleOptionGroupId) => {
    setStyleState(currentState => ({
      ...currentState,
      selectedOptionGroup: optionGroup,
    }));
  };

  const handleOptionPress = (optionGroup: StyleOptionGroupId, optionId: string) => {
    setStyleState(currentState =>
      updateFilterStyleSelection(currentState, optionGroup, optionId),
    );
  };

  return (
    <FullscreenOverlayScreen>
      <FullscreenOverlayLayer>
        <LiveCameraLayer />
        <View style={styles.previewDim} />
        <View style={[styles.eyePreviewOverlay, {backgroundColor: selectedColor.hex}]} />
        <View style={[styles.cheekPreviewOverlayLeft, {backgroundColor: selectedColor.hex}]} />
        <View style={[styles.cheekPreviewOverlayRight, {backgroundColor: selectedColor.hex}]} />
        <View style={[styles.lipPreviewOverlay, {backgroundColor: selectedColor.hex}]} />
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
              accessibilityLabel="현재 스타일 저장"
              onPress={onSave}>
              <Save color={colors.white} size={iconSize.sm} strokeWidth={2} />
            </OverlayIconButton>
          }
          title="스타일 조정"
        />

        <OverlayAdjustmentTabs
          activeTab="style"
          onPressLocation={onOpenLocationAdjust}
        />
      </YStack>

      <BottomOverlayPanel style={{paddingBottom: insets.bottom + spacing.lg}}>
        <OverlayPanelSection label="얼굴 부위">
          <ScrollView
            contentContainerStyle={styles.horizontalList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {arGuideData.faceParts.map(facePart => (
              <OverlayChipButton
                key={facePart.id}
                isActive={facePart.id === styleState.selectedFacePartId}
                label={facePart.label}
                onPress={() => handleFacePartPress(facePart.id)}
              />
            ))}
          </ScrollView>
        </OverlayPanelSection>

        <OverlayPanelSection label="스타일 옵션">
          <XStack style={styles.optionGroupList}>
            {STYLE_GROUPS.map(group => (
              <OverlayChipButton
                key={group.id}
                isActive={group.id === styleState.selectedOptionGroup}
                label={group.label}
                onPress={() => handleOptionGroupPress(group.id)}
              />
            ))}
          </XStack>
        </OverlayPanelSection>

        {styleState.selectedOptionGroup === 'color' ? (
          <OverlayPanelSection label="컬러 선택">
            <XStack style={styles.swatchList}>
              {filter.colorOptions.map(option => (
                <Button
                  key={option.id}
                  accessibilityLabel={`${option.label} 컬러 선택`}
                  accessibilityRole="button"
                  accessibilityState={{selected: option.id === styleState.selectedColorId}}
                  onPress={() => handleOptionPress('color', option.id)}
                  pressStyle={{scale: 0.96}}
                  style={[
                    styles.swatchButton,
                    {
                      backgroundColor: option.hex,
                      borderColor:
                        option.id === styleState.selectedColorId
                          ? colors.black
                          : colors.borderStrong,
                    },
                  ]}
                  unstyled>
                  <View style={styles.swatchInner} />
                </Button>
              ))}
            </XStack>
          </OverlayPanelSection>
        ) : (
          <OverlayPanelSection
            label={styleState.selectedOptionGroup === 'type' ? '타입 선택' : '질감 선택'}>
            <XStack style={styles.textOptionList}>
              {(styleState.selectedOptionGroup === 'type'
                ? filter.typeOptions
                : filter.textureOptions
              ).map(option => {
                const isActive =
                  styleState.selectedOptionGroup === 'type'
                    ? option.id === styleState.selectedTypeId
                    : option.id === styleState.selectedTextureId;

                return (
                  <OverlayChipButton
                    key={option.id}
                    isActive={isActive}
                    label={option.label}
                    onPress={() => handleOptionPress(styleState.selectedOptionGroup, option.id)}
                  />
                );
              })}
            </XStack>
          </OverlayPanelSection>
        )}

        <OverlaySaveButton
          accessibilityLabel="현재 필터 스타일 저장"
          onPress={onSave}
        />
      </BottomOverlayPanel>
    </FullscreenOverlayScreen>
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
    opacity: 0.16,
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
  horizontalList: {
    gap: spacing.sm,
    paddingRight: spacing.xl,
  },
  optionGroupList: {
    gap: spacing.sm,
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
  textOptionList: {
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
