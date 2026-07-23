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
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ParamSlider from './ParamSlider';
import type {LaneChip} from './LaneRow';
import {
  AR_BLUSH_COLORS,
  AR_BLUSH_SHAPES,
  arBlushIntensityFromSlider,
  getArBlushColorByHex,
  normalizeArBlushIntensity,
} from '../../../../../shared/contracts/arBlushCatalog';
import {REGION_GROUPS, REGION_MAP} from '../composer/regions';
import type {RegionDef, RegionKey} from '../composer/regions';
import {BROW_COLORS} from '../presets';
import {
  patchBlushTree,
  readBlushTree,
  removeBlushTree,
} from '../composer/blushTree';
import {
  BROW_REFERENCE_SHAPES,
  patchBrowTree,
  readBrowTree,
  removeBrowTree,
} from '../composer/browTree';
import {patchTeethTree, readTeethTree} from '../composer/teethTree';
import {
  defSwatchColor,
  regionDefsForSlot,
  setSlotRegion,
  setSubRegion,
  slotRegionNodes,
  subDefsForRegion,
  subRegionNode,
  SLOT_LABEL,
  SLOT_ORDER,
} from '../composer/lookTree';
import type {LookLibrary, LookNode, SlotKey} from '../composer/lookTree';
import {
  GOLD,
  NEUTRAL_ACCENT,
  PANEL_INSET,
  SP,
  compositeOverWhite,
  labelTextOn,
} from '../theme';

// 카드 = 5:6 세로형 썸네일, 한 줄 가로 스크롤(캐러셀). 한 화면에 ~6장 보이게 폭 산정.
const CARD_W = Math.floor((Dimensions.get('window').width - 48) / 6);
const CARD_H = Math.round((CARD_W * 6) / 5); // 5:6 → 카드 높이(캐러셀 고정 높이용)
const BLUSH_COLOR_CARD_W = Math.max(44, CARD_W - 10);
const BLUSH_COLOR_CARD_H = 44;
const BLUSH_SHAPE_ATLAS = require('../assets/blush-shape-atlas-v1.png') as number;
const BLUSH_SHAPE_ATLAS_COLUMNS = 4;
const BLUSH_SHAPE_CELL_W = CARD_W - 4;
// 생성 아틀라스는 전체 3:4, 4×2 셀이므로 셀 하나는 3:8 비율이다.
const BLUSH_SHAPE_CELL_H = (BLUSH_SHAPE_CELL_W * 8) / 3;
const BLUSH_SHAPE_PREVIEW_H = CARD_H - 4;
const BLUSH_SHAPE_CROP_TOP = BLUSH_SHAPE_CELL_W * 0.34;
const BROW_SHAPE_GLYPHS = ['━', '⌁', '⌒', '⌃', '◠'] as const;
const BROW_COLOR_LABELS = [
  '딥 브라운',
  '다크 브라운',
  '내추럴 브라운',
  '애쉬 브라운',
  '웜 브라운',
  '토프 브라운',
  '라이트 브라운',
  '퍼플',
  '와인',
  '옐로우',
  '핑크',
] as const;
const ALL = '전체' as const;
// 내 핏(A13) 카테고리 — 슬롯이 아닌 특수 탭. 카드=핏 시트(원본/분석 맞춤/◈사용자),
// 선택=메인 핏 지정(App mainFitId). 룩과 독립인 "내 얼굴 프로필" 축이라 맨 뒤에 둔다.
const FIT = '핏' as const;
type Cat = typeof ALL | typeof FIT | SlotKey;
// 카테고리 표시 라벨 — 내부 키와 화면 표기 분리('컨투어'→'윤곽' 등). '전체'는 그대로.
const catLabel = (c: Cat): string => (c === ALL || c === FIT ? c : SLOT_LABEL[c]);
type MidCat = typeof ALL | RegionKey;
const CATS: Cat[] = [ALL, ...SLOT_ORDER, FIT];

// 슬롯 → 세부부위 정의(카탈로그 순서). 중분류 탭 후보의 단일 출처.
const REGIONS_BY_SLOT: Record<string, RegionDef[]> = {};
for (const g of REGION_GROUPS) {
  REGIONS_BY_SLOT[g.slot] = [...(REGIONS_BY_SLOT[g.slot] ?? []), ...g.regions];
}

// 중분류 탭 라벨 — '톤 조정 베이스'류 장황한 접미사만 걷어낸다(톤·질감).
const midLabelOf = (label: string): string => label.replace(/ 조정 베이스$/, '');

// 스와치 카드 라벨 색 — 카드 배경(defSwatchColor)이 임의 제품색이라 그림자로
// 억지 가독을 만드는 대신, 라벨 바의 반투명 회색조(0.1)를 실제로 합성한 색의
// 휘도로 밝은/어두운 텍스트를 고른다(GuideMode ZONE_TEXT와 동일 판정 로직).
const swatchLabelColor = (color: string): string =>
  labelTextOn(compositeOverWhite(color, 0.1));

function BlushShapePreview({index}: {index: number}) {
  const column = index % BLUSH_SHAPE_ATLAS_COLUMNS;
  const row = Math.floor(index / BLUSH_SHAPE_ATLAS_COLUMNS);

  return (
    <View style={styles.blushShapePreview}>
      <Image
        accessibilityIgnoresInvertColors
        source={BLUSH_SHAPE_ATLAS}
        resizeMode="stretch"
        style={[
          styles.blushShapeAtlas,
          {
            left: -column * BLUSH_SHAPE_CELL_W,
            top: -(row * BLUSH_SHAPE_CELL_H + BLUSH_SHAPE_CROP_TOP),
          },
        ]}
      />
    </View>
  );
}

const blushShapeCardLabel = (id: string, label: string): string => {
  if (id === 'sun-kissed-soft') return '소프트';
  if (id === 'sun-kissed-band') return '밴드';
  return label;
};

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
  // ── 내 핏(A13) — '핏' 카테고리 탭 ──
  /** 핏 카드 — [원본]+분석 맞춤 핏+◈사용자 시트 (App fitChips) */
  fitChips: LaneChip[];
  /** 활성 핏 카드 id — mainFitId ?? 'fit-off' */
  fitSelectedId: string;
  /** 핏 카드 선택 — App selectFitSheet(메인 핏 지정, 'fit-off'=해제) */
  onSelectFit: (id: string) => void;
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
  fitChips,
  fitSelectedId,
  onSelectFit,
}: Props) {
  const [cat, setCat] = useState<Cat>(ALL);
  const [midCat, setMidCat] = useState<MidCat>(ALL);
  const [collapsed, setCollapsed] = useState(false);

  const isAll = cat === ALL;
  const isFit = cat === FIT;
  const slot: SlotKey | null = isAll || isFit ? null : cat;

  // 대분류 전환 — 중분류는 항상 '전체'로 리셋(슬롯마다 세부부위가 다르므로).
  const selectCat = (c: Cat) => {
    setCat(c);
    setMidCat(ALL);
  };

  // 세부부위 탭이 선택됐는가('전체'가 아닌 특정 세부부위) — 정본 계층 분기점:
  //   · 세부부위 탭 = 세부부위룩(level:'sub') 목록 → 그 세부부위만 교체(setSubRegion)
  //   · '전체' 탭     = 부위(슬롯)룩(level:'region') 목록 → 슬롯 전체 교체(setSlotRegion)
  const isSubTab = !isAll && midCat !== ALL;
  const subRegion: RegionKey | null = isSubTab ? (midCat as RegionKey) : null;
  const isBlushTab = subRegion === 'blush';
  const isBrowTab = subRegion === 'brow';
  const blushState = useMemo(() => readBlushTree(tree), [tree]);
  const browState = useMemo(() => readBrowTree(tree), [tree]);
  // 치아 미백 — 세부부위에 강도 한 축만 있어 슬롯 게인('립 농도')으로는 조절이 안 됐다.
  // 치아 서브탭에서는 아래 농도 슬라이더를 teethWhitenIntensity에 직접 연결한다(#치아 QA).
  const isTeethTab = subRegion === 'teeth';
  const teethState = useMemo(() => readTeethTree(tree), [tree]);
  const changeTeethIntensity = (v: number) =>
    onChangeTree(patchTeethTree(tree, library, v));

  // '전체' 탭 카드 — 이 슬롯의 부위(슬롯)룩 전부(시스템+사용자).
  const slotDefs = useMemo(
    () => (slot ? regionDefsForSlot(library, slot) : []),
    [library, slot],
  );

  // 중분류 후보 — 이 슬롯의 세부부위 전부(룩이 없어도 카테고리로 노출해 구조를 드러냄).
  const midCats = useMemo(
    () =>
      slot === '눈썹'
        ? [REGION_MAP.browConceal, REGION_MAP.brow]
        : slot
          ? REGIONS_BY_SLOT[slot] ?? []
          : [],
    [slot],
  );

  // 세부부위 탭 카드 — 그 세부부위의 세부부위룩(level:'sub')만. 슬롯룩이 '포함'
  //  관계로 세부부위 탭에 중복 노출되던 버그를 계층 준수로 대체(정본 분류체계).
  const subDefs = useMemo(
    () => (subRegion ? subDefsForRegion(library, subRegion) : []),
    [library, subRegion],
  );

  // 부위(슬롯) 뷰 상태 — '전체' 탭에서 슬롯 전체 교체의 활성/비움 판정.
  const regions = slot ? slotRegionNodes(tree, slot) : [];
  const single = regions.length === 1 ? regions[0] : null;
  const activeRef = single && !single.dirty ? single.ref : null;
  const empty = regions.length === 0;
  const showCustom = !empty && activeRef == null; // 커스텀 또는 다중 region

  // 세부부위 뷰 상태 — 그 세부부위를 소유한 sub 노드 기준(다른 세부부위와 독립).
  const activeSub =
    slot && subRegion ? subRegionNode(tree, slot, subRegion) : null;
  const activeSubRef = activeSub && !activeSub.dirty ? activeSub.ref : null;
  const subEmpty = isSubTab && activeSub == null; // 이 세부부위 비어 있음
  const subCustom = activeSub != null && activeSubRef == null; // 커스텀 sub

  // '전체' 탭 = 슬롯 전체 교체. 세부부위 탭 = 그 세부부위만 교체(나머지 보존).
  const choose = (defId: string | null) => {
    if (slot) onChangeTree(setSlotRegion(tree, library, slot, defId));
  };
  const chooseSub = (subDefId: string | null) => {
    if (!slot || !subRegion) return;
    let next = setSubRegion(tree, library, slot, subRegion, subDefId);
    // 메인립 ↔ 그라데이션은 상호배타 — 둘 다 입술 메인 색을 칠하는 모드라 동시에 못 쌓는다.
    // 하나를 켜면(subDefId != null) 다른 하나를 끈다. 베이스립·립라이너·립글로스·치아는
    // 서로 독립이라 그대로 레이어로 공존한다.
    if (subDefId != null) {
      if (subRegion === 'lipGradient') {
        next = setSubRegion(next, library, slot, 'lip', null);
      } else if (subRegion === 'lip') {
        next = setSubRegion(next, library, slot, 'lipGradient', null);
      }
    }
    onChangeTree(next);
  };
  const chooseBlushShape = (shapeValue: number | null) => {
    onChangeTree(
      shapeValue === null
        ? removeBlushTree(tree, library)
        : patchBlushTree(tree, library, {shapeValue}),
    );
  };
  const chooseBlushColor = (color: string) => {
    onChangeTree(patchBlushTree(tree, library, {color}));
  };
  const changeBlushIntensity = (normalized: number) => {
    onChangeTree(
      patchBlushTree(tree, library, {
        intensity: arBlushIntensityFromSlider(normalized),
      }),
    );
  };
  const chooseBrowShape = (shapeValue: number | null) => {
    onChangeTree(
      shapeValue === null
        ? removeBrowTree(tree, library)
        : patchBrowTree(tree, library, {shapeValue}),
    );
  };
  const chooseBrowColor = (color: string) => {
    onChangeTree(patchBrowTree(tree, library, {color}));
  };

  // 카테고리 표시 2종: 내용물 있음(밝은 텍스트) / 수정됨(● 도트).
  // '핏'은 룩 트리가 아니라 메인 핏 선택 여부가 내용물(수정 표시는 없음 — 시트 편집은
  // 스튜디오/핏 패널 소관).
  const hasContent = (c: Cat): boolean =>
    c === ALL
      ? SLOT_ORDER.some(s => slotRegionNodes(tree, s).length > 0)
      : c === FIT
        ? fitSelectedId !== 'fit-off'
        : slotRegionNodes(tree, c).length > 0;
  const catDirty = (c: Cat): boolean =>
    c === ALL
      ? dirty
      : c === FIT
        ? false
        : slotRegionNodes(tree, c).some(n => n.dirty);

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

      {/* 0) 대분류(슬롯) 탭 — 밑줄 탭. 내용물=밝은 텍스트, 선택=흰색+밑줄, 수정=● */}
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
            const label =
              key === ALL
                ? ALL
                : slot === '눈썹' && key === 'brow'
                  ? '눈썹'
                  : midLabelOf(REGION_MAP[key].label);
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

      {/* 1) 카드 캐러셀 — 블러셔·눈썹은 모양/색상을 독립 축으로 노출한다. */}
      {isBrowTab ? (
        <View style={styles.browAxes}>
          <View style={styles.axisHeadingRow}>
            <Text style={styles.axisHeading}>눈썹 모양</Text>
            <Text style={styles.axisHint}>선택 즉시 얼굴에 적용돼요</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.browShapeAxisScroll}
            contentContainerStyle={styles.cardRow}>
            <View style={styles.cardGrid}>
              <TouchableOpacity
                accessibilityLabel="눈썹 필터 없음"
                accessibilityRole="button"
                accessibilityState={{selected: !browState.enabled}}
                testID="basic-brow-shape-none"
                onPress={() => chooseBrowShape(null)}
                style={[
                  styles.card,
                  styles.browShapeCard,
                  styles.cardTintNone,
                  !browState.enabled && styles.cardOn,
                ]}>
                <View style={styles.browShapePreview}>
                  <View style={styles.browShapeNoneLine} />
                </View>
                <View style={styles.cardLabelBar}>
                  <Text style={styles.cardLabel} numberOfLines={1}>
                    없음
                  </Text>
                </View>
              </TouchableOpacity>
              {BROW_REFERENCE_SHAPES.map((shape, index) => {
                const on =
                  browState.enabled && browState.shapeValue === shape.value;
                return (
                  <TouchableOpacity
                    accessibilityLabel={`${shape.label} 눈썹 모양`}
                    accessibilityRole="button"
                    accessibilityState={{selected: on}}
                    testID={`basic-brow-shape-${shape.value}`}
                    key={shape.value}
                    onPress={() => chooseBrowShape(shape.value)}
                    style={[
                      styles.card,
                      styles.browShapeCard,
                      styles.cardTintShape,
                      on && styles.cardOn,
                    ]}>
                    <View style={styles.browShapePreview}>
                      <Text
                        style={[
                          styles.browShapeGlyph,
                          index === 1 && styles.browShapeGlyphStraight,
                        ]}>
                        {BROW_SHAPE_GLYPHS[index]}
                      </Text>
                    </View>
                    <View style={styles.cardLabelBar}>
                      <Text style={styles.cardLabel} numberOfLines={1}>
                        {shape.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <Text style={styles.axisHeading}>눈썹 색상</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.browColorAxisScroll}
            contentContainerStyle={styles.browColorRow}>
            <View style={styles.cardGrid}>
              {BROW_COLORS.map((color, index) => {
                const on =
                  browState.enabled &&
                  browState.color.toUpperCase() === color.toUpperCase();
                return (
                  <TouchableOpacity
                    accessibilityLabel={`${BROW_COLOR_LABELS[index]} 눈썹 색상`}
                    accessibilityRole="button"
                    accessibilityState={{selected: on}}
                    testID={`basic-brow-color-${index}`}
                    key={color}
                    onPress={() => chooseBrowColor(color)}
                    style={[
                      styles.browColorCard,
                      {backgroundColor: color},
                      on && styles.cardOn,
                    ]}>
                    <Text
                      style={[
                        styles.browColorLabel,
                        {color: swatchLabelColor(color)},
                      ]}
                      numberOfLines={2}>
                      {BROW_COLOR_LABELS[index]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : isBlushTab ? (
        <View style={styles.blushAxes}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.blushAxisScroll}
            contentContainerStyle={styles.cardRow}>
            <View style={styles.cardGrid}>
              <TouchableOpacity
                accessibilityLabel="블러셔 없음"
                accessibilityRole="button"
                accessibilityState={{selected: !blushState.enabled}}
                testID="basic-blush-shape-none"
                onPress={() => chooseBlushShape(null)}
                style={[
                  styles.card,
                  styles.blushShapeCard,
                  styles.cardTintNone,
                  !blushState.enabled && styles.cardOn,
                ]}>
                <View style={styles.blushShapeNoneMark}>
                  <View style={styles.blushShapeNoneLine} />
                </View>
                <View style={[styles.cardLabelBar, styles.blushShapeLabelBar]}>
                  <Text
                    style={[styles.cardLabel, styles.blushShapeLabel]}
                    numberOfLines={1}>
                    없음
                  </Text>
                </View>
              </TouchableOpacity>
              {AR_BLUSH_SHAPES.map(shape => {
                const on =
                  blushState.enabled && blushState.shapeValue === shape.value;
                return (
                  <TouchableOpacity
                    accessibilityLabel={`${shape.label} 블러셔 모양`}
                    accessibilityRole="button"
                    accessibilityState={{selected: on}}
                    testID={`basic-blush-shape-${shape.id}`}
                    key={shape.id}
                    onPress={() => chooseBlushShape(shape.value)}
                    style={[
                      styles.card,
                      styles.blushShapeCard,
                      styles.cardTintShape,
                      on && styles.cardOn,
                    ]}>
                    <BlushShapePreview index={shape.value} />
                    <View style={[styles.cardLabelBar, styles.blushShapeLabelBar]}>
                      <Text
                        style={[styles.cardLabel, styles.blushShapeLabel]}
                        numberOfLines={1}>
                        {blushShapeCardLabel(shape.id, shape.label)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.blushColorAxisScroll}
            contentContainerStyle={styles.blushColorRow}>
            <View style={styles.cardGrid}>
              {AR_BLUSH_COLORS.map(color => {
                const on =
                  blushState.enabled &&
                  getArBlushColorByHex(blushState.color)?.id === color.id;
                return (
                  <TouchableOpacity
                    accessibilityLabel={`${color.label} 블러셔 색상`}
                    accessibilityRole="button"
                    accessibilityState={{selected: on}}
                    testID={`basic-blush-color-${color.id}`}
                    key={color.id}
                    onPress={() => chooseBlushColor(color.hex)}
                    style={[
                      styles.card,
                      styles.blushColorCard,
                      {backgroundColor: color.hex},
                      on && styles.cardOn,
                    ]}>
                    <View style={[styles.cardLabelBar, styles.blushColorLabelBar]}>
                      <Text
                        style={[
                          styles.cardLabel,
                          styles.blushColorLabel,
                          {color: swatchLabelColor(color.hex)},
                        ]}
                        numberOfLines={2}>
                        {color.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cardScroll}
          contentContainerStyle={styles.cardRow}>
          <View style={styles.cardGrid}>
          {isFit
            ? fitChips.map(chip => {
                const on = chip.id === fitSelectedId;
                return (
                  <TouchableOpacity
                    key={chip.id}
                    onPress={() => onSelectFit(chip.id)}
                    style={[
                      styles.card,
                      chip.id === 'fit-off'
                        ? styles.cardTintNone
                        : chip.mine
                          ? styles.cardTintMine
                          : styles.cardTintLook,
                      on && styles.cardOn,
                    ]}>
                    <View style={styles.cardLabelBar}>
                      <Text style={styles.cardLabel} numberOfLines={2}>
                        {chip.mine ? '◈ ' : ''}
                        {chip.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            : isAll
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
            : isSubTab ? (
              // 세부부위 탭 — 그 세부부위의 세부부위룩(level:'sub')만. 선택은
              // setSubRegion(그 세부부위만 교체, 다른 세부부위 보존).
              <>
                <TouchableOpacity
                  onPress={() => chooseSub(null)}
                  style={[styles.card, styles.cardTintNone, subEmpty && styles.cardOn]}>
                  <View style={styles.cardLabelBar}>
                    <Text style={styles.cardLabel} numberOfLines={2}>
                      없음
                    </Text>
                  </View>
                </TouchableOpacity>
                {/* '◈ 내 조합'(subCustom) 카드는 세부부위 탭에선 노출하지 않는다 — 메인립·
                    베이스·라이너·글로스는 각자 레이어로 쌓는 축이라, 세부부위 탭엔 그 부위
                    프리셋만 두고 여러 레이어가 합쳐진 '조합'은 상위 '전체' 탭(showCustom)에만
                    보인다(#메인립 조합 QA). subCustom은 여전히 트리에 반영되어 렌더된다. */}
                {subDefs.map(def => {
                  const on = def.id === activeSubRef;
                  const color = defSwatchColor(library, def.id) ?? '#666666';
                  return (
                    <TouchableOpacity
                      key={def.id}
                      onPress={() => chooseSub(def.id)}
                      style={[styles.card, {backgroundColor: color}, on && styles.cardOn]}>
                      <View style={styles.cardLabelBar}>
                        <Text
                          style={[styles.cardLabel, {color: swatchLabelColor(color)}]}
                          numberOfLines={2}>
                          {def.owner === 'user' ? '◈ ' : ''}
                          {def.name}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              // '전체' 탭 — 부위(슬롯)룩(level:'region'). 선택은 슬롯 전체 교체.
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
                {slotDefs.map(def => {
                  const on = def.id === activeRef;
                  const color = defSwatchColor(library, def.id) ?? '#666666';
                  return (
                    <TouchableOpacity
                      key={def.id}
                      onPress={() => choose(def.id)}
                      style={[styles.card, {backgroundColor: color}, on && styles.cardOn]}>
                      <View style={styles.cardLabelBar}>
                        <Text
                          style={[styles.cardLabel, {color: swatchLabelColor(color)}]}
                          numberOfLines={2}>
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
      )}

      {/* 핏 탭 — 강도 축이 없어 농도 슬라이더 대신, 시트가 없으면 측정 유도 문구만. */}
      {isFit && fitChips.length <= 1 && (
        <Text style={styles.fitEmptyHint}>
          얼굴측정을 하면 ‘분석 맞춤 핏’이 여기에 생겨요
        </Text>
      )}

      {/* 2) 농도 — 블러셔 중분류는 잎 값을 직접 저장하고, 나머지는 기존 게인을 쓴다. */}
      {!isFit && (
      <View style={styles.densityWrap}>
        <ParamSlider
          label={
            isAll ? '전체 농도' : isTeethTab ? '치아 미백' : `${catLabel(cat)} 농도`
          }
          value={
            isBlushTab
              ? normalizeArBlushIntensity(blushState.intensity)
              : isTeethTab
                ? teethState.intensity
                : isAll
                  ? opacity
                  : slotGain[slot!] ?? 1
          }
          onChange={
            isBlushTab
              ? changeBlushIntensity
              : isTeethTab
                ? changeTeethIntensity
                : isAll
                  ? onOpacity
                  : v => onSlotGain(slot!, v)
          }
          accessibilityLabel={isBlushTab ? '블러셔 윤곽 농도' : undefined}
          accessibilityValue={
            isBlushTab
              ? {
                  min: 0,
                  max: 100,
                  now: Math.round(
                    normalizeArBlushIntensity(blushState.intensity) * 100,
                  ),
                }
              : undefined
          }
          accent={NEUTRAL_ACCENT}
        />
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 핏 탭 빈 상태 안내 — 시트 0장일 때 원본 카드 아래 한 줄(측정 유도).
  fitEmptyHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
  },
  // 배경·마진·모서리는 상위 paramPanel(App)이 소유 — 본문은 패딩·gap만.
  panel: {
    paddingHorizontal: PANEL_INSET,
    paddingTop: 0,
    paddingBottom: SP.sm,
    gap: SP.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
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
  // 대분류 탭 — 심플한 밑줄 탭(배경 없음). 기본=흐림, 내용물=밝게, 선택=흰색+밑줄(무채색 통일).
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
    color: '#FFFFFF', // 선택됨 = 흰색(무채색, 카드 선택 테두리와 통일)
    fontWeight: '800',
  },
  catUnderline: {
    height: 2,
    width: 22, // 대분류·중분류 밑줄 크기 통일 + 조금 더 길게
    borderRadius: 1,
    backgroundColor: 'transparent', // 레이아웃 안정용 항상 자리 차지
  },
  catUnderlineOn: {
    backgroundColor: '#FFFFFF',
  },
  // 중분류 탭 — 더 작은 밑줄 탭. 대분류와 위계 구분.
  // 좌측 시작점을 대분류 탭(catRow)과 같은 선에 맞춘다(구 paddingLeft 2 제거).
  midRow: {
    gap: 12,
    alignItems: 'flex-end',
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
    color: '#FFFFFF',
    fontWeight: '700',
  },
  midUnderline: {
    height: 2, // 대분류와 동일 두께(기존 1.5 → 2)
    width: 22, // 대분류와 동일 길이
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  midUnderlineOn: {
    backgroundColor: '#FFFFFF',
  },
  // 카드형 룩 칩
  cardScroll: {
    height: CARD_H + 8, // 카드 한 줄 높이로 고정 — 세로 확장 막아 아래 농도 슬라이더 보장
    flexGrow: 0,
  },
  blushAxes: {
    gap: 0,
  },
  browAxes: {
    gap: 4,
  },
  axisHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  axisHeading: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  axisHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '500',
  },
  browShapeAxisScroll: {
    height: CARD_H + 6,
    flexGrow: 0,
  },
  browShapeCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  browShapePreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browShapeGlyph: {
    color: '#3A2A20',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
    transform: [{scaleX: 1.25}],
  },
  browShapeGlyphStraight: {
    transform: [{scaleX: 1.45}, {scaleY: 0.7}],
  },
  browShapeNoneLine: {
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
    transform: [{rotate: '-38deg'}],
  },
  browColorAxisScroll: {
    height: 48,
    flexGrow: 0,
  },
  browColorRow: {
    paddingVertical: 1,
  },
  browColorCard: {
    width: Math.max(54, CARD_W),
    height: 44,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  browColorLabel: {
    width: '100%',
    minHeight: 20,
    paddingHorizontal: 3,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  blushAxisScroll: {
    height: CARD_H + 6,
    flexGrow: 0,
  },
  blushColorAxisScroll: {
    height: BLUSH_COLOR_CARD_H + 4,
    flexGrow: 0,
  },
  blushColorRow: {
    paddingTop: 1,
    paddingBottom: 1,
  },
  // 카드↔농도 슬라이더 간격 축소(panel gap 상쇄).
  densityWrap: {
    marginTop: -SP.sm,
  },
  cardRow: {
    paddingVertical: 2,
  },
  cardGrid: {
    flexDirection: 'row',
    gap: SP.sm,
    alignItems: 'flex-start',
  },
  // 카드 = 5:6 썸네일 한 장(텍스트를 하단에 스크림 얹어 오버레이). 외곽 상자 없음.
  card: {
    width: CARD_W,
    aspectRatio: 5 / 6, // 카드 전체가 세로형 썸네일(가로5:세로6).
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end', // 라벨 바를 하단에
    // 비선택 카드는 테두리 없음(투명 2px = 자리만 유지) — 선택만 시그니처색 테두리.
    // 폭을 선택(2)과 맞춰 두면 라벨 바의 음수 마진(-2)으로 테두리 자리를 정확히 덮어
    // 라벨 바가 카드 가장자리까지 꽉 차게 된다.
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardOn: {
    // 흰색 — 카드 배경이 defSwatchColor 임의색(블루 계열 스와치 위에서 ACCENT 테두리가
    // 묻히는 문제)이라 색 불문 대비가 되는 흰색으로 통일(GuideMode/WarpSheet와 동일).
    borderColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
  },
  blushShapeCard: {
    height: CARD_H,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  blushShapePreview: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: BLUSH_SHAPE_CELL_W,
    height: BLUSH_SHAPE_PREVIEW_H,
    overflow: 'hidden',
    backgroundColor: '#EFE8E2',
  },
  blushShapeAtlas: {
    position: 'absolute',
    width: BLUSH_SHAPE_CELL_W * BLUSH_SHAPE_ATLAS_COLUMNS,
    height: BLUSH_SHAPE_CELL_H * 2,
  },
  blushShapeLabelBar: {
    minHeight: 15,
    paddingVertical: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,18,0.66)',
  },
  blushShapeLabel: {
    fontSize: 8,
    lineHeight: 10,
  },
  blushShapeNoneMark: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    height: BLUSH_SHAPE_PREVIEW_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blushShapeNoneLine: {
    width: 27,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.48)',
    transform: [{rotate: '-38deg'}],
  },
  blushColorCard: {
    width: BLUSH_COLOR_CARD_W,
    height: BLUSH_COLOR_CARD_H,
    borderRadius: 9,
  },
  blushColorLabelBar: {
    minHeight: 17,
    paddingVertical: 1,
    paddingHorizontal: 2,
  },
  blushColorLabel: {
    fontSize: 8,
    lineHeight: 9,
  },
  // '전체' 탭의 완성 룩(LOOK) 카드 틴트 — 선택 표현이 아니라 "이 카드는 완성 룩
  // 타입"이라는 카드 종류 구분색(부위 스와치 카드와 시각적으로 구분). 3라운드 정정:
  // 기본 모드는 세 모드(무채색) 스코프라 ACCENT를 뺐다 — WarpSheet.cardTintFit과
  // 동일값(0.18)으로 통일, cardTintNone(0.06)과는 여전히 구분된다.
  cardTintLook: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  cardTintNone: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardTintShape: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  cardTintMine: {
    backgroundColor: GOLD,
  },
  cardLabelBar: {
    // 카드 테두리(2px) 자리를 음수 마진으로 덮어 좌·우·하단 가장자리까지 꽉 채운다.
    marginHorizontal: -2,
    marginBottom: -2,
    paddingVertical: 3,
    paddingHorizontal: 3, // GuideMode 라벨 바와 통일(기존 2 → 3)
    backgroundColor: 'rgba(255,255,255,0.1)', // 회색조 — GuideMode 라벨 바와 통일(레인 시그니처 제거)
  },
  // 카드 배경은 defSwatchColor 임의색(하이라이터·톤베이스류는 거의 흰색까지 감).
  // 5라운드: 그림자로 억지 가독을 만드는 대신 GuideMode의 ZONE_TEXT와 같은 원리
  // (라벨 텍스트 색 자체를 배경 밝기에 맞춰 전환)로 통일 — 기본색은 '없음'·'내
  // 조합'·완성 룩 카드(전부 어두운 틴트 배경)용, 스와치 카드는 JSX에서
  // swatchLabelColor(color)로 인라인 오버라이드한다.
  cardLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
