import React from 'react';

import {colors} from '../theme';
import {
  BottomOverlayPanel,
  CameraCaptureControlRow,
  CameraModeSwitch,
  CameraUtilityButton,
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
  colors.bottomSheetSurface.startsWith('rgba('),
  true,
  'bottom sheet surface color is translucent',
);
expectEqual(
  colors.bottomSheetControlSurface.startsWith('rgba('),
  true,
  'bottom sheet control surface color is translucent',
);

<FullscreenOverlayScreen>
  <FullscreenOverlayLayer />
  <FloatingOverlayIconButton accessibilityLabel="닫기">{null}</FloatingOverlayIconButton>
  <OverlayIconButton accessibilityLabel="닫기">{null}</OverlayIconButton>
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
