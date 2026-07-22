import {ChevronLeft, ShoppingBag, Sparkles} from 'lucide-react-native';
import {useMemo} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {FinalAreaGuideSection} from '../components/result/FinalAreaGuideSection';
import {FinalGeneratedMakeupHero} from '../components/result/FinalGeneratedMakeupHero';
import {FinalSingleLookMap} from '../components/result/FinalSingleLookMap';
import {toFinalRecommendationResult} from '../services/toFinalRecommendationResult';
import {colors, radius, shadows} from '../theme/makeupResultTokens';
import type {RecommendationResultsViewProps} from './RecommendationResultsView';

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

  if (!model) {
    return (
      <LinearGradient colors={colors.screenGradient} style={styles.fill}>
        <RecommendationReportHeader
          onBack={onBack}
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
          topInset={insets.top}
        />
        <View style={styles.captureRoot}>
          <LinearGradient colors={colors.screenGradient} style={styles.captureStack}>
            <View style={styles.heroInset}>
              <FinalGeneratedMakeupHero
                alignmentMetadata={model.sourceLook.imageAlignmentMetadata}
                afterImage={model.look.image}
                beforeImageUri={context?.reportImageUri}
                imageError={model.sourceLook.imageError ?? imageRetryError}
                imageStatus={resolvedImageStatus}
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
                sourceImageUri={context?.reportImageUri}
                sourceRegionVisuals={context?.reportRegionVisuals}
                sourceLook={model.sourceLook}
              />
            </View>

            <View style={styles.sectionInset}>
              <FinalSingleLookMap
                generatedReady={generatedReady}
                look={model.look}
              />
            </View>
          </LinearGradient>
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
    </LinearGradient>
  );
}

function RecommendationReportHeader({
  onBack,
  topInset,
}: {
  onBack?: () => void;
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
      <View style={styles.reportHeaderSpacer} />
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
  reportHeaderSpacer: {height: 34, width: 34},
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
