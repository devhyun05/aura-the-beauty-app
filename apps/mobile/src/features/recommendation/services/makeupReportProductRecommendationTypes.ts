import type {
  CatalogProduct,
  ProductRecommendationCategory,
  ProductSectionStatus,
} from '../types';

export type MakeupReportProductCategory = Exclude<
  ProductRecommendationCategory,
  'all'
>;

export type MakeupReportProductSnapshotRunStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'partial'
  | 'failed';

export type MakeupReportProductResultStatus =
  | MakeupReportProductSnapshotRunStatus
  | 'noEligibleProducts';

export type MakeupReportProductSnapshot = {
  status: MakeupReportProductSnapshotRunStatus;
  runId?: string | null;
  revision?: number | null;
  recipeHash?: string | null;
  algorithmVersion?: string | null;
  catalogVersion?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  errorCode?: string | null;
};

export type MakeupReportRecommendationLook = {
  lookId: string;
  role: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  palette: string[];
  targets: string[];
};

export type MakeupReportRecommendationReport = {
  reportId: string;
  scenarioText: string;
  createdAt: string;
  imageStatus: string;
  looks: MakeupReportRecommendationLook[];
};

export type MakeupReportRecommendationReportsResponse = {
  reports: MakeupReportRecommendationReport[];
};

export type MakeupReportRecommendationTargetColor = {
  role?: string;
  name?: string;
  hex: string;
};

export type MakeupReportRecommendationTarget = {
  category: MakeupReportProductCategory;
  colorName?: string;
  colorHex?: string;
  colors?: MakeupReportRecommendationTargetColor[];
  colorFamily?: string;
  colorFamilies?: string[];
  finish?: string;
  texture?: string;
  productTypes?: string[];
  coverage?: string;
};

export type MakeupReportRecommendationGroup = {
  category: MakeupReportProductCategory;
  label: string;
  status: ProductSectionStatus;
  target?: MakeupReportRecommendationTarget;
  items: CatalogProduct[];
};

export type MakeupReportRecommendationRanking = {
  strategy: string;
  embeddingApplied: boolean;
};

export type MakeupReportProductRecommendations = {
  status: MakeupReportProductResultStatus;
  snapshot: MakeupReportProductSnapshot;
  runId?: string | null;
  report?: MakeupReportRecommendationReport;
  selectedLook?: MakeupReportRecommendationLook;
  groups?: MakeupReportRecommendationGroup[];
  ranking?: MakeupReportRecommendationRanking;
  message?: string | null;
};
