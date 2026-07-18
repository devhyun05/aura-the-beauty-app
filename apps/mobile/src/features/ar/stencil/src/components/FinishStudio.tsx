/**
 * 제형 스튜디오(#21) — 마감(finish)의 내부 빛 반응 파라미터를 슬라이더로 열어 사용자가
 * 자기 얼굴 실시간 프리뷰로 커스텀 제형을 만들고 저장한다. 립·아이섀도·블러셔 3대 색소면.
 *
 * 다섯 축(FinishBundle, 0..1)은 부위 무관 값이고, 상위(ControlView)가 부위별 브리지
 * 필드로 번역해 잎 params에 실시간 반영(→ 브리지 방출)한다. 저장은 이름 붙여 커스텀
 * 제형으로 라이브러리에 편입(finishStore) — 마감 축 finish 버튼 줄에 ◈로 나타난다.
 *
 * enum(FINISHES)과의 관계: 스튜디오 진입 시 현재 enum의 세부 시드(FINISH_ENUM_SEED)에서
 * 출발하고, 슬라이더를 만지면 그 시드를 통째로 커밋해 커스텀으로 전환한다("enum은 세부값
 * 프리셋으로 재해석"). 세부값 전부 0으로 되돌리면(초기화) 다시 enum 레거시 경로로 돈다
 * (하위호환 — Unity Finish.cginc가 다섯 값 합 0이면 enum 기존 동작).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ParamSlider from './ParamSlider';
import { FINISH_STUDIO_SLIDERS, isCustomFinish } from '../composer/regions';
import type { FinishBundle } from '../composer/regions';
import { ACCENT, ACCENT_PALE, accentAlpha } from '../theme';

interface Props {
  /** 현재 잎의 세부값(커스텀이면 실제값, 아니면 enum 시드) */
  bundle: FinishBundle;
  /** 세부값이 켜져 커스텀 경로인지 — 슬라이더 출발점을 bundle↔seed로 가른다 */
  customActive: boolean;
  /** 현재 enum의 세부 시드 — !customActive일 때 슬라이더 출발점 겸 첫 편집 커밋 기준 */
  enumSeed: FinishBundle;
  /** 슬라이더 변경 → 전체 번들 방출(부위 필드 번역은 상위가). */
  onChange: (bundle: FinishBundle) => void;
  /** 세부값 전부 0으로 — enum 레거시 경로 복귀 */
  onReset: () => void;
  /** 이름 붙여 커스텀 제형 저장 */
  onSave: (name: string, bundle: FinishBundle) => void;
}

export default function FinishStudio({
  bundle,
  customActive,
  enumSeed,
  onChange,
  onReset,
  onSave,
}: Props) {
  const [name, setName] = useState('');
  // 슬라이더 출발점: 커스텀이면 실제 세부값, 아니면 enum 시드(첫 편집이 시드 통째 커밋).
  const shown = customActive ? bundle : enumSeed;
  const custom = isCustomFinish(bundle);

  const setAxis = (axis: (typeof FINISH_STUDIO_SLIDERS)[number]['axis'], v: number) => {
    onChange({ ...shown, [axis]: v });
  };

  return (
    <View style={styles.box}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>제형 만들기</Text>
        <Text style={[styles.badge, custom ? styles.badgeOn : styles.badgeOff]}>
          {custom ? '◈ 커스텀' : '마감 프리셋'}
        </Text>
      </View>
      <Text style={styles.hint}>
        빛 반응을 직접 조정 — 자기 얼굴로 보면서 나만의 제형을 만들어요
      </Text>
      {FINISH_STUDIO_SLIDERS.map(s => (
        <ParamSlider
          key={s.axis}
          label={s.label}
          value={shown[s.axis]}
          onChange={v => setAxis(s.axis, v)}
        />
      ))}
      <View style={styles.saveRow}>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="제형 이름 (예: 유리알 광)"
          placeholderTextColor="rgba(255,255,255,0.4)"
        />
        <TouchableOpacity
          style={[styles.saveBtn, !custom && styles.saveBtnOff]}
          disabled={!custom}
          onPress={() => {
            onSave(name.trim() || '내 제형', bundle);
            setName('');
          }}
        >
          <Text style={styles.saveText}>제형 저장</Text>
        </TouchableOpacity>
      </View>
      {custom && (
        <TouchableOpacity style={styles.resetBtn} onPress={onReset}>
          <Text style={styles.resetText}>마감 프리셋으로 초기화</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 6,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: accentAlpha(0.5),
    backgroundColor: accentAlpha(0.05),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  badge: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgeOn: {
    color: ACCENT_PALE,
    backgroundColor: accentAlpha(0.22),
  },
  badgeOff: {
    color: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  hint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    marginBottom: 6,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  nameInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  saveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: ACCENT,
  },
  saveBtnOff: {
    opacity: 0.4,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  resetBtn: {
    marginTop: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  resetText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
  },
});
