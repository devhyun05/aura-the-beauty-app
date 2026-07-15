/**
 * 저장 시트 v2 — 변경 요약 한 장 (목업 v2 화면 05).
 * 편집 중 무질문 원칙의 짝: 확인이 필요한 것만 여기서 선택지가 된다.
 *  - 시스템 프리셋 수정분(auto) → 자동 사본 포함 안내만 (질문 없음)
 *  - 내 룩 + 공유 중(choice) → 이 룩에서만(사본) / 원본에 반영 라디오
 *  - 새 레이어(new) → 이 룩에 포함 안내
 *  - 각 항목 ☆승격 = 라이브러리에 별도 룩으로 저장
 * 저장물 = 메이크업 룩 단독(레인 분리 저장, 분류체계 정의 07-10).
 * 보정(FIT)은 FIT 시트의 자체 저장으로 — 여기서 다루지 않는다.
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
import type { SaveItem } from '../composer/lookTree';

const ROSE = '#FF7E9D';
const GOLD = '#C9A15E';

export interface SaveDecision {
  name: string;
  items: SaveItem[];
  overwrite: boolean;
}

interface Props {
  /** 자동 제안 이름 (suggestStyleName) */
  defaultName: string;
  /** collectChanges 결과 — 라디오/승격 토글의 초기 상태 */
  items: SaveItem[];
  /** 트리에 dirty가 있는가 — 항목이 없어도 '조합 구성 변경' 안내에 쓴다 */
  treeDirty: boolean;
  /** 내 룩 편집 중이면 그 이름 — 덮어쓰기 버튼 노출 */
  editingName: string | null;
  onCancel: () => void;
  onSave: (decision: SaveDecision) => void;
}

export default function SaveSheetV2({
  defaultName,
  items: initialItems,
  treeDirty,
  editingName,
  onCancel,
  onSave,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [items, setItems] = useState<SaveItem[]>(initialItems);

  const patchItem = (nodeId: string, patch: Partial<SaveItem>) => {
    setItems(prev => prev.map(i => (i.nodeId === nodeId ? { ...i, ...patch } : i)));
  };

  const decide = (overwrite: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({ name: trimmed, items, overwrite });
  };

  const anyRow = items.length > 0 || treeDirty;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* 시트 자체 탭은 배경 닫힘으로 전파되지 않게 흡수 */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>메이크업 룩 저장 — 변경 요약</Text>

          <Text style={styles.miniTitle}>이름 (자동 제안)</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="룩 이름"
            placeholderTextColor="rgba(255,255,255,0.4)"
            maxLength={24}
            returnKeyType="done"
          />

          <Text style={styles.laneNote}>
            보정(FIT)은 보정 레인에서 따로 저장돼요 — 이 저장물은 메이크업만 담아요
          </Text>

          <Text style={styles.miniTitle}>
            변경 요약 <Text style={styles.miniMute}>— 확인이 필요한 것만 선택지가 생깁니다</Text>
          </Text>

          <ScrollView style={styles.changeScroll}>
            {items.map(item => (
              <View key={item.nodeId} style={styles.changeBox}>
                <View style={styles.changeHead}>
                  <Text style={styles.changeName} numberOfLines={1}>
                    {item.name}
                    <Text style={styles.dirtyStar}>*</Text>
                    <Text style={styles.changePath}>  {item.slot} 자리</Text>
                  </Text>
                  {item.owner === 'user' && (
                    <Text style={styles.ownBadge}>내 룩</Text>
                  )}
                </View>

                {item.kind === 'auto' && (
                  <Text style={styles.autoText}>
                    기본 프리셋 — 사본으로 자동 포함 (원본 불변 · 질문 없음)
                  </Text>
                )}
                {item.kind === 'new' && (
                  <Text style={styles.autoText}>
                    새로 만든 레이어 — 이 룩에 포함 (라이브러리 미등록)
                  </Text>
                )}
                {item.kind === 'choice' && (
                  <View style={styles.optCol}>
                    <TouchableOpacity
                      style={styles.radioRow}
                      onPress={() => patchItem(item.nodeId, { mode: 'copy' })}>
                      <View style={[styles.radio, item.mode === 'copy' && styles.radioOn]} />
                      <Text style={[styles.radioText, item.mode === 'copy' && styles.radioTextOn]}>
                        이 룩에서만 반영 (사본)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.radioRow}
                      onPress={() => patchItem(item.nodeId, { mode: 'apply' })}>
                      <View style={[styles.radio, item.mode === 'apply' && styles.radioOn]} />
                      <Text style={[styles.radioText, item.mode === 'apply' && styles.radioTextOn]}>
                        원본에 반영
                        {item.sharedCount > 0 && (
                          <Text style={styles.warnText}>
                            {' '}
                            — 이 룩을 쓰는 다른 곳 {item.sharedCount}곳에도 적용
                          </Text>
                        )}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.promote, item.promote && styles.promoteOn]}
                  onPress={() => patchItem(item.nodeId, { promote: !item.promote })}>
                  <Text style={[styles.promoteText, item.promote && styles.promoteTextOn]}>
                    {item.promote ? '★' : '☆'} 라이브러리에 별도 룩으로 저장
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* 항목은 없지만 구성이 바뀐 경우(교체·추가·삭제) — 안내 1행 */}
            {items.length === 0 && treeDirty && (
              <View style={styles.changeBox}>
                <Text style={styles.changeName}>조합 구성 변경</Text>
                <Text style={styles.autoText}>
                  룩 교체·추가 — 이 룩에 반영되어 저장됩니다
                </Text>
              </View>
            )}

            {!anyRow && (
              <View style={styles.noChange}>
                <Text style={styles.noChangeText}>
                  변경 없음 — 조합 그대로 저장됩니다. 이름만 확인하세요 ✓
                </Text>
              </View>
            )}
          </ScrollView>

          {editingName != null && (
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={() => decide(true)}
              disabled={!name.trim()}>
              <Text style={styles.btnGhostText} numberOfLines={1}>
                ◈ "{editingName}" 덮어쓰기
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
              <Text style={styles.btnGhostText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => decide(false)}
              disabled={!name.trim()}>
              <Text style={styles.btnPrimaryText}>저장</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: '#1C1A1E',
    gap: 10,
    maxHeight: '86%',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  miniTitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
  },
  miniMute: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '400',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(201,161,94,0.9)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: '#FFFFFF',
    fontSize: 15,
  },
  laneNote: {
    color: 'rgba(228,207,158,0.85)',
    fontSize: 10.5,
  },
  changeScroll: {
    maxHeight: 260,
  },
  changeBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    gap: 6,
  },
  changeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  changePath: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '400',
  },
  dirtyStar: {
    color: ROSE,
    fontWeight: '800',
  },
  ownBadge: {
    color: '#E4CF9E',
    backgroundColor: 'rgba(201,161,94,0.16)',
    fontSize: 9,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  autoText: {
    color: '#E4CF9E',
    fontSize: 10.5,
  },
  optCol: {
    gap: 3,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 3,
  },
  radio: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  radioOn: {
    borderColor: ROSE,
    backgroundColor: ROSE,
  },
  radioText: {
    flex: 1,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
  },
  radioTextOn: {
    color: '#FFFFFF',
  },
  warnText: {
    color: GOLD,
    fontSize: 10,
  },
  promote: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.25)',
  },
  promoteOn: {
    borderColor: 'rgba(201,161,94,0.8)',
    backgroundColor: 'rgba(201,161,94,0.12)',
  },
  promoteText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
  },
  promoteTextOn: {
    color: '#E4CF9E',
  },
  noChange: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(79,191,135,0.5)',
    borderRadius: 10,
    padding: 12,
  },
  noChangeText: {
    color: '#4FBF87',
    fontSize: 11,
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  btnGhost: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  btnGhostText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  btnPrimary: {
    backgroundColor: ROSE,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
