import React, {useState} from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getDefaultMakeupFilter,
  getARMakeupGuideData,
} from '../../../shared/services/makeupGuideService';
import {colors, spacing} from '../../../shared/theme';
import type {
  ComparisonMode,
  FilterColorOption,
  GuideMode,
} from '../../../shared/types/makeupGuide';
import {
  BottomOverlayPanel,
  FullscreenOverlayScreen,
} from '../../../shared/ui';
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
import {
  getARFilterInitialColorId,
  getARFilterOptionGroupLabels,
  getARFilterOriginalCardLabel,
  getARFilterSelectedColor as getARFilterSelectedColorFromRules,
  getARFilterShapeOptionLabels,
  getARFilterTotalMakeupLookIdAfterOptionEdit,
  isARFilterSaveEnabled,
} from '../services/arFilterOptionRules';
import {
  getARFilterSaveButtonLabel,
  getARFilterShapeEditButtonLabel,
} from '../components/ARFilterBottomActions';

type ARFilterScreenProps = {
  initialComparisonMode?: ComparisonMode;
  initialGuideMode?: GuideMode;
  onBack?: () => void;
  onComplete?: () => void;
  onOpenShapeAdjust?: () => void;
  onSave?: () => void;
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
  initialComparisonMode = 'left',
  initialGuideMode = 'basic',
  onBack,
  onComplete,
  onOpenShapeAdjust,
  onSave,
}: ARFilterScreenProps) {
  const insets = useSafeAreaInsets();
  const arGuideData = getARMakeupGuideData();
  const defaultFilter = getDefaultMakeupFilter(arGuideData);
  const arFilterSelectionState = useARFilterSelectionState({
    arGuideData,
    defaultFilter,
    initialComparisonMode,
    initialGuideMode,
  });
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');
  const selectedColor = getARFilterSelectedColor(
    arFilterSelectionState.selectedMakeupFilter.colorOptions,
    arFilterSelectionState.selectedColorId,
  );

  return (
    <FullscreenOverlayScreen>
      <ARFilterCameraPreview
        guideMode={arFilterSelectionState.guideMode}
        previewColorHex={selectedColor.hex}
        selectedComparisonMode={arFilterSelectionState.selectedComparisonMode}
      />

      <ARFilterModeTabs
        arGuideData={arGuideData}
        guideMode={arFilterSelectionState.guideMode}
        onBack={onBack}
        onComparisonModeChange={arFilterSelectionState.setSelectedComparisonMode}
        onGuideModeChange={arFilterSelectionState.setGuideMode}
        selectedComparisonMode={arFilterSelectionState.selectedComparisonMode}
        topInset={insets.top}
      />

      <BottomOverlayPanel style={[styles.controlsPanel, {paddingBottom: insets.bottom + spacing.md}]}>
        <ScrollView
          contentContainerStyle={styles.panelContent}
          horizontal={false}
          showsVerticalScrollIndicator={false}>
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

          <ARFilterBottomActions
            hasUnsavedMakeupChanges={arFilterSelectionState.hasUnsavedMakeupChanges}
            onOpenShapeAdjust={onOpenShapeAdjust}
            onSave={onSave}
          />
        </ScrollView>

        <ARFilterCaptureControls
          captureMode={captureMode}
          onCaptureModeChange={setCaptureMode}
          onComplete={onComplete}
        />
      </BottomOverlayPanel>
    </FullscreenOverlayScreen>
  );
}

const styles = StyleSheet.create({
  controlsPanel: {
    gap: spacing.md,
    maxHeight: 392,
    paddingHorizontal: 0,
    paddingTop: spacing.lg,
  },
  panelContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
  },
});
