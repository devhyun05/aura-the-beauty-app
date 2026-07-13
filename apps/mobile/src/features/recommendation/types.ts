import type {ImageSourcePropType} from 'react-native';

export type ProductRecommendationCategory =
  | 'all'
  | 'lip'
  | 'cheek'
  | 'shadow'
  | 'liner'
  | 'base';

export type ProductRecommendationTab = {
  id: ProductRecommendationCategory;
  label: string;
};

export type RecommendedProduct = {
  id: string;
  brandName: string;
  productName: string;
  shadeName: string;
  category: Exclude<ProductRecommendationCategory, 'all'>;
  matchRate: number;
  price: number;
  tags: string[];
  imageUrl?: string;
  imageSource: ImageSourcePropType;
  purchaseUrl?: string;
  offerId?: string;
  palette: string[];
  productInfo?: {
    brand?: string;
    colors?: string[];
    effects?: string[];
    features?: string[];
    maker?: string;
    origin?: string;
    productNumber?: string;
    skinTypes?: string[];
    tones?: string[];
  };
  reason: string;
};

export type ProductSectionStatus =
  | 'ready'
  | 'empty'
  | 'unavailable'
  | 'noArStyle'
  | 'unsupportedRecipe'
  | 'noEligibleProducts'
  | 'personalizationOff'
  | 'insufficientData'
  | 'control';

export type CatalogProductPrice = {
  amount: number | null;
  currency: string;
  updatedAt?: string | null;
};

export type CatalogProductOffer = {
  offerId: string;
  sellerName: string;
  sellerDomain: string;
  availability: string;
  affiliateType: 'none' | 'affiliate' | 'sponsored' | string;
  disclosureLabel?: string | null;
};

export type CatalogProduct = {
  productId: string;
  shadeId?: string | null;
  brandName: string;
  productName: string;
  category: string;
  shadeName?: string | null;
  shadeHex?: string | null;
  finish?: string | null;
  imageUrl?: string | null;
  price: CatalogProductPrice;
  offer?: CatalogProductOffer | null;
  viewerState: {liked: boolean};
  catalogVersion?: string;
  sourceUpdatedAt?: string | null;
  sponsored?: boolean;
  sponsorshipType?: 'organic' | 'affiliate' | 'sponsored' | string;
  disclosureLabel?: string | null;
  reasonCodes?: string[];
  reasonLabels?: string[];
  exposureToken?: string | null;
  status?: 'active' | 'soldOut' | 'unavailable';
  canUnlike?: boolean;
  canLike?: boolean;
  purchaseUrl?: string | null;
  externalSource?: string | null;
};

export type ProductDetailRecommendationContext = {
  disclosureLabel?: string | null;
  reasonLabels?: string[];
  sponsored?: boolean;
  sponsorshipType?: 'organic' | 'affiliate' | 'sponsored' | string;
};

export type ProductRecommendationFeatureFlags = {
  productHubV2: boolean;
  seasonalRecommendationsV1: boolean;
  arRecipePersistenceV1: boolean;
  arProductRecommendationsV1: boolean;
  engagementPersonalizationV1: boolean;
  cohortRecommendationsV1: boolean;
  legacyNaverProductSearch: boolean;
  naverShoppingInsightEnabled: boolean;
};

export type ArRecommendationGroup = {
  region: 'lip' | 'cheek' | 'liner';
  label: string;
  status: ProductSectionStatus;
  items: CatalogProduct[];
  nextCursor?: string | null;
};

export type ArRecommendationData = {
  status: ProductSectionStatus;
  runId?: string;
  basedOn?: {
    styleId: string;
    styleTitle?: string | null;
    envelopeVersion?: string;
    recipeVersion?: number;
    colorSemantics?: 'authoring_color';
  } | null;
  groups: ArRecommendationGroup[];
};

export type SeasonalRecommendationData = {
  status: ProductSectionStatus;
  collection?: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    validFrom: string;
    validUntil: string;
    reviewedAt: string;
    sourceLabels: string[];
    sourceLinks?: string[];
    sourceUpdatedAt?: string | null;
    trendWindow: string;
    revision: number;
    isStale: boolean;
    isLive?: boolean;
    providerStatus?: 'shoppingInsight' | 'editorialFallback' | string;
    refreshAfterSeconds?: number;
  } | null;
  items: CatalogProduct[];
  nextCursor?: string | null;
};

export type PersonalizedRecommendationData = {
  status: ProductSectionStatus;
  runId?: string | null;
  title?: string | null;
  description?: string | null;
  algorithmVersion?: string;
  cohortSizeBand?: string;
  minimumCohortSize?: number;
  items: CatalogProduct[];
};

export type ProductSearchData = {
  status: ProductSectionStatus;
  searchRequestId: string;
  items: CatalogProduct[];
  nextCursor?: string | null;
};

export type ProductRecommendationLook = {
  title: string;
  description: string;
  imageUrl?: string;
  imageSource: ImageSourcePropType;
  tags: string[];
  palette: string[];
};

export type ProductRecommendationLookOption = ProductRecommendationLook & {
  index: number;
  subtitle?: string;
};

export type ProductRecommendationSet = {
  id: string;
  title: string;
  description: string;
  productIds: string[];
};

export type ProductRecommendationData = {
  userNickname: string;
  makeupLook: ProductRecommendationLook;
  makeupLookOptions: ProductRecommendationLookOption[];
  tabs: ProductRecommendationTab[];
  products: RecommendedProduct[];
  sets: ProductRecommendationSet[];
};

export type AuradinQuickPrompt = {
  id: string;
  label: string;
  prompt: string;
};

export type AuradinSourceCard = {
  id: string;
  title: string;
  description: string;
  tone: string;
};

export type AuradinThinkingStep = {
  id: string;
  label: string;
  status: 'done' | 'active' | 'pending';
};

export type AuradinQuestionOption = {
  id: string;
  label: string;
  swatch?: string;
};

export type AuradinQuestion = {
  id: string;
  title: string;
  options: AuradinQuestionOption[];
};

// §6 구조화 근거 (matchedOn/inferred/caveat). 시각화는 이후 단계(3역할·근거 UI),
// 지금은 데이터만 관통시켜 둔다.
export type AuradinReason = {
  matchedOn: string[];
  inferred: string[];
  caveat: string[];
};

export type AuradinProductRole = 'anchor' | 'diverse' | 'discovery';

// 결과에 노출되는 적용 조건 칩. source가 하드 조건(prompt/question/refine/fallback)인지
// 리포트 톤 참고(report)인지 구분 — report는 "참고" 뉘앙스로 렌더한다(§9).
export type AuradinAppliedFilter = {
  label: string;
  source: 'prompt' | 'question' | 'refine' | 'report' | 'fallback' | string;
};

export type AuradinCandidateProduct = {
  id: string;
  shadeId?: string;
  brandName: string;
  productName: string;
  shadeName: string;
  priceText: string;
  matchSummary: string;
  palette: string[];
  tags: string[];
  imageSource: ImageSourcePropType;
  // 백엔드 서빙 필드 (옵셔널 — mock 후보는 없이도 동작). 3역할·근거 UI에서 소비 예정.
  role?: AuradinProductRole;
  source?: 'curated' | 'live_naver';
  reason?: AuradinReason;
  reasonCopy?: string; // §6 가산 카피 — 구조화 reason이 권위값, 카피는 읽기용
  matchRate?: number;
  purchaseUrl?: string;
  offerId?: string;
  imageUrl?: string;
  category?: string;
};

export type AuradinSearchPhase = 'searching' | 'question' | 'results' | 'failed' | 'expired';

// ── auradin-rn DS 포팅(프리젠테이션 레이어)이 소비하는 타입 ──
// 화면 phase — 단일 PersistentOrb 모프 + 지반 다크 여부를 구동 (§9 ③).
export type AuradinPhase =
  | 'home'
  | 'searching'
  | 'question'
  | 'results'
  | 'detail'
  | 'saved'
  | 'failed';

export type ThinkingStepState = 'done' | 'active' | 'pending';
export type ThinkingStep = {label: string; state: ThinkingStepState};

export type RefineDial = 'more_similar' | 'more_diverse';

// 백엔드 SearchTurn을 화면이 소비하는 형태로 매핑한 결과.
export type AuradinSearchTurn = {
  sessionId: string;
  phase: AuradinSearchPhase;
  thinking: AuradinThinkingStep[];
  question?: AuradinQuestion;
  candidates: AuradinCandidateProduct[];
  headerLabel?: string;
  appliedFilters?: AuradinAppliedFilter[];
  error?: {code?: string; message?: string; recoverable?: boolean} | null;
};

export type AuradinDraftData = {
  conditionChips: string[];
  quickPrompts: AuradinQuickPrompt[];
  sourceCards: AuradinSourceCard[];
  thinkingSteps: AuradinThinkingStep[];
  question: AuradinQuestion;
  candidates: AuradinCandidateProduct[];
};
