import {
  getDetailHeaderPresentation,
  getDetailHeaderRightActions,
} from './detailHeaderChrome';
import {routeChromeByRoute} from './routeChrome';

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
  getDetailHeaderRightActions('ProfileEdit').join(','),
  '',
  'profile edit route header actions',
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
  getDetailHeaderRightActions('FaceAnalysisReportDetail').join(','),
  'share,close',
  'face analysis report route header actions',
);
