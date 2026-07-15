import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Slider from '@react-native-community/slider';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  accent?: string;
}

export default function ParamSlider({
  label,
  value,
  onChange,
  accent = '#FF7E9D',
}: Props) {
  return (
    <View style={styles.row}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={accent}
        maximumTrackTintColor="rgba(255,255,255,0.25)"
        thumbTintColor="#FFFFFF"
      />
      <Text style={styles.value}>{Math.round(value * 100)}</Text>
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
