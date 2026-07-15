/**
 * 홈 하단 레인 한 줄 — 목업 v2 화면 01 "두 레인".
 * LOOK(메이크업 룩, 로즈)과 FIT(보정 필터, 골드)이 같은 컴포넌트를 색만 바꿔 쓴다.
 * [＋만들기] [칩…] [◈ 내 것들] 구조. 활성 칩이 dirty면 라벨에 * (사본 위 수정 표시).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

export const ROSE = '#FF7E9D';
export const GOLD_ACCENT = '#C9A15E';

export interface LaneChip {
  id: string;
  label: string;
  /** ◈ 사용자 저장물 — 골드 테두리 + ◈ 프리픽스 */
  mine?: boolean;
  /** 활성 칩 사본 수정 표시(*) */
  dirty?: boolean;
}

interface Props {
  /** 레인 라벨 — "LOOK" / "FIT" */
  label: string;
  accent: 'rose' | 'gold';
  chips: LaneChip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** ◈ 칩 롱프레스(편집/삭제 메뉴) */
  onLongPress?: (id: string) => void;
  /** ＋만들기 — LOOK=컴포저, FIT=보정 시트. 생략 시 만들기 버튼 없음(기본 모드 읽기전용). */
  onCreate?: () => void;
}

export default function LaneRow({
  label,
  accent,
  chips,
  selectedId,
  onSelect,
  onLongPress,
  onCreate,
}: Props) {
  const rose = accent === 'rose';
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      <Text style={[styles.laneLabel, rose ? styles.laneLabelRose : styles.laneLabelGold]}>
        {label}
      </Text>

      {onCreate && (
        <TouchableOpacity
          onPress={onCreate}
          style={[styles.chip, rose ? styles.makeChipRose : styles.makeChipGold]}>
          <Text style={rose ? styles.makeTextRose : styles.makeTextGold}>＋만들기</Text>
        </TouchableOpacity>
      )}

      {chips.map(chip => {
        const selected = chip.id === selectedId;
        return (
          <TouchableOpacity
            key={chip.id}
            onPress={() => onSelect(chip.id)}
            onLongPress={
              chip.mine && onLongPress ? () => onLongPress(chip.id) : undefined
            }
            style={[
              styles.chip,
              chip.mine && styles.mineChip,
              selected && (rose ? styles.chipOnRose : styles.chipOnGold),
            ]}>
            <Text
              style={[
                styles.chipText,
                chip.mine && styles.mineText,
                selected && (rose ? styles.chipTextOnRose : styles.chipTextOnGold),
              ]}
              numberOfLines={1}>
              {chip.mine ? '◈ ' : ''}
              {chip.label}
              {chip.dirty ? '*' : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    gap: 6,
    alignItems: 'center',
  },
  laneLabel: {
    width: 34,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    fontVariant: ['tabular-nums'],
  },
  laneLabelRose: {
    color: ROSE,
  },
  laneLabelGold: {
    color: GOLD_ACCENT,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    maxWidth: 150,
  },
  chipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  chipOnRose: {
    backgroundColor: ROSE,
  },
  chipOnGold: {
    backgroundColor: GOLD_ACCENT,
  },
  chipTextOnRose: {
    color: '#FFFFFF',
  },
  chipTextOnGold: {
    color: '#1A1206',
  },
  // ◈ 내 저장물 — 골드 테두리
  mineChip: {
    borderWidth: 1,
    borderColor: 'rgba(201,161,94,0.9)',
    backgroundColor: 'rgba(201,161,94,0.14)',
  },
  mineText: {
    color: '#E4CF9E',
  },
  // ＋만들기 — 레인 색 아웃라인
  makeChipRose: {
    backgroundColor: 'rgba(255,126,157,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,126,157,0.9)',
  },
  makeChipGold: {
    backgroundColor: 'rgba(201,161,94,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(201,161,94,0.9)',
  },
  makeTextRose: {
    color: '#FF9EB5',
    fontSize: 12,
    fontWeight: '700',
  },
  makeTextGold: {
    color: '#E6C687',
    fontSize: 12,
    fontWeight: '700',
  },
});
