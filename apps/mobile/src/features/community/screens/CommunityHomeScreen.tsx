import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Flame, Search, Sparkles, WifiOff, X} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, communityColors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {IconButton, PencilIcon, useTransientToast} from '../../../shared/ui';
import {APP_FOOTER_FLOATING_HOST_BASE_HEIGHT} from '../../../shared/ui/AppFooter';
import {CommunityCategoryTabs, type CommunityFeedTabItem} from '../components/CommunityCategoryTabs';
import {CommunityAvatar} from '../components/CommunityAvatar';
import {
  COMMUNITY_MODE_BAR_FOOTER_GAP,
  COMMUNITY_MODE_BAR_HEIGHT,
  CommunityModeBar,
  type CommunityMode,
} from '../components/CommunityModeBar';
import {LookGridCard} from '../components/LookGridCard';
import {LookThreadCard} from '../components/LookThreadCard';
import {getUserProfile, getUserProfileAvatarUri} from '../../../shared/services/userService';
import {
  getCommunityThreads,
  getMyCommunityThreads,
  getRecommendedCommunityThreads,
  getSavedCommunityThreads,
  recordCommunityEvents,
  searchCommunityThreads,
  likeCommunityThread,
  saveCommunityThread,
  unlikeCommunityThread,
  unsaveCommunityThread,
} from '../services/communityService';
import {
  STYLE_BADGE_THRESHOLD,
  computeStylePercent,
  hasInterestSignals,
  loadInterestProfile,
  recordSearchInterest,
  recordThreadSignal,
} from '../services/interestProfileService';
import {
  computeThreadMatch,
  loadReportMatchContext,
  type ReportMatchContext,
} from '../services/reportMatchService';
import type {CommunityThreadSummary, WritableCommunityCategory} from '../types';
import {writableCommunityCategories} from '../types';
import {triggerLightHaptic} from '../utils/haptics';

/**
 * 피드 탭 구조:
 * - 추천: 리포트 매칭 + 행동 관심사 종합 "내 스타일 %" 순 (배지는 이 탭 전용)
 * - 전체: 최근 7일 인기 3개 고정 + 최신순 피드 (커서 페이지네이션)
 * - 카테고리 4종: 최신순
 * 커서 페이지네이션은 최신 정렬만 사용하므로 인기 정렬 커서 문제가 발생하지 않는다.
 */
type FeedTab = 'recommended' | 'all' | WritableCommunityCategory;
type HomeCategory = 'all' | WritableCommunityCategory;

// 카테고리 다이얼 정렬 — '전체'를 가운데 두고 좌우 대칭 배치. 첫 진입은 전체(가운데)에서 시작.
const categoryById = Object.fromEntries(
  writableCommunityCategories.map(category => [category.id, category]),
);
const homeCategoryTabs: CommunityFeedTabItem[] = [
  categoryById.product_combo,
  categoryById.lookbook,
  {id: 'all', label: '전체'},
  categoryById.before_after,
  categoryById.question,
];

const LATEST_PAGE_SIZE = 20;
const RECOMMENDED_POOL_SIZE = 30;
const SEARCH_POOL_SIZE = 50;
const POPULAR_TOP_COUNT = 3;
const POPULAR_WINDOW_DAYS = 7;
const POPULAR_WINDOW_MS = POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const POPULAR_MIN_SCORE = 1;

type FeedErrorKind = 'network' | 'server';

function getFeedErrorKind(error: unknown): FeedErrorKind {
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|connection|timeout/i.test(message) ? 'network' : 'server';
}

function getCommunityPopularityScore(thread: CommunityThreadSummary): number {
  return thread.counts.likes + thread.counts.saves * 2 + thread.counts.replies;
}

function threadMatchesQuery(thread: CommunityThreadSummary, tokens: string[]): boolean {
  const haystack = [
    thread.title,
    ...thread.moodTags,
    ...thread.situationTags,
  ].join(' ').toLowerCase();

  return tokens.every(token => haystack.includes(token));
}

export function CommunityHomeScreen({
  avoidFloatingFooter = false,
  mode: controlledMode,
  onPressCreate,
  onPressAuthor,
  onPressEditProfile,
  onPressThread,
  onSelectMode,
}: {
  avoidFloatingFooter?: boolean;
  mode?: CommunityMode;
  onPressCreate: () => void;
  onPressAuthor?: (author: CommunityThreadSummary['author']) => void;
  /** MY 탭 '프로필 설정' — 편집은 앱 프로필 설정 한 곳에서 (단일 계정 원칙). */
  onPressEditProfile?: () => void;
  onPressThread: (threadId: string) => void;
  onSelectMode?: (mode: CommunityMode) => void;
}) {
  const [activeQuery, setActiveQuery] = useState('');
  const [error, setError] = useState<FeedErrorKind | null>(null);
  const [homeCategory, setHomeCategory] = useState<HomeCategory>('all');
  const [internalMode, setInternalMode] = useState<CommunityMode>('home');
  const [isMyLoading, setIsMyLoading] = useState(false);
  const [myLooks, setMyLooks] = useState<CommunityThreadSummary[]>([]);
  const [myTab, setMyTab] = useState<'mine' | 'saved'>('mine');
  const [savedLooks, setSavedLooks] = useState<CommunityThreadSummary[]>([]);
  const [viewerNickname, setViewerNickname] = useState('나');
  const [viewerAvatarUrl, setViewerAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [matchContext, setMatchContext] = useState<ReportMatchContext | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [popularTop, setPopularTop] = useState<CommunityThreadSummary[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<CommunityThreadSummary[]>([]);
  const [threads, setThreads] = useState<CommunityThreadSummary[]>([]);
  const mode = controlledMode ?? internalMode;
  const selectMode = onSelectMode ?? setInternalMode;
  const isLoadingMoreRef = useRef(false);
  const clickedThreadIdsRef = useRef(new Set<string>());
  const pendingImpressionThreadsRef = useRef(new Map<string, CommunityThreadSummary>());
  const seenImpressionsRef = useRef(new Set<string>());
  const modeRef = useRef(mode);
  const isSearchModeRef = useRef(false);
  const {showToast, toast} = useTransientToast();
  const insets = useSafeAreaInsets();
  const tabFooterBottomPadding =
    APP_FOOTER_FLOATING_HOST_BASE_HEIGHT +
    Math.max(insets.bottom, spacing.md) +
    COMMUNITY_MODE_BAR_HEIGHT +
    COMMUNITY_MODE_BAR_FOOTER_GAP;
  const listBottomPadding = avoidFloatingFooter
    ? tabFooterBottomPadding + spacing.lg
    : spacing.xxl;

  // 하단 모드 바(홈/추천) + 홈 카테고리 칩 → 데이터 로딩 키로 합성.
  const feedTab: FeedTab = mode === 'recommended' ? 'recommended' : homeCategory;
  const isSearchMode = activeQuery.length > 0;

  useEffect(() => {
    modeRef.current = mode;
    isSearchModeRef.current = isSearchMode;
    pendingImpressionThreadsRef.current.clear();
  }, [homeCategory, isSearchMode, mode]);
  const recordNonClickedImpression = useCallback((thread: CommunityThreadSummary) => {
    if (clickedThreadIdsRef.current.has(thread.id) || seenImpressionsRef.current.has(thread.id)) {
      return;
    }

    seenImpressionsRef.current.add(thread.id);
    recordThreadSignal('impression', thread);
    void recordCommunityEvents([{eventType: 'impression', threadId: thread.id}]);
  }, []);

  useEffect(() => () => {
    pendingImpressionThreadsRef.current.forEach(thread => recordNonClickedImpression(thread));
    pendingImpressionThreadsRef.current.clear();
  }, [recordNonClickedImpression]);
  // 앱 프로필과 연결 — MY 탭·작성자 표기에 실제 닉네임 사용.
  useEffect(() => {
    void getUserProfile()
      .then(profile => {
        setViewerNickname(profile.nickname);
        setViewerAvatarUrl(getUserProfileAvatarUri(profile));
      })
      .catch(() => undefined);
  }, []);

  // 리포트 매칭 — 최신 분석 리포트를 한 번 로드해 매칭 컨텍스트로 쓴다.
  useEffect(() => {
    let mounted = true;

    void loadReportMatchContext().then(context => {
      if (mounted) {
        setMatchContext(context);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  // MY 모드 — 내가 올린 룩 / 저장한 룩 (계정은 단일, 화면만 커뮤니티 컨텍스트로 분리).
  const loadMyActivity = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsMyLoading(true);
    }

    try {
      const [mine, saved] = await Promise.all([
        getMyCommunityThreads(),
        getSavedCommunityThreads(),
      ]);
      setMyLooks(mine);
      setSavedLooks(saved);
    } finally {
      setIsMyLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'my') {
      void loadMyActivity(false);
    }
  }, [loadMyActivity, mode]);

  const loadFeed = useCallback(async (refresh = false) => {
    if (mode === 'my') {
      return;
    }

    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      if (feedTab === 'all') {
        // 인기 3(최근 7일) + 최신 피드를 병렬 로드하고, 인기에 뽑힌 글은 최신 목록에서 제외한다.
        const [popularResponse, latestResponse] = await Promise.all([
          getCommunityThreads({category: 'trending', limit: LATEST_PAGE_SIZE, sort: 'popular', windowDays: POPULAR_WINDOW_DAYS}),
          getCommunityThreads({category: 'trending', limit: LATEST_PAGE_SIZE, sort: 'latest'}),
        ]);
        const windowStart = Date.now() - POPULAR_WINDOW_MS;
        const topThreads = popularResponse.threads
          .filter(thread => Date.parse(thread.createdAt) >= windowStart && getCommunityPopularityScore(thread) >= POPULAR_MIN_SCORE)
          .slice(0, POPULAR_TOP_COUNT);
        const topIds = new Set(topThreads.map(thread => thread.id));

        setPopularTop(topThreads);
        setThreads(latestResponse.threads.filter(thread => !topIds.has(thread.id)));
        setNextCursor(latestResponse.nextCursor ?? null);
      } else if (feedTab === 'recommended') {
        const response = await getRecommendedCommunityThreads(RECOMMENDED_POOL_SIZE);
        const recommendedThreads = response.threads.filter(thread =>
          typeof thread.matchPercent === 'number' && thread.matchPercent >= STYLE_BADGE_THRESHOLD,
        );

        setPopularTop([]);
        setThreads(recommendedThreads);
        setNextCursor(null);
      } else {
        const response = await getCommunityThreads({
          category: feedTab,
          limit: LATEST_PAGE_SIZE,
          sort: 'latest',
        });
        setPopularTop([]);
        setThreads(response.threads);
        setNextCursor(response.nextCursor ?? null);
      }
    } catch (loadError) {
      setError(getFeedErrorKind(loadError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [feedTab, mode]);

  useEffect(() => {
    void loadFeed(false);
  }, [loadFeed]);

  const loadMoreThreads = useCallback(async () => {
    if (mode === 'my' || feedTab === 'recommended' || isSearchMode || !nextCursor || isLoadingMoreRef.current || isLoading) {
      return;
    }

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const response = await getCommunityThreads({
        category: feedTab === 'all' ? 'trending' : feedTab,
        cursor: nextCursor,
        limit: LATEST_PAGE_SIZE,
        sort: 'latest',
      });
      setThreads(currentThreads => {
        const knownIds = new Set([
          ...currentThreads.map(thread => thread.id),
          ...popularTop.map(thread => thread.id),
        ]);
        return [...currentThreads, ...response.threads.filter(thread => !knownIds.has(thread.id))];
      });
      setNextCursor(response.nextCursor ?? null);
    } catch {
      // 추가 로드 실패는 조용히 무시하고 다음 onEndReached에서 재시도한다.
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [feedTab, isLoading, isSearchMode, nextCursor, popularTop]);

  // 추천 탭 스타일 점수 계산 + 정렬.
  const {displayThreads, isPersonalizedRecommended, stylePercentByThreadId} = useMemo(() => {
    if (feedTab !== 'recommended' || threads.length === 0) {
      return {
        displayThreads: threads,
        isPersonalizedRecommended: false,
        stylePercentByThreadId: new Map<string, number>(),
      };
    }

    const profile = loadInterestProfile();
    const hasServerScores = threads.some(thread => typeof thread.matchPercent === 'number');
    const personalized = hasServerScores || hasInterestSignals(profile) || matchContext != null;
    const percentMap = new Map<string, number>();

    threads.forEach(thread => {
      const toneMatchPercent = matchContext
        ? computeThreadMatch(matchContext, thread).percent
        : null;
      const serverMatchPercent = typeof thread.matchPercent === 'number' ? thread.matchPercent : null;
      percentMap.set(thread.id, serverMatchPercent ?? computeStylePercent(profile, toneMatchPercent, thread));
    });

    return {
      displayThreads: personalized
        ? [...threads].sort((a, b) => (percentMap.get(b.id) ?? 0) - (percentMap.get(a.id) ?? 0))
        : threads,
      isPersonalizedRecommended: personalized,
      stylePercentByThreadId: percentMap,
    };
  }, [feedTab, matchContext, threads]);

  const updateThreadReaction = (
    threadId: string,
    key: 'liked' | 'saved',
    enabled: boolean,
  ) => {
    const countKey = key === 'liked' ? 'likes' : 'saves';
    const update = (list: CommunityThreadSummary[]) => list.map(thread => {
      if (thread.id !== threadId || thread.viewerState[key] === enabled) {
        return thread;
      }

      return {
        ...thread,
        counts: {
          ...thread.counts,
          [countKey]: Math.max(0, thread.counts[countKey] + (enabled ? 1 : -1)),
        },
        viewerState: {...thread.viewerState, [key]: enabled},
      };
    });

    setThreads(update);
    setPopularTop(update);
    setSearchResults(update);
    setMyLooks(update);
    setSavedLooks(update);
  };

  const findThread = (threadId: string) =>
    threads.find(thread => thread.id === threadId)
    ?? popularTop.find(thread => thread.id === threadId)
    ?? searchResults.find(thread => thread.id === threadId)
    ?? myLooks.find(thread => thread.id === threadId)
    ?? savedLooks.find(thread => thread.id === threadId);

  const handleToggleSave = (threadId: string) => {
    const targetThread = findThread(threadId);

    if (!targetThread) {
      return;
    }

    const nextSaved = !targetThread.viewerState.saved;
    triggerLightHaptic();
    updateThreadReaction(threadId, 'saved', nextSaved);

    if (nextSaved) {
      showToast('저장됨');
      recordThreadSignal('save', targetThread);
    } else {
      showToast('저장 해제됨');
    }

    void (nextSaved ? saveCommunityThread(threadId) : unsaveCommunityThread(threadId))
      .then(() => {
        if (nextSaved) {
          const savedThread: CommunityThreadSummary = {
            ...targetThread,
            counts: {...targetThread.counts, saves: targetThread.counts.saves + 1},
            viewerState: {...targetThread.viewerState, saved: true},
          };
          setSavedLooks(current => current.some(thread => thread.id === threadId)
            ? current.map(thread => thread.id === threadId ? savedThread : thread)
            : [savedThread, ...current]);
          if (mode === 'recommended' && !isSearchMode) {
            setThreads(current => current.filter(thread => thread.id !== threadId));
          }
        } else {
          setSavedLooks(current => current.filter(thread => thread.id !== threadId));
        }
      })
      .catch(() => {
        updateThreadReaction(threadId, 'saved', !nextSaved);
        showToast('저장 상태를 바꾸지 못했어요');
      });
  };

  const handleToggleLike = (threadId: string) => {
    const targetThread = findThread(threadId);

    if (!targetThread) {
      return;
    }

    const nextLiked = !targetThread.viewerState.liked;
    triggerLightHaptic();
    updateThreadReaction(threadId, 'liked', nextLiked);

    if (nextLiked) {
      recordThreadSignal('like', targetThread);
    }

    void (nextLiked ? likeCommunityThread(threadId) : unlikeCommunityThread(threadId)).catch(() => {
      updateThreadReaction(threadId, 'liked', !nextLiked);
      showToast('좋아요에 실패했어요');
    });
  };

  const handlePressThread = (thread: CommunityThreadSummary) => {
    clickedThreadIdsRef.current.add(thread.id);
    pendingImpressionThreadsRef.current.delete(thread.id);

    const recordedAction = recordThreadSignal('view', thread);

    if (recordedAction === 'view' || recordedAction === 'revisit') {
      void recordCommunityEvents([{eventType: recordedAction, threadId: thread.id}]);
    }

    onPressThread(thread.id);
  };

  const handleSearchSubmit = async () => {
    const query = searchInput.trim();

    if (!query) {
      return;
    }

    setActiveQuery(query);
    setIsSearchLoading(true);
    // 검색어는 명시적 의도 — 관심사 신호로 기록한다.
    recordSearchInterest(query);

    try {
      const result = await searchCommunityThreads(query, SEARCH_POOL_SIZE);
      setSearchResults(result.threads);
    } catch {
      const pool = await getCommunityThreads({
        category: 'trending',
        limit: SEARCH_POOL_SIZE,
        sort: 'latest',
      });
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      setSearchResults(pool.threads.filter(thread => threadMatchesQuery(thread, tokens)));
    } finally {
      setIsSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchInput('');
    setActiveQuery('');
    setSearchResults([]);
  };

  const handleRefresh = async () => {
    if (mode === 'my') {
      await loadMyActivity(true);
      return;
    }

    if (isSearchMode) {
      setIsRefreshing(true);
      try {
        const result = await searchCommunityThreads(activeQuery, SEARCH_POOL_SIZE);
        setSearchResults(result.threads);
      } finally {
        setIsRefreshing(false);
      }
      return;
    }

    await loadFeed(true);
  };

  // 비클릭 노출(impression) — 60% 이상 900ms 보였지만 누르지 않고 지나간 카드만 기록한다.
  const handleViewableItemsChanged = useRef(({changed}: {changed: ViewToken[]}) => {
    if (modeRef.current === 'my' || isSearchModeRef.current) {
      return;
    }

    changed.forEach(token => {
      const item = token.item as CommunityThreadSummary | undefined;

      if (!item?.id || clickedThreadIdsRef.current.has(item.id) || seenImpressionsRef.current.has(item.id)) {
        pendingImpressionThreadsRef.current.delete(item?.id ?? '');
        return;
      }

      if (token.isViewable) {
        pendingImpressionThreadsRef.current.set(item.id, item);
        return;
      }

      const pendingThread = pendingImpressionThreadsRef.current.get(item.id);
      pendingImpressionThreadsRef.current.delete(item.id);

      if (pendingThread) {
        recordNonClickedImpression(pendingThread);
      }
    });
  }).current;
  const viewabilityConfig = useRef({itemVisiblePercentThreshold: 60, minimumViewTime: 900}).current;

  const renderThreadCard = (item: CommunityThreadSummary) => {
    const stylePercent = feedTab === 'recommended' && !isSearchMode
      ? stylePercentByThreadId.get(item.id) ?? null
      : null;

    return (
      <LookThreadCard
        matchPercent={stylePercent != null && stylePercent >= STYLE_BADGE_THRESHOLD ? stylePercent : null}
        thread={item}
        onPress={() => handlePressThread(item)}
        onPressAuthor={onPressAuthor}
        onToggleLike={handleToggleLike}
        onToggleSave={handleToggleSave}
      />
    );
  };

  const myTabLooks = myTab === 'mine' ? myLooks : savedLooks;
  const listData = mode === 'my'
    ? (isMyLoading ? [] : myTabLooks)
    : isSearchMode
      ? searchResults
      : isLoading ? [] : displayThreads;

  // 추천·MY 모드는 핀터레스트식 2열 그리드 — 홈은 1열 몰입 카드 유지.
  // 열 너비는 flex 대신 명시 계산 (겹침 방지).
  const isGridMode = mode !== 'home';
  const {width: windowWidth} = useWindowDimensions();
  const gridItemWidth = (windowWidth - spacing.screenX * 2 - spacing.md) / 2;

  const handleSelectMode = (nextMode: CommunityMode) => {
    if (nextMode !== 'recommended') {
      // 검색은 추천(탐색) 모드 전용 — 인스타 돋보기와 같은 포지션.
      clearSearch();
    }

    selectMode(nextMode);
  };

  return (
    <View style={styles.screen}>
      <FlatList
        ListHeaderComponent={
          <YStack style={styles.headerStack}>
            {mode === 'my' ? (
              <YStack style={styles.myHeader}>
                <XStack style={styles.myProfileRow}>
                  <CommunityAvatar avatarUrl={viewerAvatarUrl} nickname={viewerNickname} size={56} />
                  <YStack style={styles.myProfileCopy}>
                    <Text style={styles.myNickname}>{viewerNickname} 님</Text>
                    <Text style={styles.myMeta}>올린 룩 {myLooks.length} · 저장 {savedLooks.length}</Text>
                  </YStack>
                  <View style={styles.myProfileSpacer} />
                  <IconButton
                    accessibilityLabel="프로필 수정으로 이동"
                    onPress={onPressEditProfile}
                    size={42}>
                    <PencilIcon />
                  </IconButton>
                </XStack>
                <XStack style={styles.myTabRow}>
                  {([['mine', '내 글'], ['saved', '저장됨']] as const).map(([tabId, label]) => (
                    <Pressable
                      accessibilityLabel={`${label} 보기`}
                      accessibilityRole="tab"
                      accessibilityState={{selected: myTab === tabId}}
                      key={tabId}
                      onPress={() => setMyTab(tabId)}
                      style={({pressed}) => [
                        styles.myTabButton,
                        myTab === tabId && styles.myTabButtonSelected,
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.myTabText, myTab === tabId && styles.myTabTextSelected]}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </XStack>
              </YStack>
            ) : null}

            {/* 검색바는 추천 모드 콘텐츠 맨 위 — 피드와 함께 스크롤돼 올라간다. */}
            {mode === 'recommended' ? (
              <XStack style={styles.searchBar}>
                <Search color={colors.textTertiary} size={iconSize.xs} strokeWidth={2.2} />
                <TextInput
                  accessibilityLabel="룩톡 검색"
                  placeholder="룩, 무드, 상황 검색"
                  placeholderTextColor={colors.textTertiary}
                  returnKeyType="search"
                  style={styles.searchInput}
                  value={searchInput}
                  onChangeText={setSearchInput}
                  onSubmitEditing={() => void handleSearchSubmit()}
                />
                {searchInput.length > 0 || isSearchMode ? (
                  <Pressable
                    accessibilityLabel="검색 지우기"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={clearSearch}
                    style={({pressed}) => pressed && styles.pressed}>
                    <X color={colors.textSecondary} size={iconSize.xs} strokeWidth={2.2} />
                  </Pressable>
                ) : null}
              </XStack>
            ) : null}
            {isSearchMode ? (
              <XStack style={styles.searchResultRow}>
                <Text style={styles.searchResultText}>
                  '{activeQuery}' 결과 {isSearchLoading ? '검색 중…' : `${searchResults.length}개`}
                </Text>
                <Pressable
                  accessibilityLabel="검색 취소"
                  accessibilityRole="button"
                  onPress={clearSearch}
                  style={({pressed}) => pressed && styles.pressed}>
                  <Text style={styles.searchCancelText}>취소</Text>
                </Pressable>
              </XStack>
            ) : (
              <>
                {mode === 'home' ? (
                  <CommunityCategoryTabs
                    items={homeCategoryTabs}
                    selectedId={homeCategory}
                    onSelect={id => setHomeCategory(id as HomeCategory)}
                  />
                ) : null}

                {feedTab === 'recommended' && !isLoading ? (
                  isPersonalizedRecommended ? (
                    <XStack style={styles.personalizedRow}>
                      <Sparkles color={communityColors.accent} size={iconSize.xs} strokeWidth={2.2} />
                      <Text style={styles.personalizedText}>내 리포트·활동 기반 스타일 순이에요</Text>
                    </XStack>
                  ) : (
                    <YStack style={styles.ctaBanner}>
                      <Text style={styles.ctaTitle}>아직 50% 이상 매칭된 룩이 없어요</Text>
                      <Text style={styles.ctaSubtitle}>분석 리포트와 룩 데이터가 쌓이면 추천이 열려요.</Text>
                    </YStack>
                  )
                ) : null}

                {mode === 'home' && feedTab === 'all' && popularTop.length > 0 && !isLoading ? (
                  <YStack style={styles.popularSection}>
                    <XStack style={styles.sectionLabelRow}>
                      <Flame color={communityColors.accent} size={iconSize.xs} strokeWidth={2.2} />
                      <Text style={styles.sectionLabelText}>최근 7일 인기</Text>
                    </XStack>
                    <YStack style={styles.popularCards}>
                      {popularTop.map(thread => (
                        <View key={thread.id}>{renderThreadCard(thread)}</View>
                      ))}
                    </YStack>
                    <XStack style={styles.sectionLabelRow}>
                      <Text style={styles.sectionLabelText}>최신 글</Text>
                    </XStack>
                  </YStack>
                ) : null}
              </>
            )}
          </YStack>
        }
        ListEmptyComponent={
          mode === 'my'
            ? (isMyLoading
              ? <CommunityFeedSkeleton />
              : (
                <CommunityEmpty
                  description={myTab === 'mine' ? '작성 버튼으로 첫 룩을 올려보세요.' : '피드에서 마음에 드는 룩을 저장해 보세요.'}
                  error={null}
                  title={myTab === 'mine' ? '아직 올린 룩이 없어요' : '저장한 룩이 없어요'}
                  onRetry={() => void loadMyActivity(false)}
                />
              ))
            : isSearchMode
            ? (isSearchLoading
              ? <CommunityFeedSkeleton />
              : <CommunityEmpty description="다른 키워드로 검색해 보세요." error={null} title="검색 결과가 없어요" onRetry={clearSearch} />)
            : isLoading
              ? <CommunityFeedSkeleton />
              : <CommunityEmpty error={error} onRetry={() => void loadFeed(false)} />
        }
        ListFooterComponent={
          isLoadingMore
            ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={colors.textPrimary} />
              </View>
            )
            : null
        }
        columnWrapperStyle={isGridMode ? styles.gridRow : undefined}
        contentContainerStyle={[styles.listContent, {paddingBottom: listBottomPadding}]}
        data={listData}
        key={`${mode}-${isGridMode ? 'grid' : 'list'}`}
        keyExtractor={item => item.id}
        numColumns={isGridMode ? 2 : 1}
        onEndReached={() => {
          if (mode !== 'my' && !isSearchMode) {
            void loadMoreThreads();
          }
        }}
        onEndReachedThreshold={0.4}
        onViewableItemsChanged={handleViewableItemsChanged}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            tintColor={colors.textPrimary}
            onRefresh={() => void handleRefresh()}
          />
        }
        renderItem={({item}) => isGridMode
          ? (
            <LookGridCard
              matchPercent={
                (stylePercentByThreadId.get(item.id) ?? 0) >= STYLE_BADGE_THRESHOLD
                  ? stylePercentByThreadId.get(item.id) ?? null
                  : null
              }
              showActions={mode === 'my' || mode === 'recommended'}
              showMeta={mode === 'my' || mode === 'recommended'}
              thread={item}
              width={gridItemWidth}
              onPress={() => handlePressThread(item)}
              onToggleLike={handleToggleLike}
              onToggleSave={handleToggleSave}
            />
          )
          : renderThreadCard(item)}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
      />

      {avoidFloatingFooter ? null : (
        <CommunityModeBar
          mode={mode}
          onPressCreate={onPressCreate}
          onSelectMode={handleSelectMode}
        />
      )}

      {toast}
    </View>
  );
}

function CommunityFeedSkeleton() {
  return (
    <YStack style={styles.skeletonStack}>
      {[0, 1].map(index => (
        <YStack key={index} style={styles.skeletonCard}>
          <View style={styles.skeletonImage} />
          <YStack style={styles.skeletonPanel}>
            <View style={[styles.skeletonLine, styles.skeletonLineWide]} />
            <View style={[styles.skeletonLine, styles.skeletonLineNarrow]} />
          </YStack>
        </YStack>
      ))}
    </YStack>
  );
}

function CommunityEmpty({
  description,
  error,
  onRetry,
  title,
}: {
  description?: string;
  error: FeedErrorKind | null;
  onRetry: () => void;
  title?: string;
}) {
  const resolvedTitle = title ?? (error === 'network'
    ? '연결을 확인해주세요'
    : error === 'server'
      ? '잠시 불러오지 못했어요'
      : '아직 올라온 룩이 없어요');
  const resolvedDescription = description ?? (error === 'network'
    ? '네트워크 연결 후 다시 시도해 주세요.'
    : error === 'server'
      ? '잠시 후 다시 시도해 주세요.'
      : '첫 룩을 공유해서 룩톡을 시작해 보세요.');

  return (
    <YStack style={styles.emptyBox}>
      {error === 'network' ? (
        <WifiOff color={colors.textTertiary} size={iconSize.lg} strokeWidth={1.8} />
      ) : null}
      <Text style={styles.emptyTitle}>{resolvedTitle}</Text>
      <Text style={styles.stateText}>{resolvedDescription}</Text>
      {error ? (
        <Pressable onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      ) : null}
    </YStack>
  );
}

const styles = StyleSheet.create({
  ctaBanner: {
    backgroundColor: communityColors.accentSoft,
    borderRadius: radius.md,
    gap: 2,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.screenX,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ctaSubtitle: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    opacity: 0.8,
  },
  ctaTitle: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  emptyBox: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xxl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  gridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenX,
  },
  footerLoading: {
    paddingVertical: spacing.lg,
  },
  headerStack: {
    backgroundColor: communityColors.surfaceWarm,
    paddingBottom: spacing.sm,
  },
  listContent: {
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  myHeader: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.lg,
  },
  myMeta: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  myNickname: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  myProfileCopy: {
    gap: 2,
  },
  myProfileRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  myProfileSpacer: {
    flex: 1,
  },
  myTabButton: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  myTabButtonSelected: {
    borderBottomColor: communityColors.accent,
  },
  myTabRow: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  myTabText: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  myTabTextSelected: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
  },
  personalizedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.screenX,
  },
  personalizedText: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  popularCards: {
    gap: spacing.xl,
  },
  popularSection: {
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.72,
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
    position: 'relative',
  },
  // 추천 모드 최상단 고정 — 스크롤과 무관하게 항상 그 자리.
  searchBar: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.screenX,
    marginTop: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  searchCancelText: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    paddingVertical: spacing.sm,
  },
  searchResultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.md,
  },
  searchResultText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  sectionLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.screenX,
  },
  sectionLabelText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  skeletonCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.soft,
  },
  skeletonImage: {
    aspectRatio: 4 / 5,
    backgroundColor: colors.surfaceMuted,
    width: '100%',
  },
  skeletonLine: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 13,
  },
  skeletonLineNarrow: {
    width: '24%',
  },
  skeletonLineWide: {
    width: '42%',
  },
  skeletonPanel: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  skeletonStack: {
    gap: spacing.xl,
    paddingHorizontal: spacing.screenX,
  },
  stateText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
});
