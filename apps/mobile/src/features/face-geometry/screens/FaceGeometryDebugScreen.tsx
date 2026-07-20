import React, {useState} from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {useNavigationFlowState} from '../../../app/navigation/flowState';
import {FaceGeometryDebugOverlay} from '../components/FaceGeometryDebugOverlay';

type FamilyKey = 'all' | 'tilt' | 'brow' | 'openness';

// 색은 오버레이(FaceGeometryDebugOverlay)의 계열 색과 일치. 칩이 곧 범례+토글.
const FAMILIES: {
  color: string;
  key: FamilyKey;
  label: string;
  match: (label: string) => boolean;
}[] = [
  {color: '#e2e8f0', key: 'all', label: '전체', match: () => true},
  {color: '#3b82f6', key: 'tilt', label: '눈꼬리각(tilt)', match: l => l.startsWith('canthalTilt')},
  {color: '#22d3ee', key: 'brow', label: '눈썹', match: l => l.startsWith('browEdge')},
  {color: '#34d399', key: 'openness', label: '개방도', match: l => l.startsWith('eyeOpenness')},
];

const STAGE_WIDTH = Dimensions.get('window').width;

export function FaceGeometryDebugScreen() {
  const {selectedFaceCapture, selectedFaceGeometry2d} = useNavigationFlowState();
  const [family, setFamily] = useState<FamilyKey>('all');
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
  const stageHeight = STAGE_WIDTH / aspect;
  const active = FAMILIES.find(f => f.key === family) ?? FAMILIES[0];

  return (
    <View style={styles.screen}>
      <Text style={styles.status}>
        status={result.status}
        {result.statusReason ? ` (${result.statusReason})` : ''} · roll=
        {result.rollCorrection.applied
          ? `보정 ${result.rollCorrection.rollCorrectionDeg}°`
          : `미적용(${result.rollCorrection.skippedReason ?? '-'})`}
        {' · 두 손가락으로 확대'}
      </Text>

      <ScrollView
        contentContainerStyle={styles.chips}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {FAMILIES.map(f => (
          <Pressable
            key={f.key}
            onPress={() => setFamily(f.key)}
            style={[
              styles.chip,
              {borderColor: f.color},
              family === f.key && {backgroundColor: f.color},
            ]}>
            <Text
              style={[
                styles.chipLabel,
                {color: family === f.key ? '#0f172a' : f.color},
              ]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        bouncesZoom
        centerContent
        contentContainerStyle={styles.zoomContent}
        maximumZoomScale={6}
        minimumZoomScale={1}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.zoomArea}>
        <View style={{height: stageHeight, width: STAGE_WIDTH}}>
          <Image
            resizeMode="cover"
            source={{uri: imageUri}}
            style={StyleSheet.absoluteFill}
          />
          <FaceGeometryDebugOverlay
            familyFilter={family === 'all' ? undefined : active.match}
            result={result}
          />
        </View>
      </ScrollView>

      <ScrollView contentContainerStyle={styles.metricsContent} style={styles.metrics}>
        {Object.entries(result.metrics).map(([key, metric]) => (
          <Text key={key} style={styles.metricRow}>
            {key}:{' '}
            {metric.value === null
              ? `null (${metric.warnings.join(',') || '-'})`
              : `${metric.value}${metric.unit === 'deg' ? '°' : ''}`}
          </Text>
        ))}
      </ScrollView>
    </View>
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
  chip: {
    borderRadius: 14,
    borderWidth: 1.5,
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipLabel: {fontSize: 13, fontWeight: '700'},
  chips: {paddingHorizontal: 12, paddingVertical: 8},
  metricRow: {color: '#cbd5e1', fontFamily: 'Menlo', fontSize: 11.5, paddingVertical: 1.5},
  metrics: {maxHeight: '26%'},
  metricsContent: {padding: 12},
  screen: {backgroundColor: '#0f172a', flex: 1},
  status: {color: '#e2e8f0', fontSize: 12.5, paddingHorizontal: 12, paddingTop: 10},
  zoomArea: {flex: 1},
  zoomContent: {alignItems: 'center', justifyContent: 'center'},
});
