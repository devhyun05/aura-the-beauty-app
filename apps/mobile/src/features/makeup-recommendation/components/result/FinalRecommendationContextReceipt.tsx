import {Image} from 'expo-image';
import {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import type {FinalRecommendationAnswerRow} from '../../services/toFinalRecommendationResult';
import {colors, radius, type as typography} from '../../theme/makeupResultTokens';
import type {MakeupRecommendationSourceReportSummary} from '../../types';
import {ResultGlassCard} from './ResultGlassCard';

export interface FinalRecommendationContextReceiptProps {
  reportLabel?: string;
  reportAnalyzedAt?: string;
  reportImageUri?: string;
  reportSummary?: MakeupRecommendationSourceReportSummary;
  situationLabel?: string;
  keywordLabel?: string;
  onImageSettledChange?: (settled: boolean) => void;
  answerRows: readonly FinalRecommendationAnswerRow[];
  additionalConstraints?: string;
}

function formatReportDate(value?: string) {
  if (!value?.trim()) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('ko-KR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function cleanReportLabel(value?: string) {
  const label = value?.trim();
  if (!label) return undefined;

  return label
    .replace(/\s*(?:#?\d+|[0-9a-f]{8,}(?:-[0-9a-f-]+)?)\s*$/i, '')
    .trim() || undefined;
}

export function FinalRecommendationContextReceipt({
  reportLabel,
  reportAnalyzedAt,
  reportImageUri,
  reportSummary,
  situationLabel,
  keywordLabel,
  onImageSettledChange,
  answerRows,
  additionalConstraints,
}: FinalRecommendationContextReceiptProps) {
  const summaryItems = [
    situationLabel ? {key: 'situation', label: '상황', value: situationLabel} : undefined,
    keywordLabel ? {key: 'keyword', label: '키워드', value: keywordLabel} : undefined,
  ].filter((item): item is {key: string; label: string; value: string} => item != null);
  const trimmedConstraints = additionalConstraints?.trim();
  const reportImageKey = reportImageUri?.trim() || '';
  const [reportImageFailed, setReportImageFailed] = useState(false);
  const reportDate = formatReportDate(reportAnalyzedAt);
  const hasSourceReport = Boolean(reportLabel || reportAnalyzedAt || reportImageUri || reportSummary);
  const reportTitle =
    reportSummary?.title?.trim() ||
    cleanReportLabel(reportLabel) ||
    '얼굴 분석 보고서';
  const reportMeta = [
    reportDate ? `${reportDate} 분석` : undefined,
    reportSummary?.environmentLabel?.trim(),
  ].filter((value): value is string => Boolean(value));
  useEffect(() => {
    setReportImageFailed(false);
    onImageSettledChange?.(!reportImageKey);
  }, [onImageSettledChange, reportImageKey]);

  const reportTags = [
    reportSummary?.personalColor,
    reportSummary?.faceShape,
    reportSummary?.skinType,
  ].filter((value, index, values): value is string => {
    const trimmedValue = value?.trim();
    return Boolean(trimmedValue) && values.findIndex(item => item?.trim() === trimmedValue) === index;
  });

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        이번 추천에 반영했어요
      </Text>

      <ResultGlassCard style={styles.card}>
        {hasSourceReport ? (
          <View
            accessible
            accessibilityLabel={['사용한 분석 보고서', reportTitle, reportDate, ...reportTags].filter(Boolean).join(', ')}
            style={styles.reportCard}>
            <View style={styles.reportImageFrame}>
              {reportImageKey && !reportImageFailed ? (
                <Image
                  accessibilityIgnoresInvertColors
                  contentFit="cover"
                  onError={() => {
                    setReportImageFailed(true);
                    onImageSettledChange?.(true);
                  }}
                  onLoad={() => onImageSettledChange?.(true)}
                  recyclingKey={reportImageKey}
                  source={{uri: reportImageKey}}
                  style={styles.reportImage}
                />
              ) : (
                <Text style={styles.reportImageFallback}>AURA</Text>
              )}
            </View>
            <View style={styles.reportCopy}>
              <Text style={styles.reportEyebrow}>사용한 분석 보고서</Text>
              <Text numberOfLines={2} style={styles.reportTitle}>
                {reportTitle}
              </Text>
              <Text style={styles.reportMeta}>
                {reportMeta.length > 0 ? reportMeta.join(' · ') : '선택한 얼굴 분석 결과'}
              </Text>
              {reportTags.length > 0 ? (
                <View style={styles.reportTags}>
                  {reportTags.map(tag => (
                    <View key={tag} style={styles.reportTag}>
                      <Text style={styles.reportTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Text numberOfLines={2} style={styles.reportDescription}>
                퍼스널 컬러·얼굴형·피부 분석 결과를 기준으로 추천했어요.
              </Text>
            </View>
          </View>
        ) : null}

        {summaryItems.length > 0 ? (
          <View style={[styles.summaryList, hasSourceReport && styles.withDivider]}>
            {summaryItems.map(item => (
              <View key={item.key} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{item.label}</Text>
                <Text style={styles.summaryValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {answerRows.length > 0 ? (
          <View
            style={[
              styles.answerList,
              summaryItems.length > 0
                ? styles.answerInline
                : hasSourceReport && styles.withDivider,
            ]}>
            <Text accessibilityRole="header" style={styles.answerSectionTitle}>
              역질문 답변
            </Text>
            {answerRows.map((row, index) => (
              <View key={row.id} style={styles.answerRow}>
                <View style={styles.answerNumber}>
                  <Text style={styles.answerNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.answerCopy}>
                  <Text style={styles.questionLabel}>{row.questionLabel}</Text>
                  <Text style={styles.answerLabel}>{row.answerLabel}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {trimmedConstraints ? (
          <View
            style={[
              styles.constraintBox,
              (hasSourceReport || summaryItems.length > 0 || answerRows.length > 0) &&
                styles.constraintSpacing,
            ]}>
            <Text style={styles.constraintLabel}>추가로 반영한 요청</Text>
            <Text style={styles.constraintText}>{trimmedConstraints}</Text>
          </View>
        ) : null}
      </ResultGlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {gap: 8},
  title: {...typography.displayMd},
  card: {marginTop: 10},
  reportCard: {
    alignItems: 'center',
    backgroundColor: colors.glassInner,
    borderColor: colors.glassBorder,
    borderRadius: radius.tile,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    padding: 12,
  },
  reportImageFrame: {
    alignItems: 'center',
    backgroundColor: colors.heroPlaceholder,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: 1,
    height: 86,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 72,
  },
  reportImage: {height: '100%', width: '100%'},
  reportImageFallback: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  reportCopy: {flex: 1, gap: 3, minWidth: 0},
  reportEyebrow: {
    color: colors.faint,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  reportTitle: {color: colors.ink, fontSize: 15, fontWeight: '800'},
  reportMeta: {color: colors.sub2, fontSize: 11, fontWeight: '600'},
  reportTags: {flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2},
  reportTag: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  reportTagText: {color: colors.ink3, fontSize: 9, fontWeight: '700'},
  reportDescription: {
    color: colors.ink3,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 2,
  },
  summaryList: {gap: 9},
  summaryRow: {alignItems: 'flex-start', flexDirection: 'row', gap: 12},
  summaryLabel: {
    color: colors.faint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingTop: 2,
    width: 72,
  },
  summaryValue: {
    color: colors.ink,
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 20,
  },
  answerList: {gap: 14},
  answerInline: {marginTop: 6},
  answerSectionTitle: {color: colors.ink, fontSize: 14, fontWeight: '800'},
  withDivider: {
    borderTopColor: 'rgba(16,24,40,0.1)',
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 18,
  },
  answerRow: {alignItems: 'flex-start', flexDirection: 'row', gap: 12},
  answerNumber: {
    alignItems: 'center',
    backgroundColor: colors.dark,
    borderRadius: 10,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  answerNumberText: {color: colors.white, fontSize: 11, fontWeight: '800'},
  answerCopy: {flex: 1, gap: 3},
  questionLabel: {
    color: colors.sub2,
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 15,
  },
  answerLabel: {
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 20,
  },
  constraintBox: {
    backgroundColor: colors.glassInner,
    borderRadius: radius.tile,
    gap: 5,
    padding: 14,
  },
  constraintSpacing: {marginTop: 18},
  constraintLabel: {
    color: colors.faint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  constraintText: {
    color: colors.ink3,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
  },
});
