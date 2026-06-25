import {
  getDetailHeaderPresentation,
  getDetailHeaderRightActions,
} from './detailHeaderChrome';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

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
  getDetailHeaderRightActions('FeedbackEntry').join(','),
  'close',
  'feedback entry route header actions',
);
expectEqual(
  getDetailHeaderRightActions('FilterUpload').join(','),
  'close',
  'filter upload route header actions',
);
expectEqual(
  getDetailHeaderRightActions('FilterSave').join(','),
  'done',
  'filter save route header actions',
);
expectEqual(
  getDetailHeaderRightActions('ImageAnalysisReportDetail').join(','),
  'share,close',
  'image analysis report route header actions',
);
