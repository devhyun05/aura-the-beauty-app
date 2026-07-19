import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {AccessibilityValue} from 'react-native';
import Slider from '@react-native-community/slider';

import {ACCENT} from '../theme';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  accent?: string;
  /** 정규화 0..1이 아닌 도메인 실제값을 표시할 때 사용한다. */
  displayValue?: number;
  /** 정규화된 slider step. */
  step?: number;
  accessibilityLabel?: string;
  accessibilityValue?: AccessibilityValue;
}

export default function ParamSlider({
  label,
  value,
  onChange,
  accent = ACCENT,
  displayValue,
  step,
  accessibilityLabel,
  accessibilityValue,
}: Props) {
  return (
    <View style={styles.row}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        value={value}
        step={step}
        onValueChange={onChange}
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={accessibilityValue}
        minimumTrackTintColor={accent}
        maximumTrackTintColor="rgba(255,255,255,0.25)"
        thumbTintColor="#FFFFFF"
      />
      <Text style={styles.value}>
        {displayValue === undefined ? Math.round(value * 100) : displayValue.toFixed(2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    width: 30,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
