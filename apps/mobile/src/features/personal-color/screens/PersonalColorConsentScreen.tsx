import React, { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { acceptPersonalColorConsent } from '../services/personalColorConsentStore';

type Props = {
  onConsented: () => void;
  onCancel: () => void;
  onOpenPrivacyPolicy?: () => void;
  nowIso: string;
};

// feature-scoped 민감정보(얼굴 이미지) 동의 게이트. 최초 1회, 촬영 전.
export function PersonalColorConsentScreen({ onConsented, onCancel, onOpenPrivacyPolicy, nowIso }: Props) {
  const [busy, setBusy] = useState(false);

  const handleAccept = async () => {
    setBusy(true);
    try {
      await acceptPersonalColorConsent(nowIso);
      onConsented();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>퍼스널 컬러 분석 동의</Text>
        <Text style={styles.body}>
          퍼스널 컬러 분석을 위해 얼굴 사진을 촬영합니다. 아래 내용에 동의해 주세요.
        </Text>
        <View style={styles.points}>
          <Text style={styles.point}>· 촬영한 얼굴 이미지는 기기 안에서만 처리되며 서버로 전송되지 않습니다.</Text>
          <Text style={styles.point}>· 색 추출 후 원본 프레임은 즉시 삭제되고, 결과만 기기에 저장됩니다.</Text>
          <Text style={styles.point}>· 언제든 “내 색상 데이터 삭제”로 저장된 데이터를 지울 수 있습니다.</Text>
          <Text style={styles.point}>· 분석 결과는 참고용이며 조명·화장에 따라 달라질 수 있습니다.</Text>
        </View>

        {onOpenPrivacyPolicy && (
          <Pressable onPress={onOpenPrivacyPolicy}>
            <Text style={styles.link}>개인정보처리방침 보기</Text>
          </Pressable>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryBtn, busy && styles.disabled]}
            onPress={handleAccept}
            disabled={busy}>
            <Text style={styles.primaryBtnText}>동의하고 시작</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onCancel}>
            <Text style={styles.secondaryBtnText}>취소</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  body: { fontSize: 15, color: '#333', lineHeight: 22 },
  points: { gap: 10, backgroundColor: '#f6f7f9', borderRadius: 12, padding: 16 },
  point: { fontSize: 14, color: '#444', lineHeight: 20 },
  link: { fontSize: 14, color: '#3a6df0', textDecorationLine: 'underline' },
  actions: { gap: 10, marginTop: 12 },
  primaryBtn: { backgroundColor: '#3a6df0', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  secondaryBtnText: { color: '#888', fontSize: 14 },
});
