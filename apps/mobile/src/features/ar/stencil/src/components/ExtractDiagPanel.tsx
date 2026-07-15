/**
 * 룩 추출 진단 패널 (개발용, dev-facing) — 사진→룩 추출(#1)이 실기기에서 농도가 낮고
 * 색이 안 살아나는 원인을 한 화면에서 규명·튜닝하기 위한 오버레이. 사용자 UI(레인/카드)와
 * 분리된 눈에 띄는 디버그 영역이다. 세 가지를 노출한다:
 *   A. 진단 표시 — 마지막 LookMeasurement(lightingConf·whitePoint·부위별 측정 hex/conf)와
 *      measurementToLook이 산출한 최종 intensity를 스와치와 함께. lightingConf가 0.30
 *      폴백(흰자 검출 실패)인지, 색이 사진과 맞는지 즉시 판정.
 *   B. 게인 슬라이더 — 저장된 measurement로 measurementToLook을 재실행해 빌드 없이 농도 확정.
 *   C. 화이트밸런스 끄기 토글 — 다음 추출부터 그레이월드 보정을 건너뛴 raw 색과 비교.
 *
 * 순수 표시 컴포넌트 — 상태·재적용·브리지 전송은 App(부모)이 담당한다.
 */
import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Slider from '@react-native-community/slider';
import type {LookMeasurement} from '../bridge/types';
import {measurementToLook} from '../composer/lookExtract';

interface Props {
  /** 마지막 수신 측정치 (없으면 "추출 데이터 없음") */
  measurement: LookMeasurement | null;
  /** 현재 게인(0.5~6) */
  gain: number;
  /** 게인 변경 → 부모가 저장 measurement로 트리 재적용 */
  onGainChange: (gain: number) => void;
  /** 화이트밸런스 끄기 상태(다음 추출에 반영) */
  noWhiteBalance: boolean;
  /** WB 토글 → 부모가 Unity에 setExtractDebug 전송 */
  onToggleWhiteBalance: (next: boolean) => void;
  onClose: () => void;
}

const GAIN_MIN = 0.5;
const GAIN_MAX = 6;

/** '#RRGGBB' 유효성(빈 문자열/undefined=false). 스와치·표시 게이팅용. */
function isHex(hex: string | undefined): boolean {
  return typeof hex === 'string' && /^#?[0-9a-fA-F]{6}$/.test(hex.trim());
}

/** 색 스와치 + hex 텍스트 (무효 hex면 "—"). */
function Swatch({hex}: {hex: string | undefined}) {
  const ok = isHex(hex);
  return (
    <View style={styles.swatchRow}>
      <View
        style={[
          styles.swatch,
          ok ? {backgroundColor: hex} : styles.swatchEmpty,
        ]}
      />
      <Text style={styles.hexText}>{ok ? hex : '—'}</Text>
    </View>
  );
}

/** 부위 한 줄 — 측정 hex 스와치 + conf + 최종 intensity. */
function PartRow({
  label,
  hex,
  conf,
  intensity,
  note,
}: {
  label: string;
  hex: string | undefined;
  conf: number;
  intensity: number | undefined;
  note?: string;
}) {
  return (
    <View style={styles.partRow}>
      <Text style={styles.partLabel}>{label}</Text>
      <Swatch hex={hex} />
      <Text style={styles.metric}>c{conf.toFixed(2)}</Text>
      <Text style={[styles.metric, styles.intensity]}>
        {intensity == null ? '·' : `${Math.round(intensity * 100)}%`}
      </Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

export default function ExtractDiagPanel({
  measurement: m,
  gain,
  onGainChange,
  noWhiteBalance,
  onToggleWhiteBalance,
  onClose,
}: Props) {
  // 현재 게인으로 재산출한 최종 룩 — 각 부위의 최종 intensity를 읽어 표시(라이브와 동일 계산).
  const look = m ? measurementToLook(m, gain) : null;
  const lensI = look?.lensLayers[0]?.intensity;
  const lightingFallback = m ? Math.abs(m.lightingConf - 0.3) < 0.001 : false;

  return (
    <View style={styles.panel} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>룩 추출 진단 (DEV)</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>

        {!m ? (
          <Text style={styles.empty}>추출 데이터 없음 — 룩 추출을 먼저 실행하세요.</Text>
        ) : (
          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* 전역: 조명 신뢰도 · 화이트포인트 · 얼굴 검출 */}
            <View style={styles.globalRow}>
              <Text style={styles.globalLabel}>조명 conf</Text>
              <Text
                style={[
                  styles.globalVal,
                  lightingFallback && styles.warn,
                ]}>
                {m.lightingConf.toFixed(2)}
                {lightingFallback ? '  ⚠ 0.30 폴백(흰자 검출 실패)' : ''}
              </Text>
            </View>
            <View style={styles.globalRow}>
              <Text style={styles.globalLabel}>화이트P</Text>
              <Swatch hex={m.whitePoint} />
            </View>
            <View style={styles.globalRow}>
              <Text style={styles.globalLabel}>얼굴</Text>
              <Text style={styles.globalVal}>{m.hasFace ? 'O' : '✕ 미검출'}</Text>
            </View>

            <View style={styles.divider} />
            <View style={styles.partHead}>
              <Text style={styles.partLabel}>부위</Text>
              <Text style={styles.headHint}>측정색 / conf / 최종농도</Text>
            </View>
            <PartRow label="립" hex={m.lip} conf={m.lipConf} intensity={look?.params.lipIntensity} />
            <PartRow label="블러셔" hex={m.blush} conf={m.blushConf} intensity={look?.params.blushIntensity} />
            <PartRow label="섀도" hex={m.eyeshadow} conf={m.eyeshadowConf} intensity={look?.params.eyeshadowIntensity} />
            <PartRow label="눈썹" hex={m.brow} conf={m.browConf} intensity={look?.params.browIntensity} />
            <PartRow
              label="홍채"
              hex={m.iris}
              conf={m.irisConf}
              intensity={lensI}
              note={lensI == null ? '렌즈 아님' : undefined}
            />

            <View style={styles.divider} />

            {/* B. 게인 슬라이더 — 저장 measurement로 즉시 재적용 */}
            <View style={styles.gainRow}>
              <Text style={styles.globalLabel}>게인</Text>
              <Slider
                style={styles.slider}
                minimumValue={GAIN_MIN}
                maximumValue={GAIN_MAX}
                value={gain}
                onValueChange={onGainChange}
                minimumTrackTintColor="#7FE0A0"
                maximumTrackTintColor="rgba(255,255,255,0.25)"
                thumbTintColor="#FFFFFF"
              />
              <Text style={styles.gainVal}>×{gain.toFixed(2)}</Text>
            </View>

            {/* C. 화이트밸런스 끄기 토글 — 다음 추출부터 반영 */}
            <TouchableOpacity
              style={[styles.wbToggle, noWhiteBalance && styles.wbToggleOn]}
              onPress={() => onToggleWhiteBalance(!noWhiteBalance)}>
              <Text style={styles.wbText}>
                화이트밸런스 {noWhiteBalance ? 'OFF (raw 색)' : 'ON'} — 탭해서 전환
              </Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              WB 전환은 다음 “룩 추출”부터 적용됩니다(현재 표시색은 마지막 추출 기준).
            </Text>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    alignItems: 'center',
    // 컴포저 시트·툴레일 등 하단 오버레이보다 위에 얹어 컨트롤(게인·WB 토글)이
    // 다른 오버레이에 가려지거나 탭이 가로채이지 않게 한다(개발용 진단 최우선).
    zIndex: 100,
    elevation: 100,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(12,14,18,0.92)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(127,224,160,0.4)',
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    color: '#7FE0A0',
    fontSize: 13,
    fontWeight: '700',
  },
  close: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    paddingHorizontal: 4,
  },
  empty: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    paddingVertical: 8,
  },
  body: {
    maxHeight: 320,
  },
  globalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  globalLabel: {
    width: 64,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
  },
  globalVal: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  warn: {
    color: '#FFB067',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 6,
  },
  partHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  headHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  partLabel: {
    width: 46,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 92,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginRight: 5,
  },
  swatchEmpty: {
    backgroundColor: 'transparent',
  },
  hexText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  metric: {
    width: 42,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  intensity: {
    color: '#7FE0A0',
    fontWeight: '600',
  },
  note: {
    marginLeft: 6,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
  },
  gainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  slider: {
    flex: 1,
    height: 32,
  },
  gainVal: {
    width: 48,
    textAlign: 'right',
    color: '#7FE0A0',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  wbToggle: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  wbToggleOn: {
    borderColor: '#FFB067',
    backgroundColor: 'rgba(255,176,103,0.15)',
  },
  wbText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    textAlign: 'center',
  },
  hint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
  },
});
