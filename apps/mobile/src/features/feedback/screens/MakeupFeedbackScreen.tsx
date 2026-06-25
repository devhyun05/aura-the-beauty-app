import React, {useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {
  Camera,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  Heart,
  Sparkles,
} from 'lucide-react-native';
import {Text, View} from 'tamagui';

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
import {AppHeader} from '../../../shared/ui';
import {FeedbackScreenScaffold} from '../components/FeedbackScreenScaffold';
import type {
  FeedbackPoint,
  FeedbackStrength,
  MakeupFeedbackResult,
} from '../types';

type MakeupFeedbackScreenProps = {
  headerTitle?: string;
  result: MakeupFeedbackResult;
  onBack: () => void;
  onOpenGuide: () => void;
  onOpenTip: (point: FeedbackPoint) => void;
  onRetake: () => void;
  onUploadAgain: () => void;
};

type FooterButtonProps = {
  label: string;
  tone: 'outline' | 'filled';
  onPress: () => void;
};

const BASE_PHOTO_WIDTH = 360;

const makeupFeedbackHeaderPresentation = {
  component: 'AppHeader',
  leftAction: 'back',
  title: '메이크업 피드백',
} as const;

export function getMakeupFeedbackHeaderPresentation() {
  return makeupFeedbackHeaderPresentation;
}

export function MakeupFeedbackScreen({
  headerTitle = makeupFeedbackHeaderPresentation.title,
  result,
  onBack,
  onOpenGuide,
  onOpenTip,
  onRetake,
  onUploadAgain,
}: MakeupFeedbackScreenProps) {
  const {width} = useWindowDimensions();
  const [openStrengthId, setOpenStrengthId] = useState<string | null>(null);
  const photoWidth = width;
  const photoHeight = Math.round(photoWidth);
  const photoScale = photoWidth / BASE_PHOTO_WIDTH;

  return (
    <FeedbackScreenScaffold topPadding="none">
      <AppHeader onBack={onBack} title={headerTitle} />
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
          <View style={[styles.resultCard, {width: photoWidth}]}>
            <View style={[styles.photoWrap, {height: photoHeight, width: photoWidth}]}>
              <Image resizeMode="cover" source={result.uploadedImage} style={styles.photo} />
              {result.callouts.map((callout) => (
                <View
                  accessibilityLabel={callout.label}
                  key={callout.id}
                  style={[
                    styles.faceMarker,
                    {
                      left: callout.lineLeft * photoScale,
                      top: callout.lineTop * photoScale,
                    },
                  ]}
                />
              ))}
            </View>

            <View style={styles.scorePanel}>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>종합 점수</Text>
                <Text style={styles.scoreNumber}>
                  {result.score}
                  <Text style={styles.scoreUnit}> 점</Text>
                </Text>
              </View>
              <View style={styles.scoreDivider} />
              <View style={styles.badgeArea}>
                <View style={styles.badgeRow}>
                  {result.summaryBadges.map((badge) => (
                    <View key={badge.id} style={styles.badge}>
                      <Text style={styles.badgeText}>{badge.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.scoreHelper}>좋은 부분과 수정 포인트를 함께 확인해보세요</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>수정 포인트 3가지</Text>
            <Pressable accessibilityLabel="수정 포인트 모두 보기" accessibilityRole="button">
              <Text style={styles.moreText}>모두 보기</Text>
            </Pressable>
          </View>

          <View style={styles.pointList}>
            {result.points.map((point) => (
              <FeedbackPointCard key={point.id} onOpenTip={onOpenTip} point={point} />
            ))}
          </View>

          <Text style={styles.sectionTitle}>잘한 포인트</Text>
          <View style={styles.strengthAccordionList}>
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

          <Pressable
            accessibilityLabel="사진 다시 업로드"
            accessibilityRole="button"
            onPress={onUploadAgain}
            style={({pressed}) => [
              styles.uploadCard,
              {
                opacity: pressed ? 0.78 : 1,
              },
            ]}>
            <View style={styles.uploadIcon}>
              <Camera color={feedbackColors.text} size={iconSize.md} strokeWidth={2} />
            </View>
            <View style={styles.uploadCopy}>
              <Text style={styles.uploadTitle}>사진 다시 업로드</Text>
              <Text style={styles.uploadCaption}>정면 / 밝은 조명 / 액세서리 없이 촬영하면 더 정확해요</Text>
            </View>
            <ChevronRight color={feedbackColors.textSoft} size={iconSize.sm} strokeWidth={2} />
          </Pressable>

          <View style={styles.footerActions}>
            <FooterButton label="다시 촬영" onPress={onRetake} tone="outline" />
            <FooterButton label="가이드 오버레이 보기" onPress={onOpenGuide} tone="filled" />
          </View>
        </ScrollView>
      </View>
    </FeedbackScreenScaffold>
  );
}

function FeedbackPointCard({
  onOpenTip,
  point,
}: {
  onOpenTip: (point: FeedbackPoint) => void;
  point: FeedbackPoint;
}) {
  const Icon = point.kind === 'eye' ? Eye : point.kind === 'cheek' ? Sparkles : Heart;

  return (
    <View style={styles.pointCard}>
      <View style={styles.pointIcon}>
        <Icon color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
      </View>
      <View style={styles.pointCopy}>
        <Text style={styles.pointTitle}>{point.title}</Text>
        <Text style={styles.pointDescription}>{point.description}</Text>
      </View>
      <Pressable
        accessibilityLabel={`${point.title} ${point.actionLabel}`}
        accessibilityRole="button"
        onPress={() => onOpenTip(point)}>
        <View style={styles.pointAction}>
          <Text style={styles.pointActionText}>{point.actionLabel}</Text>
          <ChevronRight color={feedbackColors.accent} size={iconSize.xs} strokeWidth={2.1} />
        </View>
      </Pressable>
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
  strength: FeedbackStrength;
}) {
  const Icon = strength.icon === 'sparkle' ? Sparkles : Heart;
  const ToggleIcon = isOpen ? ChevronUp : ChevronDown;

  return (
    <View style={styles.strengthAccordionItem}>
      <Pressable
        accessibilityLabel={`${strength.title} 상세 보기`}
        accessibilityRole="button"
        accessibilityState={{expanded: isOpen}}
        onPress={onPress}
        style={({pressed}) => [
          styles.strengthAccordionButton,
          {
            opacity: pressed ? 0.78 : 1,
          },
        ]}>
        <View style={styles.strengthAccordionTitleGroup}>
          <Icon color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
          <Text style={styles.strengthAccordionTitle}>{strength.title}</Text>
        </View>
        <ToggleIcon color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
      </Pressable>
      {isOpen ? (
        <View style={styles.strengthAccordionDetail}>
          <Text style={styles.strengthAccordionText}>{strength.description}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FooterButton({label, onPress, tone}: FooterButtonProps) {
  const isFilled = tone === 'filled';

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.footerButton,
        isFilled ? styles.footerButtonFilled : styles.footerButtonOutline,
        {
          opacity: pressed ? 0.78 : 1,
        },
      ]}>
      <Text style={isFilled ? styles.footerButtonFilledText : styles.footerButtonOutlineText}>
        {label}
      </Text>
    </Pressable>
  );
}

const sharedCardShadow = {
  shadowColor: feedbackColors.shadow,
  shadowOffset: shadows.soft.shadowOffset,
  shadowOpacity: shadows.soft.shadowOpacity,
  shadowRadius: shadows.soft.shadowRadius,
} as const;

const styles = StyleSheet.create({
  badge: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badgeArea: {
    flex: 1,
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badgeText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  faceMarker: {
    backgroundColor: feedbackColors.text,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 11,
    marginLeft: -5,
    marginTop: -5,
    position: 'absolute',
    width: 11,
  },
  content: {
    gap: feedbackSpacing.cardGap,
    paddingBottom: spacing.xxl,
    paddingHorizontal: feedbackSpacing.screenX,
    paddingTop: spacing.xl,
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  footerButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  footerButtonFilled: {
    backgroundColor: feedbackColors.text,
  },
  footerButtonFilledText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  footerButtonOutline: {
    backgroundColor: colors.white,
    borderColor: feedbackColors.text,
    borderWidth: 1,
  },
  footerButtonOutlineText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  moreText: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
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
  pointAction: {
    alignItems: 'center',
    borderColor: feedbackColors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pointActionText: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  pointCard: {
    alignItems: 'center',
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    ...sharedCardShadow,
  },
  pointCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  pointDescription: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  pointIcon: {
    alignItems: 'center',
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pointList: {
    gap: spacing.sm,
  },
  pointTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  resultCard: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
  scoreBox: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 104,
  },
  scoreDivider: {
    backgroundColor: feedbackColors.borderSoft,
    height: 68,
    width: 1,
  },
  scoreHelper: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
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
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 0,
    paddingHorizontal: feedbackSpacing.screenX,
    paddingVertical: spacing.lg,
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
  strengthAccordionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  strengthAccordionDetail: {
    borderTopColor: feedbackColors.borderSoft,
    borderTopWidth: 1,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  strengthAccordionItem: {
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    ...sharedCardShadow,
  },
  strengthAccordionList: {
    gap: spacing.sm,
  },
  strengthAccordionText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  strengthAccordionTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  strengthAccordionTitleGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  uploadCaption: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  uploadCard: {
    alignItems: 'center',
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    ...sharedCardShadow,
  },
  uploadCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  uploadIcon: {
    alignItems: 'center',
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  uploadTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
});
