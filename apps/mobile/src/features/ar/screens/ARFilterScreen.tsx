import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {CameraType} from 'expo-camera';
import {ChevronDown, ChevronUp} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button} from 'tamagui';

import {
  getDefaultMakeupFilter,
  getARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {useCameraSessionActive} from '../../../shared/hooks/useCameraSessionActive';
import {colors, iconSize, radius, spacing} from '../../../shared/theme';
import type {
  ARFilterLaunchSource,
  ComparisonMode,
  FilterColorOption,
  GuideMode,
} from '../../../shared/types/makeupGuide';
import {
  BottomOverlayPanel,
  FullscreenOverlayScreen,
} from '../../../shared/ui';
import {FullFaceMakeupEditPanel} from '../components/FullFaceMakeupEditPanel';
import {ARFilterBottomActions} from '../components/ARFilterBottomActions';
import {
  AR_FILTER_COMPARISON_DIVIDER_TOP,
  ARFilterCameraPreview,
  getARFilterCameraMode,
  getMakeupPreviewBadgeContent,
  getMakeupPreviewColorOverlayLayers,
  shouldShowARFilterHeaderCopy,
} from '../components/ARFilterCameraPreview';
import {
  ARFilterCaptureControls,
  getARFilterCaptureButtonMetrics,
  type CaptureMode,
} from '../components/ARFilterCaptureControls';
import {ARFilterMakeupAreaTabs} from '../components/ARFilterMakeupAreaTabs';
import {
  ARFilterModeTabs,
  getARFilterGuideModeControlBottomOffset,
  getARFilterComparisonTabs as getARFilterComparisonTabsForData,
  getARFilterModeTabHeight,
  getARFilterSelectedTabOpacity,
} from '../components/ARFilterModeTabs';
import {
  ARFilterOptionCardList,
  getARFilterCategoryTitle,
} from '../components/ARFilterOptionCardList';
import {ARFilterOptionGroupTabs} from '../components/ARFilterOptionGroupTabs';
import {useARFilterSelectionState} from '../hooks/useARFilterSelectionState';
import {useFullFaceMakeupEditState} from '../hooks/useFullFaceMakeupEditState';
import type {FullFaceMakeupEditState} from '../services/fullFaceMakeupEditService';
import {
  getARFilterInitialColorId,
  getARFilterOptionGroupLabels,
  getARFilterOriginalCardLabel,
  getARFilterSelectedColor as getARFilterSelectedColorFromRules,
  getARFilterSelectedMakeupFilter,
  getARFilterShapeOptionLabels,
  getARFilterTotalMakeupLookIdAfterOptionEdit,
  isARFilterSaveEnabled,
} from '../services/arFilterOptionRules';
import {
  getARFilterSaveButtonLabel,
  getARFilterShapeEditButtonLabel,
} from '../components/ARFilterBottomActions';
import {
  createUnityMakeupRecipeBatchFromARFilterSelections,
  hideUnityMakeupView,
  postUnityMakeupRecipe,
} from '../services/unityMakeupBridge';

type ARFilterScreenProps = {
  fullFaceEditState?: FullFaceMakeupEditState;
  initialComparisonMode?: ComparisonMode;
  initialGuideMode?: GuideMode;
  initialMakeupFilterId?: string;
  initialSource?: ARFilterLaunchSource;
  onBack?: () => void;
  onComplete?: () => void;
  onOpenShapeAdjust?: (selectedMakeupFilterId?: string) => void;
  onSave?: (selectedMakeupFilterId?: string) => void;
};

const AR_FILTER_FALLBACK_COLOR = {
  hex: colors.white,
  label: '기본',
};

export const AR_FILTER_BOTTOM_SHEET_BOTTOM_OFFSET = 0;
export const AR_FILTER_BOTTOM_SHEET_TOGGLE_PLACEMENT = 'aboveSheet';
export const AR_FILTER_SHEET_TOGGLE_BUTTON_SIZE = 36;
export const AR_FILTER_BOTTOM_SHEET_PADDING = spacing.sm;
export const AR_FILTER_SHEET_TOGGLE_BACKGROUND_COLOR = colors.arFilterBottomSheetSurface;
export const AR_FILTER_BOTTOM_ACTIONS_PLACEMENT = 'aboveSheet' as const;
export const AR_FILTER_FLOATING_SHEET_CONTROLS_GAP = spacing.xs;
export const AR_FILTER_FLOATING_SHEET_CONTROLS_RIGHT_PADDING =
  AR_FILTER_BOTTOM_SHEET_PADDING;
export const AR_FILTER_FLOATING_SHEET_ACTIONS_FLEX = 1;
export const AR_FILTER_CAMERA_CONTROLS_HOME_INDICATOR_CLEARANCE =
  spacing.xxl * 5;
export const AR_FILTER_CAMERA_CONTROLS_BOTTOM_POSITION = 'raised' as const;
export const AR_FILTER_CAPTURE_CONTROLS_BOTTOM_PADDING =
  AR_FILTER_CAMERA_CONTROLS_HOME_INDICATOR_CLEARANCE;
export const AR_FILTER_BOTTOM_SHEET_PANEL_TOP_PADDING = AR_FILTER_BOTTOM_SHEET_PADDING;
export const AR_FILTER_BOTTOM_SHEET_PANEL_HORIZONTAL_PADDING = AR_FILTER_BOTTOM_SHEET_PADDING;
export const AR_FILTER_SHEET_TOGGLE_MARGIN_SOURCE = 'bottomSheetPadding' as const;
export const AR_FILTER_SHEET_TOGGLE_LEFT_OFFSET = AR_FILTER_BOTTOM_SHEET_PADDING;
export const AR_FILTER_SHEET_TOGGLE_ALIGNMENT = 'sheetContentStart' as const;
export const AR_FILTER_BOTTOM_SHEET_PANEL_GAP = spacing.xs;
export const AR_FILTER_BOTTOM_SHEET_CONTENT_GAP = spacing.sm;
export const AR_FILTER_BOTTOM_SHEET_CONTENT_BOTTOM_PADDING = AR_FILTER_BOTTOM_SHEET_PADDING;
export const AR_FILTER_BOTTOM_SHEET_BACKGROUND_COLOR = colors.arFilterBottomSheetSurface;
export const AR_FILTER_BOTTOM_SHEET_PANEL_MAX_HEIGHT = 640;
export const AR_FILTER_BOTTOM_SHEET_SCROLL_MAX_HEIGHT = 380;
export const AR_FILTER_BOTTOM_SHEET_SCROLL_POLICY =
  'fitsDefaultFilterControls' as const;

export {
  getARFilterCameraMode,
  getARFilterCaptureButtonMetrics,
  getARFilterCategoryTitle,
  getARFilterInitialColorId,
  AR_FILTER_COMPARISON_DIVIDER_TOP,
  getARFilterGuideModeControlBottomOffset,
  getARFilterModeTabHeight,
  getARFilterOptionGroupLabels,
  getARFilterOriginalCardLabel,
  getARFilterSaveButtonLabel,
  getARFilterSelectedTabOpacity,
  getARFilterShapeEditButtonLabel,
  getARFilterShapeOptionLabels,
  getARFilterTotalMakeupLookIdAfterOptionEdit,
  getMakeupPreviewBadgeContent,
  getMakeupPreviewColorOverlayLayers,
  isARFilterSaveEnabled,
  shouldShowARFilterHeaderCopy,
};

export function getARFilterComparisonTabs(): readonly string[] {
  return getARFilterComparisonTabsForData(getARMakeupGuideData());
}

export function getARFilterSelectedColor(
  colorOptions: readonly FilterColorOption[],
  selectedColorId: string,
) {
  return getARFilterSelectedColorFromRules({
    colorOptions,
    fallbackColor: AR_FILTER_FALLBACK_COLOR,
    selectedColorId,
  });
}

export function ARFilterScreen({
  fullFaceEditState,
  initialComparisonMode = 'left',
  initialGuideMode = 'basic',
  initialMakeupFilterId,
  initialSource,
  onBack,
  onComplete,
  onOpenShapeAdjust,
  onSave,
}: ARFilterScreenProps) {
  const insets = useSafeAreaInsets();
  const isFullFaceMode = Boolean(fullFaceEditState);
  const arGuideData = getARMakeupGuideData();
  const defaultFilter = getDefaultMakeupFilter(arGuideData);
  const arFilterSelectionState = useARFilterSelectionState({
    arGuideData,
    defaultFilter,
    initialComparisonMode,
    initialGuideMode,
    initialMakeupFilterId,
    initialSource,
  });
  const fullFaceEdit = useFullFaceMakeupEditState({initialState: fullFaceEditState});
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');
  const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
  const [isFilterSheetExpanded, setIsFilterSheetExpanded] = useState(true);
  const cameraSessionActive = useCameraSessionActive();
  const selectedColor = getARFilterSelectedColor(
    arFilterSelectionState.selectedMakeupFilter.colorOptions,
    arFilterSelectionState.selectedColorId,
  );
  const previewColorHex = isFullFaceMode
    ? fullFaceEdit.activeFullFaceControl.colorHex
    : selectedColor.hex;

  useEffect(() => () => hideUnityMakeupView(), []);

  useEffect(() => {
    if (!cameraSessionActive) {
      hideUnityMakeupView();
    }
  }, [cameraSessionActive]);

  const handleBack = () => {
    hideUnityMakeupView();
    onBack?.();
  };

  const handleComplete = () => {
    hideUnityMakeupView();
    onComplete?.();
  };

  const handleCameraFacingToggle = () => {
    setCameraFacing(currentFacing => (currentFacing === 'front' ? 'back' : 'front'));
  };

  const handleOpenShapeAdjust = () => {
    onOpenShapeAdjust?.(
      arFilterSelectionState.selectedTotalMakeupLookId ??
        arFilterSelectionState.selectedMakeupFilter.id,
    );
  };

  const handleSave = () => {
    onSave?.(
      arFilterSelectionState.selectedTotalMakeupLookId ??
        arFilterSelectionState.selectedMakeupFilter.id,
    );
  };

  useEffect(() => {
    if (isFullFaceMode) {
      return;
    }

    const unitySelections = arGuideData.makeupAreas.map(makeupArea => {
      const selectionState =
        arFilterSelectionState.getSelectionStateForMakeupArea(makeupArea.id);
      const selectedMakeupFilter = getARFilterSelectedMakeupFilter({
        defaultFilter,
        makeupFilters: arGuideData.filters,
        selectedMakeupArea: makeupArea.id,
        selectedPointMakeupLookId: selectionState.selectedPointMakeupLookId,
        selectedTotalMakeupLookId: selectionState.selectedTotalMakeupLookId,
      });

      return {
        selectedColor: getARFilterSelectedColor(
          selectedMakeupFilter.colorOptions,
          selectionState.selectedColorId,
        ),
        selectedColorId: selectionState.selectedColorId,
        selectedMakeupArea: makeupArea.id,
        selectedMakeupFilter,
        selectedPointMakeupLookId: selectionState.selectedPointMakeupLookId,
        selectedShapeId: selectionState.selectedShapeId,
        selectedTextureId: selectionState.selectedTextureId,
        selectedTotalMakeupLookId: selectionState.selectedTotalMakeupLookId,
        selectedTypeId: selectionState.selectedTypeId,
      };
    });
    const recipeBatch =
      createUnityMakeupRecipeBatchFromARFilterSelections(unitySelections);

    postUnityMakeupRecipe(recipeBatch);
  }, [
    arFilterSelectionState.selectionStatesByArea,
    arGuideData.filters,
    arGuideData.makeupAreas,
    defaultFilter,
    isFullFaceMode,
  ]);

  useEffect(() => {
    if (!isFullFaceMode) {
      return;
    }

    postUnityMakeupRecipe(fullFaceEdit.fullFaceRecipe);
  }, [fullFaceEdit.fullFaceRecipe, isFullFaceMode]);

  return (
    <FullscreenOverlayScreen>
      <ARFilterCameraPreview
        active={cameraSessionActive}
        cameraFacing={cameraFacing}
        comparisonDividerTopOffset={getARFilterGuideModeControlBottomOffset(insets.top)}
        guideMode={arFilterSelectionState.guideMode}
        previewColorHex={previewColorHex}
        selectedComparisonMode={arFilterSelectionState.selectedComparisonMode}
      />

      <ARFilterModeTabs
        arGuideData={arGuideData}
        guideMode={arFilterSelectionState.guideMode}
        onBack={handleBack}
        onComparisonModeChange={arFilterSelectionState.setSelectedComparisonMode}
        onGuideModeChange={arFilterSelectionState.setGuideMode}
        selectedComparisonMode={arFilterSelectionState.selectedComparisonMode}
        topInset={insets.top}
      />

      <View pointerEvents="box-none" style={styles.bottomSheetHost}>
        <View pointerEvents="box-none" style={styles.aboveSheetControls}>
          {AR_FILTER_BOTTOM_SHEET_TOGGLE_PLACEMENT === 'aboveSheet' ? (
            <Button
              accessibilityLabel={
                isFilterSheetExpanded ? '필터 선택 바텀시트 접기' : '필터 선택 바텀시트 펼치기'
              }
              accessibilityRole="button"
              accessibilityState={{expanded: isFilterSheetExpanded}}
              onPress={() => setIsFilterSheetExpanded(currentValue => !currentValue)}
              pressStyle={{scale: 0.96}}
              style={styles.sheetToggleButton}
              unstyled>
              {isFilterSheetExpanded ? (
                <ChevronDown color={colors.textPrimary} size={iconSize.sm} />
              ) : (
                <ChevronUp color={colors.textPrimary} size={iconSize.sm} />
              )}
            </Button>
          ) : null}

          {isFilterSheetExpanded && AR_FILTER_BOTTOM_ACTIONS_PLACEMENT === 'aboveSheet' ? (
            <View style={styles.floatingSheetActions}>
              <ARFilterBottomActions
                hasUnsavedMakeupChanges={arFilterSelectionState.hasUnsavedMakeupChanges}
                onOpenShapeAdjust={handleOpenShapeAdjust}
                onSave={handleSave}
              />
            </View>
          ) : null}
        </View>

        <BottomOverlayPanel
          variant="sheet"
          style={[
            styles.controlsPanel,
            {paddingBottom: insets.bottom + AR_FILTER_CAPTURE_CONTROLS_BOTTOM_PADDING},
          ]}>
          {isFilterSheetExpanded ? (
            <ScrollView
              contentContainerStyle={styles.panelContent}
              horizontal={false}
              showsVerticalScrollIndicator={false}
              style={styles.panelScroll}>
              {isFullFaceMode ? (
                <FullFaceMakeupEditPanel {...fullFaceEdit} />
              ) : (
                <>
                  <ARFilterMakeupAreaTabs
                    makeupAreas={arGuideData.makeupAreas}
                    onMakeupAreaPress={arFilterSelectionState.handleMakeupAreaOptionPress}
                    selectedMakeupArea={arFilterSelectionState.selectedMakeupArea}
                  />

                  <ARFilterOptionGroupTabs
                    onOptionGroupPress={arFilterSelectionState.setSelectedMakeupOptionGroup}
                    optionGroups={arFilterSelectionState.availableOptionGroups}
                    selectedMakeupOptionGroup={arFilterSelectionState.selectedMakeupOptionGroup}
                  />

                  <ARFilterOptionCardList
                    arGuideData={arGuideData}
                    availableMakeupFilters={arFilterSelectionState.availableMakeupFilters}
                    onCategoryPress={arFilterSelectionState.handleCategoryPress}
                    onColorOptionPress={arFilterSelectionState.handleColorOptionPress}
                    onMakeupFilterPress={arFilterSelectionState.handleMakeupFilterPress}
                    onOriginalOptionPress={arFilterSelectionState.handleOriginalOptionPress}
                    onShapeOptionPress={arFilterSelectionState.handleShapeOptionPress}
                    onTextureOptionPress={arFilterSelectionState.handleTextureOptionPress}
                    onTypeOptionPress={arFilterSelectionState.handleTypeOptionPress}
                    selectedCategoryId={arFilterSelectionState.selectedCategoryId}
                    selectedColorId={arFilterSelectionState.selectedColorId}
                    selectedMakeupArea={arFilterSelectionState.selectedMakeupArea}
                    selectedMakeupFilter={arFilterSelectionState.selectedMakeupFilter}
                    selectedMakeupOptionGroup={arFilterSelectionState.selectedMakeupOptionGroup}
                    selectedPointMakeupLookId={arFilterSelectionState.selectedPointMakeupLookId}
                    selectedShapeId={arFilterSelectionState.selectedShapeId}
                    selectedTextureId={arFilterSelectionState.selectedTextureId}
                    selectedTotalMakeupLookId={arFilterSelectionState.selectedTotalMakeupLookId}
                    selectedTypeId={arFilterSelectionState.selectedTypeId}
                    shapeOptions={arFilterSelectionState.shapeOptions}
                  />
                </>
              )}
            </ScrollView>
          ) : null}

          <ARFilterCaptureControls
            cameraFacing={cameraFacing}
            captureMode={captureMode}
            onCameraFacingToggle={handleCameraFacingToggle}
            onCaptureModeChange={setCaptureMode}
            onComplete={handleComplete}
          />
        </BottomOverlayPanel>
      </View>
    </FullscreenOverlayScreen>
  );
}

const styles = StyleSheet.create({
  bottomSheetHost: {
    bottom: AR_FILTER_BOTTOM_SHEET_BOTTOM_OFFSET,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 4,
  },
  aboveSheetControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AR_FILTER_FLOATING_SHEET_CONTROLS_GAP,
    marginBottom: spacing.xs,
    paddingRight: AR_FILTER_FLOATING_SHEET_CONTROLS_RIGHT_PADDING,
  },
  floatingSheetActions: {
    flex: AR_FILTER_FLOATING_SHEET_ACTIONS_FLEX,
  },
  controlsPanel: {
    backgroundColor: AR_FILTER_BOTTOM_SHEET_BACKGROUND_COLOR,
    gap: AR_FILTER_BOTTOM_SHEET_PANEL_GAP,
    maxHeight: AR_FILTER_BOTTOM_SHEET_PANEL_MAX_HEIGHT,
    paddingHorizontal: AR_FILTER_BOTTOM_SHEET_PANEL_HORIZONTAL_PADDING,
    paddingTop: AR_FILTER_BOTTOM_SHEET_PANEL_TOP_PADDING,
  },
  panelScroll: {
    maxHeight: AR_FILTER_BOTTOM_SHEET_SCROLL_MAX_HEIGHT,
    paddingHorizontal: 0,
  },
  panelContent: {
    gap: AR_FILTER_BOTTOM_SHEET_CONTENT_GAP,
    paddingBottom: AR_FILTER_BOTTOM_SHEET_CONTENT_BOTTOM_PADDING,
    paddingHorizontal: 0,
  },
  sheetToggleButton: {
    alignItems: 'center',
    backgroundColor: AR_FILTER_SHEET_TOGGLE_BACKGROUND_COLOR,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: AR_FILTER_SHEET_TOGGLE_BUTTON_SIZE,
    justifyContent: 'center',
    marginLeft: AR_FILTER_SHEET_TOGGLE_LEFT_OFFSET,
    width: AR_FILTER_SHEET_TOGGLE_BUTTON_SIZE,
  },
});
