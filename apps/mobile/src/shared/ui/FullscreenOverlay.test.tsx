import React from 'react';

import {colors} from '../theme';
import {
  BottomOverlayPanel,
  CameraCaptureControlRow,
  CameraFacingToggleButton,
  CameraGalleryButton,
  CameraModeSwitch,
  CameraUtilityButton,
  CAMERA_FACING_TOGGLE_BUTTON_ICON_NAME,
  CAMERA_GALLERY_BUTTON_ICON_NAME,
  CAMERA_UTILITY_ICON_SIZE,
  CAMERA_UTILITY_ICON_STROKE_WIDTH,
  FULLSCREEN_OVERLAY_BLACK_SURFACE_BACKGROUND,
  FULLSCREEN_OVERLAY_ICON_BUTTON_SIZE,
  FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY,
  FloatingOverlayIconButton,
  FullscreenOverlayLayer,
  FullscreenOverlayScreen,
  OverlayAdjustmentTabs,
  OverlayChipButton,
  OverlayIconButton,
  OverlayPanelSection,
  OverlaySaveButton,
  OverlaySegmentButton,
  OverlayTopBar,
} from './FullscreenOverlay';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const sharedSurfaceMaterial: 'rgba(255, 255, 255, 0.74)' = colors.surface;
const sharedMutedSurfaceMaterial: 'rgba(247, 247, 247, 0.60)' = colors.surfaceMuted;
const sharedBorderMaterial: 'rgba(255, 255, 255, 0.92)' = colors.border;

expectEqual(
  FULLSCREEN_OVERLAY_ICON_BUTTON_SIZE,
  44,
  'fullscreen overlay icon button size',
);
expectEqual(
  FULLSCREEN_OVERLAY_SEGMENT_ACTIVE_OPACITY,
  0.62,
  'fullscreen overlay segment active opacity',
);
expectEqual(
  colors.surface,
  colors.liquidGlassSurface,
  'shared surface uses liquid glass by default',
);
expectEqual(
  colors.surfaceMuted,
  colors.bottomSheetMutedSurface,
  'muted floating surfaces use the shared translucent material',
);
expectEqual(
  colors.border,
  colors.liquidGlassBorder,
  'shared borders use liquid glass by default',
);
expectEqual(
  CAMERA_UTILITY_ICON_SIZE,
  28,
  'camera utility icon matches face capture button size',
);
expectEqual(
  CAMERA_UTILITY_ICON_STROKE_WIDTH,
  2.1,
  'camera utility icon stroke matches face capture buttons',
);
expectEqual(
  CAMERA_GALLERY_BUTTON_ICON_NAME,
  'Image',
  'camera gallery button uses the face capture gallery icon',
);
expectEqual(
  CAMERA_FACING_TOGGLE_BUTTON_ICON_NAME,
  'RefreshCw',
  'camera facing toggle button uses the face capture camera switch icon',
);
expectEqual(
  colors.bottomSheetSurface.startsWith('rgba('),
  true,
  'bottom sheet surface color is translucent',
);
expectEqual(
  colors.arFilterBottomSheetSurface,
  colors.bottomSheetSurface,
  'AR filter bottom sheet uses the shared bottom sheet surface opacity',
);
expectEqual(
  colors.bottomSheetControlSurface.startsWith('rgba('),
  true,
  'bottom sheet control surface color is translucent',
);
expectEqual(
  FULLSCREEN_OVERLAY_BLACK_SURFACE_BACKGROUND,
  colors.blackSurface,
  'fullscreen overlay black backgrounds use the shared translucent surface',
);

<FullscreenOverlayScreen>
  <FullscreenOverlayLayer />
  <FloatingOverlayIconButton accessibilityLabel="닫기">{null}</FloatingOverlayIconButton>
  <OverlayIconButton accessibilityLabel="닫기">{null}</OverlayIconButton>
  <CameraGalleryButton accessibilityLabel="갤러리에서 사진 선택" />
  <CameraFacingToggleButton cameraFacing="front" />
  <OverlayTopBar
    leftSlot={<OverlayIconButton accessibilityLabel="뒤로가기">{null}</OverlayIconButton>}
    rightSlot={<OverlayIconButton accessibilityLabel="저장">{null}</OverlayIconButton>}
    title="형태 수정"
  />
  <OverlayAdjustmentTabs activeTab="location" />
  <OverlaySegmentButton isActive label="형태 수정" />
  <OverlayChipButton isActive label="립" onPress={() => undefined} />
  <BottomOverlayPanel>
    <OverlayPanelSection label="얼굴 부위">panel</OverlayPanelSection>
    <OverlaySaveButton accessibilityLabel="현재 필터 저장" />
  </BottomOverlayPanel>
  <CameraCaptureControlRow
    bottom={88}
    centerSlot={<CameraUtilityButton accessibilityLabel="촬영">{null}</CameraUtilityButton>}
  />
  <CameraModeSwitch bottom={24} galleryAccessibilityLabel="갤러리에서 사진 선택" />
</FullscreenOverlayScreen>;
