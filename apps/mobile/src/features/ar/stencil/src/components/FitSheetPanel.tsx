import React, {useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Slider from '@react-native-community/slider';

import {
  entryOf,
  fitCapableRegions,
  fitFieldsOfRegion,
  removeEntry,
  rolesOfRegion,
  upsertEntry,
} from '../composer/fitSheets';
import type {FitDelta, FitSheet} from '../composer/fitSheets';
import {isDecoRegion, REGION_MAP} from '../composer/regions';
import type {RegionKey} from '../composer/regions';
import {NEUTRAL_ACCENT, PANEL_BG, TEXT_HINT, TEXT_SUB} from '../theme';

/**
 * 내 핏 패널(§5 A13) — 핏 시트(개인 공간 델타 스타일시트)의 편집 표면.
 * 룩 편집(모양)과 명시적으로 분리된 진입점: 여기서 움직인 값만 핏 시트에 기록되고,
 * 어떤 룩을 입어도 나를 따라온다(델타 0 = 룩 그대로). 시트는 여러 장 — 메인 1장이
 * 기본 적용, 나머지는 룩·하위 룩에 fitRef로 지정(ComposerSheet 헤더).
 * v1 편집 셀렉터 = 부위(.부위) + 역할(.부위[역할]). 겹id(#겹id)는 엔진만 지원.
 */

interface Props {
  sheets: FitSheet[];
  mainId: string | null;
  onChange: (sheets: FitSheet[], mainId: string | null) => void;
  /** 패널 닫기(✕) — 도구 레일 토글과 동일 동작 */
  onClose: () => void;
  /** 스튜디오 허브 열기 — 시트 만들기/이름/메인/삭제는 스튜디오 소관(A18 분리 원칙) */
  onOpenStudio: () => void;
  /** 컴포저 "이 겹 핏 조정" 승격 초점(§5 A13) — leafId가 있으면 '#겹id' 셀렉터 편집 */
  focus?: {region: RegionKey; leafId?: string} | null;
  /** 스튜디오 '조정'으로 진입 시 초기 선택 시트 — 없으면 메인. 패널은 열릴 때마다
   *  마운트되므로 초기값으로만 쓰인다. */
  initialSheetId?: string | null;
}

// 데코(자유 배치)의 아핀 델타 슬라이더 — 배치 필드는 골드 슬라이더가 아니라
// 오버레이 transform이라 여기서 직접 정의한다(fitSheets.applyFitToLayers와 짝).
const DECO_AFFINE: {key: keyof FitDelta; label: string; min: number; max: number}[] = [
  {key: 'dx', label: '가로 이동', min: -0.3, max: 0.3},
  {key: 'dy', label: '세로 이동', min: -0.3, max: 0.3},
  {key: 'sx', label: '크기 ±', min: -0.5, max: 0.5},
  {key: 'rot', label: '회전 ±°', min: -45, max: 45},
];

export default function FitSheetPanel({
  sheets,
  mainId,
  onChange,
  onClose,
  onOpenStudio,
  focus,
  initialSheetId,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSheetId ?? mainId ?? sheets[0]?.id ?? null,
  );
  const [region, setRegion] = useState<RegionKey>('blush');
  const [role, setRole] = useState<string | undefined>(undefined);
  // '#겹id' 셀렉터 편집 — 컴포저 "이 겹 핏 조정"에서 승격(focus)될 때만 잡힌다.
  const [leafSel, setLeafSel] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!focus) return;
    setRegion(focus.region);
    setLeafSel(focus.leafId);
    setRole(undefined);
  }, [focus]);

  const regions = useMemo(() => fitCapableRegions(), []);
  const sheet = sheets.find(s => s.id === selectedId) ?? null;
  const roles = rolesOfRegion(region);
  // 셀렉터 우선순위: 겹id > 역할 > 부위(해석 규칙과 동일한 사다리)
  const sel = {
    region,
    ...(leafSel ? {leafId: leafSel} : role ? {role} : {}),
  };
  const entry = sheet ? entryOf(sheet, sel) : undefined;

  const replaceSheet = (next: FitSheet) =>
    onChange(sheets.map(s => (s.id === next.id ? next : s)), mainId);

  const setDelta = (patch: FitDelta) => {
    if (!sheet) return;
    replaceSheet(upsertEntry(sheet, sel, patch));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>내 핏</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        룩 위에 얹는 나만의 배치 조정 (0 = 룩 그대로). 어떤 룩을 입어도 따라옵니다.
        시트 만들기·이름·메인 지정은 스튜디오에서.
      </Text>

      {/* 시트 칩 줄 — 선택만(메인=★). 만들기/관리는 스튜디오(A18 분리 원칙). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {sheets.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, selectedId === s.id && styles.chipOn]}
              onPress={() => setSelectedId(s.id)}>
              <Text
                style={[
                  styles.chipText,
                  selectedId === s.id && styles.chipTextOn,
                ]}>
                {mainId === s.id ? '★ ' : ''}
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {!sheet ? (
        <TouchableOpacity style={styles.studioBtn} onPress={onOpenStudio}>
          <Text style={styles.studioBtnText}>
            핏 시트가 없습니다 — 스튜디오에서 만들기
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          {/* 부위 칩 — 핏 가능 부위(골드 필드 보유 + 데코) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {regions.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.regionChip, region === r && styles.regionChipOn]}
                  onPress={() => {
                    setRegion(r);
                    setRole(undefined);
                    setLeafSel(undefined); // 부위 이동 = 겹 초점 해제
                  }}>
                  <Text
                    style={[
                      styles.regionText,
                      region === r && styles.regionTextOn,
                    ]}>
                    {REGION_MAP[r]?.label ?? r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* 겹 초점 배지 — '#겹id' 셀렉터 편집 중(컴포저에서 승격) */}
          {leafSel && (
            <View style={styles.leafBadgeRow}>
              <Text style={styles.leafBadgeText}>이 겹만 조정 중</Text>
              <TouchableOpacity onPress={() => setLeafSel(undefined)} hitSlop={6}>
                <Text style={styles.leafBadgeClear}>부위 전체로</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 역할 세그 — 역할 어휘가 있는 부위만(.부위[역할] 셀렉터). 겹 초점 중엔
              숨김(겹id가 더 구체적 — 역할 선택이 무의미). */}
          {!leafSel && roles.length > 0 && (
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[styles.roleBtn, !role && styles.roleBtnOn]}
                onPress={() => setRole(undefined)}>
                <Text style={[styles.roleText, !role && styles.roleTextOn]}>
                  전체
                </Text>
              </TouchableOpacity>
              {roles.map(rl => (
                <TouchableOpacity
                  key={rl.key}
                  style={[styles.roleBtn, role === rl.key && styles.roleBtnOn]}
                  onPress={() => setRole(rl.key)}>
                  <Text
                    style={[
                      styles.roleText,
                      role === rl.key && styles.roleTextOn,
                    ]}>
                    {rl.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 델타 슬라이더 — 부위 룰(골드) 또는 데코 아핀. 세로 스크롤(카드 maxHeight 초과 방지) */}
          <ScrollView style={styles.sliderScroll}>
          {isDecoRegion(region)
            ? DECO_AFFINE.map(f => (
                <View key={f.key as string} style={styles.sliderRow}>
                  <Text style={styles.sliderLabel}>{f.label}</Text>
                  <Slider
                    style={styles.slider}
                    minimumValue={f.min}
                    maximumValue={f.max}
                    value={(entry?.[f.key] as number | undefined) ?? 0}
                    minimumTrackTintColor={NEUTRAL_ACCENT}
                    thumbTintColor={NEUTRAL_ACCENT}
                    onValueChange={v =>
                      setDelta({[f.key]: Math.abs(v) < 1e-4 ? 0 : v})
                    }
                  />
                </View>
              ))
            : fitFieldsOfRegion(region).map(f => {
                const half = (f.max - f.min) / 2;
                return (
                  <View key={f.key as string} style={styles.sliderRow}>
                    <Text style={styles.sliderLabel}>{f.label} ±</Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={-half}
                      maximumValue={half}
                      value={entry?.rules?.[f.key as string] ?? 0}
                      minimumTrackTintColor={NEUTRAL_ACCENT}
                      thumbTintColor={NEUTRAL_ACCENT}
                      onValueChange={v =>
                        setDelta({
                          rules: {[f.key as string]: Math.abs(v) < 1e-4 ? 0 : v},
                        })
                      }
                    />
                  </View>
                );
              })}

          {entry && (
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => sheet && replaceSheet(removeEntry(sheet, sel))}>
              <Text style={styles.resetText}>
                이 {leafSel ? '겹' : role ? '역할' : '부위'} 리셋 (룩 그대로)
              </Text>
            </TouchableOpacity>
          )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 도구 레일 플로팅 카드 — LightingPanel.card와 동일 규약(전체 라운드·검은 반투명).
  // 카드 스타일이 없으면 카메라 피드 위에 투명하게 떠서 깨져 보인다.
  wrap: {
    marginHorizontal: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: PANEL_BG,
    maxHeight: 420,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '700'},
  closeText: {color: TEXT_SUB, fontSize: 14},
  sliderScroll: {maxHeight: 200},
  hint: {color: TEXT_HINT, fontSize: 11, lineHeight: 15},
  studioBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  studioBtnText: {color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600'},
  chipRow: {flexDirection: 'row', gap: 6, paddingVertical: 2},
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  chipOn: {backgroundColor: '#E9E9E9', borderColor: '#E9E9E9'},
  chipText: {color: TEXT_SUB, fontSize: 12},
  chipTextOn: {color: '#1A1206', fontWeight: '700'},
  regionChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  regionChipOn: {borderBottomColor: 'rgba(255,255,255,0.9)'},
  regionText: {color: TEXT_HINT, fontSize: 12},
  regionTextOn: {color: '#FFFFFF', fontWeight: '700'},
  leafBadgeRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  leafBadgeText: {color: '#FFFFFF', fontSize: 11, fontWeight: '700'},
  leafBadgeClear: {color: TEXT_HINT, fontSize: 11, textDecorationLine: 'underline'},
  roleRow: {flexDirection: 'row', gap: 6},
  roleBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  roleBtnOn: {borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(255,255,255,0.12)'},
  roleText: {color: TEXT_HINT, fontSize: 11},
  roleTextOn: {color: '#FFFFFF', fontWeight: '600'},
  sliderRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  sliderLabel: {color: TEXT_SUB, fontSize: 12, width: 92},
  slider: {flex: 1, height: 28},
  resetBtn: {alignSelf: 'flex-start', paddingVertical: 4},
  resetText: {color: TEXT_HINT, fontSize: 11, textDecorationLine: 'underline'},
});
