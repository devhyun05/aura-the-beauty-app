import {
  DETAIL_ROUTE_DEFAULT_HEADER_MODE,
  DETAIL_ROUTE_OVERLAY_HEADER_BACKGROUND_COLOR,
  getDetailHeaderPresentation,
  getDetailHeaderRightActions,
} from './detailHeaderChrome';
import {routeChromeByRoute} from './routeChrome';
import {colors} from '../../shared/theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

type HasRightActions<RouteName extends keyof typeof routeChromeByRoute> =
  'rightActions' extends keyof (typeof routeChromeByRoute)[RouteName]
    ? true
    : false;

type ExpectTrue<Condition extends true> = Condition;
type ExpectFalse<Condition extends false> = Condition;

type MakeupFeedbackAlbumUploadNoCloseContract = ExpectFalse<
  HasRightActions<'MakeupFeedbackAlbumUpload'>
>;
type ReferenceMakeupExtractionUploadCloseContract = ExpectTrue<
  HasRightActions<'ReferenceMakeupExtractionUpload'>
>;

expectEqual(
  getDetailHeaderPresentation('ProfileEdit').title,
  '프로필 수정',
  'profile edit route header title',
);
expectEqual(
  getDetailHeaderPresentation('ProfileEdit').contextLabel,
  'PROFILE',
  'profile edit route header context label',
);
expectEqual(
  getDetailHeaderPresentation('AppSettings').contextLabel,
  'SETTINGS',
  'app settings route header context label',
);
expectEqual(
  getDetailHeaderRightActions('ProfileEdit').join(','),
  '',
  'profile edit route header actions',
);
expectEqual(
  getDetailHeaderRightActions('FaceAnalysisIntro').join(','),
  '',
  'face analysis intro route header actions',
);
expectEqual(
  getDetailHeaderRightActions('MakeupFeedbackAlbumUpload').join(','),
  '',
  'makeup feedback album upload route header actions',
);
expectEqual(
  getDetailHeaderRightActions('ReferenceMakeupExtractionUpload').join(','),
  'close',
  'reference makeup extraction upload route header actions',
);
expectEqual(
  getDetailHeaderRightActions('MakeupFilterSave').join(','),
  'done',
  'makeup filter save route header actions',
);
expectEqual(
  routeChromeByRoute.FaceAnalysisReportDetail.kind,
  'fullscreen',
  'face analysis report renders its own header actions',
);
expectEqual(
  getDetailHeaderRightActions('MakeupFeedbackResult').join(','),
  'share',
  'makeup feedback result route header actions',
);
expectEqual(
  getDetailHeaderRightActions('MakeupRecipeDetail').join(','),
  'share',
  'makeup recipe detail route header actions',
);
expectEqual(
  DETAIL_ROUTE_DEFAULT_HEADER_MODE,
  'overlay',
  'detail route headers default to overlay presentation',
);
expectEqual(
  DETAIL_ROUTE_OVERLAY_HEADER_BACKGROUND_COLOR,
  colors.headerOverlaySurface,
  'overlay detail route header uses translucent overlay surface',
);
