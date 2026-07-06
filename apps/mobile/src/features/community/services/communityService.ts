import {getBackendApiBaseUrl, requestBackendJson} from '../../../shared/services/backendApi';
import {getUserProfile, getUserProfileAvatarUri} from '../../../shared/services/userService';
import {communityMockDetails, communityMockThreads} from '../mocks/community.mock';
import type {
  CommunityMedia,
  CommunityReply,
  CommunityRecommendedThreadsResponse,
  CommunityEventInput,
  CommunityEventsResponse,
  CommunityThreadDetail,
  CommunityThreadListRequest,
  CommunityThreadSummary,
  CommunityThreadsResponse,
  DeleteCommunityReplyResponse,
  DeleteCommunityThreadResponse,
  CreateCommunityReplyInput,
  CreateCommunityReplyResponse,
  CreateCommunityThreadInput,
  UpdateCommunityReplyInput,
  UpdateCommunityReplyResponse,
  UpdateCommunityThreadInput,
} from '../types';

export function buildCommunityThreadsPath({
  category = 'trending',
  cursor,
  limit = 20,
  sort,
  windowDays,
}: CommunityThreadListRequest = {}): string {
  const searchParams = new URLSearchParams();
  searchParams.set('category', category);
  searchParams.set('limit', String(limit));

  if (sort) {
    searchParams.set('sort', sort);
  }

  if (cursor) {
    searchParams.set('cursor', cursor);
  }

  if (typeof windowDays === 'number') {
    searchParams.set('window_days', String(windowDays));
  }

  return `/community/threads?${searchParams.toString()}`;
}

async function getViewerAuthor(): Promise<{avatarUrl?: string | null; id: string; nickname: string}> {
  try {
    const profile = await getUserProfile();

    return {
      avatarUrl: getUserProfileAvatarUri(profile),
      id: profile.id || 'me',
      nickname: profile.nickname,
    };
  } catch {
    return {id: 'me', nickname: '나'};
  }
}

function getMockThreads({category = 'trending', sort}: CommunityThreadListRequest = {}): CommunityThreadsResponse {
  const filtered = category === 'trending'
    ? communityMockThreads
    : communityMockThreads.filter(thread => thread.category === category);
  const sorted = [...filtered].sort((left, right) => {
    if ((sort ?? (category === 'trending' ? 'popular' : 'latest')) === 'popular') {
      const leftScore = left.counts.likes + left.counts.saves * 2 + left.counts.replies;
      const rightScore = right.counts.likes + right.counts.saves * 2 + right.counts.replies;
      return rightScore - leftScore;
    }

    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });

  return {nextCursor: null, threads: sorted};
}

function getMockDetail(threadId: string) {
  return communityMockDetails.find(thread => thread.id === threadId) ?? communityMockDetails[0];
}

function mockSearchThreads(query: string): CommunityThreadSummary[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  return communityMockThreads.filter(thread => {
    const haystack = [
      thread.title,
      thread.category,
      ...thread.moodTags,
      ...thread.situationTags,
    ].join(' ').toLowerCase();

    return tokens.every(token => haystack.includes(token));
  });
}

function updateMockThread(threadId: string, updater: (thread: CommunityThreadSummary) => CommunityThreadSummary) {
  const update = (thread: CommunityThreadSummary) => thread.id === threadId ? updater(thread) : thread;
  const threadIndex = communityMockThreads.findIndex(thread => thread.id === threadId);
  const detailIndex = communityMockDetails.findIndex(thread => thread.id === threadId);

  if (threadIndex >= 0) {
    communityMockThreads[threadIndex] = update(communityMockThreads[threadIndex]);
  }

  if (detailIndex >= 0) {
    communityMockDetails[detailIndex] = update(communityMockDetails[detailIndex]) as CommunityThreadDetail;
  }
}

function setMockReaction(threadId: string, key: 'liked' | 'saved', enabled: boolean) {
  updateMockThread(threadId, thread => {
    const countKey = key === 'liked' ? 'likes' : 'saves';
    const currentEnabled = thread.viewerState[key];

    if (currentEnabled === enabled) {
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
}

function setMockDetail(threadId: string, nextDetail: CommunityThreadDetail) {
  const detailIndex = communityMockDetails.findIndex(thread => thread.id === threadId);
  const threadIndex = communityMockThreads.findIndex(thread => thread.id === threadId);

  if (detailIndex >= 0) {
    communityMockDetails[detailIndex] = nextDetail;
  }

  if (threadIndex >= 0) {
    communityMockThreads[threadIndex] = nextDetail;
  }
}

function removeMockThread(threadId: string) {
  const detailIndex = communityMockDetails.findIndex(thread => thread.id === threadId);
  const threadIndex = communityMockThreads.findIndex(thread => thread.id === threadId);

  if (detailIndex >= 0) {
    communityMockDetails.splice(detailIndex, 1);
  }

  if (threadIndex >= 0) {
    communityMockThreads.splice(threadIndex, 1);
  }
}

function updateReplyBodyInList(replies: CommunityThreadDetail['replies'], replyId: string, body: string) {
  let updatedReply: CommunityReply | null = null;
  const nextReplies = replies.map(reply => {
    if (reply.id === replyId) {
      updatedReply = {...reply, body};
      return updatedReply;
    }

    const childReplies = reply.replies ?? [];
    const nextChildReplies = childReplies.map(child => {
      if (child.id === replyId) {
        updatedReply = {...child, body};
        return updatedReply;
      }
      return child;
    });

    return nextChildReplies === childReplies ? reply : {...reply, replies: nextChildReplies};
  });

  return {reply: updatedReply, replies: nextReplies};
}
function removeReplyFromList(replies: CommunityThreadDetail['replies'], replyId: string) {
  let removed = false;
  const nextReplies = replies
    .filter(reply => {
      if (reply.id === replyId) {
        removed = true;
        return false;
      }
      return true;
    })
    .map(reply => {
      const childReplies = reply.replies ?? [];
      const nextChildReplies = childReplies.filter(child => {
        if (child.id === replyId) {
          removed = true;
          return false;
        }
        return true;
      });

      return nextChildReplies === childReplies ? reply : {...reply, replies: nextChildReplies};
    });

  return {removed, replies: nextReplies};
}

export async function getCommunityThreads(
  request: CommunityThreadListRequest = {},
): Promise<CommunityThreadsResponse> {
  if (!getBackendApiBaseUrl()) {
    return getMockThreads(request);
  }

  try {
    return await requestBackendJson<CommunityThreadsResponse>(buildCommunityThreadsPath(request));
  } catch (error) {
    console.info('[aura:community] threads:fallback', {
      message: error instanceof Error ? error.message : String(error),
    });
    return getMockThreads(request);
  }
}

export async function getRecommendedCommunityThreads(
  limit = 20,
): Promise<CommunityRecommendedThreadsResponse> {
  if (!getBackendApiBaseUrl()) {
    return {basedOn: null, threads: []};
  }

  const searchParams = new URLSearchParams();
  searchParams.set('limit', String(limit));

  try {
    const response = await requestBackendJson<CommunityRecommendedThreadsResponse>(
      `/community/threads/recommended?${searchParams.toString()}`,
    );

    console.info('[aura:community] recommended:loaded', {
      basedOnReportId: response.basedOn?.reportId ?? null,
      maxMatchPercent: response.threads.reduce((max, thread) => Math.max(max, thread.matchPercent ?? 0), 0),
      source: response.basedOn ? 'embedding' : 'empty',
      threadCount: response.threads.length,
    });

    return response;
  } catch (error) {
    console.info('[aura:community] recommended:empty', {
      message: error instanceof Error ? error.message : String(error),
    });

    return {basedOn: null, threads: []};
  }
}
export async function searchCommunityThreads(
  query: string,
  limit = 20,
): Promise<Pick<CommunityThreadsResponse, 'threads'>> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return {threads: []};
  }

  if (!getBackendApiBaseUrl()) {
    return {threads: mockSearchThreads(normalizedQuery).slice(0, limit)};
  }

  const searchParams = new URLSearchParams();
  searchParams.set('q', normalizedQuery);
  searchParams.set('limit', String(limit));

  try {
    return await requestBackendJson<Pick<CommunityThreadsResponse, 'threads'>>(
      `/community/search?${searchParams.toString()}`,
    );
  } catch (error) {
    console.info('[aura:community] search:fallback', {
      message: error instanceof Error ? error.message : String(error),
    });
    return {threads: mockSearchThreads(normalizedQuery).slice(0, limit)};
  }
}

export async function recordCommunityEvents(events: CommunityEventInput[]): Promise<void> {
  const acceptedEvents = events.slice(0, 20);

  if (acceptedEvents.length === 0 || !getBackendApiBaseUrl()) {
    return;
  }

  try {
    await requestBackendJson<CommunityEventsResponse>('/community/events', {
      body: {events: acceptedEvents},
      method: 'POST',
      timeoutMs: 10000,
    });
  } catch (error) {
    console.info('[aura:community] events:drop', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getCommunityThreadDetail(threadId: string): Promise<CommunityThreadDetail> {
  if (!getBackendApiBaseUrl()) {
    return getMockDetail(threadId);
  }

  try {
    return await requestBackendJson<CommunityThreadDetail>(`/community/threads/${threadId}`);
  } catch (error) {
    console.info('[aura:community] detail:fallback', {
      message: error instanceof Error ? error.message : String(error),
      threadId,
    });
    return getMockDetail(threadId);
  }
}

export async function createCommunityThread(input: CreateCommunityThreadInput): Promise<CommunityThreadDetail> {
  const {localMedia, ...backendInput} = input;

  if (!getBackendApiBaseUrl()) {
    const fallback = communityMockDetails[0];
    const media: CommunityMedia[] = localMedia?.length
      ? localMedia
      : input.mediaIds.map(mediaId => ({id: mediaId}));
    const detail: CommunityThreadDetail = {
      ...fallback,
      // 로컬 작성 글은 항상 내 글 — 커뮤니티 MY 탭에 잡히게 한다. 닉네임은 앱 프로필과 연결.
      author: await getViewerAuthor(),
      body: input.body,
      category: input.category,
      counts: {likes: 0, replies: 0, saves: 0, views: 1},
      coverMedia: media[0] ?? {id: input.mediaIds[0]},
      createdAt: new Date().toISOString(),
      difficulty: input.difficulty,
      durationMinutes: input.durationMinutes,
      id: `local-thread-${Date.now()}`,
      media,
      moodTags: input.moodTags,
      productUsage: input.productUsage,
      replies: [],
      situationTags: input.situationTags,
      title: input.title,
      viewerState: {liked: false, saved: false},
    };

    communityMockDetails.unshift(detail);
    communityMockThreads.unshift(detail);
    return detail;
  }

  return requestBackendJson<CommunityThreadDetail>('/community/threads', {
    body: backendInput,
    method: 'POST',
  });
}

export async function updateCommunityThread(
  threadId: string,
  input: UpdateCommunityThreadInput,
): Promise<CommunityThreadDetail> {
  const {localMedia, ...backendInput} = input;

  if (!getBackendApiBaseUrl()) {
    const detail = getMockDetail(threadId);
    const media: CommunityMedia[] = localMedia?.length
      ? localMedia
      : input.mediaIds.map(mediaId => detail.media.find(media => media.id === mediaId) ?? {id: mediaId});
    const nextDetail: CommunityThreadDetail = {
      ...detail,
      ...backendInput,
      coverMedia: media[0] ?? detail.coverMedia,
      media,
      viewerUserId: detail.viewerUserId ?? detail.author.id,
    };

    setMockDetail(threadId, nextDetail);
    return nextDetail;
  }

  return requestBackendJson<CommunityThreadDetail>(`/community/threads/${threadId}/update`, {
    body: backendInput,
    method: 'POST',
  });
}

export async function deleteCommunityThread(threadId: string): Promise<DeleteCommunityThreadResponse> {
  if (!getBackendApiBaseUrl()) {
    removeMockThread(threadId);
    return {deleted: true, threadId};
  }

  return requestBackendJson<DeleteCommunityThreadResponse>(`/community/threads/${threadId}/delete`, {
    method: 'POST',
  });
}
export async function createCommunityReply(
  threadId: string,
  input: CreateCommunityReplyInput,
): Promise<CreateCommunityReplyResponse> {
  if (!getBackendApiBaseUrl()) {
    const detail = getMockDetail(threadId);
    const reply = {
      author: await getViewerAuthor(),
      body: input.body,
      createdAt: new Date().toISOString(),
      id: `local-reply-${Date.now()}`,
      likeCount: 0,
      parentReplyId: input.parentReplyId ?? null,
      replies: [],
      viewerState: {liked: false},
    };
    const nextDetail = {
      ...detail,
      counts: {...detail.counts, replies: detail.counts.replies + 1},
      replies: input.parentReplyId
        ? detail.replies.map(parent => parent.id === input.parentReplyId
          ? {...parent, replies: [...(parent.replies ?? []), reply]}
          : parent)
        : [reply, ...detail.replies],
    };
    const detailIndex = communityMockDetails.findIndex(thread => thread.id === threadId);
    const threadIndex = communityMockThreads.findIndex(thread => thread.id === threadId);

    if (detailIndex >= 0) {
      communityMockDetails[detailIndex] = nextDetail;
    }

    if (threadIndex >= 0) {
      communityMockThreads[threadIndex] = nextDetail;
    }

    return {counts: {replies: nextDetail.counts.replies}, reply};
  }

  return requestBackendJson<CreateCommunityReplyResponse>(`/community/threads/${threadId}/replies`, {
    body: input,
    method: 'POST',
  });
}
export async function updateCommunityReply(
  replyId: string,
  input: UpdateCommunityReplyInput,
): Promise<UpdateCommunityReplyResponse> {
  if (!getBackendApiBaseUrl()) {
    for (const detail of communityMockDetails) {
      const {reply, replies} = updateReplyBodyInList(detail.replies, replyId, input.body);

      if (reply) {
        const nextDetail: CommunityThreadDetail = {...detail, replies};
        setMockDetail(detail.id, nextDetail);
        return {reply};
      }
    }

    return {
      reply: {
        author: await getViewerAuthor(),
        body: input.body,
        createdAt: new Date().toISOString(),
        id: replyId,
        likeCount: 0,
        replies: [],
        viewerState: {liked: false},
      },
    };
  }

  return requestBackendJson<UpdateCommunityReplyResponse>(`/community/replies/${replyId}/update`, {
    body: input,
    method: 'POST',
  });
}
export async function deleteCommunityReply(replyId: string): Promise<DeleteCommunityReplyResponse> {
  if (!getBackendApiBaseUrl()) {
    for (const detail of communityMockDetails) {
      const {removed, replies} = removeReplyFromList(detail.replies, replyId);

      if (removed) {
        const nextDetail: CommunityThreadDetail = {
          ...detail,
          counts: {...detail.counts, replies: Math.max(0, detail.counts.replies - 1)},
          replies,
        };
        setMockDetail(detail.id, nextDetail);
        return {counts: {replies: nextDetail.counts.replies}, deleted: true, replyId};
      }
    }

    return {counts: {replies: 0}, deleted: true, replyId};
  }

  return requestBackendJson<DeleteCommunityReplyResponse>(`/community/replies/${replyId}/delete`, {
    method: 'POST',
  });
}
export async function likeCommunityThread(threadId: string): Promise<{liked: boolean; threadId: string}> {
  if (!getBackendApiBaseUrl()) {
    setMockReaction(threadId, 'liked', true);
    return {liked: true, threadId};
  }

  return requestBackendJson(`/community/threads/${threadId}/like`, {method: 'POST'});
}

export async function unlikeCommunityThread(threadId: string): Promise<{liked: boolean; threadId: string}> {
  if (!getBackendApiBaseUrl()) {
    setMockReaction(threadId, 'liked', false);
    return {liked: false, threadId};
  }

  return requestBackendJson(`/community/threads/${threadId}/like`, {method: 'DELETE'});
}

export async function saveCommunityThread(threadId: string): Promise<{saved: boolean; threadId: string}> {
  if (!getBackendApiBaseUrl()) {
    setMockReaction(threadId, 'saved', true);
    return {saved: true, threadId};
  }

  return requestBackendJson(`/community/threads/${threadId}/save`, {method: 'POST'});
}

export async function unsaveCommunityThread(threadId: string): Promise<{saved: boolean; threadId: string}> {
  if (!getBackendApiBaseUrl()) {
    setMockReaction(threadId, 'saved', false);
    return {saved: false, threadId};
  }

  return requestBackendJson(`/community/threads/${threadId}/save`, {method: 'DELETE'});
}


/** 특정 유저가 올린 룩 목록 (공개 프로필·마이페이지 공용). */
export async function getCommunityThreadsByAuthor(authorId: string): Promise<CommunityThreadSummary[]> {
  if (!getBackendApiBaseUrl()) {
    return communityMockThreads.filter(thread => thread.author.id === authorId);
  }

  try {
    const response = await requestBackendJson<CommunityThreadsResponse>(
      `/community/threads?author=${encodeURIComponent(authorId)}&limit=30`,
    );
    return response.threads;
  } catch {
    return [];
  }
}

/** 내가 올린 룩 — 백엔드에서는 author=me로 뷰어 기준 해석. */
export function getMyCommunityThreads(): Promise<CommunityThreadSummary[]> {
  return getCommunityThreadsByAuthor('me');
}

/** 내가 저장한 룩. */
export async function getSavedCommunityThreads(): Promise<CommunityThreadSummary[]> {
  if (!getBackendApiBaseUrl()) {
    return communityMockThreads.filter(thread => thread.viewerState.saved);
  }

  try {
    const response = await requestBackendJson<CommunityThreadsResponse>(
      '/community/threads?saved=me&limit=30',
    );
    return response.threads;
  } catch {
    return [];
  }
}

export function validateCreateCommunityThreadInput(input: CreateCommunityThreadInput): string[] {
  const errors: string[] = [];

  // 카테고리별 사진 규칙: 비포애프터는 BEFORE/AFTER 정확히 2장, 나머지는 1~4장.
  if (input.category === 'before_after') {
    if (input.mediaIds.length !== 2) {
      errors.push('비포·애프터 사진이 각 1장씩 필요해요.');
    }
  } else if (input.mediaIds.length < 1 || input.mediaIds.length > 4) {
    errors.push('이미지는 1장 이상 4장 이하로 선택해 주세요.');
  }

  // 제품조합은 제품이 핵심 콘텐츠 — 4그룹 합산 2개 이상.
  if (input.category === 'product_combo') {
    const productCount = Object.values(input.productUsage)
      .reduce((total, group) => total + group.length, 0);

    if (productCount < 2) {
      errors.push('제품을 2개 이상 적어주세요.');
    }
  }

  if (!input.title.trim() || input.title.trim().length > 30) {
    errors.push('제목은 1자 이상 30자 이하로 입력해 주세요.');
  }

  if (input.body.length > 2000) {
    errors.push('본문은 2000자 이하로 입력해 주세요.');
  }

  if (input.moodTags.length > 6 || input.situationTags.length > 6) {
    errors.push('태그는 종류별 최대 6개까지 선택할 수 있어요.');
  }

  return errors;
}