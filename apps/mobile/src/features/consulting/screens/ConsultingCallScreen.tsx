import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, View as RNView} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  FileText,
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
} from 'lucide-react-native';
import {Text} from 'tamagui';

import {consultingColors, radius, spacing, typography} from '../../../shared/theme';
import {setUnityMakeupPlayerPaused} from '../../ar/services/unityMakeupBridge';
import {ChimeVideoView, isNativeChimeVideoViewAvailable} from '../components/ChimeVideoView';
import {ExpertAvatar} from '../components/consultingComponents';
import {findConsultingDuration} from '../mocks/consulting.mock';
import {
  addNativeChimeMeetingListener,
  isNativeChimeMeetingAvailable,
  setNativeChimeLocalVideoEnabled,
  setNativeChimeMuted,
  startNativeChimeMeeting,
  stopNativeChimeMeeting,
  switchNativeChimeCamera,
  type ChimeTranscriptResult,
} from '../native/chimeMeeting';
import {
  getConsultingCallState,
  joinConsultingCall,
} from '../services/consultingService';
import {
  connectConsultingConversationSocket,
  type ConsultingServerSocketEvent,
} from '../services/consultingRealtimeService';
import type {
  ConsultingCaptionViewModel,
  ConsultingCallJoinResult,
  ConsultingCallLanguageCode,
  ConsultingCallState,
  ConsultingExpert,
} from '../types';

const CALL_BACKGROUND = '#26241F';
const CALL_SURFACE = 'rgba(255, 255, 255, 0.14)';
const SELF_VIEW_BACKGROUND = '#4A473F';

type CallJoinStatus = 'idle' | 'joining' | 'ready' | 'not_ready';

type CaptionLanguageFallback = {
  customerLanguageCode: ConsultingCallLanguageCode;
  expertLanguageCode: ConsultingCallLanguageCode;
  defaultLanguageCode: ConsultingCallLanguageCode;
};

type CaptionTranslationEvent = Extract<ConsultingServerSocketEvent, {type: 'caption.translation'}>;

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
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [callState, setCallState] = useState<ConsultingCallState | null>(null);
  const [joinResult, setJoinResult] = useState<ConsultingCallJoinResult | null>(null);
  const [joinStatus, setJoinStatus] = useState<CallJoinStatus>('idle');
  const [localVideoActive, setLocalVideoActive] = useState(false);
  const [remoteVideoActive, setRemoteVideoActive] = useState(false);
  const [captions, setCaptions] = useState<readonly ConsultingCaptionViewModel[]>([]);
  const [captionStatusMessage, setCaptionStatusMessage] = useState<string | null>(null);
  const [selectedLanguageCode, setSelectedLanguageCode] =
    useState<ConsultingCallLanguageCode>('ko-KR');
  const [statusMessage, setStatusMessage] = useState('상담 연결을 준비하고 있어요');
  const pendingCaptionTranslationsRef = useRef<readonly CaptionTranslationEvent[]>([]);
  const duration = findConsultingDuration(expert, durationId);
  const nativeChimeAvailable = isNativeChimeMeetingAvailable();
  const nativeVideoAvailable = nativeChimeAvailable && isNativeChimeVideoViewAvailable();
  const captionLanguageFallback = useMemo<CaptionLanguageFallback>(() => {
    const customerLanguageCode =
      joinResult?.transcription.customerLanguageCode ??
      callState?.transcription.customerLanguageCode ??
      (joinResult?.participant.type === 'customer' ? joinResult.participant.languageCode : null) ??
      selectedLanguageCode;
    const expertLanguageCode =
      joinResult?.transcription.expertLanguageCode ??
      callState?.transcription.expertLanguageCode ??
      (joinResult?.participant.type === 'partner' ? joinResult.participant.languageCode : null) ??
      selectedLanguageCode;

    return {
      customerLanguageCode,
      defaultLanguageCode: selectedLanguageCode,
      expertLanguageCode,
    };
  }, [
    callState?.transcription.customerLanguageCode,
    callState?.transcription.expertLanguageCode,
    joinResult?.participant.languageCode,
    joinResult?.participant.type,
    joinResult?.transcription.customerLanguageCode,
    joinResult?.transcription.expertLanguageCode,
    selectedLanguageCode,
  ]);
  const captionLanguageFallbackRef = useRef(captionLanguageFallback);

  useEffect(() => {
    captionLanguageFallbackRef.current = captionLanguageFallback;
  }, [captionLanguageFallback]);

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

      if (event.type === 'transcriptEvent') {
        if (event.eventKind === 'transcriptionStatus') {
          setCaptionStatusMessage(
            getTranscriptionStatusMessage(event.transcriptionStatus?.status),
          );
          return;
        }

        const nextCaptions = applyPendingCaptionTranslations(
          mapNativeTranscriptResults(event.results ?? [], captionLanguageFallbackRef.current),
          pendingCaptionTranslationsRef.current,
        );
        if (nextCaptions.length > 0) {
          setCaptionStatusMessage(null);
          setCaptions(current => mergeCaptionResults(current, nextCaptions));
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

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let isMounted = true;

    setUnityMakeupPlayerPaused(true);
    pendingCaptionTranslationsRef.current = [];
    setCaptionStatusMessage(null);
    setCaptions([]);
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
      setStatusMessage('상담 언어를 선택한 뒤 입장해 주세요');

      try {
        const state = await getConsultingCallState(bookingId);
        if (!isMounted) {
          return;
        }
        setCallState(state);
        if (state?.chimeEnabled === false) {
          setJoinStatus('not_ready');
          setStatusMessage('Chime 서버 설정이 아직 켜져 있지 않아요');
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
      setUnityMakeupPlayerPaused(false);
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
          return;
        }
        if (event.type !== 'caption.translation') {
          return;
        }

        pendingCaptionTranslationsRef.current = rememberCaptionTranslation(
          pendingCaptionTranslationsRef.current,
          event,
        );
        setCaptions(current => applyCaptionTranslation(current, event));
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
  const visibleCaptions = captions.slice(-4);
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
  const transcriptionLabel = callState?.transcription.enabled
    ? callState.transcription.status === 'active'
      ? `실시간 자막 켜짐 · ${callState.transcription.mode === 'identify' ? '한/영 자동' : '고정 언어'}`
      : callState.transcription.status === 'starting'
        ? '실시간 자막 시작 중'
        : callState.transcription.status === 'stopping'
          ? '실시간 자막 종료 중'
          : '실시간 자막 대기'
    : null;

  const handleEndCall = useCallback(() => {
    void stopNativeChimeMeeting();
    setUnityMakeupPlayerPaused(false);
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
    setCaptionStatusMessage(null);
    setCaptions([]);
    pendingCaptionTranslationsRef.current = [];
    setStatusMessage('상담 연결을 준비하고 있어요');

    let result: ConsultingCallJoinResult | null = null;
    try {
      result = await joinConsultingCall(bookingId, selectedLanguageCode);
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
            '네이티브 Chime SDK 연결을 시작하지 못했어요',
          ),
        );
        return;
      }
      setStatusMessage(
        nativeStarted
          ? 'Chime 화상 상담 영상을 연결하고 있어요'
          : 'Chime 입장 정보가 준비됐어요. iOS 브리지를 연결하면 영상이 표시돼요.',
      );
      return;
    }

    setJoinStatus(callState?.chimeEnabled === false ? 'not_ready' : 'idle');
    setStatusMessage(
      callState?.chimeEnabled === false
        ? 'Chime 서버 설정이 아직 켜져 있지 않아요'
        : '입장 정보를 가져오지 못했어요. 네트워크와 예약 시간을 확인한 뒤 다시 시도해 주세요.',
    );
  }, [bookingId, callState?.chimeEnabled, expertCallActive, joinStatus, selectedLanguageCode]);

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
        {paddingBottom: Math.max(insets.bottom, spacing.lg), paddingTop: insets.top + spacing.md},
      ]}>
      <RNView style={styles.topRow}>
        <RNView style={styles.pill}>
          <Text style={styles.pillText}>{expert.name}</Text>
        </RNView>
        <RNView style={styles.pill}>
          <Text style={styles.pillText}>{statusLabel} · {duration.minutes}분</Text>
        </RNView>
      </RNView>

      <RNView style={styles.stage}>
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
          {transcriptionLabel ? (
            <RNView style={styles.transcriptionPill}>
              <Text style={styles.transcriptionText}>{transcriptionLabel}</Text>
            </RNView>
          ) : null}
        </RNView>

        {visibleCaptions.length > 0 || captionStatusMessage ? (
          <RNView style={styles.captionPanel}>
            {visibleCaptions.map(caption => (
              <RNView
                key={caption.resultId}
                style={[
                  styles.captionBubble,
                  caption.isPartial ? styles.captionBubblePartial : null,
                ]}>
                <Text style={styles.captionSpeaker}>
                  {getCaptionSpeakerLabel(caption.speakerType)}
                  {caption.isPartial ? ' · 입력 중' : ''}
                </Text>
                <Text style={styles.captionContent} numberOfLines={2}>
                  {caption.content}
                </Text>
                {caption.translatedContent ? (
                  <Text style={styles.captionTranslation} numberOfLines={2}>
                    {caption.translatedContent}
                  </Text>
                ) : null}
              </RNView>
            ))}
            {captionStatusMessage && visibleCaptions.length === 0 ? (
              <Text style={styles.captionStatusText}>{captionStatusMessage}</Text>
            ) : null}
          </RNView>
        ) : null}

        <RNView style={[styles.selfView, {top: spacing.md}]}>
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
        <RNView style={styles.languagePanel}>
          <Text style={styles.languageTitle}>상담 언어</Text>
          <RNView style={styles.languageOptions}>
            <LanguageOption
              active={selectedLanguageCode === 'ko-KR'}
              label="한국어"
              onPress={() => setSelectedLanguageCode('ko-KR')}
            />
            <LanguageOption
              active={selectedLanguageCode === 'en-US'}
              label="English"
              onPress={() => setSelectedLanguageCode('en-US')}
            />
          </RNView>
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

      <RNView style={styles.sharedCard}>
        <FileText color={consultingColors.roseStrong} size={18} />
        <RNView style={styles.sharedText}>
          <Text style={styles.sharedLabel}>공유된 리포트</Text>
          <Text style={styles.sharedTitle}>퍼스널컬러 리포트 · 여름 쿨 뮤트</Text>
        </RNView>
      </RNView>

      <RNView style={styles.controlRow}>
        <CallControl
          icon={micOn ? <Mic color="#fff" size={20} /> : <MicOff color="#fff" size={20} />}
          label={micOn ? '마이크 끄기' : '마이크 켜기'}
          onPress={handleToggleMic}
        />
        <CallControl
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
          icon={<SwitchCamera color="#fff" size={20} />}
          label="카메라 전환"
          onPress={handleSwitchCamera}
        />
        <CallControl
          danger
          icon={<PhoneOff color="#fff" size={20} />}
          label="나가기"
          onPress={handleEndCall}
        />
      </RNView>
    </RNView>
  );
}

function CallControl({
  icon,
  label,
  onPress,
  danger = false,
}: {
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
        danger ? styles.controlDanger : styles.controlDefault,
        pressed ? styles.pressed : null,
      ]}>
      {icon}
    </Pressable>
  );
}

function LanguageOption({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected: active}}
      onPress={onPress}
      style={({pressed}) => [
        styles.languageOption,
        active ? styles.languageOptionActive : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={[styles.languageOptionText, active ? styles.languageOptionTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function mapNativeTranscriptResults(
  results: readonly ChimeTranscriptResult[],
  fallbackLanguage: CaptionLanguageFallback,
): ConsultingCaptionViewModel[] {
  const captions: ConsultingCaptionViewModel[] = [];
  for (const result of results) {
    const content = typeof result.content === 'string' ? result.content.trim() : '';
    const resultId = typeof result.resultId === 'string' ? result.resultId.trim() : '';
    if (!content || !resultId) {
      continue;
    }

    const speakerType = normalizeCaptionSpeaker(result.speakerType);
    const sourceLanguageCode =
      normalizeCallLanguageCode(result.sourceLanguageCode) ??
      getFallbackCaptionLanguageCode(speakerType, fallbackLanguage);

    captions.push({
      attendeeId: result.attendeeId,
      content,
      endTimeMs: result.endTimeMs,
      externalUserId: result.externalUserId,
      isPartial: Boolean(result.isPartial),
      resultId,
      sourceLanguageCode,
      speakerType,
      startTimeMs: result.startTimeMs,
    });
  }

  return captions;
}

function mergeCaptionResults(
  current: readonly ConsultingCaptionViewModel[],
  incoming: readonly ConsultingCaptionViewModel[],
): ConsultingCaptionViewModel[] {
  let next = [...current];
  for (const caption of incoming) {
    const existingIndex = next.findIndex(item => item.resultId === caption.resultId);
    if (existingIndex >= 0) {
      next = next.map((item, index) =>
        index === existingIndex
          ? item.isPartial || !caption.isPartial
            ? {
                ...item,
                ...caption,
                translatedContent: caption.translatedContent ?? item.translatedContent,
                targetLanguageCode: caption.targetLanguageCode ?? item.targetLanguageCode,
              }
            : item
          : item,
      );
    } else {
      next = [...next, caption];
    }
  }

  const finalized = next.filter(caption => !caption.isPartial).slice(-4);
  const partial = next.filter(caption => caption.isPartial).slice(-1);
  return [...finalized, ...partial].slice(-4);
}

function applyCaptionTranslation(
  current: readonly ConsultingCaptionViewModel[],
  event: CaptionTranslationEvent,
): ConsultingCaptionViewModel[] {
  return current.map(caption =>
    caption.resultId === event.resultId && !caption.isPartial
      ? {
          ...caption,
          sourceLanguageCode: event.sourceLanguageCode,
          targetLanguageCode: event.targetLanguageCode,
          translatedContent: event.translatedContent,
        }
      : caption,
  );
}

function applyPendingCaptionTranslations(
  captions: readonly ConsultingCaptionViewModel[],
  pendingTranslations: readonly CaptionTranslationEvent[],
): ConsultingCaptionViewModel[] {
  if (pendingTranslations.length === 0) {
    return [...captions];
  }

  return pendingTranslations.reduce<ConsultingCaptionViewModel[]>(
    (current, translation) => applyCaptionTranslation(current, translation),
    [...captions],
  );
}

function rememberCaptionTranslation(
  current: readonly CaptionTranslationEvent[],
  event: CaptionTranslationEvent,
): readonly CaptionTranslationEvent[] {
  return [
    ...current.filter(translation => translation.resultId !== event.resultId),
    event,
  ].slice(-20);
}

function normalizeCaptionSpeaker(
  value: ChimeTranscriptResult['speakerType'],
): ConsultingCaptionViewModel['speakerType'] {
  if (value === 'user' || value === 'expert') {
    return value;
  }
  return 'unknown';
}

function normalizeCallLanguageCode(value: unknown): ConsultingCallLanguageCode | null {
  return value === 'ko-KR' || value === 'en-US' ? value : null;
}

function getFallbackCaptionLanguageCode(
  speakerType: ConsultingCaptionViewModel['speakerType'],
  fallback: CaptionLanguageFallback,
): ConsultingCallLanguageCode {
  switch (speakerType) {
    case 'user':
      return fallback.customerLanguageCode;
    case 'expert':
      return fallback.expertLanguageCode;
    default:
      return fallback.defaultLanguageCode;
  }
}

function getCaptionSpeakerLabel(speakerType: ConsultingCaptionViewModel['speakerType']): string {
  switch (speakerType) {
    case 'user':
      return '고객';
    case 'expert':
      return '상담사';
    default:
      return '화자';
  }
}

function getTranscriptionStatusMessage(status?: string): string | null {
  switch (status) {
    case 'started':
    case 'resumed':
      return '실시간 자막이 시작됐어요';
    case 'interrupted':
      return '실시간 자막 연결을 다시 확인하고 있어요';
    case 'stopped':
      return '실시간 자막이 종료됐어요';
    case 'failed':
      return '실시간 자막을 사용할 수 없어요';
    default:
      return null;
  }
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
  captionBubble: {
    backgroundColor: 'rgba(17, 16, 14, 0.78)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  captionBubblePartial: {
    opacity: 0.72,
  },
  captionContent: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  captionPanel: {
    bottom: 74,
    gap: spacing.xs,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    zIndex: 4,
  },
  captionSpeaker: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
    marginBottom: 3,
  },
  captionStatusText: {
    alignSelf: 'center',
    backgroundColor: 'rgba(17, 16, 14, 0.72)',
    borderRadius: radius.pill,
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  captionTranslation: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: 4,
  },
  controlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
    paddingTop: spacing.lg,
  },
  joinButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    marginTop: spacing.md,
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
  languageOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    height: 42,
    justifyContent: 'center',
  },
  languageOptionActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  languageOptionText: {
    color: 'rgba(255, 255, 255, 0.74)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  languageOptionTextActive: {
    color: CALL_BACKGROUND,
  },
  languageOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  languagePanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  languageTitle: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
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
  transcriptionPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  transcriptionText: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
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
