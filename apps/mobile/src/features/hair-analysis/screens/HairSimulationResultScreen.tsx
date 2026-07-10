import {useMemo, useState} from 'react';
import {PanResponder, Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {Bookmark, BookmarkCheck, Download, Share2} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {CachedImage} from '../../../shared/ui/CachedImage';
import type {HairSimulation} from '../types';

type HairSimulationResultScreenProps = {
  feedback?: string | null;
  onSaveAccount: () => void;
  onSaveDevice: () => void;
  onShare: () => void;
  simulation: HairSimulation;
  sourceImageUri?: string;
};

export function HairSimulationResultScreen({
  feedback,
  onSaveAccount,
  onSaveDevice,
  onShare,
  simulation,
  sourceImageUri,
}: HairSimulationResultScreenProps) {
  const {width: windowWidth} = useWindowDimensions();
  const [stageWidth, setStageWidth] = useState(Math.max(1, windowWidth - spacing.screenX * 2));
  const [ratio, setRatio] = useState(0.5);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => setRatio(Math.max(0.05, Math.min(0.95, event.nativeEvent.locationX / stageWidth))),
    onPanResponderMove: event => setRatio(Math.max(0.05, Math.min(0.95, event.nativeEvent.locationX / stageWidth))),
  }), [stageWidth]);

  if (!simulation.resultUrl) {
    return null;
  }

  return (
    <AppScreen contentGap={spacing.xl} topPadding="belowShellHeader">
      <YStack style={styles.copy}>
        <Text style={styles.eyebrow}>AI HAIR SIMULATION</Text>
        <Text style={styles.title}>{simulation.style?.name ?? '추천 헤어'} 적용 결과</Text>
        <Text style={styles.description}>
          {sourceImageUri
            ? '가운데 선을 움직여 원본과 합성 결과를 비교해 보세요.'
            : '저장해 둔 헤어 합성 결과를 확인해 보세요.'}
        </Text>
      </YStack>

      <View
        onLayout={event => setStageWidth(Math.max(1, event.nativeEvent.layout.width))}
        style={styles.stage}
        {...panResponder.panHandlers}>
        <CachedImage cachePolicy="memory" priority="high" source={{uri: simulation.resultUrl}} style={styles.stageImage} transition={0} />
        {sourceImageUri ? (
          <>
            <View style={[styles.sourceClip, {width: stageWidth * ratio}]}>
              <CachedImage source={{uri: sourceImageUri}} style={[styles.stageImage, {width: stageWidth}]} transition={0} />
            </View>
            <View style={[styles.divider, {left: stageWidth * ratio - 1}]}>
              <View style={styles.handle}><Text style={styles.handleText}>‹ ›</Text></View>
            </View>
            <XStack style={styles.stageLabels}>
              <Text style={styles.stageLabel}>원본</Text>
              <Text style={styles.stageLabel}>합성</Text>
            </XStack>
          </>
        ) : null}
      </View>

      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
      <XStack style={styles.actions}>
        <ResultAction icon={Download} label="기기 저장" onPress={onSaveDevice} />
        <ResultAction icon={Share2} label="공유" onPress={onShare} />
        <ResultAction
          icon={simulation.saved ? BookmarkCheck : Bookmark}
          label={simulation.saved ? '저장됨' : '계정 저장'}
          onPress={onSaveAccount}
        />
      </XStack>

      <YStack style={styles.notice}>
        <Text style={styles.noticeTitle}>결과 안내</Text>
        <Text style={styles.noticeText}>AI 합성 결과는 실제 시술 결과와 차이가 있을 수 있어요. 얼굴과 배경이 자연스러운지 확인해 주세요.</Text>
      </YStack>
    </AppScreen>
  );
}

function ResultAction({icon: Icon, label, onPress}: {icon: typeof Download; label: string; onPress: () => void}) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({pressed}) => [styles.action, pressed && styles.pressed]}>
      <Icon color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
      <Text numberOfLines={1} style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radius.sm, borderWidth: 1, flex: 1, gap: spacing.xs, justifyContent: 'center', minHeight: 62},
  actionText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  actions: {gap: spacing.sm},
  copy: {gap: spacing.xs},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  divider: {alignItems: 'center', backgroundColor: colors.white, bottom: 0, justifyContent: 'center', position: 'absolute', top: 0, width: 2},
  eyebrow: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  feedback: {color: colors.textPrimary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, textAlign: 'center'},
  handle: {alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.pill, height: 38, justifyContent: 'center', width: 38},
  handleText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  notice: {backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, gap: spacing.xs, padding: spacing.lg},
  noticeText: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  noticeTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  pressed: {opacity: 0.7},
  sourceClip: {bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', top: 0},
  stage: {aspectRatio: 0.78, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, overflow: 'hidden', position: 'relative'},
  stageImage: {height: '100%', left: 0, position: 'absolute', top: 0, width: '100%'},
  stageLabel: {backgroundColor: 'rgba(0,0,0,0.48)', borderRadius: radius.sm, color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs},
  stageLabels: {bottom: spacing.md, justifyContent: 'space-between', left: spacing.md, position: 'absolute', right: spacing.md},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl},
});
