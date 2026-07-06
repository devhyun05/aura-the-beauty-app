import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import {getFaceAnalysisReports} from '../../../shared/services/faceAnalysisService';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {homeMock} from '../mocks/home.mock';
import type {
  HomeData,
  HomeFilterStoreItem,
  HomeMakeupLook,
  HomeNotice,
  HomeTrendItem,
} from '../types';

type BackendImageSource = {
  imageUrl?: string | null;
};

type BackendHomeHero = BackendImageSource & {
  description?: string | null;
  eyebrow?: string | null;
  notices?: BackendHomeNotice[] | null;
  title?: string | null;
  trends?: BackendHomeTrendItem[] | null;
};

type BackendHomeNotice = {
  description?: string | null;
  id?: string | null;
  title?: string | null;
};

type BackendHomeTrendItem = BackendImageSource & {
  id?: string | null;
  title?: string | null;
  tone?: string | null;
};

type BackendHomeFilterStoreItem = BackendImageSource & {
  category?: string | null;
  description?: string | null;
  id?: string | null;
  title?: string | null;
};

type BackendHomeMakeupLook = BackendImageSource & {
  date?: string | null;
  description?: string | null;
  displayDate?: string | null;
  id?: string | null;
  title?: string | null;
};

type BackendHomeData = {
  filterStore?: BackendHomeFilterStoreItem[] | null;
  hero?: BackendHomeHero | null;
  notices?: BackendHomeNotice[] | null;
  recommendedLooks?: BackendHomeMakeupLook[] | null;
  trends?: BackendHomeTrendItem[] | null;
};

function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value) => Boolean(value?.trim()))?.trim();
}

function imageSourceFromUrl(
  imageUrl: string | null | undefined,
  fallback: HomeData['hero']['imageSource'],
): HomeData['hero']['imageSource'] {
  const normalized = firstText(imageUrl);

  return normalized ? {uri: normalized} : fallback;
}

function mapNotice(
  notice: BackendHomeNotice,
  index: number,
  fallback?: HomeNotice,
): HomeNotice {
  return {
    id: firstText(notice.id, fallback?.id) ?? `notice-${index}`,
    title: firstText(notice.title, fallback?.title) ?? '공지',
    description: firstText(notice.description, fallback?.description) ?? '',
  };
}

function mapTrend(
  trend: BackendHomeTrendItem,
  index: number,
  fallback?: HomeTrendItem,
): HomeTrendItem {
  const fallbackTrend = fallback ?? homeMock.hero.trends[index % homeMock.hero.trends.length];

  return {
    id: firstText(trend.id, fallbackTrend?.id) ?? `trend-${index}`,
    title: firstText(trend.title, fallbackTrend?.title) ?? '추천 룩',
    tone: firstText(trend.tone, fallbackTrend?.tone) ?? '데일리',
    imageSource: imageSourceFromUrl(trend.imageUrl, fallbackTrend?.imageSource ?? homeMock.hero.imageSource),
  };
}

function mapFilterStoreItem(
  item: BackendHomeFilterStoreItem,
  index: number,
  fallback?: HomeFilterStoreItem,
): HomeFilterStoreItem {
  const fallbackItem = fallback ?? homeMock.filterStore[index % homeMock.filterStore.length];

  return {
    id: firstText(item.id, fallbackItem?.id) ?? `filter-store-${index}`,
    title: firstText(item.title, fallbackItem?.title) ?? '추천 필터',
    description: firstText(item.description, fallbackItem?.description) ?? '',
    category: firstText(item.category, fallbackItem?.category) ?? 'AR Filter',
    imageSource: imageSourceFromUrl(item.imageUrl, fallbackItem?.imageSource ?? homeMock.hero.imageSource),
  };
}

function mapRecommendedLook(
  look: BackendHomeMakeupLook,
  index: number,
  fallback?: HomeMakeupLook,
): HomeMakeupLook {
  const fallbackLook = fallback ?? homeMock.recommendedLooks[index % homeMock.recommendedLooks.length];

  return {
    id: firstText(look.id, fallbackLook?.id) ?? `recommended-look-${index}`,
    title: firstText(look.title, fallbackLook?.title) ?? '추천 룩',
    description: firstText(look.description, fallbackLook?.description) ?? '',
    date: firstText(look.date, look.displayDate, fallbackLook?.date) ?? '',
    imageSource: imageSourceFromUrl(look.imageUrl, fallbackLook?.imageSource ?? homeMock.hero.imageSource),
  };
}

function formatSavedMakeupDate(analyzedAt: string): string {
  const date = new Date(analyzedAt);

  if (Number.isNaN(date.getTime())) {
    return analyzedAt;
  }

  return date.toLocaleDateString('ko-KR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function mapFaceAnalysisReportsToHomeSavedMakeupLooks(
  reports: readonly FaceAnalysisReport[],
): HomeMakeupLook[] {
  return reports.flatMap((report) => {
    const recommendedMakeups = report.recommendedMakeups.slice(0, 1);

    if (recommendedMakeups.length === 0) {
      return [];
    }

    return recommendedMakeups.map((makeup, index) => ({
      id: `${report.id}-${makeup.id}-${index}`,
      title: makeup.title,
      description: makeup.subtitle || makeup.description || report.recommendedMood,
      date: formatSavedMakeupDate(report.analyzedAt),
      imageSource: makeup.imageSource,
    }));
  });
}

function mapHomeData(response: BackendHomeData): HomeData {
  if (!response.hero) {
    return homeMock;
  }

  const notices = response.hero.notices ?? response.notices ?? [];
  const trends = response.hero.trends ?? response.trends ?? [];

  return {
    hero: {
      eyebrow: firstText(response.hero.eyebrow, homeMock.hero.eyebrow) ?? homeMock.hero.eyebrow,
      title: firstText(response.hero.title, homeMock.hero.title) ?? homeMock.hero.title,
      description:
        firstText(response.hero.description, homeMock.hero.description) ??
        homeMock.hero.description,
      imageSource: imageSourceFromUrl(response.hero.imageUrl, homeMock.hero.imageSource),
      notices:
        notices.length > 0
          ? notices.map((notice, index) => mapNotice(notice, index, homeMock.hero.notices[index]))
          : homeMock.hero.notices,
      trends:
        trends.length > 0
          ? trends.map((trend, index) => mapTrend(trend, index, homeMock.hero.trends[index]))
          : homeMock.hero.trends,
    },
    filterStore:
      response.filterStore && response.filterStore.length > 0
        ? response.filterStore.map((item, index) =>
            mapFilterStoreItem(item, index, homeMock.filterStore[index]),
          )
        : homeMock.filterStore,
    recommendedLooks:
      response.recommendedLooks && response.recommendedLooks.length > 0
        ? response.recommendedLooks.map((look, index) =>
            mapRecommendedLook(look, index, homeMock.recommendedLooks[index]),
          )
        : homeMock.recommendedLooks,
  };
}

export const getHomeData = async (): Promise<HomeData> => {
  if (!getBackendApiBaseUrl()) {
    return homeMock;
  }

  try {
    const response = await requestBackendJson<BackendHomeData>('/home');

    return mapHomeData(response);
  } catch (error) {
    console.info('[aura:home] data:fallback', {
      message: error instanceof Error ? error.message : String(error),
    });

    return homeMock;
  }
};

export const getSavedRecommendedMakeupLooks = async (): Promise<HomeMakeupLook[]> => {
  const reports = await getFaceAnalysisReports({
    limit: 40,
    withRecommendedMakeups: true,
  });

  return mapFaceAnalysisReportsToHomeSavedMakeupLooks(reports);
};
