/**
 * 스튜디오 허브 (분류체계 §7 A18) — 저작(authoring) 공간.
 *
 * 분리 원칙: "얼굴을 보며 돌리는 조정 = 라이브(카메라 우측 레일) / 목록을 보며
 * 만들고 고르는 저작 = 스튜디오". 라이브가 값을 '움직이는' 곳이라면, 스튜디오는
 * 대상을 '만들고 고르는' 곳이다 — 카메라 화면 위에 뜨는 풀시트 모달.
 *
 * v1 섹션:
 *  ① 내 핏 시트 관리 — '핏 만들기'가 여기로 이관(라이브 레일은 조정 전용).
 *     시트 목록에서 만들기·이름 편집·메인 지정·복제·삭제. 실제 델타 조정은
 *     라이브 레일의 '핏'에서(얼굴을 보며).
 *  ② 에셋 카탈로그 진입 — 기존 임포트 시트를 연다(App 상태 위임).
 *  ③ 제품 만들기(A12) — 채널 4종(base·pearl·glitter·neon) 세부 편집으로 커스텀
 *     제품을 저작한다. 노출 채널은 제품군 템플릿(FAMILY_TEMPLATES)이 정하고, 만든
 *     제품은 컴포저의 제품 칩에 나타난다(브리지엔 컴파일된 커맨드만 넘어감).
 *
 * 상태 모델은 상위(App)가 소유하고 여기서는 순수 편집만 위임한다(onChangeSheets·
 * onChangeProducts).
 */
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { newFitSheet } from '../composer/fitSheets';
import type { FitSheet } from '../composer/fitSheets';
import { FAMILY_TEMPLATES } from '../composer/products';
import type {
  ChannelBase,
  ChannelGlitter,
  ChannelNeon,
  ChannelPearl,
  ProductDef,
  ProductFamily,
} from '../composer/products';
import { FINISHES } from '../composer/regions';
import ParamSlider from './ParamSlider';
import { GOLD, GOLD_LIGHT, TEXT_HINT, TEXT_SUB } from '../theme';

// 베이스 색 스와치 — 부위 무관 중립 8색(제품군을 가리지 않는 공통 팔레트).
const BASE_SWATCHES = [
  '#1A1A1A',
  '#8A6B54',
  '#E0B49A',
  '#C0392B',
  '#E88CA0',
  '#D98BA0',
  '#D9C48A',
  '#F3E3C8',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  sheets: FitSheet[];
  mainId: string | null;
  onChangeSheets: (sheets: FitSheet[], mainId: string | null) => void;
  /** 핏 조정 진입 — 스튜디오를 닫고 카메라 위 핏 패널을 그 시트로 연다(레일 버튼 폐지). */
  onAdjustFit: (sheetId: string) => void;
  /** 에셋 카탈로그 임포트 시트 열기(기존 App 상태) */
  onOpenCatalogImport: () => void;
  /** 사용자 제작 제품(§5 A12) — 상태는 상위 소유 */
  userProducts: ProductDef[];
  onChangeProducts: (products: ProductDef[]) => void;
}

export default function StudioHub({
  visible,
  onClose,
  sheets,
  mainId,
  onChangeSheets,
  onAdjustFit,
  onOpenCatalogImport,
  userProducts,
  onChangeProducts,
}: Props) {
  // 접기 — 헤더만 남기고 본문을 감춰 뒤(카메라)를 확인. 닫기와 달리 상태 유지.
  const [collapsed, setCollapsed] = useState(false);
  // 선택된 시트만 액션 패널(이름 편집·메인·복제·삭제)을 펼친다.
  const [selectedId, setSelectedId] = useState<string | null>(
    mainId ?? sheets[0]?.id ?? null,
  );
  // 제품 편집 — 선택 제품 1개만 폼을 펼친다. picking=제품군 픽커 노출.
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // ── 시트 CRUD — 상태는 상위 소유, 여기서는 불변 변형만 위임 ──────────────
  const rename = (id: string, name: string) =>
    onChangeSheets(
      sheets.map(s => (s.id === id ? { ...s, name } : s)),
      mainId,
    );

  const setMain = (id: string) => onChangeSheets(sheets, id);

  const addSheet = () => {
    const s = newFitSheet(`내 핏 ${sheets.length + 1}`);
    // 첫 시트는 곧바로 메인 — "만들었는데 적용이 안 돼요"를 방지(FitSheetPanel 규약).
    onChangeSheets([...sheets, s], mainId ?? s.id);
    setSelectedId(s.id);
  };

  const duplicate = (sheet: FitSheet) => {
    const copy = newFitSheet(`${sheet.name} 복사`);
    // 항목은 깊게 복제(rules 별도 사본) — 원본과 공유 방지.
    copy.entries = sheet.entries.map(e => ({
      ...e,
      ...(e.rules ? { rules: { ...e.rules } } : {}),
    }));
    onChangeSheets([...sheets, copy], mainId);
    setSelectedId(copy.id);
  };

  const deleteSheet = (sheet: FitSheet) => {
    // FitSheetPanel.deleteSheet 로직: 메인을 지우면 나머지 첫 장으로, 마지막 장이면 null.
    const rest = sheets.filter(s => s.id !== sheet.id);
    const nextMain = mainId === sheet.id ? rest[0]?.id ?? null : mainId;
    onChangeSheets(rest, nextMain);
    setSelectedId(nextMain ?? rest[0]?.id ?? null);
  };

  // ── 제품 CRUD — 템플릿 시드로 생성, 채널 슬롯별 인라인 편집 ────────────────
  const patchProduct = (id: string, patch: Partial<ProductDef>) =>
    onChangeProducts(
      userProducts.map(p => (p.id === id ? { ...p, ...patch } : p)),
    );

  // 새 제품 — 제품군 템플릿의 노출 슬롯 시드값을 통째로 복제(참조 공유 방지).
  const createProduct = (family: ProductFamily) => {
    const tpl = FAMILY_TEMPLATES[family];
    const product: ProductDef = {
      id: `usr:prod:${Date.now().toString(36)}`,
      name: tpl.label || family,
      family,
      ...(tpl.base ? { base: { ...tpl.base } } : {}),
      ...(tpl.pearl ? { pearl: { ...tpl.pearl } } : {}),
      ...(tpl.glitter ? { glitter: [{ ...tpl.glitter }] } : {}),
      ...(tpl.neon ? { neon: { ...tpl.neon } } : {}),
      form: { ...tpl.form },
      owner: 'user',
    };
    onChangeProducts([...userProducts, product]);
    setSelectedProductId(product.id);
    setPicking(false);
  };

  const deleteProduct = (id: string) => {
    onChangeProducts(userProducts.filter(p => p.id !== id));
    if (selectedProductId === id) setSelectedProductId(null);
  };

  // 채널 패치 — 슬롯이 없으면 중립 기본값에서 시작(제형은 항상 존재).
  const patchBase = (p: ProductDef, b: Partial<ChannelBase>) =>
    patchProduct(p.id, {
      base: { ...(p.base ?? { color: '#E0B49A', coverage: 0.5 }), ...b },
    });
  const patchPearl = (p: ProductDef, x: Partial<ChannelPearl>) =>
    patchProduct(p.id, {
      pearl: { ...(p.pearl ?? { color: '#FFFFFF', gain: 0.4 }), ...x },
    });
  const patchNeon = (p: ProductDef, x: Partial<ChannelNeon>) =>
    patchProduct(p.id, {
      neon: { ...(p.neon ?? { color: '#39FF14', gain: 0.8 }), ...x },
    });
  // 글리터 — 첫 인스턴스만 편집, 시드 믹스(2번째+)는 보존.
  const patchGlitter0 = (p: ProductDef, g: Partial<ChannelGlitter>) => {
    const arr = p.glitter?.length
      ? [...p.glitter]
      : [{ color: '#D9C48A', size: 0.4, density: 0.5 }];
    arr[0] = { ...arr[0], ...g };
    patchProduct(p.id, { glitter: arr });
  };
  const patchForm = (p: ProductDef, f: Partial<ProductDef['form']>) =>
    patchProduct(p.id, { form: { ...p.form, ...f } });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* 시트 자체 탭은 배경 닫힘으로 전파되지 않게 흡수 */}
        <Pressable
          style={[styles.sheet, collapsed && styles.sheetCollapsed]}
          onPress={() => {}}>
          <View style={styles.headerRow}>
            {/* 접기(⌄/⌃) — 헤더만 남겨 뒤(카메라)를 잠깐 확인. 상태는 유지된다. */}
            <TouchableOpacity
              onPress={() => setCollapsed(c => !c)}
              hitSlop={8}
              testID="studio-collapse">
              <Text style={styles.collapseText}>{collapsed ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
            <Text style={styles.title}>스튜디오</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          {!collapsed && (
          <>
          <Text style={styles.subtitle}>
            만들고 고르는 저작 공간 — 값 조정은 카메라(라이브)에서
          </Text>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* ① 내 핏 시트 관리 ─────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>내 핏 시트</Text>
            <Text style={styles.sectionNote}>
              어떤 룩을 입어도 따라오는 나만의 배치 조정 시트. 메인 1장이 기본 적용됩니다.
            </Text>

            {sheets.length === 0 ? (
              <Text style={styles.empty}>
                핏 시트가 없습니다 — ＋ 새 핏 시트로 시작하세요.
              </Text>
            ) : (
              sheets.map(s => {
                const isMain = mainId === s.id;
                const isSel = selectedId === s.id;
                return (
                  <View key={s.id}>
                    <TouchableOpacity
                      style={[styles.row, isSel && styles.rowOnNeutral]}
                      onPress={() => setSelectedId(s.id)}>
                      {isMain && <Text style={styles.mainStar}>★</Text>}
                      <Text style={styles.rowName} numberOfLines={1}>
                        {s.name}
                      </Text>
                      {isMain && <Text style={styles.mainBadge}>메인</Text>}
                      <Text style={styles.countBadge}>{s.entries.length}개</Text>
                    </TouchableOpacity>

                    {isSel && (
                      <View style={styles.actionPanel}>
                        {/* 이름 편집(인라인) */}
                        <TextInput
                          style={styles.nameInput}
                          value={s.name}
                          onChangeText={t => rename(s.id, t)}
                          placeholder="시트 이름"
                          placeholderTextColor="rgba(255,255,255,0.4)"
                          maxLength={24}
                          returnKeyType="done"
                        />
                        <View style={styles.actionRow}>
                          {/* 조정 — 스튜디오 닫고 카메라 위 핏 패널(온페이스 핸들)로 */}
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.adjustBtn]}
                            onPress={() => onAdjustFit(s.id)}>
                            <Text style={[styles.actionText, styles.adjustText]}>
                              🎯 조정
                            </Text>
                          </TouchableOpacity>
                          {!isMain && (
                            <TouchableOpacity
                              style={styles.actionBtn}
                              onPress={() => setMain(s.id)}>
                              <Text style={styles.actionText}>★ 메인으로</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => duplicate(s)}>
                            <Text style={styles.actionText}>복제</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => deleteSheet(s)}>
                            <Text style={styles.actionText}>삭제</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}

            <TouchableOpacity style={styles.addBtn} onPress={addSheet}>
              <Text style={styles.addText}>＋ 새 핏 시트</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              시트의 '🎯 조정'을 누르면 카메라 화면에서 얼굴을 보며 움직입니다.
            </Text>

            {/* ② 에셋 카탈로그 ───────────────────────────────────────── */}
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>에셋 카탈로그</Text>
            <Text style={styles.sectionNote}>
              에셋 카탈로그에서 항목을 불러옵니다.
            </Text>
            <TouchableOpacity style={styles.catalogBtn} onPress={onOpenCatalogImport}>
              <Text style={styles.catalogText}>에셋 카탈로그 열기</Text>
            </TouchableOpacity>

            {/* ③ 제품 만들기(A12) — 채널 4종 세부 편집 ────────────────── */}
            <View style={styles.divider} />
            <Text style={[styles.sectionTitle, styles.sectionTitleGold]}>제품 만들기</Text>
            <Text style={styles.sectionNote}>
              제품군을 고르면 그 제품군이 노출하는 채널만 편집합니다 — base(색·농도)·
              pearl(광)·glitter(입자)·neon(발광).
            </Text>

            {userProducts.length === 0 ? (
              <Text style={styles.empty}>
                만든 제품이 없습니다 — ＋ 새 제품으로 시작하세요.
              </Text>
            ) : (
              userProducts.map(p => {
                const isSel = selectedProductId === p.id;
                const slots = FAMILY_TEMPLATES[p.family].slots;
                const g = p.glitter?.[0];
                return (
                  <View key={p.id}>
                    <View style={[styles.row, isSel && styles.rowOn]}>
                      <TouchableOpacity
                        style={styles.rowMain}
                        onPress={() =>
                          setSelectedProductId(isSel ? null : p.id)
                        }>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={styles.familyBadge}>
                          {FAMILY_TEMPLATES[p.family].label || p.family}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => deleteProduct(p.id)}
                        hitSlop={8}>
                        <Text style={styles.deleteText}>삭제</Text>
                      </TouchableOpacity>
                    </View>

                    {isSel && (
                      <View style={styles.editPanel}>
                        {/* 이름(인라인) */}
                        <TextInput
                          style={[styles.nameInput, styles.nameInputGold]}
                          value={p.name}
                          onChangeText={t => patchProduct(p.id, { name: t })}
                          placeholder="제품 이름"
                          placeholderTextColor="rgba(255,255,255,0.4)"
                          maxLength={24}
                          returnKeyType="done"
                        />

                        {/* base — 색 스와치 + 농도 */}
                        {slots.includes('base') && (
                          <View style={styles.channelBlock}>
                            <Text style={styles.channelLabel}>베이스 — 색·농도</Text>
                            <View style={styles.swatchRow}>
                              {BASE_SWATCHES.map(c => {
                                const on =
                                  (p.base?.color ?? '').toLowerCase() ===
                                  c.toLowerCase();
                                return (
                                  <TouchableOpacity
                                    key={c}
                                    style={[
                                      styles.swatch,
                                      { backgroundColor: c },
                                      on && styles.swatchOn,
                                    ]}
                                    onPress={() => patchBase(p, { color: c })}
                                  />
                                );
                              })}
                            </View>
                            <ParamSlider
                              label="농도"
                              value={p.base?.coverage ?? 0.5}
                              onChange={v => patchBase(p, { coverage: v })}
                              accent={GOLD}
                            />
                          </View>
                        )}

                        {/* pearl — 게인(shift=A15 생략) */}
                        {slots.includes('pearl') && (
                          <View style={styles.channelBlock}>
                            <Text style={styles.channelLabel}>펄 — 광 게인</Text>
                            <ParamSlider
                              label="게인"
                              value={p.pearl?.gain ?? 0}
                              onChange={v => patchPearl(p, { gain: v })}
                              accent={GOLD}
                            />
                          </View>
                        )}

                        {/* glitter — 첫 인스턴스 크기·밀도(믹스 추가 생략) */}
                        {slots.includes('glitter') && (
                          <View style={styles.channelBlock}>
                            <Text style={styles.channelLabel}>글리터 — 입자</Text>
                            <ParamSlider
                              label="크기"
                              value={g?.size ?? 0.4}
                              onChange={v => patchGlitter0(p, { size: v })}
                              accent={GOLD}
                            />
                            <ParamSlider
                              label="밀도"
                              value={g?.density ?? 0.5}
                              onChange={v => patchGlitter0(p, { density: v })}
                              accent={GOLD}
                            />
                            {(p.glitter?.length ?? 0) > 1 && (
                              <Text style={styles.note}>
                                믹스 {p.glitter!.length}종 — 첫 입자만 편집(믹스는 보존).
                              </Text>
                            )}
                          </View>
                        )}

                        {/* neon — 게인(렌더 A15 대기) */}
                        {slots.includes('neon') && (
                          <View style={styles.channelBlock}>
                            <Text style={styles.channelLabel}>네온 — 발광 게인</Text>
                            <ParamSlider
                              label="게인"
                              value={p.neon?.gain ?? 0}
                              onChange={v => patchNeon(p, { gain: v })}
                              accent={GOLD}
                            />
                            <Text style={styles.note}>
                              네온 발광은 렌더 준비 중(A15) — 값만 보존돼요.
                            </Text>
                          </View>
                        )}

                        {/* form — 제형(마감 세그 + 쌓임/뭉갬) */}
                        <View style={styles.channelBlock}>
                          <Text style={styles.channelLabel}>제형</Text>
                          <View style={styles.segRow}>
                            {FINISHES.map(f => {
                              const on = p.form.finish === f.value;
                              return (
                                <TouchableOpacity
                                  key={f.value}
                                  style={[styles.seg, on && styles.segOn]}
                                  onPress={() =>
                                    patchForm(p, { finish: f.value })
                                  }>
                                  <Text
                                    style={[
                                      styles.segText,
                                      on && styles.segTextOn,
                                    ]}>
                                    {f.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          <ParamSlider
                            label="쌓임"
                            value={p.form.buildability}
                            onChange={v => patchForm(p, { buildability: v })}
                            accent={GOLD}
                          />
                          <ParamSlider
                            label="뭉갬"
                            value={p.form.blendability}
                            onChange={v => patchForm(p, { blendability: v })}
                            accent={GOLD}
                          />
                          <Text style={styles.note}>
                            뭉갬(blendability)은 A14 마스크 베이킹 대기 — 값만 보존돼요.
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {picking ? (
              <View style={styles.familyGrid}>
                {(Object.keys(FAMILY_TEMPLATES) as ProductFamily[]).map(fam => (
                  <TouchableOpacity
                    key={fam}
                    style={styles.familyChip}
                    onPress={() => createProduct(fam)}>
                    <Text style={styles.familyChipText}>
                      {FAMILY_TEMPLATES[fam].label || fam}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.addBtn, styles.addBtnGold]}
                onPress={() => setPicking(true)}>
                <Text style={[styles.addText, styles.addTextGold]}>＋ 새 제품</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.hint}>
              만든 제품은 컴포저의 제품 칩에 나타나요.
            </Text>
          </ScrollView>
          </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  // 풀시트 — 화면 하단에서 올라와 대부분을 덮는다(SaveSheetV2 토큰 계열).
  sheet: {
    backgroundColor: '#1C1A1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 24,
    maxHeight: '92%',
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  closeText: {
    color: TEXT_SUB,
    fontSize: 16,
  },
  // 접기 — 헤더만 남는 컴팩트 바(상태 유지). ⌄=접기 ⌃=펼치기.
  sheetCollapsed: {
    paddingBottom: 12,
  },
  collapseText: {
    color: TEXT_SUB,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
  },
  body: {
    marginTop: 4,
  },
  // 기본(무채색) — 내 핏 시트·에셋 카탈로그 헤더. 제품 만들기만 sectionTitleGold로 덮어씀.
  sectionTitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  sectionTitleGold: {
    color: GOLD,
  },
  sectionNote: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  empty: {
    color: TEXT_HINT,
    fontSize: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 6,
  },
  // 제품 행 선택(제품 만들기, 골드 유지) — 핏 시트 행은 rowOnNeutral 사용.
  rowOn: {
    borderColor: GOLD,
    backgroundColor: 'rgba(201,161,94,0.12)',
  },
  rowOnNeutral: {
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  mainStar: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  rowName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  mainBadge: {
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.16)',
    fontSize: 9,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  countBadge: {
    color: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    fontSize: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  // 선택 시트의 인라인 편집 패널.
  actionPanel: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    marginTop: -2,
    marginBottom: 6,
    gap: 8,
  },
  // 기본(무채색) — 핏 시트 이름 편집. 제품 이름 편집은 nameInputGold로 덮어씀.
  nameInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 14,
  },
  nameInputGold: {
    borderColor: 'rgba(201,161,94,0.9)',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  actionText: {
    color: TEXT_SUB,
    fontSize: 12,
  },
  // 조정 — 무채색 강조: 시트 편집의 주 액션이라 다른 버튼과 구분(레인 시그니처 제거).
  adjustBtn: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  adjustText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // 기본(무채색) — "＋ 새 핏 시트". "＋ 새 제품"은 addBtnGold/addTextGold로 덮어씀.
  addBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginTop: 2,
  },
  addText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  addBtnGold: {
    borderColor: 'rgba(201,161,94,0.5)',
  },
  addTextGold: {
    color: GOLD,
  },
  hint: {
    color: TEXT_HINT,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 10,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 16,
  },
  catalogBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  catalogText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
  },
  // 제품 만들기 — 행(이름·제품군 배지·삭제) + 인라인 채널 편집 패널.
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  familyBadge: {
    color: GOLD_LIGHT,
    backgroundColor: 'rgba(201,161,94,0.16)',
    fontSize: 9,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  deleteText: {
    color: TEXT_HINT,
    fontSize: 12,
  },
  editPanel: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    marginTop: -2,
    marginBottom: 6,
    gap: 6,
  },
  channelBlock: {
    marginTop: 4,
    gap: 2,
  },
  channelLabel: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '700',
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 4,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  swatchOn: {
    borderColor: GOLD,
    borderWidth: 2,
  },
  segRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 4,
  },
  seg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  segOn: {
    backgroundColor: 'rgba(201,161,94,0.18)',
    borderWidth: 1,
    borderColor: GOLD,
  },
  segText: {
    color: TEXT_SUB,
    fontSize: 12,
  },
  segTextOn: {
    color: GOLD_LIGHT,
    fontWeight: '700',
  },
  note: {
    color: TEXT_HINT,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
  },
  familyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
    marginBottom: 2,
  },
  familyChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(201,161,94,0.5)',
    backgroundColor: 'rgba(201,161,94,0.1)',
  },
  familyChipText: {
    color: GOLD_LIGHT,
    fontSize: 12,
    fontWeight: '600',
  },
});
