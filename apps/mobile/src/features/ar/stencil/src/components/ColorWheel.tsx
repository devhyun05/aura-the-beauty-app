/**
 * 컬러휠 — 임의 색 선택 모달.
 *  - 배경 색상환 이미지(HSV 휠) 위 탭·드래그 → 위치에서 H(각도)·S(반경) 역산.
 *  - 명도 V 는 별도 슬라이더(ParamSlider 재사용).
 *  - 현재 선택 위치에 크로스헤어 링(절대배치 View — SVG 미사용).
 *  - 하단 미리보기 스와치 + 취소/확인.
 * 좌표 규약·HSV↔hex 변환은 src/composer/color.ts 순수 유틸에 위임.
 */
import React, {useEffect, useMemo, useState} from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ParamSlider from './ParamSlider';
import {hexToHsv, hsToPos, hsvToHex, posToHS} from '../composer/color';
import {ACCENT} from '../theme';

const WHEEL = require('../assets/color-wheel.png');
const WHEEL_SIZE = 240;
const RADIUS = WHEEL_SIZE / 2;
const CROSS = 18;

interface Props {
  visible: boolean;
  initial: string; // hex
  onCancel: () => void;
  onDone: (hex: string) => void;
}

export default function ColorWheel({visible, initial, onCancel, onDone}: Props) {
  const [h, setH] = useState(0);
  const [s, setS] = useState(0);
  const [v, setV] = useState(1);

  // 모달이 열릴 때(또는 초기색 변경 시) 현재 hex 를 HSV 로 역변환해 초기화.
  useEffect(() => {
    if (!visible) return;
    const hsv = hexToHsv(initial);
    setH(hsv.h);
    setS(hsv.s);
    // 무채색(흰/검)이라 명도만 있는 경우도 슬라이더가 그 값을 잡도록.
    setV(hsv.v);
  }, [visible, initial]);

  // PanResponder 는 setH/setS(안정)·상수만 참조 → 한 번만 생성.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: e => applyTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
        onPanResponderMove: e => applyTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
      }),
    [],
  );

  function applyTouch(lx: number, ly: number) {
    const {h: nh, s: ns} = posToHS(lx - RADIUS, ly - RADIUS, RADIUS);
    setH(nh);
    setS(ns);
  }

  const hex = hsvToHex(h, s, v);
  const pos = hsToPos(h, s, RADIUS);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>색 직접 고르기</Text>

          <View style={styles.wheelWrap}>
            <View style={styles.wheel} {...pan.panHandlers}>
              <Image source={WHEEL} style={styles.wheelImg} />
              {/* 크로스헤어 링 — 선택 위치. pointerEvents none 으로 터치 통과 */}
              <View
                pointerEvents="none"
                style={[
                  styles.cross,
                  {
                    left: RADIUS + pos.x - CROSS / 2,
                    top: RADIUS + pos.y - CROSS / 2,
                  },
                ]}
              />
            </View>
          </View>

          <ParamSlider label="명도" value={v} onChange={setV} />

          <View style={styles.footer}>
            <View style={[styles.preview, {backgroundColor: hex}]} />
            <Text style={styles.hexText}>{hex.toUpperCase()}</Text>
            <View style={styles.spacer} />
            <TouchableOpacity style={styles.btn} onPress={onCancel}>
              <Text style={styles.btnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => onDone(hex)}>
              <Text style={[styles.btnText, styles.btnPrimaryText]}>확인</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: WHEEL_SIZE + 48,
    backgroundColor: '#1c1c1e',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  wheelWrap: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    marginBottom: 12,
  },
  wheel: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
  },
  wheelImg: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
  },
  cross: {
    position: 'absolute',
    width: CROSS,
    height: CROSS,
    borderRadius: CROSS / 2,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 2,
    shadowOffset: {width: 0, height: 0},
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 12,
    gap: 8,
  },
  preview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  hexText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  spacer: {
    flex: 1,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  btnPrimary: {
    backgroundColor: ACCENT,
  },
  btnText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  btnPrimaryText: {
    color: '#1c1c1e',
  },
});
