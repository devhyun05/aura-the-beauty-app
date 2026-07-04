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
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import ViewShot, {type ViewShotRef} from 'react-native-view-shot';
import {ChevronDown, ChevronUp, Download, Eye, Heart, Share2, Sparkles} from 'lucide-react-native';
import {Button, Text, View} from 'tamagui';

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
import {MakeupFeedbackScreenScaffold} from '../components/MakeupFeedbackScreenScaffold';
import type {
  MakeupFeedbackCorrectionPoint,
  MakeupFeedbackStrength,
  MakeupFeedbackResult,
} from '../types';

type MakeupFeedbackResultScreenProps = {
  onHeaderShareActionChange?: (action: MakeupFeedbackHeaderShareAction | null) => void;
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

async function captureFeedbackImage(captureRef: {current: ViewShotRef | null}) {
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
  const currentPermission = await MediaLibrary.getPermissionsAsync(true, ['photo']);
  const permission = currentPermission.granted
    ? currentPermission
    : await MediaLibrary.requestPermissionsAsync(true, ['photo']);

  if (!permission.granted) {
    throw new Error('사진 저장 권한이 필요합니다. 설정에서 사진 접근을 허용해 주세요.');
  }
}

async function saveFeedbackImageToLibrary(imageUri: string) {
  try {
    await MediaLibrary.saveToLibraryAsync(imageUri);
  } catch (error) {
    console.info('[aura:makeup-feedback] share:save-to-library-failed', {
      imageUri,
      message: error instanceof Error ? error.message : String(error),
    });
    await MediaLibrary.createAssetAsync(imageUri);
  }
}

async function shareFeedbackImageWithSystemSheet(imageUri: string) {
  const title = 'AI 피드백 리포트';
  const isSharingAvailable = await Sharing.isAvailableAsync();

  if (isSharingAvailable) {
    await Sharing.shareAsync(imageUri, {
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

export function MakeupFeedbackResultScreen({
  onHeaderShareActionChange,
  result,
}: MakeupFeedbackResultScreenProps) {
  const {width} = useWindowDimensions();
  const captureRef = useRef<ViewShotRef | null>(null);
  const [openPointId, setOpenPointId] = useState<string | null>(result.points[0]?.id ?? null);
  const [openStrengthId, setOpenStrengthId] = useState<string | null>(result.strengths[0]?.id ?? null);
  const [activeShareTarget, setActiveShareTarget] = useState<MakeupFeedbackShareTarget | null>(null);
  const [shareFeedback, setShareFeedback] = useState<MakeupFeedbackShareFeedback | null>(null);
  const photoWidth = width;
  const photoHeight = Math.round(photoWidth);

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
          <ViewShot
            ref={captureRef}
            options={FEEDBACK_CAPTURE_OPTIONS}
            style={styles.captureArea}>
            <View style={[styles.resultCard, {width: photoWidth}]}>
              <View style={[styles.photoWrap, {height: photoHeight, width: photoWidth}]}>
                <Image resizeMode="cover" source={result.uploadedImage} style={styles.photo} />
              </View>

              <View style={styles.scorePanel}>
                <View style={styles.scoreBox}>
                  <Text style={styles.scoreLabel}>종합 점수</Text>
                  <Text style={styles.scoreNumber}>
                    {result.score}
                    <Text style={styles.scoreUnit}> 점</Text>
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>보완 포인트</Text>
            <View style={styles.accordionList}>
              {result.points.map((point) => (
                <PointAccordionItem
                  isOpen={openPointId === point.id}
                  key={point.id}
                  onPress={() => {
                    setOpenPointId((currentId) =>
                      currentId === point.id ? null : point.id,
                    );
                  }}
                  point={point}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>잘한 포인트</Text>
            <View style={styles.accordionList}>
              {result.strengths.map((strength) => (
                <StrengthAccordionItem
                  isOpen={openStrengthId === strength.id}
                  key={strength.id}
                  onPress={() => {
                    setOpenStrengthId((currentId) =>
                      currentId === strength.id ? null : strength.id,
                    );
                  }}
                  strength={strength}
                />
              ))}
            </View>
          </ViewShot>

          <FeedbackShareActions
            activeTarget={activeShareTarget}
            feedback={shareFeedback}
            onPressShareAction={handleShareAction}
          />
        </ScrollView>
      </View>
    </MakeupFeedbackScreenScaffold>
  );
}

function PointAccordionItem({
  isOpen,
  onPress,
  point,
}: {
  isOpen: boolean;
  onPress: () => void;
  point: MakeupFeedbackCorrectionPoint;
}) {
  const Icon = point.kind === 'eye' ? Eye : point.kind === 'cheek' ? Sparkles : Heart;
  const ToggleIcon = isOpen ? ChevronUp : ChevronDown;

  return (
    <View style={styles.accordionItem}>
      <Pressable
        accessibilityLabel={`${point.topicLabel} 상세 보기`}
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
          <Text numberOfLines={1} style={styles.accordionTitle}>{point.topicLabel}</Text>
        </View>
        <ToggleIcon color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
      </Pressable>
      {isOpen ? (
        <View style={styles.accordionDetail}>
          {point.title !== point.topicLabel ? (
            <Text style={styles.accordionDetailTitle}>{point.title}</Text>
          ) : null}
          <Text style={styles.accordionText}>{point.description}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StrengthAccordionItem({
  isOpen,
  onPress,
  strength,
}: {
  isOpen: boolean;
  onPress: () => void;
  strength: MakeupFeedbackStrength;
}) {
  const Icon = strength.icon === 'sparkle' ? Sparkles : Heart;
  const ToggleIcon = isOpen ? ChevronUp : ChevronDown;

  return (
    <View style={styles.accordionItem}>
      <Pressable
        accessibilityLabel={`${strength.topicLabel} 상세 보기`}
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
          <Text numberOfLines={1} style={styles.accordionTitle}>{strength.topicLabel}</Text>
        </View>
        <ToggleIcon color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
      </Pressable>
      {isOpen ? (
        <View style={styles.accordionDetail}>
          {strength.title !== strength.topicLabel ? (
            <Text style={styles.accordionDetailTitle}>{strength.title}</Text>
          ) : null}
          <Text style={styles.accordionText}>{strength.description}</Text>
        </View>
      ) : null}
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
  accordionDetailTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
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
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  accordionTitleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
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
  resultCard: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
  scoreBox: {
    alignItems: 'center',
    gap: spacing.sm,
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
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xxl,
  },
  scorePanel: {
    alignItems: 'center',
    backgroundColor: feedbackColors.surface,
    justifyContent: 'center',
    marginTop: 0,
    paddingHorizontal: feedbackSpacing.screenX,
    paddingVertical: spacing.xl,
  },
  scoreUnit: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  screen: {
    backgroundColor: feedbackColors.background,
    flex: 1,
  },
  scrollView: {
    flex: 1,
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
