import React from 'react';

import {
  APP_HEADER_ACTION_BUTTON_SIZE,
  APP_HEADER_BACKGROUND_COLOR,
  APP_HEADER_BASE_HEIGHT,
  APP_HEADER_CENTER_TITLE_FONT_SIZE,
  APP_HEADER_CONTEXT_TITLE_LEFT_MARGIN,
  APP_HEADER_SIDE_SIZE,
  APP_HEADER_VERTICAL_PADDING,
  AppHeader,
} from './AppHeader';
import {colors} from '../theme';

const headerBaseHeight: 56 = APP_HEADER_BASE_HEIGHT;
const headerVerticalPadding: 8 = APP_HEADER_VERTICAL_PADDING;
const headerActionButtonSize: 40 = APP_HEADER_ACTION_BUTTON_SIZE;
const headerBackgroundColor: typeof colors.headerSurface = APP_HEADER_BACKGROUND_COLOR;
const headerSideSize: 40 = APP_HEADER_SIDE_SIZE;
const headerCenterTitleFontSize: 18 = APP_HEADER_CENTER_TITLE_FONT_SIZE;
const headerContextTitleLeftMargin: 4 = APP_HEADER_CONTEXT_TITLE_LEFT_MARGIN;

<AppHeader title="AURA" onProfilePress={() => undefined} />;
<AppHeader contextLabel="SETTINGS" onBack={() => undefined} title="앱 환경설정" />;
