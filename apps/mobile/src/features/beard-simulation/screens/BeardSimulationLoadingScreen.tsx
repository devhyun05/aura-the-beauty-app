import React from 'react';
import {ActivityIndicator, Image, StyleSheet, Text, View} from 'react-native';

interface BeardSimulationLoadingScreenProps {
  photoUri: string;
  onCancel?: () => void;
}

export function BeardSimulationLoadingScreen({photoUri}: BeardSimulationLoadingScreenProps) {
  return (
    <View style={styles.screen}>
      <Image source={{uri: photoUri}} style={styles.photo} resizeMode="cover" blurRadius={12} />
      <View style={styles.overlay}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.title}>수염 상태를 분석하고 있어요</Text>
        <Text style={styles.step}>부위별 수염·그림자 파악 → 단계별 이미지 생성 → 원본 보존 검증</Text>
        <Text style={styles.note}>
          결과는 참고용 합성 이미지예요. 원본 얼굴형은 그대로 유지돼요.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#111'},
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.4,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 14,
  },
  title: {fontSize: 18, fontWeight: '700', color: '#fff'},
  step: {fontSize: 13, color: '#ddd', textAlign: 'center', lineHeight: 19},
  note: {fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 14},
});
