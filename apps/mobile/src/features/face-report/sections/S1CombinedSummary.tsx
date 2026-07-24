import React, {type ReactNode} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ArrowRight, Check} from 'lucide-react-native';
import Animated, {FadeIn, FadeInUp, useReducedMotion} from 'react-native-reanimated';

import {color, font, radius} from '../reportTokens';
import type {S1Data} from '../reportTypes';
import {LegacyBadge} from '../visuals/Badge';
import {PhotoSlot} from '../visuals/PhotoSlot';
import {ReadableParagraphs} from '../visuals/ReadableParagraphs';
import {RiseIn} from '../visuals/RiseIn';

type S1CombinedSummaryProps = {
  children?: ReactNode;
  data: S1Data;
  introMinHeight?: number;
  onPressCta?: () => void;
};

function pickHighlights(cards: S1Data['cards']) {
  const priority = ['얼굴형', '얼굴 비율', '추천 무드', '인상'];
  const selected = priority
    .map(label => cards.find(card => card.label === label))
    .filter((card): card is S1Data['cards'][number] => Boolean(card));

  for (const card of cards) {
    if (selected.length >= 3) {
      break;
    }
    if (!selected.includes(card)) {
      selected.push(card);
    }
  }
  return selected.slice(0, 3);
}

/**
 * 보고서 첫 화면. 분석 요약을 먼저 읽은 뒤 같은 흐름에서 TrueDepth 3D
 * 마스크를 바로 조작하도록 요약과 Golden Mask를 한 장에 묶는다.
 */
export function S1CombinedSummary({
  children,
  data,
  introMinHeight,
  onPressCta,
}: S1CombinedSummaryProps) {
  const highlights = pickHighlights(data.cards);
  const reduceMotion = useReducedMotion();

  return (
    <RiseIn style={styles.root}>
      <View style={[styles.intro, introMinHeight ? {minHeight: introMinHeight} : null]}>
        <View style={styles.chapterMark}>
          <View style={styles.chapterRule} />
          <Text style={styles.chapterLabel}>01 · PORTRAIT</Text>
        </View>
        <Text style={styles.photoLabel}>분석에 사용한 원본</Text>
        <Animated.View
          accessible
          accessibilityLabel="분석에 사용한 원본 얼굴 사진"
          accessibilityRole="image"
          entering={reduceMotion ? undefined : FadeIn.duration(420)}
          style={styles.capturePhotoRing}>
          <PhotoSlot
            shape="circle"
            slot={data.photo}
            style={styles.capturePhoto}
          />
        </Animated.View>
        <Text style={styles.dateLine}>{data.dateLine}</Text>

        <Animated.View
          entering={reduceMotion ? undefined : FadeInUp.delay(80).duration(440)}
          style={styles.copy}>
          <Text style={styles.eyebrow}>YOUR FACE SUMMARY</Text>
          <Text accessibilityRole="header" style={styles.headline}>
            {data.headline}
          </Text>
          {data.body ? (
            <ReadableParagraphs
              gap={8}
              style={styles.bodyGroup}
              text={data.body}
              textStyle={styles.body}
            />
          ) : null}
        </Animated.View>

        {data.legacyReport ? <LegacyBadge label={data.legacyBadge} /> : null}

        {highlights.length ? (
          <Animated.View
            accessibilityLabel="얼굴 분석 핵심 특징"
            entering={reduceMotion ? undefined : FadeInUp.delay(150).duration(440)}
            style={styles.highlights}>
            {highlights.map((card, index) => (
              <View
                key={card.label}
                style={[
                  styles.highlight,
                  index > 0 ? styles.highlightDivider : null,
                ]}>
                <View style={styles.check}>
                  <Check color={color.white} size={12} strokeWidth={3} />
                </View>
                <Text numberOfLines={2} style={styles.highlightValue}>
                  {card.value}
                </Text>
                <Text numberOfLines={1} style={styles.highlightLabel}>
                  {card.label}
                </Text>
              </View>
            ))}
          </Animated.View>
        ) : null}

        {onPressCta ? (
          <Pressable
            accessibilityRole="button"
            onPress={onPressCta}
            style={({pressed}) => [
              styles.cta,
              pressed ? styles.ctaPressed : null,
            ]}>
            <Text style={styles.ctaText}>내 분석에 맞는 메이크업 보기</Text>
            <ArrowRight color={color.white} size={17} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>

      {children ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInUp.duration(420)}
          style={styles.evidence}>
          <Text style={styles.evidenceEyebrow}>3D 분석 근거</Text>
          <Text accessibilityRole="header" style={styles.evidenceTitle}>
            얼굴 표면을 더 자세히 볼 수 있어요
          </Text>
          <Text style={styles.evidenceBody}>
            TrueDepth로 확인한 얼굴 표면이에요. 원하면 돌려보며 확인할 수 있어요.
          </Text>
          <View style={styles.optionalChip}>
            <Text style={styles.optionalChipText}>아래로 이어지는 상세 분석</Text>
          </View>
          {children}
        </Animated.View>
      ) : null}
    </RiseIn>
  );
}

const styles = StyleSheet.create({
  body: {
    ...font(14, '400', 1.6),
    color: color.text,
    maxWidth: 340,
  },
  bodyGroup: {
    maxWidth: 340,
  },
  capturePhoto: {
    height: '100%',
    width: '100%',
  },
  capturePhotoRing: {
    aspectRatio: 1,
    backgroundColor: color.surface,
    borderColor: color.outline8,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 260,
    minWidth: 220,
    padding: 3,
    width: '74%',
  },
  check: {
    alignItems: 'center',
    backgroundColor: color.accentDeep,
    borderRadius: radius.pill,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  copy: {
    alignItems: 'center',
    gap: 9,
    width: '100%',
  },
  cta: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: color.accentDeep,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  ctaPressed: {
    opacity: 0.78,
    transform: [{scale: 0.99}],
  },
  ctaText: {
    ...font(13, '800'),
    color: color.white,
  },
  dateLine: {
    ...font(12, '600', undefined, 0.15),
    color: color.muted,
    textAlign: 'center',
  },
  evidence: {
    gap: 11,
    paddingBottom: 26,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  evidenceBody: {
    ...font(13.5, '400', 1.55),
    color: color.text,
    maxWidth: 350,
  },
  evidenceEyebrow: {
    ...font(11, '800', undefined, 1),
    color: color.accentDeep,
  },
  evidenceTitle: {
    ...font(20, '800', 1.28, -0.2),
    color: color.ink,
  },
  optionalChip: {
    alignSelf: 'flex-start',
    marginBottom: 3,
  },
  optionalChipText: {
    ...font(10.5, '700'),
    color: color.accentDeep,
  },
  eyebrow: {
    ...font(11, '800', undefined, 1.1),
    color: color.accentDeep,
  },
  headline: {
    ...font(26, '800', 1.25, -0.35),
    color: color.ink,
    maxWidth: 350,
    textAlign: 'center',
  },
  highlight: {
    alignItems: 'center',
    flex: 1,
    gap: 5,
    justifyContent: 'flex-start',
    minHeight: 86,
    paddingHorizontal: 7,
  },
  highlightDivider: {
    borderLeftColor: color.rail,
    borderLeftWidth: 1,
  },
  highlightLabel: {
    ...font(11, '600'),
    color: color.muted,
    textAlign: 'center',
  },
  highlightValue: {
    ...font(12.5, '800', 1.3),
    color: color.ink,
    textAlign: 'center',
  },
  highlights: {
    alignItems: 'stretch',
    flexDirection: 'row',
    marginHorizontal: -4,
    width: '100%',
  },
  intro: {
    alignItems: 'center',
    gap: 18,
    justifyContent: 'flex-start',
    paddingBottom: 30,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  chapterLabel: {
    ...font(10.5, '700', undefined, 1.25),
    color: color.accentDeep,
  },
  chapterMark: {
    alignSelf: 'stretch',
    gap: 11,
    marginBottom: 2,
  },
  chapterRule: {
    backgroundColor: color.accentDeep,
    borderRadius: 1,
    height: 2,
    width: 44,
  },
  photoLabel: {
    ...font(11, '700', undefined, 0.2),
    color: color.muted,
  },
  root: {
    paddingBottom: 0,
  },
});
