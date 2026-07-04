import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import type {CameraType} from 'expo-camera';
import {ChevronDown, ChevronUp} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button} from 'tamagui';

import {
  getDefaultMakeupFilter,
  getARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
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

export {
  getARFilterCameraMode,
  getARFilterCaptureButtonMetrics,
  getARFilterCategoryTitle,
  getARFilterInitialColorId,
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
  const selectedColor = getARFilterSelectedColor(
    arFilterSelectionState.selectedMakeupFilter.colorOptions,
    arFilterSelectionState.selectedColorId,
  );
  const previewColorHex = isFullFaceMode
    ? fullFaceEdit.activeFullFaceControl.colorHex
    : selectedColor.hex;

  useEffect(() => () => hideUnityMakeupView(), []);

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
        cameraFacing={cameraFacing}
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

      <BottomOverlayPanel
        variant="sheet"
        style={[styles.controlsPanel, {paddingBottom: insets.bottom + spacing.md}]}>
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

            <ARFilterBottomActions
              hasUnsavedMakeupChanges={arFilterSelectionState.hasUnsavedMakeupChanges}
              onOpenShapeAdjust={() =>
                onOpenShapeAdjust?.(
                  arFilterSelectionState.selectedTotalMakeupLookId ??
                    arFilterSelectionState.selectedMakeupFilter.id,
                )
              }
              onSave={() =>
                onSave?.(
                  arFilterSelectionState.selectedTotalMakeupLookId ??
                    arFilterSelectionState.selectedMakeupFilter.id,
                )
              }
            />
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
    </FullscreenOverlayScreen>
  );
}

const styles = StyleSheet.create({
  controlsPanel: {
    gap: spacing.sm,
    left: 0,
    maxHeight: 392,
    paddingHorizontal: 0,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
    bottom: 0,
    zIndex: 4,
  },
  panelScroll: {
    maxHeight: 236,
    paddingHorizontal: 0,
  },
  panelContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  sheetToggleButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    width: 44,
  },
});
