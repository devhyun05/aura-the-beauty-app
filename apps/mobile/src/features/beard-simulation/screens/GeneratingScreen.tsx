import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useReducedMotion } from 'react-native-reanimated';
import { Text } from 'tamagui';
import { Check } from 'lucide-react-native';
import type { BeardStackParamList } from '../navigation/types';
import type { BeardSimulationResult } from '../contracts/types';
import { useBeardFlow } from '../state/BeardFlowContext';
import { useBeardService } from '../services/BeardServiceContext';
import { beardPlaceholderAssets } from '../services/mockBeardSimulationService';
import { ScanOverlay } from '../components/ScanOverlay';
import { beardColors, beardTiming } from '../tokens/tokens';

type Nav = NativeStackNavigationProp<BeardStackParamList, 'Generating'>;

const LOAD_STEPS = ['수염과 그림자를 구분하고 있어요', '수염을 깨끗하게 지우고 있어요', '원본 얼굴이 유지됐는지 확인하고 있어요'];

interface StepState {
  done: number; // index of last completed step (-1 none)
  active: number;
  delayed: boolean;
}

export function GeneratingScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { path, survey, inputImageUri, setResult } = useBeardFlow();
  const service = useBeardService();
  const [st, setSt] = useState<StepState>({ done: -1, active: 0, delayed: false });

  const resolvedRef = useRef<BeardSimulationResult | null>(null);

  useEffect(() => {
    let alive = true;
    const T: ReturnType<typeof setTimeout>[] = [];
    const push = (ms: number, fn: () => void) => T.push(setTimeout(() => alive && fn(), ms));
    const started = Date.now();

    setSt({ done: -1, active: 0, delayed: false });
    push(beardTiming.loadStep1, () => setSt((s) => ({ ...s, done: 0, active: 1 })));
    push(beardTiming.delayNoticeAt, () =>
      setSt((s) => (resolvedRef.current ? s : { ...s, delayed: true })),
    );

    service
      .simulate({ imageUri: inputImageUri ?? '', path: path ?? 'photo', survey })
      .then((r) => {
        if (!alive) return;
        if (r.status !== 'ready') {
          setResult(r);
          nav.replace('Failure', { reason: r.guard.blockedReason });
          return;
        }
        resolvedRef.current = r;
        const finish = () => {
          setSt((s) => ({ ...s, done: 2, active: 2, delayed: false }));
          setResult(r);
          push(600, () => nav.replace('Result'));
        };
        const toStep3 = () => {
          setSt((s) => ({ ...s, done: 1, active: 2 }));
          push(400, finish);
        };
        const elapsed = Date.now() - started;
        const minEnd = beardTiming.loadStep3Done;
        if (elapsed >= minEnd) toStep3();
        else push(minEnd - elapsed, toStep3);
      })
      .catch(() => {
        // 전송/서버 오류 — 사진 품질 탓 기본 문구 대신 네트워크 사유를 명시한다.
        if (alive) nav.replace('Failure', { reason: '서버 연결에 문제가 있어요 · 잠시 후 다시 시도해 주세요' });
      });

    return () => {
      alive = false;
      T.forEach(clearTimeout);
    };
  }, []);

  const cardSource = inputImageUri ? { uri: inputImageUri } : beardPlaceholderAssets.original;

  return (
    <View style={{ flex: 1, backgroundColor: beardColors.onyxLoadingBase, alignItems: 'center', paddingTop: insets.top + 56 }}>
      {/* Top radial highlight approximation */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 260, backgroundColor: beardColors.onyxLoadingTop, opacity: 0.5 }} />

      <View style={{ width: 250, height: 350, borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 50, shadowOffset: { width: 0, height: 18 } }}>
        <Image source={cardSource} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,9,11,0.28)' }} />
        <ScanOverlay reducedMotion={reduced} />
      </View>

      {/* Step list */}
      <View style={{ gap: 17, marginTop: 38, width: 282 }}>
        {LOAD_STEPS.map((label, i) => {
          const done = st.done >= i;
          const active = !done && st.active === i;
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? beardColors.lavender : 'transparent',
                  borderWidth: 1.5,
                  borderColor: done ? beardColors.lavender : active ? 'rgba(184,164,255,0.7)' : 'rgba(255,255,255,0.22)',
                }}
              >
                {done ? <Check size={12} color={beardColors.onLavender} strokeWidth={3.2} /> : null}
              </View>
              <Text fontSize={14} color={done ? beardColors.textPrimary : active ? beardColors.lavenderText : '#6B7280'}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      {st.delayed ? (
        <View style={{ marginTop: 26, maxWidth: 290, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: beardColors.glassFill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
          <Text fontSize={12.5} lineHeight={19} color={beardColors.textSecondary} textAlign="center">
            {'평소보다 조금 더 걸리고 있어요.\n원본 얼굴이 유지됐는지 꼼꼼히 확인하는 중이에요.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
