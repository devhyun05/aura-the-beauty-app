import React from 'react';
import {Image, ScrollView, StyleSheet, Text, View} from 'react-native';

import {useNavigationFlowState} from '../../../app/navigation/flowState';
import {FaceGeometryDebugOverlay} from '../components/FaceGeometryDebugOverlay';

// __DEV__ 검증 화면 — 정상 플로우가 이미 계산해 flow state에 저장한 결과
// (selectedFaceGeometry2d, debugAnchors 포함)를 그대로 읽어 얼굴 위에 그린다.
// 여기서 analyzeFaceGeometry2d를 재실행하지 않는다: 랜드마크 검출은 Unity 런타임
// 워밍업을 요구하는데 이 독립 화면엔 그 준비 단계가 없어 재분석은 failed로 떨어진다.
export function FaceGeometryDebugScreen() {
  const {selectedFaceCapture, selectedFaceGeometry2d} = useNavigationFlowState();
  const result = selectedFaceGeometry2d;
  const imageUri = selectedFaceCapture?.imageUri;

  if (!result || !imageUri) {
    return (
      <View style={styles.center}>
        <Text style={styles.status}>
          분석 결과 없음 — 먼저 얼굴 촬영·분석을 완료한 뒤 이 화면을 여세요.
        </Text>
      </View>
    );
  }

  const aspect =
    result.sourceImage.width > 0 && result.sourceImage.height > 0
      ? result.sourceImage.width / result.sourceImage.height
      : 3 / 4;

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <Text style={styles.status}>
        status={result.status}
        {result.statusReason ? ` (${result.statusReason})` : ''} · roll=
        {result.rollCorrection.applied
          ? `보정 ${result.rollCorrection.rollCorrectionDeg}°`
          : `미적용(${result.rollCorrection.skippedReason ?? '-'})`}
        {` · anchors=${result.debugAnchors?.length ?? 0}`}
      </Text>
      <View style={[styles.stage, {aspectRatio: aspect}]}>
        <Image
          resizeMode="cover"
          source={{uri: imageUri}}
          style={StyleSheet.absoluteFill}
        />
        <FaceGeometryDebugOverlay result={result} />
      </View>
      <View style={styles.metrics}>
        {Object.entries(result.metrics).map(([key, metric]) => (
          <Text key={key} style={styles.metricRow}>
            {key}:{' '}
            {metric.value === null
              ? `null (${metric.warnings.join(',') || '-'})`
              : `${metric.value}${metric.unit === 'deg' ? '°' : ''}`}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: {padding: 16},
  metricRow: {color: '#cbd5e1', fontFamily: 'Menlo', fontSize: 12, paddingVertical: 2},
  metrics: {marginTop: 16},
  screen: {backgroundColor: '#0f172a', flex: 1},
  stage: {borderRadius: 12, overflow: 'hidden', width: '100%'},
  status: {color: '#e2e8f0', fontSize: 13, marginBottom: 10},
});
