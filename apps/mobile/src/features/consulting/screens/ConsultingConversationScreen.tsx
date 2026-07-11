import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {CalendarClock, Plus, Send, Video} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {uploadMediaAsset} from '../../../shared/services/mediaUploadService';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingBottomBar,
  ConsultingStatusBadge,
  ExpertAvatar,
} from '../components/consultingComponents';
import {
  formatConsultingPrice,
  getConsultingSessionModeLabel,
} from '../mocks/consulting.mock';
import {
  connectConsultingConversationSocket,
  type ConsultingConversationSocketClient,
  type ConsultingRealtimeMessageEvent,
  type ConsultingServerSocketEvent,
  type ConsultingSocketStatus,
} from '../services/consultingRealtimeService';
import {
  getConsultingCallState,
  sendConsultingTextMessage,
} from '../services/consultingService';
import type {ConsultingExpert, ConsultingRecord} from '../types';

type ChatMessage = {
  clientMessageId?: string;
  id: string;
  author: 'expert' | 'user' | 'system';
  body: string;
  imageUri?: string;
  mediaIds?: readonly string[];
  status?: 'failed' | 'pending' | 'sent';
  timeLabel: string;
};

type ConsultingConversationScreenProps = {
  authToken?: string | null;
  bookingId: string;
  expert: ConsultingExpert;
  onBookingStatusChange?: () => void;
  record: ConsultingRecord | null;
  onPressCall: () => void;
};

const CONSULTING_CHAT_IMAGE_QUALITY = 0.72;

export function ConsultingConversationScreen({
  authToken,
  bookingId,
  expert,
  onBookingStatusChange,
  record,
  onPressCall,
}: ConsultingConversationScreenProps) {
  const socketRef = useRef<ConsultingConversationSocketClient | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConsultingSocketStatus>('idle');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [bookingStatusNotice, setBookingStatusNotice] = useState<string | null>(null);
  const [isExpertCalling, setIsExpertCalling] = useState(false);
  const lastAutoRetryStatusRef = useRef<ConsultingSocketStatus>('idle');

  const connectionLabel = useMemo(
    () => getConnectionLabel(connectionStatus),
    [connectionStatus],
  );

  const upsertSocketMessage = useCallback(
    (event: ConsultingRealtimeMessageEvent) => {
      const nextMessage = mapSocketMessage(event);

      setMessages(current => {
        const existingIndex = current.findIndex(
          message =>
            message.id === event.id ||
            (event.clientMessageId &&
              message.clientMessageId === event.clientMessageId),
        );

        if (existingIndex < 0) {
          return [...current, nextMessage];
        }

        return current.map((message, index) =>
          index === existingIndex
            ? {
                ...message,
                id: event.id,
                imageUri: message.imageUri ?? nextMessage.imageUri,
                status: 'sent',
                timeLabel: nextMessage.timeLabel,
              }
            : message,
        );
      });
    },
    [],
  );

  const handleSocketEvent = useCallback(
    (event: ConsultingServerSocketEvent) => {
      if (event.type === 'message.ack') {
        setMessages(current =>
          current.map(message =>
            message.clientMessageId === event.clientMessageId
              ? {
                  ...message,
                  id: event.messageId,
                  status: 'sent',
                  timeLabel: formatMessageTime(event.sentAt),
                }
              : message,
          ),
        );
        return;
      }

      if (event.type === 'message.history') {
        const historyMessages = event.messages.map(mapSocketMessage);
        setMessages(current => mergeHistoryMessages(current, historyMessages));
        return;
      }

      if (event.type === 'message.new') {
        upsertSocketMessage(event);
        socketRef.current?.sendRead(bookingId);
        return;
      }

      if (event.type === 'booking.status') {
        setBookingStatusNotice(event.message);
        onBookingStatusChange?.();
        return;
      }

      if (event.type === 'call.status') {
        setBookingStatusNotice(event.message);
        onBookingStatusChange?.();
        if (event.status === 'started') {
          setIsExpertCalling(true);
          Alert.alert('화상 상담이 시작됐어요', event.message, [
            {text: '나중에'},
            {text: '입장하기', onPress: onPressCall},
          ]);
        } else if (event.status === 'ended') {
          setIsExpertCalling(false);
        }
        return;
      }

      if (event.type === 'error' && event.clientMessageId) {
        setMessages(current =>
          current.map(message =>
            message.clientMessageId === event.clientMessageId
              ? {...message, status: 'failed'}
              : message,
          ),
        );
      }
    },
    [bookingId, onBookingStatusChange, onPressCall, upsertSocketMessage],
  );

  useEffect(() => {
    let isMounted = true;
    setIsExpertCalling(false);
    void getConsultingCallState(bookingId).then(state => {
      if (isMounted) {
        setIsExpertCalling(state?.status === 'active');
      }
    });
    return () => {
      isMounted = false;
    };
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId || !authToken) {
      setConnectionStatus('idle');
      return;
    }

    const client = connectConsultingConversationSocket({
      authToken,
      bookingId,
      onEvent: handleSocketEvent,
      onStatusChange: setConnectionStatus,
      participantType: 'user',
    });
    socketRef.current = client;

    return () => {
      client.close();
      if (socketRef.current === client) {
        socketRef.current = null;
      }
    };
  }, [authToken, bookingId, handleSocketEvent]);

  const sendOptimisticMessage = useCallback(
    ({
      body,
      imageUri,
      mediaIds = [],
    }: {
      body: string;
      imageUri?: string;
      mediaIds?: readonly string[];
    }) => {
      const trimmedBody = body.trim();
      if (!trimmedBody && mediaIds.length === 0) {
        return;
      }

      const clientMessageId = createClientMessageId();
      const optimisticMessage: ChatMessage = {
        author: 'user',
        body: trimmedBody || '사진',
        clientMessageId,
        id: clientMessageId,
        imageUri,
        mediaIds,
        status: 'pending',
        timeLabel: '전송 중',
      };

      setMessages(current => [...current, optimisticMessage]);

      const sent = socketRef.current?.sendMessage({
        body: optimisticMessage.body,
        bookingId,
        clientMessageId,
        mediaIds: [...mediaIds],
      });

      if (!sent && mediaIds.length === 0) {
        void sendConsultingTextMessage(bookingId, {
          body: optimisticMessage.body,
          clientMessageId,
        })
          .then(delivery => {
            setMessages(current =>
              current.map(message =>
                message.clientMessageId === clientMessageId
                  ? {
                      ...message,
                      id: delivery.id,
                      status: 'sent',
                      timeLabel: formatMessageTime(delivery.sentAt),
                    }
                  : message,
              ),
            );
          })
          .catch(() => {
            setMessages(current =>
              current.map(message =>
                message.clientMessageId === clientMessageId
                  ? {...message, status: 'failed', timeLabel: '전송 실패'}
                  : message,
              ),
            );
          });
      } else if (!sent) {
        setMessages(current =>
          current.map(message =>
            message.clientMessageId === clientMessageId
              ? {...message, status: 'failed', timeLabel: '전송 실패'}
              : message,
          ),
        );
      }
    },
    [bookingId],
  );

  const retryMessage = useCallback(
    (message: ChatMessage) => {
      if (!message.clientMessageId) {
        return;
      }

      setMessages(current =>
        current.map(item =>
          item.clientMessageId === message.clientMessageId
            ? {...item, status: 'pending', timeLabel: '전송 중'}
            : item,
        ),
      );

      const sent = socketRef.current?.sendMessage({
        body: message.body,
        bookingId,
        clientMessageId: message.clientMessageId,
        mediaIds: [...(message.mediaIds ?? [])],
      });

      if (!sent && (message.mediaIds?.length ?? 0) === 0) {
        void sendConsultingTextMessage(bookingId, {
          body: message.body,
          clientMessageId: message.clientMessageId,
        })
          .then(delivery => {
            setMessages(current =>
              current.map(item =>
                item.clientMessageId === message.clientMessageId
                  ? {
                      ...item,
                      id: delivery.id,
                      status: 'sent',
                      timeLabel: formatMessageTime(delivery.sentAt),
                    }
                  : item,
              ),
            );
          })
          .catch(() => {
            setMessages(current =>
              current.map(item =>
                item.clientMessageId === message.clientMessageId
                  ? {...item, status: 'failed', timeLabel: '전송 실패'}
                  : item,
              ),
            );
          });
      } else if (!sent) {
        setMessages(current =>
          current.map(item =>
            item.clientMessageId === message.clientMessageId
              ? {...item, status: 'failed', timeLabel: '전송 실패'}
              : item,
          ),
        );
      }
    },
    [bookingId],
  );

  useEffect(() => {
    if (connectionStatus !== 'connected') {
      lastAutoRetryStatusRef.current = connectionStatus;
      return;
    }
    if (lastAutoRetryStatusRef.current === 'connected') {
      return;
    }
    lastAutoRetryStatusRef.current = 'connected';
    messages
      .filter(message => message.status === 'failed')
      .forEach(message => retryMessage(message));
  }, [connectionStatus, messages, retryMessage]);

  const handleSend = useCallback(() => {
    const body = input.trim();
    if (!body) {
      return;
    }

    sendOptimisticMessage({body});
    setInput('');
  }, [input, sendOptimisticMessage]);

  const handlePickImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('앨범 접근 권한', '사진을 보내려면 앨범 접근 권한이 필요해요.', [
          {text: '확인'},
        ]);
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: CONSULTING_CHAT_IMAGE_QUALITY,
      });

      if (pickerResult.canceled || pickerResult.assets.length === 0) {
        return;
      }

      const asset = pickerResult.assets[0];
      setIsUploadingImage(true);
      const media = await uploadMediaAsset({
        contentType: asset.mimeType,
        fileName: asset.fileName,
        height: asset.height,
        mediaKind: 'consulting-chat',
        normalize: {
          compress: CONSULTING_CHAT_IMAGE_QUALITY,
          format: 'jpeg',
          maxDimension: 1440,
        },
        source: 'gallery',
        uri: asset.uri,
        width: asset.width,
      });

      sendOptimisticMessage({
        body: '사진',
        imageUri: asset.uri,
        mediaIds: [media.id],
      });
    } catch {
      Alert.alert('사진 전송', '사진을 불러오지 못했어요. 다시 시도해 주세요.', [
        {text: '확인'},
      ]);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const canSendText = input.trim().length > 0;
  const canPickImage = connectionStatus === 'connected' && !isUploadingImage;
  const callEnabled = canJoinVideoCall(record) && isExpertCalling;
  const reservationDateLabel = getReservationDateLabel(record);
  const reservationStartTimeLabel = getReservationStartTimeLabel(record);
  const sessionModeLabel = getReservationSessionModeLabel(record);
  const estimatedPriceLabel =
    typeof record?.estimatedPrice === 'number'
      ? formatConsultingPrice(record.estimatedPrice)
      : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={96} contentGap={spacing.lg}>
        <View style={styles.expertHeader}>
          <ExpertAvatar expert={expert} size={54} />
          <RNView style={styles.expertHeaderBody}>
            <Text style={styles.expertName}>{expert.name}</Text>
            <Text numberOfLines={1} style={styles.expertMeta}>
              {expert.studioName ?? expert.title}
            </Text>
            <Pressable
              accessibilityHint="연결이 끊겼을 때 다시 연결합니다"
              accessibilityRole="button"
              disabled={connectionStatus === 'connected'}
              onPress={() => socketRef.current?.reconnect()}
              style={({pressed}) => [
                styles.connectionAction,
                connectionStatus === 'connected'
                  ? styles.connectionActionDisabled
                  : null,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.connectionText}>
                {connectionStatus === 'connected'
                  ? connectionLabel
                  : `${connectionLabel} · 눌러서 다시 연결`}
              </Text>
            </Pressable>
          </RNView>
          <RNView style={styles.headerActions}>
            {record ? <ConsultingStatusBadge status={record.status} /> : null}
            {callEnabled ? (
              <Pressable
                accessibilityLabel="전문가가 시작한 화상 상담 입장"
                accessibilityRole="button"
                onPress={onPressCall}
                style={({pressed}) => [
                  styles.callButton,
                  pressed ? styles.pressed : null,
                ]}>
                <Video color={consultingColors.onAccent} size={18} />
              </Pressable>
            ) : null}
          </RNView>
        </View>

        <View style={styles.reservationCard}>
          <RNView style={styles.reservationHeader}>
            <CalendarClock color={consultingColors.roseStrong} size={18} />
            <Text style={styles.reservationTitle}>예약 진행 상태</Text>
          </RNView>
          <InfoRow
            label="일정"
            value={reservationDateLabel}
          />
          <InfoRow label="시작 시간" value={reservationStartTimeLabel} />
          <InfoRow label="상담" value={record?.categoryLabel ?? expert.title} />
          <InfoRow
            label="방식"
            value={
              estimatedPriceLabel
                ? `${sessionModeLabel} · 예상가 ${estimatedPriceLabel}`
                : sessionModeLabel
            }
          />
          <InfoRow label="소요 시간" value={record?.durationLabel ?? '화상 상담'} />
          <Text style={styles.reservationNotice}>
            {bookingStatusNotice ?? getBookingStatusNotice(record?.status)}
          </Text>
        </View>

        <View style={styles.thread}>
          <RNView style={styles.threadHeader}>
            <Text style={styles.threadTitle}>상담 톡</Text>
            <Text style={styles.threadSubtitle}>메시지는 아래 입력창에서 바로 확인돼요</Text>
          </RNView>
          {messages.length === 0 ? (
            <RNView style={styles.systemBubble}>
              <Text style={styles.systemText}>{connectionLabel}</Text>
            </RNView>
          ) : null}
          {messages.map(message => (
            <ChatBubble
              expert={expert}
              key={message.clientMessageId ?? message.id}
              message={message}
              onRetry={retryMessage}
            />
          ))}
        </View>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <RNView style={styles.inputBar}>
          <Pressable
            accessibilityLabel="사진 추가"
            accessibilityRole="button"
            accessibilityState={{disabled: !canPickImage}}
            disabled={!canPickImage}
            onPress={handlePickImage}
            style={({pressed}) => [
              styles.addButton,
              !canPickImage ? styles.sendButtonDisabled : null,
              pressed ? styles.pressed : null,
            ]}>
            <Plus color={consultingColors.text} size={20} />
          </Pressable>
          <TextInput
            multiline
            onChangeText={setInput}
            placeholder="상담사에게 메시지 보내기"
            placeholderTextColor={consultingColors.textSoft}
            style={styles.messageInput}
            textAlignVertical="center"
            value={input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{disabled: !canSendText}}
            disabled={!canSendText}
            onPress={handleSend}
            style={({pressed}) => [
              styles.sendButton,
              !canSendText && styles.sendButtonDisabled,
              pressed && canSendText ? styles.pressed : null,
            ]}>
            <Send color={consultingColors.onAccent} size={18} />
          </Pressable>
        </RNView>
      </ConsultingBottomBar>
    </KeyboardAvoidingView>
  );
}

function InfoRow({label, value}: {label: string; value: string}) {
  return (
    <RNView style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.infoValue}>
        {value}
      </Text>
    </RNView>
  );
}

function createClientMessageId(): string {
  return `consulting-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatMessageTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '방금';
  }

  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getReservationDateLabel(record: ConsultingRecord | null): string {
  if (!record) {
    return '예약 정보를 불러오는 중';
  }

  return stripTimeFromDateLabel(record.dateLabel) || record.dateLabel;
}

function getReservationStartTimeLabel(record: ConsultingRecord | null): string {
  if (!record) {
    return '예약 정보를 불러오는 중';
  }

  const slotTime = formatSlotTimeLabel(record.slotId);
  if (slotTime) {
    return slotTime;
  }

  const dateTime = extractTimeFromDateLabel(record.dateLabel);
  return dateTime || '시간 확인 중';
}

function getReservationSessionModeLabel(record: ConsultingRecord | null): string {
  return getConsultingSessionModeLabel(record?.sessionMode ?? 'online');
}

function canJoinVideoCall(record: ConsultingRecord | null): boolean {
  if (!record || record.sessionMode === 'offline') {
    return false;
  }

  return ['confirmed', 'scheduled', 'in_progress'].includes(record.status);
}

function getBookingStatusNotice(status?: ConsultingRecord['status']): string {
  if (status === 'confirmed' || status === 'scheduled') {
    return '예약이 완료되었습니다. 예약일에 전문가가 먼저 화상 상담을 시작하니, 안내된 시간에 연락을 기다려 주세요.';
  }
  if (status === 'in_progress') {
    return '전문가가 상담을 시작했습니다. 오른쪽 화상 상담 버튼으로 입장할 수 있어요.';
  }
  if (status === 'contacting') {
    return '입금 확인과 일정 조율 중입니다. 전문가의 안내 메시지를 확인해 주세요.';
  }
  return '톡은 일정 조율과 사전 질문 공간이에요. 입금 확인 후 전문가가 예약을 확정하면 화상 상담 버튼이 활성화돼요.';
}

function stripTimeFromDateLabel(label: string): string {
  return label
    .replace(/\s*(오전|오후)\s*\d{1,2}:\d{2}\s*$/, '')
    .replace(/\s*\d{1,2}:\d{2}\s*$/, '')
    .trim();
}

function extractTimeFromDateLabel(label: string): string | null {
  const koreanTimeMatch = label.match(/(오전|오후)\s*\d{1,2}:\d{2}/);
  if (koreanTimeMatch?.[0]) {
    return koreanTimeMatch[0].replace(/\s+/, ' ');
  }

  const numericTimeMatch = label.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!numericTimeMatch?.[0]) {
    return null;
  }

  return formatSlotTimeLabel(numericTimeMatch[0]);
}

function formatSlotTimeLabel(slotId?: string | null): string | null {
  if (!slotId) {
    return null;
  }

  const match = slotId.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return slotId;
  }

  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour < 12 ? '오전' : '오후';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${displayHour}:${minute}`;
}

function mapSocketMessage(event: ConsultingRealtimeMessageEvent): ChatMessage {
  const imageUri =
    event.media?.find(media => media.thumbnailUrl || media.cdnUrl)
      ?.thumbnailUrl ??
    event.media?.find(media => media.cdnUrl)?.cdnUrl ??
    undefined;
  const author =
    event.senderType === 'user'
      ? 'user'
      : event.senderType === 'system'
        ? 'system'
        : 'expert';

  return {
    author,
    body: event.body,
    clientMessageId: event.clientMessageId,
    id: event.id,
    imageUri: imageUri ?? undefined,
    mediaIds: event.mediaIds ?? [],
    status: 'sent',
    timeLabel: formatMessageTime(event.sentAt),
  };
}

function getMessageKey(message: ChatMessage): string {
  return message.clientMessageId ?? message.id;
}

function mergeHistoryMessages(
  current: readonly ChatMessage[],
  historyMessages: readonly ChatMessage[],
): readonly ChatMessage[] {
  const historyKeys = new Set(historyMessages.map(getMessageKey));
  const pendingMessages = current.filter(
    message =>
      (message.status === 'pending' || message.status === 'failed') &&
      !historyKeys.has(getMessageKey(message)),
  );

  return [...historyMessages, ...pendingMessages];
}

function getConnectionLabel(status: ConsultingSocketStatus): string {
  if (status === 'connected') {
    return '실시간 연결됨';
  }

  if (status === 'connecting') {
    return '연결 중';
  }

  if (status === 'reconnecting') {
    return '재연결 중';
  }

  if (status === 'offline') {
    return '실시간 연결 대기 · 문자 전송 가능';
  }

  return '상담 대화';
}

function ChatBubble({
  expert,
  message,
  onRetry,
}: {
  expert: ConsultingExpert;
  message: ChatMessage;
  onRetry: (message: ChatMessage) => void;
}) {
  if (message.author === 'system') {
    return (
      <RNView style={styles.systemBubble}>
        <Text style={styles.systemText}>{message.body}</Text>
      </RNView>
    );
  }

  const isUser = message.author === 'user';
  return (
    <RNView style={[styles.messageRow, isUser && styles.messageRowUser]}>
      {isUser ? null : <ExpertAvatar expert={expert} size={30} />}
      <RNView
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.expertBubble,
        ]}>
        <Text
          style={[
            styles.messageText,
            isUser ? styles.userMessageText : styles.expertMessageText,
          ]}>
          {message.body}
        </Text>
        {message.imageUri ? (
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            source={{uri: message.imageUri}}
            style={styles.messageImage}
          />
        ) : null}
        <Text
          style={[
            styles.messageTime,
            isUser ? styles.userMessageTime : styles.expertMessageTime,
          ]}>
          {getMessageTimeLabel(message)}
        </Text>
        {message.status === 'failed' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onRetry(message)}
            style={({pressed}) => [pressed ? styles.pressed : null]}>
            <Text
              style={[
                styles.retryText,
                isUser ? styles.userMessageTime : styles.expertMessageTime,
              ]}>
              다시 보내기
            </Text>
          </Pressable>
        ) : null}
      </RNView>
    </RNView>
  );
}

function getMessageTimeLabel(message: ChatMessage): string {
  if (message.status === 'pending') {
    return '전송 중';
  }

  if (message.status === 'failed') {
    return '전송 실패';
  }

  return message.timeLabel;
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  callButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  callButtonDisabled: {
    opacity: 0.35,
  },
  expertBubble: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderWidth: 1,
  },
  expertHeader: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 16,
  },
  expertHeaderBody: {
    flex: 1,
  },
  expertMessageText: {
    color: consultingColors.text,
  },
  expertMessageTime: {
    color: consultingColors.textSoft,
  },
  expertMeta: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 3,
  },
  expertName: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  connectionText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    marginTop: 4,
  },
  connectionAction: {
    alignSelf: 'flex-start',
  },
  connectionActionDisabled: {
    opacity: 0.8,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  infoLabel: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    width: 64,
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  infoValue: {
    color: consultingColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  inputBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  messageBubble: {
    borderRadius: consultingRadius.card,
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageInput: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    color: consultingColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    maxHeight: 108,
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageImage: {
    borderRadius: consultingRadius.card,
    height: 160,
    marginTop: spacing.sm,
    width: 190,
  },
  messageRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  messageTime: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.85,
  },
  reservationCard: {
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.card,
    gap: spacing.sm,
    padding: 16,
  },
  reservationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: 2,
  },
  reservationNotice: {
    color: consultingColors.roseText,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: 4,
  },
  retryText: {
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 5,
    textDecorationLine: 'underline',
  },
  reservationTitle: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  root: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  systemText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  thread: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  threadHeader: {
    gap: 3,
    paddingHorizontal: 2,
  },
  threadSubtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  threadTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  userBubble: {
    backgroundColor: consultingColors.accent,
  },
  userMessageText: {
    color: consultingColors.onAccent,
  },
  userMessageTime: {
    color: 'rgba(255,255,255,0.72)',
  },
});
