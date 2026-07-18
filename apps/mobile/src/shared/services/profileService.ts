import type {
  LikedProductPreview,
  MakeupLookPreview,
  MyPageProfileSummary,
} from '../types/profile';
import { getFaceAnalysisReports } from './faceAnalysisService';
import {prefetchImageSources} from './imageCacheService';
import { getMakeupLooks as getAllMakeupLooks } from './makeupService';
import { getLikedProductPreviews } from './productService';
import {
  getBeautyProfile,
  getUserProfile as getUserProfileFromService,
} from './userService';

const PROFILE_SUMMARY_CACHE_TTL_MS = 30000;
const PROFILE_SUMMARY_REQUEST_TIMEOUT_MS = 5000;
export const MY_PAGE_LIKED_PRODUCT_PREVIEW_LIMIT = 4;

let profileSummaryCache:
  | {createdAt: number; data: MyPageProfileSummary}
  | null = null;
let profileSummaryRequest: Promise<MyPageProfileSummary> | null = null;

function warmProfileImages(summary: MyPageProfileSummary): void {
  prefetchImageSources([
    ...summary.faceAnalysisReports.map(report => report.imageSource),
    ...summary.makeupLooks.map(makeupLook => makeupLook.imageSource),
    ...summary.likedProducts.map(product => product.imageSource),
  ]);
}

export function clearMyPageProfileSummaryCache(): void {
  profileSummaryCache = null;
  profileSummaryRequest = null;
}

export const getMyPageProfileSnapshot = async (): Promise<MyPageProfileSummary> => {
  if (profileSummaryCache) {
    warmProfileImages(profileSummaryCache.data);
    return profileSummaryCache.data;
  }

  const [profile, beautyProfile] = await Promise.all([
    getUserProfileFromService({cacheOnly: true}),
    getBeautyProfile(),
  ]);

  return {
    profile,
    beautyProfile,
    faceAnalysisReport: null,
    faceAnalysisReports: [],
    makeupLooks: [],
    likedProducts: [],
  };
};

export const getMyPageProfileSummary = async (): Promise<MyPageProfileSummary> => {
  const now = Date.now();

  if (
    profileSummaryCache &&
    now - profileSummaryCache.createdAt < PROFILE_SUMMARY_CACHE_TTL_MS
  ) {
    warmProfileImages(profileSummaryCache.data);
    return profileSummaryCache.data;
  }

  if (profileSummaryRequest) {
    return profileSummaryRequest;
  }

  profileSummaryRequest = Promise.all([
    getUserProfileFromService({timeoutMs: PROFILE_SUMMARY_REQUEST_TIMEOUT_MS}),
    getBeautyProfile(),
    getFaceAnalysisReports({
      limit: 3,
      timeoutMs: PROFILE_SUMMARY_REQUEST_TIMEOUT_MS,
    }).catch(() => []),
    getLikedProductPreviews(MY_PAGE_LIKED_PRODUCT_PREVIEW_LIMIT, {
      timeoutMs: PROFILE_SUMMARY_REQUEST_TIMEOUT_MS,
    }).catch(() => []),
  ])
    .then(([profile, beautyProfile, faceAnalysisReports, likedProducts]) => {
      const summary: MyPageProfileSummary = {
        profile,
        beautyProfile,
        faceAnalysisReport: faceAnalysisReports[0] ?? null,
        faceAnalysisReports,
        makeupLooks: [],
        likedProducts,
      };

      profileSummaryCache = {createdAt: Date.now(), data: summary};
      warmProfileImages(summary);

      return summary;
    })
    .finally(() => {
      profileSummaryRequest = null;
    });

  return profileSummaryRequest;
};

export const getProfileMakeupLooks = async (): Promise<MakeupLookPreview[]> => {
  const makeupLooks = await getAllMakeupLooks();
  prefetchImageSources(makeupLooks.map(makeupLook => makeupLook.imageSource));
  return makeupLooks;
};

export const getProfileLikedProducts = async (): Promise<
  LikedProductPreview[]
> => {
  const products = await getLikedProductPreviews(99);
  prefetchImageSources(products.map(product => product.imageSource));
  return products;
};
