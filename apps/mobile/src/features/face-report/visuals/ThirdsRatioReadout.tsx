import React from 'react';
import {Text, View} from 'react-native';
import {color, font, pct, radius} from '../reportTokens';
import type {S2Data} from '../reportTypes';
import {describeThirdsInternally, formatThirdsRatio} from '../reportFormat';

interface Props {
  ratio: NonNullable<S2Data['ratioNumbers']> | undefined;
  faceShape: S2Data['faceShape'];
}

/** S2 비율 판독 — (1) 세로 3분할: 숫자 + 자기 내부 서술 + 1:1:1은 캔온일 뿐 교육 맥락,
 *  (2) 얼굴형: 성별 참고선 기준 방향 카테고리(가로 ←→ 세로) + 맞춤 문장 + 참고선 고지.
 *  정직화: '이상 1:1:1'·'평균 밴드' 폐기. 측정은 진짜, 프레임만 정직하게. 저신뢰도
 *  게이팅은 buildS2가 ratio/faceShape를 비우는 것으로 이미 처리한다. */
export function ThirdsRatioReadout({ratio, faceShape}: Props) {
  const r = ratio ? formatThirdsRatio(ratio) : null;
  const selfDesc = ratio ? describeThirdsInternally(ratio) : null;

  if (!r && !faceShape) {
    return null;
  }

  return (
    <View style={{gap: 16, marginTop: 12}}>
      {r && (
        <View style={{gap: 6}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
            {(
              [
                {k: '상안부', v: r.upperLabel},
                {k: '중안부', v: r.middleLabel},
                {k: '하안부', v: r.lowerLabel},
              ] as const
            ).map(cell => (
              <View key={cell.k} style={{alignItems: 'center', flex: 1}}>
                <Text style={[font(11, '600'), {color: color.muted}]}>{cell.k}</Text>
                <Text style={[font(17, '800'), {color: color.ink}]}>{cell.v}</Text>
              </View>
            ))}
          </View>
          {selfDesc && (
            <Text style={[font(12.5, '600', 1.5), {color: color.body, textAlign: 'center'}]}>{selfDesc}</Text>
          )}
          <Text style={[font(10.5, '400', 1.4), {color: color.faint, textAlign: 'center'}]}>{r.contextLabel}</Text>
        </View>
      )}
      {faceShape && (
        <View style={{gap: 8}}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <View
              style={{
                backgroundColor: color.accentBg,
                borderRadius: radius.pill,
                paddingVertical: 4,
                paddingHorizontal: 11,
              }}>
              <Text style={[font(11.5, '800'), {color: color.accentDeep}]}>{faceShape.categoryLabel}</Text>
            </View>
          </View>
          {/* 방향 스케일: 가로형 ←→ 세로형, 표식 = 내 위치 */}
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <Text style={[font(10.5, '700'), {color: color.faint, width: 40, textAlign: 'right'}]}>가로형</Text>
            <View
              style={{
                flex: 1,
                height: 8,
                borderRadius: radius.pill,
                backgroundColor: color.rail,
                justifyContent: 'center',
              }}>
              <View
                style={{
                  position: 'absolute',
                  left: pct(faceShape.position * 100),
                  marginLeft: -6,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: color.accent,
                  borderWidth: 2,
                  borderColor: color.white,
                }}
              />
            </View>
            <Text style={[font(10.5, '700'), {color: color.faint, width: 40}]}>세로형</Text>
          </View>
          <Text style={[font(12.5, '400', 1.6), {color: color.body}]}>{faceShape.sentence}</Text>
          <Text style={[font(10, '400', 1.4), {color: color.faint}]}>{faceShape.referenceNote}</Text>
        </View>
      )}
    </View>
  );
}
