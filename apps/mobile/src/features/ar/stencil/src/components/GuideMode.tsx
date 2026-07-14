import React, {useState} from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type {StencilParams, SymmetryParams} from '../bridge/types';
import {isolateStencilStep, maskStencilByKeys} from '../composer/stencilSteps';
import type {StencilStep} from '../composer/stencilSteps';

/**
 * 가이드 레인 본문 (#2 튜토리얼 스텐실) — 메이크업/보정과 동렬인 세 번째 레인.
 * 룩의 바르는 순서(잎=제품×바르는곳)를 **스텝 카드**로 늘어놓고, 카드를 고르면
 * 그 부위 가이드 하나만 얼굴에 격리해 켠다(따라 그리기). 맨 앞 '전체' 카드는
 * 룩에 있는 모든 부위 가이드를 한 번에 켠 조감도.
 *
 * 농도는 공용 헤더 슬라이더가 레인 라우팅(가이드=stencil.opacity)으로 담당 —
 * 메이크업(opacity)/보정(wpGain)과 같은 모델이라 본문엔 슬라이더가 없다.
 * ON/OFF는 기능 활성(오버레이 표시) — 레인을 떠나도 ON이면 가이드가 유지된다.
 */

/** 레인 시그니처 색 — 가이드(스카이). 세그먼트·선택 카드와 공용. */
export const SKY = '#7FD0FF';

// 카드 규격 — 메이크업 모드 룩 카드(BasicMode)와 동일: 5:6 세로형, 한 화면 ~6장.
const CARD_W = Math.floor((Dimensions.get('window').width - 48) / 6);

// 부위 색 — Unity 가이드 라인 색과 동일(어떤 선이 어떤 부위인지 대응).
const ZONE_COLORS: Record<string, string> = {
  lips: '#FF598C',
  brows: '#9E704D',
  eyeshadow: '#A873E6',
  eyeliner: '#3A3550',
  aegyo: '#E6A0B0',
  blush: '#FF8C73',
  highlighter: '#F5EDB3',
  contour: '#7399BF',
};

interface Props {
  value: StencilParams;
  onChange: (next: StencilParams) => void;
  /** 현재 룩에서 유도한 순서 스텝(바르는 순서 = 하단 먼저). */
  steps: StencilStep[];
  /** 룩에 실제 있는 가이드 부위 집합 — '전체' 카드가 이 부위들만 켠다. */
  available: Set<string>;
  // ── 좌우 대칭(#6) — 중심축·대칭쌍 칩만(별도 ON/OFF 없음). 오버레이 켬/끔은
  // 가이드 레인 진입/이탈이 담당(App), 칩 조합은 유저 선호로 유지·복원된다.
  symValue: SymmetryParams;
  onSymChange: (next: SymmetryParams) => void;
}

export default function GuideMode({
  value,
  onChange,
  steps,
  available,
  symValue,
  onSymChange,
}: Props) {
  // 선택 카드 — null=전체(조감도), n=스텝 n 격리. 룩이 바뀌어 스텝이 줄면 클램프.
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const sel = selIdx === null ? null : Math.min(selIdx, steps.length - 1);

  const selectAll = () => {
    setSelIdx(null);
    // 룩에 있는 부위 전부 켬 — maskStencilByKeys가 available 밖 부위를 걸러준다.
    onChange(
      maskStencilByKeys(
        {
          ...value,
          lips: true,
          brows: true,
          eyeshadow: true,
          eyeliner: true,
          aegyo: true,
          blush: true,
          highlighter: true,
          contour: true,
        },
        available,
      ),
    );
  };
  const selectStep = (i: number) => {
    setSelIdx(i);
    onChange(isolateStencilStep(value, steps[i]?.key ?? null));
  };

  return (
    <View style={styles.panel}>
      {/* 헤더 줄 — [호흡][점선][중심축][대칭쌍] 칩. 가이드/대칭 켬·끔은 레인
          진입/이탈이 담당(별도 스위치 없음), 농도는 공용 헤더 슬라이더. */}
      <View style={styles.headRow}>
        <TouchableOpacity
          style={[styles.fxChip, value.pulse && styles.fxChipOn]}
          onPress={() => onChange({...value, pulse: !value.pulse})}>
          <Text style={[styles.fxText, value.pulse && styles.fxTextOn]}>
            호흡
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fxChip, value.dash && styles.fxChipOn]}
          onPress={() => onChange({...value, dash: !value.dash})}>
          <Text style={[styles.fxText, value.dash && styles.fxTextOn]}>
            점선
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fxChip, symValue.midline && styles.fxChipOn]}
          onPress={() => onSymChange({...symValue, midline: !symValue.midline})}>
          <Text style={[styles.fxText, symValue.midline && styles.fxTextOn]}>
            중심축
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fxChip, symValue.pairs && styles.fxChipOn]}
          onPress={() => onSymChange({...symValue, pairs: !symValue.pairs})}>
          <Text style={[styles.fxText, symValue.pairs && styles.fxTextOn]}>
            대칭쌍
          </Text>
        </TouchableOpacity>
      </View>

      {/* 스텝 카드 — [전체] + 잎별 순서 카드. 카드=한 스텝(제품×어디에). */}
      {steps.length === 0 ? (
        <Text style={styles.emptyHint}>메이크업을 선택해주세요.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardRow}>
          {/* 전체 조감 카드 — 룩 카드와 동일 규격(5:6). 몸통=번호, 하단=라벨 바. */}
          <TouchableOpacity
            style={[styles.card, sel === null && styles.cardOn]}
            activeOpacity={0.85}
            onPress={selectAll}
            testID="guide-card-all">
            <View style={styles.cardBody}>
              <Text style={[styles.cardNo, sel === null && styles.cardNoOn]}>
                ★
              </Text>
            </View>
            <View style={styles.cardLabelBar}>
              <Text style={styles.cardLabel} numberOfLines={1}>
                전체
              </Text>
            </View>
          </TouchableOpacity>
          {steps.map((s, i) => {
            const on = sel === i;
            const zc = ZONE_COLORS[s.key] ?? SKY;
            return (
              <TouchableOpacity
                key={s.id} // 잎 id — 같은 부위 잎이 여러 스텝이라 key는 부위가 아닌 잎
                style={[styles.card, on && styles.cardOn]}
                activeOpacity={0.85}
                onPress={() => selectStep(i)}>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardNo, on && styles.cardNoOn]}>
                    {i + 1}
                  </Text>
                </View>
                {/* 라벨 바 배경 = 부위색(도트 대신 — 어떤 부위인지 색으로). 라벨=잎
                    라벨('블러셔'·'아이라인 상'처럼 구체적으로). */}
                <View style={[styles.cardLabelBar, {backgroundColor: zc}]}>
                  <Text style={styles.cardLabel} numberOfLines={1}>
                    {s.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  // 배경·마진·모서리는 상위 paramPanel(App)이 소유 — 본문은 패딩·gap만.
  panel: {
    paddingHorizontal: 12,
    paddingTop: 0,
    paddingBottom: 10,
    gap: 10,
  },
  // 헤더 한 줄 — [호흡][점선][중심축][대칭쌍] 칩. 좁은 화면에선 줄바꿈 허용.
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  fxChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  fxChipOn: {
    backgroundColor: 'rgba(127,208,255,0.18)',
    borderColor: SKY,
  },
  fxText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  fxTextOn: {
    color: '#DFF2FF',
  },
  cardRow: {
    gap: 8,
    paddingVertical: 2,
  },
  // 스텝 카드 — 메이크업 모드 룩 카드(BasicMode.card)와 동일 규격: 5:6 세로형.
  // 몸통=스텝 번호+부위색 도트, 하단=라벨 바. 선택=스카이 테두리(레인 시그니처).
  card: {
    width: CARD_W,
    aspectRatio: 5 / 6,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end', // 라벨 바를 하단에
    // 비선택 카드는 테두리 없음(투명 1px = 자리만 유지) — 선택만 시그니처색 테두리.
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardOn: {
    backgroundColor: 'rgba(127,208,255,0.14)',
    borderColor: SKY,
    borderWidth: 2,
  },
  cardBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cardNo: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '800',
  },
  cardNoOn: {
    color: SKY,
  },
  // 라벨 바 — 배경색은 인라인으로 부위색 지정('전체'는 기본 어둠). 텍스트는 그 위에
  // 그림자로 가독성 확보(부위색이 밝든 어둡든 흰 글씨가 읽히게).
  cardLabelBar: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  cardLabel: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 2,
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    paddingVertical: 12,
    textAlign: 'center',
  },
});
