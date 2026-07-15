import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const require = createRequire(import.meta.url);
const typescript = require(join(repositoryRoot, 'apps/mobile/node_modules/typescript'));

function source(path) {
  return readFileSync(join(repositoryRoot, path), 'utf8');
}

function requireContract(condition, message) {
  if (!condition) throw new Error(`Product recommendation contract failed: ${message}`);
}

function executeTypeScriptModule(path, dependencies) {
  const filename = join(repositoryRoot, path);
  const compiled = typescript.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  const module = {exports: {}};
  const isolatedRequire = specifier => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    throw new Error(`Unexpected dependency while testing ${path}: ${specifier}`);
  };
  Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(
    module.exports,
    isolatedRequire,
    module,
    filename,
    dirname(filename),
  );
  return module.exports;
}

const homeRoutes = source('apps/mobile/src/app/navigation/routes/homeRoutes.tsx');
const routeTypes = source('apps/mobile/src/app/navigation/routeTypes.ts');
const legacyService = source('apps/mobile/src/features/recommendation/services/productRecommendationService.ts');
const likedService = source('apps/mobile/src/shared/services/productService.ts');
const eventService = source('apps/mobile/src/features/recommendation/services/productEventService.ts');
const productRail = source('apps/mobile/src/features/recommendation/components/ProductRail.tsx');
const hubContent = source('apps/mobile/src/features/recommendation/components/ProductRecommendationHubContent.tsx');
const rootNavigator = source('apps/mobile/src/app/navigation/RootNavigator.tsx');
const arSave = source('apps/mobile/src/features/ar/services/savedArLookService.ts');
const auradinService = source('apps/mobile/src/features/recommendation/services/auradinSearchService.ts');
const auradinScreen = source('apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx');
const legacyAuradinService = source('apps/mobile/src/features/recommendation/services/auradinService.ts');
const auradinOrb = source('apps/mobile/src/features/recommendation/components/AuradinFloatingOrb.tsx');
const recommendationScreen = source('apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx');
const recommendationShelfScreen = source('apps/mobile/src/features/recommendation/screens/ProductRecommendationShelfScreen.tsx');
const productShelfCategories = source('apps/mobile/src/features/recommendation/services/productShelfCategories.ts');
const appScreen = source('apps/mobile/src/shared/ui/AppScreen.tsx');
const backendApi = source('apps/mobile/src/shared/services/backendApi.ts');
const productHubService = source('apps/mobile/src/features/recommendation/services/productHubService.ts');
const recommendationRoutes = source('apps/mobile/src/app/navigation/routes/recommendationRoutes.tsx');
const arRoutes = source('apps/mobile/src/app/navigation/routes/arRoutes.tsx');
const searchScreen = source('apps/mobile/src/features/recommendation/screens/ProductSearchResultScreen.tsx');
const likedScreen = source('apps/mobile/src/features/recommendation/screens/LikedProductListScreen.tsx');
const detailScreen = source('apps/mobile/src/features/recommendation/screens/ProductDetailScreen.tsx');
const transientToast = source('apps/mobile/src/shared/ui/TransientToast.tsx');
const iosAppDelegate = source('apps/mobile/ios/AURA/AppDelegate.swift');
const mobileEntry = source('apps/mobile/index.ts');
const devRefreshBanner = source('apps/mobile/src/shared/dev/disableDevRefreshBanner.js');

requireContract(
  rootNavigator.includes('initialRouteName="Login"') &&
    !rootNavigator.includes("? 'AuradinSearch' : 'Login'"),
  'development flags must not bypass home by booting directly into AURADIN.',
);
requireContract(
  iosAppDelegate.includes('RCTDevLoadingViewSetEnabled(false)') &&
    iosAppDelegate.includes('#if DEBUG') &&
    mobileEntry.includes("./src/shared/dev/disableDevRefreshBanner") &&
    devRefreshBanner.includes("type !== 'refresh'") &&
    devRefreshBanner.includes('DevLoadingView.hide()'),
  'physical-device development builds must hide the blue Fast Refresh loading banner.',
);
requireContract(
  likedService.includes('likeExternalProduct') &&
    likedService.includes('/products/external/') &&
    likedScreen.includes('product.externalSource && product.purchaseUrl') &&
    legacyService.includes('externalSource: firstText(product.externalSource)') &&
    recommendationScreen.includes('if (product.externalSource) await likeExternalProduct(product.id, product.externalSource)') &&
    recommendationScreen.includes('unlikeProduct(product.id, product.externalSource)') &&
    recommendationScreen.includes('isTrustedCatalogProductId(product.id) || Boolean(product.externalSource)') &&
    recommendationScreen.includes('likeExternalProduct(product.productId, product.externalSource)') &&
    recommendationScreen.includes('unlikeProduct(product.productId, product.externalSource)') &&
    auradinService.includes("product.externalSource === 'auradin_catalog'") &&
    auradinScreen.includes('likeExternalProduct(product.id, product.externalSource)') &&
    auradinScreen.includes('unlikeProduct(product.id, product.externalSource)'),
  'server-resolved external products must support like, unlike, MyPage listing, and seller reopening in both product grids.',
);
requireContract(
  hubContent.includes('actionLabel="설정하기"') &&
    hubContent.includes('likedFallbackItems') &&
    hubContent.includes('최근 좋아요한 제품을 보여드려요.') &&
    recommendationScreen.includes('hasFocusedHubRef') &&
    recommendationScreen.includes('setLikedProducts(nextProducts)') &&
    recommendationScreen.includes('getLikedProducts()') &&
    recommendationScreen.includes('setLikedProductIds(new Set(nextProducts.map(product => product.id)))') &&
    recommendationScreen.includes('setHubRefreshKey(current => current + 1)') &&
    hubContent.includes('}, [refreshKey]);'),
  'modular shelves must load shared likes, expose consent settings, and refresh after re-entry or like changes.',
);
requireContract(
  hubContent.includes('state.data?.minimumCohortSize ?? 5') &&
    !hubContent.includes('100명 이상'),
  'the cohort empty state must use the configured five-user local threshold instead of hard-coding 100 users.',
);
requireContract(
  homeRoutes.includes("getHomeProductRecommendationRouteName(): 'ProductRecommendation'") &&
    homeRoutes.includes("rootNavigation?.navigate(getHomeProductRecommendationRouteName())"),
  'Home 추천 제품 must open ProductRecommendation.',
);
requireContract(
  routeTypes.includes("arStyleId?: string") && routeTypes.includes("initialSection?: 'ar' | 'seasonal' | 'personalized' | 'cohort'"),
  'ProductRecommendation route must carry only saved style identity and initial section.',
);
requireContract(
  legacyService.includes("__DEV__ && process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1'") &&
    !legacyService.includes('recommendations:fallback'),
  'production must not silently replace backend failures with fixture recommendations.',
);
requireContract(
  likedService.includes("body: sourceShadeId ? {sourceShadeId} : {}") &&
    !likedService.includes('purchaseUrl,') &&
    likedService.includes("throw new Error('좋아요를 저장할 서버가 연결되지 않았어요.')"),
  'likes must submit only the internal product URL identity and optional shade context.',
);
requireContract(
  productRail.includes('itemVisiblePercentThreshold: 60') && productRail.includes('minimumViewTime: 700'),
  'rail impressions must use the viewport threshold.',
);
requireContract(
  eventService.includes('MAX_QUEUE_SIZE = 100') &&
    eventService.includes('QUEUE_TTL_MS') &&
    eventService.includes('MAX_ATTEMPTS = 2'),
  'optional event queue must be bounded by count, TTL, and retries.',
);
requireContract(
  eventService.includes('export type ProductEventCategory') &&
    eventService.includes("| 'liner';") &&
    !eventService.includes('context?: {category?: string;'),
  'product shelf analytics must send only a closed makeup-category enum.',
);
requireContract(
  arSave.includes('SENSITIVE_RECIPE_KEY') &&
    arSave.includes("schemaVersion: 'saved_ar_look_v1'") &&
    arSave.includes("recipeContract: 'FullFaceMakeupRecipe'"),
  'saved AR look requests must use the minimized versioned recipe contract.',
);
requireContract(
  arRoutes.includes('saveRequestIdsByRecipe') &&
    arRoutes.includes('saveArLook(savedContract, clientRequestId)') &&
    arRoutes.includes("navigation.replace('MakeupFilterSaveComplete'"),
  'AR save retries must reuse an idempotency key for the same recipe and connect to save completion.',
);
requireContract(
  auradinService.includes("EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1'") && auradinService.includes('offerId'),
  'AURADIN must use trusted offer identities and explicit development fixtures only.',
);
requireContract(
  legacyAuradinService.includes("__DEV__ && process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1'") &&
    legacyAuradinService.includes("throw new Error('아우라딘 초안 fixture가 비활성화되어 있어요.')"),
  'legacy AURADIN draft fixtures must also be impossible to display in production.',
);
requireContract(
    auradinOrb.includes("AccessibilityInfo.isReduceMotionEnabled()") &&
    auradinOrb.includes('BOTTOM_NAV_GUARD') &&
    auradinOrb.includes('AURADIN_ORB_CONTENT_CLEARANCE') &&
    auradinOrb.includes('onSideChange?.(side)') &&
    auradinOrb.includes("pointerEvents={hidden ? 'none' : 'box-none'}") &&
    recommendationScreen.includes("fast ? 'hidden' : 'compact'") &&
    recommendationScreen.includes("hidden={orbScrollState === 'hidden'}") &&
    recommendationScreen.includes('horizontalPaddingLeft={contentPaddingLeft}') &&
    recommendationScreen.includes('horizontalPaddingRight={contentPaddingRight}') &&
    appScreen.includes('horizontalPaddingLeft = horizontalPadding') &&
    appScreen.includes('horizontalPaddingRight = horizontalPadding'),
  'AURADIN orb must respect Reduce Motion, reserve card-safe edge space, avoid bottom navigation, compact while scrolling, and hide during fast scroll.',
);
requireContract(
  backendApi.includes("code = 'NETWORK_UNAVAILABLE'") &&
    backendApi.includes('네트워크 연결을 확인한 뒤 다시 시도해 주세요.'),
  'offline backend failures must have an explicit localized retry contract.',
);

const backendApiModule = executeTypeScriptModule(
  'apps/mobile/src/shared/services/backendApi.ts',
  {},
);
const previousApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const previousFetch = globalThis.fetch;
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com';
globalThis.fetch = async () => {
  throw new TypeError('Network request failed');
};
let offlineError;
try {
  await backendApiModule.requestBackendJson('/products/features');
} catch (error) {
  offlineError = error;
} finally {
  globalThis.fetch = previousFetch;
  if (previousApiBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = previousApiBaseUrl;
}
requireContract(
  backendApiModule.isBackendNetworkError(offlineError) &&
    offlineError.code === 'NETWORK_UNAVAILABLE' &&
    offlineError.message === '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
  'an executed offline request must surface the localized retryable network error.',
);
requireContract(
  productHubService.includes("params.set('shade_id', shadeId)") &&
    recommendationRoutes.includes('shadeId={route.params.shadeId}') &&
    recommendationRoutes.includes('disclosureLabel: route.params.disclosureLabel'),
  'product detail navigation must preserve the recommended shade and public sponsorship disclosure.',
);
requireContract(
  productHubService.includes("stylePayload?.schemaVersion === 'saved_ar_look_v1'") &&
    hubContent.includes('getSavedArLookOptions()') &&
    hubContent.includes('onPress={openLookPicker}') &&
    !hubContent.includes('최근 분석으로 추천 보기') &&
    !hubContent.includes('fallbackPersonalizedData'),
  'AR section must change saved looks without routing the shopping hub into report-based legacy recommendations.',
);
requireContract(
  hubContent.includes('seasonal.data.collection?.isStale') &&
    hubContent.includes('마지막 검수 콘텐츠'),
  'stale seasonal sources must be disclosed instead of appearing current.',
);
requireContract(
  hubContent.includes('title="AR 필터 기반 추천제품"') &&
    hubContent.includes('부위별 인기 제품을 먼저 보여드려요.') &&
    hubContent.includes('title={personalizedTitle}') &&
    hubContent.includes('title="시즌 상품"') &&
    hubContent.includes('title={cohortTitle}') &&
    hubContent.includes('function Section') &&
    !hubContent.includes('<LegacyRecommendationRail') &&
    hubContent.includes('<ProductRail') &&
    hubContent.includes('requestRefs.current.ar === requestId') &&
    hubContent.includes('requestRefs.current.seasonal === requestId') &&
    hubContent.includes('getSeasonalRecommendations(refreshKey)'),
  'hub must expose four purpose-specific shopping shelves, horizontal product rails, more actions, and stale-response protection.',
);
requireContract(
  recommendationScreen.includes('const handleExpandLegacyRecommendations = useCallback(() => {') &&
    recommendationScreen.includes('pendingLegacyScrollRef.current = true') &&
    recommendationScreen.includes('setIsLegacyExpanded(true)') &&
    recommendationScreen.includes('accessibilityLabel="얼굴 분석 기준 전체 추천 열기"') &&
    recommendationScreen.includes('onPress={handleExpandLegacyRecommendations}') &&
    recommendationScreen.includes('보고서·룩·카테고리·정렬 기준을 바꿔 전체 상품을 탐색할 수 있어요.'),
  'the shopping hub must provide an accessible entry into report-based full recommendations, category filters, and sorting.',
);
requireContract(
  routeTypes.includes('ProductRecommendationShelf:') &&
    rootNavigator.includes('name="ProductRecommendationShelf"') &&
    recommendationRoutes.includes("navigation.navigate('ProductRecommendationShelf'") &&
    hubContent.includes("onOpenShelf('ar'") &&
    hubContent.includes("onOpenShelf('personalized'") &&
    hubContent.includes("onOpenShelf('seasonal'") &&
    hubContent.includes("onOpenShelf('cohort'") &&
    !hubContent.includes('CatalogShelfModal') &&
    recommendationShelfScreen.includes('PRODUCT_SHELF_CATEGORY_TABS') &&
    recommendationShelfScreen.includes('numColumns={2}') &&
    recommendationShelfScreen.includes('showReason'),
  'each shelf more action must open a dedicated two-column category page while preserving recommendation reasons.',
);
requireContract(
  hubContent.includes("setSeasonal(current => current.data ? current : {status: 'loading'})") &&
    hubContent.includes("setPersonalized(current => current.data ? current : {status: 'loading'})") &&
    searchScreen.includes('const requestIdRef = useRef(0)') &&
    searchScreen.includes('if (requestIdRef.current === requestId)') &&
    detailScreen.includes('if (requestIdRef.current !== requestId) return;'),
  'background shelf refreshes must preserve visible content and search/detail screens must reject stale responses.',
);
requireContract(
  productShelfCategories.includes("{id: 'base', label: '베이스'}") &&
    productShelfCategories.includes("{id: 'shadow', label: '아이섀도우'}") &&
    productShelfCategories.includes("{id: 'brow', label: '아이브로우'}") &&
    productShelfCategories.includes("{id: 'cheek', label: '치크'}") &&
    productShelfCategories.includes("{id: 'lip', label: '립'}") &&
    productShelfCategories.includes("{id: 'liner', label: '아이라이너'}"),
  'the shelf page must expose the requested commercial makeup category tabs.',
);
requireContract(
  recommendationShelfScreen.includes('tabScroller: {flexGrow: 0, height: 44}') &&
    recommendationScreen.includes('minHeight: 44') &&
    hubContent.includes("chipActive: {backgroundColor: colors.black, borderRadius: radius.pill, justifyContent: 'center', minHeight: 44"),
  'category, sorting, and AR-region controls must keep a 44pt minimum touch target without expanding the shelf viewport.',
);

const productShelfCategoryModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/productShelfCategories.ts',
  {},
);
const categoryFixture = [
  {productId: 'base-product', category: 'cushion'},
  {productId: 'brow-product', category: 'eyebrow'},
  {productId: 'liner-product', category: 'liner'},
];
requireContract(
  productShelfCategoryModule.filterProductShelfItems(categoryFixture, 'base')[0]?.productId === 'base-product' &&
    productShelfCategoryModule.filterProductShelfItems(categoryFixture, 'brow')[0]?.productId === 'brow-product' &&
    productShelfCategoryModule.filterProductShelfItems(categoryFixture, 'all').length === 3 &&
    productShelfCategoryModule.normalizeProductShelfCategory('아이 섬도우') === 'shadow',
  'category aliases and all-products filtering must execute deterministically.',
);
requireContract(
  recommendationShelfScreen.includes("data={state.status === 'ready' ? visibleItems : []}") &&
    recommendationShelfScreen.includes("status: items.length > 0 ? 'ready' : data.status") &&
    recommendationShelfScreen.includes('getSeasonalRecommendations(undefined, 60, requestedCategory)') &&
    recommendationShelfScreen.includes('getPersonalizedRecommendations(60, requestedCategory)') &&
    recommendationShelfScreen.includes('getCohortRecommendations(60, requestedCategory)') &&
    recommendationShelfScreen.includes('onPress={() => selectCategory(tab.id)}') &&
    !recommendationShelfScreen.includes('shelfSelection.usesAllItemsFallback'),
  'dedicated shelf tabs must request category-ranked products from the server instead of substituting another category.',
);
requireContract(
  hubContent.includes("source: seasonal.data?.collection?.isLive ? 'seasonal_live' : 'seasonal_supplement'") &&
    hubContent.includes("source: 'personalized_fallback'") &&
    recommendationShelfScreen.includes("const isExternalSeasonal = shelf === 'seasonal'") &&
    recommendationShelfScreen.includes("'seasonal_supplement'") &&
    recommendationShelfScreen.includes("'ar_fallback'") &&
    recommendationShelfScreen.includes("'personalized_fallback'"),
  'external seasonal supplements and unsigned cold-start fallbacks must collect engagement through the validated legacy event contract.',
);
requireContract(
  hubContent.includes("!seasonal.data?.items.length") &&
    hubContent.includes('const hasRecommendationItems = Boolean(state.data?.items.length)') &&
    hubContent.includes("state.data?.status !== 'ready'") &&
    hubContent.includes('!hasRecommendationItems') &&
    hubContent.includes('최근 좋아요한 제품을 보여드려요.'),
  'ready-but-empty hub shelves must render an explicit state while personalized shelves preserve the liked-product fallback.',
);

const fallbackProduct = {
  productId: 'fallback-product',
  brandName: '롬앤',
  productName: '인기 틴트',
  category: 'lip',
  price: {amount: 12000, currency: 'KRW'},
  viewerState: {liked: false},
};
const presentationModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/productRecommendationPresentation.ts',
);
requireContract(
  presentationModule.personalizedRecommendationTitle({
    status: 'ready',
    personalizationStatus: 'personalizationOff',
    fallback: {type: 'popular', reason: 'PERSONALIZATION_CONSENT_OFF'},
    items: [fallbackProduct],
  }) === '지금 많이 저장한 추천제품' &&
    presentationModule.cohortRecommendationTitle({
      status: 'ready',
      cohortStatus: 'insufficientData',
      fallback: {type: 'reportTone', reason: 'NO_COLOR_COHORT'},
      items: [fallbackProduct],
    }, '서진') === '서진님의 퍼스널컬러 추천제품' &&
    presentationModule.cohortRecommendationTitle({
      status: 'ready',
      cohortSizeBand: '5+',
      items: [fallbackProduct],
    }, '서진') === '서진님과 비슷한 분들이 많이 좋아해요',
  'recommendation headings must describe popular, report-tone, and privacy-thresholded cohort evidence honestly.',
);

const productHubApiRequests = [];
const productHubServiceModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/productHubService.ts',
  {
    '../../../shared/services/backendApi': {
      getBackendApiBaseUrl: () => 'https://api.example.com',
      requestBackendJson: async (path) => {
        productHubApiRequests.push(path);
        if (path.includes('/recommendations/ar?')) return {status: 'ready', groups: []};
        if (path.includes('/recommendations/seasonal?')) return {status: 'ready', collection: null, items: []};
        return {status: 'ready', items: []};
      },
    },
  },
);
const normalizedAr = productHubServiceModule.normalizeArRecommendationData({
  status: 'noArStyle',
  groups: [{region: 'lip', label: '립', status: 'noArStyle', items: [fallbackProduct]}],
});
const normalizedSeasonal = productHubServiceModule.normalizeSeasonalRecommendationData({
  status: 'empty',
  collection: null,
  items: [fallbackProduct],
});
const normalizedPersonalized = productHubServiceModule.normalizePersonalizedRecommendationData({
  status: 'insufficientData',
  items: [fallbackProduct],
});
requireContract(
  normalizedAr.status === 'ready' &&
    normalizedAr.groups[0].status === 'ready' &&
    normalizedSeasonal.status === 'ready' &&
    normalizedPersonalized.status === 'ready' &&
    productHubServiceModule.normalizePersonalizedRecommendationData({status: 'insufficientData', items: []}).status === 'insufficientData',
  'catalog-grounded fallback items must be normalized as renderable while genuinely empty responses retain their status.',
);
await productHubServiceModule.getArRecommendations(undefined, 20, 'lip');
await productHubServiceModule.getSeasonalRecommendations(undefined, 60, 'base');
await productHubServiceModule.getPersonalizedRecommendations(60, 'brow');
await productHubServiceModule.getCohortRecommendations(60, 'shadow');
requireContract(
  productHubApiRequests.some(path => path.includes('/recommendations/ar?') && path.includes('regions=lip') && path.includes('per_region_limit=20')) &&
    productHubApiRequests.some(path => path.includes('/recommendations/seasonal?') && path.includes('limit=60') && path.includes('category=base')) &&
    productHubApiRequests.some(path => path.includes('/recommendations/personalized?') && path.includes('limit=60') && path.includes('category=brow')) &&
    productHubApiRequests.some(path => path.includes('/recommendations/cohort?') && path.includes('limit=60') && path.includes('category=shadow')),
  'more shelves must execute category-scoped server requests with the expanded commercial page size.',
);
const legacyRecommendationModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/productRecommendationService.ts',
  {
    '../../../shared/services/backendApi': {
      getBackendApiBaseUrl: () => 'https://api.example.com',
      requestBackendJson: async () => ({
        products: [{
          id: 'auradin-seed-contract-brow',
          externalSource: 'auradin_catalog',
          brandName: '테스트 브랜드',
          productName: '브로우 펜슬',
          category: 'brow',
          imageUrl: 'https://images.example.com/brow.jpg',
          purchaseUrl: 'https://shop.example.com/brow',
          price: 12000,
        }],
      }),
    },
    '../mocks/productRecommendation.mock': {productRecommendationMock: {}},
  },
);
const mappedLegacyRecommendation = await legacyRecommendationModule.getProductRecommendations();
requireContract(
  mappedLegacyRecommendation.products[0]?.externalSource === 'auradin_catalog' &&
    mappedLegacyRecommendation.products[0]?.category === 'brow' &&
    mappedLegacyRecommendation.tabs.some(tab => tab.id === 'brow') &&
    mappedLegacyRecommendation.tabs.some(tab => tab.id === 'liner'),
  'compatibility recommendations must preserve external like identity and all six product categories.',
);
requireContract(
  recommendationRoutes.includes('headerMode="standard"') &&
    !recommendationScreen.includes('AURADIN_ORB_CONTENT_CLEARANCE') &&
    recommendationScreen.includes('if (product.externalSource)') &&
    recommendationScreen.includes('if (!product.purchaseUrl)') &&
    recommendationScreen.includes('판매처 정보를 확인할 수 없어요.'),
  'product hub must use full commercial shelf width, non-overlapping route chrome, and external-sale routing.',
);
requireContract(
  auradinScreen.includes('useFocusEffect') &&
    auradinScreen.includes('likeProduct(product.id, product.shadeId)') &&
    searchScreen.includes('useFocusEffect') &&
    likedScreen.includes('useFocusEffect') &&
    likedScreen.includes('onOpenProduct?.(product.id, product.shadeId)') &&
    detailScreen.includes("showToast('좋아요한 제품에 저장했어요'") &&
    transientToast.includes("accessibilityRole=\"button\"") &&
    recommendationRoutes.includes("onOpenLikedProducts={() => navigation.navigate('LikedProductList')}"),
  'AURADIN, search, detail, and liked-list screens must resync shared likes and expose the accessible saved-list action.',
);

let savedRequest;
const savedArModule = executeTypeScriptModule(
  'apps/mobile/src/features/ar/services/savedArLookService.ts',
  {
    '../../../shared/services/backendApi': {
      requestBackendJson: async (path, options) => {
        savedRequest = {path, options};
        return {style: {id: 'saved-style-id', ...options.body}};
      },
    },
  },
);
const savedContract = {
  source: 'face-analysis-full-face',
  recipe: {
    version: 2,
    rendererMode: 'smooth-region-mask',
    halfFaceMode: 'off',
    regions: [{region: 'lip', authoringColorHex: '#AA6677'}],
    sourceFrameMetadata: {capturePath: '/private/face.png'},
    nested: {faceLandmarks: [1, 2, 3], safeValue: 'kept'},
  },
};
const minimized = savedArModule.buildSavedArLookRequest(
  savedContract,
  '11111111-1111-4111-8111-111111111111',
);
requireContract(
  minimized.clientRequestId === '11111111-1111-4111-8111-111111111111' &&
    !('sourceFrameMetadata' in minimized.stylePayload.recipe) &&
    !('faceLandmarks' in minimized.stylePayload.recipe.nested) &&
    minimized.stylePayload.recipe.nested.safeValue === 'kept',
  'saved AR look minimization must execute recursively and preserve non-sensitive recipe fields.',
);
const savedStyle = await savedArModule.saveArLook(
  savedContract,
  '11111111-1111-4111-8111-111111111111',
);
requireContract(
  savedRequest?.path === '/makeup-styles' &&
    savedRequest?.options?.method === 'POST' &&
    savedRequest?.options?.body?.clientRequestId === '11111111-1111-4111-8111-111111111111' &&
    savedStyle.id === 'saved-style-id',
  'saved AR look service must execute the minimized idempotent POST contract.',
);

const eventRequests = [];
const productEventModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/productEventService.ts',
  {
    '../../../shared/services/backendApi': {
      getBackendApiBaseUrl: () => 'http://127.0.0.1:8000/api',
      requestBackendJson: async (path, options) => {
        eventRequests.push({path, options});
        return {};
      },
    },
  },
);
const eventInput = {
  eventType: 'product_open',
  section: 'legacy',
  productId: '22222222-2222-4222-8222-222222222222',
  position: 0,
  context: {screen: 'contract-test'},
};
productEventModule.setProductEventCollectionEnabled(false);
productEventModule.queueProductEvent(eventInput);
await productEventModule.flushProductEvents();
requireContract(eventRequests.length === 0, 'event collection must execute as a no-op without consent.');
productEventModule.setProductEventCollectionEnabled(true);
productEventModule.queueProductEvent(eventInput);
await productEventModule.flushProductEvents();
const postedEvent = eventRequests[0]?.options?.body?.events?.[0];
requireContract(
  eventRequests[0]?.path === '/products/events' &&
    eventRequests[0]?.options?.method === 'POST' &&
    /^[0-9a-f-]{36}$/.test(postedEvent?.eventId ?? '') &&
    typeof postedEvent?.occurredAt === 'string' &&
    !('queuedAtMs' in postedEvent) &&
    !('attempts' in postedEvent),
  'consented event queue must execute a bounded wire payload without local queue metadata.',
);
const externalIdentity = productEventModule.productEventIdentity({
  productId: 'auradin-seed-contract',
  shadeId: null,
  externalSource: 'auradin_catalog',
});
requireContract(
  externalIdentity.externalSource === 'auradin_catalog' &&
    externalIdentity.externalProductId === 'auradin-seed-contract' &&
    !externalIdentity.productId &&
    !externalIdentity.shadeId,
  'external catalog events must use the server-owned external identity instead of the UUID product field.',
);
productEventModule.queueProductEvent({
  eventType: 'product_open',
  section: 'legacy',
  ...externalIdentity,
  position: 1,
  context: {source: 'seasonal_live'},
});
await productEventModule.flushProductEvents();
const postedExternalEvent = eventRequests[1]?.options?.body?.events?.[0];
requireContract(
  postedExternalEvent?.externalSource === 'auradin_catalog' &&
    postedExternalEvent?.externalProductId === 'auradin-seed-contract' &&
    !postedExternalEvent?.productId,
  'external catalog engagement must execute the external product wire contract.',
);
productEventModule.queueProductEvent({...eventInput, ...externalIdentity});
productEventModule.queueProductEvent({
  eventType: 'product_open',
  section: 'seasonal',
  position: 2,
});
await productEventModule.flushProductEvents();
requireContract(
  eventRequests.length === 2,
  'ambiguous or missing product identities must be rejected before event collection.',
);
productEventModule.queueProductEvent(eventInput);
productEventModule.setProductEventCollectionEnabled(false);
await productEventModule.flushProductEvents();
requireContract(eventRequests.length === 2, 'withdrawing consent must synchronously clear queued events.');

const typecheck = spawnSync(
  process.execPath,
  [join(repositoryRoot, 'apps/mobile/node_modules/typescript/bin/tsc'), '--noEmit'],
  {cwd: join(repositoryRoot, 'apps/mobile'), stdio: 'inherit'},
);
if (typecheck.status !== 0) process.exit(typecheck.status ?? 1);

console.log('Product recommendation navigation, privacy, catalog, event, and fixture contracts verified.');
