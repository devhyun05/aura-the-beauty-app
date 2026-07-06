import {useEffect, useState, type ReactNode} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, View as RNView} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  FileText,
  Mic,
  MicOff,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react-native';
import {Text} from 'tamagui';

import {consultingColors, radius, spacing, typography} from '../../../shared/theme';
import {ExpertAvatar} from '../components/consultingComponents';
import {findConsultingDuration} from '../mocks/consulting.mock';
import type {ConsultingExpert} from '../types';

const CALL_BACKGROUND = '#26241F';
const CALL_SURFACE = 'rgba(255, 255, 255, 0.14)';
const SELF_VIEW_BACKGROUND = '#4A473F';

type ConsultingCallScreenProps = {
  expert: ConsultingExpert;
  durationId: string;
  onEndCall: () => void;
};

export function ConsultingCallScreen({
  expert,
  durationId,
  onEndCall,
}: ConsultingCallScreenProps) {
  const insets = useSafeAreaInsets();
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [connecting, setConnecting] = useState(true);
  const duration = findConsultingDuration(expert, durationId);

  useEffect(() => {
    const timer = setTimeout(() => setConnecting(false), 1400);
    return () => clearTimeout(timer);
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
          <Text style={styles.pillText}>02:14 / {duration.minutes}:00</Text>
        </RNView>
      </RNView>

      <RNView style={styles.stage}>
        <ExpertAvatar expert={expert} size={96} />
        {connecting ? (
          <RNView style={styles.connectingRow}>
            <ActivityIndicator color="#FFFFFF" size="small" />
            <Text style={[styles.stageName, styles.stageNameInline]}>
              연결 중이에요...
            </Text>
          </RNView>
        ) : (
          <Text style={styles.stageName}>{expert.name} 님과 상담 중</Text>
        )}
        <Text style={styles.stageHint}>
          {connecting ? '잠시만 기다려주세요' : '실시간 화상 상담'}
        </Text>

        <RNView style={[styles.selfView, {top: spacing.md}]}>
          <Text style={styles.selfViewText}>나</Text>
        </RNView>
      </RNView>

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
          onPress={() => setMicOn(current => !current)}
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
          onPress={() => setCameraOn(current => !current)}
        />
        <CallControl
          danger
          icon={<PhoneOff color="#fff" size={20} />}
          label="상담 종료"
          onPress={onEndCall}
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

const styles = StyleSheet.create({
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
  connectingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 16,
  },
  controlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'center',
    paddingTop: spacing.lg,
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
  selfView: {
    alignItems: 'center',
    backgroundColor: SELF_VIEW_BACKGROUND,
    borderRadius: radius.md,
    height: 108,
    justifyContent: 'flex-end',
    paddingBottom: 6,
    position: 'absolute',
    right: 0,
    width: 78,
  },
  selfViewText: {
    color: '#D8D6D0',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
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
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  stageHint: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 4,
  },
  stageName: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 16,
  },
  stageNameInline: {
    marginTop: 0,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
