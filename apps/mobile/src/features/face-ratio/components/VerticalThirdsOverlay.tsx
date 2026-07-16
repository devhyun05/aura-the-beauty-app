import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import Svg, {G, Line, Rect, Text as SvgText} from 'react-native-svg';

import {colors, radius, typography} from '../../../shared/theme';
import type {FaceVerticalThirdsResult, VerticalThirdsKeypoint} from '../types';

export function formatRatio(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(2)
    : '-';
}

export function getAspectRatio(result: FaceVerticalThirdsResult | null) {
  if (result?.sourceImage.width && result.sourceImage.height) {
    return result.sourceImage.width / result.sourceImage.height;
  }

  return 3 / 4;
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

export function VerticalThirdsOverlay({
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

export function PhotoStage({
  children,
  imageUri,
  result,
}: {
  children: React.ReactNode;
  imageUri: string;
  result: FaceVerticalThirdsResult;
}) {
  return (
    <View style={styles.photoStageWrap}>
      <View style={[styles.photoStage, {aspectRatio: getAspectRatio(result)}]}>
        <Image
          resizeMode="cover"
          source={{uri: imageUri}}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoStage: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    width: '100%',
  },
  photoStageWrap: {
    width: '100%',
  },
});
