import type {ReactNode} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  type ImageSourcePropType,
} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
} from 'lucide-react-native';
import Animated, {FadeIn} from 'react-native-reanimated';
import {Text, View} from 'tamagui';

import {FeedbackEvidenceImage} from './FeedbackEvidenceImage';
import {
  feedbackRedesignColors as C,
  feedbackRedesignFonts,
  feedbackRedesignGradients,
  feedbackVerdictColors,
  tabularNumbers,
} from './feedbackRedesignTheme';
import type {
  MakeupFeedbackRedesignEvaluation,
  MakeupFeedbackRedesignGuide,
} from './makeupFeedbackResultViewModel';
import type {MakeupFeedbackRedesignController} from './useMakeupFeedbackRedesignController';

export function MakeupFeedbackRedesignSlidesScreen({
  controller,
  isShareBusy,
  onOpenRecord,
  onSave,
  onShare,
}: {
  controller: MakeupFeedbackRedesignController;
  isShareBusy: boolean;
  onOpenRecord: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  const currentRegionId = controller.currentEvaluation?.regionId ?? null;
  const isPreviousDisabled = controller.evaluationIndex === 0;
  const isNextDisabled = controller.isSummary;

  return (
    <LinearGradient
      colors={[...feedbackRedesignGradients.slidesBackground.colors]}
      end={{x: 0.5, y: 1}}
      locations={[...feedbackRedesignGradients.slidesBackground.locations]}
      start={{x: 0.5, y: 0}}
      style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="결과 요약으로 돌아가기"
          accessibilityRole="button"
          hitSlop={10}
          onPress={controller.goHome}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
          <ChevronLeft color={C.ink} size={21} strokeWidth={2} />
        </Pressable>

        <View style={styles.regionChips}>
          {controller.viewModel.groups.map(group => {
            const active = currentRegionId === group.id;

            return (
              <Pressable
                accessibilityLabel={`${group.label} 카드로 이동`}
                accessibilityRole="button"
                accessibilityState={{selected: active}}
                key={group.id}
                onPress={() => controller.jumpToRegion(group.id)}
                style={({pressed}) => [
                  styles.regionChipHitArea,
                  pressed && styles.pressed,
                ]}>
                <View style={[styles.regionChip, active && styles.regionChipActive]}>
                  <Text style={[styles.regionChipText, active && styles.regionChipTextActive]}>
                    {group.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.indexLabel}>
          {controller.isSummary
            ? '완료'
            : `${controller.evaluationIndex + 1}/${controller.summaryIndex}`}
        </Text>
      </View>

      <View style={styles.progressRow}>
        {controller.progressSegments.map(segment => (
          <View key={segment.id} style={[styles.progressTrack, {flex: segment.flex}]}>
            <View style={[styles.progressFill, {width: `${segment.fill}%`}]} />
          </View>
        ))}
      </View>

      <View style={styles.cardFrame}>
        <Animated.View
          entering={controller.reduceMotion ? undefined : FadeIn.duration(180)}
          key={controller.evaluationIndex}
          style={styles.animatedCard}>
          {controller.isSummary ? (
            <SummaryCard
              controller={controller}
              isShareBusy={isShareBusy}
              onOpenRecord={onOpenRecord}
              onSave={onSave}
              onShare={onShare}
            />
          ) : controller.currentEvaluation ? (
            <EvaluationCard
              evaluation={controller.currentEvaluation}
              imageSource={controller.viewModel.imageSource}
            />
          ) : null}
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <RoundNavigationButton
          accessibilityLabel="이전 피드백 카드"
          disabled={isPreviousDisabled}
          icon={<ChevronLeft color={isPreviousDisabled ? C.chevron : C.textMuted4} size={21} strokeWidth={2.2} />}
          onPress={controller.previous}
          variant="previous"
        />
        <Text numberOfLines={1} style={styles.nextHint}>{controller.nextHint}</Text>
        <RoundNavigationButton
          accessibilityLabel="다음 피드백 카드"
          disabled={isNextDisabled}
          icon={<ChevronRight color={C.card} size={21} strokeWidth={2.2} />}
          onPress={controller.next}
          variant="next"
        />
      </View>
    </LinearGradient>
  );
}

function EvaluationCard({
  evaluation,
  imageSource,
}: {
  evaluation: MakeupFeedbackRedesignEvaluation;
  imageSource: ImageSourcePropType;
}) {
  const verdict = feedbackVerdictColors[evaluation.status];
  const isLowConfidence = evaluation.confidence !== null && evaluation.confidence < 0.6;
  const useFullPhoto = evaluation.regionId === 'skin' || !evaluation.primaryCrop;
  const crop = evaluation.primaryCrop;

  return (
    <View style={styles.card}>
      <ScrollView
        contentContainerStyle={styles.cardContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}>
        {isLowConfidence && evaluation.confidencePercent !== null ? (
          <View style={styles.lowConfidenceBanner}>
            <Text style={styles.lowConfidenceMark}>!</Text>
            <Text style={styles.lowConfidenceBannerText}>
              판독 신뢰도 낮음 {evaluation.confidencePercent}% — 가볍게 참고해 주세요
            </Text>
          </View>
        ) : null}

        <FeedbackEvidenceImage
          accessibilityLabel={
            useFullPhoto
              ? `${evaluation.topicLabel} 분석에 사용한 원본 사진`
              : `${crop?.label ?? evaluation.topicLabel} 분석 근거 확대 사진`
          }
          height={useFullPhoto ? 300 : 230}
          imageSize={useFullPhoto ? undefined : crop?.imageSize}
          label={
            useFullPhoto && evaluation.regionId !== 'skin'
              ? '원본 사진 · 확대 근거 없음'
              : useFullPhoto
                ? undefined
                : crop?.label
          }
          region={useFullPhoto ? undefined : crop?.region}
          source={crop?.source ?? imageSource}
          topicId={evaluation.topicId}
        />

        <View style={styles.evaluationTitleRow}>
          <View style={[styles.verdictBadge, {backgroundColor: verdict.solid}]}>
            <Text style={styles.verdictBadgeText}>{evaluation.statusLabel}</Text>
          </View>
          <Text style={styles.evaluationTitle}>{evaluation.topicLabel}</Text>
          <Text style={styles.evaluationRegion}>{evaluation.regionLabel}</Text>
        </View>

        <View style={styles.metaRow}>
          {evaluation.impactLabel ? (
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>영향 {evaluation.impactLabel}</Text>
            </View>
          ) : null}
          <View style={[styles.metaChip, isLowConfidence && styles.lowMetaChip]}>
            <Text style={[styles.metaChipText, isLowConfidence && styles.lowMetaText]}>
              {evaluation.confidenceLabel ?? '신뢰도 정보 없음'}
            </Text>
          </View>
        </View>

        {evaluation.goalCriteria.length > 0 ? (
          <View style={styles.copyBlock}>
            <Text style={styles.copyLabel}>분석 기준</Text>
            {evaluation.goalCriteria.map(criterion => (
              <Text key={criterion.id} style={styles.observationText}>
                • {criterion.criterion}
              </Text>
            ))}
          </View>
        ) : null}

        {evaluation.observations.length > 0 ? (
          <View style={styles.copyBlock}>
            <Text style={styles.copyLabel}>사진에서 확인한 점</Text>
            {evaluation.observations.map(observation => (
              <Text key={observation.id} style={styles.observationText}>• {observation.text}</Text>
            ))}
          </View>
        ) : evaluation.visibilityReason ? (
          <View style={styles.copyBlock}>
            <Text style={styles.copyLabel}>판단 범위</Text>
            <Text style={styles.description}>{evaluation.visibilityReason}</Text>
          </View>
        ) : null}

        <Text style={styles.description}>{evaluation.description}</Text>

        {evaluation.guide ? <GuideBlock guide={evaluation.guide} /> : null}

        {!evaluation.guide && evaluation.actionSteps.length > 0 ? (
          <View style={styles.actionSteps}>
            <Text style={styles.copyLabel}>이렇게 해보세요</Text>
            {evaluation.actionSteps.map((step, index) => (
              <View key={`${index}-${step}`} style={styles.actionStepRow}>
                <Text style={styles.actionStepNumber}>{index + 1}</Text>
                <Text style={styles.actionStepText}>{step}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {evaluation.status === 'strength' ? (
          <View style={styles.goodNote}>
            <Text style={styles.goodNoteText}>✓ 잘하고 있어요 — 그대로 유지해 보세요</Text>
          </View>
        ) : null}

        {evaluation.status === 'optional' ? (
          <Text style={styles.optionalNote}>
            선택적으로 적용해도 좋아요. 종합 점수의 근거로 사용하지 않았어요.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function GuideBlock({guide}: {guide: MakeupFeedbackRedesignGuide}) {
  return (
    <View style={styles.guide}>
      <Text style={styles.guideTitle}>이렇게 해보세요</Text>
      <View style={styles.guideChips}>
        {guide.chips.map(chip => (
          <View key={chip.id} style={styles.guideChip}>
            <Text style={styles.guideChipLabel}>{chip.label}</Text>
            <Text style={styles.guideChipText}>{chip.text}</Text>
          </View>
        ))}
      </View>
      <View style={styles.guideRows}>
        {guide.rows.map(row => (
          <View key={row.id} style={styles.guideRow}>
            <Text style={styles.guideRowLabel}>{row.label}</Text>
            <Text style={styles.guideRowText}>{row.text}</Text>
          </View>
        ))}
      </View>
      {guide.instructions.map((step, index) => (
        <View key={`${index}-${step}`} style={styles.actionStepRow}>
          <Text style={styles.actionStepNumber}>{index + 1}</Text>
          <Text style={styles.actionStepText}>{step}</Text>
        </View>
      ))}
      <Text style={styles.guidePossibility}>↗ {guide.possibility}</Text>
    </View>
  );
}

function SummaryCard({
  controller,
  isShareBusy,
  onOpenRecord,
  onSave,
  onShare,
}: {
  controller: MakeupFeedbackRedesignController;
  isShareBusy: boolean;
  onOpenRecord: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  const vm = controller.viewModel;
  const firstPossibility = vm.priorityCorrections.find(
    item => item.guide?.possibility,
  )?.guide?.possibility;
  const hasOptionalCoaching = vm.coachingPoints.some(
    item => item.status === 'optional',
  );

  return (
    <View style={styles.card}>
      <ScrollView
        contentContainerStyle={styles.summaryContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.summaryEyebrow}>{vm.evaluations.length}장 모두 확인했어요</Text>
        <View style={styles.summaryScoreRow}>
          <Text style={styles.summaryScore}>{vm.score}</Text>
          <Text style={styles.summaryScoreMax}>/ 100</Text>
        </View>
        {vm.summarySentence ? (
          <Text style={styles.summarySentence}>{vm.summarySentence}</Text>
        ) : null}

        {vm.priorityCorrections.length > 0 ? (
          <View style={styles.correctionShortcuts}>
            <Text style={styles.correctionHeading}>먼저 보완할 점</Text>
            {vm.priorityCorrections.map(evaluation => (
              <Pressable
                accessibilityLabel={`${evaluation.topicLabel} ${evaluation.number}번 카드로 이동`}
                accessibilityRole="button"
                key={evaluation.id}
                onPress={() => controller.openEvaluation(evaluation.index)}
                style={({pressed}) => [styles.correctionShortcut, pressed && styles.pressed]}>
                <View style={styles.correctionDot} />
                <Text style={styles.correctionName}>{evaluation.topicLabel}</Text>
                <Text numberOfLines={1} style={styles.correctionTitle}>{evaluation.title}</Text>
                <ChevronRight color={C.fix} size={15} strokeWidth={2} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.noCorrections}>
            <Text style={styles.noCorrectionsText}>
              {hasOptionalCoaching
                ? '우선 보완해야 할 항목은 없어요. 선택 제안은 카드에서 확인해 보세요.'
                : '이번 분석에서는 보완할 항목이 없어요.'}
            </Text>
          </View>
        )}

        {firstPossibility ? (
          <Text style={styles.summaryPossibility}>↗ {firstPossibility}</Text>
        ) : null}

        <View style={styles.summarySpacer} />

        <Pressable
          accessibilityLabel="피드백 카드를 처음부터 다시 보기"
          accessibilityRole="button"
          onPress={controller.restart}
          style={({pressed}) => [styles.restartButton, pressed && styles.pressed]}>
          <Text style={styles.restartButtonText}>처음부터 다시 보기</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="결과 요약 화면으로 돌아가기"
          accessibilityRole="button"
          onPress={controller.goHome}
          style={({pressed}) => [styles.homeButton, pressed && styles.pressed]}>
          <Text style={styles.homeButtonText}>결과 화면으로 돌아가기</Text>
        </Pressable>

        <View style={styles.summaryActions}>
          <Pressable
            accessibilityLabel="피드백 보고서 이미지 저장"
            accessibilityRole="button"
            accessibilityState={{busy: isShareBusy, disabled: isShareBusy}}
            disabled={isShareBusy}
            hitSlop={10}
            onPress={onSave}
            style={({pressed}) => [
              styles.summaryIconAction,
              isShareBusy && styles.actionDisabled,
              pressed && styles.pressed,
            ]}>
            <Download color={C.ink} size={17} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityLabel="피드백 보고서 공유"
            accessibilityRole="button"
            accessibilityState={{busy: isShareBusy, disabled: isShareBusy}}
            disabled={isShareBusy}
            hitSlop={10}
            onPress={onShare}
            style={({pressed}) => [
              styles.summaryIconAction,
              isShareBusy && styles.actionDisabled,
              pressed && styles.pressed,
            ]}>
            <Share2 color={C.ink} size={16} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityLabel="메이크업 기록에서 보기"
            accessibilityRole="button"
            accessibilityState={{busy: isShareBusy, disabled: isShareBusy}}
            disabled={isShareBusy}
            onPress={onOpenRecord}
            style={({pressed}) => [
              styles.summaryRecord,
              isShareBusy && styles.actionDisabled,
              pressed && styles.pressed,
            ]}>
            <CalendarDays color={C.primary} size={15} strokeWidth={2} />
            <Text style={styles.summaryRecordText}>메이크업 기록에서 보기 ›</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function RoundNavigationButton({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
  variant,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  icon: ReactNode;
  onPress: () => void;
  variant: 'previous' | 'next';
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.navigationButton,
        variant === 'next' ? styles.nextButton : styles.previousButton,
        disabled && styles.navigationButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionDisabled: {
    opacity: 0.46,
  },
  actionStepNumber: {
    ...tabularNumbers,
    alignItems: 'center',
    backgroundColor: C.chipBg,
    borderRadius: 999,
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 11,
    height: 22,
    lineHeight: 22,
    textAlign: 'center',
    width: 22,
  },
  actionStepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  actionStepText: {
    color: C.textMuted,
    flex: 1,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 12.5,
    lineHeight: 20,
  },
  actionSteps: {
    gap: 8,
    marginTop: 14,
  },
  animatedCard: {
    flex: 1,
  },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 36,
  },
  card: {
    backgroundColor: C.card,
    borderColor: C.borderCard,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    shadowColor: '#16303B',
    shadowOffset: {height: 8, width: 0},
    shadowOpacity: 0.1,
    shadowRadius: 28,
  },
  cardContent: {
    padding: 16,
  },
  cardFrame: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  copyBlock: {
    gap: 5,
    marginTop: 14,
  },
  copyLabel: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 11,
    letterSpacing: 0.7,
  },
  correctionDot: {
    backgroundColor: C.fix,
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  correctionHeading: {
    color: C.fixText,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 12,
  },
  correctionName: {
    color: C.fixText,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 13.5,
  },
  correctionShortcut: {
    alignItems: 'center',
    backgroundColor: C.fixChipBg,
    borderColor: C.fixChipBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 46,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  correctionShortcuts: {
    gap: 8,
    marginTop: 16,
  },
  correctionTitle: {
    color: C.fixText,
    flex: 1,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 11.5,
    opacity: 0.76,
  },
  description: {
    color: C.textMuted,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 13.5,
    lineHeight: 22,
    marginTop: 12,
  },
  evaluationRegion: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 12,
  },
  evaluationTitle: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 19,
  },
  evaluationTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  goodNote: {
    alignSelf: 'flex-start',
    backgroundColor: C.goodChipBg,
    borderRadius: 10,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  goodNoteText: {
    color: C.good,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 12,
  },
  guide: {
    backgroundColor: C.cardAlt,
    borderColor: C.borderSoft,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    padding: 13,
  },
  guideChip: {
    backgroundColor: C.chipBgAlt,
    borderRadius: 10,
    flex: 1,
    gap: 3,
    minWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  guideChipLabel: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 10,
  },
  guideChipText: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 11.5,
    lineHeight: 17,
  },
  guideChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  guidePossibility: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 12,
    lineHeight: 18,
  },
  guideRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  guideRowLabel: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 11,
    width: 34,
  },
  guideRowText: {
    color: C.textMuted,
    flex: 1,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 12.5,
    lineHeight: 19,
  },
  guideRows: {
    gap: 7,
  },
  guideTitle: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 13,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  homeButton: {
    alignItems: 'center',
    backgroundColor: C.primaryStrong,
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 48,
    shadowColor: C.primaryStrong,
    shadowOffset: {height: 6, width: 0},
    shadowOpacity: 0.24,
    shadowRadius: 18,
  },
  homeButtonText: {
    color: C.card,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 14,
  },
  indexLabel: {
    ...tabularNumbers,
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 12,
    minWidth: 38,
    textAlign: 'right',
  },
  lowConfidenceBanner: {
    alignItems: 'center',
    backgroundColor: C.amberBannerBg,
    borderColor: C.amberBannerBorder,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lowConfidenceBannerText: {
    color: C.amberText,
    flex: 1,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 12,
  },
  lowConfidenceMark: {
    color: C.amberText,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 13,
  },
  lowMetaChip: {
    backgroundColor: C.amberBannerBg,
    borderColor: C.amberBannerBorder,
    borderWidth: 1,
  },
  lowMetaText: {
    color: C.amberText,
  },
  metaChip: {
    backgroundColor: C.neutralChipBg,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  metaChipText: {
    color: C.neutralChipText,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 11,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 9,
  },
  navigationButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  navigationButtonDisabled: {
    opacity: 0.45,
  },
  nextButton: {
    backgroundColor: C.primaryStrong,
    shadowColor: C.primaryStrong,
    shadowOffset: {height: 4, width: 0},
    shadowOpacity: 0.3,
    shadowRadius: 14,
  },
  nextHint: {
    color: C.textMuted3,
    flex: 1,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 11.5,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  noCorrections: {
    backgroundColor: C.goodChipBg,
    borderRadius: 12,
    marginTop: 16,
    padding: 13,
  },
  noCorrectionsText: {
    color: C.goodText,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 12.5,
  },
  observationText: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  optionalNote: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 12,
    marginTop: 14,
  },
  pressed: {
    opacity: 0.74,
  },
  previousButton: {
    backgroundColor: C.card,
    borderColor: '#DDE6EA',
    borderWidth: 1,
  },
  progressFill: {
    backgroundColor: C.primaryStrong,
    borderRadius: 99,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 20,
    paddingTop: 2,
  },
  progressTrack: {
    backgroundColor: C.segTrack,
    borderRadius: 99,
    height: 4,
    overflow: 'hidden',
  },
  regionChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  regionChipActive: {
    backgroundColor: C.primaryStrong,
  },
  regionChipHitArea: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  regionChipText: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 10.5,
  },
  regionChipTextActive: {
    color: C.card,
  },
  regionChips: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  restartButton: {
    alignItems: 'center',
    borderColor: C.primaryStrong,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    minHeight: 46,
  },
  restartButtonText: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 14,
  },
  screen: {
    flex: 1,
  },
  summaryActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 44,
  },
  summaryContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  summaryEyebrow: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  summaryIconAction: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  summaryPossibility: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 11.5,
    lineHeight: 18,
    marginTop: 14,
  },
  summaryRecord: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minHeight: 44,
  },
  summaryRecordText: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 12.5,
  },
  summaryScore: {
    ...tabularNumbers,
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 56,
    lineHeight: 62,
  },
  summaryScoreMax: {
    color: C.textMuted2,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 15,
    paddingBottom: 7,
  },
  summaryScoreRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  summarySentence: {
    color: C.textMuted,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 13.5,
    lineHeight: 22,
    marginTop: 10,
  },
  summarySpacer: {
    flex: 1,
    minHeight: 18,
  },
  verdictBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verdictBadgeText: {
    color: C.card,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 11.5,
  },
});
