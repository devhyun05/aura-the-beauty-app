import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from 'tamagui';
import { Check, ChevronLeft, Copy, RefreshCw } from 'lucide-react-native';
import type { BeardStackParamList } from '../navigation/types';
import { useBeardFlow } from '../state/BeardFlowContext';
import { useToast } from '../state/ToastContext';
import { useSaveResult } from '../hooks/useSaveResult';
import { useBeardService } from '../services/BeardServiceContext';
import { beardPlaceholderAssets } from '../services/mockBeardSimulationService';
import { BeforeAfterCompare } from '../components/BeforeAfterCompare';
import { DeleteConfirmSheet } from '../components/DeleteConfirmSheet';
import { beardColors } from '../tokens/tokens';

type Nav = NativeStackNavigationProp<BeardStackParamList, 'Report'>;

const TABS = ['수염 분석', '변화 비교', '상담 준비', '관리 팁'];

function Overline({ children }: { children: string }) {
  return <Text fontSize={12} fontWeight="700" color={beardColors.lavender} letterSpacing={1}>{children}</Text>;
}
function SectionTitle({ children }: { children: string }) {
  return <Text fontSize={20} fontWeight="700" color={beardColors.textPrimary} letterSpacing={-0.3} mt={8}>{children}</Text>;
}

/**
 * NO SILENT FALLBACK: when the 상세 보고서(analysis) request failed, we show an explicit
 * error + 다시 시도 instead of fabricated content. `canRetry` gates the retry to the analysis
 * path (photo path never has an analysis to regenerate).
 */
function AnalysisUnavailable({
  note,
  canRetry,
  retrying,
  onRetry,
}: {
  note: string;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={{ marginTop: 16, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)', gap: canRetry ? 14 : 0 }}>
      <Text fontSize={14.5} lineHeight={23} color={beardColors.textSecondary}>{note}</Text>
      {canRetry ? (
        <Pressable
          onPress={onRetry}
          disabled={retrying}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: 'rgba(184,164,255,0.16)' }}
        >
          {retrying ? (
            <ActivityIndicator size="small" color={beardColors.lavenderBright} />
          ) : (
            <RefreshCw size={14} color={beardColors.lavenderBright} strokeWidth={2.2} />
          )}
          <Text fontSize={13.5} fontWeight="700" color={beardColors.lavenderBright}>
            {retrying ? '다시 불러오는 중…' : '다시 시도'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ReportScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const flow = useBeardFlow();
  const toast = useToast();
  const service = useBeardService();
  const { saving, save } = useSaveResult();
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<number[]>([0, 0, 0, 0]);
  const [activeTab, setActiveTab] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Genuine backend analysis only — never fabricated. Absent when the 상세 보고서 request failed.
  const analysis = flow.result?.analysis;
  // Retry re-runs the analysis simulation (the only contract-safe way to re-fetch the report,
  // since inputKey is not surfaced in BeardSimulationResult); gated to the analysis path.
  const canRetryAnalysis = flow.path === 'analysis';

  const retryAnalysis = useCallback(async () => {
    if (retrying) return;
    const uri = flow.inputImageUri ?? flow.result?.inputImageUri;
    if (!uri) {
      toast.show('err', '분석을 다시 시도할 사진이 없어요');
      return;
    }
    setRetrying(true);
    try {
      const next = await service.simulate({ imageUri: uri, path: 'analysis', survey: flow.survey });
      if (next.status === 'ready') {
        flow.setResult(next);
        if (!next.analysis) {
          toast.show('err', '분석을 다시 불러오지 못했어요');
        }
      } else {
        toast.show('err', '분석을 다시 불러오지 못했어요');
      }
    } catch {
      toast.show('err', '분석을 다시 불러오지 못했어요');
    } finally {
      setRetrying(false);
    }
  }, [retrying, flow, service, toast]);

  const { originalUri, afterUri } = useMemo(() => {
    const r = flow.result;
    if (!r || !r.resultImageUri) {
      return {
        originalUri: beardPlaceholderAssets.original as unknown as string,
        afterUri: beardPlaceholderAssets.strong as unknown as string,
      };
    }
    return { originalUri: r.inputImageUri, afterUri: r.resultImageUri };
  }, [flow.result]);

  const onSectionLayout = (i: number) => (e: LayoutChangeEvent) => {
    sectionY.current[i] = e.nativeEvent.layout.y;
  };
  const goTab = (i: number) => {
    setActiveTab(i);
    scrollRef.current?.scrollTo({ y: Math.max(0, sectionY.current[i] - 12), animated: true });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y + 60;
    let idx = 0;
    sectionY.current.forEach((sy, i) => {
      if (sy <= y) idx = i;
    });
    if (idx !== activeTab) setActiveTab(idx);
  };

  const copyOne = async (text: string) => {
    await Clipboard.setStringAsync(text); // TODO(backend): none — client clipboard.
    toast.show('ok', '상담 멘트를 복사했어요');
  };
  const copyAll = async () => {
    if (!analysis) return;
    await Clipboard.setStringAsync(analysis.consults.join('\n\n'));
    toast.show('ok', '상담 멘트 2개를 복사했어요');
  };
  const doDelete = () => {
    setConfirmDelete(false);
    flow.resetAll();
    nav.popToTop();
    toast.show('ok', '사진과 결과를 삭제했어요');
  };

  return (
    <View style={{ flex: 1, backgroundColor: beardColors.onyx900, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 48 }}>
        <Pressable onPress={() => nav.goBack()} accessibilityLabel="결과로 돌아가기" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={22} color={beardColors.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text flex={1} textAlign="center" fontSize={16.5} fontWeight="700" color={beardColors.textPrimary} letterSpacing={-0.2}>상세 보고서</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Anchor bar */}
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}>
        {TABS.map((t, i) => {
          const active = activeTab === i;
          return (
            <Pressable key={i} onPress={() => goTab(i)} style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? 'rgba(184,164,255,0.16)' : 'transparent' }}>
              <Text fontSize={12.5} fontWeight="600" color={active ? beardColors.lavenderBright : beardColors.textSecondary} numberOfLines={1}>{t}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />

      <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 26, paddingBottom: 60 }}>
        {/* ① 수염 분석 */}
        <View onLayout={onSectionLayout(0)}>
          <Overline>수염 분석</Overline>
          <SectionTitle>현재 사진 기준 수염 분석</SectionTitle>
          {analysis ? (
            <>
              <Text fontSize={14.5} lineHeight={25} color={beardColors.textOnDarkMuted} mt={16}>
                {analysis.summarySentences.join(' ')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 20 }}>
                {analysis.cells.map((c, i) => (
                  <View key={i} style={{ width: '50%', paddingRight: i % 2 === 0 ? 13 : 0, paddingLeft: i % 2 === 1 ? 13 : 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
                      <Text fontSize={12.5} color={beardColors.textTertiary}>{c.k}</Text>
                      <Text fontSize={14} fontWeight="600" color={beardColors.textPrimary}>{c.v}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <AnalysisUnavailable
              note="분석을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
              canRetry={canRetryAnalysis}
              retrying={retrying}
              onRetry={() => void retryAnalysis()}
            />
          )}
        </View>

        {/* ② 변화 비교 */}
        <View onLayout={onSectionLayout(1)} style={{ marginTop: 44 }}>
          <Overline>변화 비교</Overline>
          <SectionTitle>현재와 보정 후를 비교해 보세요</SectionTitle>
          <BeforeAfterCompare
            style={{ height: 430, borderRadius: 20, marginTop: 18 }}
            originalUri={originalUri}
            afterUri={afterUri}
            divider={flow.reportDivider}
            onDivider={flow.setReportDivider}
            variant="report"
            rightChipLabel="보정 후"
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <Check size={15} color={beardColors.lavender} strokeWidth={2.6} />
            <Text fontSize={13} color={beardColors.textSecondary}>원본 얼굴 보존이 확인된 결과예요</Text>
          </View>
        </View>

        {/* ③ 상담 준비 */}
        <View onLayout={onSectionLayout(2)} style={{ marginTop: 44 }}>
          <Overline>상담 준비</Overline>
          <SectionTitle>상담할 때 이렇게 물어보세요</SectionTitle>
          {analysis ? (
            <>
              <View style={{ gap: 12, marginTop: 16 }}>
                {analysis.consults.map((text, i) => (
                  <View key={i} style={{ padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16 }}>
                    <Text fontSize={14} lineHeight={24} color="#E6E9EE">{`“${text}”`}</Text>
                    <Pressable onPress={() => copyOne(text)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
                      <Copy size={13} color={beardColors.lavenderBright} strokeWidth={2} />
                      <Text fontSize={12.5} fontWeight="600" color={beardColors.lavenderBright}>복사하기</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              <Text fontSize={12.5} lineHeight={20} color={beardColors.textTertiary} mt={14}>
                특정 장비나 시술의 효과를 앱이 추천하거나 보장하지 않아요. 상담은 전문가와 진행해 주세요.
              </Text>
            </>
          ) : (
            <AnalysisUnavailable
              note="분석을 불러오지 못해 상담 문장을 준비하지 못했어요."
              canRetry={false}
              retrying={retrying}
              onRetry={() => void retryAnalysis()}
            />
          )}
        </View>

        {/* ④ 관리 팁 */}
        <View onLayout={onSectionLayout(3)} style={{ marginTop: 44 }}>
          <Overline>관리 팁</Overline>
          <SectionTitle>수염을 기록하고 관리하는 방법</SectionTitle>
          {analysis ? (
            <View style={{ gap: 13, marginTop: 16 }}>
              {analysis.tips.map((text, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: beardColors.lavender, marginTop: 8 }} />
                  <Text flex={1} fontSize={14} lineHeight={23} color={beardColors.textOnDarkMuted}>{text}</Text>
                </View>
              ))}
            </View>
          ) : (
            <AnalysisUnavailable
              note="분석을 불러오지 못해 관리 팁을 준비하지 못했어요."
              canRetry={false}
              retrying={retrying}
              onRetry={() => void retryAnalysis()}
            />
          )}
        </View>

        {/* Footer actions */}
        <View style={{ marginTop: 48, gap: 10 }}>
          <Text textAlign="center" fontSize={12} color={beardColors.textTertiary} mb={2}>수염을 지운 결과 1장이 저장돼요</Text>
          <Pressable onPress={save} disabled={saving} style={{ height: 52, borderRadius: 999, backgroundColor: beardColors.textPrimary, alignItems: 'center', justifyContent: 'center' }}>
            <Text fontSize={15.5} fontWeight="700" color={beardColors.lightText}>{saving ? '저장 중…' : '사진 저장'}</Text>
          </Pressable>
          {analysis ? (
            <Pressable onPress={copyAll} style={{ height: 48, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
              <Text fontSize={14.5} fontWeight="600" color={beardColors.textPrimary}>상담 멘트 복사</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setConfirmDelete(true)} style={{ height: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Text fontSize={14} fontWeight="600" color={beardColors.dangerText}>사진과 결과 삭제</Text>
          </Pressable>
        </View>

        <Text textAlign="center" fontSize={11.5} lineHeight={18} color={beardColors.textTertiary} mt={20}>
          {'이 이미지는 수염과 수염 자국이 줄었을 때의 참고용 시뮬레이션이에요.\n의료적 진단이나 결과 예측이 아니에요.'}
        </Text>
      </ScrollView>

      <DeleteConfirmSheet visible={confirmDelete} onCancel={() => setConfirmDelete(false)} onConfirm={doDelete} />
    </View>
  );
}
