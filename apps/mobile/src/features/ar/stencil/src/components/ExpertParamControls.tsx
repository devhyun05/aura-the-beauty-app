import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import type {
  ExpertOverrides,
  ExpertParamDef,
  ExpertParamKey,
} from '../composer/expertParams';
import {expertParamSliderStep} from '../composer/expertParams';
import {ACCENT, TEXT_HINT} from '../theme';
import ParamSlider from './ParamSlider';

interface Props {
  params: readonly ExpertParamDef[];
  overrides: Readonly<ExpertOverrides>;
  onChange: (key: ExpertParamKey, value: number) => void;
  onReset: (key: ExpertParamKey) => void;
  error?: string | null;
}

export default function ExpertParamControls({
  params,
  overrides,
  onChange,
  onReset,
  error,
}: Props) {
  if (params.length === 0) return null;

  return (
    <View style={styles.list}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {params.map(param => {
        // params는 검증된 단일 레지스트리에서만 오므로 런타임 key는 ExpertParamKey다.
        const key = param.key as ExpertParamKey;
        const overridden = Object.prototype.hasOwnProperty.call(
          overrides,
          key,
        );
        const current = overridden
          ? overrides[key]!
          : param.default;
        const span = param.max - param.min;
        const normalized = span === 0 ? 0 : (current - param.min) / span;
        const step = expertParamSliderStep(param);
        return (
          <View key={param.key} style={styles.row}>
            <ParamSlider
              label={param.label}
              value={normalized}
              displayValue={current}
              step={step === undefined || span === 0 ? undefined : step / span}
              onChange={value => onChange(
                key,
                param.min + value * span,
              )}
            />
            <Text style={styles.effect}>{param.effect}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.reset}
              onPress={() => onReset(key)}
            >
              <Text style={[styles.resetText, !overridden && styles.resetTextOff]}>
                기본값 복원
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    paddingVertical: 4,
  },
  effect: {
    color: TEXT_HINT,
    fontSize: 11,
    lineHeight: 15,
  },
  reset: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
  },
  resetText: {
    color: ACCENT,
    fontSize: 11,
  },
  resetTextOff: {
    color: 'rgba(255,255,255,0.38)',
  },
  error: {
    color: '#FF9F9F',
    fontSize: 11,
    lineHeight: 15,
  },
});
