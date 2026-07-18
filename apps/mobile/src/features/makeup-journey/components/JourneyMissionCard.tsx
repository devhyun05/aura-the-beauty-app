import {useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import {Check, Circle, Pencil, Plus, Sparkles, Trash2, X} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyMission} from '../types';
import {getMissionDifficultyGuide} from '../utils/presentation';

type JourneyMissionCardProps = {
  disabled?: boolean;
  isGenerating?: boolean;
  missions: MakeupJourneyMission[];
  onCreate: (title: string) => Promise<void>;
  onDelete: (mission: MakeupJourneyMission) => Promise<void>;
  onGenerate: () => Promise<void>;
  onToggle: (mission: MakeupJourneyMission) => Promise<void>;
  onUpdateTitle: (mission: MakeupJourneyMission, title: string) => Promise<void>;
  pendingMissionIds?: ReadonlySet<string>;
};

function getMissionSourceLabel(mission: MakeupJourneyMission): string {
  if (mission.source === 'ai') {
    return 'AI 맞춤';
  }
  if (mission.source === 'user') {
    return '내 미션';
  }
  return '추천';
}

export function JourneyMissionCard({
  disabled = false,
  isGenerating = false,
  missions,
  onCreate,
  onDelete,
  onGenerate,
  onToggle,
  onUpdateTitle,
  pendingMissionIds = new Set(),
}: JourneyMissionCardProps) {
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const completedCount = missions.filter(mission => mission.isCompleted).length;
  const completionProgress = missions.length > 0
    ? Math.round((completedCount / missions.length) * 100)
    : 0;

  const createMission = async () => {
    const title = newTitle.trim();
    if (!title || isCreating) {
      return;
    }
    setIsCreating(true);
    try {
      await onCreate(title);
      setNewTitle('');
    } catch {
      // The owning screen keeps the draft and presents the API error as a toast.
    } finally {
      setIsCreating(false);
    }
  };

  const saveEditing = async (mission: MakeupJourneyMission) => {
    const title = editingTitle.trim();
    if (!title) {
      return;
    }
    try {
      await onUpdateTitle(mission, title);
      setEditingId(null);
      setEditingTitle('');
    } catch {
      // Keep edit mode open so the user can retry without retyping.
    }
  };

  const confirmDelete = (mission: MakeupJourneyMission) => {
    Alert.alert('미션 삭제', '이 미션을 삭제할까요?', [
      {text: '취소', style: 'cancel'},
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => void onDelete(mission),
      },
    ]);
  };

  return (
    <View accessibilityLabel="오늘의 미션" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>오늘의 미션</Text>
          <Text style={styles.description}>이날의 모든 피드백에 함께 적용되는 미션이에요.</Text>
        </View>
        {missions.length > 0 ? (
          <View accessibilityLabel={`미션 ${missions.length}개 중 ${completedCount}개 완료`} style={styles.progressSummary}>
            <Text style={styles.progressText}>{completedCount}/{missions.length} 완료</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {width: `${completionProgress}%`}]} />
            </View>
          </View>
        ) : !disabled ? (
          <Pressable
            accessibilityLabel="데일리 미션 세 개 추천"
            accessibilityRole="button"
            disabled={isGenerating}
            onPress={() => void onGenerate()}
            style={({pressed}) => [styles.generateButton, pressed ? styles.pressed : null]}>
            {isGenerating
              ? <ActivityIndicator color={colors.textPrimary} size="small" />
              : <Sparkles color={colors.textPrimary} size={17} />}
            <Text style={styles.generateText}>{isGenerating ? '생성 중' : '추천 받기'}</Text>
          </Pressable>
        ) : null}
      </View>

      {missions.length > 0 ? (
        <View style={styles.list}>
          {missions.map(mission => {
            const isPending = pendingMissionIds.has(mission.id);
            const isEditing = editingId === mission.id;
            const difficultyGuide = getMissionDifficultyGuide(mission.difficulty);
            return (
              <View key={mission.id} style={styles.missionRow}>
                <Pressable
                  accessibilityLabel={`${mission.title}, ${mission.isCompleted ? '완료 취소' : '완료로 표시'}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{checked: mission.isCompleted, disabled: disabled || isPending}}
                  disabled={disabled || isPending}
                  hitSlop={6}
                  onPress={() => void onToggle(mission)}
                  style={styles.checkButton}>
                  {isPending ? (
                    <ActivityIndicator color={colors.textPrimary} size="small" />
                  ) : mission.isCompleted ? (
                    <View style={styles.checkedCircle}>
                      <Check color={colors.white} size={16} strokeWidth={2.4} />
                    </View>
                  ) : (
                    <Circle color={colors.borderStrong} size={24} strokeWidth={1.8} />
                  )}
                </Pressable>
                <View style={styles.missionBody}>
                  {isEditing ? (
                    <TextInput
                      accessibilityLabel="미션 제목 수정"
                      autoFocus
                      maxLength={120}
                      multiline
                      onChangeText={setEditingTitle}
                      style={styles.editInput}
                      value={editingTitle}
                    />
                  ) : (
                    <Text style={[
                      styles.missionTitle,
                      mission.isCompleted ? styles.completedTitle : null,
                    ]}>
                      {mission.title}
                    </Text>
                  )}
                  <Text style={styles.meta}>
                    {mission.source === 'user'
                      ? getMissionSourceLabel(mission)
                      : `${getMissionSourceLabel(mission)} · ${difficultyGuide.label}`}
                  </Text>
                </View>
                {!disabled ? (
                  <View style={styles.actions}>
                    {isEditing ? (
                      <>
                        <Pressable
                          accessibilityLabel="미션 수정 저장"
                          accessibilityRole="button"
                          onPress={() => void saveEditing(mission)}
                          style={styles.iconButton}>
                          <Check color={colors.danger} size={18} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="미션 수정 취소"
                          accessibilityRole="button"
                          onPress={() => setEditingId(null)}
                          style={styles.iconButton}>
                          <X color={colors.textSecondary} size={18} />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          accessibilityLabel="미션 제목 수정"
                          accessibilityRole="button"
                          onPress={() => {
                            setEditingId(mission.id);
                            setEditingTitle(mission.title);
                          }}
                          style={styles.iconButton}>
                          <Pencil color={colors.textSecondary} size={17} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="미션 삭제"
                          accessibilityRole="button"
                          onPress={() => confirmDelete(mission)}
                          style={styles.iconButton}>
                          <Trash2 color={colors.danger} size={17} />
                        </Pressable>
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>아직 미션이 없어요.</Text>
          <Text style={styles.emptyText}>
            {disabled ? '미션은 오늘 또는 지난 날짜에 추가할 수 있어요.' : '추천을 받거나 직접 미션을 추가해 보세요.'}
          </Text>
        </View>
      )}

      {!disabled && missions.length > 0 ? (
        <Pressable
          accessibilityLabel="데일리 미션 다시 추천"
          accessibilityRole="button"
          disabled={isGenerating}
          onPress={() => void onGenerate()}
          style={({pressed}) => [styles.generateInlineButton, pressed ? styles.pressed : null]}>
          {isGenerating
            ? <ActivityIndicator color={colors.textPrimary} size="small" />
            : <Sparkles color={colors.textPrimary} size={16} />}
          <Text style={styles.generateText}>{isGenerating ? '생성 중' : 'AI 미션 다시 추천'}</Text>
        </Pressable>
      ) : null}

      {!disabled ? (
        <View style={styles.createArea}>
          <TextInput
            accessibilityLabel="새 미션"
            maxLength={120}
            multiline
            onChangeText={setNewTitle}
            placeholder="예: 물 한 잔 마시기"
            placeholderTextColor={colors.textTertiary}
            style={styles.createInput}
            value={newTitle}
          />
          <Pressable
            accessibilityLabel="미션 추가"
            accessibilityRole="button"
            disabled={!newTitle.trim() || isCreating}
            onPress={() => void createMission()}
            style={({pressed}) => [
              styles.addButton,
              !newTitle.trim() || isCreating ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}>
            {isCreating
              ? <ActivityIndicator color={colors.white} size="small" />
              : <Plus color={colors.white} size={19} />}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  addButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    justifyContent: 'center',
    minWidth: 48,
  },
  card: {
    ...shadows.soft,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  checkButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 36,
  },
  checkedCircle: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  completedTitle: {
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  createArea: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  createInput: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  disabled: {
    opacity: 0.42,
  },
  editInput: {
    borderBottomColor: colors.borderStrong,
    borderBottomWidth: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    padding: 0,
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 100,
    padding: spacing.lg,
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  generateButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  generateInlineButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.md,
  },
  generateText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  iconButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 34,
  },
  list: {
    gap: spacing.sm,
  },
  meta: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  missionBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  missionRow: {
    alignItems: 'center',
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    paddingBottom: spacing.sm,
  },
  missionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  progressFill: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressSummary: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingTop: 2,
    width: 82,
  },
  progressText: {
    color: colors.danger,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  progressTrack: {
    backgroundColor: colors.divider,
    borderRadius: radius.pill,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
});
