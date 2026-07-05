import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PersonalColorTypeCard } from '../components/PersonalColorTypeCard';
import { deletePersonalColorData, deleteSourceImage } from '../services/personalColorArtifacts';
import { analyzePersonalColorCapture } from '../services/personalColorService';
import type { PersonalColorAnalysisOutcome } from '../services/personalColorService';

export type PersonalColorCapture = {
  imageUri: string;
  photoCaptureId: string;
  capturedAt: string;
};

type Props = {
  capture: PersonalColorCapture;
  onRetake: () => void;
};

type ViewState =
  | { phase: 'analyzing' }
  | { phase: 'done'; outcome: PersonalColorAnalysisOutcome }
  | { phase: 'error'; message: string };

export function PersonalColorScreen({ capture, onRetake }: Props) {
  const sessionId = capture.photoCaptureId;
  const [state, setState] = useState<ViewState>({ phase: 'analyzing' });
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'analyzing' });
    void analyzePersonalColorCapture({
      captureId: capture.photoCaptureId,
      createdAt: capture.capturedAt,
      sessionId,
      imageUri: capture.imageUri,
      frameCount: 1,
    })
      .then(async outcome => {
        // longTermRawFrameStored:false — 결과 산출 후 원본 프레임 삭제
        await deleteSourceImage(sessionId).catch(() => undefined);
        if (!cancelled) setState({ phase: 'done', outcome });
      })
      .catch(error => {
        if (!cancelled) {
          setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [capture.capturedAt, capture.imageUri, capture.photoCaptureId, sessionId]);

  const handleDelete = useCallback(async () => {
    await deletePersonalColorData(sessionId).catch(() => undefined);
    setDeleted(true);
  }, [sessionId]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>퍼스널 컬러 분석</Text>

        {state.phase === 'analyzing' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#3a6df0" />
            <Text style={styles.dim}>기기 내에서 색을 분석하고 있어요…</Text>
          </View>
        )}

        {state.phase === 'error' && (
          <View style={styles.center}>
            <Text style={styles.error}>분석에 실패했어요.</Text>
            <Text style={styles.dim}>{state.message}</Text>
          </View>
        )}

        {state.phase === 'done' && <PersonalColorTypeCard result={state.outcome.result} />}

        <View style={styles.actions}>
          <Pressable style={styles.primaryBtn} onPress={onRetake}>
            <Text style={styles.primaryBtnText}>다시 촬영</Text>
          </Pressable>
          {state.phase === 'done' && !deleted && (
            <Pressable style={styles.secondaryBtn} onPress={handleDelete}>
              <Text style={styles.secondaryBtnText}>내 색상 데이터 삭제</Text>
            </Pressable>
          )}
          {deleted && <Text style={styles.dim}>기기에 저장된 색상 데이터를 삭제했어요.</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f5f7' },
  scroll: { padding: 16, gap: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  center: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  dim: { fontSize: 13, color: '#888', textAlign: 'center' },
  error: { fontSize: 16, color: '#c0392b', fontWeight: '600' },
  actions: { gap: 10, marginTop: 8 },
  primaryBtn: { backgroundColor: '#3a6df0', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#d0d3da' },
  secondaryBtnText: { color: '#555', fontSize: 14 },
});
