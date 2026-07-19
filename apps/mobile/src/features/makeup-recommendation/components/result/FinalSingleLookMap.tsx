import {Image} from 'expo-image';
import {useEffect, useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import type {Look} from '../../screens/recommendationResultTypes';
import {colors, radius, type as typography} from '../../theme/makeupResultTokens';
import {ResultGlassCard} from './ResultGlassCard';

export interface FinalSingleLookMapProps {
  generatedReady: boolean;
  look: Look;
  onPointSettledChange?: (settled: boolean) => void;
}

export function FinalSingleLookMap({
  generatedReady,
  look,
  onPointSettledChange,
}: FinalSingleLookMapProps) {
  const x = Math.min(88, Math.max(12, look.mx));
  const y = Math.min(88, Math.max(12, 100 - look.my));
  const imageKey = useMemo(() => JSON.stringify(look.image), [look.image]);
  const [pointImageLoaded, setPointImageLoaded] = useState(false);
  const [pointImageFailed, setPointImageFailed] = useState(false);

  useEffect(() => {
    setPointImageLoaded(false);
    setPointImageFailed(false);
    onPointSettledChange?.(false);
  }, [generatedReady, imageKey, onPointSettledChange]);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        LOOK MAP
      </Text>

      <ResultGlassCard style={styles.card}>
        <View
          accessible
          accessibilityLabel={`${look.name}, 자연스러움과 개성, 캐주얼과 글램 축 위의 추천 위치`}
          style={styles.map}>
          <View style={styles.horizontalAxis} />
          <View style={styles.verticalAxis} />
          <Text style={[styles.axisLabel, styles.topLabel]}>글램</Text>
          <Text style={[styles.axisLabel, styles.bottomLabel]}>캐주얼</Text>
          <Text style={[styles.axisLabel, styles.leftLabel]}>자연스러움</Text>
          <Text style={[styles.axisLabel, styles.rightLabel]}>개성</Text>

          <View
            style={[
              styles.pointGroup,
              {
                left: `${x}%`,
                top: `${y}%`,
              },
            ]}>
            <View style={styles.point}>
              {generatedReady && !pointImageFailed ? (
                <Image
                  accessibilityIgnoresInvertColors
                  contentFit="cover"
                  contentPosition="center"
                  onError={() => {
                    setPointImageFailed(true);
                    setPointImageLoaded(false);
                    onPointSettledChange?.(true);
                  }}
                  onLoad={() => {
                    setPointImageFailed(false);
                    setPointImageLoaded(true);
                    onPointSettledChange?.(true);
                  }}
                  recyclingKey={imageKey}
                  source={look.image}
                  style={styles.pointImage}
                />
              ) : null}
              {!generatedReady || !pointImageLoaded || pointImageFailed ? (
                <View pointerEvents="none" style={styles.pointFallback}>
                  <Text style={styles.pointPlaceholder}>AURA</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.pointLabel}>
              <Text numberOfLines={1} style={styles.pointLabelText}>
                {look.name}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.rationale}>{look.mapRationale}</Text>

        <View style={styles.summary}>
          <View style={styles.summaryCopy}>
            <Text style={styles.roleLabel}>{look.roleLabel}</Text>
            <Text style={styles.lookName}>{look.name}</Text>
          </View>
          <View style={styles.summaryMeta}>
            <Text style={styles.meta}>난이도 {look.diff}</Text>
          </View>
        </View>
      </ResultGlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {gap: 8},
  title: {...typography.displayMd, marginBottom: 8},
  card: {marginTop: 2},
  map: {
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderColor: colors.glassBorder,
    borderRadius: radius.tile,
    borderWidth: 1,
    height: 270,
    overflow: 'hidden',
  },
  horizontalAxis: {
    backgroundColor: 'rgba(16,24,40,0.14)',
    height: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
  verticalAxis: {
    backgroundColor: 'rgba(16,24,40,0.14)',
    bottom: 0,
    left: '50%',
    position: 'absolute',
    top: 0,
    width: 1,
  },
  axisLabel: {
    color: colors.sub2,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    position: 'absolute',
  },
  topLabel: {alignSelf: 'center', top: 10},
  bottomLabel: {alignSelf: 'center', bottom: 10},
  leftLabel: {left: 10, top: '48%'},
  rightLabel: {right: 10, top: '48%'},
  pointGroup: {
    alignItems: 'center',
    gap: 5,
    maxWidth: 150,
    position: 'absolute',
    transform: [{translateX: -30}, {translateY: -30}],
  },
  point: {
    alignItems: 'center',
    backgroundColor: colors.heroPlaceholder,
    borderColor: colors.white,
    borderRadius: 30,
    borderWidth: 3,
    height: 60,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 60,
  },
  pointImage: {height: '100%', width: '100%'},
  pointFallback: {
    alignItems: 'center',
    backgroundColor: colors.heroPlaceholder,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pointPlaceholder: {
    color: colors.faint,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  pointLabel: {
    backgroundColor: colors.dark,
    borderRadius: 8,
    maxWidth: 150,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pointLabelText: {color: colors.white, fontSize: 10.5, fontWeight: '700'},
  rationale: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 17,
    marginTop: 12,
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    marginTop: 14,
  },
  summaryCopy: {flex: 1, gap: 3},
  roleLabel: {color: colors.sub2, fontSize: 10.5, fontWeight: '600'},
  lookName: {color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 19},
  summaryMeta: {alignItems: 'flex-end', gap: 3},
  meta: {color: colors.sub2, fontSize: 10.5, fontWeight: '500'},
});
