/**
 * 보정 시트 — 보정 레인 편집기 (무채색 톤). 메이크업 기본모드와 구조 통일:
 *  0) 카테고리 탭: [전체] + 부위(이마·눈썹·눈·코·볼·입·턱). 전체가 이마 왼쪽 맨 앞.
 *                   · 내용물 있음(워프 적용) → 칩 배경 무채색(보정 레인은 색 분기 없음).
 *                   · 수정됨(현재 프리셋과 다름) → 이름 옆 ●.
 *  1) 전체 탭 = 보정 룩(보정 프리셋 + ◈내 필터)을 카드형으로 → 고르면 전체 워프 로드.
 *     부위 탭 = 그 부위 워프 슬라이더(연속 조절).
 *  2) 필터로 저장: 수정사항(dirty)이 있으면 노출 → 내 보정 필터로 저장.
 *
 * 슬라이더 매핑: signed(0=원래)는 50=중앙(offToSlider), 0..1형(눈확대)은 그대로.
 */
import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ParamSlider from './ParamSlider';
import { NEUTRAL_ACCENT } from '../theme';
import { WARP_PRESETS, PART_PRESETS, WARP_SLIDERS } from '../composer/warpPresets';
import type {
  WarpLane,
  UserWarpFilter,
  WarpGroup,
  WarpKey,
  WarpParams,
} from '../composer/warpPresets';

// 오프셋형(0=원래, ±range) ↔ 0..1 슬라이더 (50=원래)
const offToSlider = (v: number | undefined, range: number) => (v ?? 0) / (2 * range) + 0.5;
const sliderToOff = (v: number, range: number) => (v - 0.5) * 2 * range;

// 카드 = 5:6 세로형 썸네일, 한 줄 가로 스크롤(캐러셀). 한 화면에 ~6장 보이게 폭 산정.
const CARD_W = Math.floor((Dimensions.get('window').width - 48) / 6);
const CARD_H = Math.round((CARD_W * 6) / 5); // 5:6 → 카드 높이(캐러셀 고정 높이용)

const ALL = '전체' as const;
const GROUPS: WarpGroup[] = ['이마', '눈썹', '눈', '코', '볼', '입', '턱'];
type Tab = typeof ALL | WarpGroup;
const TABS: Tab[] = [ALL, ...GROUPS];

interface Props {
  lane: WarpLane;
  userFilters: UserWarpFilter[];
  /** 칩/카드 탭 — App이 fitLaneFrom으로 레인 교체 */
  onSelectRef: (id: string) => void;
  /** 슬라이더 — App이 params 갱신 + dirty=true */
  onChangeParam: (key: WarpKey, value: number) => void;
  /** 부위 프리셋 카드 — 그 부위 키만 세팅(빈 params=없음). 메이크업 부위 룩과 대칭 */
  onApplyPart: (part: WarpGroup, preset: WarpParams) => void;
  /** ↺ 리셋 — fit-none으로 */
  onReset: () => void;
  onClose: () => void;
  /** 통합 파라미터 헤더를 App이 소유할 때 — 자체 최소화·닫기 버튼 생략. */
  hideChrome?: boolean;
}

export default function FitSheet({
  lane,
  userFilters,
  onSelectRef,
  onChangeParam,
  onApplyPart,
  onReset,
  onClose,
  hideChrome = false,
}: Props) {
  const [tab, setTab] = useState<Tab>(ALL);
  const [collapsed, setCollapsed] = useState(false);

  const isAll = tab === ALL;
  const sliders = useMemo(
    () => (isAll ? [] : WARP_SLIDERS.filter(s => s.group === tab)),
    [isAll, tab],
  );

  // 현재 레인 ref(프리셋/내 필터)의 원본 params — 부위별 dirty 비교 기준.
  const refParams: WarpParams = useMemo(
    () =>
      WARP_PRESETS.find(p => p.id === lane.ref)?.params ??
      userFilters.find(f => f.id === lane.ref)?.params ??
      {},
    [lane.ref, userFilters],
  );

  // 카테고리 표시 2종: 내용물 있음(워프≠0) / 수정됨(현재 프리셋과 다름).
  const tabContent = (t: Tab): boolean => {
    const defs = t === ALL ? WARP_SLIDERS : WARP_SLIDERS.filter(s => s.group === t);
    return defs.some(def => (lane.params[def.key] ?? 0) !== 0);
  };
  const tabDirty = (t: Tab): boolean => {
    if (t === ALL) return lane.dirty;
    return WARP_SLIDERS.filter(s => s.group === t).some(
      def => (lane.params[def.key] ?? 0) !== (refParams[def.key] ?? 0),
    );
  };

  // 헤더 — 비통합(standalone)에서만. 통합 헤더(hideChrome)에선 App이 소유.
  const headerBar = !hideChrome ? (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.collapseBtn}
        onPress={() => setCollapsed(c => !c)}>
        <Text style={styles.collapseBtnText}>{collapsed ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        ✥ 보정 레인 — {lane.name}
        {lane.dirty ? '*' : ''}
      </Text>
      <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
        <Text style={styles.headerBtnText}>닫기</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  if (!hideChrome && collapsed) {
    return <View style={styles.sheet}>{headerBar}</View>;
  }

  return (
    <View style={styles.sheet}>
      {headerBar}

      {/* 0) 카테고리 탭 — 밑줄 탭(메이크업 기본모드와 동일 디자인, 무채색 강조).
              기본=흐림, 내용물(워프≠0)=밝은 텍스트, 선택=흰색+밑줄, 수정=● */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catRow}>
        {TABS.map(t => {
          const on = t === tab;
          const filled = tabContent(t);
          const dot = tabDirty(t);
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={styles.catTab}>
              <Text
                style={[
                  styles.catTabText,
                  filled && styles.catTabTextFilled,
                  on && styles.catTabTextOn,
                ]}
                numberOfLines={1}>
                {t}
                {dot ? ' *' : ''}
              </Text>
              <View style={[styles.catUnderline, on && styles.catUnderlineOn]} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 필터 저장 버튼은 공유 헤더(농도 슬라이더 오른쪽)로 이동 — App.tsx panelHeader. */}

      {/* 1) 전체 = 보정 룩 카드, 부위 = 슬라이더 */}
      {isAll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cardScroll}
          contentContainerStyle={styles.cardRow}>
          <View style={styles.cardGrid}>
            {WARP_PRESETS.map(p => {
              const on = lane.ref === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => onSelectRef(p.id)}
                  style={[styles.card, styles.cardTintFit, on && styles.cardOn]}>
                  <View style={styles.cardLabelBar}>
                    <Text style={styles.cardLabel} numberOfLines={2}>
                      {p.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {userFilters.map(f => {
              const on = lane.ref === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => onSelectRef(f.id)}
                  style={[styles.card, styles.cardTintFit, on && styles.cardOn]}>
                  <View style={styles.cardLabelBar}>
                    <Text style={styles.cardLabel} numberOfLines={2}>
                      ◈ {f.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <ScrollView style={styles.sliderScroll}>
          {/* 부위 프리셋 카드 — 그 부위 키만 세팅. 메이크업 부위 룩 카드와 대칭. */}
          {(() => {
            const part = tab as WarpGroup;
            const partKeys = sliders.map(s => s.key);
            const partZero = partKeys.every(k => (lane.params[k] ?? 0) === 0);
            const presetOn = (p: WarpParams) =>
              partKeys.every(k => (lane.params[k] ?? 0) === (p[k] ?? 0));
            return (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.cardScroll}
                contentContainerStyle={styles.cardRow}>
                <View style={styles.cardGrid}>
                  <TouchableOpacity
                    onPress={() => onApplyPart(part, {})}
                    style={[styles.card, styles.cardTintNone, partZero && styles.cardOn]}>
                    <View style={styles.cardLabelBar}>
                      <Text style={styles.cardLabel} numberOfLines={2}>
                        없음
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {(PART_PRESETS[part] ?? []).map(p => {
                    const on = !partZero && presetOn(p.params);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => onApplyPart(part, p.params)}
                        style={[styles.card, styles.cardTintFit, on && styles.cardOn]}>
                        <View style={styles.cardLabelBar}>
                          <Text style={styles.cardLabel} numberOfLines={2}>
                            {p.name}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            );
          })()}

          {/* 미세 조정 — 부위 키 슬라이더 */}
          <Text style={styles.tuneLabel}>미세 조정</Text>
          {sliders.map(def =>
            def.signed ? (
              <ParamSlider
                key={def.key}
                label={def.label}
                value={offToSlider(lane.params[def.key], def.range ?? 1)}
                accent={NEUTRAL_ACCENT}
                onChange={v => onChangeParam(def.key, sliderToOff(v, def.range ?? 1))}
              />
            ) : (
              <ParamSlider
                key={def.key}
                label={def.label}
                value={lane.params[def.key] ?? 0}
                accent={NEUTRAL_ACCENT}
                onChange={v => onChangeParam(def.key, v)}
              />
            ),
          )}
          <TouchableOpacity style={styles.resetBtn} onPress={onReset}>
            <Text style={styles.resetText}>↺ 전체 보정 리셋</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 배경·마진·모서리는 상위 paramPanel(App)이 소유 — 본문은 패딩·gap만.
  sheet: {
    paddingHorizontal: 12,
    paddingTop: 0,
    paddingBottom: 8,
    maxHeight: 420,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '700',
  },
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerBtnText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  collapseBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  collapseBtnText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
  },
  // 카테고리 탭 — 밑줄 탭(메이크업 기본모드와 동일 구조). 기본=흐림, 내용물=밝게, 선택=골드+밑줄.
  catRow: {
    gap: 14,
    alignItems: 'flex-end',
  },
  catTab: {
    alignItems: 'center',
    gap: 2, // 메이크업 모드 탭과 동일 — 텍스트↔밑줄 간격
  },
  catTabText: {
    color: 'rgba(255,255,255,0.45)', // 기본(내용 없음) = 흐림
    fontSize: 13,
    lineHeight: 17, // 고정 — 굵기 변화가 박스 높이를 바꿔 탭이 들쭉날쭉해지는 것 방지
    includeFontPadding: false, // Android 글리프 여백 제거(iOS 무시) — 정렬 일관성
    textAlignVertical: 'center',
    fontWeight: '600',
  },
  catTabTextFilled: {
    color: 'rgba(255,255,255,0.92)', // 내용 있음(워프≠0) = 밝은 텍스트
  },
  catTabTextOn: {
    color: '#FFFFFF', // 선택됨 = 흰색(무채색)
    fontWeight: '800',
  },
  catUnderline: {
    height: 2,
    width: 22, // 메이크업 모드 밑줄과 동일 크기
    borderRadius: 1,
    backgroundColor: 'transparent', // 레이아웃 안정용 항상 자리 차지
  },
  catUnderlineOn: {
    backgroundColor: '#FFFFFF',
  },
  // 카드형 보정 룩 — 한 줄 가로 스크롤(캐러셀)
  cardScroll: {
    height: CARD_H + 8, // 카드 한 줄 높이로 고정 — 세로 확장 막아 아래 슬라이더 보장
    flexGrow: 0,
  },
  cardRow: {
    paddingVertical: 2,
  },
  cardGrid: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  // 카드 = 5:6 썸네일 한 장(텍스트를 하단에 스크림 얹어 오버레이). 외곽 상자 없음.
  // 5라운드: BasicMode/GuideMode와 카드 규격 전수 통일(테두리 2px·라벨 바 마진 트릭).
  card: {
    width: CARD_W,
    aspectRatio: 5 / 6, // 카드 전체가 세로형 썸네일(가로5:세로6).
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    // 비선택 카드는 테두리 없음(투명 2px = 자리만 유지) — 선택만 흰 테두리.
    // 폭을 선택(2)과 맞춰 라벨 바 음수 마진(-2)으로 테두리 자리를 덮어 꽉 차게
    // (BasicMode/GuideMode와 동일 트릭 — 기존 1px은 두 파일과 어긋난 값이었다).
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardOn: {
    borderColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    // GuideMode.cardOn과 동일한 선택 하이라이트 배경 — 이 카드들은 실제 제품
    // 스와치가 아니라 중립 틴트(cardTintFit/None)라 배경을 덮어써도 정보 손실이
    // 없다(BasicMode는 스와치 색이 실제 정보라 이 배경을 넣지 않음, 기능상 예외).
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  cardTintFit: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  cardTintNone: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardLabelBar: {
    // 카드 테두리(2px) 자리를 음수 마진으로 덮어 좌·우·하단 가장자리까지 꽉 채운다
    // (BasicMode/GuideMode와 동일 — 기존 width:'100%'는 1px 테두리 시절의 임시값).
    marginHorizontal: -2,
    marginBottom: -2,
    paddingVertical: 3,
    paddingHorizontal: 3, // GuideMode 라벨 바와 통일(기존 2 → 3)
    backgroundColor: 'rgba(255,255,255,0.1)', // 회색조 — GuideMode 라벨 바와 통일
  },
  cardLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  tuneLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 2,
  },
  sliderScroll: {
    maxHeight: 240,
  },
  resetBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  resetText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
});
