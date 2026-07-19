import {useState} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {ChevronDown, ChevronUp, MessageSquareText} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyReportPrompt} from '../utils/reportPrompt';

const COLLAPSE_TEXT_LENGTH = 72;

type JourneyPromptCardProps = {
  prompt: MakeupJourneyReportPrompt;
};

export function JourneyPromptCard({prompt}: JourneyPromptCardProps) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = prompt.text.length > COLLAPSE_TEXT_LENGTH;

  return (
    <View accessibilityLabel="내가 요청한 내용" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <MessageSquareText color={colors.textPrimary} size={19} strokeWidth={1.8} />
        </View>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={styles.title}>내가 요청한 내용</Text>
          <Text style={styles.caption}>
            {prompt.isInherited
              ? '이전 피드백의 요청을 이어받아 분석했어요.'
              : 'AI 피드백을 받을 때 입력한 내용이에요.'}
          </Text>
        </View>
      </View>
      <View style={styles.promptBox}>
        <Text numberOfLines={expanded ? undefined : 3} style={styles.promptText}>
          {prompt.text}
        </Text>
        {canExpand ? (
          <Pressable
            accessibilityLabel={expanded ? '요청 내용 접기' : '요청 내용 더보기'}
            accessibilityRole="button"
            onPress={() => setExpanded(current => !current)}
            style={({pressed}) => [styles.expandButton, pressed ? styles.pressed : null]}>
            <Text style={styles.expandText}>{expanded ? '접기' : '더보기'}</Text>
            {expanded
              ? <ChevronUp color={colors.textSecondary} size={15} />
              : <ChevronDown color={colors.textSecondary} size={15} />}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.025,
    shadowRadius: 10,
  },
  expandButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 2,
    minHeight: 30,
  },
  expandText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  pressed: {
    opacity: 0.64,
  },
  promptBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  promptText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: 22,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
});
