import React, {useState} from 'react';
import {ScrollView, StyleSheet, type ViewStyle} from 'react-native';
import {ChevronLeft, Save} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getDefaultMakeupFilter,
  getARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  MakeupArea,
  FilterColorOption,
  MakeupOptionGroupId,
} from '../../../shared/types/makeupGuide';
import {
  BottomOverlayPanel,
  FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY,
  FullscreenOverlayLayer,
  FullscreenOverlayScreen,
  LiveCameraLayer,
  OverlayChipButton,
  OverlayIconButton,
  OverlayPanelSection,
  OverlaySaveButton,
  OverlayTopBar,
} from '../../../shared/ui';
import {
  getMakeupFilterOptionState,
  updateMakeupFilterOptionSelection,
  type MakeupFilterOptionState,
} from '../services/filterCustomizationService';

type MakeupFilterEditScreenProps = {
  onBack?: () => void;
  onSave?: () => void;
};

const OPTION_GROUPS: readonly {id: MakeupOptionGroupId; label: string}[] = [
  {id: 'color', label: '컬러'},
  {id: 'type', label: '타입'},
  {id: 'texture', label: '질감'},
];
const SELECTED_TAB_BACKGROUND_OPACITY = FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY;

type MakeupFilterEditSelectedColor = Pick<FilterColorOption, 'hex' | 'label'>;

const MAKEUP_FILTER_EDIT_FALLBACK_COLOR: MakeupFilterEditSelectedColor = {
  hex: colors.white,
  label: '기본',
};

type MakeupFilterEditPreviewColorOverlayLayer = {
  id: string;
  style: ViewStyle;
};

export function getMakeupFilterEditPreviewColorOverlayLayers(): readonly MakeupFilterEditPreviewColorOverlayLayer[] {
  return [];
}

export function getMakeupFilterEditPreviewSummaryContent(): null {
  return null;
}

export function getMakeupFilterEditCameraMode(): 'live-camera' {
  return 'live-camera';
}

export function getMakeupFilterEditSelectedTabOpacity(): number {
  return SELECTED_TAB_BACKGROUND_OPACITY;
}

export function getMakeupFilterEditSelectedColor(
  colorOptions: readonly FilterColorOption[],
  selectedColorId: string,
): MakeupFilterEditSelectedColor {
  return (
    colorOptions.find(option => option.id === selectedColorId) ??
    colorOptions[0] ??
    MAKEUP_FILTER_EDIT_FALLBACK_COLOR
  );
}

export function MakeupFilterEditScreen({
  onBack,
  onSave,
}: MakeupFilterEditScreenProps) {
  const insets = useSafeAreaInsets();
  const arGuideData = getARMakeupGuideData();
  const filter = getDefaultMakeupFilter(arGuideData);
  const [optionState, setOptionState] = useState<MakeupFilterOptionState>(getMakeupFilterOptionState());
  const selectedColor = getMakeupFilterEditSelectedColor(
    filter.colorOptions,
    optionState.selectedColorId,
  );

  const handleMakeupAreaOptionPress = (makeupAreaId: MakeupArea) => {
    setOptionState(currentState => ({
      ...currentState,
      selectedMakeupArea: makeupAreaId,
    }));
  };

  const handleOptionGroupPress = (optionGroup: MakeupOptionGroupId) => {
    setOptionState(currentState => ({
      ...currentState,
      selectedOptionGroup: optionGroup,
    }));
  };

  const handleOptionPress = (optionGroup: MakeupOptionGroupId, optionId: string) => {
    setOptionState(currentState =>
      updateMakeupFilterOptionSelection(currentState, optionGroup, optionId),
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
              accessibilityLabel="현재 필터 저장"
              onPress={onSave}>
              <Save color={colors.white} size={iconSize.sm} strokeWidth={2} />
            </OverlayIconButton>
          }
          title="필터 수정"
        />
      </YStack>

      <BottomOverlayPanel style={{paddingBottom: insets.bottom + spacing.lg}}>
        <OverlayPanelSection label="메이크업 영역">
          <ScrollView
            contentContainerStyle={styles.horizontalList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {arGuideData.makeupAreas.map(makeupArea => (
              <OverlayChipButton
                key={makeupArea.id}
                isActive={makeupArea.id === optionState.selectedMakeupArea}
                label={makeupArea.label}
                onPress={() => handleMakeupAreaOptionPress(makeupArea.id)}
              />
            ))}
          </ScrollView>
        </OverlayPanelSection>

        <OverlayPanelSection label="프리셋 옵션">
          <XStack style={styles.optionGroupList}>
            {OPTION_GROUPS.map(group => (
              <OverlayChipButton
                key={group.id}
                isActive={group.id === optionState.selectedOptionGroup}
                label={group.label}
                onPress={() => handleOptionGroupPress(group.id)}
              />
            ))}
          </XStack>
        </OverlayPanelSection>

        {optionState.selectedOptionGroup === 'color' ? (
          <OverlayPanelSection label="컬러 선택">
            <XStack style={styles.swatchList}>
              {filter.colorOptions.map(option => (
                <Button
                  key={option.id}
                  accessibilityLabel={`${option.label} 컬러 선택`}
                  accessibilityRole="button"
                  accessibilityState={{selected: option.id === optionState.selectedColorId}}
                  onPress={() => handleOptionPress('color', option.id)}
                  pressStyle={{scale: 0.96}}
                  style={[
                    styles.swatchButton,
                    {
                      backgroundColor: option.hex,
                      borderColor:
                        option.id === optionState.selectedColorId
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
            label={optionState.selectedOptionGroup === 'type' ? '타입 선택' : '질감 선택'}>
            <XStack style={styles.textOptionList}>
              {(optionState.selectedOptionGroup === 'type'
                ? filter.typeOptions
                : filter.textureOptions
              ).map(option => {
                const isActive =
                  optionState.selectedOptionGroup === 'type'
                    ? option.id === optionState.selectedTypeId
                    : option.id === optionState.selectedTextureId;

                return (
                  <OverlayChipButton
                    key={option.id}
                    isActive={isActive}
                    label={option.label}
                    onPress={() => handleOptionPress(optionState.selectedOptionGroup, option.id)}
                  />
                );
              })}
            </XStack>
          </OverlayPanelSection>
        )}

        <OverlaySaveButton
          accessibilityLabel="현재 필터 저장"
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
