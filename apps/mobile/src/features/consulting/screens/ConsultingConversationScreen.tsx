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
import {CalendarClock, PhoneCall, Plus, Send} from 'lucide-react-native';
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
  connectConsultingConversationSocket,
  type ConsultingConversationSocketClient,
  type ConsultingRealtimeMessageEvent,
  type ConsultingServerSocketEvent,
  type ConsultingSocketStatus,
} from '../services/consultingRealtimeService';
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
  record: ConsultingRecord | null;
  onPressCall: () => void;
};

const CONSULTING_CHAT_IMAGE_QUALITY = 0.72;

export function ConsultingConversationScreen({
  authToken,
  bookingId,
  expert,
  record,
  onPressCall,
}: ConsultingConversationScreenProps) {
  const socketRef = useRef<ConsultingConversationSocketClient | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConsultingSocketStatus>('idle');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState('');

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
    [bookingId, upsertSocketMessage],
  );

  useEffect(() => {
    if (!bookingId) {
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

      if (!sent) {
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

      if (!sent) {
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

  const handleSend = useCallback(() => {
    const body = input.trim();
    if (!body || connectionStatus !== 'connected') {
      return;
    }

    sendOptimisticMessage({body});
    setInput('');
  }, [connectionStatus, input, sendOptimisticMessage]);

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

  const canSendText = connectionStatus === 'connected' && input.trim().length > 0;
  const canPickImage = connectionStatus === 'connected' && !isUploadingImage;
  const callEnabled = record?.status === 'confirmed';

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
            <Text style={styles.connectionText}>{connectionLabel}</Text>
          </RNView>
          <RNView style={styles.headerActions}>
            {record ? <ConsultingStatusBadge status={record.status} /> : null}
            <Pressable
              accessibilityLabel={callEnabled ? '전화 연결' : '예약 확정 후 전화 연결'}
              accessibilityRole="button"
              disabled={!callEnabled}
              onPress={onPressCall}
              style={({pressed}) => [
                styles.callButton,
                !callEnabled && styles.callButtonDisabled,
                pressed && callEnabled ? styles.pressed : null,
              ]}>
              <PhoneCall color={consultingColors.onAccent} size={18} />
            </Pressable>
          </RNView>
        </View>

        <View style={styles.reservationCard}>
          <RNView style={styles.reservationHeader}>
            <CalendarClock color={consultingColors.roseStrong} size={18} />
            <Text style={styles.reservationTitle}>예약 진행 상태</Text>
          </RNView>
          <InfoRow
            label="일정"
            value={record?.dateLabel ?? '예약 정보를 불러오는 중'}
          />
          <InfoRow label="상담" value={record?.categoryLabel ?? expert.title} />
          <InfoRow label="시간" value={record?.durationLabel ?? '화상 상담'} />
          <Text style={styles.reservationNotice}>
            톡은 일정 조율과 사전 질문 공간이에요. 예약이 확정되면 통화 버튼이 활성화돼요.
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
    return '연결 대기';
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
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  infoLabel: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    width: 54,
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
