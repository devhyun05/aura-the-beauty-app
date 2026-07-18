import {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View as RNView,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  FileText,
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
  X,
} from 'lucide-react-native';
import {Text} from 'tamagui';

import {consultingColors, radius, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {setUnityMakeupPlayerPaused} from '../../ar/services/unityMakeupBridge';
import {ChimeVideoView, isNativeChimeVideoViewAvailable} from '../components/ChimeVideoView';
import {ExpertAvatar} from '../components/consultingComponents';
import {findConsultingDuration} from '../consultingCatalog';
import {
  addNativeChimeMeetingListener,
  isNativeChimeMeetingAvailable,
  setNativeChimeLocalVideoEnabled,
  setNativeChimeMuted,
  startNativeChimeMeeting,
  stopNativeChimeMeeting,
  switchNativeChimeCamera,
} from '../native/chimeMeeting';
import {
  getConsultingBooking,
  getConsultingCallState,
  getConsultingShareableReports,
  joinConsultingCall,
} from '../services/consultingService';
import {
  connectConsultingConversationSocket,
  type ConsultingServerSocketEvent,
} from '../services/consultingRealtimeService';
import type {ConsultingCallJoinResult, ConsultingCallState, ConsultingExpert} from '../types';

const CALL_BACKGROUND = '#26241F';
const CALL_SURFACE = 'rgba(255, 255, 255, 0.14)';
const SELF_VIEW_BACKGROUND = '#4A473F';
type CallJoinStatus = 'idle' | 'joining' | 'ready' | 'not_ready';

type ConsultingCallScreenProps = {
  authToken?: string | null;
  expert: ConsultingExpert;
  durationId: string;
  bookingId?: string;
  onEndCall: () => void;
};

export function ConsultingCallScreen({
  authToken,
  expert,
  durationId,
  bookingId,
  onEndCall,
}: ConsultingCallScreenProps) {
  const insets = useSafeAreaInsets();
  const {height: windowHeight, width: windowWidth} = useWindowDimensions();
  const compactLayout = windowHeight < 760 || windowWidth < 375;
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [callState, setCallState] = useState<ConsultingCallState | null>(null);
  const [joinResult, setJoinResult] = useState<ConsultingCallJoinResult | null>(null);
  const [joinStatus, setJoinStatus] = useState<CallJoinStatus>('idle');
  const [localVideoActive, setLocalVideoActive] = useState(false);
  const [remoteVideoActive, setRemoteVideoActive] = useState(false);
  const [sharedReports, setSharedReports] = useState<readonly FaceAnalysisReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<FaceAnalysisReport | null>(null);
  const [statusMessage, setStatusMessage] = useState('상담 연결을 준비하고 있어요');
  const duration = findConsultingDuration(expert, durationId);
  const nativeChimeAvailable = isNativeChimeMeetingAvailable();
  const nativeVideoAvailable = nativeChimeAvailable && isNativeChimeVideoViewAvailable();
  useEffect(() => {
    const subscription = addNativeChimeMeetingListener((event) => {
      if (event.type === 'meetingError') {
        setJoinStatus('not_ready');
        setJoinResult(null);
        setLocalVideoActive(false);
        setRemoteVideoActive(false);
        setStatusMessage(event.error ?? 'Chime 화상 상담 연결에 실패했어요');
        void stopNativeChimeMeeting();
        return;
      }

      if (event.type === 'videoTileAdded') {
        if (event.isLocal) {
          setLocalVideoActive(true);
        } else {
          setRemoteVideoActive(true);
        }
        return;
      }

      if (event.type === 'videoTileRemoved') {
        if (event.isLocal) {
          setLocalVideoActive(false);
        } else {
          setRemoteVideoActive(false);
        }
        return;
      }

      if (event.type !== 'meetingStateChanged') {
        return;
      }

      if (
        event.state === 'connected' ||
        event.state === 'reconnected' ||
        event.state === 'videoStarted'
      ) {
        setJoinStatus('ready');
      }

      setStatusMessage(getNativeMeetingStateMessage(event.state));

      if (event.state === 'ended' || event.state === 'audioStopped') {
        setLocalVideoActive(false);
        setRemoteVideoActive(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    setUnityMakeupPlayerPaused(true);
    setJoinResult(null);
    setLocalVideoActive(false);
    setRemoteVideoActive(false);

    async function loadCallState() {
      if (!bookingId) {
        setJoinStatus('not_ready');
        setStatusMessage('예약 정보가 없어 통화방을 열 수 없어요');
        return;
      }

      setJoinStatus('idle');
      setStatusMessage('전문가가 상담을 시작하면 입장할 수 있어요');

      try {
        const state = await getConsultingCallState(bookingId);
        if (!isMounted) {
          return;
        }
        setCallState(state);
        if (state?.chimeEnabled === false) {
          setJoinStatus('not_ready');
          setStatusMessage('화상 상담 기능을 준비하지 못했어요. 잠시 후 다시 시도해 주세요');
        } else if (state?.status !== 'active') {
          setJoinStatus('not_ready');
          setStatusMessage('전문가가 화상 상담을 시작하면 전화 알림이 도착해요');
        } else if (!state) {
          setStatusMessage('통화 상태를 확인하지 못했어요. 네트워크를 확인한 뒤 입장해 주세요.');
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setCallState(null);
        setJoinStatus('idle');
        setStatusMessage(
          getCallScreenErrorMessage(
            error,
            '통화 상태를 확인하지 못했어요. 네트워크를 확인한 뒤 입장해 주세요.',
          ),
        );
      }
    }

    void loadCallState();

    return () => {
      isMounted = false;
      void stopNativeChimeMeeting();
      setUnityMakeupPlayerPaused(true);
    };
  }, [bookingId]);

  useEffect(() => {
    let isMounted = true;
    if (!bookingId) {
      setSharedReports([]);
      return () => {
        isMounted = false;
      };
    }

    void Promise.all([
      getConsultingBooking(bookingId),
      getConsultingShareableReports(),
    ]).then(([record, reports]) => {
      if (!isMounted) return;
      const sharedIds = new Set(record?.sharedReportIds ?? []);
      setSharedReports(reports.filter(report => sharedIds.has(report.id)));
    });

    return () => {
      isMounted = false;
    };
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId || !joinResult?.callSessionId) {
      return undefined;
    }

    const client = connectConsultingConversationSocket({
      authToken,
      bookingId,
      onEvent: (event: ConsultingServerSocketEvent) => {
        if (event.type === 'call.status' && event.status === 'ended') {
          void stopNativeChimeMeeting();
          setJoinResult(null);
          setJoinStatus('not_ready');
          setLocalVideoActive(false);
          setRemoteVideoActive(false);
          setStatusMessage('전문가가 화상 상담을 종료했어요');
          onEndCall();
        }
      },
      participantType: 'user',
    });

    return () => client.close();
  }, [authToken, bookingId, joinResult?.callSessionId, onEndCall]);

  const callSessionId = joinResult?.callSessionId ?? callState?.callSessionId ?? null;
  const expertCallActive = callState?.status === 'active';
  const canAttemptJoin = Boolean(
    bookingId && expertCallActive && joinStatus !== 'joining',
  );
  const statusLabel = useMemo(() => {
    if (joinStatus === 'ready') {
      return '연결 준비 완료';
    }
    if (joinStatus === 'idle') {
      return '입장 준비';
    }
    if (joinStatus === 'not_ready') {
      return '입장 대기';
    }
    return '연결 준비 중';
  }, [joinStatus]);
  const handleEndCall = useCallback(() => {
    void stopNativeChimeMeeting();
    setUnityMakeupPlayerPaused(true);
    onEndCall();
  }, [onEndCall]);

  const handleJoinCall = useCallback(async () => {
    if (!bookingId || !expertCallActive || joinStatus === 'joining') {
      return;
    }

    setJoinStatus('joining');
    setJoinResult(null);
    setLocalVideoActive(false);
    setRemoteVideoActive(false);
    setStatusMessage('상담 연결을 준비하고 있어요');

    let result: ConsultingCallJoinResult | null = null;
    try {
      result = await joinConsultingCall(bookingId);
    } catch (error) {
      setJoinStatus('idle');
      setStatusMessage(
        getCallScreenErrorMessage(
          error,
          '입장 정보를 가져오지 못했어요. 네트워크와 예약 시간을 확인한 뒤 다시 시도해 주세요.',
        ),
      );
      return;
    }

    if (result?.callSessionId) {
      setJoinResult(result);
      setJoinStatus('ready');
      let nativeStarted = false;
      try {
        nativeStarted = await startNativeChimeMeeting(result);
      } catch (error) {
        setJoinStatus('not_ready');
        setJoinResult(null);
        setLocalVideoActive(false);
        setRemoteVideoActive(false);
        void stopNativeChimeMeeting();
        setStatusMessage(
          getCallScreenErrorMessage(
            error,
            '기기에서 화상 상담을 시작하지 못했어요',
          ),
        );
        return;
      }
      setStatusMessage(
        nativeStarted
          ? '화상 상담 영상을 연결하고 있어요'
          : '현재 앱에서는 영상을 연결할 수 없어요. 앱을 최신 버전으로 업데이트해 주세요.',
      );
      return;
    }

    setJoinStatus(callState?.chimeEnabled === false ? 'not_ready' : 'idle');
    setStatusMessage(
      callState?.chimeEnabled === false
        ? '화상 상담 기능을 준비하지 못했어요. 잠시 후 다시 시도해 주세요'
        : '입장 정보를 가져오지 못했어요. 네트워크와 예약 시간을 확인한 뒤 다시 시도해 주세요.',
    );
  }, [
    bookingId,
    callState?.chimeEnabled,
    expertCallActive,
    joinStatus,
  ]);

  const handleToggleMic = useCallback(() => {
    const nextMicOn = !micOn;
    setMicOn(nextMicOn);
    void setNativeChimeMuted(!nextMicOn);
  }, [micOn]);

  const handleToggleCamera = useCallback(() => {
    const nextCameraOn = !cameraOn;
    setCameraOn(nextCameraOn);
    void setNativeChimeLocalVideoEnabled(nextCameraOn);
  }, [cameraOn]);

  const handleSwitchCamera = useCallback(() => {
    void switchNativeChimeCamera();
  }, []);

  return (
    <RNView
      style={[
        styles.root,
        compactLayout ? styles.rootCompact : null,
        {
          paddingBottom: Math.max(insets.bottom, compactLayout ? spacing.sm : spacing.lg),
          paddingTop: insets.top + (compactLayout ? spacing.sm : spacing.md),
        },
      ]}>
      <RNView style={styles.topRow}>
        <RNView style={styles.pill}>
          <Text style={styles.pillText}>{expert.name}</Text>
        </RNView>
        <RNView style={styles.pill}>
          <Text style={styles.pillText}>{statusLabel} · {duration.minutes}분</Text>
        </RNView>
      </RNView>

      <RNView style={[styles.stage, compactLayout ? styles.stageCompact : null]}>
        {joinStatus === 'ready' && nativeVideoAvailable ? (
          <>
            <ChimeVideoView tileType="remote" style={styles.remoteVideo} />
            {!remoteVideoActive ? (
              <RNView style={styles.remoteVideoPlaceholder}>
                <ExpertAvatar expert={expert} size={82} />
                <Text style={styles.remoteVideoPlaceholderText}>
                  상담사 영상 대기 중
                </Text>
              </RNView>
            ) : null}
            <RNView style={styles.videoStatusOverlay}>
              <Text style={styles.videoStatusText}>{statusMessage}</Text>
            </RNView>
          </>
        ) : (
          <>
            <RNView style={styles.avatarWrap}>
              <ExpertAvatar expert={expert} size={96} />
              <RNView
                style={[
                  styles.callStatusBadge,
                  joinStatus === 'ready' ? styles.callStatusBadgeReady : null,
                ]}>
                {joinStatus === 'ready' ? (
                  <Video color="#FFFFFF" size={18} />
                ) : (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                )}
              </RNView>
            </RNView>
            <Text style={styles.stageName}>
              {joinStatus === 'ready' ? '상담방에 입장했어요' : '상담사 연결을 기다리고 있어요'}
            </Text>
            <Text style={styles.stageHint}>{statusMessage}</Text>
            {joinStatus === 'ready' && !nativeVideoAvailable ? (
              <Text style={styles.nativeNotice}>
                네이티브 Chime SDK 브리지 대기 중
              </Text>
            ) : null}
          </>
        )}
        <RNView style={styles.stageMeta}>
          {callSessionId ? (
            <Text style={styles.bookingIdText}>세션 {callSessionId.slice(0, 8)}</Text>
          ) : bookingId ? (
            <Text style={styles.bookingIdText}>예약 {bookingId.slice(0, 8)}</Text>
          ) : null}
        </RNView>

        <RNView style={[
          styles.selfView,
          compactLayout ? styles.selfViewCompact : null,
          {top: compactLayout ? spacing.sm : spacing.md},
        ]}>
          {joinStatus === 'ready' && nativeVideoAvailable && cameraOn ? (
            <>
              <ChimeVideoView tileType="local" style={styles.selfVideo} />
              {!localVideoActive ? (
                <RNView style={styles.selfVideoPlaceholder}>
                  <Text style={styles.selfVideoPlaceholderText}>내 영상 대기</Text>
                </RNView>
              ) : null}
              <Text style={styles.selfViewText}>나</Text>
            </>
          ) : (
            <Text style={styles.selfViewText}>{cameraOn ? '나' : '카메라 꺼짐'}</Text>
          )}
        </RNView>
      </RNView>

      {joinStatus === 'idle' || joinStatus === 'not_ready' ? (
        <RNView style={[styles.joinPanel, compactLayout ? styles.joinPanelCompact : null]}>
          <Pressable
            accessibilityRole="button"
            disabled={!canAttemptJoin}
            onPress={handleJoinCall}
            style={({pressed}) => [
              styles.joinButton,
              !canAttemptJoin ? styles.joinButtonDisabled : null,
              pressed ? styles.joinButtonPressed : null,
            ]}>
            <Text style={styles.joinButtonText}>
              {expertCallActive ? '화상 상담 입장' : '전문가의 전화를 기다려 주세요'}
            </Text>
          </Pressable>
        </RNView>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={sharedReports.length === 0}
        onPress={() => setSelectedReport(sharedReports[0] ?? null)}
        style={({pressed}) => [
          styles.sharedCard,
          compactLayout ? styles.sharedCardCompact : null,
          sharedReports.length === 0 ? styles.sharedCardDisabled : null,
          pressed ? styles.pressed : null,
        ]}>
        <FileText color={consultingColors.roseStrong} size={18} />
        <RNView style={styles.sharedText}>
          <Text style={styles.sharedLabel}>공유된 리포트</Text>
          <Text numberOfLines={1} style={styles.sharedTitle}>
            {sharedReports[0]?.reportTitle ?? sharedReports[0]?.title ?? '공유된 리포트 없음'}
          </Text>
        </RNView>
      </Pressable>

      <RNView style={[styles.controlRow, compactLayout ? styles.controlRowCompact : null]}>
        <CallControl
          compact={compactLayout}
          icon={micOn ? <Mic color="#fff" size={20} /> : <MicOff color="#fff" size={20} />}
          label={micOn ? '마이크 끄기' : '마이크 켜기'}
          onPress={handleToggleMic}
        />
        <CallControl
          compact={compactLayout}
          icon={
            cameraOn ? (
              <Video color="#fff" size={20} />
            ) : (
              <VideoOff color="#fff" size={20} />
            )
          }
          label={cameraOn ? '카메라 끄기' : '카메라 켜기'}
          onPress={handleToggleCamera}
        />
        <CallControl
          compact={compactLayout}
          icon={<SwitchCamera color="#fff" size={20} />}
          label="카메라 전환"
          onPress={handleSwitchCamera}
        />
        <CallControl
          compact={compactLayout}
          danger
          icon={<PhoneOff color="#fff" size={20} />}
          label="나가기"
          onPress={handleEndCall}
        />
      </RNView>

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedReport(null)}
        presentationStyle="pageSheet"
        visible={Boolean(selectedReport)}>
        <RNView style={[styles.reportModal, {paddingTop: Math.max(insets.top, spacing.md)}]}>
          <RNView style={styles.reportHeader}>
            <RNView style={styles.reportHeaderCopy}>
              <Text style={styles.reportEyebrow}>통화 중 공유 리포트</Text>
              <Text style={styles.reportTitle}>{selectedReport?.reportTitle ?? selectedReport?.title}</Text>
            </RNView>
            <Pressable
              accessibilityLabel="리포트 닫기"
              accessibilityRole="button"
              onPress={() => setSelectedReport(null)}
              style={styles.reportClose}>
              <X color={consultingColors.text} size={20} />
            </Pressable>
          </RNView>
          <ScrollView contentContainerStyle={styles.reportContent}>
            <ReportDetail label="퍼스널 컬러" value={selectedReport?.personalColor} />
            <ReportDetail label="얼굴형" value={selectedReport?.faceShape} />
            <ReportDetail label="피부 타입" value={selectedReport?.skinType} />
            <ReportDetail label="톤 분석" value={selectedReport?.toneSummary} />
            <ReportDetail label="핵심 요약" value={selectedReport?.summary} />
            <ReportDetail label="베이스 가이드" value={selectedReport?.baseMakeupGuide} />
          </ScrollView>
        </RNView>
      </Modal>
    </RNView>
  );
}

function ReportDetail({label, value}: {label: string; value?: string}) {
  if (!value) return null;
  return (
    <RNView style={styles.reportSection}>
      <Text style={styles.reportSectionLabel}>{label}</Text>
      <Text style={styles.reportSectionValue}>{value}</Text>
    </RNView>
  );
}

function CallControl({
  compact,
  icon,
  label,
  onPress,
  danger = false,
}: {
  compact?: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({pressed}) => [
        styles.control,
        compact ? styles.controlCompact : null,
        danger ? styles.controlDanger : styles.controlDefault,
        pressed ? styles.pressed : null,
      ]}>
      {icon}
    </Pressable>
  );
}

function getCallScreenErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function getNativeMeetingStateMessage(state?: string): string {
  switch (state) {
    case 'joining':
    case 'connecting':
      return 'Chime 화상 상담에 연결하고 있어요';
    case 'connected':
    case 'reconnected':
      return 'Chime 화상 상담에 연결됐어요';
    case 'reconnecting':
      return '네트워크를 다시 연결하고 있어요';
    case 'connectionPoor':
      return '네트워크 상태가 불안정해요';
    case 'connectionRecovered':
      return '네트워크 연결이 회복됐어요';
    case 'videoConnecting':
      return '영상을 연결하고 있어요';
    case 'videoStarted':
      return '영상 연결이 시작됐어요';
    case 'videoStopped':
      return '영상 연결이 중지됐어요';
    case 'audioStopped':
    case 'ended':
      return '화상 상담 연결이 종료됐어요';
    case 'cameraUnavailable':
      return '카메라를 사용할 수 없어요';
    case 'cameraAvailable':
      return '카메라를 사용할 수 있어요';
    default:
      return 'Chime 화상 상담 상태를 확인하고 있어요';
  }
}

const styles = StyleSheet.create({
  avatarWrap: {
    position: 'relative',
  },
  bookingIdText: {
    color: 'rgba(255, 255, 255, 0.42)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 10,
  },
  control: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  controlDanger: {
    backgroundColor: consultingColors.danger,
  },
  controlDefault: {
    backgroundColor: '#3D3B36',
  },
  controlCompact: {
    height: 48,
    width: 48,
  },
  callStatusBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: 0,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 34,
  },
  callStatusBadgeReady: {
    backgroundColor: consultingColors.success,
  },
  controlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
    paddingTop: spacing.lg,
  },
  controlRowCompact: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  joinButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    marginTop: 0,
  },
  joinButtonDisabled: {
    opacity: 0.42,
  },
  joinButtonPressed: {
    transform: [{scale: 0.98}],
  },
  joinButtonText: {
    color: CALL_BACKGROUND,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  joinPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  joinPanelCompact: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  nativeNotice: {
    color: 'rgba(255, 255, 255, 0.48)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginTop: 10,
    textAlign: 'center',
  },
  pill: {
    backgroundColor: CALL_SURFACE,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  pressed: {
    opacity: 0.8,
  },
  root: {
    backgroundColor: CALL_BACKGROUND,
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  rootCompact: {
    paddingHorizontal: spacing.md,
  },
  reportClose: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  reportContent: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  reportEyebrow: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  reportHeader: {
    alignItems: 'center',
    borderBottomColor: consultingColors.borderSoft,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  reportHeaderCopy: {
    flex: 1,
  },
  reportModal: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
  reportSection: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  reportSectionLabel: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  reportSectionValue: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  reportTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    marginTop: 3,
  },
  remoteVideo: {
    backgroundColor: '#151410',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  remoteVideoPlaceholder: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  remoteVideoPlaceholderText: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginTop: 12,
  },
  selfView: {
    alignItems: 'center',
    backgroundColor: SELF_VIEW_BACKGROUND,
    borderRadius: radius.md,
    height: 108,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    paddingBottom: 6,
    position: 'absolute',
    right: 0,
    width: 78,
    zIndex: 3,
  },
  selfViewCompact: {
    height: 88,
    width: 64,
  },
  selfVideo: {
    backgroundColor: '#1A1915',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  selfVideoPlaceholder: {
    alignItems: 'center',
    backgroundColor: SELF_VIEW_BACKGROUND,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  selfVideoPlaceholderText: {
    color: '#D8D6D0',
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
  },
  selfViewText: {
    color: '#D8D6D0',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    zIndex: 2,
  },
  sharedCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 14,
  },
  sharedCardCompact: {
    gap: spacing.sm,
    padding: 10,
  },
  sharedCardDisabled: {
    opacity: 0.58,
  },
  sharedLabel: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
  },
  sharedText: {
    flex: 1,
  },
  sharedTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  stage: {
    alignItems: 'center',
    backgroundColor: '#1B1A16',
    borderRadius: radius.lg,
    flex: 1,
    justifyContent: 'center',
    marginVertical: spacing.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  stageCompact: {
    marginVertical: spacing.sm,
  },
  stageHint: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: 4,
    maxWidth: 260,
    textAlign: 'center',
  },
  stageName: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 16,
  },
  stageMeta: {
    alignItems: 'center',
    bottom: spacing.md,
    gap: spacing.xs,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    zIndex: 2,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  videoStatusOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    borderRadius: radius.pill,
    left: spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'absolute',
    top: spacing.md,
    zIndex: 2,
  },
  videoStatusText: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
});
