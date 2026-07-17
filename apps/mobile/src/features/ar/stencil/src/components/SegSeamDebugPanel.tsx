/**
 * 이음새 세그 게이트 튜닝 패널 (임시 디버그, dev-facing) — 귀·턱-목 이음새에서 파운데가
 * 안 닿는 공백의 원인 판별·값 확정용. CameraFeed의 파운데 seg 게이트 임계 4종
 * (전이대 FND_SEG_LO/HI + 얼굴 오벌 FND_OVAL_SIZE/FEATHER)을 전역 유니폼으로 승격해
 * 실기기에서 눈으로 맞춘다. 07-17 코어 제외(seg.r 램프)는 실측상 목·얼굴을 못 갈라
 * 랜드마크 타원 게이트로 교체됨 — "코어시작/제외" 대신 "타원 크기/페더"를 조절한다.
 * "세그표시" 토글을 켜면 CameraFeed가 세그 채널을 오버레이한다:
 *   빨강 = face-skin(seg.r) · 파랑 = body-skin(seg.b, 목·귀) · 초록 = 파운데 게이트 통과 영역.
 *   빨강/파랑인데 초록이 안 뜨는 곳 = 파운데 미도달 = 공백 원인.
 * 슬라이더 값 → App이 매 applyFilter에 전역 유니폼으로 주입한다. 확정값을 셰이더 리터럴로
 * 굽고 나면 이 컴포넌트(및 셰이더 유니폼·브리지 필드·App 주입 코드)를 통째로 걷어낸다.
 *
 * 순수 표시 컴포넌트 — 상태·브리지 전송은 App(부모)이 담당한다.
 */
import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Slider from '@react-native-community/slider';

interface Props {
  /** 세그 채널 시각화 오버레이 on/off */
  segViz: boolean;
  onSegVizChange: (v: boolean) => void;
  /** 이음새 전이대 하한(낮은 확신 목/귀 포함) 0..1 */
  segLo: number;
  onSegLoChange: (v: number) => void;
  /** 이음새 전이대 상한(넘으면 완전 커버) 0..1 */
  segHi: number;
  onSegHiChange: (v: number) => void;
  /** 얼굴 오벌 반경 배수(메시 오벌 대비, 0.9~1.4) — 클수록 코어 제외 범위 넓음 */
  ovalSize: number;
  onOvalSizeChange: (v: number) => void;
  /** 얼굴 오벌 경계 페더(0~0.3) — 클수록 제외 경계가 부드럽게 번짐 */
  ovalFeather: number;
  onOvalFeatherChange: (v: number) => void;
  onClose: () => void;
}

/** 라벨 + 슬라이더 + 현재값(소수 3자리) 한 줄. 확정값을 코드에 굽기 위해 값을 읽는다. */
function DbgSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
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
  );
}

export default function SegSeamDebugPanel({
  segViz,
  onSegVizChange,
  segLo,
  onSegLoChange,
  segHi,
  onSegHiChange,
  ovalSize,
  onOvalSizeChange,
  ovalFeather,
  onOvalFeatherChange,
  onClose,
}: Props) {
  return (
    <View style={styles.panel} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>개발용 — 이음새 세그 게이트 (임시)</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>세그표시</Text>
          <TouchableOpacity
            style={[styles.toggle, segViz && styles.toggleOn]}
            onPress={() => onSegVizChange(!segViz)}>
            <Text style={styles.toggleText}>{segViz ? 'ON' : 'off'}</Text>
          </TouchableOpacity>
          <Text style={styles.legend}>빨강=얼굴 초록=게이트 파랑=목</Text>
        </View>
        <DbgSlider
          label="전이하한"
          value={segLo}
          min={0}
          max={1}
          onChange={onSegLoChange}
        />
        <DbgSlider
          label="전이상한"
          value={segHi}
          min={0}
          max={1}
          onChange={onSegHiChange}
        />
        <DbgSlider
          label="타원 크기"
          value={ovalSize}
          min={0.9}
          max={1.4}
          onChange={onOvalSizeChange}
        />
        <DbgSlider
          label="타원 페더"
          value={ovalFeather}
          min={0}
          max={0.3}
          onChange={onOvalFeatherChange}
        />
        <Text style={styles.hint}>
          초록=목·귀만 뜨고 얼굴 오벌(코어)은 비어야 이중 도포 없음. 얼굴에 초록이 새면
          타원 크기↑, 목에 초록이 안 뜨면 전이하한↓ · 값을 읽어 셰이더에 굽습니다.
        </Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
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
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  toggleOn: {
    backgroundColor: 'rgba(255,176,103,0.35)',
    borderColor: '#FFB067',
  },
  toggleText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  legend: {
    flex: 1,
    marginLeft: 8,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
  },
  hint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
  },
});
