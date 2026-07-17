import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Slider from '@react-native-community/slider';

import type {LightingParams} from '../bridge/types';
import {ACCENT, PANEL_BG, accentAlpha} from '../theme';

/**
 * 조명 시뮬레이션 패널 (#4) — 같은 메이크업을 프리셋 조명(자연광/형광등/노을/실내)
 * 으로 미리보기. 프리셋은 단일 선택, 고르면 즉시 적용(별도 ON/OFF 없음 — "끔"=원본).
 * 세기 슬라이더로 원본↔조명 블렌드. 패널을 닫아도 고른 조명은 유지된다.
 */

interface Props {
  value: LightingParams;
  onChange: (next: LightingParams) => void;
  /** 패널 자체 닫기(✕) — 우측 도구레일 토글과 별개 진입점 */
  onClose: () => void;
}

// preset 값 = Unity LightingParams.preset (0=끔, 5=커스텀). 텍스트 라벨만(아이콘 없음).
const CUSTOM_PRESET = 5;
const PRESETS: {preset: number; label: string}[] = [
  {preset: 0, label: '끔'},
  {preset: 1, label: '자연광'},
  {preset: 2, label: '형광등'},
  {preset: 3, label: '노을'},
  {preset: 4, label: '백열등'},
  {preset: CUSTOM_PRESET, label: '커스텀'},
];

export default function LightingPanel({value, onChange, onClose}: Props) {
  const isCustom = value.preset === CUSTOM_PRESET;
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>조명</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.chipRow}>
        {PRESETS.map(p => {
          const on = value.preset === p.preset;
          return (
            <TouchableOpacity
              key={p.preset}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onChange({...value, preset: p.preset})}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>세기</Text>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          value={value.intensity}
          onValueChange={v => onChange({...value, intensity: v})}
          minimumTrackTintColor={ACCENT}
          maximumTrackTintColor="rgba(255,255,255,0.25)"
          thumbTintColor="#FFFFFF"
          disabled={value.preset === 0}
        />
        <Text style={styles.sliderValue}>
          {Math.round(value.intensity * 100)}
        </Text>
      </View>

      {isCustom && (
        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>색온도</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={value.temperature}
            onValueChange={v => onChange({...value, temperature: v})}
            minimumTrackTintColor="#FFB067"
            maximumTrackTintColor="#7FB2FF"
            thumbTintColor="#FFFFFF"
          />
          <Text style={styles.sliderValue}>
            {value.temperature < 0.45
              ? '따뜻'
              : value.temperature > 0.55
                ? '차갑'
                : '중립'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: PANEL_BG,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  closeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipOn: {
    backgroundColor: accentAlpha(0.35),
    borderColor: ACCENT,
  },
  chipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextOn: {
    color: '#FFFFFF',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sliderLabel: {
    width: 64,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },
  slider: {
    flex: 1,
    height: 32,
  },
  sliderValue: {
    width: 30,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
