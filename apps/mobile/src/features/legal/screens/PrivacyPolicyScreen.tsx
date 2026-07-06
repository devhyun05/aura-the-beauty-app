import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';

type Props = {
  onClose?: () => void;
};

// App Store 심사·PIPA 대응. 로그인 화면의 죽은 “개인정보처리방침” 링크가 이 화면을 연다.
export function PrivacyPolicyScreen({ onClose }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>개인정보처리방침</Text>
        <Text style={styles.updated}>최종 업데이트: 2026-07-06</Text>

        <Section title="1. 카메라 및 얼굴 이미지">
          AURA는 얼굴 촬영, AR 메이크업, 퍼스널 컬러 분석을 위해 카메라를 사용합니다. 퍼스널
          컬러 분석에 사용되는 얼굴 이미지는 기기 안에서만 처리되며 서버로 전송되지 않습니다.
        </Section>
        <Section title="2. 퍼스널 컬러 데이터">
          피부·헤어·입술 색에서 추출한 수치(예: Lab 값, 시즌 성향)는 기기 내에서 계산됩니다. 색
          추출 후 원본 얼굴 프레임은 즉시 삭제되며, 결과 데이터만 기기에 저장됩니다.
        </Section>
        <Section title="3. 저장 및 삭제">
          퍼스널 컬러 결과는 기기 로컬 저장소에 보관되며, 앱 내 “내 색상 데이터 삭제”로 언제든
          삭제할 수 있습니다. 앱 삭제 시 함께 제거됩니다.
        </Section>
        <Section title="4. 제3자 제공 및 국외 이전">
          퍼스널 컬러 얼굴 이미지·파생 색 데이터는 제3자에게 제공되거나 국외로 이전되지
          않습니다. 광고·추적 목적으로 사용하지 않습니다.
        </Section>
        <Section title="5. 문의">
          개인정보 관련 문의는 앱 설정의 고객센터를 통해 접수할 수 있습니다.
        </Section>

        {onClose && (
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>닫기</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  updated: { fontSize: 12, color: '#999', marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#222', marginTop: 12 },
  sectionBody: { fontSize: 14, color: '#444', lineHeight: 21 },
  closeBtn: { marginTop: 24, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#eef0f4' },
  closeBtnText: { color: '#333', fontSize: 15, fontWeight: '600' },
});
