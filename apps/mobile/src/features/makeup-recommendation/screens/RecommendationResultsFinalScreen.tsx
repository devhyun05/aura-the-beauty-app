import {ChevronLeft, MoreHorizontal, ShoppingBag, Sparkles} from 'lucide-react-native';
import {useCallback, useMemo, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Alert,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  loadOptionalCaptureRefFunction,
  OptionalViewShot,
  type OptionalViewShotRef,
} from '../../../shared/ui/OptionalViewShot';
import {SavedImagePreviewSheet} from '../../../shared/ui/SavedImagePreviewSheet';
import {FinalAreaGuideSection} from '../components/result/FinalAreaGuideSection';
import {FinalGeneratedMakeupHero} from '../components/result/FinalGeneratedMakeupHero';
import {FinalSingleLookMap} from '../components/result/FinalSingleLookMap';
import {
  captureRecommendationResult,
  getRecommendationResultShareError,
  requestRecommendationResultSavePermission,
  saveRecommendationResultToLibrary,
  shareRecommendationResult,
  type RecommendationResultShareTarget,
} from '../services/recommendationResultShare';
import {toFinalRecommendationResult} from '../services/toFinalRecommendationResult';
import {colors, radius, shadows} from '../theme/makeupResultTokens';
import type {RecommendationResultsViewProps} from './RecommendationResultsView';

const CAPTURE_OPTIONS = {
  format: 'jpg',
  quality: 0.95,
  result: 'tmpfile',
} as const;

// iOS 이미지 렌더러 한계(≈16384px)를 넘는 긴 결과는 잘리므로, 실측 높이
// 기준으로 필요할 때만 비율 축소 캡처한다 (분석·피드백 보고서와 동일 규칙).
const CAPTURE_MAX_PIXELS = 16000;

type CaptureAsset = 'crop' | 'hero' | 'map' | 'product';
type CaptureReadiness = Record<CaptureAsset, boolean>;

const INITIAL_CAPTURE_READINESS: CaptureReadiness = {
  crop: false,
  hero: false,
  map: false,
  product: false,
};

export function RecommendationResultsFinalScreen({
  context,
  imageRetryError,
  imageStatus,
  onOpenRecommendedProducts,
  onApplyAR,
  onBack,
  onAreaOpened,
  onRetry,
  onRetryImages,
  results,
}: RecommendationResultsViewProps) {
  const insets = useSafeAreaInsets();
  const captureRef = useRef<OptionalViewShotRef>(null);
  const captureBodySize = useRef({height: 0, width: 0});
  const [savedImagePreviewUri, setSavedImagePreviewUri] = useState<string | null>(
    null,
  );
  const activeShareTargetRef = useRef<RecommendationResultShareTarget | null>(null);
  const [captureReadiness, setCaptureReadiness] =
    useState<CaptureReadiness>(INITIAL_CAPTURE_READINESS);
  const model = useMemo(
    () =>
      toFinalRecommendationResult(results, {
        additionalConstraints: context?.additionalConstraints,
        answers: context?.answers,
        personalColor: context?.personalColor,
        questions: context?.questions,
      }),
    [
      context?.additionalConstraints,
      context?.answers,
      context?.keywordLabel,
      context?.personalColor,
      context?.questions,
      context?.reportSummary,
      context?.situationLabel,
      results,
    ],
  );

  const resolvedImageStatus = model?.sourceLook.imageStatus ?? imageStatus ?? 'pending';
  const generatedReady = Boolean(model) && resolvedImageStatus === 'completed';

  const updateCaptureReadiness = useCallback((asset: CaptureAsset, ready: boolean) => {
    setCaptureReadiness(current =>
      current[asset] === ready ? current : {...current, [asset]: ready},
    );
  }, []);

  const captureReadyHandlers = useMemo(
    () => ({
      crop: (ready: boolean) => updateCaptureReadiness('crop', ready),
      hero: (ready: boolean) => updateCaptureReadiness('hero', ready),
      map: (ready: boolean) => updateCaptureReadiness('map', ready),
      product: (ready: boolean) => updateCaptureReadiness('product', ready),
    }),
    [updateCaptureReadiness],
  );

  const captureReady =
    generatedReady && Object.values(captureReadiness).every(Boolean);

  // 결과가 렌더러 픽셀 한계를 넘으면 renderInContext(큰 뷰에서도 동작,
  // 크기 옵션을 주면 잘리므로 자연 크기 호출) → 축소 스냅샷 순으로 시도.
  const captureFullResult = useCallback(async () => {
    const body = captureBodySize.current;
    const captureNode = loadOptionalCaptureRefFunction();
    const deviceScale = PixelRatio.get();

    if (
      captureNode &&
      captureRef.current &&
      body.height > 0 &&
      body.height * deviceScale > CAPTURE_MAX_PIXELS
    ) {
      try {
        const fullUri = await captureNode(captureRef.current, {
          ...CAPTURE_OPTIONS,
          useRenderInContext: true,
        });
        if (fullUri) {
          return fullUri;
        }
      } catch (error) {
        console.info('[aura:recommendation] capture-render-in-context-failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }

      const scaleDown = CAPTURE_MAX_PIXELS / (body.height * deviceScale);
      const scaledUri = await captureNode(captureRef.current, {
        ...CAPTURE_OPTIONS,
        height: Math.floor(body.height * scaleDown),
        width: Math.floor(body.width * scaleDown),
      });
      if (scaledUri) {
        return scaledUri;
      }
    }

    return captureRecommendationResult(captureRef);
  }, []);

  const handleShareAction = useCallback(
    async (target: RecommendationResultShareTarget) => {
      if (activeShareTargetRef.current) return;

      if (!captureReady) {
        AccessibilityInfo.announceForAccessibility('결과 이미지를 준비하고 있어요.');
        return;
      }

      activeShareTargetRef.current = target;

      try {
        if (target === 'save-image') {
          await requestRecommendationResultSavePermission();
        }

        const imageUri = await captureFullResult();

        if (target === 'save-image') {
          await saveRecommendationResultToLibrary(imageUri);
          setSavedImagePreviewUri(imageUri);
          AccessibilityInfo.announceForAccessibility('전체 추천 결과를 사진에 저장했어요.');
        } else {
          const result = await shareRecommendationResult(imageUri);
          AccessibilityInfo.announceForAccessibility(
            result === 'dismissed'
              ? '공유를 취소했어요.'
              : '전체 추천 결과 공유 창을 열었어요.',
          );
        }
      } catch (error) {
        Alert.alert(
          '저장·공유를 완료하지 못했어요',
          getRecommendationResultShareError(error),
        );
      } finally {
        activeShareTargetRef.current = null;
      }
    },
    [captureReady],
  );

  const handleMore = useCallback(() => {
    if (activeShareTargetRef.current) {
      Alert.alert(
        '공유 준비 중',
        '이전 저장 또는 공유 작업을 처리하고 있어요. 잠시만 기다려 주세요.',
      );
      return;
    }
    if (!captureReady) {
      Alert.alert('결과 준비 중', '추천 이미지를 모두 불러온 뒤 저장하거나 공유할 수 있어요.');
      return;
    }
    Alert.alert('추천 메이크업 보고서', '원하는 작업을 선택해 주세요.', [
      {text: '이미지 저장', onPress: () => void handleShareAction('save-image')},
      {text: '공유하기', onPress: () => void handleShareAction('share-result')},
      {text: '취소', style: 'cancel'},
    ]);
  }, [captureReady, handleShareAction]);

  if (!model) {
    return (
      <LinearGradient colors={colors.screenGradient} style={styles.fill}>
        <RecommendationReportHeader
          onBack={onBack}
          onMore={handleMore}
          topInset={insets.top}
        />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>추천 결과를 준비하지 못했어요</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.primaryButton}>
            <Text style={styles.primaryLabel}>다시 시도하기</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={colors.screenGradient} style={styles.fill}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <RecommendationReportHeader
          onBack={onBack}
          onMore={handleMore}
          topInset={insets.top}
        />
        <View
          onLayout={e => {
            captureBodySize.current = {
              height: e.nativeEvent.layout.height,
              width: e.nativeEvent.layout.width,
            };
          }}>
        <OptionalViewShot
          options={CAPTURE_OPTIONS}
          ref={captureRef}
          style={styles.captureRoot}>
          <LinearGradient colors={colors.screenGradient} style={styles.captureStack}>
            <View style={styles.heroInset}>
              <FinalGeneratedMakeupHero
                alignmentMetadata={model.sourceLook.imageAlignmentMetadata}
                afterImage={model.look.image}
                beforeImageUri={context?.reportImageUri}
                imageError={model.sourceLook.imageError ?? imageRetryError}
                imageStatus={resolvedImageStatus}
                onReadyChange={captureReadyHandlers.hero}
                onRetry={() => onRetryImages()}
                title={context?.keywordLabel?.trim()
                  || context?.situationLabel?.trim()
                  || model.look.name}
              />
            </View>

            <View style={styles.sectionInset}>
              <FinalAreaGuideSection
                generatedReady={generatedReady}
                look={model.look}
                onAreaOpened={area => onAreaOpened(area, model.sourceLook)}
                onCropSettledChange={captureReadyHandlers.crop}
                onProductImageSettledChange={captureReadyHandlers.product}
                sourceImageUri={context?.reportImageUri}
                sourceRegionVisuals={context?.reportRegionVisuals}
                sourceLook={model.sourceLook}
              />
            </View>

            <View style={styles.sectionInset}>
              <FinalSingleLookMap
                generatedReady={generatedReady}
                look={model.look}
                onPointSettledChange={captureReadyHandlers.map}
              />
            </View>
          </LinearGradient>
        </OptionalViewShot>
        </View>

        <View style={styles.floatingActionClearance} />
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={[styles.floatingActionHost, {bottom: Math.max(insets.bottom, 12) + 10}]}>
        <View style={styles.floatingActionRow}>
          <Pressable
            accessibilityHint="맞춤 추천 제품 페이지로 이동합니다"
            accessibilityLabel="추천 제품 페이지로 이동"
            accessibilityRole="button"
            onPress={onOpenRecommendedProducts}
            style={({pressed}) => [
              styles.floatingAction,
              styles.productAction,
              pressed && styles.pressed,
            ]}>
            <ShoppingBag color={colors.ink} size={18} strokeWidth={2.1} />
            <Text numberOfLines={1} style={styles.productActionLabel}>
              추천 제품
            </Text>
          </Pressable>
          {/* 추천→AR 연동은 구형 AR 경로라 스토어 빌드에서는 숨긴다(dev 전용). */}
          {__DEV__ ? (
            <Pressable
              accessibilityHint="현재 추천 메이크업을 얼굴에 미리 적용합니다"
              accessibilityLabel="추천 메이크업 AR 적용"
              accessibilityRole="button"
              onPress={() => onApplyAR(model.sourceLook)}
              style={({pressed}) => [
                styles.floatingAction,
                styles.arAction,
                shadows.darkTile,
                pressed && styles.pressed,
              ]}>
              <Sparkles color={colors.white} size={19} strokeWidth={2.1} />
              <Text numberOfLines={1} style={styles.floatingActionLabel}>
                AR로 적용하기
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <SavedImagePreviewSheet
        imageUri={savedImagePreviewUri}
        onClose={() => setSavedImagePreviewUri(null)}
      />
    </LinearGradient>
  );
}

function RecommendationReportHeader({
  onBack,
  onMore,
  topInset,
}: {
  onBack?: () => void;
  onMore: () => void;
  topInset: number;
}) {
  return (
    <View style={[styles.reportHeader, {paddingTop: Math.max(topInset, 54) + 10}]}>
      <Pressable
        accessibilityLabel="뒤로가기"
        accessibilityRole="button"
        accessibilityState={{disabled: !onBack}}
        disabled={!onBack}
        hitSlop={6}
        onPress={onBack}
        style={({pressed}) => [
          styles.reportHeaderButton,
          pressed && styles.pressed,
          !onBack && styles.headerButtonDisabled,
        ]}>
        <ChevronLeft color={colors.ink3} size={18} strokeWidth={2.2} />
      </Pressable>
      <Text numberOfLines={1} style={styles.reportHeaderTitle}>
        추천 메이크업 보고서
      </Text>
      <Pressable
        accessibilityLabel="추천 메이크업 보고서 더보기"
        accessibilityRole="button"
        hitSlop={6}
        onPress={onMore}
        style={({pressed}) => [styles.reportHeaderButton, pressed && styles.pressed]}>
        <MoreHorizontal color={colors.ink3} size={16} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  content: {},
  captureRoot: {backgroundColor: '#D7E0F4'},
  captureStack: {gap: 26, paddingBottom: 24, paddingTop: 18},
  heroInset: {paddingHorizontal: 14},
  sectionInset: {paddingHorizontal: 14},
  floatingActionClearance: {height: 116},
  headerButtonDisabled: {opacity: 0.42},
  reportHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 6,
    paddingHorizontal: 20,
  },
  reportHeaderButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 17,
    elevation: 2,
    height: 34,
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    width: 34,
  },
  reportHeaderTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    marginHorizontal: 12,
    textAlign: 'center',
  },
  pressed: {opacity: 0.76},
  floatingActionHost: {
    left: 12,
    position: 'absolute',
    right: 12,
    zIndex: 40,
  },
  floatingActionRow: {flexDirection: 'row', gap: 10},
  floatingAction: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 12,
  },
  productAction: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: colors.glassBorder,
    borderWidth: 1,
    flex: 0.9,
  },
  arAction: {backgroundColor: colors.dark, flex: 1.1},
  productActionLabel: {color: colors.ink, flexShrink: 1, fontSize: 15, fontWeight: '800'},
  floatingActionLabel: {color: colors.white, flexShrink: 1, fontSize: 15, fontWeight: '800'},
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.dark,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 20,
  },
  primaryLabel: {color: colors.white, fontSize: 15, fontWeight: '700'},
  empty: {flex: 1, gap: 20, justifyContent: 'center', paddingHorizontal: 24},
  emptyTitle: {color: colors.ink, fontSize: 24, fontWeight: '700', textAlign: 'center'},
});
