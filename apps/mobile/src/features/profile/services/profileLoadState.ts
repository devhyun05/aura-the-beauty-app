import type {ImageAnalysisReport} from '../../../shared/types/imageAnalysis';
import type {
  MakeupLook,
  Product,
  UserProfile,
} from '../../../shared/types/profile';

export const PROFILE_LOAD_ERROR_MESSAGE =
  '마이페이지를 불러오지 못했어요.' as const;
export const PROFILE_LOAD_ERROR_DESCRIPTION =
  '네트워크 상태를 확인한 뒤 다시 시도해 주세요.' as const;
export const PROFILE_LOAD_RETRY_LABEL = '다시 시도' as const;

export type ProfileScreenData = {
  profile: UserProfile;
  imageAnalysisReport: ImageAnalysisReport | null;
  makeupLooks: MakeupLook[];
  likedProducts: Product[];
};

export type ProfileLoadState =
  | {status: 'loading'}
  | {status: 'success'; data: ProfileScreenData}
  | {status: 'error'; message: typeof PROFILE_LOAD_ERROR_MESSAGE};

type ProfileDataLoader = () => Promise<ProfileScreenData>;

export const resolveProfileLoadState = (
  loadData: ProfileDataLoader,
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
