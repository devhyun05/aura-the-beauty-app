import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {RotateCcw} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import {captureRef} from 'react-native-view-shot';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  FaceVerticalThirdsInput,
  FaceVerticalThirdsResult,
  VerticalThirdsDominantPart,
  VerticalThirdsKeypoint,
} from '../types';
import {
  analyzeFaceVerticalThirds,
  finalizeOverlayArtifact,
} from '../services/faceVerticalThirdsService';
import {
  getFaceLengthTitle,
  getGaugeMarkerPercent,
  isJudgmentVersionCurrent,
  judgeFaceLength,
} from '../constants';
import {getVerticalThirdsPhotoAspectRatio} from '../verticalThirdsDisplayGeometry';

type FaceVerticalThirdsCapture = {
  capturedAt?: string;
  captureId?: string;
  imageUri: string;
  mediaId?: string;
  photoCaptureId?: string;
  // 촬영 시 Apple semantic matte 임베드 여부 — analyzeFaceVerticalThirds 입력으로 전달해
  // matte:ready 로그와 hairline 파싱 스킵 판단에 사용한다.
  semanticMattes?: {hair: boolean; requested: boolean; skin: boolean};
  source?: string;
  validationReplay?: FaceVerticalThirdsInput['validationReplay'];
};

type FaceVerticalThirdsScreenProps = {
  capture: FaceVerticalThirdsCapture;
  debug?: boolean;
  onAnalysisResult?: (result: FaceVerticalThirdsResult) => void;
  onRetake: () => void;
};

const REPORT_ACCENT = '#6ECBE8';
const REPORT_ACCENT_DARK = '#22AEDD';
const REPORT_MARKER = '#FF0B83';
const REPORT_MUTED = '#A8A8A8';
const REPORT_DIVIDER = '#F0F0F0';
// 길이비 기준값·게이지·판정은 ../constants 단일 정의처에서 파생(Phase 0-1).
// 종전 화면 로컬 상수(1.351/1.455/1.506)·마커 스케일(1.28/1.56)·
// 라벨 x좌표('28%/47%')·±0.02 임계의 4중 하드코딩을 제거했다.

function formatRatio(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(2)
    : '-';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isSuccessResult(
  result: FaceVerticalThirdsResult | null,
): result is FaceVerticalThirdsResult {
  return result?.status === 'partial_success' || result?.status === 'full_success';
}

function getStageSourceUri(result: FaceVerticalThirdsResult | null, fallbackUri: string) {
  return result?.sourceImage.uri ?? fallbackUri;
}

function getVerticalTitle(
  part: VerticalThirdsDominantPart | undefined,
  measurementMode: FaceVerticalThirdsResult['measurementMode'],
) {
  if (measurementMode === 'middle_lower_only') {
    return '중안부·하안부 비율';
  }

  if (part === 'upper') {
    return '상안부는 참고용 비율';
  }

  if (part === 'middle') {
    return '중안부가 상대적으로 긴 얼굴';
  }

  if (part === 'lower') {
    return '하안부가 중안부보다 긴 얼굴';
  }

  if (part === 'balanced') {
    return '균형에 가까운 얼굴';
  }

  return '세로 비율 분석 중';
}

// 얼굴 세로/가로 비율 = 헤어라인~턱끝(세로) / 양 볼 너비(가로).
// 서비스가 idx234/454로 계산한 실제 값을 쓴다. 측정 불가 시 null.
function getFaceLengthRatio(result: FaceVerticalThirdsResult | null): number | null {
  const ratio = result?.faceLength?.ratio;

  return typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : null;
}

function FaceReportIcon() {
  return (
    <Svg height={52} viewBox="0 0 52 52" width={52}>
      <Circle cx={26} cy={24} fill="none" r={18} stroke={colors.textPrimary} strokeWidth={2.4} />
      <Path
        d="M20 31 C23 34 29 34 32 31"
        fill="none"
        stroke={colors.textPrimary}
        strokeLinecap="round"
        strokeWidth={2.2}
      />
    </Svg>
  );
}

function LoadingReport({onRetake}: {onRetake?: () => void}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, {paddingTop: insets.top + spacing.xl}]}>
      <StatusBar style="dark" />
      {onRetake ? <RetakeButton onRetake={onRetake} /> : null}
      <View style={styles.loadingContent}>
        <ActivityIndicator color={REPORT_ACCENT_DARK} />
        <Text style={styles.loadingTitle}>얼굴형 분석</Text>
        <Text style={styles.loadingText}>촬영 사진에서 얼굴 비율을 분석하고 있어요.</Text>
      </View>
    </View>
  );
}

function RetakeButton({onRetake}: {onRetake: () => void}) {
  return (
    <Pressable
      accessibilityLabel="다시 촬영"
      accessibilityRole="button"
      onPress={onRetake}
      style={styles.retakeButton}>
      <RotateCcw color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.2} />
      <Text style={styles.retakeButtonText}>다시 촬영</Text>
    </Pressable>
  );
}

function ReportHeader({
  onRetake,
  result,
}: {
  onRetake: () => void;
  result: FaceVerticalThirdsResult;
}) {
  return (
    <View style={styles.headerSection}>
      <RetakeButton onRetake={onRetake} />
      <FaceReportIcon />
      <Text style={styles.reportTitle}>얼굴형 분석</Text>
      <Text style={styles.reportSubtitle}>
        얼굴의 길이, 좌우 및 상하 비율을 분석한 내용입니다.
      </Text>
      {result.status === 'blocked' || result.status === 'failed' ? (
        <Text style={styles.reportWarning}>
          분석 기준선을 안정적으로 잡지 못했어요. 다시 촬영해 주세요.
        </Text>
      ) : null}
    </View>
  );
}

function FaceLengthGauge({result}: {result: FaceVerticalThirdsResult}) {
  const lengthRatio = getFaceLengthRatio(result);

  if (lengthRatio === null) {
    return (
      <View style={styles.lengthSection}>
        <Text style={styles.sectionEyebrow}>얼굴 길이 비율</Text>
        <Text style={styles.sectionTitle}>측정할 수 없어요</Text>
        <Text style={styles.faceLengthUnavailable}>
          헤어라인 또는 얼굴 윤곽을 인식하지 못해 세로·가로 비율을 계산하지 못했어요.
        </Text>
      </View>
    );
  }

  // 판정 스냅샷 우선(Phase 0-5): 측정 시점에 동결된 판정을 렌더한다 —
  // 상수 개정이 과거 결과를 조용히 재판정하지 못하게 하는 실소비 지점.
  // 폴백(현재 판정기 재계산)은 방어용 — 이 화면은 항상 신규 분석이라
  // 현재는 도달하지 않고, 저장 결과를 이 컴포넌트로 렌더하는 표면이
  // 생기는 순간부터 스냅샷 부재 구 데이터에 적용된다.
  const judgment =
    result.faceLengthJudgment ??
    judgeFaceLength(lengthRatio, result.quality.pitch, result.quality.yaw);
  const markerPercent = getGaugeMarkerPercent(lengthRatio);
  const isBorderline =
    judgment.verdict === 'borderline_wide' ||
    judgment.verdict === 'borderline_long';
  // 판정 보류면 범주 마커를 숨긴다 — "보류" 제목 옆에 마커가 특정 범주를
  // 가리키는 모순 방지(3차 리뷰). 기준 개정 후 복원된 스냅샷은 제목(구 기준)과
  // 게이지 범주(현행 스케일)가 다를 수 있어 안내를 붙인다.
  const showsMarker = judgment.verdict !== 'indeterminate';
  const isStaleJudgment =
    result.faceLengthJudgment !== undefined &&
    !isJudgmentVersionCurrent(result.judgmentVersion);

  return (
    <View style={styles.lengthSection}>
      <Text style={styles.sectionEyebrow}>얼굴 길이 비율</Text>
      <Text style={styles.sectionTitle}>{getFaceLengthTitle(judgment.verdict)}</Text>
      {isBorderline ? (
        <Text style={styles.gaugeBorderlineText}>
          촬영 각도의 영향 범위가 경계에 걸쳐 있어 단정하지 않았어요.
        </Text>
      ) : null}
      {judgment.verdict === 'indeterminate' ? (
        <Text style={styles.gaugeBorderlineText}>
          촬영 각도 정보를 확인하지 못해 판정을 보류했어요.
        </Text>
      ) : null}
      {isStaleJudgment ? (
        <Text style={styles.gaugeBorderlineText}>
          이 판정은 이전 기준으로 측정된 결과예요.
        </Text>
      ) : null}
      <View style={styles.gaugeWrap}>
        {/* 마커·band는 트랙 기준 절대배치 — 래퍼에 다른 자식이 늘어도
            핀이 트랙에서 이탈하지 않는다(셀프 리뷰 레이아웃 회귀 수정). */}
        <View style={styles.gaugeTrackWrap}>
          {isBorderline ? (
            <View
              style={[
                styles.gaugeBandRange,
                {
                  left: `${getGaugeMarkerPercent(judgment.band.lo)}%`,
                  width: `${Math.max(
                    getGaugeMarkerPercent(judgment.band.hi) -
                      getGaugeMarkerPercent(judgment.band.lo),
                    1,
                  )}%`,
                },
              ]}
            />
          ) : null}
          {showsMarker ? (
            <View style={[styles.gaugeMarker, {left: `${markerPercent}%`}]}>
              <View style={styles.gaugeMarkerPin} />
            </View>
          ) : null}
          <View style={styles.gaugeTrack}>
            <View style={[styles.gaugeSegment, styles.gaugeSegmentWide]} />
            <View style={[styles.gaugeSegment, styles.gaugeSegmentAverage]} />
            <View style={[styles.gaugeSegment, styles.gaugeSegmentLong]} />
          </View>
        </View>
        <View style={styles.gaugeLabelRow}>
          <Text style={styles.gaugeLabel}>가로형{'\n'}얼굴</Text>
          <Text style={styles.gaugeLabel}>평균</Text>
          <Text style={styles.gaugeLabel}>세로형{'\n'}얼굴</Text>
        </View>
        <Text style={styles.gaugeProvenanceText}>
          기준 구간은 잠정값이에요 — 실측 기반 기준으로 교체될 예정이에요.
        </Text>
      </View>
    </View>
  );
}

function getLineStroke(imageHeight: number) {
  return Math.max(1.5, Math.min(5, imageHeight * 0.003));
}

function getLabelFontSize(imageHeight: number) {
  return Math.max(28, Math.min(110, imageHeight * 0.035));
}

function OverlayText({
  children,
  fontSize,
  x,
  y,
}: {
  children: string;
  fontSize: number;
  x: number;
  y: number;
}) {
  const outlineWidth = Math.max(3, fontSize * 0.14);

  return (
    <G>
      <SvgText
        fill="rgba(0, 0, 0, 0.42)"
        fontFamily={typography.fontFamily.bold}
        fontSize={fontSize}
        stroke="rgba(0, 0, 0, 0.42)"
        strokeLinejoin="round"
        strokeWidth={outlineWidth}
        textAnchor="end"
        x={x}
        y={y}>
        {children}
      </SvgText>
      <SvgText
        fill={colors.white}
        fontFamily={typography.fontFamily.bold}
        fontSize={fontSize}
        textAnchor="end"
        x={x}
        y={y}>
        {children}
      </SvgText>
    </G>
  );
}

function DebugPointLabel({
  fontSize,
  imageWidth,
  keypoint,
  label,
}: {
  fontSize: number;
  imageWidth: number;
  keypoint: VerticalThirdsKeypoint;
  label: string;
}) {
  return (
    <SvgText
      fill={colors.white}
      fontFamily={typography.fontFamily.medium}
      fontSize={fontSize}
      opacity={0.78}
      textAnchor="start"
      x={Math.min(imageWidth - fontSize * 10, keypoint.x + fontSize * 0.7)}
      y={keypoint.y - fontSize * 0.7}>
      {label} y={Math.round(keypoint.y)} {keypoint.provider}
    </SvgText>
  );
}

function isVerticalThirdsKeypoint(
  keypoint: VerticalThirdsKeypoint | null,
): keypoint is VerticalThirdsKeypoint {
  return keypoint !== null;
}

function RatioBand({
  color,
  imageHeight,
  imageWidth,
  label,
  y1,
  y2,
}: {
  color: string;
  imageHeight: number;
  imageWidth: number;
  label: string;
  y1: number;
  y2: number;
}) {
  const height = Math.max(0, y2 - y1);
  const centerY = y1 + height / 2;
  const fontSize = getLabelFontSize(imageHeight);
  const labelMargin = Math.max(24, imageWidth * 0.05);

  if (height <= 0) {
    return null;
  }

  return (
    <G>
      <Rect fill={color} height={height} width={imageWidth} x={0} y={y1} />
      <OverlayText
        fontSize={fontSize}
        x={imageWidth - labelMargin}
        y={centerY + fontSize / 3}>
        {label}
      </OverlayText>
    </G>
  );
}

function VerticalThirdsOverlay({
  debug = false,
  result,
}: {
  debug?: boolean;
  result: FaceVerticalThirdsResult;
}) {
  const {G: glabella, H: measuredHairline, Me: menton, Sn: subnasale} =
    result.keypoints;
  const hairline =
    result.measurementMode === 'full_vertical_thirds' &&
    result.hairlineAnalysis.analysisEligible
      ? measuredHairline
      : null;
  const imageWidth = result.sourceImage.width;
  const imageHeight = result.sourceImage.height;
  const strokeWidth = getLineStroke(imageHeight);
  const labelFontSize = getLabelFontSize(imageHeight);

  if (!glabella || !subnasale || !menton || imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }

  return (
    <Svg
      height="100%"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      width="100%">
      {hairline ? (
        <RatioBand
          color="rgba(61, 176, 217, 0.28)"
          imageHeight={imageHeight}
          imageWidth={imageWidth}
          label={formatRatio(result.verticalThirds?.displayRatio.upper)}
          y1={hairline.y}
          y2={glabella.y}
        />
      ) : null}
      <RatioBand
        color="rgba(61, 176, 217, 0.34)"
        imageHeight={imageHeight}
        imageWidth={imageWidth}
        label="1.00"
        y1={glabella.y}
        y2={subnasale.y}
      />
      <RatioBand
        color="rgba(61, 176, 217, 0.42)"
        imageHeight={imageHeight}
        imageWidth={imageWidth}
        label={formatRatio(result.verticalThirds?.displayRatio.lower)}
        y1={subnasale.y}
        y2={menton.y}
      />
      {[hairline, glabella, subnasale, menton]
        .filter(isVerticalThirdsKeypoint)
        .map((keypoint, index) => (
          <Line
            key={`${keypoint.method}-${index}`}
            stroke="rgba(255, 255, 255, 0.52)"
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            x1={0}
            x2={imageWidth}
            y1={keypoint.y}
            y2={keypoint.y}
          />
        ))}
      {debug && hairline ? (
        <DebugPointLabel
          fontSize={labelFontSize * 0.5}
          imageWidth={imageWidth}
          keypoint={hairline}
          label="H"
        />
      ) : null}
      {debug ? (
        <>
          <DebugPointLabel
            fontSize={labelFontSize * 0.5}
            imageWidth={imageWidth}
            keypoint={glabella}
            label="G"
          />
          <DebugPointLabel
            fontSize={labelFontSize * 0.5}
            imageWidth={imageWidth}
            keypoint={subnasale}
            label="Sn"
          />
          <DebugPointLabel
            fontSize={labelFontSize * 0.5}
            imageWidth={imageWidth}
            keypoint={menton}
            label="Me"
          />
        </>
      ) : null}
    </Svg>
  );
}


function PhotoStage({
  children,
  imageUri,
  onImageLoad,
  onLayout,
  overlayRef,
  result,
}: {
  children: React.ReactNode;
  imageUri: string;
  onImageLoad?: () => void;
  onLayout?: () => void;
  overlayRef?: React.RefObject<View | null>;
  result: FaceVerticalThirdsResult;
}) {
  return (
    <View style={styles.photoStageWrap}>
      <View
        collapsable={false}
        onLayout={onLayout}
        ref={overlayRef}
        style={[
          styles.photoStage,
          {
            aspectRatio: getVerticalThirdsPhotoAspectRatio(result.sourceImage),
          },
        ]}>
        <Image
          onLoad={onImageLoad}
          resizeMode="cover"
          source={{uri: imageUri}}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    </View>
  );
}

function VerticalRatioSection({
  debug,
  imageUri,
  onImageLoad,
  onLayout,
  overlayRef,
  result,
}: {
  debug?: boolean;
  imageUri: string;
  onImageLoad: () => void;
  onLayout: () => void;
  overlayRef: React.RefObject<View | null>;
  result: FaceVerticalThirdsResult;
}) {
  const ratio = result.verticalThirds?.displayRatio;

  return (
    <View style={styles.analysisSection}>
      <Text style={styles.sectionEyebrow}>얼굴 세로 비율</Text>
      <Text style={styles.sectionTitle}>
        {getVerticalTitle(result.interpretation.dominantPart, result.measurementMode)}
      </Text>
      <PhotoStage
        imageUri={imageUri}
        onImageLoad={onImageLoad}
        onLayout={onLayout}
        overlayRef={overlayRef}
        result={result}>
        <VerticalThirdsOverlay debug={debug} result={result} />
      </PhotoStage>
      {ratio ? (
        <>
          <View style={styles.ratioSummary}>
            {/* Phase 0-3: '평균 비율 1:1:0.8' 기준선 제거(성형광고 관행값 —
                실측 아님). 중안부=1.00 기준의 자기내부 비교만 표기한다. */}
            <Text style={styles.ratioBasisText}>중안부 1.00 기준</Text>
            {result.measurementMode === 'full_vertical_thirds' ? (
              <Text style={styles.myRatioText}>
                나의 비율 {formatRatio(ratio.upper)} : 1.00 :{' '}
                {formatRatio(ratio.lower)}
              </Text>
            ) : (
              <Text style={styles.myRatioText}>
                중·하안부 비율 1.00 : {formatRatio(ratio.lower)}
              </Text>
            )}
          </View>
          <VerticalRatioBarChart
            measurementMode={result.measurementMode}
            ratio={ratio}
          />
        </>
      ) : null}
    </View>
  );
}

// 상/중/하안부 비율을 x축(가로) 막대로 비교 — 부위 간 상대 길이의
// 자기내부 비교 차트(Phase 0-3: 종전 '평균 기준선' 눈금 제거).
const RATIO_CHART_MAX = 1.6;

function RatioBarRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number | null;
}) {
  const fillPercent = value === null ? 0 : clamp((value / RATIO_CHART_MAX) * 100, 0, 100);

  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, {backgroundColor: color, width: `${fillPercent}%`}]} />
      </View>
      <Text style={styles.barValue}>{value === null ? '–' : value.toFixed(2)}</Text>
    </View>
  );
}

function VerticalRatioBarChart({
  measurementMode,
  ratio,
}: {
  measurementMode: FaceVerticalThirdsResult['measurementMode'];
  ratio: NonNullable<FaceVerticalThirdsResult['verticalThirds']>['displayRatio'];
}) {
  return (
    <View style={styles.barChart}>
      {measurementMode === 'full_vertical_thirds' ? (
        <RatioBarRow color={REPORT_ACCENT} label="상안부" value={ratio.upper} />
      ) : null}
      <RatioBarRow color={REPORT_ACCENT_DARK} label="중안부" value={ratio.middle} />
      <RatioBarRow color={REPORT_ACCENT} label="하안부" value={ratio.lower} />
    </View>
  );
}

function TerminalSection({
  onRetake,
  result,
}: {
  onRetake: () => void;
  result: FaceVerticalThirdsResult;
}) {
  return (
    <View style={styles.terminalSection}>
      <Text style={styles.sectionEyebrow}>분석 상태</Text>
      <Text style={styles.sectionTitle}>
        {result.status === 'blocked' ? '재촬영이 필요해요' : '분석 중 오류가 발생했어요'}
      </Text>
      <Text style={styles.terminalText}>
        {result.statusReason ?? '촬영 조건을 확인한 뒤 다시 시도해 주세요.'}
      </Text>
      <Pressable
        accessibilityLabel="다시 촬영"
        accessibilityRole="button"
        onPress={onRetake}
        style={styles.primaryRetakeButton}>
        <Text style={styles.primaryRetakeButtonText}>다시 촬영</Text>
      </Pressable>
    </View>
  );
}

function formatPostCorrectionDebug(result: FaceVerticalThirdsResult): string {
  const post = result.postCorrection;
  const sourceRoll = result.quality.roll;
  const rollText =
    typeof sourceRoll === 'number' ? `원본 roll ${sourceRoll.toFixed(2)}°` : '원본 roll –';

  if (!post) {
    return `roll 보정: 정보 없음 · ${rollText}`;
  }

  if (post.applied) {
    return `roll 보정: 적용 ${post.rollCorrectionDeg?.toFixed(2)}° (${post.method}) · ${rollText}`;
  }

  return `roll 보정: 스킵 (${post.skippedReason ?? 'unknown'}) · ${rollText}`;
}

function formatPoseDebug(result: FaceVerticalThirdsResult): string {
  const {pitch, roll, yaw} = result.quality;
  const fmt = (v: number | undefined) => (typeof v === 'number' ? v.toFixed(1) : '–');

  return `pose: pitch ${fmt(pitch)}° / yaw ${fmt(yaw)}° / roll ${fmt(roll)}°`;
}

function ArtifactFooter({
  debug = false,
  result,
}: {
  debug?: boolean;
  result: FaceVerticalThirdsResult;
}) {
  const showsDetected = result.hairlineAnalysis.analysisEligible;
  const showsLowConfidenceWarning =
    result.hairlineAnalysis.outcome === 'detected_low_confidence';
  const showsOmitted = result.hairlineAnalysis.outcome === 'omitted';

  return (
    <View style={styles.artifactFooter}>
      {debug ? (
        <View style={styles.debugPanel}>
          <Text style={styles.debugText}>{formatPostCorrectionDebug(result)}</Text>
          <Text style={styles.debugText}>{formatPoseDebug(result)}</Text>
        </View>
      ) : null}
      {showsDetected ? (
        <Text style={styles.warningText}>헤어라인이 감지되었어요.</Text>
      ) : null}
      {showsLowConfidenceWarning ? (
        <Text style={styles.warningText}>
          헤어라인 신뢰도가 낮아 상안부 분석에는 반영하지 않았어요.
        </Text>
      ) : null}
      {showsOmitted ? (
        <Text style={styles.warningText}>
          헤어라인이 충분히 확인되지 않아 중안부와 하안부만 반영했어요.
        </Text>
      ) : null}
      {result.artifacts.logJsonlUri ? (
        <Text selectable style={styles.artifactPathText}>
          {result.artifacts.logJsonlUri}
        </Text>
      ) : null}
      {result.artifacts.resultJsonUri ? (
        <Text selectable style={styles.artifactPathText}>
          {result.artifacts.resultJsonUri}
        </Text>
      ) : null}
      {result.artifacts.overlayImageUri ? (
        <Text selectable style={styles.artifactPathText}>
          {result.artifacts.overlayImageUri}
        </Text>
      ) : null}
      {result.artifacts.appleHairMatteUri ? (
        <Text selectable style={styles.artifactPathText}>
          {result.artifacts.appleHairMatteUri}
        </Text>
      ) : null}
      {result.artifacts.appleSkinMatteUri ? (
        <Text selectable style={styles.artifactPathText}>
          {result.artifacts.appleSkinMatteUri}
        </Text>
      ) : null}
      {result.artifacts.hairlineDebugUri ? (
        <Text selectable style={styles.artifactPathText}>
          {result.artifacts.hairlineDebugUri}
        </Text>
      ) : null}
    </View>
  );
}

export function FaceVerticalThirdsScreen({
  capture,
  debug = false,
  onAnalysisResult,
  onRetake,
}: FaceVerticalThirdsScreenProps) {
  const insets = useSafeAreaInsets();
  const overlayRef = useRef<View>(null);
  const overlayCaptureStartedRef = useRef(false);
  const onAnalysisResultRef = useRef(onAnalysisResult);
  const reportedAnalysisResultKeyRef = useRef<string | null>(null);
  const fallbackCaptureId = useMemo(
    () => `face-ratio-${Date.now()}`,
    [capture.imageUri],
  );
  const captureId =
    capture.captureId ?? capture.photoCaptureId ?? capture.mediaId ?? fallbackCaptureId;
  const [result, setResult] = useState<FaceVerticalThirdsResult | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [stageLaidOut, setStageLaidOut] = useState(false);
  const imageUri = getStageSourceUri(result, capture.imageUri);
  const validationReplay = capture.validationReplay;
  const analysisResultKey = `${captureId}:${
    validationReplay?.captureId ?? 'no-validation-replay'
  }:${capture.imageUri}`;

  useEffect(() => {
    onAnalysisResultRef.current = onAnalysisResult;
  }, [onAnalysisResult]);

  useEffect(() => {
    let isMounted = true;

    overlayCaptureStartedRef.current = false;
    setResult(null);
    setStageLaidOut(false);

    void analyzeFaceVerticalThirds({
      captureId,
      createdAt: capture.capturedAt ?? new Date().toISOString(),
      debugArtifacts: debug,
      imageUri: capture.imageUri,
      semanticMattes: capture.semanticMattes,
      sessionId: captureId,
      validationReplay,
    }).then(nextResult => {
      if (isMounted) {
        setResult(nextResult);
        if (reportedAnalysisResultKeyRef.current !== analysisResultKey) {
          reportedAnalysisResultKeyRef.current = analysisResultKey;
          onAnalysisResultRef.current?.(nextResult);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    capture.capturedAt,
    capture.imageUri,
    capture.semanticMattes,
    validationReplay?.captureId,
    validationReplay?.cohortId,
    validationReplay?.condition.distanceLabel,
    validationReplay?.condition.isReference,
    validationReplay?.condition.poseLabel,
    validationReplay?.condition.repeatGroup,
    validationReplay?.condition.repeatIndex,
    validationReplay?.retentionDays,
    validationReplay?.sessionId,
    validationReplay?.subjectId,
    captureId,
    debug,
    analysisResultKey,
  ]);

  useEffect(() => {
    setImageLoaded(false);
  }, [imageUri]);

  useEffect(() => {
    if (
      validationReplay ||
      !isSuccessResult(result) ||
      !imageLoaded ||
      !stageLaidOut ||
      !overlayRef.current ||
      overlayCaptureStartedRef.current
    ) {
      return;
    }

    let isMounted = true;
    const captureTimer = setTimeout(() => {
      overlayCaptureStartedRef.current = true;

      void captureRef(overlayRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      })
        .then(tmpUri => finalizeOverlayArtifact(result, tmpUri))
        .then(nextResult => {
          if (isMounted) {
            setResult(nextResult);
          }
        })
        .catch(error => {
          console.info('[aura:face-ratio]', 'overlay:failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(captureTimer);
    };
  }, [imageLoaded, result, stageLaidOut, validationReplay]);

  if (!result) {
    return (
      <LoadingReport
        onRetake={validationReplay ? undefined : onRetake}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + spacing.xxl,
            paddingTop: insets.top + spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <ReportHeader onRetake={onRetake} result={result} />
        {isSuccessResult(result) ? (
          <>
            <FaceLengthGauge result={result} />
            <View style={styles.sectionDivider} />
            <VerticalRatioSection
              debug={debug}
              imageUri={imageUri}
              onImageLoad={() => setImageLoaded(true)}
              onLayout={() => setStageLaidOut(true)}
              overlayRef={overlayRef}
              result={result}
            />
            <ArtifactFooter debug={debug} result={result} />
          </>
        ) : (
          <TerminalSection onRetake={onRetake} result={result} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  analysisSection: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: 54,
  },
  artifactFooter: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  artifactPathText: {
    color: REPORT_MUTED,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  debugPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: radius.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  debugText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  faceLengthUnavailable: {
    color: REPORT_MUTED,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  barChart: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  barFill: {
    borderRadius: radius.pill,
    height: '100%',
    minWidth: 3,
  },
  barLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    width: 52,
  },
  barRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  barTrack: {
    backgroundColor: REPORT_DIVIDER,
    borderRadius: radius.pill,
    flex: 1,
    height: 14,
  },
  barValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'right',
    width: 44,
  },
  content: {
    backgroundColor: colors.background,
  },
  gaugeBorderlineText: {
    color: REPORT_MUTED,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  gaugeLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  gaugeLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    width: '100%',
  },
  gaugeBandRange: {
    backgroundColor: 'rgba(255, 11, 131, 0.16)',
    borderColor: REPORT_MARKER,
    borderRadius: 4,
    borderWidth: 1,
    bottom: -3,
    position: 'absolute',
    top: -3,
    zIndex: 1,
  },
  gaugeMarker: {
    alignItems: 'center',
    marginLeft: -14,
    position: 'absolute',
    top: -8,
    width: 28,
    zIndex: 2,
  },
  gaugeMarkerPin: {
    backgroundColor: REPORT_MARKER,
    borderRadius: 8,
    height: 28,
    marginTop: -4,
    transform: [{rotate: '45deg'}],
    width: 28,
  },
  gaugeProvenanceText: {
    color: REPORT_MUTED,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  gaugeSegment: {
    flex: 1,
    height: 12,
  },
  gaugeSegmentAverage: {
    backgroundColor: '#52C6E9',
  },
  gaugeSegmentLong: {
    backgroundColor: '#16AFE2',
    borderBottomRightRadius: radius.pill,
    borderTopRightRadius: radius.pill,
  },
  gaugeSegmentWide: {
    backgroundColor: '#9ADDF2',
    borderBottomLeftRadius: radius.pill,
    borderTopLeftRadius: radius.pill,
  },
  gaugeTrack: {
    flexDirection: 'row',
    overflow: 'hidden',
    width: '100%',
  },
  gaugeTrackWrap: {
    position: 'relative',
    width: '100%',
  },
  gaugeWrap: {
    marginTop: spacing.lg,
    width: '78%',
  },
  headerSection: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  lengthSection: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 64,
    paddingBottom: 72,
  },
  loadingContent: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  loadingTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  myRatioText: {
    color: REPORT_ACCENT,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  photoStage: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    overflow: 'hidden',
    width: '100%',
  },
  photoStageWrap: {
    alignSelf: 'center',
    width: '64%',
  },
  primaryRetakeButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  primaryRetakeButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  ratioBasisText: {
    color: REPORT_MUTED,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  ratioSummary: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  reportSubtitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  reportTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 42,
    lineHeight: 52,
    textAlign: 'center',
  },
  reportWarning: {
    color: colors.danger,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    paddingTop: spacing.sm,
    textAlign: 'center',
  },
  retakeButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  retakeButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sectionDivider: {
    backgroundColor: REPORT_DIVIDER,
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  sectionEyebrow: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  terminalSection: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 80,
  },
  terminalText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  warningText: {
    color: REPORT_MUTED,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
});
