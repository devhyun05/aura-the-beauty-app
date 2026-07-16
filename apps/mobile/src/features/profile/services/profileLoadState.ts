import type {MyPageProfileSummary} from '../../../shared/types/profile';
import type {ProfileReportHubData} from './profileReportHub';

export const PROFILE_LOAD_ERROR_MESSAGE =
  '마이페이지를 불러오지 못했어요.' as const;
export const PROFILE_LOAD_ERROR_DESCRIPTION =
  '네트워크 상태를 확인한 뒤 다시 시도해 주세요.' as const;
export const PROFILE_LOAD_RETRY_LABEL = '다시 시도' as const;

export type ProfileScreenData = MyPageProfileSummary & {
  reportHub: ProfileReportHubData;
};

export type ProfileLoadState =
  | {status: 'loading'}
  | {status: 'success'; data: ProfileScreenData}
  | {status: 'error'; message: typeof PROFILE_LOAD_ERROR_MESSAGE};

type ProfileScreenDataLoader = () => Promise<ProfileScreenData>;

export const resolveProfileLoadState = (
  loadData: ProfileScreenDataLoader,
): Promise<ProfileLoadState> =>
  loadData()
    .then((data): ProfileLoadState => ({
      status: 'success',
      data,
    }))
    .catch((): ProfileLoadState => ({
      status: 'error',
      message: PROFILE_LOAD_ERROR_MESSAGE,
    }));
