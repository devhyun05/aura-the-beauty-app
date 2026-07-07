import {useState} from 'react';
import {
  Alert,
  Image,
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
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingBottomBar,
  ConsultingStatusBadge,
  ExpertAvatar,
} from '../components/consultingComponents';
import type {ConsultingExpert, ConsultingRecord} from '../types';

type ChatMessage = {
  id: string;
  author: 'expert' | 'user' | 'system';
  body: string;
  imageUri?: string;
  timeLabel: string;
};

type ConsultingConversationScreenProps = {
  expert: ConsultingExpert;
  record: ConsultingRecord | null;
  onPressCall: () => void;
};

const CONSULTING_CHAT_IMAGE_QUALITY = 0.72;

export function ConsultingConversationScreen({
  expert,
  record,
  onPressCall,
}: ConsultingConversationScreenProps) {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([
    {
      id: 'welcome',
      author: 'expert',
      body: '예약 확인했습니다. 상담 전에 궁금한 점을 남겨주시면 확인 후 답변드릴게요.',
      timeLabel: '방금',
    },
  ]);
  const [input, setInput] = useState('');

  const appendMessage = (body: string, author: ChatMessage['author'] = 'user') => {
    const message = body.trim();
    if (!message) {
      return;
    }

    setMessages(current => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        author,
        body: message,
        timeLabel: '방금',
      },
    ]);
  };

  const handleSend = () => {
    appendMessage(input);
    setInput('');
  };

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
      setMessages(current => [
        ...current,
        {
          id: `${Date.now()}-${current.length}`,
          author: 'user',
          body: '사진',
          imageUri: asset.uri,
          timeLabel: '방금',
        },
      ]);
    } catch {
      Alert.alert('사진 전송', '사진을 불러오지 못했어요. 다시 시도해 주세요.', [
        {text: '확인'},
      ]);
    }
  };

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={96} contentGap={spacing.lg}>
        <View style={styles.expertHeader}>
          <ExpertAvatar expert={expert} size={54} />
          <RNView style={styles.expertHeaderBody}>
            <Text style={styles.expertName}>{expert.name}</Text>
            <Text numberOfLines={1} style={styles.expertMeta}>
              {expert.studioName ?? expert.title}
            </Text>
          </RNView>
          <RNView style={styles.headerActions}>
            {record ? <ConsultingStatusBadge status={record.status} /> : null}
            <Pressable
              accessibilityLabel="전화 연결"
              accessibilityRole="button"
              onPress={onPressCall}
              style={({pressed}) => [
                styles.callButton,
                pressed ? styles.pressed : null,
              ]}>
              <PhoneCall color={consultingColors.onAccent} size={18} />
            </Pressable>
          </RNView>
        </View>

        <View style={styles.reservationCard}>
          <RNView style={styles.reservationHeader}>
            <CalendarClock color={consultingColors.roseStrong} size={18} />
            <Text style={styles.reservationTitle}>예약 정보</Text>
          </RNView>
          <InfoRow
            label="일정"
            value={record?.dateLabel ?? '예약 정보를 불러오는 중'}
          />
          <InfoRow label="상담" value={record?.categoryLabel ?? expert.title} />
          <InfoRow label="시간" value={record?.durationLabel ?? '화상 상담'} />
          <Text style={styles.reservationNotice}>
            예약 시간에는 상담사가 먼저 전화를 시작합니다.
          </Text>
        </View>

        <View style={styles.thread}>
          {messages.map(message => (
            <ChatBubble expert={expert} key={message.id} message={message} />
          ))}
        </View>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <RNView style={styles.inputBar}>
          <Pressable
            accessibilityLabel="사진 추가"
            accessibilityRole="button"
            onPress={handlePickImage}
            style={({pressed}) => [
              styles.addButton,
              pressed ? styles.pressed : null,
            ]}>
            <Plus color={consultingColors.text} size={20} />
          </Pressable>
          <TextInput
            onChangeText={setInput}
            placeholder="상담사에게 메시지 보내기"
            placeholderTextColor={consultingColors.textSoft}
            style={styles.messageInput}
            value={input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{disabled: input.trim().length === 0}}
            disabled={input.trim().length === 0}
            onPress={handleSend}
            style={({pressed}) => [
              styles.sendButton,
              input.trim().length === 0 && styles.sendButtonDisabled,
              pressed && input.trim().length > 0 ? styles.pressed : null,
            ]}>
            <Send color={consultingColors.onAccent} size={18} />
          </Pressable>
        </RNView>
      </ConsultingBottomBar>
    </RNView>
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

function ChatBubble({
  expert,
  message,
}: {
  expert: ConsultingExpert;
  message: ChatMessage;
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
          {message.timeLabel}
        </Text>
      </RNView>
    </RNView>
  );
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
    minHeight: 46,
    paddingHorizontal: 16,
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
