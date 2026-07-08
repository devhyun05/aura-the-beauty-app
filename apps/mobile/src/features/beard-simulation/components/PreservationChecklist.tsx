import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {GUARD_CHECK_DISPLAY} from '../constants';
import type {GuardReport} from '../types';

/** 하관 보존 체크 — guard 통과 항목을 사용자가 읽을 수 있는 신뢰 장치로 노출.
 * (identity 체크가 warn 모드로 건너뛴 경우 value가 -1 → 목록에서 제외) */
export function PreservationChecklist({guard}: {guard: GuardReport}) {
  const visible = guard.checks.filter(check => check.passed && check.value >= 0);
  if (!visible.length) {
    return null;
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>원본 보존 확인</Text>
      {visible.map(check => (
        <View key={check.id} style={styles.row}>
          <Text style={styles.tick}>✓</Text>
          <Text style={styles.label}>{GUARD_CHECK_DISPLAY[check.id]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {backgroundColor: '#f2f8f3', borderRadius: 14, padding: 14, gap: 6},
  title: {fontSize: 12, color: '#4a7c59', marginBottom: 2},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  tick: {fontSize: 13, color: '#2e7d46', fontWeight: '700'},
  label: {fontSize: 13, color: '#333'},
});
