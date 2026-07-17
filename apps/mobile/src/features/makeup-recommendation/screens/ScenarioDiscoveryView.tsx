import {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Pressable, StyleSheet, Text, View} from 'react-native';

import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {AnalysisReportPickerSheet} from '../components/AnalysisReportPickerSheet';
import {AnalysisReportSelectorCard} from '../components/AnalysisReportSelectorCard';
import {CustomSituationComposer} from '../components/CustomSituationComposer';
import {EditorialTrendSection} from '../components/EditorialTrendSection';
import {SituationCardGrid} from '../components/SituationCardGrid';
import {SituationKeywordSheet} from '../components/SituationKeywordSheet';
import type {
  MakeupRecommendationDiscovery,
  MakeupScenarioPrompt,
  MakeupSituation,
  MakeupTrendKeyword,
} from '../types';

export type ScenarioDiscoveryViewProps = {
  catalog: MakeupRecommendationDiscovery | null;
  catalogError?: string;
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error';
  customOpen: boolean;
  customSituationError?: string;
  customSituationText: string;
  isStarting: boolean;
  showAuraLoading: boolean;
  onChangeCustomSituation: (value: string) => void;
  onCloseCustom: () => void;
  onOpenCustom: () => void;
  onRetryCatalog: () => void;
  onRetryReports: () => void;
  onSelectEditorialTrend: (prompt: MakeupScenarioPrompt) => void;
  onSelectKeyword: (keyword: MakeupTrendKeyword) => void;
  onSelectReport: (reportId: string) => void;
  onSelectSituation: (situation: MakeupSituation) => void;
  onStartFaceAnalysis?: () => void;
  onSubmitCustom: () => void;
  reportError?: string;
  reports: readonly FaceAnalysisReport[];
  reportStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  selectedKeywordId: string | null;
  selectedReportId: string | null;
  selectedSituation: MakeupSituation | undefined;
};

export function ScenarioDiscoveryView({
  catalog,
  catalogError,
  catalogStatus,
  customOpen,
  customSituationError,
  customSituationText,
  isStarting,
  showAuraLoading,
  onChangeCustomSituation,
  onCloseCustom,
  onOpenCustom,
  onRetryCatalog,
  onRetryReports,
  onSelectEditorialTrend,
  onSelectKeyword,
  onSelectReport,
  onSelectSituation,
  onStartFaceAnalysis,
  onSubmitCustom,
  reportError,
  reports,
  reportStatus,
  selectedKeywordId,
  selectedReportId,
  selectedSituation,
}: ScenarioDiscoveryViewProps) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [keywordSituation, setKeywordSituation] = useState<MakeupSituation | null>(null);
  const selectedReport = reports.find(report => report.id === selectedReportId);
  const canChooseIntent = reportStatus === 'ready' && Boolean(selectedReport);

  return (
    <View style={styles.container}>
      <AppScreen contentGap={spacing.xxl} keyboardShouldPersistTaps="handled" topPadding="belowShellHeader">

        <View style={styles.section}>
          <Text style={styles.reportHelper}>선택한 보고서 기반으로 추천메이크업이 생성됩니다</Text>
          {reportStatus === 'loading' || reportStatus === 'idle' ? (
            <View accessibilityLabel="얼굴 분석 보고서를 불러오는 중" style={styles.messageCard}>
              <Text style={styles.messageTitle}>내 보고서를 불러오고 있어요</Text>
              <Text style={styles.messageBody}>잠시만 기다려주세요.</Text>
            </View>
          ) : reportStatus === 'error' ? (
            <View accessibilityRole="alert" style={styles.messageCard}>
              <Text style={styles.messageTitle}>보고서를 불러오지 못했어요</Text>
              <Text style={styles.messageBody}>{reportError ?? '네트워크 연결을 확인해 주세요.'}</Text>
              <Pressable accessibilityRole="button" onPress={onRetryReports} style={styles.inlineAction}>
                <Text style={styles.inlineActionLabel}>다시 불러오기</Text>
              </Pressable>
            </View>
          ) : reportStatus === 'empty' || !selectedReport ? (
            <View style={styles.messageCard}>
              <Text style={styles.messageTitle}>먼저 얼굴 분석이 필요해요</Text>
              <Text style={styles.messageBody}>완료된 보고서가 생기면 상황별 맞춤 추천을 시작할 수 있어요.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{disabled: !onStartFaceAnalysis}}
                disabled={!onStartFaceAnalysis}
                onPress={onStartFaceAnalysis}
                style={[styles.primaryButton, !onStartFaceAnalysis && styles.buttonDisabled]}
              >
                <Text style={[styles.primaryLabel, !onStartFaceAnalysis && styles.buttonLabelDisabled]}>얼굴 분석 시작</Text>
              </Pressable>
            </View>
          ) : (
            <AnalysisReportSelectorCard onPress={() => setPickerVisible(true)} report={selectedReport} />
          )}

        </View>

        {canChooseIntent ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>상황 선택</Text>
            {catalogStatus === 'loading' || catalogStatus === 'idle' ? (
              <View style={styles.messageCard}><Text style={styles.messageBody}>상황 목록을 준비하고 있어요.</Text></View>
            ) : catalogStatus === 'error' || !catalog ? (
              <View accessibilityRole="alert" style={styles.messageCard}>
                <Text style={styles.messageTitle}>상황 목록을 불러오지 못했어요</Text>
                <Text style={styles.messageBody}>{catalogError ?? '잠시 후 다시 시도해 주세요.'}</Text>
                <Pressable accessibilityRole="button" onPress={onRetryCatalog} style={styles.inlineAction}>
                  <Text style={styles.inlineActionLabel}>다시 불러오기</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <SituationCardGrid
                  onSelect={situation => {
                    onSelectSituation(situation);
                    setKeywordSituation(situation);
                  }}
                  selectedSituationId={selectedSituation?.id ?? null}
                  situations={catalog.situations}
                />
                {catalog.source === 'fixture' ? (
                  <Text accessibilityRole="alert" style={styles.fallbackNotice}>연결이 불안정해 검수된 기본 키워드를 보여드려요.</Text>
                ) : null}
              </>
            )}

            <Pressable
              accessibilityHint="원하는 장면을 글로 입력합니다"
              accessibilityRole="button"
              accessibilityState={{expanded: customOpen}}
              onPress={() => {
                setKeywordSituation(null);
                onOpenCustom();
              }}
              style={[styles.customButton, customOpen && styles.customButtonSelected]}
            >
              <Text style={[styles.customButtonLabel, customOpen && styles.customButtonLabelSelected]}>+ 원하는 상황 직접 설명하기</Text>
            </Pressable>

            <View style={styles.sectionDivider} />
            <EditorialTrendSection catalog={catalog} disabled={isStarting} onSelect={onSelectEditorialTrend} />
          </View>
        ) : null}
      </AppScreen>

      {showAuraLoading ? <AuraQuestionLoadingOverlay /> : null}

      <SituationKeywordSheet
        disabled={isStarting}
        onClose={() => setKeywordSituation(null)}
        onSelect={onSelectKeyword}
        selectedKeywordId={selectedKeywordId}
        situation={keywordSituation}
        visible={Boolean(keywordSituation)}
      />

      <CustomSituationComposer
        disabled={isStarting}
        onCancel={onCloseCustom}
        onChangeText={onChangeCustomSituation}
        onSubmit={onSubmitCustom}
        serverError={customSituationError}
        value={customSituationText}
        visible={customOpen && !isStarting}
      />

      <AnalysisReportPickerSheet
        onClose={() => setPickerVisible(false)}
        onSelect={onSelectReport}
        reports={reports}
        selectedReportId={selectedReportId}
        visible={pickerVisible}
      />
    </View>
  );
}

const AURA_LETTERS = ['A', 'U', 'R', 'A'] as const;

function AuraQuestionLoadingOverlay() {
  const letterAnimations = useRef(AURA_LETTERS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.stagger(
          180,
          letterAnimations.map(value => Animated.timing(value, {
            duration: 320,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: true,
          })),
        ),
        Animated.delay(720),
        Animated.parallel(letterAnimations.map(value => Animated.timing(value, {
          duration: 260,
          easing: Easing.in(Easing.quad),
          toValue: 0,
          useNativeDriver: true,
        }))),
        Animated.delay(160),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [letterAnimations]);

  return (
    <View
      accessibilityLabel="AURA 로딩 중"
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={styles.startingOverlay}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.auraLetterRow}>
        {AURA_LETTERS.map((letter, index) => {
          const animation = letterAnimations[index];
          return (
            <Animated.Text
              key={`${letter}-${index}`}
              style={[
                styles.auraLetter,
                {
                  opacity: animation,
                  transform: [
                    {translateY: animation.interpolate({inputRange: [0, 1], outputRange: [10, 0]})},
                    {scale: animation.interpolate({inputRange: [0, 1], outputRange: [0.9, 1]})},
                  ],
                },
              ]}
            >
              {letter}
            </Animated.Text>
          );
        })}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {flex: 1},
  startingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  auraLetterRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'center'},
  auraLetter: {
    color: colors.brandMuted,
    fontFamily: typography.logoIntro.fontFamily,
    fontSize: typography.logoIntro.fontSize,
    fontWeight: typography.logoIntro.fontWeight,
    lineHeight: typography.logoIntro.lineHeight,
  },
  reportHelper: {color: colors.textTertiary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  section: {gap: spacing.md},
  sectionTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md},
  messageCard: {backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, gap: spacing.sm, padding: spacing.lg},
  messageTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md},
  messageBody: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  inlineAction: {alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44},
  inlineActionLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  primaryButton: {alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.textPrimary, borderRadius: radius.pill, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.lg},
  primaryLabel: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  buttonDisabled: {backgroundColor: colors.border},
  buttonLabelDisabled: {color: colors.textTertiary},
  customButton: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.md},
  customButtonSelected: {backgroundColor: colors.textPrimary, borderColor: colors.textPrimary},
  customButtonLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  customButtonLabelSelected: {color: colors.white},
  fallbackNotice: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs},
  sectionDivider: {backgroundColor: colors.divider, height: 1, marginVertical: spacing.xs},
});
