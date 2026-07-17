import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import LegalScreen, {type LegalKind} from './LegalScreen';
import {ACCENT, PANEL_BG} from '../theme';

/**
 * 사용자용 설정 패널 (배포용). 개발자 캘리브레이션(⚙️ 디버그 레일)과 별개.
 * 촬영/저장 관련 사용자 옵션을 토글로 노출한다.
 */

export interface UserSettings {
  /** 좌우 반전 없이 저장 — 전면 셀피 프리뷰는 거울이지만 저장은 실제(남이 보는) 방향으로 */
  saveUnmirror: boolean;
  /** 촬영 시 화면 깜빡임(플래시) 피드백 */
  flashOnCapture: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  saveUnmirror: false,
  flashOnCapture: true,
};

/** 앱 상태 행(설정 저장이 아니라 화면 토글/액션) — 격자·조명·UI가리기가 도구 레일에서
 *  이관됨. toggle=스위치(value/onToggle), action=탭 실행(온셀렉트, ▸ 표시). */
export interface SettingsAction {
  key: string;
  label: string;
  hint: string;
  kind: 'toggle' | 'action';
  value?: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

interface Props {
  value: UserSettings;
  onChange: (next: UserSettings) => void;
  onClose: () => void;
  /** 화면 토글/액션(격자·조명·가리기 등) — UserSettings 저장 목록 아래에 노출 */
  extraRows?: SettingsAction[];
}

const ROWS: {key: keyof UserSettings; label: string; hint: string}[] = [
  {
    key: 'saveUnmirror',
    label: '좌우 반전 없이 저장',
    hint: '촬영은 거울처럼 보여도 저장은 실제 모습으로 (전면 카메라)',
  },
  {
    key: 'flashOnCapture',
    label: '촬영 시 화면 깜빡임',
    hint: '사진을 찍을 때 화면이 한 번 반짝여요',
  },
];

/** 정책·고지 진입(출시 필수) — 탭하면 전문 리더(LegalScreen)를 연다. */
const LEGAL_ROWS: {key: LegalKind; label: string; hint: string}[] = [
  {
    key: 'privacy',
    label: '개인정보처리방침',
    hint: '카메라·얼굴 데이터는 기기 안에서만 처리돼요',
  },
  {
    key: 'oss',
    label: '오픈소스 라이선스',
    hint: '앱이 사용하는 오픈소스 소프트웨어 고지',
  },
];

export default function SettingsPanel({
  value,
  onChange,
  onClose,
  extraRows = [],
}: Props) {
  // 정책 문서 리더(출시 필수) — App 상태를 건드리지 않게 패널 안에서 자체 완결.
  const [legal, setLegal] = useState<LegalKind | null>(null);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>설정</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {ROWS.map(r => {
        const on = value[r.key];
        return (
          <TouchableOpacity
            key={r.key}
            style={styles.row}
            activeOpacity={0.8}
            testID={`setting-${r.key}`}
            onPress={() => onChange({...value, [r.key]: !on})}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowHint}>{r.hint}</Text>
            </View>
            <View style={[styles.track, on && styles.trackOn]}>
              <View style={[styles.knob, on && styles.knobOn]} />
            </View>
          </TouchableOpacity>
        );
      })}

      {/* 화면 토글/액션 — 도구 레일에서 이관된 격자·조명·UI 가리기 등 */}
      {extraRows.length > 0 && <View style={styles.divider} />}
      {extraRows.map(r => (
        <TouchableOpacity
          key={r.key}
          style={styles.row}
          activeOpacity={0.8}
          disabled={r.disabled}
          testID={`setting-action-${r.key}`}
          onPress={r.onSelect}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, r.disabled && styles.rowDim]}>
              {r.label}
            </Text>
            <Text style={styles.rowHint}>{r.hint}</Text>
          </View>
          {r.kind === 'toggle' ? (
            <View style={[styles.track, r.value && styles.trackOn]}>
              <View style={[styles.knob, r.value && styles.knobOn]} />
            </View>
          ) : (
            <Text style={styles.actionArrow}>▸</Text>
          )}
        </TouchableOpacity>
      ))}

      {/* 정책·고지(출시 필수) — 전문은 풀시트 리더로 연다. */}
      <View style={styles.divider} />
      {LEGAL_ROWS.map(r => (
        <TouchableOpacity
          key={r.key}
          style={styles.row}
          activeOpacity={0.8}
          testID={`setting-legal-${r.key}`}
          onPress={() => setLegal(r.key)}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            <Text style={styles.rowHint}>{r.hint}</Text>
          </View>
          <Text style={styles.actionArrow}>▸</Text>
        </TouchableOpacity>
      ))}

      {legal && <LegalScreen kind={legal} onClose={() => setLegal(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: PANEL_BG,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  closeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  rowHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 2,
  },
  rowDim: {color: 'rgba(255,255,255,0.4)'},
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 2,
  },
  actionArrow: {color: 'rgba(255,255,255,0.6)', fontSize: 16, paddingHorizontal: 6},
  track: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
  },
  trackOn: {
    backgroundColor: ACCENT,
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  knobOn: {
    alignSelf: 'flex-end',
  },
});
