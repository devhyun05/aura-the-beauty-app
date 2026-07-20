import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from 'tamagui';
import { MoreVertical, X } from 'lucide-react-native';
import type { BeardStackParamList } from '../navigation/types';
import { useBeardFlow } from '../state/BeardFlowContext';
import { useToast } from '../state/ToastContext';
import { useSaveResult } from '../hooks/useSaveResult';
import { beardPlaceholderAssets } from '../services/mockBeardSimulationService';
import { BeforeAfterCompare } from '../components/BeforeAfterCompare';
import { HoldOriginalButton } from '../components/HoldOriginalButton';
import { GlassPanel } from '../components/GlassPanel';
import { beardColors, beardTiming } from '../tokens/tokens';

type Nav = NativeStackNavigationProp<BeardStackParamList, 'Result'>;

export function ResultScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const flow = useBeardFlow();
  const toast = useToast();
  const { saving, save } = useSaveResult();

  const [holding, setHolding] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const showOriginal = holding || pinned;

  const isAnalysis = flow.path === 'analysis';
  const result = flow.result;

  // One-time hint toast on first result entry per flow.
  useEffect(() => {
    if (!flow.resultHintShown) {
      flow.markResultHintShown();
      toast.show('ok', '누르고 있는 동안 원본을 보여드려요 · 짧게 탭하면 고정할 수 있어요', beardTiming.toastHint);
    }
  }, []);

  const { originalUri, afterUri } = useMemo(() => {
    if (!result || !result.resultImageUri) {
      return {
        originalUri: beardPlaceholderAssets.original as unknown as string,
        afterUri: beardPlaceholderAssets.strong as unknown as string,
      };
    }
    return { originalUri: result.inputImageUri, afterUri: result.resultImageUri };
  }, [result]);

  const title = flow.path === 'photo' ? '수염 자국 정리' : '수염 변화 미리보기';

  const exit = () => {
    flow.resetForNewPhoto();
    nav.popToTop();
  };
  const newPhoto = () => {
    setMenuOpen(false);
    flow.resetForNewPhoto();
    nav.replace('Camera');
  };
  const policy = () => {
    setMenuOpen(false);
    toast.show('ok', '사진 처리 기준 문서로 이동해요 (프로토타입)'); // TODO(backend): link real policy doc.
  };
  const openReport = () => {
    setHolding(false);
    setPinned(false);
    nav.navigate('Report');
  };

  return (
    <View style={{ flex: 1, backgroundColor: beardColors.onyx950 }}>
      <BeforeAfterCompare
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        originalUri={originalUri}
        afterUri={afterUri}
        divider={flow.divider}
        onDivider={flow.setDivider}
        showOriginal={showOriginal}
        variant="result"
        rightChipLabel="보정 후"
      />

      {/* Top gradient */}
      <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140 }} pointerEvents="none" />

      {/* Header */}
      <View style={{ position: 'absolute', top: insets.top, left: 12, right: 12, flexDirection: 'row', alignItems: 'center' }}>
        <HeaderCircle onPress={exit} label="닫기">
          <X size={19} color="#FFFFFF" strokeWidth={2} />
        </HeaderCircle>
        <Text flex={1} textAlign="center" fontSize={17} fontWeight="700" color={beardColors.textPrimary} letterSpacing={-0.2}>
          {title}
        </Text>
        <HeaderCircle onPress={() => setMenuOpen((v) => !v)} label="더보기">
          <MoreVertical size={19} color="#FFFFFF" strokeWidth={2} />
        </HeaderCircle>
      </View>

      {/* Menu */}
      {menuOpen ? (
        <>
          <Pressable onPress={() => setMenuOpen(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ position: 'absolute', top: insets.top + 52, right: 14, width: 210, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: beardColors.glassBorder, backgroundColor: 'rgba(30,34,40,0.96)' }}>
            <MenuItem label="새 사진으로 다시 시작" onPress={newPhoto} />
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <MenuItem label="사진 처리 기준" onPress={policy} />
          </View>
        </>
      ) : null}

      {/* Bottom glass panel */}
      <GlassPanel radius={26} style={{ position: 'absolute', left: 10, right: 10, bottom: Math.max(insets.bottom, 14) }}>
        <View style={{ padding: 18, paddingBottom: 16 }}>
          <Text textAlign="center" fontSize={12.5} fontWeight="600" color={beardColors.textSecondary} mb={4}>
            수염을 깨끗하게 지운 결과예요
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 17 }}>
            <HoldOriginalButton
              showOriginal={showOriginal}
              onHoldingChange={setHolding}
              onTogglePin={() => setPinned((v) => !v)}
            />
            <View style={{ flex: 1, gap: 9 }}>
              {isAnalysis ? (
                <>
                  <PrimaryPill height={50} label="상세 보고서 보기" onPress={openReport} />
                  <GlassPill height={46} label={saving ? '저장 중…' : '사진 저장'} loading={saving} onPress={save} />
                </>
              ) : (
                <>
                  <PrimaryPill height={52} label={saving ? '저장 중…' : '사진 저장'} loading={saving} onPress={save} />
                  {flow.savedOnce ? <GlassPill height={46} label="완료" onPress={exit} /> : null}
                </>
              )}
            </View>
          </View>

          <Text textAlign="center" fontSize={11.5} lineHeight={17} color={beardColors.textTertiaryAlt} mt={13} mx={4}>
            이 이미지는 수염과 수염 자국이 줄었을 때의 참고용 시뮬레이션이에요.
          </Text>
        </View>
      </GlassPanel>
    </View>
  );
}

function HeaderCircle({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <BlurView intensity={16} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,22,26,0.4)' }} />
      {children}
    </Pressable>
  );
}

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: pressed ? 'rgba(255,255,255,0.06)' : 'transparent' })}>
      <Text fontSize={14} fontWeight="500" color={beardColors.textPrimary}>{label}</Text>
    </Pressable>
  );
}

function PrimaryPill({ height, label, onPress, loading }: { height: number; label: string; onPress: () => void; loading?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={{ height, borderRadius: 999, backgroundColor: beardColors.textPrimary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
      {loading ? <ActivityIndicator size="small" color={beardColors.lightText} /> : null}
      <Text fontSize={height >= 52 ? 16 : 15.5} fontWeight="700" color={beardColors.lightText}>{label}</Text>
    </Pressable>
  );
}

function GlassPill({ height, label, onPress, loading }: { height: number; label: string; onPress: () => void; loading?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={{ height, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
      {loading ? <ActivityIndicator size="small" color={beardColors.textPrimary} /> : null}
      <Text fontSize={14.5} fontWeight="600" color={beardColors.textPrimary}>{label}</Text>
    </Pressable>
  );
}
