/**
 * 기본 모드 — 초보자용 "일반 메이크업 앱" 문법 (#24). 카테고리를 누르고 카드형 룩을
 * 고르고 농도를 밀면 끝.
 *
 *  0) 카테고리 2단 (분류체계 정의: 대분류=슬롯, 중분류=세부부위)
 *     · 대분류 탭 — [전체] + 슬롯 8개(피부·컨투어·렌즈·눈·눈썹·립·헤어·데코).
 *     · 중분류 탭 — 슬롯 선택 시 그 슬롯의 세부부위 전부(룩 없어도 카테고리로 노출) + [전체].
 *       심플한 밑줄 탭. 룩 없는 세부부위를 고르면 카드는 '없음'만(빈 상태 안내).
 *  1) 카드 캐러셀  — '전체'=전체룩 카드, 슬롯=부위 스타일 카드(중분류로 필터).
 *  2) 필터 저장    — 룩 선택 상태에서 수정사항이 하나라도 있으면 노출(→ 저장 시트).
 *  3) 농도 슬라이더 — 부위 탭에서만: 중분류 선택 시 그 세부부위 잎, 아니면 첫 잎.
 *
 * 상태는 전부 App의 lookTree(작업본) — BasicMode는 UI 로컬 선택 카테고리만 소유.
 */
import React, {useMemo, useState} from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ParamSlider from './ParamSlider';
import type {LaneChip} from './LaneRow';
import {REGION_GROUPS, REGION_MAP} from '../composer/regions';
import type {RegionDef, RegionKey} from '../composer/regions';
import {
  defSwatchColor,
  regionDefsForSlot,
  regionKeysOfDef,
  setSlotRegion,
  slotRegionNodes,
  SLOT_LABEL,
  SLOT_ORDER,
} from '../composer/lookTree';
import type {LookLibrary, LookNode, SlotKey} from '../composer/lookTree';

const ROSE = '#FF7E9D';
// 카드 = 5:6 세로형 썸네일, 한 줄 가로 스크롤(캐러셀). 한 화면에 ~6장 보이게 폭 산정.
const CARD_W = Math.floor((Dimensions.get('window').width - 48) / 6);
const CARD_H = Math.round((CARD_W * 6) / 5); // 5:6 → 카드 높이(캐러셀 고정 높이용)
const ALL = '전체' as const;
type Cat = typeof ALL | SlotKey;
// 카테고리 표시 라벨 — 내부 키와 화면 표기 분리('컨투어'→'윤곽' 등). '전체'는 그대로.
const catLabel = (c: Cat): string => (c === ALL ? ALL : SLOT_LABEL[c]);
type MidCat = typeof ALL | RegionKey;
const CATS: Cat[] = [ALL, ...SLOT_ORDER];

// 슬롯 → 세부부위 정의(카탈로그 순서). 중분류 탭 후보의 단일 출처.
const REGIONS_BY_SLOT: Record<string, RegionDef[]> = {};
for (const g of REGION_GROUPS) {
  REGIONS_BY_SLOT[g.slot] = [...(REGIONS_BY_SLOT[g.slot] ?? []), ...g.regions];
}

// 중분류 탭 라벨 — '톤 조정 베이스'류 장황한 접미사만 걷어낸다(톤·질감).
const midLabelOf = (label: string): string => label.replace(/ 조정 베이스$/, '');

interface Props {
  /** 작업본 룩 트리 — null이면 원본(빈 조합) */
  tree: LookNode | null;
  /** 시스템+사용자 병합 라이브러리 — 슬롯별 부위 룩 후보 */
  library: LookLibrary;
  /** 트리 교체 — App의 changeTree (flatten→compile→방출 공유) */
  onChangeTree: (next: LookNode | null) => void;
  /** 전체 룩(LOOK) 칩 — [원본]+시스템 face 룩+◈사용자 스타일 */
  lookChips: LaneChip[];
  /** 활성 룩 칩 id (App lookSel) */
  lookSelectedId: string;
  /** 룩 칩 선택 — App의 selectLook과 동일 핸들러(전체 face 룩을 트리에 로드) */
  onSelectLook: (id: string) => void;
  /** ◈ 내 룩 칩 롱프레스 — 편집(상세 진입)/삭제 메뉴(App styleMenu) */
  onLongPressLook?: (id: string) => void;
  /** 현재 룩에 수정사항이 있는가(treeDirty) — ● 표시용(저장 버튼은 App 공유 헤더로 이동) */
  dirty: boolean;
  /** 통합 파라미터 헤더를 App이 소유할 때 — 자체 헤더/최소화 생략(중복 헤더 방지) */
  hideHeader?: boolean;
  // ── 농도 슬라이더(룩카드 아래) — 카테고리별 라우팅 ──
  /** 전역 메이크업 농도(0..1) — '전체' 카테고리에서 이 슬라이더가 조절 */
  opacity: number;
  onOpacity: (v: number) => void;
  /** 슬롯별 농도 게인(없으면 1) — 슬롯 카테고리 선택 시 그 슬롯만 조절 */
  slotGain: Partial<Record<SlotKey, number>>;
  onSlotGain: (slot: SlotKey, v: number) => void;
}

export default function BasicMode({
  tree,
  library,
  onChangeTree,
  lookChips,
  lookSelectedId,
  onSelectLook,
  onLongPressLook,
  dirty,
  hideHeader = false,
  opacity,
  onOpacity,
  slotGain,
  onSlotGain,
}: Props) {
  const [cat, setCat] = useState<Cat>(ALL);
  const [midCat, setMidCat] = useState<MidCat>(ALL);
  const [collapsed, setCollapsed] = useState(false);

  const isAll = cat === ALL;
  const slot: SlotKey | null = isAll ? null : cat;

  // 대분류 전환 — 중분류는 항상 '전체'로 리셋(슬롯마다 세부부위가 다르므로).
  const selectCat = (c: Cat) => {
    setCat(c);
    setMidCat(ALL);
  };

  // 슬롯의 모든 부위 룩 + 각 룩이 건드리는 세부부위(RegionKey) 집합.
  const slotDefs = useMemo(
    () => (slot ? regionDefsForSlot(library, slot) : []),
    [library, slot],
  );
  const defKeys = useMemo(() => {
    const m = new Map<string, Set<RegionKey>>();
    for (const d of slotDefs) m.set(d.id, regionKeysOfDef(library, d.id));
    return m;
  }, [slotDefs, library]);

  // 중분류 후보 — 이 슬롯의 세부부위 전부(룩이 없어도 카테고리로 노출해 구조를 드러냄).
  const midCats = useMemo(
    () => (slot ? REGIONS_BY_SLOT[slot] ?? [] : []),
    [slot],
  );

  // 카드 = 중분류로 필터(‘전체’면 슬롯 룩 전부).
  const defs = useMemo(
    () =>
      midCat === ALL
        ? slotDefs
        : slotDefs.filter(d => defKeys.get(d.id)?.has(midCat)),
    [slotDefs, midCat, defKeys],
  );

  // 부위(슬롯) 뷰 상태 — 전체 탭에선 계산 안 함.
  const regions = slot ? slotRegionNodes(tree, slot) : [];
  const single = regions.length === 1 ? regions[0] : null;
  const activeRef = single?.ref ?? null;
  const empty = regions.length === 0;
  const showCustom = !empty && activeRef == null; // 커스텀 또는 다중 region

  const choose = (defId: string | null) => {
    if (slot) onChangeTree(setSlotRegion(tree, library, slot, defId));
  };

  // 카테고리 표시 2종: 내용물 있음(밝은 텍스트) / 수정됨(● 도트).
  const hasContent = (c: Cat): boolean =>
    c === ALL
      ? SLOT_ORDER.some(s => slotRegionNodes(tree, s).length > 0)
      : slotRegionNodes(tree, c).length > 0;
  const catDirty = (c: Cat): boolean =>
    c === ALL ? dirty : slotRegionNodes(tree, c).some(n => n.dirty);

  const headerBar = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.collapseBtn}
        onPress={() => setCollapsed(v => !v)}>
        <Text style={styles.collapseBtnText}>{collapsed ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        기본 메이크업
      </Text>
    </View>
  );

  if (!hideHeader && collapsed) {
    return <View style={styles.panel}>{headerBar}</View>;
  }

  return (
    <View style={styles.panel}>
      {!hideHeader && headerBar}

      {/* 0) 대분류(슬롯) 탭 — 밑줄 탭. 내용물=밝은 텍스트, 선택=로즈+밑줄, 수정=● */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catRow}>
        {CATS.map(c => {
          const on = c === cat;
          const filled = hasContent(c);
          const dot = catDirty(c);
          return (
            <TouchableOpacity
              key={c}
              onPress={() => selectCat(c)}
              style={styles.catTab}>
              <Text
                style={[
                  styles.catTabText,
                  filled && styles.catTabTextFilled,
                  on && styles.catTabTextOn,
                ]}
                numberOfLines={1}>
                {catLabel(c)}
                {dot ? ' *' : ''}
              </Text>
              <View style={[styles.catUnderline, on && styles.catUnderlineOn]} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 0.5) 중분류(세부부위) 탭 — 슬롯의 세부부위 전부(룩 없어도 카테고리로 노출).
              세부부위가 2개 이상인 슬롯에서만(1개면 '전체'와 중복). */}
      {midCats.length >= 2 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.midRow}>
          {([ALL, ...midCats.map(rd => rd.key)] as MidCat[]).map(key => {
            const on = key === midCat;
            const label = key === ALL ? ALL : midLabelOf(REGION_MAP[key].label);
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setMidCat(key)}
                style={styles.midTab}>
                <Text
                  style={[styles.midTabText, on && styles.midTabTextOn]}
                  numberOfLines={1}>
                  {label}
                </Text>
                <View style={[styles.midUnderline, on && styles.midUnderlineOn]} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* 필터 저장 버튼은 공유 헤더(농도 슬라이더 오른쪽)로 이동 — App.tsx panelHeader. */}

      {/* 1) 카드 캐러셀 — 한 줄 가로 스크롤. 전체=전체룩 카드, 슬롯=부위 스타일 카드 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.cardScroll}
        contentContainerStyle={styles.cardRow}>
        <View style={styles.cardGrid}>
          {isAll
            ? lookChips.map(chip => {
                const on = chip.id === lookSelectedId;
                return (
                  <TouchableOpacity
                    key={chip.id}
                    onPress={() => onSelectLook(chip.id)}
                    onLongPress={
                      chip.mine && onLongPressLook
                        ? () => onLongPressLook(chip.id)
                        : undefined
                    }
                    style={[styles.card, styles.cardTintLook, on && styles.cardOn]}>
                    <View style={styles.cardLabelBar}>
                      <Text style={styles.cardLabel} numberOfLines={2}>
                        {chip.mine ? '◈ ' : ''}
                        {chip.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            : (
              <>
                <TouchableOpacity
                  onPress={() => choose(null)}
                  style={[styles.card, styles.cardTintNone, empty && styles.cardOn]}>
                  <View style={styles.cardLabelBar}>
                    <Text style={styles.cardLabel} numberOfLines={2}>
                      없음
                    </Text>
                  </View>
                </TouchableOpacity>
                {showCustom && (
                  <View style={[styles.card, styles.cardTintMine, styles.cardOn]}>
                    <View style={styles.cardLabelBar}>
                      <Text style={styles.cardLabel} numberOfLines={2}>
                        ◈ 내 조합
                      </Text>
                    </View>
                  </View>
                )}
                {defs.map(def => {
                  const on = def.id === activeRef;
                  const color = defSwatchColor(library, def.id) ?? '#666666';
                  return (
                    <TouchableOpacity
                      key={def.id}
                      onPress={() => choose(def.id)}
                      style={[styles.card, {backgroundColor: color}, on && styles.cardOn]}>
                      <View style={styles.cardLabelBar}>
                        <Text style={styles.cardLabel} numberOfLines={2}>
                          {def.owner === 'user' ? '◈ ' : ''}
                          {def.name}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
        </View>
      </ScrollView>

      {/* 2) 농도 슬라이더 — 룩카드 바로 아래(간격 최소). 카테고리별 라우팅: '전체'=
          전역 농도(opacity), 슬롯 카테고리=그 슬롯 부위만(slotGain). 둘 다 비파괴
          배수(원본 트리 유지, 전송 시 스케일) — 0으로 내렸다 올려도 원본 강도 복구. */}
      <View style={styles.densityWrap}>
        <ParamSlider
          label={isAll ? '전체 농도' : `${catLabel(cat)} 농도`}
          value={isAll ? opacity : slotGain[slot!] ?? 1}
          onChange={isAll ? onOpacity : v => onSlotGain(slot!, v)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 배경·마진·모서리는 상위 paramPanel(App)이 소유 — 본문은 패딩·gap만.
  panel: {
    paddingHorizontal: 12,
    paddingTop: 0,
    paddingBottom: 8,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
  // 대분류 탭 — 심플한 밑줄 탭(배경 없음). 기본=흐림, 내용물=밝게, 선택=로즈+밑줄.
  catRow: {
    gap: 14,
    alignItems: 'flex-end',
  },
  catTab: {
    alignItems: 'center',
    gap: 2, // 텍스트↔밑줄 간격(중분류·보정 모드와 통일)
  },
  catTabText: {
    color: 'rgba(255,255,255,0.45)', // 기본(내용 없음) = 흐림
    fontSize: 13, // 중분류 탭과 동일 크기(위계는 굵기·밑줄로만 구분)
    lineHeight: 17, // 고정 — 굵기(600→800)가 텍스트 박스 높이를 바꿔 탭이 들쭉날쭉해지는 것 방지
    includeFontPadding: false, // Android 글리프 여백 제거(iOS 무시) — 정렬 일관성
    textAlignVertical: 'center',
    fontWeight: '600',
  },
  catTabTextFilled: {
    color: 'rgba(255,255,255,0.92)', // 내용 있음 = 밝은 텍스트
  },
  catTabTextOn: {
    color: ROSE, // 선택됨 = 로즈
    fontWeight: '800',
  },
  catUnderline: {
    height: 2,
    width: 22, // 대분류·중분류 밑줄 크기 통일 + 조금 더 길게
    borderRadius: 1,
    backgroundColor: 'transparent', // 레이아웃 안정용 항상 자리 차지
  },
  catUnderlineOn: {
    backgroundColor: ROSE,
  },
  // 중분류 탭 — 더 작은 밑줄 탭. 대분류와 위계 구분.
  midRow: {
    gap: 12,
    alignItems: 'flex-end',
    paddingLeft: 2,
  },
  midTab: {
    alignItems: 'center',
    gap: 2, // 대분류 탭(catTab)과 동일 — 텍스트↔밑줄 간격 통일
  },
  midTabText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13, // 대분류 탭과 동일 크기
    lineHeight: 17, // 고정 — 선택 시 굵기(600→700)로 박스가 커져 탭이 위아래로 튀는 것 방지
    includeFontPadding: false, // Android 글리프 여백 제거(iOS 무시) — 정렬 일관성
    textAlignVertical: 'center',
    fontWeight: '600',
  },
  midTabTextOn: {
    color: ROSE,
    fontWeight: '700',
  },
  midUnderline: {
    height: 2, // 대분류와 동일 두께(기존 1.5 → 2)
    width: 22, // 대분류와 동일 길이
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  midUnderlineOn: {
    backgroundColor: ROSE,
  },
  // 카드형 룩 칩
  cardScroll: {
    height: CARD_H + 8, // 카드 한 줄 높이로 고정 — 세로 확장 막아 아래 농도 슬라이더 보장
    flexGrow: 0,
  },
  // 카드↔농도 슬라이더 간격 축소(panel gap 6 상쇄).
  densityWrap: {
    marginTop: -6,
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
  card: {
    width: CARD_W,
    aspectRatio: 5 / 6, // 카드 전체가 세로형 썸네일(가로5:세로6).
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end', // 라벨 바를 하단에
    // 비선택 카드는 테두리 없음(투명 1px = 자리만 유지) — 선택만 시그니처색 테두리.
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardOn: {
    borderColor: ROSE,
    borderWidth: 2,
  },
  cardTintLook: {
    backgroundColor: 'rgba(255,126,157,0.35)',
  },
  cardTintNone: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardTintMine: {
    backgroundColor: '#C9A15E',
  },
  cardLabelBar: {
    width: '100%',
    paddingVertical: 3,
    paddingHorizontal: 2,
    backgroundColor: 'rgba(0,0,0,0.5)', // 스크림 — 어떤 썸네일 위에도 텍스트 가독
  },
  cardLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
