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
import { ChevronLeft, MoreHorizontal, Share2 } from 'lucide-react-native';
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
import {resolveReportCompletionStatus} from './services/reportCompletionStatus';
import {GoldenMaskCard} from './components/GoldenMaskCard';
import {
  disposePreparedGoldenMask,
  preloadGoldenMaskForReport,
} from './services/goldenMaskPreloadService';

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

function StoryContentCard({
  section,
  pagerRef,
  title,
  sub,
  children,
  inset = false,
  scrollEnabled = true,
  showChapterHeader = false,
}: {
  section: FaceReportStorySection;
  pagerRef: React.RefObject<StoryReportPagerRef | null>;
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
        contentContainerStyle={{flexGrow: 1, paddingBottom: 30, ...(inset ? {paddingHorizontal: 16, paddingTop: 20} : null)}}
        directionalLockEnabled
        nestedScrollEnabled
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
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
  data,
  debugPayload,
  debugSummary,
  onInteractionChange,
  onPressCta,
  pagerRef,
}: {
  active: boolean;
  data: ReportScreenProps['data'];
  debugPayload?: unknown;
  debugSummary?: {label: string; value: string}[];
  onInteractionChange: (interacting: boolean) => void;
  onPressCta?: () => void;
  pagerRef: React.RefObject<StoryReportPagerRef | null>;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [maskLayoutY, setMaskLayoutY] = useState(Number.POSITIVE_INFINITY);
  const [maskMounted, setMaskMounted] = useState(false);
  const [maskInteracting, setMaskInteracting] = useState(false);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({animated: false, y: 0});
    setMaskLayoutY(Number.POSITIVE_INFINITY);
    setMaskMounted(false);
  }, [data.reportId]);

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
        ref={scrollRef}
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
        showsVerticalScrollIndicator={false}>
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
                  descriptor={data.goldenMask}
                  layout="evidence"
                  onInteractionChange={handleInteractionChange}
                  pagerRef={pagerRef}
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
        {__DEV__ ? (
          <MeasurementDebugPanel payload={debugPayload} summary={debugSummary} />
        ) : null}
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
  debugPayload,
  debugSummary,
}: {
  data: ReportScreenProps['data'];
  onPress?: () => void;
  debugPayload?: unknown;
  debugSummary?: {label: string; value: string}[];
}) {
  return (
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
        {__DEV__ ? <MeasurementDebugPanel payload={debugPayload} summary={debugSummary} /> : null}
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
  );
}

/**
 * Story report screen: editorial covers + meaning-complete horizontal cards.
 * Pure & props-driven — navigation, retake and survey actions bubble up as callbacks.
 */
export function ReportScreenScaffold({
  data: incomingData,
  onBack,
  onGoldenMaskInteractionChange,
  onMore,
  onShare,
  onRetake,
  onResurvey,
  onPressCta,
  measurementDebugPayload,
  measurementDebugSummary,
}: ReportScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const pagerRef = useRef<StoryReportPagerRef | null>(null);
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
    switch (page.contentKey) {
      case 'summary:combined':
      case 'summary':
        return (
          <SummaryStoryCard
            active={activePageId === page.id}
            data={data}
            debugPayload={measurementDebugPayload}
            debugSummary={measurementDebugSummary}
            onInteractionChange={handleGoldenMaskInteractionChange}
            onPressCta={onPressCta}
            pagerRef={pagerRef}
          />
        );
      case 'summary:generation':
        return (
          <StoryContentCard
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
          <StoryContentCard section={section} pagerRef={pagerRef} showChapterHeader={showChapterHeader}>
            <S2Proportion data={data.s2} onOpenRegionCard={openRegionCard} onRetake={onRetake} />
          </StoryContentCard>
        ) : null;
      case 'personal-color:tone':
        return data.s4 ? (
          <StoryContentCard section={section} pagerRef={pagerRef} title={data.s4.title} sub={data.s4.sub} inset showChapterHeader={showChapterHeader}>
            <S4ToneOverview data={data.s4} />
          </StoryContentCard>
        ) : null;
      case 'personal-color:drape':
        return data.s4 ? (
          <StoryContentCard section={section} pagerRef={pagerRef} title={data.s4.drape.title} sub={data.s4.drape.sub} inset showChapterHeader={showChapterHeader}>
            <S4DrapePalette data={data.s4} />
          </StoryContentCard>
        ) : null;
      case 'body':
        return data.s5 ? (
          <StoryContentCard section={section} pagerRef={pagerRef} showChapterHeader={showChapterHeader}>
            <S5Body data={data.s5} onResurvey={onResurvey} />
          </StoryContentCard>
        ) : null;
      case 'impression':
        return data.s6 ? <StoryContentCard section={section} pagerRef={pagerRef} showChapterHeader={showChapterHeader}><S6Impression data={data.s6} /></StoryContentCard> : null;
      case 'styling:natural':
        return data.s7 ? (
          <StoryContentCard section={section} pagerRef={pagerRef} title={data.s7.naturalCard.title} inset showChapterHeader={showChapterHeader}>
            <S7LookCard card={data.s7.naturalCard} />
          </StoryContentCard>
        ) : null;
      case 'styling:glam':
        return data.s7 ? (
          <StoryContentCard section={section} pagerRef={pagerRef} title={data.s7.glamCard.title} inset showChapterHeader={showChapterHeader}>
            <S7LookCard card={data.s7.glamCard} />
          </StoryContentCard>
        ) : null;
      case 'styling:lanes':
        return data.s9 ? (
          <StoryContentCard section={section} pagerRef={pagerRef} title={data.s9.title} sub={data.s9.sub} inset showChapterHeader={showChapterHeader}>
            <S9StyleLanes data={data.s9} />
          </StoryContentCard>
        ) : null;
      case 'skin':
        return data.s8 ? <StoryContentCard section={section} pagerRef={pagerRef} showChapterHeader={showChapterHeader}><S8Skin data={data.s8} /></StoryContentCard> : null;
      case 'makeup:cta':
        return <MakeupCtaCard data={data} onPress={onPressCta} debugPayload={measurementDebugPayload} debugSummary={measurementDebugSummary} />;
      default:
        if (page.contentKey?.startsWith('features:') && data.s3) {
          const key = page.contentKey.slice('features:'.length);
          const card = data.s3.cards.find(item => item.key === key);
          return card ? (
            <StoryContentCard section={section} pagerRef={pagerRef} title={card.regionTitle} inset showChapterHeader={showChapterHeader}>
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
  const resetKey = `${data.reportId}:${data.s1.photo.uri ?? 'report'}:${data.s1.dateLine}`;
  const firstStoryPageId =
    data.initialPageId ??
    (data.goldenMask ? 'summary:overview' : storyModel.pages[0]?.id ?? null);
  React.useEffect(() => {
    activePageIdRef.current = firstStoryPageId;
    setActivePageId(firstStoryPageId);
  }, [firstStoryPageId, resetKey]);

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
    <ScrollAnimContext.Provider value={{scrollY, enabled: false}}>
      <View style={{flex: 1, backgroundColor: color.bg}}>
        <View style={{flex: 1, zIndex: 1, backgroundColor: color.bg}}>
          <View style={{
            paddingTop: Math.max(insets.top, 12) + 4, paddingHorizontal: 20, paddingBottom: 4,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <View style={{width: 88, alignItems: 'flex-start'}}>
              {circleBtn(
                <ChevronLeft size={20} color={color.body} strokeWidth={2.2} />,
                '보고서 닫기',
                onBack,
              )}
            </View>
            <View style={{alignItems: 'center', gap: 1}}>
              <Text style={[font(14, '700'), {color: color.ink}]}>얼굴 분석 보고서</Text>
              <Text
                accessibilityLabel={reportCompletion.accessibilityLabel}
                accessibilityLiveRegion="polite"
                numberOfLines={1}
                style={[
                  font(8.5, '600', undefined, 0.05),
                  {
                    color: reportCompletion.failed
                      ? color.legacyText
                      : reportCompletion.complete
                        ? color.faint
                        : color.muted,
                    maxWidth: 180,
                    opacity: reportCompletion.complete ? 0.72 : 0.86,
                  },
                ]}>
                {reportCompletion.compactLabel}
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
          <StoryReportPager
            ref={pagerRef}
            initialPageId={initialStoryPageId ?? undefined}
            onPageChange={page => handlePageChange(page.id)}
            pages={storyPages}
            sections={storySections}
            resetKey={resetKey}
            showFooter={false}
          />
        </View>
      </View>
    </ScrollAnimContext.Provider>
  );
}

type MeasurementRecord = Record<string, unknown>;

const MEASUREMENT_LABELS: Record<string, string> = {
  applied: '적용 여부',
  axes: '색상 특성',
  band: '판정 구간',
  captureId: '촬영 ID',
  chroma: '채도',
  clarity: '청탁',
  confidence: '신뢰도',
  contrast: '대비',
  createdAt: '생성 시각',
  cropRect: '크롭 영역',
  displayRatio: '표시 비율',
  dominantPart: '강조 구획',
  effectiveForReportRendering: '보고서에 실제 적용된 값',
  exemplars: '대표 색 예시',
  explicitReportId: '요청한 보고서 ID',
  face3d: '3D 얼굴 측정',
  faceGeometry2d: '2D 얼굴 기하',
  faceGeometryMetrics: '2D 얼굴 기하 지표',
  faceLength: '얼굴 세로·가로 비율',
  faceLengthJudgment: '얼굴 길이 판정',
  faceRegionVisuals: '부위 기준선',
  faceVerticalThirds: '얼굴 세로 구획',
  family: '색상 계열',
  guide: '기준선',
  h: '높이 비율',
  hairlineAnalysis: '헤어라인 분석',
  height: '높이',
  hi: '최댓값',
  interpretation: '해석',
  keypoints: '기준점 좌표',
  lo: '최솟값',
  lower: '하안부',
  measurementConfidence: '전체 측정 신뢰도',
  measurementMode: '측정 방식',
  metrics: '측정 지표',
  middle: '중안부',
  palette: '팔레트',
  best: '잘 어울리는 색 계열',
  personalColor: '퍼스널 컬러',
  pitchDeg: '상하 각도',
  points: '좌표',
  pose: '얼굴 각도',
  probabilities: '12타입 가까움',
  qEff: '적용 신뢰도',
  qNative: '원본 신뢰도',
  regions: '측정 영역',
  reasons: '선정 근거',
  reportCaptureId: '저장된 촬영 ID',
  reportId: '보고서 ID',
  rollCorrection: '기울기 보정',
  rollCorrectionDeg: '보정 각도',
  rollDeg: '기울기',
  schemaVersion: '데이터 버전',
  secondary: '2순위',
  sessionCaptureId: '현재 세션 촬영 ID',
  sessionId: '세션 ID',
  sessionMeasurements: '현재 촬영 세션 값',
  source: '측정 출처',
  sourceImage: '원본 이미지',
  status: '상태',
  statusReason: '상태 사유',
  storedMeasurements: '서버에 저장된 값',
  summary: '요약',
  temperature: '온도',
  title: '제목',
  tone: '세부 톤',
  noteKo: '설명',
  top: '1순위',
  typeScore: '1순위 가까움',
  upper: '상안부',
  uri: '이미지 경로',
  useSessionMeasurements: '현재 세션 측정값 사용',
  validFrameCount: '유효 프레임 수',
  value: '측정값',
  verdict: '판정',
  verticalThirds: '세로 3구획 비율',
  w: '너비 비율',
  warnings: '주의 사항',
  width: '너비',
  worst: '피하면 좋은 색 계열',
  x: 'X 좌표',
  y: 'Y 좌표',
  yawDeg: '좌우 각도',
};

const MEASUREMENT_VALUE_LABELS: Record<string, string> = {
  blocked: '측정 보류',
  definitive: '확정 측정',
  estimated: '추정값',
  failed: '측정 실패',
  full_success: '전체 측정 완료',
  insufficient: '측정 신호 부족',
  measured: '측정 완료',
  mixed: '측정값과 추정값 혼합',
  ok: '정상',
  partial_success: '일부 측정 완료',
  provisional: '임시 측정',
  unmeasured: '측정 안 됨',
};

function isMeasurementRecord(value: unknown): value is MeasurementRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function measurementLabel(key: string): string {
  if (MEASUREMENT_LABELS[key]) {
    return MEASUREMENT_LABELS[key];
  }

  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function formatMeasurementValue(key: string, value: unknown): string {
  if (value === null || typeof value === 'undefined') {
    return '없음';
  }
  if (typeof value === 'boolean') {
    return value ? '예' : '아니요';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    const readable = Number.isInteger(value)
      ? value.toLocaleString('ko-KR')
      : Number(value.toFixed(6)).toLocaleString('ko-KR', { maximumFractionDigits: 6 });
    if (key.endsWith('Deg')) {
      return `${readable}°`;
    }
    if (/(confidence|probability|score)/i.test(key) && value >= 0 && value <= 1) {
      return `${readable} (${Number((value * 100).toFixed(1))}%)`;
    }
    return readable;
  }
  if (typeof value === 'string') {
    if (!value) {
      return '빈 값';
    }
    if (MEASUREMENT_VALUE_LABELS[value]) {
      return `${MEASUREMENT_VALUE_LABELS[value]} (${value})`;
    }
    if (key === 'createdAt') {
      const timestamp = Date.parse(value);
      if (!Number.isNaN(timestamp)) {
        return new Date(timestamp).toLocaleString('ko-KR');
      }
    }
    return value;
  }
  return String(value);
}

function MeasurementValueTree({
  value,
  path,
  depth = 0,
}: {
  value: unknown;
  path: string;
  depth?: number;
}) {
  if (!isMeasurementRecord(value)) {
    return (
      <Text selectable style={[font(11.5, '500', 1.45), { color: color.ink }]}>
        {formatMeasurementValue(path, value)}
      </Text>
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return <Text style={[font(11.5, '500'), { color: color.faint }]}>없음</Text>;
  }

  return (
    <View style={{ gap: 0 }}>
      {entries.map(([key, item], index) => {
        const itemPath = `${path}.${key}`;
        const isObject = isMeasurementRecord(item);
        const isArray = Array.isArray(item);
        const isComplex = isObject || isArray;

        return (
          <View
            key={itemPath}
            style={{
              borderTopColor: index === 0 ? 'transparent' : color.divider,
              borderTopWidth: index === 0 ? 0 : 1,
              paddingLeft: depth > 0 ? 10 : 0,
              paddingVertical: isComplex ? 10 : 9,
            }}>
            {isArray ? (
              <View style={{ gap: 7 }}>
                <Text style={[font(11.5, '700'), { color: color.muted }]}>
                  {measurementLabel(key)}
                </Text>
                {item.length === 0 ? (
                  <Text style={[font(11.5, '500'), { color: color.faint }]}>없음</Text>
                ) : item.map((arrayItem, arrayIndex) => (
                  <View key={`${itemPath}.${arrayIndex}`} style={{ paddingLeft: 10 }}>
                    {isMeasurementRecord(arrayItem) ? (
                      <View style={{ gap: 5 }}>
                        <Text style={[font(10.5, '700'), { color: color.faint }]}>항목 {arrayIndex + 1}</Text>
                        <MeasurementValueTree
                          value={arrayItem}
                          path={`${itemPath}.${arrayIndex}`}
                          depth={depth + 1}
                        />
                      </View>
                    ) : (
                      <Text selectable style={[font(11.5, '500', 1.45), { color: color.ink }]}>
                        · {formatMeasurementValue(key, arrayItem)}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ) : isObject ? (
              <View style={{ gap: 5 }}>
                <Text style={[font(11.5, '700'), { color: color.muted }]}>
                  {measurementLabel(key)}
                </Text>
                <MeasurementValueTree value={item} path={itemPath} depth={depth + 1} />
              </View>
            ) : (
              <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: 12 }}>
                <Text style={[font(11, '600', 1.4), { color: color.muted, flex: 0.8 }]}>
                  {measurementLabel(key)}
                </Text>
                <Text
                  selectable
                  style={[font(11.5, '600', 1.4), { color: color.ink, flex: 1.2, textAlign: 'right' }]}>
                  {formatMeasurementValue(key, item)}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function MeasurementDataSection({
  title,
  value,
  defaultOpen = false,
}: {
  title: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <View style={{ borderTopColor: color.divider, borderTopWidth: 1 }}>
      <Pressable
        accessibilityLabel={`${title} ${isOpen ? '접기' : '펼치기'}`}
        accessibilityRole="button"
        onPress={() => setIsOpen(value => !value)}
        style={({ pressed }) => ({
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-between',
          opacity: pressed ? 0.75 : 1,
          paddingVertical: 12,
        })}>
        <Text style={[font(12.5, '800'), { color: color.ink }]}>{title}</Text>
        <Text style={[font(11.5, '700'), { color: color.accentDeep }]}>{isOpen ? '접기' : '보기'}</Text>
      </Pressable>
      {isOpen ? (
        <View style={{ backgroundColor: color.surface2, borderRadius: radius.md, marginBottom: 12, paddingHorizontal: 12 }}>
          {isMeasurementRecord(value) ? (
            <MeasurementValueTree value={value} path={title} />
          ) : Array.isArray(value) ? (
            <MeasurementValueTree value={{ items: value }} path={title} />
          ) : (
            <View style={{ paddingVertical: 11 }}>
              <Text selectable style={[font(11.5, '600'), { color: color.ink }]}>
                {formatMeasurementValue(title, value)}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function MeasurementDebugPanel({
  payload,
  summary = [],
}: {
  payload: unknown;
  summary?: {label: string; value: string}[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const payloadRecord = isMeasurementRecord(payload) ? payload : null;
  const connectionInfo = payloadRecord ? {
    reportId: payloadRecord.reportId,
    explicitReportId: payloadRecord.explicitReportId,
    reportCaptureId: payloadRecord.reportCaptureId,
    sessionCaptureId: payloadRecord.sessionCaptureId,
    useSessionMeasurements: payloadRecord.useSessionMeasurements,
  } : payload;

  return (
    <View style={{
      alignSelf: 'stretch',
      backgroundColor: color.surface,
      borderColor: color.outline8,
      borderRadius: radius.lg,
      borderWidth: 1,
      marginTop: 10,
      overflow: 'hidden',
    }}>
      <Pressable
        accessibilityLabel={isOpen ? '개발용 측정 데이터 접기' : '개발용 측정 데이터 펼치기'}
        accessibilityRole="button"
        onPress={() => setIsOpen(value => !value)}
        style={({ pressed }) => ({
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-between',
          opacity: pressed ? 0.78 : 1,
          paddingHorizontal: 16,
          paddingVertical: 14,
        })}>
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <Text style={[font(10.5, '800', undefined, 1.3), { color: color.faint }]}>
            개발용
          </Text>
          <Text style={[font(15, '800'), { color: color.ink }]}>
            측정 데이터
          </Text>
        </View>
        <Text style={[font(12, '800'), { color: color.accentDeep }]}>
          {isOpen ? '접기' : '보기'}
        </Text>
      </Pressable>

      {isOpen ? (
        <View style={{
          borderTopColor: color.divider,
          borderTopWidth: 1,
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 14,
        }}>
          {summary.length > 0 ? (
            <View style={{ backgroundColor: color.surface2, borderRadius: radius.md, gap: 8, padding: 12 }}>
              <Text style={[font(11.5, '800'), { color: color.ink }]}>빠른 확인</Text>
              {summary.map(item => (
                <View
                  key={item.label}
                  style={{
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}>
                  <Text style={[font(11.5, '700'), {color: color.muted}]}>{item.label}</Text>
                  <Text style={[font(11.5, '700'), {color: color.ink, textAlign: 'right'}]}>{item.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <MeasurementDataSection title="보고서 연결 정보" value={connectionInfo} defaultOpen />
          <MeasurementDataSection
            title="보고서에 실제 적용된 값"
            value={payloadRecord?.effectiveForReportRendering}
            defaultOpen
          />
          <MeasurementDataSection title="서버에 저장된 값" value={payloadRecord?.storedMeasurements} />
          <MeasurementDataSection title="현재 촬영 세션 값" value={payloadRecord?.sessionMeasurements} />
        </View>
      ) : null}
    </View>
  );
}
