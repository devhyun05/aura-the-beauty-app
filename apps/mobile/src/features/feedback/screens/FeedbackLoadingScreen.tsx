import React, {useEffect} from 'react';
import {ActivityIndicator, StyleSheet} from 'react-native';
import {Sparkles} from 'lucide-react-native';
import {Text, View, YStack} from 'tamagui';

import {
  colors,
  feedbackColors,
  feedbackRadius,
  iconSize,
  radius,
  spacing,
  typography,
} from '../../../shared/theme';
import {FeedbackScreenScaffold} from '../components/FeedbackScreenScaffold';
import {requestMakeupFeedback} from '../services/makeupFeedbackService';
import type {FeedbackPhotoSelection, MakeupFeedbackResult} from '../types';

type FeedbackLoadingScreenProps = {
  selection: FeedbackPhotoSelection;
  onComplete: (result: MakeupFeedbackResult) => void;
};

export function FeedbackLoadingScreen({selection, onComplete}: FeedbackLoadingScreenProps) {
  useEffect(() => {
    let isMounted = true;

    requestMakeupFeedback(selection).then((result) => {
      if (isMounted) {
        onComplete(result);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [onComplete, selection]);

  return (
    <FeedbackScreenScaffold>
      <YStack style={styles.screen}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Sparkles color={colors.white} size={iconSize.xl} strokeWidth={2} />
          </View>
          <Text style={styles.title}>AI 분석 중</Text>
          <Text style={styles.subtitle}>메이크업 밸런스를 정리하고 있어요</Text>
          <ActivityIndicator color={colors.black} size="large" style={styles.loader} />
        </View>
      </YStack>
    </FeedbackScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: feedbackColors.surface,
    borderColor: feedbackColors.borderSoft,
    borderRadius: feedbackRadius.sheet,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl * 2,
    width: '100%',
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: 68,
    justifyContent: 'center',
    marginBottom: spacing.xl,
    width: 68,
  },
  loader: {
    marginTop: spacing.xl,
  },
  screen: {
    alignItems: 'center',
    backgroundColor: feedbackColors.background,
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  subtitle: {
    color: feedbackColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  title: {
    color: feedbackColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
});
