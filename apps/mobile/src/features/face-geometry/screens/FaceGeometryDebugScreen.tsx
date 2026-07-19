import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Image, ScrollView, StyleSheet, Text, View} from 'react-native';

import {analyzeFaceGeometry2d} from '../services/faceGeometryService';
import type {FaceGeometryResult} from '../types';
import {FaceGeometryDebugOverlay} from '../components/FaceGeometryDebugOverlay';

export function FaceGeometryDebugScreen({
  captureId,
  imageUri,
  sessionId,
}: {
  captureId: string;
  imageUri: string;
  sessionId: string;
}) {
  const [result, setResult] = useState<FaceGeometryResult | null>(null);

  useEffect(() => {
    let alive = true;
    analyzeFaceGeometry2d({
      captureId,
      createdAt: new Date().toISOString(),
      imageUri,
      sessionId,
    }).then(next => {
      if (alive) {
        setResult(next);
      }
    });
    return () => {
      alive = false;
    };
  }, [captureId, imageUri, sessionId]);

  if (!result) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
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
        status={result.status} · roll={result.rollCorrection.applied ? `보정 ${result.rollCorrection.rollCorrectionDeg}°` : `미적용(${result.rollCorrection.skippedReason ?? '-'})`}
      </Text>
      <View style={[styles.stage, {aspectRatio: aspect}]}>
        <Image resizeMode="cover" source={{uri: imageUri}} style={StyleSheet.absoluteFill} />
        <FaceGeometryDebugOverlay result={result} />
      </View>
      <View style={styles.metrics}>
        {Object.entries(result.metrics).map(([key, metric]) => (
          <Text key={key} style={styles.metricRow}>
            {key}: {metric.value === null ? `null (${metric.warnings.join(',') || '-'})` : `${metric.value}${metric.unit === 'deg' ? '°' : ''}`}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {alignItems: 'center', backgroundColor: '#0f172a', flex: 1, justifyContent: 'center'},
  content: {padding: 16},
  metricRow: {color: '#cbd5e1', fontFamily: 'Menlo', fontSize: 12, paddingVertical: 2},
  metrics: {marginTop: 16},
  screen: {backgroundColor: '#0f172a', flex: 1},
  stage: {borderRadius: 12, overflow: 'hidden', width: '100%'},
  status: {color: '#e2e8f0', fontSize: 13, marginBottom: 10},
});
