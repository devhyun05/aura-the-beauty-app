import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import { OptionalViewShot } from '../../shared/ui/OptionalViewShot';
import { color, font, radius, shadow } from './reportTokens';
import type { BandKey, ReportScreenProps } from './reportTypes';

// Matches the legacy report screen's capture settings.
const REPORT_CAPTURE_OPTIONS = {
  format: 'jpg',
  quality: 0.95,
  result: 'tmpfile',
} as const;
import { ScrollAnimContext } from './visuals/RiseIn';
import { S1Summary } from './sections/S1Summary';
import { S2Proportion } from './sections/S2Proportion';
import { S3Features } from './sections/S3Features';
import { S4PersonalColor } from './sections/S4PersonalColor';
import { S5Body } from './sections/S5Body';
import { S6Impression } from './sections/S6Impression';
import { S7Styling } from './sections/S7Styling';

/**
 * Report screen: top bar + S1..S7 in fixed order + footer CTA.
 * Pure & props-driven — navigation, retake and survey actions bubble up as callbacks.
 */
export function ReportScreenScaffold({
  data,
  entryAnimation = true,
  onBack,
  onMore,
  onRetake,
  onResurvey,
  onPressCta,
  captureRef,
  measurementDebugPayload,
  measurementDebugSummary,
}: ReportScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  const cardY = useRef<Record<string, number>>({});
  const onScroll = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });

  // Sections live inside the capture wrapper, so their onLayout y is relative to
  // that wrapper — not to the ScrollView content. Track where the wrapper itself
  // starts and add it back, or "카드 보기" scrolls short by the top bar's height.
  const captureOffsetY = useRef(0);

  // S2 lens "카드 보기" → scroll to the matching S3 region card, 64px below the top edge.
  // No-op when S3 isn't rendered (no real region data yet) — scrolling to 0 would
  // read as a broken button rather than an honest "not available" state.
  const openRegionCard = (key: BandKey) => {
    if (!data.s3) {
      return;
    }
    const y = captureOffsetY.current + (sectionY.current.s3 ?? 0) + (cardY.current[key] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 64), animated: true });
  };

  const circleBtn = (child: React.ReactNode, onPress?: () => void) => (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [{
      width: 34, height: 34, borderRadius: 17, backgroundColor: color.surface,
      alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
    }, shadow.circleButton]}>
      {child}
    </Pressable>
  );

  return (
    <ScrollAnimContext.Provider value={{ scrollY, enabled: entryAnimation }}>
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={{
            paddingTop: Math.max(insets.top, 54) + 10, paddingHorizontal: 20, paddingBottom: 6,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {circleBtn(<ChevronLeft size={18} color={color.body} strokeWidth={2.2} />, onBack)}
            <Text style={[font(14, '700'), { color: color.ink }]}>{data.topBarTitle}</Text>
            {circleBtn(<MoreHorizontal size={16} color={color.body} />, onMore)}
          </View>

          {/*
            Capture target for 공유/이미지 저장. Wraps the report body (not the
            top bar) and lives inside the ScrollView so the captured image
            contains the whole report, not just the visible viewport.
            The outer View exists only to measure where this wrapper starts,
            since the sections' onLayout y is now relative to it.
          */}
          <View onLayout={e => { captureOffsetY.current = e.nativeEvent.layout.y; }}>
          <OptionalViewShot ref={captureRef} options={REPORT_CAPTURE_OPTIONS} style={{ backgroundColor: color.bg }}>
          <View onLayout={e => { sectionY.current.s1 = e.nativeEvent.layout.y; }}>
            <S1Summary data={data.s1} />
          </View>
          {data.s2 ? (
            <View onLayout={e => { sectionY.current.s2 = e.nativeEvent.layout.y; }}>
              <S2Proportion data={data.s2} onOpenRegionCard={openRegionCard} onRetake={onRetake} />
            </View>
          ) : null}
          {data.s3 ? (
            <View onLayout={e => { sectionY.current.s3 = e.nativeEvent.layout.y; }}>
              <S3Features data={data.s3} onCardLayout={(k, y) => { cardY.current[k] = y; }} />
            </View>
          ) : null}
          {data.s4 ? (
            <View onLayout={e => { sectionY.current.s4 = e.nativeEvent.layout.y; }}>
              <S4PersonalColor data={data.s4} />
            </View>
          ) : null}
          <View onLayout={e => { sectionY.current.s5 = e.nativeEvent.layout.y; }}>
            <S5Body data={data.s5} onResurvey={onResurvey} />
          </View>
          {data.s6 ? (
            <View onLayout={e => { sectionY.current.s6 = e.nativeEvent.layout.y; }}>
              <S6Impression data={data.s6} />
            </View>
          ) : null}
          {data.s7 ? (
            <View onLayout={e => { sectionY.current.s7 = e.nativeEvent.layout.y; }}>
              <S7Styling data={data.s7} />
            </View>
          ) : null}
          </OptionalViewShot>
          </View>

          <View style={{ paddingTop: 26, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 0) + 96, alignItems: 'center', gap: 14 }}>
            <Text style={[font(11.5, '400', 1.65), { color: color.muted, textAlign: 'center', maxWidth: 300 }]}>
              {data.footer.disclaimer}
            </Text>
            <Pressable onPress={onPressCta} style={({ pressed }) => [{
              alignSelf: 'stretch', paddingVertical: 15, borderRadius: radius.lg,
              backgroundColor: color.accent, alignItems: 'center', opacity: pressed ? 0.9 : 1,
            }, shadow.cta]}>
              <Text style={[font(14.5, '800'), { color: color.white }]}>{data.footer.cta}</Text>
            </Pressable>
            {__DEV__ ? (
              <MeasurementDebugPanel payload={measurementDebugPayload} summary={measurementDebugSummary} />
            ) : null}
          </View>
        </Animated.ScrollView>
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
