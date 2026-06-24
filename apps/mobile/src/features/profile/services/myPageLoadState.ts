import type {ImageAnalysisReport} from '../../../shared/types/imageAnalysis';
import type {
  MakeupLook,
  Product,
  UserProfile,
} from '../../../shared/types/myPage';

export const MY_PAGE_LOAD_ERROR_MESSAGE =
  '마이페이지를 불러오지 못했어요.' as const;
export const MY_PAGE_LOAD_ERROR_DESCRIPTION =
  '네트워크 상태를 확인한 뒤 다시 시도해 주세요.' as const;
export const MY_PAGE_LOAD_RETRY_LABEL = '다시 시도' as const;

export type MyPageScreenData = {
  profile: UserProfile;
  imageAnalysisReport: ImageAnalysisReport | null;
  makeupLooks: MakeupLook[];
  products: Product[];
};

export type MyPageLoadState =
  | {status: 'loading'}
  | {status: 'success'; data: MyPageScreenData}
  | {status: 'error'; message: typeof MY_PAGE_LOAD_ERROR_MESSAGE};

type MyPageDataLoader = () => Promise<MyPageScreenData>;

export const resolveMyPageLoadState = (
  loadData: MyPageDataLoader,
): Promise<MyPageLoadState> =>
  loadData()
    .then((data): MyPageLoadState => ({
      status: 'success',
      data,
    }))
    .catch((): MyPageLoadState => ({
      status: 'error',
      message: MY_PAGE_LOAD_ERROR_MESSAGE,
    }));
