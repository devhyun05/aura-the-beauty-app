import React from 'react';
import {Pressable, ScrollView, StyleSheet} from 'react-native';
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  Heart,
  Sparkles,
  Target,
  Wand2,
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
import {FeedbackDetailHeader} from '../components/FeedbackDetailHeader';
import {FeedbackScreenScaffold} from '../components/FeedbackScreenScaffold';
import type {FeedbackPoint, FeedbackPointKind} from '../types';

type FeedbackTipScreenProps = {
  point: FeedbackPoint;
  onBack: () => void;
};

type TipContent = {
  title: string;
  eyebrow: string;
  summary: string;
  target: string;
  routine: string[];
  checkpoints: string[];
  finish: string;
};

const TIP_CONTENT: Record<FeedbackPointKind, TipContent> = {
  eye: {
    title: '아이라인 균형 맞추기',
    eyebrow: 'EYE LINE GUIDE',
    summary: '오른쪽 꼬리 각도만 살짝 낮추면 양쪽 눈매가 더 안정적으로 보여요.',
    target: '눈을 뜬 정면 기준으로 양쪽 꼬리 끝 높이를 먼저 맞추는 것이 핵심이에요.',
    routine: [
      '면봉에 리무버를 아주 소량 묻혀 오른쪽 아이라인 끝 2mm만 가볍게 정리해요.',
      '왼쪽 꼬리 끝 높이를 기준점으로 잡고, 오른쪽 라인을 조금 더 수평에 가깝게 내려 그려요.',
      '눈을 감은 상태보다 뜬 상태에서 확인하면 실제 인상에 맞는 각도를 잡기 쉬워요.',
    ],
    checkpoints: [
      '꼬리 길이는 양쪽이 거의 같게',
      '끝점은 눈꼬리보다 과하게 올라가지 않게',
      '라인 두께는 중앙보다 끝으로 갈수록 얇게',
    ],
    finish: '마지막에는 브라운 섀도로 라인 끝만 살짝 풀어주면 수정한 부분이 훨씬 자연스럽게 연결돼요.',
  },
  cheek: {
    title: '블러셔 위치 올리기',
    eyebrow: 'BLUSH POSITION',
    summary: '블러셔가 조금 낮게 내려와 보여서 얼굴 중심이 아래로 무거워질 수 있어요.',
    target: '광대 중앙보다 손가락 한 마디 정도 위에서 시작해 사선으로 짧게 올리는 게 좋아요.',
    routine: [
      '기존 블러셔 아래쪽은 깨끗한 퍼프에 파우더를 묻혀 가볍게 눌러 톤을 낮춰요.',
      '웃었을 때 올라오는 광대 위쪽에 브러시를 두고 관자놀이 방향으로 짧게 쓸어 올려요.',
      '볼 중앙은 한 번만 터치하고, 바깥쪽은 남은 양으로 연결하면 얼굴이 더 작아 보여요.',
    ],
    checkpoints: [
      '코끝보다 아래로 내려오지 않게',
      '경계는 넓게 번지기보다 사선으로 짧게',
      '채도는 립보다 한 톤 낮게',
    ],
    finish: '블러셔 위쪽 경계에 하이라이터를 아주 얇게 얹으면 리프팅된 느낌이 더 깔끔하게 살아나요.',
  },
  lip: {
    title: '립 경계 또렷하게 정리',
    eyebrow: 'LIP DETAIL',
    summary: '입꼬리와 아랫입술 경계를 정리하면 전체 메이크업 완성도가 더 선명해져요.',
    target: '입술 안쪽 컬러는 유지하고, 바깥 경계만 얇게 정리해 또렷한 인상을 만드는 것이 좋아요.',
    routine: [
      '입꼬리 바깥쪽 번진 컬러는 작은 컨실러 브러시로 피부 톤에 맞춰 정리해요.',
      '아랫입술 중앙은 컬러를 한 번 더 얹고, 양끝은 남은 양만 톡톡 두드려 연결해요.',
      '립 라인 전체를 다시 그리기보다 큐피드 보우와 입꼬리만 정리하면 과해 보이지 않아요.',
    ],
    checkpoints: [
      '입꼬리 바깥 번짐 먼저 정리',
      '윗입술 산은 너무 날카롭지 않게',
      '아랫입술 중앙만 은은하게 볼륨 추가',
    ],
    finish: '마무리로 티슈를 한 번 가볍게 물고 립밤을 중앙에만 얹으면 컬러는 유지되고 경계는 부드러워져요.',
  },
};

export function FeedbackTipScreen({point, onBack}: FeedbackTipScreenProps) {
  const content = TIP_CONTENT[point.kind];
  const PointIcon = getPointIcon(point.kind);

  return (
    <FeedbackScreenScaffold topPadding="none">
      <FeedbackDetailHeader onBack={onBack} variant="tip" />
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>{content.eyebrow}</Text>
            <View style={styles.heroTitleRow}>
              <View style={styles.heroIcon}>
                <PointIcon color={colors.white} size={iconSize.md} strokeWidth={2} />
              </View>
              <Text style={styles.heroTitle}>{content.title}</Text>
            </View>
            <Text style={styles.heroSummary}>{content.summary}</Text>
          </View>

          <View style={styles.focusCard}>
            <View style={styles.focusIcon}>
              <Target color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
            </View>
            <View style={styles.focusCopy}>
              <Text style={styles.focusLabel}>오늘의 수정 기준</Text>
              <Text style={styles.focusText}>{content.target}</Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>3단계 수정 루틴</Text>
            <Text style={styles.sectionMeta}>약 3분</Text>
          </View>

          <View style={styles.routineList}>
            {content.routine.map((step, index) => (
              <View key={step} style={styles.routineCard}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.routineText}>{step}</Text>
              </View>
            ))}
          </View>

          <View style={styles.checkCard}>
            <View style={styles.checkHeader}>
              <Wand2 color={feedbackColors.text} size={iconSize.sm} strokeWidth={2} />
              <Text style={styles.checkTitle}>거울 앞 체크 포인트</Text>
            </View>
            <View style={styles.checkList}>
              {content.checkpoints.map((checkpoint) => (
                <View key={checkpoint} style={styles.checkRow}>
                  <CheckCircle2 color={feedbackColors.text} size={iconSize.xs} strokeWidth={2} />
                  <Text style={styles.checkText}>{checkpoint}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.finishCard}>
            <Text style={styles.finishLabel}>마무리 팁</Text>
            <Text style={styles.finishText}>{content.finish}</Text>
          </View>

          <Pressable
            accessibilityLabel="피드백 결과로 돌아가기"
            accessibilityRole="button"
            onPress={onBack}
            style={({pressed}) => [
              styles.returnButton,
              {
                opacity: pressed ? 0.78 : 1,
              },
            ]}>
            <Text style={styles.returnButtonText}>피드백 결과로 돌아가기</Text>
            <ChevronRight color={colors.white} size={iconSize.sm} strokeWidth={2} />
          </Pressable>
        </ScrollView>
      </View>
    </FeedbackScreenScaffold>
  );
}

function getPointIcon(kind: FeedbackPointKind) {
  if (kind === 'eye') {
    return Eye;
  }

  if (kind === 'cheek') {
    return Sparkles;
  }

  return Heart;
}

const sharedCardShadow = {
  shadowColor: feedbackColors.shadow,
  shadowOffset: shadows.soft.shadowOffset,
  shadowOpacity: shadows.soft.shadowOpacity,
  shadowRadius: shadows.soft.shadowRadius,
} as const;

const styles = StyleSheet.create({
  checkCard: {
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...sharedCardShadow,
  },
  checkHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkList: {
    gap: spacing.sm,
  },
  checkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkText: {
    color: feedbackColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  checkTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  content: {
    gap: feedbackSpacing.cardGap,
    paddingBottom: spacing.xxl,
    paddingHorizontal: feedbackSpacing.screenX,
    paddingTop: spacing.xl,
  },
  finishCard: {
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: feedbackRadius.card,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  finishLabel: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  finishText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  focusCard: {
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
  focusCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  focusIcon: {
    alignItems: 'center',
    backgroundColor: feedbackColors.accentSoft,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  focusLabel: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  focusText: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  heroCard: {
    backgroundColor: feedbackColors.text,
    borderRadius: feedbackRadius.card,
    gap: spacing.md,
    padding: spacing.xl,
  },
  heroEyebrow: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    opacity: 0.7,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: feedbackColors.overlay,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  heroSummary: {
    color: colors.white,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    opacity: 0.82,
  },
  heroTitle: {
    color: colors.white,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
  },
  heroTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  returnButton: {
    alignItems: 'center',
    backgroundColor: feedbackColors.text,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  returnButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  routineCard: {
    alignItems: 'flex-start',
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    ...sharedCardShadow,
  },
  routineList: {
    gap: spacing.sm,
  },
  routineText: {
    color: feedbackColors.textMuted,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
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
    marginTop: spacing.sm,
  },
  sectionMeta: {
    color: feedbackColors.textSoft,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  sectionTitle: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: feedbackColors.text,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  stepNumberText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
});
