import {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Heart,
  Share2,
  Sparkles,
} from 'lucide-react-native';
import {Button, Text, View} from 'tamagui';

import {
  loadOptionalMediaLibraryModule,
  loadOptionalSharingModule,
} from '../../../shared/services/optionalNativeShareModules';
import {
  colors,
  feedbackColors,
  feedbackRadius,
  feedbackSpacing,
  iconSize,
  radius,
  shadows,
  spacing,
  typography,
} from '../../../shared/theme';
import {OptionalViewShot, type OptionalViewShotRef} from '../../../shared/ui/OptionalViewShot';
import {SavedImagePreviewSheet} from '../../../shared/ui/SavedImagePreviewSheet';
import {
  MakeupFeedbackCorrectionGuideDetails,
  MakeupFeedbackPriorityCorrectionCard,
} from '../components/MakeupFeedbackCorrectionGuideCard';
import {
  MakeupFeedbackEvidencePreview,
  type MakeupFeedbackEvidenceMedia,
} from '../components/MakeupFeedbackEvidencePreview';
import {MakeupFeedbackScoreBreakdownCard} from '../components/MakeupFeedbackScoreBreakdownCard';
import {MakeupFeedbackScreenScaffold} from '../components/MakeupFeedbackScreenScaffold';
import {
  getMakeupFeedbackAnalysisSourceLabel,
  getMakeupFeedbackEvidenceRows,
  getPriorityMakeupFeedbackPoint,
} from '../services/makeupFeedbackResultPresentation';
import type {
  MakeupFeedbackCorrectionPoint,
  MakeupFeedbackConfidenceLevel,
  MakeupFeedbackIntensity,
  MakeupFeedbackEvaluation,
  MakeupFeedbackResult,
  MakeupFeedbackStrength,
} from '../types';

type MakeupFeedbackResultScreenProps = {
  onHeaderShareActionChange?: (action: MakeupFeedbackHeaderShareAction | null) => void;
  onOpenMakeupJourney: () => void;
  result: MakeupFeedbackResult;
};

type MakeupFeedbackHeaderShareAction = () => void;
type MakeupFeedbackShareTarget = 'save-image' | 'share-report';
type MakeupFeedbackShareFeedback = {
  message: string;
  tone: 'success' | 'error';
};

const FEEDBACK_CAPTURE_OPTIONS = {
  format: 'jpg',
  quality: 0.95,
  result: 'tmpfile',
} as const;

const shareTargetLabels: Record<MakeupFeedbackShareTarget, string> = {
  'save-image': '이미지 저장',
  'share-report': '공유하기',
};

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function captureFeedbackImage(captureRef: {current: OptionalViewShotRef | null}) {
  const captureTarget = captureRef.current;
  const capture = captureTarget?.capture;

  if (!captureTarget || !capture) {
    throw new Error('피드백 이미지를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  await waitForNextFrame();
  const imageUri = await capture.call(captureTarget);

  if (!imageUri) {
    throw new Error('피드백 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return imageUri;
}

async function requestFeedbackImageSavePermission() {
  const mediaLibraryModule = loadOptionalMediaLibraryModule();

  if (!mediaLibraryModule) {
    throw new Error('현재 설치된 앱에 사진 저장 모듈이 포함되어 있지 않아요. 앱을 새로 설치한 뒤 다시 시도해 주세요.');
  }

  const currentPermission = await mediaLibraryModule.getPermissionsAsync(true, ['photo']);
  const permission = currentPermission.granted
    ? currentPermission
    : await mediaLibraryModule.requestPermissionsAsync(true, ['photo']);

  if (!permission.granted) {
    throw new Error('사진 저장 권한이 필요합니다. 설정에서 사진 접근을 허용해 주세요.');
  }
}

async function saveFeedbackImageToLibrary(imageUri: string) {
  const mediaLibraryModule = loadOptionalMediaLibraryModule();

  if (!mediaLibraryModule) {
    throw new Error('현재 설치된 앱에 사진 저장 모듈이 포함되어 있지 않아요. 앱을 새로 설치한 뒤 다시 시도해 주세요.');
  }

  try {
    await mediaLibraryModule.saveToLibraryAsync(imageUri);
  } catch (error) {
    console.info('[aura:makeup-feedback] share:save-to-library-failed', {
      imageUri,
      message: error instanceof Error ? error.message : String(error),
    });
    await mediaLibraryModule.createAssetAsync(imageUri);
  }
}

async function shareFeedbackImageWithSystemSheet(imageUri: string) {
  const title = 'AI 피드백 리포트';
  const sharingModule = loadOptionalSharingModule();
  const isSharingAvailable = sharingModule
    ? await sharingModule.isAvailableAsync()
    : false;

  if (sharingModule && isSharingAvailable) {
    await sharingModule.shareAsync(imageUri, {
      dialogTitle: title,
      mimeType: 'image/jpeg',
      UTI: 'public.jpeg',
    });
    return;
  }

  await Share.share({title, url: imageUri});
}

function getShareErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : '공유 작업을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
function getCaptureColorConfidenceLabel(
  confidence: MakeupFeedbackConfidenceLevel,
): string | undefined {
  if (confidence === 'high') {
    return '높음';
  }

  if (confidence === 'medium') {
    return '보통';
  }

  return confidence === 'low' ? '낮음' : undefined;
}

const goalIntensityLabels: Record<MakeupFeedbackIntensity, string> = {
  light: '은은한 표현',
  medium: '균형 잡힌 표현',
  bold: '또렷한 표현',
};

function getGoalIntensityLabel(intensity: MakeupFeedbackIntensity) {
  return goalIntensityLabels[intensity];
}



export function MakeupFeedbackResultScreen({
  onHeaderShareActionChange,
  onOpenMakeupJourney,
  result,
}: MakeupFeedbackResultScreenProps) {
  const {width} = useWindowDimensions();
  const captureRef = useRef<OptionalViewShotRef | null>(null);
  const [savedImagePreviewUri, setSavedImagePreviewUri] = useState<string | null>(
    null,
  );
  const evaluationByTopicId = new Map(
    result.evaluations.map(evaluation => [evaluation.topicId, evaluation]),
  );
  const goalCriteriaById = new Map(
    (result.interpretedGoal?.dynamicCriteria ?? []).map(criterion => [
      criterion.id,
      criterion.criterion,
    ]),
  );
  const [openPointIds, setOpenPointIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [openStrengthIds, setOpenStrengthIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [isOverallJudgmentExpanded, setIsOverallJudgmentExpanded] = useState(false);
  const [activeShareTarget, setActiveShareTarget] = useState<MakeupFeedbackShareTarget | null>(null);
  const [shareFeedback, setShareFeedback] = useState<MakeupFeedbackShareFeedback | null>(null);
  const analysisSourceLabel = getMakeupFeedbackAnalysisSourceLabel(result.analysisSource);
  const photoWidth = width;
  const photoHeight = Math.round(photoWidth);
  const captureQuality = result.captureQuality;
  const evidenceMedia: MakeupFeedbackEvidenceMedia | undefined =
    result.analysisImageSize && result.evidenceRegions?.length
      ? {
          imageSize: result.analysisImageSize,
          regions: result.evidenceRegions,
          source: result.uploadedImage,
        }
      : undefined;
  const shouldShowCaptureQualityNotice = Boolean(
    captureQuality &&
      (captureQuality.issues.length > 0 || captureQuality.colorConfidence !== 'high'),
  );
  const priorityPoint = getPriorityMakeupFeedbackPoint(result.evaluations, result.points);
  const strengthTakeaway = result.summary?.strengthSummary ?? result.strengths[0]?.title;
  const improvementTakeaway = priorityPoint?.title ?? result.summary?.improvementSummary;


  const handleShareAction = useCallback(async (target: MakeupFeedbackShareTarget) => {
    if (activeShareTarget) {
      Alert.alert('공유 준비 중', '이전 작업을 처리하고 있어요. 잠시만 기다려 주세요.');
      return;
    }

    setActiveShareTarget(target);
    setShareFeedback(null);

    try {
      if (target === 'save-image') {
        await requestFeedbackImageSavePermission();
      }

      const imageUri = await captureFeedbackImage(captureRef);

      if (target === 'save-image') {
        await saveFeedbackImageToLibrary(imageUri);
        setShareFeedback({message: '이미지를 저장했어요.', tone: 'success'});
        setSavedImagePreviewUri(imageUri);
        return;
      }

      await shareFeedbackImageWithSystemSheet(imageUri);
      setShareFeedback({message: '공유 화면을 열었어요.', tone: 'success'});
    } catch (error) {
      console.info('[aura:makeup-feedback] share:failed', {
        target,
        message: error instanceof Error ? error.message : String(error),
      });
      setShareFeedback({message: getShareErrorMessage(error), tone: 'error'});
    } finally {
      setActiveShareTarget(null);
    }
  }, [activeShareTarget]);

  const handleOpenShareOptions = useCallback(() => {
    if (activeShareTarget) {
      Alert.alert('공유 준비 중', '이전 작업을 처리하고 있어요. 잠시만 기다려 주세요.');
      return;
    }

    Alert.alert('메이크업 피드백', '원하는 방식을 선택해 주세요.', [
      {
        text: shareTargetLabels['save-image'],
        onPress: () => {
          void handleShareAction('save-image');
        },
      },
      {
        text: shareTargetLabels['share-report'],
        onPress: () => {
          void handleShareAction('share-report');
        },
      },
      {text: '취소', style: 'cancel'},
    ]);
  }, [activeShareTarget, handleShareAction]);

  useEffect(() => {
    setOpenPointIds(new Set<string>());
    setOpenStrengthIds(new Set<string>());
    setIsOverallJudgmentExpanded(false);
    setActiveShareTarget(null);
    setShareFeedback(null);
  }, [result.id]);

  useEffect(() => {
    onHeaderShareActionChange?.(handleOpenShareOptions);

    return () => {
      onHeaderShareActionChange?.(null);
    };
  }, [handleOpenShareOptions, onHeaderShareActionChange]);

  return (
    <MakeupFeedbackScreenScaffold topPadding="none">
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
          <OptionalViewShot
            ref={captureRef}
            options={FEEDBACK_CAPTURE_OPTIONS}
            style={styles.captureArea}>
            <View style={[styles.resultCard, {width: photoWidth}]}>
              <View style={[styles.photoWrap, {height: photoHeight, width: photoWidth}]}>
                <Image
                  accessibilityLabel="분석에 사용한 메이크업 사진"
                  resizeMode="cover"
                  source={result.uploadedImage}
                  style={styles.photo}
                />
              </View>

              <View style={styles.scorePanel}>
                <View style={styles.scoreHeader}>
                  <View
                    accessibilityLabel={`분석 출처 ${analysisSourceLabel}`}
                    style={styles.analysisSourceBadge}
                    testID={'makeup-feedback-analysis-source'}>
                    <Text style={styles.analysisSourceText}>{analysisSourceLabel}</Text>
                  </View>
                  <View style={styles.scoreBox}>
                    <Text style={styles.scoreLabel}>오늘의 메이크업</Text>
                    <Text style={styles.scoreNumber}>
                      {result.score}
                      <Text style={styles.scoreUnit}>/100</Text>
                    </Text>
                  </View>
                </View>

                <View style={styles.takeawayCard}>
                  <Text style={styles.takeawayTitle}>이것만 먼저 보세요</Text>
                  {strengthTakeaway ? (
                    <View style={styles.takeawayRow}>
                      <Text style={styles.takeawayLabel}>잘된 점</Text>
                      <Text numberOfLines={2} style={styles.takeawayText}>
                        {strengthTakeaway}
                      </Text>
                    </View>
                  ) : null}
                  {improvementTakeaway ? (
                    <View style={styles.takeawayRow}>
                      <Text style={[styles.takeawayLabel, styles.takeawayLabelPriority]}>
                        먼저 고칠 점
                      </Text>
                      <Text numberOfLines={2} style={styles.takeawayText}>
                        {improvementTakeaway}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {!result.scoreBreakdown ? (
                  <>
                    <Pressable
                      accessibilityLabel={`AI 종합 판단 ${isOverallJudgmentExpanded ? '접기' : '보기'}`}
                      accessibilityRole="button"
                      accessibilityState={{expanded: isOverallJudgmentExpanded}}
                      onPress={() => setIsOverallJudgmentExpanded(current => !current)}
                      style={({pressed}) => [
                        styles.judgmentToggle,
                        pressed ? styles.judgmentTogglePressed : undefined,
                      ]}>
                      <Text style={styles.judgmentToggleText}>
                        {isOverallJudgmentExpanded ? 'AI 종합 판단 접기' : 'AI 종합 판단 보기'}
                      </Text>
                      {isOverallJudgmentExpanded ? (
                        <ChevronUp color={feedbackColors.textMuted} size={iconSize.xs} strokeWidth={2} />
                      ) : (
                        <ChevronDown color={feedbackColors.textMuted} size={iconSize.xs} strokeWidth={2} />
                      )}
                    </Pressable>
                    {isOverallJudgmentExpanded ? (
                      <View style={styles.overallJudgment}>
                        <Text style={styles.overallJudgmentLabel}>판단 근거</Text>
                        <Text style={styles.scoreReason}>{result.scoreReason}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            </View>

            {priorityPoint ? (
              <MakeupFeedbackPriorityCorrectionCard point={priorityPoint} />
            ) : null}

            {result.scoreBreakdown ? (
              <MakeupFeedbackScoreBreakdownCard
                breakdown={result.scoreBreakdown}
                evaluations={result.evaluations}
              />
            ) : null}

            {shouldShowCaptureQualityNotice && captureQuality ? (
              <View style={styles.captureQualityCard}>
                <Text style={styles.captureQualityTitle}>사진 조건 참고</Text>
                {captureQuality.issues.map(issue => (
                  <FeedbackBulletRow key={issue.code} text={issue.message} variant="capture" />
                ))}
                <Text style={styles.captureQualityMeta}>
                  색상 신뢰도 {getCaptureColorConfidenceLabel(captureQuality.colorConfidence)}
                </Text>
                <Text style={styles.captureQualityDisclaimer}>
                  사진 조건은 결과의 확실성을 설명하기 위한 정보이며 점수 감점에는
                  사용하지 않았어요.
                </Text>
              </View>
            ) : null}

            {result.interpretedGoal ? (
              <View style={styles.analysisCriteriaCard}>
                <View style={styles.analysisCriteriaIcon}>
                  <Sparkles color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
                </View>
                <View style={styles.analysisCriteriaHeadingText}>
                  <Text style={styles.analysisCriteriaLabel}>분석한 목표</Text>
                  <Text numberOfLines={2} style={styles.analysisCriteriaTitle}>
                    {result.interpretedGoal.label}
                  </Text>
                </View>
                <View style={styles.goalIntensityChip}>
                  <Text style={styles.goalIntensityText}>
                    {getGoalIntensityLabel(result.interpretedGoal.intensity)}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.coachingSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>잘한 점</Text>
                <Text style={styles.sectionCount}>{result.strengths.length}개</Text>
              </View>
              {result.strengths.length > 0 ? (
                <View style={styles.accordionList}>
                  {result.strengths.map(strength => {
                    const evaluation = evaluationByTopicId.get(strength.topicId);
                    const criteria = (evaluation?.goalCriterionIds ?? []).flatMap(criterionId => {
                      const criterion = goalCriteriaById.get(criterionId);
                      return criterion ? [criterion] : [];
                    });

                    return (
                      <StrengthAccordionItem
                        criteria={criteria}
                        evaluation={evaluation}
                        evidenceMedia={evidenceMedia}
                        isOpen={openStrengthIds.has(strength.id)}
                        key={strength.id}
                        onPress={() => {
                          setOpenStrengthIds(currentIds => {
                            const nextIds = new Set(currentIds);

                            if (nextIds.has(strength.id)) {
                              nextIds.delete(strength.id);
                            } else {
                              nextIds.add(strength.id);
                            }

                            return nextIds;
                          });
                        }}
                        strength={strength}
                      />
                    );
                  })}
                </View>
              ) : (
                <View style={styles.coachingEmptyState}>
                  <Text style={styles.coachingEmptyText}>
                    이번 분석에서는 확실하게 확인된 잘한 점이 없어요. 부족하다는 뜻이 아니라,
                    사진에서 확인 가능한 근거만 보여드렸어요.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.coachingSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>보완할 점</Text>
                <Text style={styles.sectionCount}>{result.points.length}개</Text>
              </View>
              {result.points.length > 0 ? (
                <View style={styles.accordionList}>
                  {result.points.map(point => {
                    const evaluation = evaluationByTopicId.get(point.topicId);
                    const criteria = (evaluation?.goalCriterionIds ?? []).flatMap(criterionId => {
                      const criterion = goalCriteriaById.get(criterionId);
                      return criterion ? [criterion] : [];
                    });

                    return (
                      <PointAccordionItem
                        criteria={criteria}
                        evaluation={evaluation}
                        evidenceMedia={evidenceMedia}
                        isOpen={openPointIds.has(point.id)}
                        key={point.id}
                        onPress={() => {
                          setOpenPointIds(currentIds => {
                            const nextIds = new Set(currentIds);

                            if (nextIds.has(point.id)) {
                              nextIds.delete(point.id);
                            } else {
                              nextIds.add(point.id);
                            }

                            return nextIds;
                          });
                        }}
                        point={point}
                      />
                    );
                  })}
                </View>
              ) : (
                <View style={styles.coachingEmptyState}>
                  <Text style={styles.coachingEmptyText}>
                    지금 사진에서는 꼭 바꿔야 할 점을 찾지 못했어요. 현재 표현을 유지해도 좋아요.
                  </Text>
                </View>
              )}
            </View>

          </OptionalViewShot>

          <FeedbackShareActions
            activeTarget={activeShareTarget}
            feedback={shareFeedback}
            onPressShareAction={handleShareAction}
          />
          <Button
            accessibilityLabel="메이크업 기록에서 보기"
            accessibilityRole="button"
            onPress={onOpenMakeupJourney}
            pressStyle={{opacity: 0.78}}
            style={styles.makeupJourneyButton}
            unstyled>
            <CalendarDays color={colors.white} size={iconSize.sm} strokeWidth={2} />
            <Text style={styles.makeupJourneyButtonText}>메이크업 기록에서 보기</Text>
            <ArrowRight color={colors.white} size={iconSize.sm} strokeWidth={2} />
          </Button>
        </ScrollView>
        <SavedImagePreviewSheet
          imageUri={savedImagePreviewUri}
          onClose={() => setSavedImagePreviewUri(null)}
        />
      </View>
    </MakeupFeedbackScreenScaffold>
  );
}

function PointAccordionItem({
  criteria,
  evaluation,
  evidenceMedia,
  isOpen,
  onPress,
  point,
}: {
  criteria: readonly string[];
  evaluation?: MakeupFeedbackEvaluation;
  evidenceMedia?: MakeupFeedbackEvidenceMedia;
  isOpen: boolean;
  onPress: () => void;
  point: MakeupFeedbackCorrectionPoint;
}) {
  const Icon = point.kind === 'eye' ? Eye : point.kind === 'cheek' ? Sparkles : Heart;
  const ToggleIcon = isOpen ? ChevronUp : ChevronDown;

  return (
    <View style={styles.accordionItem}>
      <Pressable
        accessibilityLabel={`${point.topicLabel}, ${point.title} 상세 보기`}
        accessibilityRole="button"
        accessibilityState={{expanded: isOpen}}
        onPress={onPress}
        style={({pressed}) => [
          styles.accordionButton,
          {
            opacity: pressed ? 0.78 : 1,
          },
        ]}>
        <View style={styles.accordionTitleGroup}>
          <View style={styles.pointIcon}>
            <Icon color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
          </View>
          <View style={styles.accordionTitleCopy}>
            <Text style={styles.accordionTopic}>{point.topicLabel}</Text>
            <Text numberOfLines={2} style={styles.accordionTitle}>{point.title}</Text>
          </View>
        </View>
        <ToggleIcon color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
      </Pressable>
      {isOpen ? (
        <View style={styles.accordionPreview}>
          <MakeupFeedbackEvidencePreview
            evaluation={evaluation}
            guide={point.correctionGuide}
            media={evidenceMedia}
            variant="improvement"
          />
        </View>
      ) : null}
      {isOpen ? (
        <View style={styles.accordionDetail}>
          <EvaluationEvidence evaluation={evaluation} />
          <View style={styles.coachingInterpretation}>
            <Text style={styles.coachingInterpretationLabel}>왜 보완하면 좋은가</Text>
            {point.title !== point.topicLabel ? (
              <Text style={styles.accordionDetailTitle}>{point.title}</Text>
            ) : null}
            <Text style={styles.accordionText}>{point.description}</Text>
            {criteria.length > 0 ? (
              <View style={styles.coachingCriteria}>
                <Text style={styles.coachingCriteriaLabel}>목적과 연결</Text>
                {criteria.map((criterion, index) => (
                  <FeedbackBulletRow key={`${index}-${criterion}`} text={criterion} />
                ))}
              </View>
            ) : null}
          </View>
          <EvaluationActionSteps
            actionSteps={point.correctionGuide ? [] : point.actionSteps}
            label="이렇게 해보세요"
          />
          {point.correctionGuide ? (
            <MakeupFeedbackCorrectionGuideDetails guide={point.correctionGuide} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function StrengthAccordionItem({
  criteria,
  evaluation,
  evidenceMedia,
  isOpen,
  onPress,
  strength,
}: {
  criteria: readonly string[];
  evaluation?: MakeupFeedbackEvaluation;
  evidenceMedia?: MakeupFeedbackEvidenceMedia;
  isOpen: boolean;
  onPress: () => void;
  strength: MakeupFeedbackStrength;
}) {
  const Icon = strength.icon === 'sparkle' ? Sparkles : Heart;
  const ToggleIcon = isOpen ? ChevronUp : ChevronDown;

  return (
    <View style={styles.accordionItem}>
      <Pressable
        accessibilityLabel={`${strength.topicLabel}, ${strength.title} 상세 보기`}
        accessibilityRole="button"
        accessibilityState={{expanded: isOpen}}
        onPress={onPress}
        style={({pressed}) => [
          styles.accordionButton,
          {
            opacity: pressed ? 0.78 : 1,
          },
        ]}>
        <View style={styles.accordionTitleGroup}>
          <View style={styles.strengthIcon}>
            <Icon color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
          </View>
          <View style={styles.accordionTitleCopy}>
            <Text style={styles.accordionTopic}>{strength.topicLabel}</Text>
            <Text numberOfLines={2} style={styles.accordionTitle}>{strength.title}</Text>
          </View>
        </View>
        <ToggleIcon color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
      </Pressable>
      {isOpen ? (
        <View style={styles.accordionPreview}>
          <MakeupFeedbackEvidencePreview
            evaluation={evaluation}
            media={evidenceMedia}
            variant="strength"
          />
        </View>
      ) : null}
      {isOpen ? (
        <View style={styles.accordionDetail}>
          <EvaluationEvidence evaluation={evaluation} />
          <View style={styles.coachingInterpretation}>
            <Text style={styles.coachingInterpretationLabel}>왜 좋은가</Text>
            {strength.title !== strength.topicLabel ? (
              <Text style={styles.accordionDetailTitle}>{strength.title}</Text>
            ) : null}
            <Text style={styles.accordionText}>{strength.description}</Text>
            {criteria.length > 0 ? (
              <View style={styles.coachingCriteria}>
                <Text style={styles.coachingCriteriaLabel}>목적과 연결</Text>
                {criteria.map((criterion, index) => (
                  <FeedbackBulletRow key={`${index}-${criterion}`} text={criterion} />
                ))}
              </View>
            ) : null}
          </View>
          <EvaluationActionSteps
            actionSteps={strength.actionSteps}
            label="이렇게 유지해보세요"
          />
        </View>
      ) : null}
    </View>
  );
}

function EvaluationEvidence({
  evaluation,
}: {
  evaluation?: MakeupFeedbackEvaluation;
}) {
  if (!evaluation) {
    return null;
  }

  const evidenceRows = getMakeupFeedbackEvidenceRows(evaluation);

  if (!evaluation.visibilityReason && evidenceRows.length === 0) {
    return null;
  }

  return (
    <>
      {evidenceRows.length > 0 ? (
        <View style={styles.evidenceBlock}>
          <Text style={styles.evidenceLabel}>사진에서 확인한 점</Text>
          {evidenceRows.map(row => (
            <FeedbackBulletRow key={row.id} text={row.text} />
          ))}
        </View>
      ) : null}
      {evaluation.visibilityReason ? (
        <View style={styles.evidenceBlock}>
          <Text style={styles.evidenceLabel}>판단할 때 참고</Text>
          <Text style={styles.evidenceText}>{evaluation.visibilityReason}</Text>
        </View>
      ) : null}
    </>
  );
}

function FeedbackBulletRow({
  text,
  variant = 'evidence',
}: {
  text: string;
  variant?: 'capture' | 'evidence';
}) {
  const isCaptureVariant = variant === 'capture';

  return (
    <View style={styles.feedbackBulletRow}>
      <Text
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no"
        style={[
          styles.feedbackBulletMarker,
          isCaptureVariant ? styles.feedbackBulletMarkerCapture : undefined,
        ]}>
        ·
      </Text>
      <Text
        style={[
          isCaptureVariant ? styles.captureQualityText : styles.evidenceText,
          styles.feedbackBulletBody,
        ]}>
        {text}
      </Text>
    </View>
  );
}


function EvaluationActionSteps({
  actionSteps,
  label,
}: {
  actionSteps: readonly string[];
  label: string;
}) {
  if (actionSteps.length === 0) {
    return null;
  }

  return (
    <View style={styles.actionSteps}>
      <Text style={styles.actionStepsLabel}>{label}</Text>
      {actionSteps.map((step, index) => (
        <View key={`${index}-${step}`} style={styles.actionStepRow}>
          <View style={styles.actionStepNumber}>
            <Text style={styles.actionStepNumberText}>{index + 1}</Text>
          </View>
          <Text style={styles.actionStepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

function FeedbackShareActions({
  activeTarget,
  feedback,
  onPressShareAction,
}: {
  activeTarget: MakeupFeedbackShareTarget | null;
  feedback: MakeupFeedbackShareFeedback | null;
  onPressShareAction: (target: MakeupFeedbackShareTarget) => Promise<void>;
}) {
  const shareActions: Array<{
    icon: React.ReactNode;
    target: MakeupFeedbackShareTarget;
  }> = [
    {
      icon: <Download color={feedbackColors.text} size={iconSize.md} strokeWidth={2.1} />,
      target: 'save-image',
    },
    {
      icon: <Share2 color={feedbackColors.text} size={iconSize.md} strokeWidth={2.1} />,
      target: 'share-report',
    },
  ];

  return (
    <View style={styles.shareActionArea}>
      <View style={styles.shareActionRow}>
        {shareActions.map((action) => {
          const isActive = activeTarget === action.target;
          const isDisabled = Boolean(activeTarget);

          return (
            <Button
              accessibilityLabel={shareTargetLabels[action.target]}
              accessibilityRole="button"
              accessibilityState={{busy: isActive, disabled: isDisabled}}
              disabled={isDisabled}
              disabledStyle={styles.shareActionDisabled}
              key={action.target}
              onPress={() => {
                void onPressShareAction(action.target);
              }}
              pressStyle={{opacity: 0.56}}
              style={styles.shareActionButton}
              unstyled>
              {isActive ? (
                <ActivityIndicator color={feedbackColors.text} size="small" />
              ) : (
                action.icon
              )}
            </Button>
          );
        })}
      </View>
      {feedback ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.shareFeedback,
            feedback.tone === 'success' ? styles.shareFeedbackSuccess : styles.shareFeedbackError,
          ]}>
          {feedback.message}
        </Text>
      ) : null}
    </View>
  );
}

const sharedCardShadow = {
  shadowColor: feedbackColors.shadow,
  shadowOffset: shadows.soft.shadowOffset,
  shadowOpacity: shadows.soft.shadowOpacity,
  shadowRadius: shadows.soft.shadowRadius,
} as const;

const styles = StyleSheet.create({
  actionStepNumber: {
    alignItems: 'center',
    backgroundColor: feedbackColors.text,
    borderRadius: radius.pill,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  actionStepNumberText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  actionStepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionStepText: {
    color: feedbackColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  actionSteps: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.sm,
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  actionStepsLabel: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  accordionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 62,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  accordionDetail: {
    borderTopColor: feedbackColors.borderSoft,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  accordionItem: {
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    ...sharedCardShadow,
  },
  accordionList: {
    gap: spacing.sm,
  },
  accordionPreview: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  coachingCriteria: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  coachingCriteriaLabel: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  coachingEmptyState: {
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    padding: spacing.lg,
  },
  coachingEmptyText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  coachingInterpretation: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  coachingInterpretationLabel: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  coachingSection: {
    gap: spacing.sm,
  },
  accordionDetailTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  evidenceBlock: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.sm,
    gap: spacing.xs,
    marginTop: spacing.xs,
    padding: spacing.md,
  },
  evidenceLabel: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  evidenceText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  feedbackBulletBody: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  feedbackBulletMarker: {
    color: feedbackColors.textMuted,
    flexShrink: 0,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
    width: 12,
  },
  feedbackBulletMarkerCapture: {
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  feedbackBulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    width: '100%',
  },

  accordionText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  accordionTitle: {
    color: feedbackColors.text,
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  accordionTitleCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  accordionTitleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  accordionTopic: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 14,
  },
  analysisSourceBadge: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  analysisSourceText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  captureQualityCard: {
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
    ...sharedCardShadow,
  },
  captureQualityDisclaimer: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    marginTop: spacing.xs,
  },
  captureQualityMeta: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  captureQualityText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  captureQualityTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },

  analysisCriteriaCard: {
    alignItems: 'center',
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    ...sharedCardShadow,
  },
  analysisCriteriaHeadingText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  analysisCriteriaIcon: {
    alignItems: 'center',
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  analysisCriteriaLabel: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  analysisCriteriaTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  goalIntensityChip: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  goalIntensityText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },

  makeupJourneyButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  makeupJourneyButtonText: {
    color: colors.white,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },

  captureArea: {
    backgroundColor: feedbackColors.background,
    gap: feedbackSpacing.cardGap,
  },
  content: {
    gap: feedbackSpacing.cardGap,
    paddingBottom: spacing.xxl,
    paddingHorizontal: feedbackSpacing.screenX,
    paddingTop: spacing.xl,
  },
  photo: {
    height: '100%',
    width: '100%',
  },
  photoWrap: {
    alignSelf: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  pointIcon: {
    alignItems: 'center',
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  judgmentToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  judgmentTogglePressed: {
    opacity: 0.58,
  },
  judgmentToggleText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  overallJudgment: {
    alignItems: 'flex-start',
    borderTopColor: feedbackColors.borderSoft,
    borderTopWidth: 1,
    gap: spacing.xs,
    maxWidth: 360,
    paddingTop: spacing.sm,
    width: '100%',
  },
  overallJudgmentLabel: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },

  resultCard: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
  scoreHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  scoreBox: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  scoreLabel: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  scoreNumber: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  scorePanel: {
    alignItems: 'stretch',
    backgroundColor: feedbackColors.surface,
    gap: spacing.md,
    marginTop: 0,
    paddingHorizontal: feedbackSpacing.screenX,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  scoreReason: {
    alignSelf: 'stretch',
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    maxWidth: 360,
    textAlign: 'left',
  },
  scoreUnit: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  takeawayCard: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  takeawayLabel: {
    color: feedbackColors.textMuted,
    flexShrink: 0,
    fontFamily: typography.fontFamily.bold,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 14,
    width: 68,
  },
  takeawayLabelPriority: {
    color: colors.heart,
  },
  takeawayRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  takeawayText: {
    color: feedbackColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  takeawayTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  screen: {
    backgroundColor: feedbackColors.background,
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  sectionCount: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  shareActionArea: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  shareActionButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  shareActionDisabled: {
    opacity: 0.52,
  },
  shareActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
  },
  shareFeedback: {
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  shareFeedbackError: {
    color: colors.danger,
  },
  shareFeedbackSuccess: {
    color: feedbackColors.textSoft,
  },
  strengthIcon: {
    alignItems: 'center',
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
});
