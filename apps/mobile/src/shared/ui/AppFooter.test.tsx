import React from 'react';

import {
  APP_FOOTER_BAR_HEIGHT,
  APP_FOOTER_BAR_OVERFLOW,
  APP_FOOTER_ACTIVE_TAB_BACKGROUND,
  APP_FOOTER_CAPTURE_BUBBLE_SIZE,
  APP_FOOTER_CAPTURE_ICON_SIZE,
  APP_FOOTER_FLOATING_HOST_BASE_HEIGHT,
  APP_FOOTER_GLASS_BACKGROUND,
  APP_FOOTER_GLASS_BORDER,
  APP_FOOTER_GLASS_HIGHLIGHT,
  APP_FOOTER_HORIZONTAL_PADDING,
  APP_FOOTER_ICON_SIZE,
  APP_FOOTER_SHOW_LABELS_BY_DEFAULT,
  APP_FOOTER_TAB_HEIGHT,
  AppFooter,
} from './AppFooter';

const footerBarHeight: 52 = APP_FOOTER_BAR_HEIGHT;
const footerTabHeight: 40 = APP_FOOTER_TAB_HEIGHT;
const footerActiveTabBackground: 'rgba(43, 43, 43, 0.62)' =
  APP_FOOTER_ACTIVE_TAB_BACKGROUND;
const footerCaptureBubbleSize: 54 = APP_FOOTER_CAPTURE_BUBBLE_SIZE;
const footerHorizontalPadding: 36 = APP_FOOTER_HORIZONTAL_PADDING;
const footerIconSize: 20 = APP_FOOTER_ICON_SIZE;
const footerCaptureIconSize: 24 = APP_FOOTER_CAPTURE_ICON_SIZE;
const footerFloatingHostBaseHeight: 64 = APP_FOOTER_FLOATING_HOST_BASE_HEIGHT;
const footerBarOverflow: 'visible' = APP_FOOTER_BAR_OVERFLOW;
const footerGlassBackground: 'rgba(255, 255, 255, 0.72)' =
  APP_FOOTER_GLASS_BACKGROUND;
const footerGlassBorder: 'rgba(255, 255, 255, 0.82)' = APP_FOOTER_GLASS_BORDER;
const footerGlassHighlight: 'rgba(255, 255, 255, 0.42)' =
  APP_FOOTER_GLASS_HIGHLIGHT;
const footerShowsLabelsByDefault: false = APP_FOOTER_SHOW_LABELS_BY_DEFAULT;

<AppFooter
  activeTab="home"
  bottomInset={0}
  floating
  onTabPress={() => undefined}
/>;
