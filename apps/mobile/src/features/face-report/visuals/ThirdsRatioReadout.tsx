import React from 'react';
import {Text, View} from 'react-native';
import {color, font, pct, radius} from '../reportTokens';
import type {S2Data} from '../reportTypes';
import {describeThirdsInternally, formatThirdsRatio, resolveFaceLengthBand} from '../reportFormat';

interface Props {
  ratio: NonNullable<S2Data['ratioNumbers']> | undefined;
  faceLength: S2Data['faceLength'];
}

/** S2 비율 판독 — 세로 3분할 정규화 비율(이상 1:1:1 병기) + 얼굴 길이비 평균 밴드 게이지. */
export function ThirdsRatioReadout({ratio, faceLength}: Props) {
  // 신뢰도가 낮으면 정밀 비율 숫자는 숨긴다(측정 신뢰도 게이팅 — 부재=숨김).
  // 길이비 밴드는 resolveFaceLengthBand가 같은 임계로 이미 '판정 보류' 처리한다.
  const lowConfidence = faceLength?.confidence != null && faceLength.confidence < 0.5;
  const r = ratio && !lowConfidence ? formatThirdsRatio(ratio) : null;
  const selfDesc = ratio && !lowConfidence ? describeThirdsInternally(ratio) : null;
  const band = faceLength ? resolveFaceLengthBand(faceLength) : null;

  if (!r && !band) {
    return null;
  }

  return (
    <View style={{gap: 12, marginTop: 12}}>
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
      {band && band.kind === 'band' && (
        <View style={{gap: 6}}>
          {/* '나' 표식 — 아래 마젠타 눈금이 '내 위치'임을 명시 */}
          <View style={{height: 12}}>
            <View style={{position: 'absolute', left: pct(band.position * 100), marginLeft: -9, width: 18, alignItems: 'center'}}>
              <Text style={[font(9.5, '800'), {color: color.magenta}]}>나</Text>
            </View>
          </View>
          <View
            style={{
              height: 10,
              borderRadius: radius.pill,
              backgroundColor: color.rail,
              overflow: 'hidden',
            }}>
            <View
              style={{
                position: 'absolute',
                left: pct(band.loFrac * 100),
                width: pct((band.hiFrac - band.loFrac) * 100),
                top: 0,
                bottom: 0,
                backgroundColor: color.bandActiveSoft,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: pct(band.position * 100),
                top: -2,
                width: 4,
                height: 14,
                borderRadius: 2,
                backgroundColor: color.magenta,
                marginLeft: -2,
              }}
            />
          </View>
          <Text style={[font(11.5, '700'), {color: band.inBand ? color.accentInk : color.body}]}>
            얼굴 길이비 · {band.verdictLabel}
            {band.inBand ? '' : ' (평균 범위 밖)'}
          </Text>
          {/* 범례 — 마젠타 표식과 청록 띠의 의미를 한 줄로 */}
          <Text style={[font(10, '400', 1.4), {color: color.faint}]}>
            청록 띠 = 사람들 평균 범위 · 표식 = 내 얼굴 길이비 위치
          </Text>
        </View>
      )}
      {band && band.kind === 'withheld' && (
        <Text style={[font(11.5, '600'), {color: color.muted}]}>얼굴 길이비 · {band.label}</Text>
      )}
    </View>
  );
}
