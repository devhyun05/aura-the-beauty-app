import {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {BackendApiError} from '../../../shared/services/backendApi';
import {getUserProfile, getUserProfileAvatarUri} from '../../../shared/services/userService';
import {colors, communityColors, radius, spacing, typography} from '../../../shared/theme';
import {useTransientToast} from '../../../shared/ui';
import {BeforeAfterSlider} from '../components/BeforeAfterSlider';
import {CommunityAvatar} from '../components/CommunityAvatar';
import {LookMoodChips} from '../components/LookMoodChips';
import {ProductUsageSection} from '../components/ProductUsageSection';
import {ReplyComposer} from '../components/ReplyComposer';
import {ReplyManageSheet, type ReplyManageSheetMode} from '../components/ReplyManageSheet';
import {ReplyEmptyState, ReplyThreadItem, type ReplyActionHandlers} from '../components/ReplyList';
import {ThreadActionBar} from '../components/ThreadActionBar';
import {ThreadImageCarousel} from '../components/ThreadImageCarousel';
import {ThreadManageSheet, type ThreadManageSheetMode} from '../components/ThreadManageSheet';
import {
  createCommunityReply,
  deleteCommunityReply,
  deleteCommunityThread,
  getCommunityThreadDetail,
  likeCommunityThread,
  recordCommunityEvents,
  updateCommunityReply,
  saveCommunityThread,
  unlikeCommunityThread,
  unsaveCommunityThread,
} from '../services/communityService';
import {DWELL_THRESHOLD_MS, recordThreadSignal} from '../services/interestProfileService';
import type {CommunityReply, CommunityThreadDetail} from '../types';
import {formatRelativeTime} from '../utils/format';
import {triggerLightHaptic} from '../utils/haptics';
import {resolveCommunityMediaSource} from '../utils/media';

// 백엔드 세션 연동 전까지 낙관적 답글의 작성자 id로 쓰는 값.
// 본인 답글 식별(삭제 메뉴 노출)도 이 id 기준으로 동작한다.
const VIEWER_AUTHOR_ID = 'me';

// DetailRouteChrome 헤더 높이 근사값. KeyboardAvoidingView 오프셋 계산에 사용한다.
const CHROME_HEADER_HEIGHT = 56;

function getReplyCreateErrorMessage(error: unknown): string {
  if (error instanceof BackendApiError) {
    if (error.status === 401) {
      return '로그인 세션이 만료됐어요. 다시 로그인한 뒤 댓글을 남겨 주세요.';
    }

    if (error.code === 'COMMUNITY_THREAD_NOT_FOUND') {
      return '이 글을 다시 불러온 뒤 댓글을 남겨 주세요.';
    }

    if (error.code === 'COMMUNITY_REPLY_DEPTH_EXCEEDED') {
      return '대댓글은 한 단계까지만 작성할 수 있어요.';
    }

    return error.message;
  }

  return error instanceof Error ? error.message : '댓글을 등록하지 못했어요.';
}
type ReplyTarget = {nickname: string; parentReplyId: string};

export function CommunityThreadDetailScreen({
  threadId,
  onDeleted,
  onPressAuthor,
  onPressEditThread,
}: {
  threadId: string;
  onDeleted?: () => void;
  onPressAuthor?: (author: CommunityThreadDetail['author']) => void;
  onPressEditThread?: (thread: CommunityThreadDetail) => void;
}) {
  const insets = useSafeAreaInsets();
  const replyInputRef = useRef<TextInput | null>(null);
  const replyListRef = useRef<FlatList<CommunityReply> | null>(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingThread, setIsDeletingThread] = useState(false);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  const [manageSheetMode, setManageSheetMode] = useState<ThreadManageSheetMode | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [managedReply, setManagedReply] = useState<CommunityReply | null>(null);
  const [replyManageMode, setReplyManageMode] = useState<ReplyManageSheetMode>('actions');
  const [replyEditText, setReplyEditText] = useState('');
  const [isManagingReply, setIsManagingReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [thread, setThread] = useState<CommunityThreadDetail | null>(null);
  const [viewerAvatarUrl, setViewerAvatarUrl] = useState<string | null>(null);
  const [viewerNickname, setViewerNickname] = useState('나');
  const hasRecordedSliderRef = useRef(false);
  const threadRef = useRef<CommunityThreadDetail | null>(null);
  const {showToast, toast} = useTransientToast();

  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  useEffect(() => {
    void getUserProfile()
      .then(profile => {
        setViewerNickname(profile.nickname);
        setViewerAvatarUrl(getUserProfileAvatarUri(profile));
      })
      .catch(() => undefined);
  }, []);

  // 체류 시간(dwell) 신호 — 정독 기준(12s) 이상 머물다 나가면 기록한다.
  useEffect(() => {
    const enteredAt = Date.now();

    return () => {
      const currentThread = threadRef.current;
      const dwellMs = Date.now() - enteredAt;

      if (currentThread && dwellMs >= DWELL_THRESHOLD_MS) {
        recordThreadSignal('dwell', currentThread);
        void recordCommunityEvents([{dwellMs, eventType: 'dwell', threadId: currentThread.id}]);
      }
    };
  }, []);

  const loadThread = useCallback(async () => {
    setIsLoading(true);
    setHasLoadError(false);

    try {
      setThread(await getCommunityThreadDetail(threadId));
    } catch {
      setHasLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  const updateThread = (updater: (current: CommunityThreadDetail) => CommunityThreadDetail) => {
    setThread(current => current ? updater(current) : current);
  };

  const scrollReplyListToComposer = useCallback(() => {
    const delayMs = Platform.OS === 'android' ? 280 : 120;

    setTimeout(() => {
      replyListRef.current?.scrollToEnd({animated: true});
    }, delayMs);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const showSubscription = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardBottomInset(Math.max(0, event.endCoordinates.height - insets.bottom));
      scrollReplyListToComposer();
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardBottomInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, scrollReplyListToComposer]);

  const handleLike = () => {
    if (!thread) {
      return;
    }

    const nextLiked = !thread.viewerState.liked;
    triggerLightHaptic();
    updateThread(current => ({
      ...current,
      counts: {...current.counts, likes: Math.max(0, current.counts.likes + (nextLiked ? 1 : -1))},
      viewerState: {...current.viewerState, liked: nextLiked},
    }));
    void (nextLiked ? likeCommunityThread(thread.id) : unlikeCommunityThread(thread.id)).catch(() => {
      updateThread(current => ({
        ...current,
        counts: {...current.counts, likes: Math.max(0, current.counts.likes + (nextLiked ? -1 : 1))},
        viewerState: {...current.viewerState, liked: !nextLiked},
      }));
      showToast('좋아요에 실패했어요');
    });
  };

  const handleSave = () => {
    if (!thread) {
      return;
    }

    const nextSaved = !thread.viewerState.saved;
    triggerLightHaptic();

    if (nextSaved) {
      showToast('저장됨');
    }

    updateThread(current => ({
      ...current,
      counts: {...current.counts, saves: Math.max(0, current.counts.saves + (nextSaved ? 1 : -1))},
      viewerState: {...current.viewerState, saved: nextSaved},
    }));
    void (nextSaved ? saveCommunityThread(thread.id) : unsaveCommunityThread(thread.id)).catch(() => {
      updateThread(current => ({
        ...current,
        counts: {...current.counts, saves: Math.max(0, current.counts.saves + (nextSaved ? -1 : 1))},
        viewerState: {...current.viewerState, saved: !nextSaved},
      }));
      showToast('저장하지 못했어요');
    });
  };

  const handleShare = () => {
    if (!thread) {
      return;
    }

    void Share.share({
      message: `룩톡에서 ${thread.title} 룩을 확인해 보세요.`,
      title: thread.title,
    });
  };

  const handleDeleteThread = () => {
    if (!thread) {
      return;
    }

    setManageSheetMode('delete');
  };

  const handleConfirmDeleteThread = () => {
    if (!thread || isDeletingThread) {
      return;
    }

    const deletingThread = thread;
    setIsDeletingThread(true);
    void deleteCommunityThread(deletingThread.id)
      .then(() => {
        setManageSheetMode(null);
        showToast('삭제했어요');
        onDeleted?.();
      })
      .catch(error => {
        showToast(error instanceof Error ? error.message : '삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
      })
      .finally(() => {
        setIsDeletingThread(false);
      });
  };

  const handleManageThread = () => {
    if (!thread) {
      return;
    }

    setManageSheetMode('actions');
  };

  const handlePressEditThread = () => {
    if (!thread) {
      return;
    }

    const editingThread = thread;
    setManageSheetMode(null);
    onPressEditThread?.(editingThread);
  };

  const removeReply = (replyId: string) => {
    updateThread(current => {
      const isTopLevel = current.replies.some(reply => reply.id === replyId);
      const replies = isTopLevel
        ? current.replies.filter(reply => reply.id !== replyId)
        : current.replies.map(reply => ({
          ...reply,
          replies: reply.replies?.filter(child => child.id !== replyId),
        }));

      return {
        ...current,
        counts: {...current.counts, replies: Math.max(0, current.counts.replies - 1)},
        replies,
      };
    });
  };

  const updateReplyItem = (replyId: string, updater: (reply: CommunityReply) => CommunityReply) => {
    updateThread(current => {
      let changed = false;
      const replies = current.replies.map(reply => {
        if (reply.id === replyId) {
          changed = true;
          return updater(reply);
        }

        let childChanged = false;
        const childReplies = (reply.replies ?? []).map(child => {
          if (child.id === replyId) {
            childChanged = true;
            changed = true;
            return updater(child);
          }
          return child;
        });

        return childChanged ? {...reply, replies: childReplies} : reply;
      });

      return changed ? {...current, replies} : current;
    });
  };
  const viewerAuthorId = thread?.viewerUserId ?? VIEWER_AUTHOR_ID;

  const replyHandlers: ReplyActionHandlers = {
    onPressManageReply: reply => {
      setManagedReply(reply);
      setReplyEditText(reply.body);
      setReplyManageMode('actions');
    },
    onPressReplyTo: (parentReplyId, nickname) => {
      setReplyTarget({nickname, parentReplyId});
      setTimeout(() => {
        replyInputRef.current?.focus();
        scrollReplyListToComposer();
      }, 40);
    },
    viewerAuthorId,
  };

  const closeReplyManageSheet = () => {
    if (!isManagingReply) {
      setManagedReply(null);
    }
  };

  const handleConfirmReplyEdit = () => {
    if (!managedReply || isManagingReply) {
      return;
    }

    const body = replyEditText.trim();
    if (!body) {
      showToast('수정할 답글을 입력해 주세요');
      return;
    }

    const previousThread = threadRef.current;
    const editingReply = managedReply;
    setIsManagingReply(true);
    updateReplyItem(editingReply.id, reply => ({...reply, body}));
    void updateCommunityReply(editingReply.id, {body})
      .then(({reply}) => {
        updateReplyItem(editingReply.id, current => ({
          ...current,
          ...reply,
          replies: current.replies,
        }));
        setManagedReply(null);
        showToast('답글을 수정했어요');
      })
      .catch(error => {
        if (previousThread) {
          setThread(previousThread);
        }
        showToast(error instanceof Error ? error.message : '답글을 수정하지 못했어요.');
      })
      .finally(() => {
        setIsManagingReply(false);
      });
  };

  const handleConfirmReplyDelete = () => {
    if (!managedReply || isManagingReply) {
      return;
    }

    const previousThread = threadRef.current;
    const deletingReply = managedReply;
    setIsManagingReply(true);
    removeReply(deletingReply.id);
    void deleteCommunityReply(deletingReply.id)
      .then(({counts}) => {
        updateThread(current => ({
          ...current,
          counts: {...current.counts, replies: counts.replies},
        }));
        setManagedReply(null);
        showToast('답글을 삭제했어요');
      })
      .catch(error => {
        if (previousThread) {
          setThread(previousThread);
        }
        showToast(error instanceof Error ? error.message : '답글을 삭제하지 못했어요.');
      })
      .finally(() => {
        setIsManagingReply(false);
      });
  };

  const handleReplySubmit = () => {
    if (!thread) {
      return;
    }

    const body = replyText.trim();

    if (!body) {
      return;
    }

    const target = replyTarget;
    const optimisticReply: CommunityReply = {
      author: {avatarUrl: viewerAvatarUrl, id: viewerAuthorId, nickname: viewerNickname},
      body,
      createdAt: new Date().toISOString(),
      id: `local-reply-${Date.now()}`,
      likeCount: 0,
      parentReplyId: target?.parentReplyId ?? null,
      replies: [],
      viewerState: {liked: false},
    };

    setReplyText('');
    setReplyTarget(null);
    // 답글 작성은 좋아요보다 강한 관심 신호다.
    recordThreadSignal('reply', thread);
    updateThread(current => ({
      ...current,
      counts: {...current.counts, replies: current.counts.replies + 1},
      replies: target
        ? current.replies.map(reply => reply.id === target.parentReplyId
          ? {...reply, replies: [...(reply.replies ?? []), optimisticReply]}
          : reply)
        : [optimisticReply, ...current.replies],
    }));

    void createCommunityReply(thread.id, {
      body,
      parentReplyId: target?.parentReplyId ?? null,
    })
      .then(({counts, reply}) => {
        const confirmedReply: CommunityReply = {...reply, replies: reply.replies ?? []};
        updateThread(current => ({
          ...current,
          counts: {...current.counts, replies: counts.replies},
          replies: target
            ? current.replies.map(parent => parent.id === target.parentReplyId
              ? {
                ...parent,
                replies: (parent.replies ?? []).map(child => child.id === optimisticReply.id
                  ? confirmedReply
                  : child),
              }
              : parent)
            : current.replies.map(item => item.id === optimisticReply.id ? confirmedReply : item),
        }));
      })
      .catch(error => {
        // 실패 시 낙관적 댓글을 롤백하고 입력을 복원한다.
        removeReply(optimisticReply.id);
        setReplyText(body);
        if (target) {
          setReplyTarget(target);
        }
        Alert.alert('댓글 등록 실패', getReplyCreateErrorMessage(error));
      });
  };

  if (isLoading) {
    return <ThreadDetailSkeleton />;
  }

  if (hasLoadError || !thread) {
    return (
      <YStack style={styles.stateScreen}>
        <Text style={styles.stateTitle}>룩을 불러오지 못했어요</Text>
        <Text style={styles.stateText}>잠시 후 다시 시도해 주세요.</Text>
        <Pressable
          accessibilityLabel="다시 시도"
          accessibilityRole="button"
          onPress={() => void loadThread()}
          style={({pressed}) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      </YStack>
    );
  }

  const isOwnThread = Boolean(thread.viewerUserId && thread.author.id === thread.viewerUserId);
  const composerBottomPadding = Math.max(insets.bottom, spacing.sm)
    + (Platform.OS === 'android' ? keyboardBottomInset : 0);

  return (
    <RNView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + CHROME_HEADER_HEIGHT : CHROME_HEADER_HEIGHT}
        style={styles.flex}>
        <FlatList
          ref={replyListRef}
          data={thread.replies}
          keyboardShouldPersistTaps="handled"
          keyExtractor={reply => reply.id}
          ListEmptyComponent={
            <ReplyEmptyState onPressWrite={() => replyInputRef.current?.focus()} />
          }
          ListHeaderComponent={
            <YStack style={styles.headerStack}>
              {/* 비포애프터 글은 캐러셀 대신 드래그 비교 슬라이더 (media[0]=before, media[1]=after) */}
              {thread.category === 'before_after' && thread.media.length >= 2 ? (
                <BeforeAfterSlider
                  afterSource={resolveCommunityMediaSource(thread.media[1])}
                  beforeSource={resolveCommunityMediaSource(thread.media[0])}
                  onFirstInteract={() => {
                    // 슬라이더 조작 = 적극 탐색 신호 (스레드당 1회).
                    if (!hasRecordedSliderRef.current) {
                      hasRecordedSliderRef.current = true;
                      recordThreadSignal('slider', thread);
                      void recordCommunityEvents([{eventType: 'slider', threadId: thread.id}]);
                    }
                  }}
                />
              ) : (
                <ThreadImageCarousel
                  media={thread.media}
                  onDoubleTap={() => {
                    // 더블탭은 항상 좋아요로만 동작한다(취소는 액션바에서).
                    if (!thread.viewerState.liked) {
                      handleLike();
                    } else {
                      triggerLightHaptic();
                    }
                  }}
                />
              )}

              <YStack style={styles.copyBlock}>
                <Pressable
                  accessibilityLabel={`${thread.author.nickname} 프로필 보기`}
                  accessibilityRole="button"
                  onPress={() => onPressAuthor?.(thread.author)}
                  style={({pressed}) => pressed && styles.pressed}>
                  <XStack style={styles.authorRow}>
                    <CommunityAvatar
                      avatarUrl={thread.author.avatarUrl}
                      nickname={thread.author.nickname}
                      size={32}
                    />
                    <YStack style={styles.authorCopy}>
                      <Text style={styles.authorName}>{thread.author.nickname}</Text>
                      <Text style={styles.timeText}>{formatRelativeTime(thread.createdAt)}</Text>
                    </YStack>
                  </XStack>
                </Pressable>

                <Text style={styles.title}>{thread.title}</Text>
                <LookMoodChips limit={6} tags={[...thread.moodTags, ...thread.situationTags]} tone="tint" />
                {thread.body ? <Text style={styles.body}>{thread.body}</Text> : null}

                <ProductUsageSection
                  difficulty={thread.difficulty}
                  durationMinutes={thread.durationMinutes}
                  productUsage={thread.productUsage}
                />

                <ThreadActionBar
                  isOwnThread={isOwnThread}
                  thread={thread}
                  onPressLike={handleLike}
                  onPressManageThread={handleManageThread}
                  onPressSave={handleSave}
                  onPressShare={handleShare}
                />

                <Text style={styles.replyHead}>답글 {thread.counts.replies}</Text>
              </YStack>
            </YStack>
          }
          contentContainerStyle={styles.listContent}
          renderItem={({item}) => <ReplyThreadItem handlers={replyHandlers} reply={item} />}
          showsVerticalScrollIndicator={false}
        />

        <RNView style={[styles.composerDock, {paddingBottom: composerBottomPadding}]}>
          <ReplyComposer
            inputRef={replyInputRef}
            replyingToNickname={replyTarget?.nickname ?? null}
            value={replyText}
            onCancelReplyTo={() => setReplyTarget(null)}
            onChangeText={setReplyText}
            onFocus={scrollReplyListToComposer}
            onSubmit={handleReplySubmit}
          />
        </RNView>
      </KeyboardAvoidingView>

      <ThreadManageSheet
        isDeleting={isDeletingThread}
        mode={manageSheetMode ?? 'actions'}
        visible={manageSheetMode != null}
        onClose={() => {
          if (!isDeletingThread) {
            setManageSheetMode(null);
          }
        }}
        onConfirmDelete={handleConfirmDeleteThread}
        onPressDelete={handleDeleteThread}
        onPressEdit={handlePressEditThread}
      />
      <ReplyManageSheet
        draftText={replyEditText}
        isOwnReply={Boolean(managedReply && managedReply.author.id === viewerAuthorId)}
        isSaving={isManagingReply}
        mode={replyManageMode}
        reply={managedReply}
        visible={managedReply != null}
        onChangeDraftText={setReplyEditText}
        onClose={closeReplyManageSheet}
        onConfirmDelete={handleConfirmReplyDelete}
        onConfirmEdit={handleConfirmReplyEdit}
        onPressDelete={() => setReplyManageMode('delete')}
        onPressEdit={() => setReplyManageMode('edit')}
      />

      {toast}
    </RNView>
  );
}

function ThreadDetailSkeleton() {
  return (
    <YStack style={styles.screen}>
      <View style={styles.skeletonImage} />
      <YStack style={styles.skeletonCopy}>
        <View style={[styles.skeletonLine, styles.skeletonLineWide]} />
        <View style={[styles.skeletonLine, styles.skeletonLineMedium]} />
        <View style={[styles.skeletonLine, styles.skeletonLineNarrow]} />
      </YStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  authorCopy: {
    gap: 1,
  },
  authorName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  authorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  body: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  composerDock: {
    backgroundColor: communityColors.surfaceWarm,
  },
  copyBlock: {
    gap: spacing.md,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.lg,
  },
  flex: {
    flex: 1,
  },
  headerStack: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  pressed: {
    opacity: 0.72,
  },
  replyHead: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    paddingTop: spacing.xs,
  },
  retryButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  retryText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  screen: {
    backgroundColor: communityColors.surfaceWarm,
    flex: 1,
  },
  skeletonCopy: {
    gap: spacing.sm,
    padding: spacing.screenX,
  },
  skeletonImage: {
    aspectRatio: 4 / 5,
    backgroundColor: colors.surfaceMuted,
    marginHorizontal: spacing.screenX,
    borderRadius: radius.sm,
    marginTop: spacing.lg,
  },
  skeletonLine: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 14,
  },
  skeletonLineMedium: {
    width: '46%',
  },
  skeletonLineNarrow: {
    width: '30%',
  },
  skeletonLineWide: {
    width: '68%',
  },
  stateScreen: {
    alignItems: 'center',
    backgroundColor: communityColors.surfaceWarm,
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  stateText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  stateTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  timeText: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
});
