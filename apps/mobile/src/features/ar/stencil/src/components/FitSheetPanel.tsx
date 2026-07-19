import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Slider from '@react-native-community/slider';

import {
  entryOf,
  fitCapableRegions,
  fitFieldsOfRegion,
  removeEntry,
  upsertEntry,
} from '../composer/fitSheets';
import type {FitDelta, FitSheet} from '../composer/fitSheets';
import {REGION_MAP} from '../composer/regions';
import type {FitTraitBackend, RegionKey} from '../composer/regions';
import {
  CONTROL_H,
  NEUTRAL_ACCENT,
  PANEL_BG,
  PANEL_INSET,
  SP,
  TEXT_HINT,
  TEXT_SUB,
} from '../theme';

/**
 * 내 핏 패널(§5 A13) — 핏 시트(개인 공간 델타 스타일시트)의 편집 표면.
 * 룩 편집(모양)과 명시적으로 분리된 진입점: 여기서 움직인 값만 핏 시트에 기록되고,
 * 어떤 룩을 입어도 나를 따라온다(델타 0 = 룩 그대로). mainId는 "내 얼굴 프로필"로
 * 표시하고, 다중 시트 관리는 고급에 둔다. role 셀렉터는 저장·엔진에만 보존하며
 * 사용자 표면은 부위와 겹id("이 겹만 조정됨")만 말한다.
 */

interface Props {
  sheets: FitSheet[];
  mainId: string | null;
  onChange: (sheets: FitSheet[], mainId: string | null) => void;
  /** 패널 닫기(✕) — 도구 레일 토글과 동일 동작 */
  onClose: () => void;
  /** 스튜디오 허브 열기 — 시트 만들기/이름/메인/삭제는 스튜디오 소관(A18 분리 원칙) */
  onOpenStudio: () => void;
  /** 자동 핏 상태 — 얼굴분석 미구현 동안 다시 계산은 App의 DEV 스텁으로 진입한다. */
  autoFit?: {measuredAt: number; accepted: boolean} | null;
  onOpenAutoFit?: () => void;
  /** 컴포저 "이 겹 핏 조정" 승격 초점(§5 A13) — leafId가 있으면 '#겹id' 셀렉터 편집 */
  focus?: {region: RegionKey; leafId?: string} | null;
  /** 스튜디오 '조정'으로 진입 시 초기 선택 시트 — 없으면 메인. 패널은 열릴 때마다
   *  마운트되므로 초기값으로만 쓰인다. */
  initialSheetId?: string | null;
}

const TRAIT_SLOTS = [
  {key: 'positionX', label: '눈꼬리 쪽으로'},
  {key: 'positionY', label: '위로'},
  {key: 'size', label: '크게'},
  {key: 'angle', label: '기울기'},
  {key: 'width', label: '도톰하게'},
] as const;

const AFFINE_RANGE: Record<string, {min: number; max: number}> = {
  dx: {min: -0.15, max: 0.15},
  dy: {min: -0.15, max: 0.15},
  sx: {min: -0.5, max: 0.5},
  sy: {min: -0.5, max: 0.5},
  rot: {min: -45, max: 45},
};

function measuredDate(measuredAt: number): string {
  return new Date(measuredAt).toISOString().slice(0, 10).replace(/-/g, '.');
}

export default function FitSheetPanel({
  sheets,
  mainId,
  onChange,
  onClose,
  onOpenStudio,
  autoFit = null,
  onOpenAutoFit,
  focus,
  initialSheetId,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSheetId ?? mainId ?? sheets[0]?.id ?? null,
  );
  const [region, setRegion] = useState<RegionKey>('blush');
  // '#겹id' 셀렉터 편집 — 컴포저 "이 겹 핏 조정"에서 승격(focus)될 때만 잡힌다.
  const [leafSel, setLeafSel] = useState<string | undefined>(undefined);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const previousSelectionProps = useRef({initialSheetId, mainId});

  useEffect(() => {
    const previous = previousSelectionProps.current;
    const initialChanged = previous.initialSheetId !== initialSheetId;
    const mainChanged = previous.mainId !== mainId;
    previousSelectionProps.current = {initialSheetId, mainId};
    const has = (id: string | null | undefined) =>
      !!id && sheets.some(item => item.id === id);
    setSelectedId(current => {
      if (initialChanged && has(initialSheetId)) return initialSheetId ?? null;
      if (mainChanged && !has(initialSheetId) && has(mainId)) return mainId;
      if (has(current)) return current;
      if (has(initialSheetId)) return initialSheetId ?? null;
      if (has(mainId)) return mainId;
      return sheets[0]?.id ?? null;
    });
  }, [sheets, initialSheetId, mainId]);

  useEffect(() => {
    if (!focus) return;
    setRegion(focus.region);
    setLeafSel(focus.leafId);
  }, [focus]);

  const regions = useMemo(() => fitCapableRegions(), []);
  const sheet = sheets.find(s => s.id === selectedId) ?? null;
  const mainSheet = sheets.find(s => s.id === mainId) ?? null;
  // role은 엔진/기존 저장물에만 유지하고 사용자 표면에는 노출하지 않는다.
  const sel = {
    region,
    ...(leafSel ? {leafId: leafSel} : {}),
  };
  const entry = sheet ? entryOf(sheet, sel) : undefined;
  const traits = REGION_MAP[region].fitTraits ?? {};
  const traitBackends = new Set(Object.values(traits));
  const advancedFields = fitFieldsOfRegion(region).filter(
    field => !traitBackends.has(field.key),
  );

  const replaceSheet = (next: FitSheet) =>
    onChange(sheets.map(s => (s.id === next.id ? next : s)), mainId);

  const setDelta = (patch: FitDelta) => {
    if (!sheet) return;
    replaceSheet(upsertEntry(sheet, sel, patch));
  };

  const renderBackendSlider = (
    backend: FitTraitBackend,
    label: string,
    key: string,
  ) => {
    if (backend.startsWith('affine.')) {
      const affineKey = backend.slice('affine.'.length) as keyof FitDelta;
      const range = AFFINE_RANGE[affineKey as string];
      const value = (entry?.[affineKey] as number | undefined) ?? 0;
      return (
        <View key={key} style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>{label}</Text>
          <Slider
            style={styles.slider}
            minimumValue={range.min}
            maximumValue={range.max}
            value={value}
            accessibilityLabel={label}
            accessibilityValue={{min: range.min, max: range.max, now: value}}
            minimumTrackTintColor={NEUTRAL_ACCENT}
            thumbTintColor={NEUTRAL_ACCENT}
            onValueChange={nextValue =>
              setDelta({[affineKey]: Math.abs(nextValue) < 1e-4 ? 0 : nextValue})
            }
          />
        </View>
      );
    }
    const field = fitFieldsOfRegion(region).find(item => item.key === backend);
    if (!field) return null;
    const half = (field.max - field.min) / 2;
    const value = entry?.rules?.[field.key as string] ?? 0;
    return (
      <View key={key} style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Slider
          style={styles.slider}
          minimumValue={-half}
          maximumValue={half}
          value={value}
          accessibilityLabel={label}
          accessibilityValue={{min: -half, max: half, now: value}}
          minimumTrackTintColor={NEUTRAL_ACCENT}
          thumbTintColor={NEUTRAL_ACCENT}
          onValueChange={nextValue =>
            setDelta({rules: {
              [field.key as string]: Math.abs(nextValue) < 1e-4 ? 0 : nextValue,
            }})
          }
        />
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>내 핏</Text>
        <TouchableOpacity accessibilityLabel="핏 패널 닫기" onPress={onClose} hitSlop={8}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        룩 위에 얹는 나만의 배치 조정 (0 = 룩 그대로). 어떤 룩을 입어도 따라옵니다.
      </Text>

      <View style={styles.profileCard} testID="fit-profile-card">
        <View style={styles.profileHeader}>
          <Text style={styles.profileTitle}>내 얼굴 프로필</Text>
          <Text style={styles.profileStatus}>
            {autoFit?.accepted
              ? '자동 핏 수락됨'
              : autoFit
                ? '자동 핏 미수락'
                : '자동 핏 미계산'}
          </Text>
        </View>
        {autoFit && (
          <Text style={styles.profileMeta}>측정일 {measuredDate(autoFit.measuredAt)}</Text>
        )}
        <Text style={styles.profileMeta}>
          {mainSheet?.entries.length
            ? `내 미세조정 ${mainSheet.entries.length}개`
            : '내 미세조정 없음'}
        </Text>
        {onOpenAutoFit && (
          <TouchableOpacity style={styles.profileAction} onPress={onOpenAutoFit}>
            <Text style={styles.profileActionText}>자동 핏 다시 계산</Text>
          </TouchableOpacity>
        )}
      </View>

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
                    setLeafSel(undefined); // 부위 이동 = 겹 초점 해제
                    setAdvancedOpen(false);
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
              <Text style={styles.leafBadgeText}>이 겹만 조정됨</Text>
              <TouchableOpacity
                accessibilityLabel="겹 조정 해제"
                onPress={() => setLeafSel(undefined)}
                hitSlop={6}>
                <Text style={styles.leafBadgeClear}>부위 전체로</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 4어휘 공통 바닥 + 부위 고유 고급 축. 없는 trait은 고정 자리에서 퇴화(숨김). */}
          <ScrollView style={styles.sliderScroll}>
          <View style={styles.traitGrid}>
            {TRAIT_SLOTS.map(slot => {
              const backend = traits[slot.key];
              return backend
                ? renderBackendSlider(backend, slot.label, slot.key)
                : null;
            })}
          </View>

          <TouchableOpacity
            style={styles.advancedBtn}
            onPress={() => setAdvancedOpen(open => !open)}>
            <Text style={styles.advancedText}>
              고급{advancedOpen ? ' ▴' : ''}
            </Text>
          </TouchableOpacity>
          {advancedOpen && (
            <View style={styles.advancedSheets}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {sheets.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.chip, selectedId === item.id && styles.chipOn]}
                      onPress={() => setSelectedId(item.id)}>
                      <Text style={[
                        styles.chipText,
                        selectedId === item.id && styles.chipTextOn,
                      ]}>
                        {mainId === item.id ? '★ ' : ''}{item.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity style={styles.manageBtn} onPress={onOpenStudio}>
                <Text style={styles.manageText}>시트 관리</Text>
              </TouchableOpacity>
            </View>
          )}
          {advancedOpen && advancedFields.map(f => {
                const half = (f.max - f.min) / 2;
                const value = entry?.rules?.[f.key as string] ?? 0;
                return (
                  <View key={f.key as string} style={styles.sliderRow}>
                    <Text style={styles.sliderLabel}>{f.label}</Text>
                    <Slider
                      style={styles.slider}
                      minimumValue={-half}
                      maximumValue={half}
                      value={value}
                      accessibilityLabel={f.label}
                      accessibilityValue={{min: -half, max: half, now: value}}
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
                이 {leafSel ? '겹' : '부위'} 리셋 (룩 그대로)
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
    padding: PANEL_INSET,
    borderRadius: 18,
    backgroundColor: PANEL_BG,
    maxHeight: 520,
    gap: SP.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '700'},
  closeText: {color: TEXT_SUB, fontSize: 14},
  sliderScroll: {maxHeight: 220},
  hint: {color: TEXT_HINT, fontSize: 11, lineHeight: 15},
  profileCard: {
    padding: SP.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    gap: SP.xs,
  },
  profileHeader: {flexDirection: 'row', justifyContent: 'space-between', gap: SP.sm},
  profileTitle: {color: '#FFFFFF', fontSize: 13, fontWeight: '700'},
  profileStatus: {color: TEXT_SUB, fontSize: 11, fontWeight: '600'},
  profileMeta: {color: TEXT_HINT, fontSize: 11},
  profileAction: {alignSelf: 'flex-start', paddingVertical: 3},
  profileActionText: {color: '#FFFFFF', fontSize: 11, textDecorationLine: 'underline'},
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
  traitGrid: {gap: SP.xs},
  sliderRow: {flexDirection: 'row', alignItems: 'center', gap: SP.sm},
  sliderLabel: {color: TEXT_SUB, fontSize: 12, width: 92},
  slider: {flex: 1, height: CONTROL_H},
  advancedBtn: {height: CONTROL_H, justifyContent: 'center', alignSelf: 'flex-start'},
  advancedText: {color: TEXT_SUB, fontSize: 12, fontWeight: '600'},
  advancedSheets: {gap: SP.xs, marginBottom: SP.xs},
  manageBtn: {alignSelf: 'flex-start', paddingVertical: 3},
  manageText: {color: TEXT_HINT, fontSize: 11, textDecorationLine: 'underline'},
  resetBtn: {alignSelf: 'flex-start', paddingVertical: 4},
  resetText: {color: TEXT_HINT, fontSize: 11, textDecorationLine: 'underline'},
});
