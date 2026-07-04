import React from 'react';

import {
  APP_FOOTER_BAR_HEIGHT,
  APP_FOOTER_BAR_OVERFLOW,
  APP_FOOTER_ACTIVE_TAB_BACKGROUND,
  APP_FOOTER_ACTION_BUBBLE_SIZE,
  APP_FOOTER_ACTION_SLOT_WIDTH,
  APP_FOOTER_ACTION_ICON_SIZE,
  APP_FOOTER_FLOATING_HOST_BASE_HEIGHT,
  APP_FOOTER_DEFAULT_ACTION_SLOT_POSITION,
  APP_FOOTER_GLASS_BACKGROUND,
  APP_FOOTER_GLASS_BORDER,
  APP_FOOTER_GLASS_HIGHLIGHT,
  APP_FOOTER_HORIZONTAL_PADDING,
  APP_FOOTER_ICON_SIZE,
  APP_FOOTER_SHOW_LABELS_BY_DEFAULT,
  APP_FOOTER_SIDE_TAB_WIDTH,
  APP_FOOTER_TAB_HEIGHT,
  AppFooter,
  getAppFooterActionSlotOrder,
} from './AppFooter';
import {CAMERA_CAPTURE_BUTTON_LIQUID_GLASS_BACKGROUND} from './CameraCaptureButton';

const footerBarHeight: 64 = APP_FOOTER_BAR_HEIGHT;
const footerTabHeight: 42 = APP_FOOTER_TAB_HEIGHT;
const footerActiveTabBackground: 'rgba(43, 43, 43, 0.62)' =
  APP_FOOTER_ACTIVE_TAB_BACKGROUND;
const footerActionBubbleSize: 64 = APP_FOOTER_ACTION_BUBBLE_SIZE;
const footerActionSlotWidth: 64 = APP_FOOTER_ACTION_SLOT_WIDTH;
const footerHorizontalPadding: 20 = APP_FOOTER_HORIZONTAL_PADDING;
const footerIconSize: 20 = APP_FOOTER_ICON_SIZE;
const footerActionIconSize: 28 = APP_FOOTER_ACTION_ICON_SIZE;
const footerFloatingHostBaseHeight: 76 = APP_FOOTER_FLOATING_HOST_BASE_HEIGHT;
const footerSideTabWidth: 58 = APP_FOOTER_SIDE_TAB_WIDTH;
const footerBarOverflow: 'visible' = APP_FOOTER_BAR_OVERFLOW;
const footerGlassBackground: 'rgba(255, 255, 255, 0.72)' =
  APP_FOOTER_GLASS_BACKGROUND;
const footerGlassBorder: 'rgba(255, 255, 255, 0.82)' = APP_FOOTER_GLASS_BORDER;
const footerGlassHighlight: 'rgba(255, 255, 255, 0.42)' =
  APP_FOOTER_GLASS_HIGHLIGHT;
const footerShowsLabelsByDefault: false = APP_FOOTER_SHOW_LABELS_BY_DEFAULT;
const footerCaptureButtonBackground:
  'rgba(255, 255, 255, 0.78)' =
    CAMERA_CAPTURE_BUTTON_LIQUID_GLASS_BACKGROUND;

if (APP_FOOTER_DEFAULT_ACTION_SLOT_POSITION !== 'right') {
  throw new Error('default action slot position: expected right');
}

if (getAppFooterActionSlotOrder('right').join(',') !== 'tabs,action') {
  throw new Error('right action slot order: expected tabs,action');
}

if (getAppFooterActionSlotOrder('left').join(',') !== 'action,tabs') {
  throw new Error('left action slot order: expected action,tabs');
}

<AppFooter
  actionSlot={<>별 액션</>}
  actionSlotPosition="left"
  activeTab="profile"
  bottomInset={0}
  floating
  showLabels
  onTabPress={() => undefined}
/>;
