import {useCallback, useEffect, useRef, useState, type ReactNode, type RefObject} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  type ImageSourcePropType,
} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {
  CalendarDays,
  ChevronRight,
  Download,
  Share2,
  Sparkles,
} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  OptionalViewShot,
  type OptionalViewShotRef,
} from '../../../shared/ui/OptionalViewShot';
import {formatReportCreatedAtLabel} from '../../../shared/utils/reportDate';
import {getMakeupFeedbackAnalysisSourceLabel} from '../services/makeupFeedbackResultPresentation';
import {FeedbackEvidenceImage} from './FeedbackEvidenceImage';
import {FeedbackScoreAxisAccordion} from './FeedbackScoreAxisAccordion';
import {
  feedbackRedesignColors as C,
  feedbackRedesignFonts,
  feedbackRedesignGradients,
  feedbackVerdictColors,
  tabularNumbers,
} from './feedbackRedesignTheme';
import type {MakeupFeedbackRedesignEvaluation} from './makeupFeedbackResultViewModel';
import type {
  FeedbackRedesignTab,
  MakeupFeedbackRedesignController,
} from './useMakeupFeedbackRedesignController';

const tabLabels: Array<{id: FeedbackRedesignTab; label: string}> = [
  {id: 'all', label: '전체'},
  {id: 'skin', label: '피부'},
  {id: 'brow', label: '눈썹'},
  {id: 'eye', label: '눈'},
  {id: 'cheek', label: '볼'},
  {id: 'lip', label: '립'},
];

const FEEDBACK_CAPTURE_OPTIONS = {
  format: 'jpg',
  quality: 0.95,
  result: 'tmpfile',
  useRenderInContext: true,
} as const;

export function MakeupFeedbackRedesignHomeScreen({
  captureRef,
  captureRequestId,
  controller,
  createdAt,
  isShareBusy,
  onCaptureDocumentSettledChange,
  onOpenRecord,
  onSave,
  onShare,
}: {
  captureRef: RefObject<OptionalViewShotRef | null>;
  captureRequestId: number;
  controller: MakeupFeedbackRedesignController;
  createdAt?: string;
  isShareBusy: boolean;
  onCaptureDocumentSettledChange: (settled: boolean) => void;
  onOpenRecord: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  const vm = controller.viewModel;
  const firstStrength = vm.strengths[0] ?? null;
  const firstCorrection = vm.priorityCorrections[0] ?? null;
  const analysisSourceLabel = getMakeupFeedbackAnalysisSourceLabel(
    vm.analysisSource,
  );
  const displayedScore = isShareBusy ? vm.score : controller.score;
  const visibleGroups = isShareBusy ? vm.groups : controller.visibleGroups;
  const selectedTab = isShareBusy ? 'all' : controller.selectedTab;
  const availableTabs = tabLabels.filter(
    tab => tab.id === 'all' || vm.groups.some(group => group.id === tab.id),
  );
  const captureReadinessRef = useRef({
    details: false,
    hero: false,
    requestId: captureRequestId,
  });

  if (captureReadinessRef.current.requestId !== captureRequestId) {
    captureReadinessRef.current = {
      details: false,
      hero: false,
      requestId: captureRequestId,
    };
  }

  const updateCaptureReadiness = useCallback((
    asset: 'details' | 'hero',
    settled: boolean,
  ) => {
    if (
      !isShareBusy
      || captureReadinessRef.current.requestId !== captureRequestId
    ) return;

    captureReadinessRef.current[asset] = settled;
    onCaptureDocumentSettledChange(
      captureReadinessRef.current.details
      && captureReadinessRef.current.hero,
    );
  }, [captureRequestId, isShareBusy, onCaptureDocumentSettledChange]);

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      style={styles.scrollView}>
      <OptionalViewShot
        options={FEEDBACK_CAPTURE_OPTIONS}
        ref={captureRef}
        style={styles.captureArea}>
        <View
          pointerEvents={isShareBusy ? 'none' : 'auto'}
          style={styles.captureContent}>
      <View style={styles.goalHeader}>
        <View style={styles.analysisBadge}>
          <Sparkles color={C.primary} size={13} strokeWidth={2} />
          <Text style={styles.analysisBadgeText}>{analysisSourceLabel}</Text>
        </View>
        {vm.goalLabel ? (
          <View accessibilityLabel={`분석 기준 ${vm.goalLabel}`} style={styles.goalChip}>
            <Text numberOfLines={1} style={styles.goalChipText}>
              분석 기준 · {vm.goalLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <FeedbackEvidenceImage
        accessibilityLabel="분석에 사용한 메이크업 사진"
        height={440}
        key={isShareBusy ? 'capture-hero:' + captureRequestId : 'display-hero'}
        onSettledChange={settled => updateCaptureReadiness('hero', settled)}
        rounded={false}
        source={vm.imageSource}
      />

      <LinearGradient
        colors={[...feedbackRedesignGradients.scoreHeader.colors]}
        end={{x: 0.5, y: 1}}
        locations={[...feedbackRedesignGradients.scoreHeader.locations]}
        start={{x: 0.5, y: 0}}
        style={styles.scoreSection}>
        <Text style={styles.eyebrow}>오늘의 메이크업</Text>
        <Text style={styles.createdAt}>
          {formatReportCreatedAtLabel(createdAt, {includeTime: true})}
        </Text>
        <View style={styles.scoreRow}>
          <Text accessibilityLabel={`종합 점수 ${displayedScore}점`} style={styles.score}>
            {displayedScore}
          </Text>
          <Text style={styles.scoreMax}>/ 100</Text>
        </View>

        {firstStrength || firstCorrection ? (
          <View style={styles.summaryCard}>
            {firstStrength ? (
              <SummaryLine
                color={C.good}
                label="잘한 점"
                text={firstStrength.title}
              />
            ) : null}
            {firstCorrection ? (
              <Pressable
                accessibilityLabel={`먼저 보완할 점 ${firstCorrection.topicLabel}, ${firstCorrection.number}번 카드로 이동`}
                accessibilityRole="button"
                onPress={() => controller.openEvaluation(firstCorrection.index)}
                style={({pressed}) => [
                  styles.summaryLinkButton,
                  pressed && styles.pressed,
                ]}>
                <SummaryLine
                  color={C.fix}
                  label="먼저 보완할 점"
                  link={`${firstCorrection.number}번 카드에서 ›`}
                  text={firstCorrection.title}
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {vm.axes.length > 0 ? (
          <View style={styles.axisList}>
            {vm.axes.map(axis => (
              <FeedbackScoreAxisAccordion
                axis={axis}
                isOpen={controller.openAxisId === axis.id}
                key={axis.id}
                onJumpToEvaluation={
                  axis.jumpToEvaluationIndex === null
                    ? undefined
                    : () => controller.openEvaluation(axis.jumpToEvaluationIndex!)
                }
                onToggle={() => {
                  if (!isShareBusy) controller.toggleAxis(axis.id);
                }}
                reduceMotion={isShareBusy || controller.reduceMotion}
              />
            ))}
          </View>
        ) : vm.summarySentence ? (
          <View style={styles.legacySummary}>
            <Text style={styles.legacySummaryLabel}>AI 종합 판단</Text>
            <Text style={styles.legacySummaryText}>{vm.summarySentence}</Text>
          </View>
        ) : null}

        {vm.scoreFormula ? (
          <View style={styles.formulaBlock}>
            <Text style={styles.formulaLabel}>점수 계산</Text>
            <Text style={styles.formulaText}>{vm.scoreFormula}</Text>
            <Text style={styles.formulaNote}>
              하나의 사진 관찰이 관련된 여러 기준에 반영될 수 있어요. 얼굴 생김새는 평가하지 않아요.
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.detailSection}>
        {vm.captureQuality &&
        (vm.captureQuality.issues.length > 0 ||
          vm.captureQuality.colorConfidence !== 'high') ? (
          <View style={styles.qualityNotice}>
            <Text style={styles.qualityTitle}>사진 조건 참고</Text>
            {vm.captureQuality.issues.map(issue => (
              <Text key={issue.code} style={styles.qualityText}>• {issue.message}</Text>
            ))}
            <Text style={styles.qualityMeta}>
              색상 신뢰도 {confidenceLevelLabel(vm.captureQuality.colorConfidence)} · 점수 감점에는 사용하지 않았어요
            </Text>
          </View>
        ) : null}

        {!vm.isCompleteTopicSet ? (
          <View style={styles.qualityNotice}>
            <Text style={styles.qualityTitle}>일부 항목을 표시하지 못했어요</Text>
            <Text style={styles.qualityText}>
              저장된 보고서에 {vm.missingTopicIds.length}개 항목이 없어 확인 가능한 내용만 보여드려요.
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityLabel={`${vm.evaluations.length}개 항목을 피부부터 차례로 보기`}
          accessibilityRole="button"
          onPress={controller.startSlides}
          style={({pressed}) => [styles.walkthroughButton, pressed && styles.pressed]}>
          <Text style={styles.walkthroughText}>
            피부부터 차례로 보기 · {vm.evaluations.length}장 ›
          </Text>
        </Pressable>

        <View accessibilityRole="tablist" style={styles.tabs}>
          {availableTabs.map(tab => {
            const isActive = selectedTab === tab.id;

            return (
              <Pressable
                accessibilityLabel={`${tab.label} 항목 보기`}
                accessibilityRole="tab"
                accessibilityState={{selected: isActive}}
                key={tab.id}
                onPress={() => controller.selectTab(tab.id)}
                style={({pressed}) => [
                  styles.tab,
                  isActive && styles.tabActive,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.groupList}>
          {visibleGroups.map(group => (
            <View key={group.id} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{group.label}</Text>
                <Text style={styles.groupCount}>{group.evaluations.length}</Text>
              </View>
              <View style={styles.itemList}>
                {group.evaluations.map(evaluation => (
                  <EvaluationRow
                    evaluation={evaluation}
                    key={evaluation.id}
                    onPress={() => controller.openEvaluation(evaluation.index)}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
      {isShareBusy ? (
        <CaptureEvaluationDetails
          evaluations={vm.evaluations}
          imageSource={vm.imageSource}
          key={'capture-details:' + captureRequestId}
          coachingPoints={vm.coachingPoints}
          onEvidenceSettledChange={settled => {
            updateCaptureReadiness('details', settled);
          }}
          priorityCorrections={vm.priorityCorrections}
          score={vm.score}
          summarySentence={vm.summarySentence}
        />
      ) : null}
        </View>
      </OptionalViewShot>

      <View style={styles.actionSection}>
        <View style={styles.actionRow}>
          <IconAction
            accessibilityLabel="피드백 보고서 이미지 저장"
            disabled={isShareBusy}
            icon={<Download color={C.ink} size={17} strokeWidth={2} />}
            onPress={onSave}
          />
          <IconAction
            accessibilityLabel="피드백 보고서 공유"
            disabled={isShareBusy}
            icon={<Share2 color={C.ink} size={16} strokeWidth={2} />}
            onPress={onShare}
          />
          <Pressable
            accessibilityLabel="메이크업 기록에서 보기"
            accessibilityRole="button"
            accessibilityState={{busy: isShareBusy, disabled: isShareBusy}}
            disabled={isShareBusy}
            onPress={onOpenRecord}
            style={({pressed}) => [
              styles.recordButton,
              isShareBusy && styles.iconButtonDisabled,
              pressed && styles.pressed,
            ]}>
            <CalendarDays color={C.primary} size={16} strokeWidth={2} />
            <Text style={styles.recordButtonText}>메이크업 기록에서 보기 ›</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function SummaryLine({
  color,
  label,
  link,
  text,
}: {
  color: string;
  label: string;
  link?: string;
  text: string;
}) {
  return (
    <View style={styles.summaryLine}>
      <View style={[styles.dot, {backgroundColor: color}]} />
      <Text style={styles.summaryText}>
        <Text style={[styles.summaryLabel, {color}]}>{label}</Text>
        {` · ${text}`}
        {link ? <Text style={styles.summaryLink}>{` ${link}`}</Text> : null}
      </Text>
    </View>
  );
}

function EvaluationRow({
  evaluation,
  onPress,
}: {
  evaluation: MakeupFeedbackRedesignEvaluation;
  onPress: () => void;
}) {
  const verdict = feedbackVerdictColors[evaluation.status];
  const lowConfidence = evaluation.confidence !== null && evaluation.confidence < 0.6;

  return (
    <Pressable
      accessibilityLabel={`${evaluation.number}번 ${evaluation.topicLabel}, ${evaluation.statusLabel}, 상세 보기`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.itemRow, pressed && styles.pressed]}>
      <Text style={styles.itemNumber}>{evaluation.number}</Text>
      <View style={[styles.dot, {backgroundColor: verdict.dot}]} />
      <Text style={styles.itemName}>{evaluation.topicLabel}</Text>
      <Text style={[styles.itemVerdict, {color: verdict.foreground}]}>
        {evaluation.statusLabel}
      </Text>
      <View style={styles.itemConfidence}>
        {lowConfidence ? <Text style={styles.warningMark}>!</Text> : null}
        <Text style={[styles.confidenceText, lowConfidence && styles.confidenceLow]}>
          {evaluation.confidenceLabel ?? '신뢰도 정보 없음'}
        </Text>
      </View>
      <ChevronRight color={C.chevron} size={15} strokeWidth={2} />
    </Pressable>
  );
}

function CaptureEvaluationDetails({
  coachingPoints,
  evaluations,
  imageSource,
  onEvidenceSettledChange,
  priorityCorrections,
  score,
  summarySentence,
}: {
  coachingPoints: MakeupFeedbackRedesignEvaluation[];
  evaluations: MakeupFeedbackRedesignEvaluation[];
  imageSource: ImageSourcePropType;
  onEvidenceSettledChange: (settled: boolean) => void;
  priorityCorrections: MakeupFeedbackRedesignEvaluation[];
  score: number;
  summarySentence?: string | null;
}) {
  const [evidenceReadiness, setEvidenceReadiness] = useState<
    Record<string, boolean>
  >({});
  const allEvidenceSettled = evaluations.every(
    evaluation => evidenceReadiness[evaluation.id] === true,
  );
  const firstPossibility = priorityCorrections.find(
    evaluation => evaluation.guide?.possibility,
  )?.guide?.possibility;
  const hasOptionalCoaching = coachingPoints.some(
    evaluation => evaluation.status === 'optional',
  );

  useEffect(() => {
    onEvidenceSettledChange(allEvidenceSettled);
  }, [allEvidenceSettled, onEvidenceSettledChange]);

  const updateEvidenceReadiness = useCallback((
    evaluationId: string,
    settled: boolean,
  ) => {
    setEvidenceReadiness(current =>
      current[evaluationId] === settled
        ? current
        : {...current, [evaluationId]: settled},
    );
  }, []);

  return (
    <View
      accessibilityLabel="저장용 전체 피드백 슬라이드 문서"
      style={styles.captureDetails}>
      <Text style={styles.captureDetailsTitle}>세부 분석 전체</Text>
      <Text style={styles.captureDetailsDescription}>
        피부부터 립까지 가로 슬라이드에서 확인하는 모든 평가 카드와 최종 요약을 한 문서에 담았어요.
      </Text>

      {evaluations.map(evaluation => {
        const verdict = feedbackVerdictColors[evaluation.status];
        const crop = evaluation.primaryCrop;
        const useFullPhoto = evaluation.regionId === 'skin' || !crop;
        const isLowConfidence =
          evaluation.confidence !== null && evaluation.confidence < 0.6;

        return (
          <View key={evaluation.id} style={styles.captureDetailCard}>
            {isLowConfidence && evaluation.confidencePercent !== null ? (
              <View style={styles.captureLowConfidence}>
                <Text style={styles.captureLowConfidenceMark}>!</Text>
                <Text style={styles.captureLowConfidenceText}>
                  판독 신뢰도 낮음 {evaluation.confidencePercent}% · 가볍게 참고해 주세요.
                </Text>
              </View>
            ) : null}

            <View style={styles.captureDetailHeader}>
              <Text style={styles.captureDetailNumber}>{evaluation.number}</Text>
              <View style={styles.captureDetailTitleGroup}>
                <Text style={styles.captureDetailRegion}>{evaluation.regionLabel}</Text>
                <Text style={styles.captureDetailTitle}>{evaluation.topicLabel}</Text>
              </View>
              <View style={[styles.captureDetailVerdict, {backgroundColor: verdict.solid}]}>
                <Text style={styles.captureDetailVerdictText}>{evaluation.statusLabel}</Text>
              </View>
            </View>

            <FeedbackEvidenceImage
              accessibilityLabel={evaluation.topicLabel + ' 분석 근거 사진'}
              height={useFullPhoto ? 300 : 230}
              imageSize={useFullPhoto ? undefined : crop?.imageSize}
              label={
                useFullPhoto && evaluation.regionId !== 'skin'
                  ? '원본 사진 · 정밀 근거 없음'
                  : useFullPhoto
                    ? undefined
                    : crop?.label
              }
              onSettledChange={settled => {
                updateEvidenceReadiness(evaluation.id, settled);
              }}
              region={useFullPhoto ? undefined : crop?.region}
              source={crop?.source ?? imageSource}
              topicId={evaluation.topicId}
            />

            <View style={styles.captureMetaRow}>
              {evaluation.impactLabel ? (
                <View style={styles.captureMetaChip}>
                  <Text style={styles.captureMetaText}>
                    {'영향 ' + evaluation.impactLabel}
                  </Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.captureMetaChip,
                  isLowConfidence && styles.captureLowMetaChip,
                ]}>
                <Text
                  style={[
                    styles.captureMetaText,
                    isLowConfidence && styles.captureLowMetaText,
                  ]}>
                  {evaluation.confidenceLabel ?? '신뢰도 정보 없음'}
                </Text>
              </View>
            </View>

            {evaluation.goalCriteria.length > 0 ? (
              <View style={styles.captureCopyBlock}>
                <Text style={styles.captureCopyLabel}>분석 기준</Text>
                {evaluation.goalCriteria.map(criterion => (
                  <Text key={criterion.id} style={styles.captureCopyText}>
                    {'• ' + criterion.criterion}
                  </Text>
                ))}
              </View>
            ) : null}

            {evaluation.observations.length > 0 ? (
              <View style={styles.captureCopyBlock}>
                <Text style={styles.captureCopyLabel}>사진에서 확인한 점</Text>
                {evaluation.observations.map(observation => (
                  <Text key={observation.id} style={styles.captureCopyText}>
                    {'• ' + observation.text}
                  </Text>
                ))}
              </View>
            ) : evaluation.visibilityReason ? (
              <View style={styles.captureCopyBlock}>
                <Text style={styles.captureCopyLabel}>판단 범위</Text>
                <Text style={styles.captureCopyText}>
                  {evaluation.visibilityReason}
                </Text>
              </View>
            ) : null}

            <Text style={styles.captureDescription}>{evaluation.description}</Text>

            {evaluation.guide ? (
              <View style={styles.captureGuide}>
                <Text style={styles.captureGuideTitle}>이렇게 해보세요</Text>
                {evaluation.guide.chips.map(chip => (
                  <View key={chip.id} style={styles.captureGuideRow}>
                    <Text style={styles.captureGuideLabel}>{chip.label}</Text>
                    <Text style={styles.captureGuideText}>{chip.text}</Text>
                  </View>
                ))}
                {evaluation.guide.rows.map(row => (
                  <View key={row.id} style={styles.captureGuideRow}>
                    <Text style={styles.captureGuideLabel}>{row.label}</Text>
                    <Text style={styles.captureGuideText}>{row.text}</Text>
                  </View>
                ))}
                {evaluation.guide.instructions.map((step, index) => (
                  <Text
                    key={evaluation.id + ':step:' + index}
                    style={styles.captureCopyText}>
                    {String(index + 1) + '. ' + step}
                  </Text>
                ))}
                <Text style={styles.capturePossibility}>
                  {'✨ ' + evaluation.guide.possibility}
                </Text>
              </View>
            ) : evaluation.actionSteps.length > 0 ? (
              <View style={styles.captureGuide}>
                <Text style={styles.captureGuideTitle}>이렇게 해보세요</Text>
                {evaluation.actionSteps.map((step, index) => (
                  <Text
                    key={evaluation.id + ':action:' + index}
                    style={styles.captureCopyText}>
                    {String(index + 1) + '. ' + step}
                  </Text>
                ))}
              </View>
            ) : null}

            {evaluation.status === 'strength' ? (
              <View style={styles.captureGoodNote}>
                <Text style={styles.captureGoodNoteText}>
                  잘하고 있어요. 이대로 유지해 보세요.
                </Text>
              </View>
            ) : null}

            {evaluation.status === 'optional' ? (
              <Text style={styles.captureOptionalNote}>
                선택적으로 적용해도 좋아요. 종합 점수의 근거로 사용하지 않아요.
              </Text>
            ) : null}
          </View>
        );
      })}

      <View style={styles.captureSummaryCard}>
        <Text style={styles.captureSummaryEyebrow}>
          {evaluations.length + '개 모두 확인했어요'}
        </Text>
        <View style={styles.captureSummaryScoreRow}>
          <Text style={styles.captureSummaryScore}>{score}</Text>
          <Text style={styles.captureSummaryScoreMax}>/ 100</Text>
        </View>
        {summarySentence ? (
          <Text style={styles.captureSummarySentence}>{summarySentence}</Text>
        ) : null}

        {priorityCorrections.length > 0 ? (
          <View style={styles.captureCorrectionList}>
            <Text style={styles.captureGuideTitle}>먼저 보완할 점</Text>
            {priorityCorrections.map(evaluation => (
              <View key={evaluation.id} style={styles.captureCorrectionRow}>
                <View style={styles.captureCorrectionDot} />
                <View style={styles.captureCorrectionCopy}>
                  <Text style={styles.captureCorrectionName}>
                    {evaluation.topicLabel}
                  </Text>
                  <Text style={styles.captureCorrectionTitle}>
                    {evaluation.title}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.captureSummarySentence}>
            {hasOptionalCoaching
              ? '우선 보완해야 할 항목은 없어요. 선택 제안은 각 카드에서 확인해 보세요.'
              : '이번 분석에서는 보완할 항목이 없어요.'}
          </Text>
        )}

        {firstPossibility ? (
          <Text style={styles.capturePossibility}>
            {'✨ ' + firstPossibility}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
function IconAction({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{busy: disabled, disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.iconButton,
        disabled && styles.iconButtonDisabled,
        pressed && styles.pressed,
      ]}>
      {icon}
    </Pressable>
  );
}

function confidenceLevelLabel(value: 'low' | 'medium' | 'high') {
  return value === 'high' ? '높음' : value === 'medium' ? '보통' : '낮음';
}

const styles = StyleSheet.create({
  actionSection: {
    backgroundColor: C.cardAlt,
    gap: 14,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  captureDetails: {
    backgroundColor: C.cardAlt,
    gap: 16,
    padding: 16,
  },
  captureDetailsDescription: {
    color: C.textMuted,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 12.5,
    lineHeight: 19,
  },
  captureDetailsTitle: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 21,
  },
  captureDetailCard: {
    backgroundColor: C.card,
    borderColor: C.borderCard,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  captureDetailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  captureDetailNumber: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 18,
    minWidth: 26,
  },
  captureDetailRegion: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 11,
  },
  captureDetailTitle: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 17,
  },
  captureDetailTitleGroup: {
    flex: 1,
    gap: 2,
  },
  captureDetailVerdict: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  captureDetailVerdictText: {
    color: C.card,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 11,
  },
  captureCopyBlock: {
    gap: 5,
  },
  captureCopyLabel: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 11,
  },
  captureCopyText: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 12.5,
    lineHeight: 19,
  },
  captureDescription: {
    color: C.textMuted,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 13,
    lineHeight: 21,
  },
  captureGuide: {
    backgroundColor: C.cardAlt,
    borderColor: C.borderSoft,
    borderRadius: 13,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  captureGuideLabel: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 10.5,
    width: 46,
  },
  captureGuideRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  captureGuideText: {
    color: C.textMuted,
    flex: 1,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  captureGuideTitle: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 13,
  },
  capturePossibility: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 12,
    lineHeight: 18,
  },
  captureCorrectionCopy: {
    flex: 1,
    gap: 2,
  },
  captureCorrectionDot: {
    backgroundColor: C.fix,
    borderRadius: 999,
    height: 8,
    marginTop: 5,
    width: 8,
  },
  captureCorrectionList: {
    gap: 8,
  },
  captureCorrectionName: {
    color: C.fixText,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 13.5,
  },
  captureCorrectionRow: {
    alignItems: 'flex-start',
    backgroundColor: C.fixChipBg,
    borderColor: C.fixChipBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  captureCorrectionTitle: {
    color: C.fixText,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 11.5,
    lineHeight: 17,
    opacity: 0.76,
  },
  captureGoodNote: {
    alignSelf: 'flex-start',
    backgroundColor: C.goodChipBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  captureGoodNoteText: {
    color: C.good,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 12,
  },
  captureLowConfidence: {
    alignItems: 'center',
    backgroundColor: C.amberBannerBg,
    borderColor: C.amberBannerBorder,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  captureLowConfidenceMark: {
    color: C.amberText,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 13,
  },
  captureLowConfidenceText: {
    color: C.amberText,
    flex: 1,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 12,
  },
  captureLowMetaChip: {
    backgroundColor: C.amberBannerBg,
    borderColor: C.amberBannerBorder,
    borderWidth: 1,
  },
  captureLowMetaText: {
    color: C.amberText,
  },
  captureMetaChip: {
    backgroundColor: C.neutralChipBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  captureMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  captureMetaText: {
    color: C.textMuted4,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 11,
  },
  captureOptionalNote: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 11.5,
    lineHeight: 18,
  },
  captureSummaryCard: {
    backgroundColor: C.card,
    borderColor: C.borderCard,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  captureSummaryEyebrow: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 12,
  },
  captureSummaryScore: {
    ...tabularNumbers,
    color: C.ink,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 40,
  },
  captureSummaryScoreMax: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 16,
    marginBottom: 6,
  },
  captureSummaryScoreRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 4,
  },
  captureSummarySentence: {
    color: C.textMuted,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 13,
    lineHeight: 21,
  },
  captureArea: {
    backgroundColor: C.card,
    width: '100%',
  },
  captureContent: {
    backgroundColor: C.card,
  },
  analysisBadge: {
    alignItems: 'center',
    backgroundColor: C.chipBg,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  analysisBadgeText: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 11,
  },
  axisList: {
    gap: 8,
    marginTop: 16,
  },
  confidenceLow: {
    color: C.amberText,
  },
  confidenceText: {
    color: C.textMuted4,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 11,
  },
  detailSection: {
    backgroundColor: C.cardAlt,
    marginTop: 8,
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  dot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  eyebrow: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  createdAt: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 11,
    marginTop: 6,
  },
  formulaBlock: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderColor: C.borderCard,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
    marginTop: 10,
    padding: 12,
  },
  formulaLabel: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 11,
  },
  formulaNote: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 10.5,
    lineHeight: 16,
  },
  formulaText: {
    color: C.textMuted,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 11.5,
    lineHeight: 18,
  },
  goalChip: {
    borderColor: C.borderSoft,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    maxWidth: 230,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  goalChipText: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 11,
  },
  goalHeader: {
    alignItems: 'center',
    backgroundColor: C.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  group: {
    gap: 8,
  },
  groupCount: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 11,
  },
  groupHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 7,
  },
  groupList: {
    gap: 18,
    marginTop: 18,
  },
  groupTitle: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 13,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: C.card,
    borderColor: C.borderCard,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconButtonDisabled: {
    opacity: 0.46,
  },
  itemConfidence: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  itemList: {
    gap: 8,
  },
  itemName: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 14,
  },
  itemNumber: {
    ...tabularNumbers,
    color: C.chevron,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 11,
    width: 19,
  },
  itemRow: {
    alignItems: 'center',
    backgroundColor: C.card,
    borderColor: C.borderCard,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 54,
    paddingHorizontal: 13,
    paddingVertical: 11,
    shadowColor: '#16303B',
    shadowOffset: {height: 1, width: 0},
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  itemVerdict: {
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 10.5,
  },
  legacySummary: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: C.borderCard,
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
    marginTop: 16,
    padding: 14,
  },
  legacySummaryLabel: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 11,
  },
  legacySummaryText: {
    color: C.textMuted,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.76,
  },
  qualityMeta: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 11,
    lineHeight: 17,
  },
  qualityNotice: {
    backgroundColor: C.amberBannerBg,
    borderColor: C.amberBannerBorder,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
    marginBottom: 12,
    padding: 12,
  },
  qualityText: {
    color: C.amberText,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  qualityTitle: {
    color: C.amberText,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 12,
  },
  recordButton: {
    alignItems: 'center',
    backgroundColor: C.chipBg,
    borderRadius: 12,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 10,
  },
  recordButtonText: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 13,
  },
  score: {
    ...tabularNumbers,
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 94,
    letterSpacing: -4.2,
    lineHeight: 99,
  },
  scoreMax: {
    color: C.textMuted2,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 20,
    paddingBottom: 13,
  },
  scoreRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  scoreSection: {
    paddingBottom: 12,
    paddingHorizontal: 24,
    paddingTop: 26,
  },
  scrollContent: {
    backgroundColor: C.card,
    paddingBottom: 0,
  },
  scrollView: {
    backgroundColor: C.card,
    flex: 1,
  },
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    shadowColor: C.primary,
    shadowOffset: {height: 2, width: 0},
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  summaryLabel: {
    fontFamily: feedbackRedesignFonts.semibold,
  },
  summaryLinkButton: {
    justifyContent: 'center',
    minHeight: 44,
  },
  summaryLine: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 9,
  },
  summaryLink: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 12,
  },
  summaryText: {
    color: C.textMuted,
    flex: 1,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 13.5,
    lineHeight: 20,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  tabActive: {
    backgroundColor: C.card,
  },
  tabText: {
    color: C.textMuted4,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 12,
  },
  tabTextActive: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
  },
  tabs: {
    backgroundColor: C.chipBgAlt,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 2,
    marginTop: 14,
    padding: 4,
  },
  walkthroughButton: {
    alignItems: 'center',
    backgroundColor: C.primaryStrong,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 50,
    shadowColor: C.primaryStrong,
    shadowOffset: {height: 6, width: 0},
    shadowOpacity: 0.24,
    shadowRadius: 18,
  },
  walkthroughText: {
    color: C.card,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 14.5,
  },
  warningMark: {
    color: C.amberText,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 11,
  },
});
