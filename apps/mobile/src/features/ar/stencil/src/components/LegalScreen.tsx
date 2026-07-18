/**
 * 정책 문서 리더 (출시 필수) — "개인정보처리방침"·"오픈소스 라이선스" 전문을
 * 스크롤로 보여 주는 풀시트 모달. SettingsPanel 에서 진입한다.
 *
 * RN은 md/txt를 직접 로드할 수 없어 본문은 문자열 상수로 번들한다
 * (src/legal/privacyPolicy.ts · src/legal/ossLicenses.ts). 여기서는 경량
 * 마크다운 표기(#/##/###, - 불릿, **강조**, --- 구분선)만 렌더링한다.
 */
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PRIVACY_POLICY_MD } from '../legal/privacyPolicy';
import {
  BUNDLED_NOTICES,
  LICENSE_TEXTS,
  OSS_LICENSE_HISTOGRAM,
  OSS_PACKAGES,
} from '../legal/ossLicenses';
import { GOLD, TEXT_SUB } from '../theme';

export type LegalKind = 'privacy' | 'oss';

interface Props {
  kind: LegalKind;
  onClose: () => void;
}

const TITLES: Record<LegalKind, string> = {
  privacy: '개인정보처리방침',
  oss: '오픈소스 라이선스',
};

// **강조** 인라인 분할 — 홀수 조각만 굵게.
function renderInline(text: string, keyBase: string): React.ReactNode {
  const parts = text.split('**');
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <Text key={`${keyBase}-b${i}`} style={styles.bold}>
        {p}
      </Text>
    ) : (
      <Text key={`${keyBase}-t${i}`}>{p}</Text>
    ),
  );
}

// 경량 마크다운 렌더 — 개인정보처리방침·번들 고지 본문에 공용.
function renderMarkdown(md: string, prefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  md.split('\n').forEach((raw, idx) => {
    const line = raw.trimEnd();
    const key = `${prefix}-${idx}`;
    if (line === '') return; // 빈 줄 간격은 블록 marginBottom 으로 처리
    if (line === '---') {
      out.push(<View key={key} style={styles.hr} />);
      return;
    }
    if (line.startsWith('### ')) {
      out.push(
        <Text key={key} style={styles.h3}>
          {line.slice(4)}
        </Text>,
      );
      return;
    }
    if (line.startsWith('## ')) {
      out.push(
        <Text key={key} style={styles.h2}>
          {line.slice(3)}
        </Text>,
      );
      return;
    }
    if (line.startsWith('# ')) {
      out.push(
        <Text key={key} style={styles.h1}>
          {line.slice(2)}
        </Text>,
      );
      return;
    }
    if (line.startsWith('- ')) {
      out.push(
        <View key={key} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{renderInline(line.slice(2), key)}</Text>
        </View>,
      );
      return;
    }
    out.push(
      <Text key={key} style={styles.p}>
        {renderInline(line, key)}
      </Text>,
    );
  });
  return out;
}

// 오픈소스 라이선스 화면 본문.
function OssBody() {
  return (
    <>
      <Text style={styles.p}>
        이 앱은 아래 오픈소스 소프트웨어와 온디바이스 ML 모델을 포함합니다.
        프로덕션 의존성 {OSS_PACKAGES.length}종의 목록과 대표 라이선스 전문을
        고지합니다.
      </Text>

      {/* 라이선스 타입별 요약 */}
      <Text style={styles.h2}>라이선스 요약</Text>
      {OSS_LICENSE_HISTOGRAM.map(h => (
        <View key={`hist-${h.id}`} style={styles.histRow}>
          <Text style={styles.histId}>{h.id}</Text>
          <Text style={styles.histCount}>{h.count}종</Text>
        </View>
      ))}

      {/* MediaPipe·Unity 프레임워크 번들 고지 */}
      <View style={styles.hr} />
      {renderMarkdown(BUNDLED_NOTICES, 'notice')}

      {/* 대표 라이선스 전문(SPDX 타입별 1회) */}
      <View style={styles.hr} />
      <Text style={styles.h2}>대표 라이선스 전문</Text>
      <Text style={styles.dim}>
        아래 전문은 라이선스 타입별 1회만 싣습니다. 각 패키지의 저작권자·연도는
        해당 저장소의 고지를 따릅니다.
      </Text>
      {LICENSE_TEXTS.map(lt => (
        <View key={`lic-${lt.id}`} style={styles.licenseBlock}>
          <Text style={styles.h3}>{lt.title}</Text>
          <Text style={styles.licenseBody}>{lt.text}</Text>
        </View>
      ))}

      {/* 전체 패키지 목록 */}
      <View style={styles.hr} />
      <Text style={styles.h2}>전체 패키지 목록 ({OSS_PACKAGES.length}종)</Text>
      {OSS_PACKAGES.map(p => (
        <View key={`pkg-${p.name}`} style={styles.pkgRow}>
          <Text style={styles.pkgName}>{p.name}</Text>
          <Text style={styles.pkgLicense}>{p.license}</Text>
        </View>
      ))}
    </>
  );
}

export default function LegalScreen({ kind, onClose }: Props) {
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* 시트 자체 탭은 배경 닫힘으로 전파되지 않게 흡수 */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{TITLES[kind]}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} testID="legal-close">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator>
            {kind === 'privacy' ? renderMarkdown(PRIVACY_POLICY_MD, 'pp') : <OssBody />}
          </ScrollView>
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
  // 풀시트 — 하단에서 올라와 화면 대부분을 덮는 리더(StudioHub 토큰 계열).
  sheet: {
    backgroundColor: '#1C1A1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 24,
    height: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
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
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 32,
  },
  // ── 마크다운 블록 ─────────────────────────────────────────────
  h1: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 10,
  },
  h2: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  h3: {
    color: '#E7DCE4',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  p: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  bold: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 4,
  },
  bulletDot: {
    color: GOLD,
    fontSize: 13,
    lineHeight: 20,
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    lineHeight: 20,
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginVertical: 14,
  },
  dim: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  // ── 오픈소스 요약·전문·목록 ───────────────────────────────────
  histRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  histId: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
  },
  histCount: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
  },
  licenseBlock: {
    marginTop: 8,
    marginBottom: 4,
  },
  licenseBody: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    lineHeight: 15,
  },
  pkgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  pkgName: {
    flex: 1,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
  },
  pkgLicense: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
  },
});
