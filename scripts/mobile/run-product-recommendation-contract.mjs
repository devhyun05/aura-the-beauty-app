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
const homeFeedService = source('apps/mobile/src/features/home/services/homeFeedService.ts');
const routeTypes = source('apps/mobile/src/app/navigation/routeTypes.ts');
const legacyService = source('apps/mobile/src/features/recommendation/services/productRecommendationService.ts');
const likedService = source('apps/mobile/src/shared/services/productService.ts');
const eventService = source('apps/mobile/src/features/recommendation/services/productEventService.ts');
const productRail = source('apps/mobile/src/features/recommendation/components/ProductRail.tsx');
const hubContent = source('apps/mobile/src/features/recommendation/components/ProductRecommendationHubContent.tsx');
const makeupReportShelf = source('apps/mobile/src/features/recommendation/components/MakeupReportProductRecommendationShelf.tsx');
const makeupReportTargetLegend = source('apps/mobile/src/features/recommendation/components/MakeupReportTargetLegend.tsx');
const makeupReportService = source('apps/mobile/src/features/recommendation/services/makeupReportProductRecommendationService.ts');
const makeupReportTargetPresentation = source('apps/mobile/src/features/recommendation/services/makeupReportTargetPresentation.ts');
const makeupReportTypes = source('apps/mobile/src/features/recommendation/services/makeupReportProductRecommendationTypes.ts');
const productLikeIdentity = source('apps/mobile/src/features/recommendation/services/productLikeIdentity.ts');
const rootNavigator = source('apps/mobile/src/app/navigation/RootNavigator.tsx');
const arSave = source('apps/mobile/src/features/ar/services/savedArLookService.ts');
const auradinService = source('apps/mobile/src/features/recommendation/services/auradinSearchService.ts');
const auradinScreen = source('apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx');
const auradinSavedProducts = source('apps/mobile/src/features/recommendation/services/auradinSavedProducts.ts');
const auradinDetailView = source('apps/mobile/src/features/recommendation/screens/views/DetailView.tsx');
const legacyAuradinService = source('apps/mobile/src/features/recommendation/services/auradinService.ts');
const auradinOrb = source('apps/mobile/src/features/recommendation/components/AuradinFloatingOrb.tsx');
const recommendationScreen = source('apps/mobile/src/features/recommendation/screens/ProductRecommendationScreen.tsx');
const recommendationShelfScreen = source('apps/mobile/src/features/recommendation/screens/ProductRecommendationShelfScreen.tsx');
const productShelfCategories = source('apps/mobile/src/features/recommendation/services/productShelfCategories.ts');
const appScreen = source('apps/mobile/src/shared/ui/AppScreen.tsx');
const backendApi = source('apps/mobile/src/shared/services/backendApi.ts');
const productBackendApi = source('apps/mobile/src/shared/services/productBackendApi.ts');
const productHubService = source('apps/mobile/src/features/recommendation/services/productHubService.ts');
const trendRegionService = source('apps/mobile/src/features/recommendation/services/trendRegionService.ts');
const recommendationRoutes = source('apps/mobile/src/app/navigation/routes/recommendationRoutes.tsx');
const arRoutes = source('apps/mobile/src/app/navigation/routes/arRoutes.tsx');
const searchScreen = source('apps/mobile/src/features/recommendation/screens/ProductSearchResultScreen.tsx');
const likedScreen = source('apps/mobile/src/features/recommendation/screens/LikedProductListScreen.tsx');
const detailScreen = source('apps/mobile/src/features/recommendation/screens/ProductDetailScreen.tsx');
const appHeader = source('apps/mobile/src/shared/ui/AppHeader.tsx');
const detailHeaderChrome = source('apps/mobile/src/app/navigation/detailHeaderChrome.tsx');
const recommendationProductCard = source('apps/mobile/src/features/recommendation/components/RecommendationProductCard.tsx');
const productSearchBar = source('apps/mobile/src/features/recommendation/components/ProductSearchBar.tsx');
const recommendationSectionState = source('apps/mobile/src/features/recommendation/components/RecommendationSectionState.tsx');
const authSessionContext = source('apps/mobile/src/features/auth/services/authSessionContext.tsx');
const transientToast = source('apps/mobile/src/shared/ui/TransientToast.tsx');
const loginScreen = source('apps/mobile/src/features/auth/screens/LoginScreen.tsx');
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
    recommendationScreen.includes('likeExternalProduct(product.productId, product.externalSource)') &&
    recommendationScreen.includes('unlikeProduct(product.productId, product.externalSource)') &&
    recommendationShelfScreen.includes('likeExternalProduct(product.productId, product.externalSource)') &&
    recommendationShelfScreen.includes('unlikeProduct(product.productId, product.externalSource)') &&
    auradinSavedProducts.includes("../../../shared/services/productBackendApi") &&
    auradinSavedProducts.includes("../../../shared/services/productService") &&
    auradinSavedProducts.includes("'/products/liked'") &&
    auradinSavedProducts.includes('likeExternalProduct(product.id, product.externalSource)') &&
    auradinSavedProducts.includes('likeProduct(product.id, product.shadeId)') &&
    auradinSavedProducts.includes('unlikeProduct(productId, externalSource)') &&
    auradinSavedProducts.includes('requestProductBackendJson') &&
    auradinSavedProducts.includes("row.externalSource === 'auradin_catalog'") &&
    auradinSavedProducts.includes("row.externalSource === 'auradin_search'") &&
    auradinService.includes("product.externalSource === 'auradin_catalog' || product.externalSource === 'auradin_search'") &&
    auradinScreen.includes('persistAuradinSave(product)') &&
    auradinScreen.includes('removeAuradinSave(product.id, product.externalSource)') &&
    auradinScreen.includes("product.externalSource ?? 'internal'") &&
    auradinScreen.includes('pendingSaveKeysRef.current.has(productKey)') &&
    auradinScreen.includes('requestVersion === saveMutationVersionRef.current') &&
    auradinScreen.includes("showToast(") &&
    auradinScreen.includes("onOpenLikedProducts ? {label: '보기'") &&
    auradinDetailView.includes('show={buyError}') &&
    !auradinDetailView.includes('보관함에 담김'),
  'server-resolved external products must support like, unlike, MyPage listing, and seller reopening in both product grids.',
);

const auradinSaveCalls = [];
const internalSavedId = '11111111-1111-4111-8111-111111111111';
const searchSavedId = '22222222-2222-4222-8222-222222222222';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const previousDevFlag = globalThis.__DEV__;
globalThis.__DEV__ = false;
const auradinSearchMapperModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/auradinSearchService.ts',
  {
    '../../../shared/services/backendApi': {
      getBackendApiBaseUrl: () => null,
      isRequestAbortedError: () => false,
      requestBackendJson: async () => ({}),
    },
    './auradinAnonToken': {
      auradinAnonEventHeaders: async () => ({}),
      auradinAnonEventHeadersImmediate: () => ({}),
    },
    '../mocks/auradin.mock': {
      auradinDraftMock: {thinkingSteps: [], question: null, candidates: []},
    },
  },
);
if (previousDevFlag === undefined) {
  delete globalThis.__DEV__;
} else {
  globalThis.__DEV__ = previousDevFlag;
}
const mappedInternalUuid = auradinSearchMapperModule.mapCandidate({id: internalSavedId});
const mappedExternalUuid = auradinSearchMapperModule.mapCandidate({
  id: searchSavedId,
  externalSource: 'auradin_search',
});
requireContract(
  mappedInternalUuid.externalSource === undefined &&
    mappedExternalUuid.externalSource === 'auradin_search',
  'AURADIN candidate mapping must prefer an explicit external source over UUID-shaped id heuristics.',
);
const auradinSavedProductsModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/auradinSavedProducts.ts',
  {
    '../../../shared/services/productBackendApi': {
      getProductBackendApiBaseUrl: () => 'https://products.example.com',
      requestProductBackendJson: async path => {
        auradinSaveCalls.push({kind: 'fetch', path});
        return {
          products: [
            {id: internalSavedId, productName: 'Internal product'},
            {
              productId: 'catalog-lip-1',
              externalSource: 'auradin_catalog',
              productName: 'Catalog product',
            },
            {
              productId: searchSavedId,
              externalSource: 'auradin_search',
              productName: 'Search product',
            },
            {
              productId: 'naver-product-1',
              externalSource: 'naver_shopping_search',
              productName: 'Naver product',
            },
          ],
        };
      },
    },
    '../../../shared/services/productService': {
      likeExternalProduct: async (productId, externalSource) => {
        auradinSaveCalls.push({kind: 'likeExternal', productId, externalSource});
        return true;
      },
      likeProduct: async (productId, shadeId) => {
        auradinSaveCalls.push({kind: 'likeInternal', productId, shadeId});
        return true;
      },
      unlikeProduct: async (productId, externalSource) => {
        auradinSaveCalls.push({kind: 'unlike', productId, externalSource});
        return true;
      },
    },
    './auradinSearchService': {
      mapCandidate: product => ({
        id: product.id,
        shadeId: product.shadeId ?? undefined,
        brandName: product.brandName ?? '',
        productName: product.productName ?? '',
        shadeName: product.shadeName ?? '',
        priceText: '',
        matchSummary: '',
        palette: product.palette ?? [],
        tags: product.tags ?? [],
        imageSource: {uri: product.imageUrl ?? ''},
        externalSource:
          product.externalSource === 'auradin_catalog' || product.externalSource === 'auradin_search'
            ? product.externalSource
            : uuidPattern.test(product.id)
              ? undefined
              : 'auradin_search',
      }),
    },
  },
);
const internalPersisted = await auradinSavedProductsModule.persistAuradinSave({
  id: internalSavedId,
  shadeId: 'shade-1',
});
const catalogPersisted = await auradinSavedProductsModule.persistAuradinSave({
  id: 'catalog-lip-1',
  externalSource: 'auradin_catalog',
});
const searchPersisted = await auradinSavedProductsModule.persistAuradinSave({
  id: searchSavedId,
  externalSource: 'auradin_search',
});
const searchRemoved = await auradinSavedProductsModule.removeAuradinSave(
  searchSavedId,
  'auradin_search',
);
const hydratedAuradinSaves = await auradinSavedProductsModule.fetchAuradinSavedProducts();
requireContract(
  internalPersisted === true &&
    catalogPersisted === true &&
    searchPersisted === true &&
    searchRemoved === true &&
    auradinSaveCalls.some(call => call.kind === 'likeInternal' && call.productId === internalSavedId && call.shadeId === 'shade-1') &&
    auradinSaveCalls.some(call => call.kind === 'likeExternal' && call.productId === 'catalog-lip-1' && call.externalSource === 'auradin_catalog') &&
    auradinSaveCalls.some(call => call.kind === 'likeExternal' && call.productId === searchSavedId && call.externalSource === 'auradin_search') &&
    auradinSaveCalls.some(call => call.kind === 'unlike' && call.productId === searchSavedId && call.externalSource === 'auradin_search') &&
    auradinSaveCalls.some(call => call.kind === 'fetch' && call.path === '/products/liked') &&
    hydratedAuradinSaves.length === 3 &&
    hydratedAuradinSaves.some(product => product.id === searchSavedId && product.externalSource === 'auradin_search') &&
    !hydratedAuradinSaves.some(product => product.id === 'naver-product-1'),
  'AURADIN saves must execute internal/external routes, preserve exact sources, and exclude unrelated external likes.',
);
requireContract(
  !hubContent.includes('개인화 데이터와 개인정보 설정') &&
    !hubContent.includes('actionLabel="설정하기"') &&
    !routeTypes.includes('ProductPersonalizationSettings') &&
    !recommendationRoutes.includes('ProductPersonalizationSettings') &&
    hubContent.includes('likedFallbackItems') &&
    hubContent.includes('최근 좋아요한 제품을 보여드려요.') &&
    recommendationScreen.includes('hasFocusedHubRef') &&
    recommendationScreen.includes('applyServerLikedProducts(products)') &&
    recommendationScreen.includes('getLikedProducts()') &&
    recommendationScreen.includes('likedProductsRequestRef.current !== requestId') &&
    recommendationScreen.includes('setHubRefreshKey(current => current + 1)') &&
    recommendationScreen.includes('setPreferenceMutationRefreshKey(current => current + 1)') &&
    recommendationScreen.includes('PRODUCT_PREFERENCE_REFRESH_DEBOUNCE_MS = 280') &&
    likedService.includes('getProductPreferenceMutationRevision') &&
    likedService.includes('runProductPreferenceMutation') &&
    recommendationScreen.includes('preferenceRefreshKey={hubRefreshKey + preferenceMutationRefreshKey}') &&
    recommendationScreen.includes('refreshKey={hubRefreshKey}') &&
    hubContent.includes('InteractionManager.runAfterInteractions') &&
    hubContent.includes('}, [refreshKey]);') &&
    loginScreen.includes('제품 추천 개인화를 위한 좋아요·검색·클릭 데이터 활용') &&
    loginScreen.includes('익명 컬러 취향 추천에 동의하게 됩니다.'),
  'modular shelves must load shared likes, defer secondary requests, move consent disclosure to signup, and refresh after re-entry or like changes.',
);
requireContract(
  recommendationScreen.includes('productLikeIntentVersionsRef') &&
    recommendationScreen.includes('confirmedLikedProductKeysRef') &&
    recommendationScreen.includes('applyLikedIntent(productKey, nextLiked)') &&
    recommendationScreen.includes('productLikeKey(product.productId, product.externalSource)') &&
    recommendationShelfScreen.includes('productLikeIntentVersionsRef') &&
    hubContent.includes("if (state.status === 'loading') return <RecommendationRailPlaceholder />") &&
    hubContent.includes('importantForAccessibility="no-hide-descendants"') &&
    !hubContent.includes('저장한 AR 룩과 실제 색상을 비교하고 있어요.') &&
    !hubContent.includes('요즘 주목받는 트렌드 제품을 불러오고 있어요.'),
  'like changes must keep latest intent, roll back from confirmed state, and reserve stable entry shelf space without loading copy.',
);
requireContract(
  homeFeedService.includes('HOME_PRODUCT_PREFETCH_LIMIT = 12') &&
    homeFeedService.includes('getPersonalizedRecommendations(HOME_PRODUCT_PREFETCH_LIMIT)') &&
    homeFeedService.includes('const seasonalPromise = getSeasonalRecommendations(') &&
    homeFeedService.includes('HOME_PRODUCT_PREFETCH_LIMIT,') &&
    homeFeedService.includes(".catch(() => null)"),
  'Home must warm the same twelve-product cache keys used by the product hub while rendering only its smaller rail.',
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
  routeTypes.includes('reportId?: string') &&
    routeTypes.includes('makeupRecommendationReportId?: string') &&
    recommendationScreen.includes('preferredMakeupReportId?: string | null;') &&
    recommendationRoutes.includes('sourceReportId={sourceReportId}') &&
    recommendationRoutes.includes('preferredMakeupReportId={route.params?.makeupRecommendationReportId}') &&
    !recommendationRoutes.includes('preferredMakeupReportId={sourceReportId}') &&
    !recommendationRoutes.includes('preferredMakeupReportId={route.params?.reportId}'),
  'face-analysis sourceReportId and the optional preferred makeup-report identity must remain separate.',
);
requireContract(
  legacyService.includes("__DEV__ && process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1'") &&
    !legacyService.includes('recommendations:fallback'),
  'production must not silently replace backend failures with fixture recommendations.',
);
requireContract(
  likedService.includes("body: sourceShadeId ? {sourceShadeId} : {}") &&
    !likedService.includes('purchaseUrl,') &&
    likedService.includes("throw new Error('좋아요를 저장할 서버가 연결되지 않았어요.')") &&
    likedService.includes('productPreferenceMutationQueues'),
  'likes must submit only the internal product URL identity and optional shade context.',
);
const serializedProductMutationCalls = [];
const serializedProductMutationResolvers = [];
let productServiceAuthToken = 'account-a-token';
const productServiceDevFlag = globalThis.__DEV__;
globalThis.__DEV__ = false;
const productServiceModule = executeTypeScriptModule(
  'apps/mobile/src/shared/services/productService.ts',
  {
    '../mocks/products.mock': {productsMock: []},
    './backendApi': {getBackendAuthToken: () => productServiceAuthToken},
    './productBackendApi': {
      getProductBackendApiBaseUrl: () => 'https://api.example.com',
      requestProductBackendJson: (path, options) => {
        serializedProductMutationCalls.push({path, options});
        return new Promise(resolve => {
          serializedProductMutationResolvers.push(() => resolve({liked: options.method === 'POST'}));
        });
      },
    },
  },
);
const queuedLike = productServiceModule.likeProduct('serial-product');
productServiceAuthToken = 'account-b-token';
const queuedUnlike = productServiceModule.unlikeProduct('serial-product');
await new Promise(resolve => setImmediate(resolve));
requireContract(
  serializedProductMutationCalls.length === 1 &&
    serializedProductMutationCalls[0].options.method === 'POST',
  'same-product like mutations must start in user intent order instead of racing.',
);
serializedProductMutationResolvers.shift()?.();
await new Promise(resolve => setImmediate(resolve));
requireContract(
  serializedProductMutationCalls.length === 2 &&
    serializedProductMutationCalls[1].options.method === 'DELETE' &&
    serializedProductMutationCalls[0].options.authToken === 'account-a-token' &&
    serializedProductMutationCalls[1].options.authToken === 'account-b-token',
  'same-product unlike must wait for the prior like request to settle.',
);
serializedProductMutationResolvers.shift()?.();
await Promise.all([queuedLike, queuedUnlike]);
requireContract(
  productServiceModule.getProductPreferenceMutationRevision() === 2,
  'each successful shared preference mutation must advance the cache revision exactly once.',
);
if (productServiceDevFlag === undefined) delete globalThis.__DEV__;
else globalThis.__DEV__ = productServiceDevFlag;
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
  auradinOrb.includes('const ORB_SIZE = 52;') &&
    auradinOrb.includes('AURADIN_DRAG_CLAIM_DISTANCE = 4') &&
    auradinOrb.includes('Math.hypot(gesture.dx, gesture.dy) >= AURADIN_DRAG_CLAIM_DISTANCE') &&
    auradinOrb.includes('onStartShouldSetPanResponder: () => false') &&
    !auradinOrb.includes('onLongPress') &&
    !auradinOrb.includes('delayLongPress') &&
    !auradinOrb.includes('compact?: boolean') &&
    !auradinOrb.includes('hidden?: boolean') &&
    !auradinOrb.includes('compact = false') &&
    !auradinOrb.includes('hidden = false') &&
    !recommendationScreen.includes('orbScrollState') &&
    !recommendationScreen.includes('onScrollActivityChange') &&
    auradinOrb.includes('AccessibilityInfo.isReduceMotionEnabled()') &&
    auradinOrb.includes("AccessibilityInfo.addEventListener('reduceMotionChanged'") &&
    auradinOrb.includes('Animated.loop(') &&
    auradinOrb.includes('jellyTranslateY') &&
    auradinOrb.includes('jellyScaleX') &&
    auradinOrb.includes('jellyScaleY') &&
    auradinOrb.includes('jellyRotate') &&
    (auradinOrb.match(/isInteraction: false/g) ?? []).length === 2 &&
    auradinOrb.includes('loop.stop();') &&
    auradinOrb.includes('jelly.stopAnimation();') &&
    auradinOrb.includes("height: ORB_SIZE") &&
    auradinOrb.includes("width: ORB_SIZE") &&
    auradinOrb.includes('BOTTOM_NAV_GUARD') &&
    auradinOrb.includes('AURADIN_ORB_CONTENT_CLEARANCE') &&
    auradinOrb.includes('onSideChange?.(side)') &&
    auradinOrb.includes('position.addListener(value =>') &&
    auradinOrb.includes('position.stopAnimation();') &&
    auradinOrb.includes('dragStartRef.current = {...renderedPositionRef.current}') &&
    auradinOrb.includes('if (!isActive || !motionPreferenceLoaded || reduceMotion) return;') &&
    recommendationScreen.includes('useIsFocused') &&
    (recommendationScreen.match(/isActive={isScreenFocused}/g) ?? []).length === 2 &&
    recommendationScreen.includes('horizontalPaddingLeft={spacing.screenX}') &&
    recommendationScreen.includes('horizontalPaddingRight={spacing.screenX}') &&
    appScreen.includes('horizontalPaddingLeft = horizontalPadding') &&
    appScreen.includes('horizontalPaddingRight = horizontalPadding'),
  'AURADIN orb must claim a four-point move immediately, stay 52pt, animate a non-blocking Reduce-Motion-aware jelly loop, and clean up without scroll compact/hidden states.',
);
requireContract(
  backendApi.includes("code = 'NETWORK_UNAVAILABLE'") &&
    backendApi.includes('네트워크 연결을 확인한 뒤 다시 시도해 주세요.'),
  'offline backend failures must have an explicit localized retry contract.',
);
requireContract(
  productBackendApi.includes('EXPO_PUBLIC_PRODUCT_RECOMMENDATION_API_BASE_URL') &&
    productBackendApi.includes('baseUrl: getProductBackendOverride()'),
  'product APIs must support a dedicated backend without moving login or unrelated APIs.',
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

const productBackendRequests = [];
const productBackendApiModule = executeTypeScriptModule(
  'apps/mobile/src/shared/services/productBackendApi.ts',
  {
    './backendApi': {
      getBackendApiBaseUrl: () => 'https://main.example.com/api',
      requestBackendJson: async (path, options) => {
        productBackendRequests.push({path, options});
        return {ok: true};
      },
    },
  },
);
const previousProductApiBaseUrl = process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_API_BASE_URL;
process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_API_BASE_URL = 'http://192.0.2.10:8000';
await productBackendApiModule.requestProductBackendJson('/products/features');
requireContract(
  productBackendApiModule.getProductBackendApiBaseUrl() === 'http://192.0.2.10:8000' &&
    productBackendRequests[0]?.options?.baseUrl === 'http://192.0.2.10:8000',
  'the dedicated product backend must be selected at runtime and forwarded to the shared authenticated client.',
);
if (previousProductApiBaseUrl === undefined) delete process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_API_BASE_URL;
else process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_API_BASE_URL = previousProductApiBaseUrl;

const makeupReportApiRequests = [];
const reportLook = {
  lookId: 'look-latest',
  role: 'anchor',
  title: '출근 룩',
  summary: '차분한 로즈 메이크업',
  imageUrl: null,
  palette: ['#AA6677'],
  targets: ['lip'],
};
const makeupReportOptions = [
  {
    reportId: 'older-report',
    scenarioText: '주말 약속',
    createdAt: '2026-06-01T00:00:00.000Z',
    imageStatus: 'ready',
    looks: [{...reportLook, lookId: 'look-older'}],
  },
  {
    reportId: 'latest-report',
    scenarioText: '출근',
    createdAt: '2026-07-01T00:00:00.000Z',
    imageStatus: 'ready',
    looks: [reportLook],
  },
  {
    reportId: 'incomplete-report',
    scenarioText: '미완료',
    createdAt: '2026-08-01T00:00:00.000Z',
    imageStatus: 'pending',
    looks: [],
  },
];
const makeupReportServiceModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/makeupReportProductRecommendationService.ts',
  {
    '../../../shared/services/productBackendApi': {
      requestProductBackendJson: async (path, init = {}) => {
        makeupReportApiRequests.push({method: init.method ?? 'GET', path});
        if (path === '/products/recommendations/makeup-reports') {
          return {reports: makeupReportOptions};
        }
        if (path.includes('/unsupported/refresh')) {
          const error = new Error('not found');
          error.status = 404;
          throw error;
        }
        if (path.endsWith('/refresh?lookId=look+one')) {
          return {snapshot: {status: 'pending', revision: 1}, status: 'pending'};
        }
        return {
          report: makeupReportOptions[1],
          selectedLook: reportLook,
          groups: [],
          ranking: {strategy: 'hybrid', embeddingApplied: true},
        };
      },
    },
  },
);
const orderedMakeupReports = await makeupReportServiceModule.getMakeupReportRecommendationReports();
const makeupReportDetail = await makeupReportServiceModule.getMakeupReportProductRecommendations(
  'report/id',
  'look one',
  99,
);
const pendingMakeupReportRefresh = await makeupReportServiceModule.refreshMakeupReportProductRecommendations(
  'report/id',
  'look one',
);
const fallbackMakeupReportRefresh = await makeupReportServiceModule.refreshMakeupReportProductRecommendations(
  'unsupported',
  'look one',
);
const categoryMakeupReportDetail = await makeupReportServiceModule.getMakeupReportProductRecommendations(
  'report/id',
  'look one',
  8,
  {categories: ['lip', 'shadow', 'lip']},
);
requireContract(
  makeupReportApiRequests[0].path === '/products/recommendations/makeup-reports' &&
    makeupReportApiRequests[0].method === 'GET' &&
    makeupReportApiRequests[1].path === '/products/recommendations/makeup-reports/report%2Fid?lookId=look+one&perCategoryLimit=8' &&
    makeupReportApiRequests[2].path === '/products/recommendations/makeup-reports/report%2Fid/refresh?lookId=look+one' &&
    makeupReportApiRequests[2].method === 'POST' &&
    makeupReportApiRequests[3].path === '/products/recommendations/makeup-reports/unsupported/refresh?lookId=look+one' &&
    makeupReportApiRequests[3].method === 'POST' &&
    makeupReportApiRequests[4].path === '/products/recommendations/makeup-reports/unsupported?lookId=look+one&perCategoryLimit=6' &&
    makeupReportApiRequests[4].method === 'GET' &&
    makeupReportApiRequests[5].path === '/products/recommendations/makeup-reports/report%2Fid?lookId=look+one&categories=lip%2Cshadow&perCategoryLimit=8' &&
    makeupReportApiRequests[5].method === 'GET' &&
    makeupReportServiceModule.buildMakeupReportProductsPath('report', null, 0).endsWith('perCategoryLimit=1') &&
    makeupReportServiceModule.buildMakeupReportProductsRefreshPath('report', null).endsWith('/refresh') &&
    orderedMakeupReports.map(report => report.reportId).join(',') === 'latest-report,older-report' &&
    makeupReportServiceModule.resolveMakeupReportSelection(orderedMakeupReports)?.reportId === 'latest-report' &&
    makeupReportServiceModule.resolveMakeupReportSelection(orderedMakeupReports, 'older-report', 'latest-report')?.reportId === 'older-report' &&
    makeupReportServiceModule.resolveMakeupReportSelection(orderedMakeupReports, 'missing', 'older-report')?.reportId === 'older-report' &&
    makeupReportDetail.status === 'ready' &&
    makeupReportDetail.snapshot.status === 'ready' &&
    makeupReportDetail.ranking.embeddingApplied === true &&
    pendingMakeupReportRefresh.snapshot.status === 'pending' &&
    fallbackMakeupReportRefresh.snapshot.status === 'ready' &&
    categoryMakeupReportDetail.snapshot.status === 'ready',
  'makeup-report requests must execute encoded authenticated category-scoped snapshot paths, normalize legacy responses, refresh by POST with GET fallback, sort latest first, and honor selection.',
);

const makeupReportTargetPresentationModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/makeupReportTargetPresentation.ts',
  {},
);
const shadowTargetPresentation = makeupReportTargetPresentationModule.buildMakeupReportTargetPresentation(
  'shadow',
  {
    category: 'shadow',
    colors: [
      {role: 'main', name: '로즈 브라운', hex: '#aa6677'},
      {role: 'point', name: '딥 플럼', hex: '#552244'},
    ],
    finish: 'shimmer',
    texture: 'powder',
  },
);
const linerTargetPresentation = makeupReportTargetPresentationModule.buildMakeupReportTargetPresentation(
  'liner',
  {category: 'liner', colorName: '블랙 브라운', colorHex: '#332211', texture: 'pencil'},
);
const baseTargetPresentation = makeupReportTargetPresentationModule.buildMakeupReportTargetPresentation(
  'base',
  {
    category: 'base',
    colorName: '표시하면 안 되는 베이스 색',
    colorHex: '#EFEFEF',
    finish: 'glow',
    texture: 'cream',
  },
);
requireContract(
  shadowTargetPresentation.swatches.map(item => item.hex).join(',') === '#AA6677,#552244' &&
    shadowTargetPresentation.label === '로즈 브라운 · 딥 플럼' &&
    shadowTargetPresentation.detailLabel === '쉬머 · 파우더' &&
    linerTargetPresentation.swatches.map(item => item.hex).join(',') === '#332211' &&
    linerTargetPresentation.label === '블랙 브라운' &&
    linerTargetPresentation.detailLabel === '펜슬' &&
    baseTargetPresentation.label === '피니시·제형 기준' &&
    baseTargetPresentation.detailLabel === '글로우 · 크림' &&
    baseTargetPresentation.swatches.length === 0,
  'report target presentation must keep shadow and liner palettes separate and must never invent a base shade.',
);
const reasonSnapshot = makeupReportServiceModule.normalizeMakeupReportProductRecommendations({
  snapshot: {status: 'ready'},
  groups: [{
    category: 'lip',
    label: '립',
    status: 'ready',
    target: {category: 'lip', colorName: '말린 장미', colorHex: '#AA6677'},
    items: [
      {productId: 'verified', reasonLabels: ['보고서의 추천 색상과 가까운 검증 shade예요']},
      {productId: 'broad', reasonLabels: ['말린 장미 계열의 폭넓은 대안이에요']},
    ],
  }],
});
requireContract(
  reasonSnapshot.groups[0].target.colorHex === '#AA6677' &&
    reasonSnapshot.groups[0].items[0].reasonLabels[0] === '보고서의 추천 색상과 가까운 검증 shade예요' &&
    reasonSnapshot.groups[0].items[1].reasonLabels[0] === '말린 장미 계열의 폭넓은 대안이에요',
  'snapshot normalization must preserve target evidence and exact verified-shade versus broad-family reason labels.',
);
const productLikeIdentityModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/productLikeIdentity.ts',
  {},
);
requireContract(
  productLikeIdentityModule.productLikeKey('same-id') === 'catalog:same-id' &&
    productLikeIdentityModule.productLikeKey('same-id', 'auradin_catalog') === 'auradin_catalog:same-id' &&
    productLikeIdentityModule.productLikeKey('same-id', 'naver_shopping_search') === 'naver_shopping_search:same-id' &&
    new Set([
      productLikeIdentityModule.productLikeKey('same-id'),
      productLikeIdentityModule.productLikeKey('same-id', 'auradin_catalog'),
      productLikeIdentityModule.productLikeKey('same-id', 'naver_shopping_search'),
    ]).size === 3,
  'like identity must distinguish internal and external products even when provider ids collide.',
);

requireContract(
  productHubService.includes("params.set('shade_id', shadeId)") &&
    recommendationRoutes.includes('shadeId={route.params.shadeId}') &&
    recommendationRoutes.includes('disclosureLabel: route.params.disclosureLabel'),
  'product detail navigation must preserve the recommended shade and public sponsorship disclosure.',
);
requireContract(
  makeupReportService.includes("requestProductBackendJson") &&
    makeupReportService.includes('MAX_PER_CATEGORY_LIMIT = 8') &&
    makeupReportService.includes("'/products/recommendations/makeup-reports'") &&
    makeupReportService.includes('/products/recommendations/makeup-reports/${encodeURIComponent(normalizedReportId)}') &&
    makeupReportService.includes("params.set('lookId', normalizedLookId)") &&
    makeupReportService.includes("params.set('categories', normalizedCategories.join(','))") &&
    makeupReportService.includes("'perCategoryLimit'") &&
    makeupReportService.includes("{method: 'POST', signal: options.signal}") &&
    makeupReportService.includes('isRefreshEndpointUnavailable(error)') &&
    makeupReportService.includes("status === 404 || status === 405 || status === 501") &&
    !makeupReportService.includes('__DEV__') &&
    !makeupReportService.includes('fixture') &&
    !makeupReportService.includes('mock') &&
    hubContent.includes('MakeupReportProductRecommendationShelf') &&
    !hubContent.includes('getArRecommendations') &&
    !hubContent.includes('getSavedArLookOptions') &&
    !hubContent.includes("onOpenShelf('ar'"),
  'the first hub shelf must use only the authenticated makeup-report recommendation API and must not reopen the retired AR saved-look shelf.',
);
requireContract(
  makeupReportShelf.includes('메이크업 추천 보고서 기반 추천제품') &&
    makeupReportShelf.includes('보고서 선택') &&
    makeupReportShelf.includes('preferredMakeupReportId') &&
    makeupReportShelf.includes('resolveMakeupReportSelection(') &&
    makeupReportShelf.includes('selectedLookId') &&
    makeupReportShelf.includes('보고서 기준 색상·피니시') &&
    makeupReportShelf.includes('보고서 색상 기준') &&
    makeupReportShelf.includes('이 색·피니시와 가까운 제품을 추천해요') &&
    makeupReportShelf.includes('const reportTargetGroups = useMemo') &&
    makeupReportShelf.includes('reportTargetGroups.length > 0') &&
    makeupReportShelf.includes("activeCategory === 'all'") &&
    makeupReportShelf.includes('? []') &&
    !makeupReportShelf.includes('selectLook(look.lookId)') &&
    makeupReportShelf.includes("setActiveCategory('all')") &&
    makeupReportShelf.includes('MAKEUP_REPORT_CATEGORY_TABS = PRODUCT_SHELF_CATEGORY_TABS') &&
    makeupReportShelf.includes("'base'") &&
    makeupReportShelf.includes("'shadow'") &&
    makeupReportShelf.includes("'brow'") &&
    makeupReportShelf.includes("'cheek'") &&
    makeupReportShelf.includes("'lip'") &&
    makeupReportShelf.includes("'liner'") &&
    makeupReportShelf.includes('SNAPSHOT_POLL_DELAYS_MS') &&
    makeupReportShelf.includes("data.snapshot.status === 'pending'") &&
    makeupReportShelf.includes("data.snapshot.status === 'processing'") &&
    makeupReportShelf.includes('clearTimeout(recommendationPollTimerRef.current)') &&
    makeupReportShelf.includes('recommendationAbortRef.current?.abort()') &&
    makeupReportShelf.includes("recommendations.data?.snapshot.status === 'failed'") &&
    makeupReportShelf.includes('refreshMakeupReportProductRecommendations') &&
    makeupReportShelf.includes('추천 다시 만들기') &&
    makeupReportShelf.includes('requestRefs.current.recommendations !== requestId') &&
    makeupReportShelf.includes('selectedReportIdRef.current !== reportId') &&
    makeupReportShelf.includes('selectedLookIdRef.current !== lookId') &&
    makeupReportShelf.includes('const selectionChanged = selectedReportIdRef.current !== report.reportId') &&
    makeupReportShelf.includes('if (!selectionChanged) return;') &&
    makeupReportShelf.includes('appliedPreferredReportIdRef.current !== preferredMakeupReportId') &&
    makeupReportShelf.includes('revalidateRecommendationsOnFocusRef.current') &&
    makeupReportShelf.includes('{preserveData: recommendationsRef.current.status === \'ready\'}') &&
    makeupReportShelf.includes('if (!options.preserveData) setRecommendations') &&
    makeupReportShelf.includes('if (!isActive) {') &&
    hubContent.includes('isActive={isActive}') &&
    makeupReportShelf.includes('disabled={!canOpenReportPicker}') &&
    makeupReportShelf.includes('showReason') &&
    makeupReportShelf.includes("source: 'makeup_report'") &&
    makeupReportShelf.includes("queueReportProductEvent('impression'") &&
    makeupReportShelf.includes("queueReportProductEvent('product_open'") &&
    makeupReportShelf.includes('onImpression={(product, position)') &&
    makeupReportShelf.includes('onOpenMore && selectedLookId') &&
    makeupReportShelf.includes('reportId: selectedReport.reportId') &&
    makeupReportShelf.includes('lookId: selectedLookId') &&
    makeupReportShelf.includes('category: activeCategory') &&
    makeupReportShelf.includes('title: `${selectedReport.scenarioText} 추천제품`') &&
    makeupReportShelf.includes('<MakeupReportTargetLegend') &&
    makeupReportShelf.includes('variant="compact"') &&
    !makeupReportShelf.includes('selectedLook.palette') &&
    !makeupReportShelf.includes('paletteDot') &&
    makeupReportTargetLegend.includes('buildMakeupReportTargetPresentation(category, target)') &&
    makeupReportTargetLegend.includes("variant?: 'default' | 'compact'") &&
    makeupReportTargetLegend.includes('styles.legendCompact') &&
    makeupReportTargetLegend.includes('accessible') &&
    makeupReportTargetLegend.includes('accessibilityRole="text"') &&
    makeupReportTargetPresentation.includes("label: '피니시·제형 기준'") &&
    makeupReportTargetPresentation.includes('swatches: []') &&
    productRail.includes('showReason={showReason}') &&
    productRail.includes('productLikeKey(') &&
    productRail.includes('item.externalSource') &&
    productRail.includes('token.item.externalSource') &&
    productRail.includes('scrollToOffset({animated: false, offset: 0})') &&
    makeupReportTypes.includes("'all'") &&
    makeupReportTypes.includes("| 'noEligibleProducts'") &&
    makeupReportTypes.includes('MakeupReportProductSnapshot') &&
    makeupReportTypes.includes('MakeupReportRecommendationTarget') &&
    makeupReportTypes.includes('target?: MakeupReportRecommendationTarget') &&
    !makeupReportShelf.includes('productRecommendationMock'),
  'the report shelf must select a preferred/latest report with an internal look id, hide user-facing look chips and all-category target chips, expose six filters and a context-complete more action, poll only in-flight snapshots boundedly, reject stale responses, and preserve product reasons and analytics.',
);
requireContract(
  hubContent.includes('seasonal.data.collection?.isStale') &&
    hubContent.includes("freshnessStatus === 'stale'") &&
    hubContent.includes('최근 확인된 트렌드 제품'),
  'stale seasonal sources must be disclosed instead of appearing current.',
);
requireContract(
  makeupReportShelf.includes('메이크업 추천 보고서 기반 추천제품') &&
    makeupReportShelf.includes('색상·피니시 조건으로 후보를 고른 뒤 제품 유형·질감 유사도로 정렬했어요.') &&
    hubContent.includes('title={personalizedTitle}') &&
    hubContent.includes('title="요즘 트렌드 제품"') &&
    hubContent.includes('title={cohortTitle}') &&
    hubContent.includes('function Section') &&
    !hubContent.includes('<LegacyRecommendationRail') &&
    makeupReportShelf.includes('<ProductRail') &&
    hubContent.includes('<ProductRail') &&
    hubContent.includes('requestRefs.current.seasonal === requestId') &&
    hubContent.includes('getSeasonalRecommendations(refreshKey, 12, undefined, regionCode)'),
  'hub must expose the report, personalized, seasonal, and cohort shopping shelves with horizontal product rails and stale-response protection.',
);
const nationwideSeasonalLoadStart = hubContent.indexOf(
  'void loadSeasonal(DEFAULT_TREND_REGION_CODE).then(() => {',
);
const nationwideSeasonalLocationResolve = hubContent.indexOf(
  'void resolveTrendRegionCode().then(regionCode => {',
  nationwideSeasonalLoadStart,
);
const firstHubLocationResolution = hubContent.indexOf('resolveTrendRegionCode()');
const nationwideSeasonalSequence = nationwideSeasonalLoadStart >= 0
  && nationwideSeasonalLocationResolve > nationwideSeasonalLoadStart
  ? hubContent.slice(nationwideSeasonalLoadStart, nationwideSeasonalLocationResolve)
  : '';
requireContract(
  nationwideSeasonalLoadStart >= 0 &&
    nationwideSeasonalLocationResolve > nationwideSeasonalLoadStart &&
    firstHubLocationResolution === nationwideSeasonalLocationResolve + 'void '.length &&
    nationwideSeasonalSequence.includes('InteractionManager.runAfterInteractions(() => {') &&
    !nationwideSeasonalSequence.includes('Promise.all(['),
  'the hub must complete and paint the nationwide seasonal request before resolving location or requesting permission.',
);
requireContract(
  !recommendationScreen.includes('얼굴 분석 기준 전체 추천') &&
    !recommendationScreen.includes('handleExpandLegacyRecommendations') &&
    !recommendationScreen.includes('getProductRecommendations') &&
    !recommendationScreen.includes('LegacyRecommendationRail'),
  'the shopping hub must not render the retired face-analysis full-recommendation section.',
);
requireContract(
  routeTypes.includes('ProductRecommendationShelf:') &&
    routeTypes.includes("shelf: 'makeupReport';") &&
    routeTypes.includes('makeupReportId: string;') &&
    routeTypes.includes('makeupLookId: string;') &&
    routeTypes.includes('initialCategory?: ProductRecommendationCategory;') &&
    rootNavigator.includes('name="ProductRecommendationShelf"') &&
    recommendationRoutes.includes("navigation.navigate('ProductRecommendationShelf'") &&
    recommendationRoutes.includes('onOpenMakeupReportShelf={context =>') &&
    recommendationRoutes.includes("shelf: 'makeupReport'") &&
    recommendationRoutes.includes('makeupReportId: context.reportId') &&
    recommendationRoutes.includes('makeupLookId: context.lookId') &&
    recommendationRoutes.includes('initialCategory: context.category') &&
    recommendationRoutes.includes('makeupReportId={reportParams?.makeupReportId}') &&
    recommendationRoutes.includes('makeupLookId={reportParams?.makeupLookId}') &&
    recommendationScreen.includes('onOpenMakeupReportShelf={props.onOpenMakeupReportShelf}') &&
    hubContent.includes('onOpenMore={onOpenMakeupReportShelf}') &&
    !hubContent.includes("onOpenShelf('ar'") &&
    hubContent.includes("onOpenShelf('personalized'") &&
    hubContent.includes("onOpenShelf('seasonal'") &&
    hubContent.includes("onOpenShelf('cohort'") &&
    !hubContent.includes('CatalogShelfModal') &&
    recommendationShelfScreen.includes('PRODUCT_SHELF_CATEGORY_TABS') &&
    recommendationShelfScreen.includes('numColumns={2}') &&
    recommendationShelfScreen.includes('showReason'),
  'all shelf more actions, including the report and look scoped action, must open the existing dedicated category page.',
);
requireContract(
  recommendationShelfScreen.includes("shelf === 'makeupReport'") &&
    recommendationShelfScreen.includes('getMakeupReportProductRecommendations(') &&
    recommendationShelfScreen.includes('{categories: requestedCategory ? [requestedCategory] : undefined}') &&
    recommendationShelfScreen.includes('8,') &&
    recommendationShelfScreen.includes('makeupReportGroups: groups') &&
    recommendationShelfScreen.includes('<MakeupReportTargetLegend') &&
    recommendationShelfScreen.includes("activeCategory !== 'all' && group.category === activeCategory") &&
    recommendationShelfScreen.includes('requestIdsRef.current.get(category) === requestId') &&
    recommendationShelfScreen.includes('requestIdsRef.current.get(category) !== requestId') &&
    !recommendationShelfScreen.includes('refreshMakeupReportProductRecommendations') &&
    recommendationShelfScreen.includes('likeExternalProduct(product.productId, product.externalSource)') &&
    recommendationShelfScreen.includes('unlikeProduct(product.productId, product.externalSource)') &&
    recommendationShelfScreen.includes('Linking.openURL(product.purchaseUrl)') &&
    recommendationShelfScreen.includes('productLikeKey(item.productId, item.externalSource)') &&
    productLikeIdentity.includes("externalSource?.trim() || 'catalog'") &&
    recommendationProductCard.includes("accessibilityHint={product.externalSource ? '외부 판매처 페이지를 엽니다'") &&
    recommendationProductCard.includes('flexShrink: 1') &&
    recommendationProductCard.includes('product.reasonLabels[0]'),
  'the report more grid must GET only the selected stored snapshot with an eight-item category limit, reject stale responses, retain source-qualified likes, accessible target legends, external sellers, and exact server reason labels without horizontal overflow.',
);
requireContract(
  hubContent.includes("setSeasonal(current => current.data ? current : {status: 'loading'})") &&
    hubContent.includes('setPersonalized(current => current.data ? current : initialSectionLoad(cached))') &&
    hubContent.includes('setCohort(current => current.data ? current : initialSectionLoad(cached))') &&
    hubContent.includes('getCachedTrendRegionCode()') &&
    hubContent.includes('peekPersonalizedRecommendations()') &&
    hubContent.includes('peekCohortRecommendations()') &&
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
  recommendationShelfScreen.includes('tabScroller: {backgroundColor: colors.background, flexGrow: 0, height: 44, zIndex: 1}') &&
    recommendationShelfScreen.includes('content: {flexGrow: 1, gap: spacing.xl, paddingHorizontal: spacing.screenX, paddingTop: spacing.sm}') &&
    recommendationShelfScreen.includes('initialNumToRender={6}') &&
    recommendationShelfScreen.includes('windowSize={5}') &&
    makeupReportShelf.includes("chipActive: {backgroundColor: colors.black, borderRadius: radius.pill, justifyContent: 'center', minHeight: 44"),
  'category controls must stay above the lazily rendered grid with a 44pt target and explicit content clearance.',
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
    recommendationShelfScreen.includes('getSeasonalRecommendations(undefined, 60, requestedCategory, regionCode)') &&
    recommendationShelfScreen.includes('getPersonalizedRecommendations(60, requestedCategory)') &&
    recommendationShelfScreen.includes('getCohortRecommendations(60, requestedCategory)') &&
    recommendationShelfScreen.includes('onPress={() => selectCategory(tab.id)}') &&
    !recommendationShelfScreen.includes('shelfSelection.usesAllItemsFallback'),
  'dedicated shelf tabs must request category-ranked products from the server instead of substituting another category.',
);
const regionalShelfRefreshStart = recommendationShelfScreen.indexOf(
  'void resolveTrendRegionCode().then(regionCode => {',
);
const regionalShelfRefreshEnd = recommendationShelfScreen.indexOf(
  '}, [categoryStates.all, loadCategory, shelf]);',
  regionalShelfRefreshStart,
);
const regionalShelfRefresh = regionalShelfRefreshStart >= 0 && regionalShelfRefreshEnd > regionalShelfRefreshStart
  ? recommendationShelfScreen.slice(regionalShelfRefreshStart, regionalShelfRefreshEnd)
  : '';
requireContract(
  recommendationShelfScreen.includes('preserveExisting = false') &&
    recommendationShelfScreen.includes('if (!preserveExisting || !existing?.data)') &&
    recommendationShelfScreen.includes('if (preserveExisting && categoryStatesRef.current[category]?.data) return;') &&
    recommendationShelfScreen.includes('activeCategoryRef.current = category') &&
    regionalShelfRefresh.includes('seasonalRegionCodeRef.current = regionCode') &&
    regionalShelfRefresh.includes('loadCategory(activeCategoryRef.current, regionCode, true)') &&
    !regionalShelfRefresh.includes("setActiveCategory('all')") &&
    !regionalShelfRefresh.includes('setCategoryStates({})'),
  'regional shelf refreshes must preserve nationwide data and the active category, including when the regional request fails.',
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
    }, '서진') === '서진님과 비슷한 분들이 많이 좋아해요' &&
    presentationModule.cohortSizeEvidenceCopy('5+') === '비슷한 취향 사용자 5명 이상의 좋아요를 반영했어요.' &&
    recommendationShelfScreen.includes('나와 퍼스널컬러·제품 취향이 비슷한 사용자들이 좋아한 상품이에요.') &&
    !recommendationShelfScreen.includes('익명 집계 모수') &&
    !hubContent.includes('익명 집계 모수'),
  'recommendation headings must describe popular, report-tone, and privacy-thresholded cohort evidence honestly.',
);

requireContract(
  appHeader.includes('fontFamily: typography.fontFamily.bold') &&
    detailHeaderChrome.includes('fontFamily: typography.fontFamily.bold') &&
    likedScreen.includes('fontFamily: typography.fontFamily.medium') &&
    likedScreen.includes('fontFamily: typography.fontFamily.semibold') &&
    recommendationProductCard.includes('fontFamily: typography.fontFamily.bold') &&
    productSearchBar.includes('fontFamily: typography.fontFamily.bold') &&
    recommendationSectionState.includes('fontFamily: typography.fontFamily.bold'),
  'recommendation chrome, cards, search, and liked-product copy must use the shared Pretendard family tokens.',
);
requireContract(
  authSessionContext.includes('clearProductHubRecommendationCache()') &&
    authSessionContext.includes('[session?.user.id]') &&
    productHubService.includes('clearProductHubRecommendationCache') &&
    productHubService.includes('invalidatePreferenceRecommendationCache'),
  'in-memory recommendation caches must be cleared across account changes and logout.',
);

const nativeTrendRegionStorage = [];
let nativeTrendRegionCachedValue = null;
const trendRegionModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/trendRegionService.ts',
  {
    '@react-native-async-storage/async-storage': {
      __esModule: true,
      default: {
        getItem: async () => nativeTrendRegionCachedValue,
        setItem: async (_key, value) => {
          nativeTrendRegionCachedValue = value;
          nativeTrendRegionStorage.push(value);
        },
      },
    },
    'expo-location': {
      Accuracy: {Low: 1},
      getForegroundPermissionsAsync: async () => ({status: 'denied', canAskAgain: false}),
      requestForegroundPermissionsAsync: async () => ({status: 'denied', canAskAgain: false}),
      getLastKnownPositionAsync: async () => null,
      getCurrentPositionAsync: async () => ({coords: {latitude: 0, longitude: 0}}),
      reverseGeocodeAsync: async () => [],
    },
  },
);
nativeTrendRegionCachedValue = JSON.stringify({regionCode: 'KR-26', resolvedAt: Date.now()});
requireContract(
  await trendRegionModule.getCachedTrendRegionCode() === 'KR-26',
  'the hub must be able to synchronously reuse a fresh coarse region cache before its first seasonal request.',
);
nativeTrendRegionCachedValue = null;
const trendNow = Date.UTC(2026, 6, 16, 12, 0, 0);
const trendRegionFixtures = [
  {code: 'KR-11', korean: '서울특별시', english: 'Seoul'},
  {code: 'KR-26', korean: '부산광역시', english: 'Busan'},
  {code: 'KR-27', korean: '대구광역시', english: 'Daegu'},
  {code: 'KR-28', korean: '인천광역시', english: 'Incheon'},
  {code: 'KR-29', korean: '광주광역시', english: 'Gwangju'},
  {code: 'KR-30', korean: '대전광역시', english: 'Daejeon'},
  {code: 'KR-31', korean: '울산광역시', english: 'Ulsan'},
  {code: 'KR-41', korean: '경기도', english: 'Gyeonggi-do'},
  {code: 'KR-42', korean: '강원특별자치도', english: 'Gangwon-do'},
  {code: 'KR-43', korean: '충청북도', english: 'Chungcheongbuk-do'},
  {code: 'KR-44', korean: '충청남도', english: 'Chungcheongnam-do'},
  {code: 'KR-45', korean: '전북특별자치도', english: 'Jeollabuk-do'},
  {code: 'KR-46', korean: '전라남도', english: 'Jeollanam-do'},
  {code: 'KR-47', korean: '경상북도', english: 'Gyeongsangbuk-do'},
  {code: 'KR-48', korean: '경상남도', english: 'Gyeongsangnam-do'},
  {code: 'KR-49', korean: '제주특별자치도', english: 'Jeju-do'},
  {code: 'KR-50', korean: '세종특별자치시', english: 'Sejong'},
];
const allTrendRegionCodes = ['KR-00', ...trendRegionFixtures.map(({code}) => code)];
requireContract(
  trendRegionFixtures.length === 17 &&
    new Set(allTrendRegionCodes).size === 18 &&
    allTrendRegionCodes.every(code => trendRegionModule.normalizeTrendRegionCode(code.toLowerCase()) === code) &&
    trendRegionFixtures.every(({code, korean, english}) =>
      trendRegionModule.mapAddressToTrendRegionCode({isoCountryCode: 'KR', region: korean}) === code &&
      trendRegionModule.mapAddressToTrendRegionCode({isoCountryCode: 'KR', region: english}) === code) &&
    trendRegionModule.mapAddressToTrendRegionCode(null) === 'KR-00' &&
    trendRegionModule.mapAddressToTrendRegionCode({isoCountryCode: 'US', region: 'Seoul'}) === 'KR-00',
  'device geocoding must map KR-00 and all 17 Korean administrative areas and aliases to the exact ISO region-code contract.',
);
const storedTrendRegionValues = [];
const resolvedTrendRegion = await trendRegionModule.resolveTrendRegionCodeWith({
  now: () => trendNow,
  loadCache: async () => null,
  saveCache: async value => {
    storedTrendRegionValues.push(value);
  },
  getPermission: async () => ({status: 'granted'}),
  requestPermission: async () => ({status: 'granted'}),
  getLastKnownCoordinates: async () => ({latitude: 37.5665, longitude: 126.978}),
  getCurrentCoordinates: async () => {
    throw new Error('last-known location should be preferred');
  },
  reverseGeocode: async () => [{isoCountryCode: 'KR', region: '서울특별시'}],
});
const persistedTrendRegion = storedTrendRegionValues[0] ?? '';
requireContract(
  resolvedTrendRegion === 'KR-11' &&
    trendRegionModule.readCachedTrendRegionCode(persistedTrendRegion, trendNow + 1000) === 'KR-11' &&
    trendRegionModule.readCachedTrendRegionCode(
      persistedTrendRegion,
      trendNow + trendRegionModule.TREND_REGION_CACHE_TTL_MS,
    ) === null &&
    persistedTrendRegion.includes('"regionCode":"KR-11"') &&
    !persistedTrendRegion.includes('latitude') &&
    !persistedTrendRegion.includes('longitude') &&
    !persistedTrendRegion.includes('37.5665') &&
    !persistedTrendRegion.includes('126.978') &&
    trendRegionService.includes('saveCache(JSON.stringify({regionCode, resolvedAt: dependencies.now()}))'),
  'region resolution must cache only a coarse code for six hours and must never persist coordinates.',
);
let deniedLocationCalls = 0;
const deniedTrendRegion = await trendRegionModule.resolveTrendRegionCodeWith({
  now: () => trendNow,
  loadCache: async () => null,
  saveCache: async () => undefined,
  getPermission: async () => ({status: 'denied', canAskAgain: false}),
  requestPermission: async () => {
    throw new Error('permission must not be requested again');
  },
  getLastKnownCoordinates: async () => {
    deniedLocationCalls += 1;
    return null;
  },
  getCurrentCoordinates: async () => {
    deniedLocationCalls += 1;
    return {latitude: 0, longitude: 0};
  },
  reverseGeocode: async () => {
    deniedLocationCalls += 1;
    return [];
  },
});
requireContract(
  deniedTrendRegion === 'KR-00' && deniedLocationCalls === 0,
  'denied location permission must fail open to nationwide recommendations without reading coordinates.',
);

const productHubApiRequests = [];
let productPreferenceMutationRevision = 0;
const productHubServiceModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/productHubService.ts',
  {
    '../../../shared/services/productBackendApi': {
      getProductBackendApiBaseUrl: () => 'https://api.example.com',
      requestProductBackendJson: async (path) => {
        productHubApiRequests.push(path);
        if (path.includes('/recommendations/ar?')) return {status: 'ready', groups: []};
        if (path.includes('/recommendations/seasonal?')) return {status: 'ready', collection: null, items: []};
        return {status: 'ready', items: []};
      },
    },
    '../../../shared/services/productService': {
      getProductPreferenceMutationRevision: () => productPreferenceMutationRevision,
    },
    './trendRegionService': {
      DEFAULT_TREND_REGION_CODE: 'KR-00',
      normalizeTrendRegionCode: value => value || 'KR-00',
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
await productHubServiceModule.getSeasonalRecommendations(undefined, 60, 'base', 'KR-00');
await productHubServiceModule.getSeasonalRecommendations(1, 60, 'base', 'KR-00');
await productHubServiceModule.getSeasonalRecommendations(2, 60, 'base', 'KR-11');
await productHubServiceModule.getPersonalizedRecommendations(60, 'brow');
await productHubServiceModule.getCohortRecommendations(60, 'shadow');
const repeatedSeasonalRequests = productHubApiRequests.filter(
  path => path.includes('/recommendations/seasonal?') && path.includes('category=base') && path.includes('regionCode=KR-00'),
);
const regionalSeasonalRequests = productHubApiRequests.filter(
  path => path.includes('/recommendations/seasonal?') && path.includes('category=base') && path.includes('regionCode=KR-11'),
);
requireContract(
  productHubApiRequests.some(path => path.includes('/recommendations/ar?') && path.includes('regions=lip') && path.includes('per_region_limit=20')) &&
    productHubApiRequests.some(path => path.includes('/recommendations/seasonal?') && path.includes('limit=60') && path.includes('category=base')) &&
    productHubApiRequests.some(path => path.includes('/recommendations/personalized?') && path.includes('limit=60') && path.includes('category=brow')) &&
    productHubApiRequests.some(path => path.includes('/recommendations/cohort?') && path.includes('limit=60') && path.includes('category=shadow')) &&
    repeatedSeasonalRequests.length === 1 &&
    regionalSeasonalRequests.length === 1 &&
    !regionalSeasonalRequests[0].includes('latitude=') &&
    !regionalSeasonalRequests[0].includes('longitude=') &&
    !repeatedSeasonalRequests[0].includes('entry='),
  'more shelves must execute category/region-scoped requests, isolate region cache keys, and never send coordinates.',
);
productHubServiceModule.clearProductHubRecommendationCache();
await Promise.all([
  productHubServiceModule.getArRecommendations('cache-style', 4, 'lip'),
  productHubServiceModule.getArRecommendations('cache-style', 4, 'lip'),
]);
await Promise.all([
  productHubServiceModule.getPersonalizedRecommendations(7, 'lip'),
  productHubServiceModule.getPersonalizedRecommendations(7, 'lip'),
]);
await Promise.all([
  productHubServiceModule.getCohortRecommendations(7, 'lip'),
  productHubServiceModule.getCohortRecommendations(7, 'lip'),
]);
const cacheArRequests = productHubApiRequests.filter(
  path => path.includes('/recommendations/ar?') && path.includes('style_id=cache-style') && path.includes('per_region_limit=4'),
);
const cachePersonalizedRequests = productHubApiRequests.filter(
  path => path.includes('/recommendations/personalized?') && path.includes('limit=7') && path.includes('category=lip'),
);
const cacheCohortRequests = productHubApiRequests.filter(
  path => path.includes('/recommendations/cohort?') && path.includes('limit=7') && path.includes('category=lip'),
);
requireContract(
  cacheArRequests.length === 1 &&
    cachePersonalizedRequests.length === 1 &&
    cacheCohortRequests.length === 1 &&
    productHubServiceModule.peekArRecommendations('cache-style', 4, 'lip')?.status === 'ready' &&
    productHubServiceModule.peekPersonalizedRecommendations(7, 'lip')?.status === 'ready' &&
    productHubServiceModule.peekCohortRecommendations(7, 'lip')?.status === 'ready',
  'AR, personalized, and cohort recommendation requests must deduplicate pending work and expose cached data for instant paint.',
);
productPreferenceMutationRevision += 1;
requireContract(
  productHubServiceModule.peekArRecommendations('cache-style', 4, 'lip')?.status === 'ready' &&
    productHubServiceModule.peekPersonalizedRecommendations(7, 'lip') === null &&
    productHubServiceModule.peekCohortRecommendations(7, 'lip') === null,
  'a shared product preference mutation must invalidate personalized and cohort data without forcing AR or seasonal reloads.',
);
await productHubServiceModule.getPersonalizedRecommendations(7, 'lip');
requireContract(
  productHubApiRequests.filter(
    path => path.includes('/recommendations/personalized?') && path.includes('limit=7') && path.includes('category=lip'),
  ).length === 2,
  'the next personalized request after a like mutation must bypass the invalidated cache.',
);
const seasonalRaceCalls = [];
const seasonalRaceResolvers = [];
const seasonalRaceModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/productHubService.ts',
  {
    '../../../shared/services/productBackendApi': {
      getProductBackendApiBaseUrl: () => 'https://api.example.com',
      requestProductBackendJson: path => {
        seasonalRaceCalls.push(path);
        return new Promise(resolve => seasonalRaceResolvers.push(resolve));
      },
    },
    '../../../shared/services/productService': {
      getProductPreferenceMutationRevision: () => 0,
    },
    './trendRegionService': {
      DEFAULT_TREND_REGION_CODE: 'KR-00',
      normalizeTrendRegionCode: value => value || 'KR-00',
    },
  },
);
const oldAccountSeasonal = seasonalRaceModule.getSeasonalRecommendations(undefined, 12, undefined, 'KR-00');
await new Promise(resolve => setImmediate(resolve));
seasonalRaceModule.clearProductHubRecommendationCache();
const newAccountSeasonal = seasonalRaceModule.getSeasonalRecommendations(undefined, 12, undefined, 'KR-00');
await new Promise(resolve => setImmediate(resolve));
seasonalRaceResolvers.shift()?.({
  status: 'ready',
  collection: null,
  items: [{...fallbackProduct, productId: 'old-account-product', viewerState: {liked: true}}],
});
await oldAccountSeasonal;
const whileNewAccountPending = seasonalRaceModule.getSeasonalRecommendations(undefined, 12, undefined, 'KR-00');
await new Promise(resolve => setImmediate(resolve));
requireContract(
  seasonalRaceCalls.length === 2,
  'an old-account seasonal completion must neither refill cache nor delete the new account pending request.',
);
seasonalRaceResolvers.shift()?.({
  status: 'ready',
  collection: null,
  items: [{...fallbackProduct, productId: 'new-account-product', viewerState: {liked: false}}],
});
const [, newSeasonal] = await Promise.all([whileNewAccountPending, newAccountSeasonal]);
const cachedNewSeasonal = await seasonalRaceModule.getSeasonalRecommendations(undefined, 12, undefined, 'KR-00');
requireContract(
  seasonalRaceCalls.length === 2 &&
    newSeasonal.items[0]?.productId === 'new-account-product' &&
    cachedNewSeasonal.items[0]?.productId === 'new-account-product',
  'only the current account generation may populate the seasonal response cache.',
);
const productHubFallbackModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/productHubService.ts',
  {
    '../../../shared/services/productBackendApi': {
      getProductBackendApiBaseUrl: () => 'http://127.0.0.1:8000',
      requestProductBackendJson: async path => {
        if (path.includes('/recommendations/seasonal?')) {
          return {status: 'ready', collection: null, items: [fallbackProduct]};
        }
        throw {code: 'DATABASE_NOT_CONFIGURED'};
      },
    },
    '../../../shared/services/productService': {
      getProductPreferenceMutationRevision: () => 0,
    },
    './trendRegionService': {
      DEFAULT_TREND_REGION_CODE: 'KR-00',
      normalizeTrendRegionCode: value => value || 'KR-00',
    },
  },
);
const fallbackArRecommendation = await productHubFallbackModule.getArRecommendations(undefined, 6, 'lip');
const fallbackPersonalizedRecommendation = await productHubFallbackModule.getPersonalizedRecommendations(12, 'lip');
requireContract(
  fallbackArRecommendation.status === 'ready' &&
    fallbackArRecommendation.groups[0]?.items[0]?.reasonCodes?.includes('POPULAR_FALLBACK') &&
    fallbackPersonalizedRecommendation.status === 'ready' &&
    fallbackPersonalizedRecommendation.items[0]?.productId === 'fallback-product',
  'database-unavailable AR and personalized shelves must keep rendering real seasonal products instead of an error state.',
);
const legacyRecommendationModule = executeTypeScriptModule(
  'apps/mobile/src/features/recommendation/services/productRecommendationService.ts',
  {
    '../../../shared/services/productBackendApi': {
      getProductBackendApiBaseUrl: () => 'https://api.example.com',
      requestProductBackendJson: async () => ({
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
    auradinScreen.includes('fetchAuradinSavedProducts()') &&
    auradinScreen.includes('setSaved(products)') &&
    auradinScreen.includes('setLikedProductKeys(new Set(products.map(savedProductKey)))') &&
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
    '../../../shared/services/productBackendApi': {
      getProductBackendApiBaseUrl: () => 'http://127.0.0.1:8000/api',
      requestProductBackendJson: async (path, options) => {
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
