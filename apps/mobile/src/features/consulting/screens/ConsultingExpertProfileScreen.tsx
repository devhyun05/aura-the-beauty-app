import {useState} from 'react';
import {Pressable, StyleSheet, View as RNView} from 'react-native';
import {Award, CalendarClock, Check, MapPin, MessageCircle, Video} from 'lucide-react-native';
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
  ConsultingSectionTitle,
  ConsultingStatusBadge,
  ExpertPortrait,
  PrimaryButton,
  StarRating,
} from '../components/consultingComponents';
import {
  formatConsultingPrice,
  getConsultingDurationPrice,
  getConsultingSessionModeLabel,
} from '../consultingCatalog';
import {isConsultingChatAvailable} from '../services/consultingFlow';
import type {ConsultingExpert, ConsultingRecord, ConsultingSessionMode} from '../types';

type ConsultingDuration = ConsultingExpert['durations'][number];

type ConsultingExpertProfileScreenProps = {
  activeRecord?: ConsultingRecord | null;
  expert: ConsultingExpert;
  onPressActiveRecord: (record: ConsultingRecord) => void;
  onReserve: (durationId: string, sessionMode: ConsultingSessionMode) => void;
};

const sessionModeOptions: readonly {
  id: ConsultingSessionMode;
  description: string;
  title: string;
}[] = [
  {
    id: 'online',
    title: '온라인',
    description: '리포트 공유 후 앱에서 일정 조율',
  },
  {
    id: 'offline',
    title: '오프라인',
    description: '현장 상담 기준, 이동 준비 비용 포함',
  },
];

export function ConsultingExpertProfileScreen({
  activeRecord,
  expert,
  onPressActiveRecord,
  onReserve,
}: ConsultingExpertProfileScreenProps) {
  const defaultDuration =
    expert.durations.find(duration => duration.recommended) ??
    expert.durations[0];
  const [selectedDurationId, setSelectedDurationId] = useState(
    defaultDuration.id,
  );
  const [selectedSessionMode, setSelectedSessionMode] =
    useState<ConsultingSessionMode>('online');
  const activeChatAvailable = Boolean(
    activeRecord && isConsultingChatAvailable(activeRecord),
  );

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md} contentGap={spacing.xxl}>
        <View style={styles.profileHeader}>
          <ExpertPortrait expert={expert} size={112} />
          <Text style={styles.name}>{expert.name}</Text>
          <Text style={styles.title}>
            {expert.title} · {expert.careerYears}년 차
          </Text>
          {expert.studioName ? (
            <Text style={styles.studioName}>{expert.studioName}</Text>
          ) : null}
          <Text style={styles.signature}>"{expert.signatureLine}"</Text>
        </View>

        {activeRecord ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${expert.name} 신청 진행상황 보기`}
            onPress={() => onPressActiveRecord(activeRecord)}
            style={({pressed}) => [
              styles.activeRecordCard,
              pressed ? styles.pressed : null,
            ]}>
            <RNView style={styles.activeRecordTopRow}>
              <ConsultingStatusBadge status={activeRecord.status} />
              <Text style={styles.activeRecordDate}>{activeRecord.dateLabel}</Text>
            </RNView>
            <Text style={styles.activeRecordTitle}>진행 중인 신청이 있어요</Text>
            <Text style={styles.activeRecordText}>
              {getActiveRecordProfileText(activeRecord.status)}
            </Text>
            <RNView style={styles.activeRecordCta}>
              {activeChatAvailable ? (
                <MessageCircle color={consultingColors.roseStrong} size={14} />
              ) : (
                <CalendarClock color={consultingColors.roseStrong} size={14} />
              )}
              <Text style={styles.activeRecordCtaText}>
                {activeChatAvailable ? '상담 톡 보기' : '신청 내역 보기'}
              </Text>
            </RNView>
          </Pressable>
        ) : null}

        <View style={styles.statGrid}>
          <StatCell label="평점" value={expert.rating.toFixed(1)} />
          <StatCell
            label="상담"
            value={`${expert.sessionCount.toLocaleString('ko-KR')}회`}
          />
          <StatCell label="재예약률" value={`${expert.rebookRate}%`} />
          <StatCell label="응답" value={`${expert.responseMinutes}분 내`} />
        </View>

        <View style={styles.tagRow}>
          {expert.tags.map(tag => (
            <RNView key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </RNView>
          ))}
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>소개</ConsultingSectionTitle>
          <View style={styles.introCard}>
            <Text style={styles.introText}>{expert.intro}</Text>
            <RNView style={styles.availabilityRow}>
              <CalendarClock color={consultingColors.textMuted} size={14} />
              <Text style={styles.availabilityText}>{expert.availabilityNote}</Text>
            </RNView>
          </View>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>경력</ConsultingSectionTitle>
          <View style={styles.careerList}>
            {expert.careerHistory.map(item => (
              <RNView key={item.id} style={styles.careerRow}>
                <RNView style={styles.careerDot} />
                <RNView style={styles.careerBody}>
                  <Text style={styles.careerPeriod}>{item.period}</Text>
                  <Text style={styles.careerRole}>{item.role}</Text>
                </RNView>
              </RNView>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>자격 · 인증</ConsultingSectionTitle>
          <View style={styles.certCard}>
            {expert.certifications.map(certification => (
              <RNView key={certification} style={styles.certRow}>
                <Award color={consultingColors.roseStrong} size={15} />
                <Text style={styles.certText}>{certification}</Text>
              </RNView>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <RNView style={styles.reviewHeader}>
            <ConsultingSectionTitle>리뷰</ConsultingSectionTitle>
            <Text style={styles.reviewCount}>
              {expert.rating.toFixed(1)} · {expert.reviewCount}개
            </Text>
          </RNView>
          {expert.reviews.length > 0 ? (
            <View style={styles.reviewList}>
              {expert.reviews.map(review => (
                <View key={review.id} style={styles.reviewCard}>
                  <RNView style={styles.reviewTopRow}>
                    <StarRating rating={review.rating} />
                    <Text style={styles.reviewDate}>{review.dateLabel}</Text>
                  </RNView>
                  <Text style={styles.reviewBody}>{review.body}</Text>
                  <Text style={styles.reviewMeta}>
                    {review.author} · {review.category}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.reviewEmpty}>
              <Text style={styles.reviewEmptyText}>아직 리뷰가 없어요.</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>상담 방식 선택</ConsultingSectionTitle>
          <View style={styles.sessionModeRow}>
            {sessionModeOptions.map(option => (
              <SessionModeCard
                key={option.id}
                option={option}
                selected={option.id === selectedSessionMode}
                onPress={() => setSelectedSessionMode(option.id)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>상담 시간 선택</ConsultingSectionTitle>
          <View style={styles.durationRow}>
            {expert.durations.map(duration => (
              <DurationCard
                duration={duration}
                key={duration.id}
                onPress={() => setSelectedDurationId(duration.id)}
                selected={duration.id === selectedDurationId}
                sessionMode={selectedSessionMode}
              />
            ))}
          </View>
        </View>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton
          label={
            activeRecord
              ? activeChatAvailable
                ? '상담 톡 보기'
                : '신청 내용 보기'
              : '예약 신청하기'
          }
          onPress={() =>
            activeRecord
              ? onPressActiveRecord(activeRecord)
              : onReserve(selectedDurationId, selectedSessionMode)
          }
        />
      </ConsultingBottomBar>
    </RNView>
  );
}

function getActiveRecordProfileText(status: ConsultingRecord['status']): string {
  if (status === 'in_progress') {
    return '상담이 진행 중이에요. 톡에서 화상 상담으로 다시 입장할 수 있어요.';
  }

  if (status === 'scheduled') {
    return '상담 일정이 확정됐어요. 톡에서 화상 상담 버튼을 확인할 수 있어요.';
  }

  if (status === 'confirmed') {
    return '예약이 확정됐어요. 톡에서 상담 안내와 화상 상담 버튼을 확인할 수 있어요.';
  }

  if (status === 'contacting') {
    return '운영팀과 프리랜서가 가능 여부를 확인 중이에요. 확정 전에는 신청 내역에서 상태를 확인할 수 있어요.';
  }

  return '아직 예약 완료가 아니라 신청 접수 상태예요. 확정되면 알림이 오고 상담 톡이 열려요.';
}

function StatCell({label, value}: {label: string; value: string}) {
  return (
    <RNView style={styles.statCell}>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.statLabel}>
        {label}
      </Text>
    </RNView>
  );
}

function DurationCard({
  duration,
  sessionMode,
  selected,
  onPress,
}: {
  duration: ConsultingDuration;
  sessionMode: ConsultingSessionMode;
  selected: boolean;
  onPress: () => void;
}) {
  const price = getConsultingDurationPrice(duration, sessionMode);
  const modeLabel = getConsultingSessionModeLabel(sessionMode);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={({pressed}) => [
        styles.durationCard,
        selected && styles.durationCardSelected,
        pressed ? styles.pressed : null,
      ]}>
      {duration.recommended ? (
        <RNView style={styles.recommendBadge}>
          <Text style={styles.recommendBadgeText}>추천</Text>
        </RNView>
      ) : null}
      <RNView style={styles.durationHeader}>
        <Text style={styles.durationLabel}>{duration.label}</Text>
        {selected ? <Check color={consultingColors.accent} size={16} /> : null}
      </RNView>
      <Text style={styles.durationPrice}>
        {modeLabel} 예상가 {formatConsultingPrice(price)}
      </Text>
      <Text numberOfLines={1} style={styles.durationDescription}>
        {duration.description} · 결제는 연결 후 직접 진행
      </Text>
    </Pressable>
  );
}

function SessionModeCard({
  option,
  selected,
  onPress,
}: {
  option: (typeof sessionModeOptions)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const Icon = option.id === 'online' ? Video : MapPin;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={({pressed}) => [
        styles.sessionModeCard,
        selected && styles.sessionModeCardSelected,
        pressed ? styles.pressed : null,
      ]}>
      <RNView
        style={[
          styles.sessionModeIcon,
          selected && styles.sessionModeIconSelected,
        ]}>
        <Icon
          color={selected ? consultingColors.onAccent : consultingColors.textMuted}
          size={17}
        />
      </RNView>
      <RNView style={styles.sessionModeBody}>
        <RNView style={styles.sessionModeTitleRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.sessionModeTitle,
              selected && styles.sessionModeTitleSelected,
            ]}>
            {option.title}
          </Text>
          {selected ? <Check color={consultingColors.accent} size={15} /> : null}
        </RNView>
        <Text numberOfLines={2} style={styles.sessionModeDescription}>
          {option.description}
        </Text>
      </RNView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  activeRecordCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: 16,
  },
  activeRecordCta: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  activeRecordCtaText: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  activeRecordDate: {
    color: consultingColors.textSoft,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  activeRecordText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  activeRecordTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  activeRecordTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  availabilityRow: {
    alignItems: 'center',
    borderTopColor: consultingColors.borderSoft,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
  },
  availabilityText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  careerBody: {
    flex: 1,
  },
  careerDot: {
    backgroundColor: consultingColors.rose,
    borderRadius: consultingRadius.pill,
    height: 8,
    marginTop: 5,
    width: 8,
  },
  careerList: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.lg,
    padding: 16,
  },
  careerPeriod: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  careerRole: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginTop: 2,
  },
  careerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  certCard: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    gap: spacing.md,
    padding: 16,
  },
  certRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  certText: {
    color: consultingColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  durationCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1.5,
    flex: 1,
    gap: 3,
    padding: 14,
  },
  durationCardSelected: {
    borderColor: consultingColors.accent,
  },
  durationDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  durationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  durationLabel: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  durationPrice: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  durationRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  introCard: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    padding: 16,
  },
  introText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.md,
  },
  name: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginTop: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  profileHeader: {
    alignItems: 'center',
  },
  recommendBadge: {
    alignSelf: 'flex-start',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    marginBottom: 4,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  recommendBadgeText: {
    color: consultingColors.roseText,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },
  reviewBody: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: 8,
  },
  reviewCard: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    padding: 16,
  },
  reviewCount: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  reviewDate: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  reviewEmpty: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    paddingVertical: 32,
  },
  reviewEmptyText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  reviewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reviewList: {
    gap: spacing.md,
  },
  reviewMeta: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 8,
  },
  reviewTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  root: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
  section: {
    gap: spacing.md,
  },
  sessionModeBody: {
    flex: 1,
    gap: 3,
  },
  sessionModeCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1.5,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 88,
    padding: 12,
  },
  sessionModeCardSelected: {
    borderColor: consultingColors.accent,
  },
  sessionModeDescription: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  sessionModeIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sessionModeIconSelected: {
    backgroundColor: consultingColors.accent,
  },
  sessionModeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sessionModeTitle: {
    color: consultingColors.text,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  sessionModeTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  sessionModeTitleSelected: {
    color: consultingColors.accent,
  },
  signature: {
    color: consultingColors.roseText,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginTop: 10,
    textAlign: 'center',
  },
  statCell: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    flex: 1,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  statGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statLabel: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    marginTop: 3,
  },
  statValue: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  studioName: {
    color: consultingColors.textSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 4,
  },
  tag: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.border,
    borderRadius: consultingRadius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  tagText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  title: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 4,
  },
});
