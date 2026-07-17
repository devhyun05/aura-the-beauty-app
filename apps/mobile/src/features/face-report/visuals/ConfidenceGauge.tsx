import React from 'react';
import {Text, View} from 'react-native';
import {color, font, pct, radius} from '../reportTokens';
import type {S4Data} from '../reportTypes';
import {formatSeasonConfidence} from '../reportFormat';

/** S4 봄 라이트 확신도 — typeScore를 % 라벨 + 채움 바로. 원측정 아님(상대 진단). */
export function ConfidenceGauge({data}: {data: NonNullable<S4Data['seasonConfidence']>}) {
  const view = formatSeasonConfidence(data);
  const fillPct = Math.round(Math.max(0, Math.min(1, data.typeScore)) * 100);
  return (
    <View style={{gap: 6}}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline'}}>
        <Text style={[font(13, '800'), {color: color.accentInk}]}>{view.percentLabel}</Text>
        {view.gapLabel ? <Text style={[font(11, '600'), {color: color.muted}]}>{view.gapLabel}</Text> : null}
      </View>
      <View style={{height: 8, borderRadius: radius.pill, backgroundColor: color.rail, overflow: 'hidden'}}>
        <View style={{width: pct(fillPct), height: '100%', backgroundColor: color.accentLight}} />
      </View>
    </View>
  );
}
