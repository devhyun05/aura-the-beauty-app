import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { FilterPreset } from '../presets';
import type { UserStyle } from '../storage/styleStore';

interface Props {
  presets: FilterPreset[];
  /** 사용자가 저장한 룩 — 내장 프리셋 앞쪽에 칩으로 합류 (설계 R10) */
  userStyles: UserStyle[];
  selectedId: string;
  onSelect: (preset: FilterPreset) => void;
  onSelectUserStyle: (style: UserStyle) => void;
  /** 롱프레스 메뉴 — 컴포저로 편집·삭제 (목업 화면 05) */
  onStyleMenu: (style: UserStyle) => void;
  /** 현재 룩을 내 룩로 저장 (저장 시트 열기) */
  onSaveCurrent: () => void;
  /** ＋만들기 — 컴포저(레이어×축) 진입. 로즈 아웃라인(제품 조작 색 규약) */
  onOpenComposer: () => void;
}

export default function PresetCarousel({
  presets,
  userStyles,
  selectedId,
  onSelect,
  onSelectUserStyle,
  onStyleMenu,
  onSaveCurrent,
  onOpenComposer,
}: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {/* 컴포저 진입 — 현재 룩을 레이어로 분해해 편집 시작 */}
      <TouchableOpacity
        onPress={onOpenComposer}
        style={[styles.chip, styles.composeChip]}>
        <Text style={styles.composeChipText}>＋ 만들기</Text>
      </TouchableOpacity>

      {/* 현재 룩 저장 */}
      <TouchableOpacity
        onPress={onSaveCurrent}
        style={[styles.chip, styles.saveChip]}>
        <Text style={styles.saveChipText}>＋ 저장</Text>
      </TouchableOpacity>

      {/* 내 룩 칩 — 탭=적용, 롱프레스=편집/삭제 메뉴 */}
      {userStyles.map(style => {
        const selected = style.id === selectedId;
        return (
          <TouchableOpacity
            key={style.id}
            onPress={() => onSelectUserStyle(style)}
            onLongPress={() => onStyleMenu(style)}
            style={[styles.chip, styles.mineChip, selected && styles.chipSelected]}>
            <Text
              style={[styles.chipText, selected && styles.chipTextSelected]}
              numberOfLines={1}>
              {style.name}
            </Text>
          </TouchableOpacity>
        );
      })}

      {userStyles.length > 0 && <View style={styles.divider} />}

      {/* 내장 프리셋 */}
      {presets.map(preset => {
        const selected = preset.id === selectedId;
        return (
          <TouchableOpacity
            key={preset.id}
            onPress={() => onSelect(preset)}
            style={[styles.chip, selected && styles.chipSelected]}>
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {preset.name}
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
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    maxWidth: 140,
  },
  chipSelected: {
    backgroundColor: '#FF7E9D',
  },
  chipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  // 내 룩: 골드 테두리로 내장 프리셋과 구분
  mineChip: {
    borderWidth: 1,
    borderColor: 'rgba(201,161,94,0.9)',
  },
  saveChip: {
    backgroundColor: 'rgba(201,161,94,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(201,161,94,0.9)',
  },
  // 만들기: 로즈 아웃라인 — 제품·색 조작 색 규약 (골드=저장/워프와 구분)
  composeChip: {
    backgroundColor: 'rgba(255,126,157,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,126,157,0.9)',
  },
  composeChipText: {
    color: '#FF9EB5',
    fontSize: 13,
    fontWeight: '700',
  },
  saveChipText: {
    color: '#E6C687',
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});
