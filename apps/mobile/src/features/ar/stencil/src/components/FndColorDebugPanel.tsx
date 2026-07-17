/**
 * 파운데 색 튜닝 패널 (임시 디버그, dev-facing) — 실기기 조명에서 파운데가 "칙칙"해
 * 보이는 원인 상수 3종(Foundation.cginc의 옛 #define FND_REFERENCE_LUMA·FND_LUMA_GAIN·
 * FND_CHROMA)을 눈으로 맞추기 위한 임시 오버레이. 슬라이더 값 → App이 매 applyFilter에
 * 전역 유니폼으로 주입한다. 확정값을 셰이더 리터럴로 굽고 나면 이 컴포넌트(및 셰이더
 * 유니폼·브리지 필드·App 주입 코드)를 통째로 걷어낸다.
 *
 * 순수 표시 컴포넌트 — 상태·브리지 전송은 App(부모)이 담당한다.
 */
import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Slider from '@react-native-community/slider';

interface Props {
  /** 기준 루마 분모(밝기, 낮을수록 밝음) */
  refLuma: number;
  onRefLumaChange: (v: number) => void;
  /** 채도 혼합량(탁함, 낮을수록 선명) */
  chroma: number;
  onChromaChange: (v: number) => void;
  /** luma 게인(밝기 여유) */
  lumaGain: number;
  onLumaGainChange: (v: number) => void;
  onClose: () => void;
}

/**
 * 라벨 + 슬라이더 + 현재값(소수 3자리) 한 줄, 그 아래 효과 설명 한 줄.
 * 확정값을 코드에 굽기 위해 값을 읽는다.
 */
function DbgSlider({
  label,
  desc,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  desc: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Slider
          style={styles.slider}
          minimumValue={min}
          maximumValue={max}
          value={value}
          onValueChange={onChange}
          minimumTrackTintColor="#FFB067"
          maximumTrackTintColor="rgba(255,255,255,0.25)"
          thumbTintColor="#FFFFFF"
        />
        <Text style={styles.value}>{value.toFixed(3)}</Text>
      </View>
      <Text style={styles.desc}>{desc}</Text>
    </View>
  );
}

export default function FndColorDebugPanel({
  refLuma,
  onRefLumaChange,
  chroma,
  onChromaChange,
  lumaGain,
  onLumaGainChange,
  onClose,
}: Props) {
  return (
    <View style={styles.panel} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>개발용 — 파운데 색 튜닝 (임시)</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>
        <DbgSlider
          label="기준루마"
          desc="기준 루마 — 낮출수록 밝게 발림"
          value={refLuma}
          min={0.3}
          max={0.5}
          onChange={onRefLumaChange}
        />
        <DbgSlider
          label="채도혼합"
          desc="채도 혼합 — 원 피부색 눌러 커버(높으면 창백)"
          value={chroma}
          min={0}
          max={0.2}
          onChange={onChromaChange}
        />
        <DbgSlider
          label="luma게인"
          desc="루마 게인 — 명암 이식 배율(1=원본)"
          value={lumaGain}
          min={1}
          max={1.5}
          onChange={onLumaGainChange}
        />
        <Text style={styles.hint}>값을 읽어 셰이더에 굽습니다.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    alignItems: 'center',
    zIndex: 100,
    elevation: 100,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(12,14,18,0.92)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,176,103,0.4)',
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    color: '#FFB067',
    fontSize: 13,
    fontWeight: '700',
  },
  close: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    paddingHorizontal: 4,
  },
  field: {
    marginVertical: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  desc: {
    marginLeft: 64,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
  },
  label: {
    width: 64,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },
  slider: {
    flex: 1,
    height: 32,
  },
  value: {
    width: 48,
    textAlign: 'right',
    color: '#FFB067',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
  },
});
