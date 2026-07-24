import React from 'react';
import {Text, View} from 'react-native';
import {MoveHorizontal, MoveVertical} from 'lucide-react-native';
import {color, font} from '../reportTokens';
import type {S2Data} from '../reportTypes';
import {describeThirdsInternally, formatThirdsRatio} from '../reportFormat';

interface Props {
  ratio: NonNullable<S2Data['ratioNumbers']> | undefined;
  faceShape: S2Data['faceShape'];
  hairlineMissing: boolean;
}

/** S2 비율 판독 — (1) 세로 3분할: 숫자 + 자기 내부 서술 + 1:1:1은 캔온일 뿐 교육 맥락,
 *  (2) 얼굴형: 성별 참고선 기준 방향 카테고리(가로 ←→ 세로) + 맞춤 문장 + 참고선 고지.
 *  정직화: '이상 1:1:1'·'평균 밴드' 폐기. 측정은 진짜, 프레임만 정직하게. 저신뢰도
 *  게이팅은 buildS2가 ratio/faceShape를 비우는 것으로 이미 처리한다. */
export function ThirdsRatioReadout({ratio, faceShape, hairlineMissing}: Props) {
  const measuredRatio = ratio
    ? {...ratio, upper: hairlineMissing ? null : ratio.upper}
    : null;
  const r = measuredRatio ? formatThirdsRatio(measuredRatio) : null;
  const selfDesc = measuredRatio ? describeThirdsInternally(measuredRatio) : null;
  const ratioLabels = r
    ? [
        ...(measuredRatio?.upper == null ? [] : [`상안부 ${r.upperLabel}`]),
        `중안부 ${r.middleLabel}`,
        `하안부 ${r.lowerLabel}`,
      ]
    : [];

  if (!r && !faceShape) {
    return null;
  }

  return (
    <View style={{borderTopColor: color.divider, borderTopWidth: 1, marginTop: 22}}>
      {r && (
        <View
          style={{
            alignItems: 'center',
            borderBottomColor: color.divider,
            borderBottomWidth: 1,
            flexDirection: 'row',
            gap: 14,
            paddingVertical: 17,
          }}>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: color.accentBg,
              borderRadius: 22,
              height: 44,
              justifyContent: 'center',
              width: 44,
            }}>
            <MoveVertical color={color.accentDeep} size={21} strokeWidth={1.8} />
          </View>
          <View style={{flex: 1, gap: 4}}>
            <Text style={[font(14, '800'), {color: color.ink}]}>세로 비율</Text>
            <Text style={[font(12.5, '400', 1.55), {color: color.body}]}>
              {selfDesc ?? `${r.upperLabel} · ${r.middleLabel} · ${r.lowerLabel}`}
            </Text>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
              {ratioLabels.map(label => (
                <Text key={label} style={[font(10.5, '600'), {color: color.muted}]}>
                  {label}
                </Text>
              ))}
            </View>
            <Text style={[font(9.5, '400', 1.4), {color: color.faint}]}>{r.contextLabel}</Text>
          </View>
        </View>
      )}
      {faceShape && (
        <View
          style={{
            alignItems: 'center',
            borderBottomColor: color.divider,
            borderBottomWidth: 1,
            flexDirection: 'row',
            gap: 14,
            paddingVertical: 17,
          }}>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: color.accentBg,
              borderRadius: 22,
              height: 44,
              justifyContent: 'center',
              width: 44,
            }}>
            <MoveHorizontal color={color.accentDeep} size={21} strokeWidth={1.8} />
          </View>
          <View style={{flex: 1, gap: 4}}>
            <Text style={[font(14, '800'), {color: color.ink}]}>가로 비율</Text>
            <Text style={[font(12.5, '400', 1.55), {color: color.body}]}>
              {faceShape.sentence}
            </Text>
            <Text style={[font(10, '400', 1.4), {color: color.faint}]}>
              {faceShape.referenceNote}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
