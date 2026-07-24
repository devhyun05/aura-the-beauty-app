import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, CircleAlert, MoreHorizontal, Share2, X } from 'lucide-react-native';
import {
  StoryReportPager,
  type StoryReportPage,
  type StoryReportPagerRef,
  type StoryReportSection,
} from '../../shared/ui/StoryReportPager';
import { color, font, radius, shadow } from './reportTokens';
import type { BandKey, ReportData, ReportScreenProps } from './reportTypes';
import {
  buildFaceReportStoryModel,
  FACE_REPORT_STORY_SECTIONS,
  type FaceReportStoryPage,
  type FaceReportStorySection,
} from './services/reportStoryModel';
import {keepActivePageContent} from './services/reportContentUpgrade';
import {
  resolveReportCompletionStatus,
  type ReportCompletionStage,
} from './services/reportCompletionStatus';
import {GoldenMaskCard} from './components/GoldenMaskCard';
import {
  disposePreparedGoldenMask,
  preloadGoldenMaskForReport,
} from './services/goldenMaskPreloadService';
import {FaceReportCaptureAssetContext} from './services/reportCaptureAssetContext';
import {captureScrollableReportPage} from './services/reportImageShare';

type ReportPageCaptureTarget = {
  snapshotContentContainer: boolean;
  target: unknown;
};

type GoldenMaskCaptureState = {
  enabled: boolean;
  posterRequestKey: number;
  posterUri: string | null;
};

type GoldenMaskPosterResult =
  | {status: 'idle' | 'pending' | 'unavailable'}
  | {status: 'ready'; uri: string};

export type ReportExportPage = {
  id: string;
  title: string;
};

export type ReportExportSnapshot = {
  activePageId: string | null;
  pages: ReportExportPage[];
};

export interface ReportScreenScaffoldRef {
  capturePage: (
    pageId: string,
    shouldContinue?: () => boolean,
  ) => Promise<string>;
  getExportSnapshot: () => ReportExportSnapshot;
  restorePage: (pageId: string | null) => void;
}

const STORY_SECTION_NAV_LABELS: Record<FaceReportStorySection['id'], string> = {
  summary: '요약',
  face: '얼굴',
  'color-skin': '컬러·피부',
  style: '스타일',
};
import { ScrollAnimContext } from './visuals/RiseIn';
import {S1CombinedSummary} from './sections/S1CombinedSummary';
import { S2Proportion } from './sections/S2Proportion';
import { S3RegionCard } from './sections/S3Features';
import { S4DrapePalette, S4ToneOverview } from './sections/S4PersonalColor';
import { S5Body } from './sections/S5Body';
import { S6Impression } from './sections/S6Impression';
import { S7LookCard } from './sections/S7Styling';
import { S8Skin } from './sections/S8Skin';
import { S9StyleLanes } from './sections/S9StyleLanes';

declare const require: (moduleName: string) => number;

function ChapterMark({
  inset,
  section,
}: {
  inset: boolean;
  section: FaceReportStorySection;
}) {
  return (
    <View
      style={{
        gap: 11,
        marginBottom: 18,
        ...(inset ? null : {paddingHorizontal: 20, paddingTop: 22}),
      }}>
      <View
        style={{
          backgroundColor: color.accentDeep,
          borderRadius: 1,
          height: 2,
          width: 44,
        }}
      />
      <Text style={[font(10.5, '700', undefined, 1.25), {color: color.accentDeep}]}>
        {section.number} · {section.englishTitle}
      </Text>
    </View>
  );
}

function ReportCompletionStepper({
  accessibilityLabel,
  stages,
}: {
  accessibilityLabel: string;
  stages: ReportCompletionStage[];
}) {
  const getStateLabel = (stage: ReportCompletionStage) => {
    if (stage.state === 'complete') return '완료';
    if (stage.state === 'active') return '진행 중';
    if (stage.state === 'pending') return '대기';
    if (stage.state === 'partial') return '일부 완료';
    if (stage.state === 'fallback') return '기본 내용';
    return '중단';
  };
  const getStateColor = (stage: ReportCompletionStage) => {
    if (stage.state === 'complete') return color.accentDeep;
    if (stage.state === 'active') return '#159CCB';
    if (stage.state === 'partial' || stage.state === 'fallback') return '#A36A13';
    if (stage.state === 'failed') return '#B24B4B';
    return color.faint;
  };

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
      style={{alignItems: 'flex-start', flexDirection: 'row', marginTop: 9}}>
      {stages.map((stage, index) => {
        const stateColor = getStateColor(stage);
        return (
          <React.Fragment key={stage.key}>
            {index > 0 ? (
              <View
                style={{
                  backgroundColor:
                    stage.state === 'pending' ? color.divider : stateColor,
                  height: 1,
                  marginHorizontal: 3,
                  marginTop: 11,
                  opacity: 0.72,
                  width: 16,
                }}
              />
            ) : null}
            <View style={{alignItems: 'center', flex: 1, gap: 3, minWidth: 0}}>
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor:
                    stage.state === 'pending' ? color.surface2 : stateColor,
                  borderColor:
                    stage.state === 'pending' ? color.divider : stateColor,
                  borderRadius: 11,
                  borderWidth: 1,
                  height: 22,
                  justifyContent: 'center',
                  width: 22,
                }}>
                {stage.state === 'active' ? (
                  <ActivityIndicator color={color.white} size="small" />
                ) : stage.state === 'complete' ? (
                  <Check color={color.white} size={13} strokeWidth={3} />
                ) : stage.state === 'partial' || stage.state === 'fallback' ? (
                  <CircleAlert color={color.white} size={12} strokeWidth={2.4} />
                ) : stage.state === 'failed' ? (
                  <X color={color.white} size={12} strokeWidth={2.8} />
                ) : (
                  <View
                    style={{
                      backgroundColor: color.faint,
                      borderRadius: 3,
                      height: 5,
                      width: 5,
                    }}
                  />
                )}
              </View>
              <Text
                numberOfLines={2}
                style={[
                  font(11, '700', 1.25),
                  {color: color.ink, textAlign: 'center'},
                ]}>
                {stage.label}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  font(10.5, '600', 1.25),
                  {color: stateColor, textAlign: 'center'},
                ]}>
                {getStateLabel(stage)}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

function StoryContentCard({
  section,
  pageId,
  pagerRef,
  registerCaptureTarget,
  title,
  sub,
  children,
  inset = false,
  scrollEnabled = true,
  showChapterHeader = false,
}: {
  section: FaceReportStorySection;
  pageId: string;
  pagerRef: React.RefObject<StoryReportPagerRef | null>;
  registerCaptureTarget: (
    pageId: string,
    target: ReportPageCaptureTarget | null,
  ) => void;
  title?: string;
  sub?: string;
  children: React.ReactNode;
  inset?: boolean;
  scrollEnabled?: boolean;
  showChapterHeader?: boolean;
}) {
  const unlockPager = () => pagerRef.current?.setPagingEnabled(true);
  return (
    <View style={{flex: 1, backgroundColor: section.tint}}>
      <ScrollView
        ref={node =>
          registerCaptureTarget(
            pageId,
            node
              ? {snapshotContentContainer: true, target: node}
              : null,
          )
        }
        contentContainerStyle={{flexGrow: 1, paddingBottom: 30, ...(inset ? {paddingHorizontal: 16, paddingTop: 20} : null)}}
        directionalLockEnabled
        nestedScrollEnabled
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator
        style={{backgroundColor: section.tint}}
        onScrollBeginDrag={() => pagerRef.current?.setPagingEnabled(false)}
        onScrollEndDrag={unlockPager}
        onMomentumScrollEnd={unlockPager}
        onTouchEnd={unlockPager}>
        {showChapterHeader ? <ChapterMark inset={inset} section={section} /> : null}
        {title ? (
          <View style={{gap: 7, marginBottom: 16}}>
            <Text style={[font(22, '800', 1.25, -0.25), {color: color.ink}]}>{title}</Text>
            {sub ? <Text style={[font(13.5, '400', 1.55), {color: color.text}]}>{sub}</Text> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}

function SummaryStoryCard({
  active,
  captureGoldenMask,
  data,
  entryResetKey,
  onGoldenMaskPosterReady,
  onGoldenMaskPosterUnavailable,
  onInteractionChange,
  onPressCta,
  pageId,
  pagerRef,
  registerCaptureTarget,
}: {
  active: boolean;
  captureGoldenMask: GoldenMaskCaptureState;
  data: ReportScreenProps['data'];
  entryResetKey: string;
  onGoldenMaskPosterReady: (uri: string) => void;
  onGoldenMaskPosterUnavailable: () => void;
  onInteractionChange: (interacting: boolean) => void;
  onPressCta?: () => void;
  pageId: string;
  pagerRef: React.RefObject<StoryReportPagerRef | null>;
  registerCaptureTarget: (
    pageId: string,
    target: ReportPageCaptureTarget | null,
  ) => void;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [maskLayoutY, setMaskLayoutY] = useState(Number.POSITIVE_INFINITY);
  const [maskMounted, setMaskMounted] = useState(false);
  const [maskInteracting, setMaskInteracting] = useState(false);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({animated: false, y: 0});
      setMaskLayoutY(Number.POSITIVE_INFINITY);
      setMaskMounted(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [entryResetKey]);

  const updateMaskVisibility = React.useCallback(
    (offsetY: number) => {
      if (
        !maskMounted &&
        Number.isFinite(maskLayoutY) &&
        offsetY + viewportHeight + 160 >= maskLayoutY
      ) {
        setMaskMounted(true);
      }
    },
    [maskLayoutY, maskMounted, viewportHeight],
  );

  React.useEffect(() => {
    updateMaskVisibility(0);
  }, [updateMaskVisibility]);

  React.useEffect(() => {
    if (captureGoldenMask.enabled) {
      setMaskMounted(true);
    }
  }, [captureGoldenMask.enabled]);

  const handleInteractionChange = React.useCallback(
    (interacting: boolean) => {
      setMaskInteracting(interacting);
      onInteractionChange(interacting);
    },
    [onInteractionChange],
  );

  return (
    <View
      onLayout={event => setViewportHeight(Math.round(event.nativeEvent.layout.height))}
      style={{backgroundColor: color.surface, flex: 1}}>
      <ScrollView
        ref={node => {
          scrollRef.current = node;
          registerCaptureTarget(
            pageId,
            node
              ? {snapshotContentContainer: true, target: node}
              : null,
          );
        }}
        contentContainerStyle={{flexGrow: 1}}
        directionalLockEnabled
        nestedScrollEnabled
        onMomentumScrollEnd={() => pagerRef.current?.setPagingEnabled(true)}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          updateMaskVisibility(event.nativeEvent.contentOffset.y);
        }}
        onScrollBeginDrag={() => pagerRef.current?.setPagingEnabled(false)}
        onScrollEndDrag={() => pagerRef.current?.setPagingEnabled(true)}
        scrollEnabled={!maskInteracting}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
        style={{backgroundColor: color.surface}}>
        <S1CombinedSummary
          data={data.s1}
          introMinHeight={viewportHeight || undefined}
          onPressCta={onPressCta}>
          {data.goldenMask ? (
            <View
              onLayout={event => {
                const nextY = event.nativeEvent.layout.y;
                setMaskLayoutY(nextY);
              }}>
              {maskMounted ? (
                <GoldenMaskCard
                  active={active}
                  captureMode={captureGoldenMask.enabled}
                  capturePosterUri={captureGoldenMask.posterUri}
                  descriptor={data.goldenMask}
                  layout="evidence"
                  onInteractionChange={handleInteractionChange}
                  onPosterReady={onGoldenMaskPosterReady}
                  onPosterUnavailable={onGoldenMaskPosterUnavailable}
                  pagerRef={pagerRef}
                  posterRequestKey={captureGoldenMask.posterRequestKey}
                  reportId={data.reportId}
                  sourcePhoto={data.s1.photo}
                />
              ) : (
                <View
                  accessibilityLabel="3D 얼굴 상세 보기를 준비하는 영역"
                  style={{
                    alignItems: 'center',
                    backgroundColor: color.surface2,
                    borderRadius: 28,
                    height: 320,
                    justifyContent: 'center',
                  }}>
                  <ActivityIndicator color={color.muted} size="small" />
                </View>
              )}
            </View>
          ) : null}
        </S1CombinedSummary>
      </ScrollView>
    </View>
  );
}

function ReportGenerationStatus({
  errorMessage,
  onRetake,
}: {
  errorMessage?: string;
  onRetake?: () => void;
}) {
  const failed = Boolean(errorMessage);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: color.surface,
        borderColor: failed ? '#E7C5C5' : color.divider,
        borderRadius: radius.lg,
        borderWidth: 1,
        gap: 16,
        padding: 22,
      }}>
      <View style={{alignItems: 'center', gap: 10}}>
        {failed ? null : <ActivityIndicator color={color.accentDeep} size="small" />}
        <Text style={[font(18, '800'), {color: color.ink, textAlign: 'center'}]}>
          {failed ? '상세 보고서 생성을 완료하지 못했어요' : '상세 보고서를 계속 만들고 있어요'}
        </Text>
        <Text style={[font(13, '400', 1.6), {color: color.text, textAlign: 'center'}]}>
          {failed
            ? errorMessage
            : '지금 보이는 핵심 결과는 그대로 유지되고, 준비되는 섹션이 이 보고서에 이어서 채워집니다.'}
        </Text>
      </View>
      {failed && onRetake ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetake}
          style={{
            alignItems: 'center',
            alignSelf: 'center',
            backgroundColor: color.accentDeep,
            borderRadius: radius.pill,
            paddingHorizontal: 22,
            paddingVertical: 12,
          }}>
          <Text style={[font(13, '700'), {color: color.white}]}>다시 촬영</Text>
        </Pressable>
      ) : (
        <View style={{gap: 9}}>
          {[0.82, 0.68, 0.74].map((width, index) => (
            <View
              key={index}
              style={{
                alignSelf: 'flex-start',
                backgroundColor: color.divider,
                borderRadius: radius.pill,
                height: 10,
                opacity: 0.72 - index * 0.12,
                width: `${width * 100}%`,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function MakeupCtaCard({
  data,
  onPress,
  pageId,
  registerCaptureTarget,
}: {
  data: ReportScreenProps['data'];
  onPress?: () => void;
  pageId: string;
  registerCaptureTarget: (
    pageId: string,
    target: ReportPageCaptureTarget | null,
  ) => void;
}) {
  return (
    <View
      ref={node =>
        registerCaptureTarget(
          pageId,
          node
            ? {snapshotContentContainer: false, target: node}
            : null,
        )
      }
      style={{flex: 1}}>
      <ImageBackground
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={require('./assets/covers/makeup-cta.jpg')}
        style={{flex: 1}}>
        <LinearGradient
          colors={['rgba(12,28,34,0.25)', 'rgba(12,28,34,0.82)']}
          style={{position: 'absolute', inset: 0}}
        />
        <ScrollView
          contentContainerStyle={{flexGrow: 1, justifyContent: 'flex-end', padding: 24, gap: 14}}
          directionalLockEnabled
          showsVerticalScrollIndicator={false}>
          <View style={{gap: 7, marginBottom: 4}}>
            <Text
              style={{
                color: color.white,
                fontFamily: 'Pretendard',
                fontSize: 34,
                fontWeight: '800',
                letterSpacing: -0.6,
                lineHeight: 40,
              }}>
              MAKEUP
            </Text>
            <Text style={[font(17, '700'), {color: color.white}]}>{data.footer.cta}</Text>
          </View>
          <Text style={[font(11.5, '400', 1.55), {color: 'rgba(255,255,255,0.8)', textAlign: 'center'}]}>
            {data.footer.disclaimer}
          </Text>
          <Pressable
            accessibilityLabel={data.footer.cta}
            accessibilityRole="button"
            onPress={onPress}
            style={({pressed}) => [{
              alignItems: 'center', backgroundColor: color.accentDeep, borderRadius: radius.lg,
              paddingVertical: 16, opacity: pressed ? 0.86 : 1,
            }, shadow.cta]}>
            <Text style={[font(14.5, '800'), {color: color.white}]}>{data.footer.cta}</Text>
          </Pressable>
        </ScrollView>
      </ImageBackground>
    </View>
  );
}

/**
 * Story report screen: editorial covers + meaning-complete horizontal cards.
 * Pure & props-driven — navigation, retake and survey actions bubble up as callbacks.
 */
export const ReportScreenScaffold = React.forwardRef<
  ReportScreenScaffoldRef,
  ReportScreenProps
>(function ReportScreenScaffold({
  data: incomingData,
  entryResetKey,
  onBack,
  onGoldenMaskInteractionChange,
  onMore,
  onShare,
  onRetake,
  onResurvey,
  onPressCta,
}: ReportScreenProps, ref) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const pagerRef = useRef<StoryReportPagerRef | null>(null);
  const captureTargetsRef = useRef(
    new Map<string, ReportPageCaptureTarget>(),
  );
  const captureAssetStatesRef = useRef(new Map<string, boolean>());
  const goldenMaskPosterRequestKeyRef = useRef(0);
  const goldenMaskPosterResultRef = useRef<GoldenMaskPosterResult>({
    status: 'idle',
  });
  const [captureGoldenMask, setCaptureGoldenMask] =
    useState<GoldenMaskCaptureState>({
      enabled: false,
      posterRequestKey: 0,
      posterUri: null,
    });
  const [data, setData] = useState(incomingData);
  const [pendingData, setPendingData] = useState<ReportData | null>(null);
  const dataRef = useRef(data);
  const initialModel = useMemo(
    () => buildFaceReportStoryModel(incomingData),
    [incomingData],
  );
  const initialPageId =
    incomingData.initialPageId ??
    (incomingData.goldenMask
      ? 'summary:overview'
      : initialModel.pages[0]?.id ?? null);
  const [activePageId, setActivePageId] = useState(initialPageId);
  const activePageIdRef = useRef(activePageId);
  const registerCaptureTarget = React.useCallback(
    (pageId: string, target: ReportPageCaptureTarget | null) => {
      if (target) {
        captureTargetsRef.current.set(pageId, target);
      } else {
        captureTargetsRef.current.delete(pageId);
      }
    },
    [],
  );
  const captureAssetContext = useMemo(
    () => ({
      markAssetPending: (assetId: string) => {
        captureAssetStatesRef.current.set(assetId, false);
      },
      markAssetSettled: (assetId: string) => {
        captureAssetStatesRef.current.set(assetId, true);
      },
      registerAsset: (assetId: string) => {
        captureAssetStatesRef.current.set(assetId, false);
      },
      unregisterAsset: (assetId: string) => {
        captureAssetStatesRef.current.delete(assetId);
      },
    }),
    [],
  );
  const handleGoldenMaskPosterReady = React.useCallback((uri: string) => {
    if (goldenMaskPosterResultRef.current.status === 'pending') {
      goldenMaskPosterResultRef.current = {status: 'ready', uri};
    }
  }, []);
  const handleGoldenMaskPosterUnavailable = React.useCallback(() => {
    if (goldenMaskPosterResultRef.current.status === 'pending') {
      goldenMaskPosterResultRef.current = {status: 'unavailable'};
    }
  }, []);
  const reportCompletion = resolveReportCompletionStatus(
    pendingData ?? data,
  );

  React.useEffect(() => {
    const current = dataRef.current;
    if (current === incomingData) return;
    const sameReport = current.reportId === incomingData.reportId;
    const isContentUpgrade =
      sameReport &&
      (
        (
          current.generationStatus === 'loading' &&
          incomingData.generationStatus === undefined
        ) ||
        (incomingData.contentRevision ?? 0) >
          (current.contentRevision ?? 0)
      );
    const nextData = isContentUpgrade
      ? keepActivePageContent(
          current,
          incomingData,
          activePageIdRef.current,
        )
      : incomingData;
    dataRef.current = nextData;
    setData(nextData);
    setPendingData(isContentUpgrade ? incomingData : null);
  }, [incomingData]);

  const storyModel = useMemo(() => buildFaceReportStoryModel(data), [data]);
  const resetKey = `${data.reportId}:${data.s1.photo.uri ?? 'report'}:${data.s1.dateLine}`;
  const initialStoryPageId =
    data.initialPageId ??
    (data.goldenMask ? 'summary:overview' : storyModel.pages[0]?.id ?? null);
  const handlePageChange = React.useCallback((pageId: string) => {
    activePageIdRef.current = pageId;
    setActivePageId(pageId);
    setPendingData(pending => {
      if (!pending) return null;
      dataRef.current = pending;
      setData(pending);
      return null;
    });
  }, []);
  const handleGoldenMaskInteractionChange = React.useCallback(
    (interacting: boolean) => {
      // Own both parent axes for the entire touch. PanResponder capture alone
      // does not reliably stop an already-mounted native ScrollView on iOS.
      pagerRef.current?.setPagingEnabled(!interacting);
      onGoldenMaskInteractionChange?.(interacting);
    },
    [onGoldenMaskInteractionChange],
  );

  React.useEffect(() => {
    if (!data.goldenMask) {
      return undefined;
    }
    const startedAt = Date.now();
    console.info('[aura:golden-mask] report-prefetch:start', {
      reportId: data.reportId,
    });
    void preloadGoldenMaskForReport(data.reportId, data.goldenMask).then(
      result => {
        console.info('[aura:golden-mask] report-prefetch:settled', {
          elapsedMs: Date.now() - startedAt,
          ready: result.ready,
          reportId: data.reportId,
        });
      },
    );

    return () => {
      disposePreparedGoldenMask(data.reportId);
    };
  }, [
    data.goldenMask?.topologyFingerprint,
    data.reportId,
  ]);

  const openRegionCard = (key: BandKey) => {
    const pageId = storyModel.featurePageIds[key];
    if (pageId) pagerRef.current?.goToPage(pageId);
  };

  const sectionById = new Map(storyModel.sections.map(section => [section.id, section]));
  const renderContent = (page: FaceReportStoryPage, section: FaceReportStorySection) => {
    const showChapterHeader = section.id !== 'summary';
    const captureProps = {
      pageId: page.id,
      registerCaptureTarget,
    };
    switch (page.contentKey) {
      case 'summary:combined':
      case 'summary':
        return (
          <SummaryStoryCard
            active={activePageId === page.id}
            captureGoldenMask={captureGoldenMask}
            data={data}
            entryResetKey={entryResetKey ?? resetKey}
            onGoldenMaskPosterReady={handleGoldenMaskPosterReady}
            onGoldenMaskPosterUnavailable={handleGoldenMaskPosterUnavailable}
            {...captureProps}
            onInteractionChange={handleGoldenMaskInteractionChange}
            onPressCta={onPressCta}
            pagerRef={pagerRef}
          />
        );
      case 'summary:generation':
        return (
          <StoryContentCard
            {...captureProps}
            inset
            pagerRef={pagerRef}
            section={section}
            showChapterHeader={showChapterHeader}
            sub="완성되지 않은 설명을 임의로 채우지 않아요."
            title="보고서 생성 상태">
            <ReportGenerationStatus
              errorMessage={data.generationError}
              onRetake={onRetake}
            />
          </StoryContentCard>
        );
      case 'proportion':
        return data.s2 ? (
          <StoryContentCard {...captureProps} section={section} pagerRef={pagerRef} showChapterHeader={showChapterHeader}>
            <S2Proportion data={data.s2} onOpenRegionCard={openRegionCard} onRetake={onRetake} />
          </StoryContentCard>
        ) : null;
      case 'personal-color:tone':
        return data.s4 ? (
          <StoryContentCard {...captureProps} section={section} pagerRef={pagerRef} title={data.s4.title} sub={data.s4.sub} inset showChapterHeader={showChapterHeader}>
            <S4ToneOverview data={data.s4} />
          </StoryContentCard>
        ) : null;
      case 'personal-color:drape':
        return data.s4 ? (
          <StoryContentCard {...captureProps} section={section} pagerRef={pagerRef} title={data.s4.drape.title} sub={data.s4.drape.sub} inset showChapterHeader={showChapterHeader}>
            <S4DrapePalette data={data.s4} showHeader={false} />
          </StoryContentCard>
        ) : null;
      case 'body':
        return data.s5 ? (
          <StoryContentCard {...captureProps} section={section} pagerRef={pagerRef} showChapterHeader={showChapterHeader}>
            <S5Body data={data.s5} onResurvey={onResurvey} />
          </StoryContentCard>
        ) : null;
      case 'impression':
        return data.s6 ? <StoryContentCard {...captureProps} section={section} pagerRef={pagerRef} showChapterHeader={showChapterHeader}><S6Impression data={data.s6} /></StoryContentCard> : null;
      case 'styling:natural':
        return data.s7 ? (
          <StoryContentCard {...captureProps} section={section} pagerRef={pagerRef} title={data.s7.naturalCard.title} inset showChapterHeader={showChapterHeader}>
            <S7LookCard card={data.s7.naturalCard} showHeader={false} />
          </StoryContentCard>
        ) : null;
      case 'styling:glam':
        return data.s7 ? (
          <StoryContentCard {...captureProps} section={section} pagerRef={pagerRef} title={data.s7.glamCard.title} inset showChapterHeader={showChapterHeader}>
            <S7LookCard card={data.s7.glamCard} showHeader={false} />
          </StoryContentCard>
        ) : null;
      case 'styling:lanes':
        return data.s9 ? (
          <StoryContentCard {...captureProps} section={section} pagerRef={pagerRef} title={data.s9.title} sub={data.s9.sub} inset showChapterHeader={showChapterHeader}>
            <S9StyleLanes data={data.s9} showHeader={false} />
          </StoryContentCard>
        ) : null;
      case 'skin':
        return data.s8 ? <StoryContentCard {...captureProps} section={section} pagerRef={pagerRef} showChapterHeader={showChapterHeader}><S8Skin data={data.s8} /></StoryContentCard> : null;
      case 'makeup:cta':
        return <MakeupCtaCard {...captureProps} data={data} onPress={onPressCta} />;
      default:
        if (page.contentKey?.startsWith('features:') && data.s3) {
          const key = page.contentKey.slice('features:'.length);
          const card = data.s3.cards.find(item => item.key === key);
          return card ? (
            <StoryContentCard {...captureProps} section={section} pagerRef={pagerRef} title={card.regionTitle} inset showChapterHeader={showChapterHeader}>
              <S3RegionCard card={card} />
            </StoryContentCard>
          ) : null;
        }
        return null;
    }
  };

  const storyPages: StoryReportPage[] = storyModel.pages.map(page => {
    const section = sectionById.get(page.sectionId)!;
    return {
      id: page.id,
      sectionId: page.sectionId,
      kind: page.kind,
      title: page.title,
      shortTitle: page.shortTitle,
      accentColor: section.accent,
      render: renderContent(page, section),
    };
  });
  const storySections: StoryReportSection[] = Object.values(
    FACE_REPORT_STORY_SECTIONS,
  ).map(section => {
    const availableSection = sectionById.get(section.id);
    return {
      id: section.id,
      title: section.koreanTitle,
      shortTitle: STORY_SECTION_NAV_LABELS[section.id],
      accentColor: section.accent,
      pageIds: availableSection?.pages.map(page => page.id) ?? [],
      available: Boolean(availableSection),
      showPageIndex: false,
    };
  });
  const firstStoryPageId =
    data.initialPageId ??
    (data.goldenMask ? 'summary:overview' : storyModel.pages[0]?.id ?? null);
  React.useEffect(() => {
    activePageIdRef.current = firstStoryPageId;
    setActivePageId(firstStoryPageId);
  }, [firstStoryPageId, resetKey]);

  const prepareGoldenMaskForCapture = React.useCallback(
    async (shouldContinue?: () => boolean) => {
      const posterRequestKey = goldenMaskPosterRequestKeyRef.current + 1;
      goldenMaskPosterRequestKeyRef.current = posterRequestKey;
      goldenMaskPosterResultRef.current = {status: 'pending'};
      setCaptureGoldenMask({
        enabled: true,
        posterRequestKey,
        posterUri: null,
      });

      const deadline = Date.now() + 8_000;
      while (
        goldenMaskPosterResultRef.current.status === 'pending' &&
        Date.now() < deadline
      ) {
        if (shouldContinue && !shouldContinue()) {
          throw new Error('보고서 이미지 준비가 취소되었어요.');
        }
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => resolve()),
        );
      }

      // Native poster events update this ref outside TypeScript's synchronous
      // control-flow graph while the frame loop is waiting.
      const posterResult =
        goldenMaskPosterResultRef.current as GoldenMaskPosterResult;
      const posterUri =
        posterResult.status === 'ready'
          ? posterResult.uri
          : dataRef.current.s1.photo.uri ?? null;
      setCaptureGoldenMask({
        enabled: true,
        posterRequestKey,
        posterUri,
      });
      await new Promise<void>(resolve =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
    },
    [],
  );

  const capturePage = React.useCallback(
    async (pageId: string, shouldContinue?: () => boolean) => {
      if (!storyPages.some(page => page.id === pageId)) {
        throw new Error('저장할 보고서 카드를 찾지 못했어요.');
      }
      pagerRef.current?.goToPage(pageId, false);

      let captureTarget = captureTargetsRef.current.get(pageId) ?? null;
      for (let frame = 0; !captureTarget && frame < 90; frame += 1) {
        if (shouldContinue && !shouldContinue()) {
          throw new Error('보고서 이미지 준비가 취소되었어요.');
        }
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        captureTarget = captureTargetsRef.current.get(pageId) ?? null;
      }
      if (!captureTarget) {
        throw new Error('실제 보고서 카드가 화면에 준비되지 않았어요. 다시 시도해 주세요.');
      }

      const capturesGoldenMask =
        pageId === 'summary:overview' && Boolean(dataRef.current.goldenMask);
      try {
        if (capturesGoldenMask) {
          await prepareGoldenMaskForCapture(shouldContinue);
        }
        return await captureScrollableReportPage(captureTarget.target, {
          isReady: () =>
            Array.from(captureAssetStatesRef.current.values()).every(Boolean),
          shouldContinue,
          snapshotContentContainer: captureTarget.snapshotContentContainer,
        });
      } finally {
        if (capturesGoldenMask) {
          goldenMaskPosterResultRef.current = {status: 'idle'};
          setCaptureGoldenMask(current => ({
            ...current,
            enabled: false,
            posterUri: null,
          }));
        }
      }
    },
    [prepareGoldenMaskForCapture, storyPages],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      capturePage,
      getExportSnapshot: () => ({
        activePageId: activePageIdRef.current,
        pages: storyPages.map(page => ({id: page.id, title: page.title})),
      }),
      restorePage: pageId => {
        if (pageId) {
          pagerRef.current?.goToPage(pageId, false);
        }
      },
    }),
    [capturePage, storyPages],
  );

  const circleBtn = (
    child: React.ReactNode,
    accessibilityLabel: string,
    onPress?: () => void,
  ) => (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [{
      width: 44, height: 44, borderRadius: 22, backgroundColor: 'transparent',
      alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
    }]}>
      {child}
    </Pressable>
  );

  return (
    <FaceReportCaptureAssetContext.Provider value={captureAssetContext}>
      <ScrollAnimContext.Provider value={{scrollY, enabled: false}}>
        <View style={{flex: 1, backgroundColor: color.bg}}>
        <View style={{flex: 1, zIndex: 1, backgroundColor: color.bg}}>
          <View style={{
            paddingTop: Math.max(insets.top, 12) + 4,
            paddingHorizontal: 20,
            paddingBottom: 8,
          }}>
            <View style={{alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'}}>
              <View style={{width: 88, alignItems: 'flex-start'}}>
                {circleBtn(
                  <ChevronLeft size={20} color={color.body} strokeWidth={2.2} />,
                  '보고서 닫기',
                  onBack,
                )}
              </View>
              <View style={{alignItems: 'center', gap: 1}}>
                <Text style={[font(14, '700'), {color: color.ink}]}>얼굴 분석 보고서</Text>
                <Text style={[font(11.5, '600', 1.35), {color: color.faint}]}>
                  {reportCompletion.complete
                    ? '모든 결과가 준비됐어요'
                    : reportCompletion.failed
                      ? '일부 결과를 준비하지 못했어요'
                      : '준비된 결과부터 보여드려요'}
                </Text>
              </View>
              <View style={{alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', width: 88}}>
                {onShare
                  ? circleBtn(<Share2 size={18} color={color.body} />, '보고서 공유', onShare)
                  : null}
                {onMore
                  ? circleBtn(<MoreHorizontal size={18} color={color.body} />, '보고서 더보기', onMore)
                  : null}
              </View>
            </View>
            <ReportCompletionStepper
              accessibilityLabel={reportCompletion.accessibilityLabel}
              stages={reportCompletion.stages}
            />
          </View>
          <StoryReportPager
            ref={pagerRef}
            initialPageId={initialStoryPageId ?? undefined}
            onPageChange={page => handlePageChange(page.id)}
            pages={storyPages}
            sections={storySections}
            resetKey={resetKey}
            showFooter
          />
        </View>
        </View>
      </ScrollAnimContext.Provider>
    </FaceReportCaptureAssetContext.Provider>
  );
});
