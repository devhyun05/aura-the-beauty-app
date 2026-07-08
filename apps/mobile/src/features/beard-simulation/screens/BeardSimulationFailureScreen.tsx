import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {FAILURE_COPY} from '../constants';

interface BeardSimulationFailureScreenProps {
  reason: string;
  onRetake: () => void;
}

/** Guard/quality-gate rejection UX — the engine refused to make an unsafe
 * result; this screen turns that into actionable retake guidance. */
export function BeardSimulationFailureScreen({
  reason,
  onRetake,
}: BeardSimulationFailureScreenProps) {
  const copy = FAILURE_COPY[reason] ?? FAILURE_COPY.default;
  return (
    <View style={styles.screen}>
      <Text style={styles.emoji}>📷</Text>
      <Text style={styles.title}>{copy.title}</Text>
      {copy.guidance.map(line => (
        <Text key={line} style={styles.guidance}>
          · {line}
        </Text>
      ))}
      <Text style={styles.note}>
        얼굴형이 달라 보일 수 있는 결과는 만들지 않아요. 촬영 환경을 바꿔 다시 시도해
        주세요.
      </Text>
      <Pressable style={styles.retake} onPress={onRetake}>
        <Text style={styles.retakeLabel}>다시 촬영하기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
  },
  emoji: {fontSize: 44},
  title: {fontSize: 19, fontWeight: '700', color: '#1c1c1e', textAlign: 'center'},
  guidance: {fontSize: 14, color: '#555', lineHeight: 21, alignSelf: 'stretch'},
  note: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 10,
  },
  retake: {
    marginTop: 18,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    backgroundColor: '#1c1c1e',
  },
  retakeLabel: {fontSize: 15, fontWeight: '700', color: '#fff'},
});
