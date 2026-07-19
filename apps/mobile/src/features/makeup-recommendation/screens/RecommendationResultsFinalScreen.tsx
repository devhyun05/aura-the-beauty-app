import {Download, Share2, Sparkles} from 'lucide-react-native';
import {useCallback, useMemo, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {APP_HEADER_BASE_HEIGHT} from '../../../shared/ui/AppHeader';
import {
  OptionalViewShot,
  type OptionalViewShotRef,
} from '../../../shared/ui/OptionalViewShot';
import {FinalAreaGuideSection} from '../components/result/FinalAreaGuideSection';
import {FinalGeneratedMakeupHero} from '../components/result/FinalGeneratedMakeupHero';
import {FinalMatchReasonSection} from '../components/result/FinalMatchReasonSection';
import {FinalRecommendationContextReceipt} from '../components/result/FinalRecommendationContextReceipt';
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

type CaptureAsset = 'crop' | 'hero' | 'map' | 'product' | 'report';
type CaptureReadiness = Record<CaptureAsset, boolean>;

const INITIAL_CAPTURE_READINESS: CaptureReadiness = {
  crop: false,
  hero: false,
  map: false,
  product: false,
  report: false,
};

export function RecommendationResultsFinalScreen({
  context,
  imageRetryError,
  imageStatus,
  onApplyAR,
  onAreaOpened,
  onRetry,
  onRetryImages,
  results,
}: RecommendationResultsViewProps) {
  const insets = useSafeAreaInsets();
  const captureRef = useRef<OptionalViewShotRef>(null);
  const activeShareTargetRef = useRef<RecommendationResultShareTarget | null>(null);
  const [activeShareTarget, setActiveShareTarget] =
    useState<RecommendationResultShareTarget | null>(null);
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
      report: (ready: boolean) => updateCaptureReadiness('report', ready),
    }),
    [updateCaptureReadiness],
  );

  const captureReady =
    generatedReady && Object.values(captureReadiness).every(Boolean);

  const handleShareAction = useCallback(
    async (target: RecommendationResultShareTarget) => {
      if (activeShareTargetRef.current) return;

      if (!captureReady) {
        AccessibilityInfo.announceForAccessibility('결과 이미지를 준비하고 있어요.');
        return;
      }

      activeShareTargetRef.current = target;
      setActiveShareTarget(target);

      try {
        if (target === 'save-image') {
          await requestRecommendationResultSavePermission();
        }

        const imageUri = await captureRecommendationResult(captureRef);

        if (target === 'save-image') {
          await saveRecommendationResultToLibrary(imageUri);
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
        setActiveShareTarget(null);
      }
    },
    [captureReady],
  );

  if (!model) {
    return (
      <LinearGradient colors={colors.screenGradient} style={styles.fill}>
        <View style={[styles.empty, {paddingTop: insets.top + APP_HEADER_BASE_HEIGHT + 32}]}>
          <Text style={styles.emptyTitle}>추천 결과를 준비하지 못했어요</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.primaryButton}>
            <Text style={styles.primaryLabel}>다시 시도하기</Text>
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  const shareActionsDisabled = !captureReady || Boolean(activeShareTarget);

  return (
    <LinearGradient colors={colors.screenGradient} style={styles.fill}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 20),
            paddingTop: insets.top + APP_HEADER_BASE_HEIGHT + 18,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <OptionalViewShot
          options={CAPTURE_OPTIONS}
          ref={captureRef}
          style={styles.captureRoot}>
          <LinearGradient colors={colors.screenGradient} style={styles.captureStack}>
            <View style={styles.heroInset}>
              <FinalGeneratedMakeupHero
                afterImage={model.look.image}
                beforeImageUri={context?.reportImageUri}
                imageError={model.sourceLook.imageError ?? imageRetryError}
                imageStatus={resolvedImageStatus}
                onReadyChange={captureReadyHandlers.hero}
                onRetry={() => onRetryImages()}
              />
            </View>

            <View style={styles.sectionInset}>
              <FinalRecommendationContextReceipt
                additionalConstraints={model.additionalConstraints}
                answerRows={model.answerRows}
                keywordLabel={context?.keywordLabel}
                onImageSettledChange={captureReadyHandlers.report}
                reportAnalyzedAt={context?.reportAnalyzedAt}
                reportImageUri={context?.reportImageUri}
                reportLabel={context?.reportLabel}
                reportSummary={context?.reportSummary}
                situationLabel={context?.situationLabel}
              />
            </View>

            <View style={styles.sectionInset}>
              <FinalMatchReasonSection match={model.match} />
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

        <View style={styles.shareSection}>
          <View style={styles.shareActions}>
            <Pressable
              accessibilityLabel="전체 추천 결과 저장"
              accessibilityRole="button"
              accessibilityState={{
                busy: activeShareTarget === 'save-image',
                disabled: shareActionsDisabled,
              }}
              disabled={shareActionsDisabled}
              hitSlop={8}
              onPress={() => {
                void handleShareAction('save-image');
              }}
              style={({pressed}) => [
                styles.shareButton,
                pressed && styles.pressed,
                shareActionsDisabled && styles.disabled,
              ]}>
              {activeShareTarget === 'save-image' ? (
                <ActivityIndicator color={colors.ink} size="small" />
              ) : (
                <Download color={colors.ink} size={24} strokeWidth={1.9} />
              )}
            </Pressable>

            <Pressable
              accessibilityLabel="전체 추천 결과 공유하기"
              accessibilityRole="button"
              accessibilityState={{
                busy: activeShareTarget === 'share-result',
                disabled: shareActionsDisabled,
              }}
              disabled={shareActionsDisabled}
              hitSlop={8}
              onPress={() => {
                void handleShareAction('share-result');
              }}
              style={({pressed}) => [
                styles.shareButton,
                pressed && styles.pressed,
                shareActionsDisabled && styles.disabled,
              ]}>
              {activeShareTarget === 'share-result' ? (
                <ActivityIndicator color={colors.ink} size="small" />
              ) : (
                <Share2 color={colors.ink} size={24} strokeWidth={1.9} />
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={[styles.floatingActionHost, {bottom: Math.max(insets.bottom, 12) + 10}]}>
        <Pressable
          accessibilityHint="현재 추천 메이크업을 얼굴에 미리 적용합니다"
          accessibilityLabel="추천 메이크업 AR 적용"
          accessibilityRole="button"
          onPress={() => onApplyAR(model.sourceLook)}
          style={({pressed}) => [
            styles.floatingAction,
            shadows.darkTile,
            pressed && styles.pressed,
          ]}>
          <Sparkles color={colors.white} size={19} strokeWidth={2.1} />
          <Text style={styles.floatingActionLabel}>AR로 적용하기</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  content: {},
  captureRoot: {backgroundColor: '#D7E0F4'},
  captureStack: {gap: 26, paddingBottom: 24, paddingTop: 18},
  heroInset: {paddingHorizontal: 14},
  sectionInset: {paddingHorizontal: 14},
  shareSection: {
    alignItems: 'center',
    backgroundColor: colors.screenGradient[2],
    paddingBottom: 116,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  shareActions: {alignItems: 'center', flexDirection: 'row', gap: 24, justifyContent: 'center'},
  shareButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  disabled: {opacity: 0.48},
  pressed: {opacity: 0.76},
  floatingActionHost: {
    left: 12,
    position: 'absolute',
    right: 12,
    zIndex: 40,
  },
  floatingAction: {
    alignItems: 'center',
    backgroundColor: colors.dark,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 20,
  },
  floatingActionLabel: {color: colors.white, fontSize: 15, fontWeight: '800'},
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
