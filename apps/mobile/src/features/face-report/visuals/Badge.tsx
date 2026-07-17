import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { EvidenceKind } from '../reportTypes';

/** 측정 근거 / 아티스트 제안 evidence badge. */
export function EvidenceBadge({ kind, label }: { kind: EvidenceKind; label: string }) {
  const measured = kind === 'measured';
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill,
      paddingVertical: 3, paddingHorizontal: 8,
      backgroundColor: measured ? color.accentBg : 'transparent',
      borderWidth: measured ? 0 : 1, borderStyle: measured ? undefined : 'dashed',
      borderColor: measured ? undefined : color.accentPale,
    }}>
      <View style={{
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: measured ? color.accent : 'transparent',
        borderWidth: measured ? 0 : 1.5, borderColor: measured ? undefined : color.text,
      }} />
      <Text style={[font(9.5, '800'), { color: measured ? color.accentDeep : color.text }]}>{label}</Text>
    </View>
  );
}

/** "이 판정은 이전 기준으로 측정된 결과예요" badge. */
export function LegacyBadge({ label }: { label: string }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill,
      paddingVertical: 5, paddingHorizontal: 11, backgroundColor: color.legacyBg,
    }}>
      <View style={{ width: 7, height: 7, borderRadius: 3.5, borderWidth: 1.5, borderColor: color.legacyText }} />
      <Text style={[font(11, '600'), { color: color.legacyText }]}>{label}</Text>
    </View>
  );
}

/** Small gray judgment-state chip (경계 유보 / 판정 보류). */
export function StatusChip({ label }: { label: string }) {
  return (
    <View style={{ borderRadius: radius.pill, backgroundColor: color.surface2, paddingVertical: 2, paddingHorizontal: 8 }}>
      <Text style={[font(10, '700'), { color: color.text }]}>{label}</Text>
    </View>
  );
}
