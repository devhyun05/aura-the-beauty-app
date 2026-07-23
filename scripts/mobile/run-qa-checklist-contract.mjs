import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');

function source(path) {
  const absolutePath = join(repositoryRoot, path);
  if (!existsSync(absolutePath)) {
    throw new Error('required file is missing: ' + path);
  }
  return readFileSync(absolutePath, 'utf8').replace(/\r\n?/g, '\n');
}

function requireContract(condition, message) {
  if (!condition) throw new Error(message);
}

function requireAll(text, contracts, label) {
  for (const contract of contracts) {
    const found = contract instanceof RegExp ? contract.test(text) : text.includes(contract);
    requireContract(found, label + ': missing ' + String(contract));
  }
}

function requireNone(text, contracts, label) {
  for (const contract of contracts) {
    const found = contract instanceof RegExp ? contract.test(text) : text.includes(contract);
    requireContract(!found, label + ': forbidden ' + String(contract));
  }
}

const paths = {
  auradinVisual: 'apps/mobile/src/features/recommendation/services/auradinQuestionVisual.ts',
  auradinQuestion: 'apps/mobile/src/features/recommendation/screens/views/QuestionView.tsx',
  auradinTile: 'apps/mobile/src/features/recommendation/components/ds/SwatchTile.tsx',
  backendApi: 'apps/mobile/src/shared/services/backendApi.ts',
  authContext: 'apps/mobile/src/features/auth/services/authSessionContext.tsx',
  authService: 'apps/mobile/src/features/auth/services/authService.ts',
  authRefreshPolicy:
    'apps/mobile/src/features/auth/services/authRefreshPolicy.ts',
  faceService: 'apps/mobile/src/shared/services/faceAnalysisService.ts',
  recommendationService:
    'apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationService.ts',
  extractionService:
    'apps/mobile/src/features/reference-makeup-extraction/services/makeupExtractionService.ts',
  extractionRoutes: 'apps/mobile/src/app/navigation/routes/referenceMakeupExtractionRoutes.tsx',
  extractionLoading:
    'apps/mobile/src/features/reference-makeup-extraction/screens/ReferenceMakeupExtractionLoadingScreen.tsx',
  optionalViewShot: 'apps/mobile/src/shared/ui/OptionalViewShot.tsx',
  faceReportScaffold: 'apps/mobile/src/features/face-report/ReportScreenScaffold.tsx',
  faceReportPreview:
    'apps/mobile/src/features/face-report/screens/FaceAnalysisReportPreviewScreen.tsx',
  faceReportShare: 'apps/mobile/src/features/face-report/services/reportImageShare.ts',
  faceReportReadiness:
    'apps/mobile/src/features/face-report/services/reportCaptureReadiness.ts',
  faceReportPhotoSlot: 'apps/mobile/src/features/face-report/visuals/PhotoSlot.tsx',
  recommendationResult:
    'apps/mobile/src/features/makeup-recommendation/screens/RecommendationResultsFinalScreen.tsx',
  finalAreaGuide:
    'apps/mobile/src/features/makeup-recommendation/components/result/FinalAreaGuideSection.tsx',
  extractionResult:
    'apps/mobile/src/features/reference-makeup-extraction/screens/ReferenceMakeupExtractionResultScreen.tsx',
  feedbackHome:
    'apps/mobile/src/features/makeup-feedback/redesign/MakeupFeedbackRedesignHomeScreen.tsx',
  feedbackEvidence:
    'apps/mobile/src/features/makeup-feedback/redesign/FeedbackEvidenceImage.tsx',
  feedbackResult: 'apps/mobile/src/features/makeup-feedback/screens/MakeupFeedbackResultScreen.tsx',
  faceLoading: 'apps/mobile/src/features/face-analysis/screens/FaceAnalysisLoadingScreen.tsx',
  faceReportsList:
    'apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportsListScreen.tsx',
  faceRoutes: 'apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx',
  situationCatalog:
    'apps/mobile/src/features/makeup-recommendation/data/makeupRecommendationV2Catalog.ts',
  customComposer:
    'apps/mobile/src/features/makeup-recommendation/components/CustomSituationComposer.tsx',
  customValidation:
    'apps/mobile/src/features/makeup-recommendation/services/makeupRecommendationCustomSituationValidation.ts',
  backendCustom: 'services/backend/app/services/makeup_recommendation_custom_situation.py',
  backendPrompt: 'services/backend/app/services/makeup_recommendation_prompt.py',
  backendSchema: 'services/backend/app/services/makeup_recommendation_schema.py',
  backendTrends: 'services/backend/app/services/makeup_trends.py',
};

const tests = [
  ['1. AURADIN semantic question visuals', () => {
    const visual = source(paths.auradinVisual);
    const question = source(paths.auradinQuestion);
    const tile = source(paths.auradinTile);
    const visualRoot = join(
      repositoryRoot,
      'apps/mobile/src/features/recommendation/assets/question-visuals-v2',
    );
    const visualGroups = {
      categories: ['lip', 'cheek', 'shadow', 'base', 'brow', 'liner'],
      finish: ['glossy', 'matte', 'velvet', 'satin', 'sheer', 'shimmer'],
      texture: ['tint', 'balm', 'gloss', 'cream', 'powder', 'liquid', 'palette'],
    };

    for (const [directoryName, expectedNames] of Object.entries(visualGroups)) {
      const directory = join(visualRoot, directoryName);
      requireContract(
        existsSync(directory),
        'AURADIN v2 visual directory is missing: ' + directoryName,
      );
      const jpegNames = readdirSync(directory)
        .filter(name => extname(name).toLowerCase() === '.jpg')
        .sort();
      requireContract(
        jpegNames.length === expectedNames.length,
        'AURADIN v2 ' +
          directoryName +
          ' expected ' +
          expectedNames.length +
          ' JPEGs, found ' +
          jpegNames.length,
      );

      for (const name of expectedNames) {
        const imagePath = join(directory, name + '.jpg');
        requireContract(
          existsSync(imagePath),
          'AURADIN v2 image is missing: ' + directoryName + '/' + name + '.jpg',
        );
        requireContract(
          statSync(imagePath).size > 20_000,
          'AURADIN v2 image is too small: ' + directoryName + '/' + name + '.jpg',
        );
        requireContract(
          visual.includes(
            "require('../assets/question-visuals-v2/" +
              directoryName +
              '/' +
              name +
              ".jpg')",
          ),
          'AURADIN v2 image is not registered: ' + directoryName + '/' + name,
        );
      }
    }

    requireAll(visual, [
      'CATEGORY_IMAGES',
      'FINISH_IMAGES',
      'TEXTURE_IMAGES',
      'resolveAuradinQuestionVisual',
      "kind: 'application'",
      'const source = FINISH_IMAGES[value]',
      'const source = TEXTURE_IMAGES[value]',
      'if (source)',
      "return descriptorVisual('finish'",
      "return descriptorVisual('texture'",
      'const PRICE_TIERS = new Set<string>',
      "return PRICE_TIERS.has(value) ? {kind: 'price'}",
    ], 'AURADIN semantic visual resolver');
    requireNone(visual, [
      'FINISH_DESCRIPTIONS',
      'TEXTURE_DESCRIPTIONS',
      'FINISH_APPLICATION_IMAGES',
      'TEXTURE_APPLICATION_IMAGES',
      'contextCategory',
      'PRICE_LEVEL',
      'question-effects',
      'if (category && source)',
      'Math.random',
    ], 'AURADIN universal visual resolver');
    requireAll(question, [
      'resolveAuradinQuestionVisual(option, {attribute})',
      "const isPriceQuestion = attribute === 'priceTier'",
      'getTileColumnCount',
      'optionCount === 3',
      'const tileColumnCount = isPriceQuestion ? 1 : getTileColumnCount(tiles.length)',
      'MAX_TILE_GRID_WIDTH = 386',
      '(gridWidth - tileGap * (tileColumnCount - 1)) / tileColumnCount',
      "justifyContent: 'center'",
      'style={{width: tileWidth}}',
      "flexDirection: isPriceQuestion ? 'column' : 'row'",
      ': 160;',
    ], 'AURADIN question layout');
    const swatchTileStart = question.indexOf('<SwatchTile');
    const swatchTileEnd = question.indexOf('/>', swatchTileStart);
    const swatchTileProps = question.slice(swatchTileStart, swatchTileEnd);
    requireContract(
      swatchTileStart >= 0 && swatchTileEnd > swatchTileStart,
      'AURADIN SwatchTile props must be present',
    );
    requireNone(swatchTileProps, ['flexGrow', 'flexBasis'], 'AURADIN equal-width tile props');
    requireNone(question, [
      "style={isPriceQuestion ? {width: '100%'}",
      "flexGrow: 1, flexBasis: '40%'",
      'tiles.length > 4',
      'Math.random',
    ], 'AURADIN fixed-column layout');

    requireAll(tile, [
      'source={imageVisual.source}',
      'resizeMode="contain"',
      'application:${imageVisual.attribute}:${imageVisual.value}',
      "backgroundColor: '#FFFDFD'",
      'borderTopWidth: 1',
    ], 'AURADIN contained image and footer');
    const semanticImageIndex = tile.indexOf('source={imageVisual.source}');
    const footerIndex = tile.indexOf("backgroundColor: '#FFFDFD'", semanticImageIndex);
    const footerLabelIndex = tile.indexOf('{label}', footerIndex);
    requireContract(
      semanticImageIndex >= 0 && footerIndex > semanticImageIndex && footerLabelIndex > footerIndex,
      'AURADIN image label must render in a separate opaque footer',
    );
    requireNone(tile, [
      'SHOP AT',
      'WON',
      'resizeMode="cover"',
      'edgeGlare',
      'textShadow',
      'TextureSwatch',
    ], 'AURADIN semantic image presentation');
  }],

  ['2. auth refresh and real-backend fail-closed analysis', () => {
    const api = source(paths.backendApi);
    const auth = source(paths.authContext);
    const authService = source(paths.authService);
    const authRefreshPolicy = source(paths.authRefreshPolicy);
    const face = source(paths.faceService);
    const recommendation = source(paths.recommendationService);
    const extraction = source(paths.extractionService);

    requireAll(api, [
      'type AuthTokenRefreshProvider = (force?: boolean)',
      'authTokenRefreshProvider(false)',
      'forceRefreshRequestAuthToken()',
      'response.status === 401 && authToken === undefined',
      'authTokenRefreshProvider(true)',
      'AUTH_REFRESH_TEMPORARILY_UNAVAILABLE',
      'throw toBackendAuthRefreshError(error)',
      'request:auth-refresh-retry',
    ], 'backend auth retry');
    requireAll(auth, [
      'refreshSessionIfNeeded = useCallback(async (force = false)',
      'setBackendAuthTokenRefreshProvider(async (force = false)',
      'refreshSessionIfNeeded(force)',
      'sessionRef.current !== currentSession',
      'session-refresh:retryable-error',
      'session-restore:retryable-error',
      'const didRefresh = await refreshSessionIfNeeded(force);',
      'if (!didRefresh && sessionRef.current)',
      'throw new AuthRefreshTemporarilyUnavailableError()',
      'restoredSession = storedSession;',
      'setBackendAuthTokenRefreshProvider(null)',
    ], 'Cognito session refresh');
    requireAll(authService, [
      'interpretCognitoRefreshResponse(response.status, await response.json())',
      'if (!session.refreshToken)',
      'if (!body)',
    ], 'Cognito refresh response policy');
    requireAll(authRefreshPolicy, [
      "status === 400 && payload.error?.toLowerCase() === 'invalid_grant'",
      "throw new Error('Cognito refresh response was malformed.')",
      'status < 200 || status >= 300 || payload.error',
      "throw new Error('Cognito refresh response did not include an access token.')",
    ], 'Cognito definitive-expiry boundary');
    requireAll(face, ['FACE_ANALYSIS_API_BASE_URL_MISSING'], 'face analysis fail-closed API');
    const deleteFaceReportStart = face.indexOf(
      'export const deleteFaceAnalysisReport = async (',
    );
    const deleteRecommendedMakeupStart = face.indexOf(
      'export const deleteFaceAnalysisRecommendedMakeup = async (',
      deleteFaceReportStart,
    );
    const deleteFaceReportSource = face.slice(
      deleteFaceReportStart,
      deleteRecommendedMakeupStart,
    );
    requireContract(
      deleteFaceReportStart >= 0 && deleteRecommendedMakeupStart > deleteFaceReportStart,
      'face analysis delete contract boundaries must exist',
    );
    requireAll(deleteFaceReportSource, [
      'if (!getBackendApiBaseUrl())',
      'throw new BackendApiError(',
      "'FACE_ANALYSIS_API_BASE_URL_MISSING'",
      "{method: 'DELETE'}",
    ], 'face analysis report delete fail-closed API');
    requireNone(deleteFaceReportSource, ['return true'], 'face analysis delete fake success');
    requireAll(recommendation, [
      'if (input.forceFixture)',
      'if (!hasConfiguredBackend)',
      'hasFixtureReportId',
      "'/makeup-recommendations/sessions'",
    ], 'makeup recommendation real-backend gate');
    requireNone(recommendation, ['shouldUseDiscoveryFixture'], 'automatic recommendation fixture fallback');
    requireAll(extraction, [
      'FILTER_EXTRACTION_API_REQUIRED',
      "aiStatus === 'bedrock_completed'",
      "aiStatus !== 'bedrock_completed'",
      'FILTER_EXTRACTION_AI_RESULT_REQUIRED',
    ], 'reference extraction real-AI gate');
    requireNone(extraction, ['fallback:no-api-base', 'fallback:backend-failed'], 'reference extraction mock fallback');
  }],

  ['3. complete long-report gallery capture', () => {
    const optionalViewShot = source(paths.optionalViewShot);
    const faceScaffold = source(paths.faceReportScaffold);
    const facePreview = source(paths.faceReportPreview);
    const faceShare = source(paths.faceReportShare);
    const faceReadiness = source(paths.faceReportReadiness);
    const facePhotoSlot = source(paths.faceReportPhotoSlot);
    const recommendation = source(paths.recommendationResult);
    const guide = source(paths.finalAreaGuide);
    const extraction = source(paths.extractionResult);
    const feedbackHome = source(paths.feedbackHome);
    const feedbackEvidence = source(paths.feedbackEvidence);
    const feedbackResult = source(paths.feedbackResult);

    requireAll(optionalViewShot, ['useRenderInContext'], 'shared long-view capture wrapper');
    requireAll(faceScaffold, [
      'useRenderInContext: true',
      'captureRequestId !== null && captureRequestId !== undefined',
      '<FaceReportCaptureDocument',
      'accessibilityElementsHidden',
      'importantForAccessibility="no-hide-descendants"',
      'pointerEvents="none"',
      'countFaceReportCaptureAssets',
      'expectedAssetCount',
      'FaceReportCaptureAssetContext.Provider',
      '<View onLayout={() => setLayoutReady(true)}>',
    ], 'face report lazy capture');
    requireAll(faceReadiness, [
      'assetStates.size !== expectedAssetCount',
      'Array.from(assetStates.values()).every(Boolean)',
    ], 'face report asset readiness predicate');
    requireAll(facePhotoSlot, [
      'captureAssetContext.registerAsset(captureAssetId)',
      'onLoadStart: handleLoadStart',
      'onLoadEnd: handleLoadSettled',
      'onError: handleLoadSettled',
      'const transition = hasCaptureAsset ? 0 : 150',
    ], 'face report image readiness events');
    requireAll(faceShare, [
      'FACE_REPORT_CAPTURE_SETTLE_TIMEOUT_MS = 10_000',
      'if (Date.now() >= deadline)',
      'await waitForFaceReportCaptureAssets(options)',
      'await waitForLayoutFrames(2)',
      'const imageUri = await capture.call(captureTarget)',
      'getPermissionsAsync(true, [])',
      'requestPermissionsAsync(true, [])',
      'saveToLibraryAsync(imageUri)',
      'createAssetAsync(imageUri)',
    ], 'face report bounded gallery save');
    const faceTimeoutIndex = faceShare.indexOf('if (Date.now() >= deadline)');
    const faceTimeoutThrowIndex = faceShare.indexOf('throw new Error(', faceTimeoutIndex);
    const faceCaptureCallIndex = faceShare.indexOf('const imageUri = await capture.call(captureTarget)');
    requireContract(
      faceTimeoutIndex >= 0 &&
        faceTimeoutThrowIndex > faceTimeoutIndex &&
        faceCaptureCallIndex > faceTimeoutThrowIndex,
      'face report timeout must fail before native capture',
    );
    requireAll(facePreview, [
      'shareInFlightRef.current',
      'const operationId = ++shareOperationRef.current',
      'setCaptureRequestId(operationId)',
      'captureReportImage(reportCaptureRef, {',
      'isReady: () => captureRequestIdRef.current === operationId',
      'shouldContinue: () => isMountedRef.current',
      'shareOperationRef.current += 1',
      'finally {',
      'setCaptureRequestId(null)',
      'saveReportImageToLibrary(imageUri)',
      "Alert.alert('저장 완료'",
    ], 'face report visible save lifecycle');
    const faceFinallyIndex = facePreview.indexOf(
      '      } finally {',
      facePreview.indexOf('const handleShareAction'),
    );
    const faceUnmountIndex = facePreview.indexOf('setCaptureRequestId(null)', faceFinallyIndex);
    requireContract(
      faceFinallyIndex >= 0 && faceUnmountIndex > faceFinallyIndex,
      'face report success and failure must unmount the capture document',
    );

    requireAll(recommendation, [
      'useRenderInContext: true',
      'setCaptureAllPages(true)',
      'captureAllPages={captureAllPages}',
      'CAPTURE_PAGES_SETTLE_TIMEOUT_MS',
      'return new Promise<void>((resolve, reject) => {',
      'timeoutId = setTimeout(fail, CAPTURE_PAGES_SETTLE_TIMEOUT_MS)',
      'waitForCapturePagesToSettle(',
      'onCapturePagesSettledChange={handleCapturePagesSettledChange}',
      'saveRecommendationResultToLibrary(imageUri)',
      "Alert.alert('저장 완료'",
    ], 'recommendation full report save');
    requireNone(recommendation, ['setTimeout(finish, CAPTURE_PAGES_SETTLE_TIMEOUT_MS)'], 'recommendation timeout capture');
    requireAll(guide, [
      'captureAllPages ? (',
      'recipes.map(recipe => (',
      '<FinalAreaRecipePage',
      'function FinalAreaCapturePages(',
      'allPagesSettled',
      'function FinalAreaCapturePage(',
      'active',
      "onReadinessChange(recipe.area, 'crop', settled)",
      "onReadinessChange(recipe.area, 'product', settled)",
    ], 'all area detail pages');

    requireAll(extraction, [
      'useRenderInContext: true',
      'requestPermissionsAsync(true, [])',
      'saveToLibraryAsync(imageUri)',
      'createAssetAsync(imageUri)',
      'captureAllPages={isSavingReport}',
      'EXTRACTION_CAPTURE_SETTLE_TIMEOUT_MS',
      'return new Promise<void>((resolve, reject) => {',
      'timeoutId = setTimeout(fail, EXTRACTION_CAPTURE_SETTLE_TIMEOUT_MS)',
      'waitForExtractionCaptureAssets(',
      'onCapturePagesSettledChange={handleCapturePagesSettledChange}',
      "Alert.alert('저장 완료'",
    ], 'extraction full report save');
    requireNone(extraction, ['setTimeout(finish, EXTRACTION_CAPTURE_SETTLE_TIMEOUT_MS)'], 'extraction timeout capture');

    requireAll(feedbackHome, [
      'useRenderInContext: true',
      'isOpen={controller.openAxisId === axis.id}',
      '<CaptureEvaluationDetails',
      'evaluations={vm.evaluations}',
      'evaluations.map(evaluation =>',
      "asset: 'details' | 'hero'",
      'captureRequestId',
      'priorityCorrections={vm.priorityCorrections}',
      'evaluation.impactLabel',
      "evaluation.status === 'strength'",
      "evaluation.status === 'optional'",
      'captureSummaryCard',
    ], 'feedback all-slide capture');
    requireAll(feedbackEvidence, [
      'onSettledChange?: (settled: boolean) => void',
      'onLoadEnd={handleImageSettled}',
      'onLoadEnd={onLoadEnd}',
    ], 'feedback evidence image settle signal');
    requireAll(feedbackResult, [
      'requestPermissionsAsync(true, [])',
      'prepareCapture()',
      'FEEDBACK_CAPTURE_SETTLE_TIMEOUT_MS',
      'return new Promise<void>((resolve, reject) => {',
      'timeoutId = setTimeout(fail, FEEDBACK_CAPTURE_SETTLE_TIMEOUT_MS)',
      'waitForFeedbackCaptureAssets(',
      'captureRequestId={captureRequestId}',
      'onCaptureDocumentSettledChange={handleCaptureDocumentSettledChange}',
      'saveFeedbackImageToLibrary(imageUri)',
      "tone: 'success'",
    ], 'feedback visible save result');
    requireNone(feedbackResult, ['setTimeout(finish, FEEDBACK_CAPTURE_SETTLE_TIMEOUT_MS)'], 'feedback timeout capture');
  }],

  ['4. face-analysis failure recovery routes', () => {
    const screen = source(paths.faceLoading);
    const routes = source(paths.faceRoutes);
    requireAll(screen, [
      'onOpenReports?: () => void',
      'onRetake?: () => void',
      'onPress={onRetake ?? onBack}',
      'onPress={onOpenReports}',
      'onPress={onRetry}',
    ], 'face analysis failure actions');
    requireAll(routes, [
      'const handleRetake = React.useCallback',
      /navigation\.replace\(\s*'FaceCapture'/,
      "navigation.replace('FaceAnalysisReportsList')",
      "afterAnalysisRoute === 'ProductRecommendation'",
      "navigation.replace('FaceAnalysisReportDetail')",
      'onBack={handleBack}',
      'onOpenReports={handleOpenReports}',
      'onRetake={handleRetake}',
      'onRetry={handleRetryAnalysis}',
      'const [progressAttempt, setProgressAttempt]',
      'setProgressAttempt(currentAttempt => ({',
      'key={progressAttempt.key}',
      'progressStartedAtMs={progressAttempt.startedAtMs}',
    ], 'face analysis failure routing');
  }],

  ['5. romance-fantasy heroine category alignment', () => {
    const catalog = source(paths.situationCatalog);
    const schema = source(paths.backendSchema);
    const trends = source(paths.backendTrends);
    requireAll(catalog, [
      "keyword('festival_performance', 'romance-fantasy-heroine', '로판 여주'",
    ], 'mobile situation catalog');
    requireAll(schema, [
      'c4964d4c-76e2-5f73-8db8-7065658cb254',
      "('festival_performance', '로판 여주', 60)",
    ], 'backend situation schema');
    requireAll(trends, ['("로판 여주", "curated", None)', '"로판 여주":'], 'backend fallback catalog');
  }],

  ['6. free custom situation input and AI interpretation', () => {
    const composer = source(paths.customComposer);
    const validation = source(paths.customValidation);
    const backendValidation = source(paths.backendCustom);
    const prompt = source(paths.backendPrompt);
    const recommendation = source(paths.recommendationService);

    requireAll(composer, [
      'const hasText = Boolean(value.trim())',
      'const canSubmit = hasText && validation.isValid',
      'disabled={!canSubmit}',
    ], 'custom situation submit activation');
    requireAll(validation, [
      'if (!normalizedText)',
      "intentType: 'valid_context'",
      'isValid: true',
      'normalizedText,',
    ], 'mobile non-empty custom situation validation');
    requireNone(validation, [/normalizedText\.length\s*</, /minimum|minLength/i], 'custom situation minimum-keyword gate');
    requireAll(backendValidation, [
      'if not original:',
      '"intentType": "valid_context"',
      'return classification["normalizedText"]',
    ], 'backend non-empty custom situation validation');
    requireAll(prompt, [
      '시간이나 장소가 없어도 입력의 의미를 그대로 해석하라',
      '장면·일정·직업·역할·테마·원하는 인상',
    ], 'AI custom situation prompt');
    requireAll(recommendation, ['customSituationText', 'customSituationLabel'], 'custom situation API body');
  }],

  ['7. routing and fallback completion guards', () => {
    const extractionRoutes = source(paths.extractionRoutes);
    const extractionLoading = source(paths.extractionLoading);
    const extractionService = source(paths.extractionService);
    const faceLoading = source(paths.faceLoading);
    const faceReportsList = source(paths.faceReportsList);

    requireAll(extractionRoutes, [
      'hasCompletedReferenceMakeupExtractionSync',
      'getCompletedReferenceMakeupExtractionSnapshot(reportId)',
      /if\s*\(\s*!reportId\s*\|\|\s*getCompletedReferenceMakeupExtractionSnapshot\(reportId\)\s*\)/,
      'if (!reportId && !completedReport)',
      'runReferenceMakeupExtraction(photo, safeOnProgress, {',
      'signal: abortController.signal',
      'abortController.abort()',
      'fetchReferenceMakeupExtractionReport(reportId, {',
      '.then(({reportId}) =>',
      'setCompletedReportId(reportId)',
      '.catch(error =>',
      'setAnalysisErrorMessage(',
      'completedReportId',
      'if (!photo)',
      '분석할 사진이 필요해요',
      'reportLoadAttemptKey',
      'primaryActionLabel="다시 시도"',
      '보고서 목록 보기',
      "navigation.replace('MakeupRecipeList')",
    ], 'reference extraction completion routing');
    requireNone(extractionRoutes, [
      /photo\s*\?\?\s*getReferenceMakeupExtractionDataSync\(\)\.photos\[0\]/,
      /return\s+getReferenceMakeupExtractionDataSync\(\)\.photos\[0\]/,
    ], 'reference extraction mock photo fallback');

    requireAll(extractionService, [
      'ReferenceMakeupExtractionOperationOptions',
      'ReferenceMakeupExtractionRunOptions',
      'referenceMakeupExtractionOperationSequence',
      'assertReferenceMakeupExtractionOperationIsCurrent',
      'operationSequence !== referenceMakeupExtractionOperationSequence',
      'options: ReferenceMakeupExtractionOperationOptions = {}',
      'referenceExtractionStorageMutationTail',
      'deletedReferenceMakeupExtractionReportIds',
      'assertReferenceMakeupExtractionReportIsNotDeleted(normalizedReportId)',
      'referenceMakeupExtractionOperationSequence += 1',
      'invalidateReferenceMakeupExtractionReport(normalizedReportId)',
      'latestReferenceMakeupExtractionData = referenceMakeupExtractionMock',
      'hasCompletedReferenceMakeupExtraction = false',
      'withReferenceExtractionStorageMutationLock',
      'commitReferenceMakeupExtractionResult',
      'JSON.stringify(nextReports)',
      'JSON.stringify(storedReports)',
      'latestReferenceMakeupExtractionData = data',
      'await delay(',
      '{signal}',
      'const nextData: ReferenceMakeupExtractionData',
    ], 'reference extraction shared-operation atomic commit guard');
    requireNone(extractionService, [
      'latestReferenceMakeupExtractionData = mappedReport.data',
      'latestReferenceMakeupExtractionData = nextData',
      'rememberReferenceExtractionReport',
    ], 'reference extraction writes outside atomic commit');

    const operationStarts = extractionService.match(
      /const operationSequence = \+\+referenceMakeupExtractionOperationSequence/g,
    ) ?? [];
    requireContract(
      operationStarts.length === 2,
      'detail fetch and analysis run must both start a shared latest-wins operation',
    );
    const atomicCommitCalls = extractionService.match(
      /await commitReferenceMakeupExtractionResult\(\{/g,
    ) ?? [];
    requireContract(
      atomicCommitCalls.length === 2,
      'detail fetch and analysis run must both use the atomic storage/global commit',
    );

    const atomicCommitIndex = extractionService.indexOf(
      'async function commitReferenceMakeupExtractionResult(',
    );
    const storageSnapshotIndex = extractionService.indexOf(
      'const storedReports = await getStoredReferenceExtractionReports()',
      atomicCommitIndex,
    );
    const storageWriteIndex = extractionService.indexOf(
      'JSON.stringify(nextReports)',
      storageSnapshotIndex,
    );
    const postWriteGuardIndex = extractionService.indexOf(
      'try {\n      assertCurrent();',
      storageWriteIndex,
    );
    const rollbackIndex = extractionService.indexOf(
      'JSON.stringify(storedReports)',
      postWriteGuardIndex,
    );
    const globalCommitIndex = extractionService.indexOf(
      'latestReferenceMakeupExtractionData = data',
      rollbackIndex,
    );
    requireContract(
      atomicCommitIndex >= 0 &&
        storageSnapshotIndex > atomicCommitIndex &&
        storageWriteIndex > storageSnapshotIndex &&
        postWriteGuardIndex > storageWriteIndex &&
        rollbackIndex > postWriteGuardIndex &&
        globalCommitIndex > rollbackIndex,
      'stale storage write must rollback its owned snapshot before any global commit',
    );

    const detailFetchIndex = extractionService.indexOf(
      'export async function fetchReferenceMakeupExtractionReport(',
    );
    const runIndex = extractionService.indexOf(
      'export async function runReferenceMakeupExtraction(',
    );
    const detailAtomicCommitIndex = extractionService.indexOf(
      'await commitReferenceMakeupExtractionResult({',
      detailFetchIndex,
    );
    const runAtomicCommitIndex = extractionService.indexOf(
      'await commitReferenceMakeupExtractionResult({',
      runIndex,
    );
    requireContract(
      detailFetchIndex >= 0 &&
        detailAtomicCommitIndex > detailFetchIndex &&
        detailAtomicCommitIndex < runIndex &&
        runAtomicCommitIndex > runIndex,
      'detail fetch and analysis run must commit only through their owned atomic boundary',
    );
    const deleteReportIndex = extractionService.indexOf(
      'export async function deleteReferenceMakeupExtractionReport(',
    );
    const invalidateOperationIndex = extractionService.indexOf(
      'referenceMakeupExtractionOperationSequence += 1',
      deleteReportIndex,
    );
    const deleteRequestIndex = extractionService.indexOf(
      "await requestBackendJson(\n    '/filter-extractions/'",
      deleteReportIndex,
    );
    const invalidateDeletedReportIndex = extractionService.indexOf(
      'invalidateReferenceMakeupExtractionReport(normalizedReportId)',
      deleteRequestIndex,
    );
    const forgetDeletedReportIndex = extractionService.indexOf(
      'await forgetReferenceExtractionReport(normalizedReportId)',
      invalidateDeletedReportIndex,
    );
    requireContract(
      deleteReportIndex >= 0 &&
        invalidateOperationIndex > deleteReportIndex &&
        deleteRequestIndex > invalidateOperationIndex &&
        invalidateDeletedReportIndex > deleteRequestIndex &&
        forgetDeletedReportIndex > invalidateDeletedReportIndex,
      'reference extraction deletion must cancel stale work, then clear runtime state before persisted history',
    );
    requireAll(extractionLoading, [
      'progress >= 1 && isAnalysisReady && !hasAnalysisError',
      'onPress={onRetry}',
      'onPress={onChooseDifferentPhoto}',
      'onPress={onOpenReportList}',
    ], 'reference extraction error fallback');
    requireAll(faceLoading, [
      'const hasAnalysisError = Boolean(analysisErrorMessage)',
      'anchorPreview && !hasAnalysisError && !isAnalysisReady',
      '{hasAnalysisError ? (',
    ], 'face loading fallback state');
    requireAll(faceReportsList, [
      'const [isLoading, setIsLoading] = useState(true)',
      "const [loadError, setLoadError] = useState('')",
      '.catch((error: unknown) =>',
      'setLoadAttemptKey(current => current + 1)',
      '얼굴 분석 보고서 다시 불러오기',
      '다시 불러오기',
    ], 'face report list rejection and retry');
  }],
];

const failures = [];
for (const [name, run] of tests) {
  try {
    run();
    console.info('PASS ' + name);
  } catch (error) {
    failures.push({name, message: error instanceof Error ? error.message : String(error)});
    console.error('FAIL ' + name);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error('  ' + failure.name + ': ' + failure.message);
  }
  process.exit(1);
}

console.info('QA checklist contract passed (' + tests.length + '/' + tests.length + ').');
