import {useEffect, useState} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {ChevronDown} from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {Text, View} from 'tamagui';

import {FeedbackEvidenceImage} from './FeedbackEvidenceImage';
import {
  feedbackRedesignColors as C,
  feedbackRedesignFonts,
  feedbackRedesignGradients,
  tabularNumbers,
} from './feedbackRedesignTheme';
import type {MakeupFeedbackRedesignScoreAxis} from './makeupFeedbackResultViewModel';

export function FeedbackScoreAxisAccordion({
  axis,
  isOpen,
  onJumpToEvaluation,
  onToggle,
  reduceMotion,
}: {
  axis: MakeupFeedbackRedesignScoreAxis;
  isOpen: boolean;
  onJumpToEvaluation?: () => void;
  onToggle: () => void;
  reduceMotion: boolean;
}) {
  const evidence = axis.primaryEvidence;
  const crop = evidence?.crop;
  const progress = useSharedValue(isOpen ? 1 : 0);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    progress.value = reduceMotion
      ? isOpen
        ? 1
        : 0
      : withTiming(isOpen ? 1 : 0, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        });
  }, [isOpen, progress, reduceMotion]);

  const bodyAnimatedStyle = useAnimatedStyle(() => ({
    height: bodyHeight > 0
      ? progress.value * bodyHeight
      : isOpen
        ? undefined
        : 0,
    opacity: progress.value,
  }));
  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{rotate: `${progress.value * 180}deg`}],
  }));

  return (
    <View
      style={[
        styles.card,
        isOpen
          ? crop
            ? styles.cardOpen
            : styles.cardOpenWithoutCrop
          : undefined,
      ]}>
      <Pressable
        accessibilityLabel={`${axis.label} ${axis.score}/${axis.maxScore} 상세 ${isOpen ? '접기' : '보기'}`}
        accessibilityRole="button"
        accessibilityState={{expanded: isOpen}}
        onPress={onToggle}
        style={({pressed}) => [styles.headerButton, pressed && styles.pressed]}>
        <Text style={[styles.axisName, isOpen && crop ? styles.axisNameOpen : undefined]}>
          {axis.label}
        </Text>
        <Text style={styles.axisScore}>
          {axis.score}
          <Text style={styles.axisMax}>{`/${axis.maxScore}`}</Text>
        </Text>
        <Animated.View style={chevronAnimatedStyle}>
          <ChevronDown color={C.chevron} size={16} strokeWidth={2} />
        </Animated.View>
      </Pressable>

      <View
        accessibilityLabel={`${axis.label} 점수`}
        accessibilityRole="progressbar"
        accessibilityValue={{
          max: axis.maxScore,
          min: 0,
          now: axis.score,
          text: `${axis.score}/${axis.maxScore}`,
        }}
        style={styles.track}>
        {axis.percentage !== null && axis.percentage > 0 ? (
          <LinearGradient
            colors={[...feedbackRedesignGradients.axisBar.colors]}
            end={{x: 1, y: 0.5}}
            locations={[...feedbackRedesignGradients.axisBar.locations]}
            start={{x: 0, y: 0.5}}
            style={[styles.fill, {width: `${axis.percentage}%`}]}
          />
        ) : null}
      </View>

      <Animated.View
        accessibilityElementsHidden={!isOpen}
        importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={[styles.animatedBody, bodyAnimatedStyle]}>
          <View
            onLayout={event => setBodyHeight(event.nativeEvent.layout.height)}
            style={styles.body}>
            {crop ? (
              <FeedbackEvidenceImage
                accessibilityLabel={`${crop.label} 분석 근거 확대 사진`}
                height={150}
                imageSize={crop.imageSize}
                label={crop.label}
                region={crop.region}
                source={crop.source}
                topicId={evidence?.topicId}
              />
            ) : (
              <View style={styles.noCrop}>
                <Text style={styles.noCropText}>
                  이 점수는 특정 확대 부위와 연결되지 않았어요
                </Text>
              </View>
            )}

            {axis.components.length > 0 ? (
              <View style={styles.componentSection}>
                <Text style={styles.reasonLabel}>세부 점수</Text>
                {axis.components.map(component => (
                  <View key={component.id} style={styles.componentRow}>
                    <View style={styles.componentHeader}>
                      <Text style={styles.componentLabel}>{component.label}</Text>
                      <Text style={styles.componentScore}>
                        {component.score}
                        <Text style={styles.componentMax}>{`/${component.maxScore}`}</Text>
                      </Text>
                    </View>
                    <View
                      accessibilityLabel={`${component.label} ${component.score}/${component.maxScore}`}
                      accessibilityRole="progressbar"
                      accessibilityValue={{
                        max: component.maxScore,
                        min: 0,
                        now: component.score,
                        text: `${component.score}/${component.maxScore}`,
                      }}
                      style={styles.componentTrack}>
                      {component.percentage !== null && component.percentage > 0 ? (
                        <View
                          style={[
                            styles.componentFill,
                            {width: `${component.percentage}%`},
                          ]}
                        />
                      ) : null}
                    </View>
                    {component.reason ? (
                      <Text style={styles.componentReason}>{component.reason}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {axis.reason ? (
              <View style={styles.reasonBlock}>
                <Text style={styles.reasonLabel}>점수 판단</Text>
                <Text style={styles.reasonText}>{axis.reason}</Text>
              </View>
            ) : null}

            {axis.evidence.length > 0 ? (
              <View style={styles.reasonBlock}>
                <Text style={styles.reasonLabel}>사진에서 확인한 점</Text>
                {axis.evidence.map(item => (
                  <View
                    key={`${item.evaluationId}-${item.observation.id}`}
                    style={styles.evidenceRow}>
                    <View style={styles.evidenceDot} />
                    <Text style={styles.evidenceText}>
                      <Text style={styles.evidenceTopic}>{item.topicLabel} · </Text>
                      {item.note}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {evidence?.possibility ? (
              <Text style={styles.possibility}>↗ {evidence.possibility}</Text>
            ) : null}

            {onJumpToEvaluation && evidence ? (
              <Pressable
                accessibilityLabel={`${evidence.topicLabel} ${evidence.evaluationNumber}번 카드로 이동`}
                accessibilityRole="button"
                onPress={onJumpToEvaluation}
                style={({pressed}) => [styles.jumpButton, pressed && styles.pressed]}>
                <Text style={styles.jumpText}>
                  {evidence.topicLabel} {evidence.evaluationNumber}번 카드로 이동 ›
                </Text>
              </Pressable>
            ) : null}
          </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  animatedBody: {
    overflow: 'hidden',
  },
  axisMax: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 12,
  },
  axisName: {
    color: C.ink,
    flex: 1,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 14,
  },
  axisNameOpen: {
    color: C.primary,
  },
  axisScore: {
    ...tabularNumbers,
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 16,
  },
  body: {
    gap: 12,
    paddingTop: 14,
  },
  card: {
    backgroundColor: C.card,
    borderColor: C.borderCard,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    shadowColor: '#16303B',
    shadowOffset: {height: 2, width: 0},
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  cardOpen: {
    borderColor: C.borderAxisOpen,
  },
  cardOpenWithoutCrop: {
    borderColor: C.borderAxisOpenSoft,
  },
  componentFill: {
    backgroundColor: C.primary,
    borderRadius: 99,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  componentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  componentLabel: {
    color: C.ink,
    flex: 1,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 12,
  },
  componentMax: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.medium,
    fontSize: 10,
  },
  componentReason: {
    color: C.textMuted,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 11,
    lineHeight: 17,
  },
  componentRow: {
    gap: 5,
  },
  componentScore: {
    ...tabularNumbers,
    color: C.primary,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 12,
  },
  componentSection: {
    gap: 10,
  },
  componentTrack: {
    backgroundColor: C.barTrack,
    borderRadius: 99,
    height: 4,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 99,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  evidenceDot: {
    backgroundColor: C.primary,
    borderRadius: 999,
    height: 5,
    marginTop: 7,
    width: 5,
  },
  evidenceRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
  },
  evidenceText: {
    color: C.textMuted,
    flex: 1,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 12,
    lineHeight: 19,
  },
  evidenceTopic: {
    color: C.ink,
    fontFamily: feedbackRedesignFonts.semibold,
  },
  headerButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
  },
  jumpButton: {
    alignSelf: 'flex-start',
    backgroundColor: C.chipBg,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  jumpText: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 12,
  },
  noCrop: {
    alignItems: 'center',
    backgroundColor: C.neutralChipBg,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 74,
    paddingHorizontal: 16,
  },
  noCropText: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 13,
    textAlign: 'center',
  },
  possibility: {
    color: C.primary,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 12,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.76,
  },
  reasonBlock: {
    gap: 4,
  },
  reasonLabel: {
    color: C.textMuted3,
    fontFamily: feedbackRedesignFonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  reasonText: {
    color: C.textMuted,
    fontFamily: feedbackRedesignFonts.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  track: {
    backgroundColor: C.barTrack,
    borderRadius: 99,
    height: 5,
    marginTop: 10,
    overflow: 'hidden',
  },
});
