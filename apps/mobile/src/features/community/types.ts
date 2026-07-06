export type CommunityCategory =
  | 'trending'
  | 'lookbook'
  | 'question'
  | 'product_combo'
  | 'before_after';

export type WritableCommunityCategory = Exclude<CommunityCategory, 'trending'>;
export type CommunitySort = 'latest' | 'popular';
export type CommunityDifficulty = 'easy' | 'medium' | 'hard';
export type CommunityClientEventType = 'dwell' | 'impression' | 'revisit' | 'search' | 'slider' | 'view';

export type CommunityEventInput = {
  dwellMs?: number;
  eventType: CommunityClientEventType;
  searchQuery?: string;
  threadId?: string;
};

export type CommunityEventsResponse = {
  accepted: number;
};
export type CommunityMedia = {
  cdnUrl?: string | null;
  id: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
};

export type CommunityAuthor = {
  avatarUrl?: string | null;
  id: string;
  nickname: string;
};

export type CommunityProductUsageItem = {
  name: string;
  shade?: string | null;
};

export type CommunityProductUsage = {
  base: CommunityProductUsageItem[];
  eye: CommunityProductUsageItem[];
  cheek: CommunityProductUsageItem[];
  lip: CommunityProductUsageItem[];
};

export type CommunityThreadCounts = {
  likes: number;
  replies: number;
  saves: number;
  views: number;
};

export type CommunityViewerState = {
  liked: boolean;
  saved: boolean;
};

export type CommunityReplyViewerState = {
  liked: boolean;
};

export type CommunityThreadSummary = {
  author: CommunityAuthor;
  category: WritableCommunityCategory;
  counts: CommunityThreadCounts;
  coverMedia: CommunityMedia;
  createdAt: string;
  difficulty?: CommunityDifficulty | null;
  durationMinutes?: number | null;
  id: string;
  moodTags: string[];
  situationTags: string[];
  title: string;
  matchPercent?: number | null;
  viewerState: CommunityViewerState;
};

export type CommunityReply = {
  author: CommunityAuthor;
  body: string;
  createdAt: string;
  id: string;
  likeCount: number;
  parentReplyId?: string | null;
  replies?: CommunityReply[];
  viewerState?: CommunityReplyViewerState;
};

export type CommunityThreadDetail = CommunityThreadSummary & {
  body: string;
  media: CommunityMedia[];
  viewerUserId?: string | null;
  productUsage: CommunityProductUsage;
  replies: CommunityReply[];
};

export type CommunityThreadsResponse = {
  nextCursor?: string | null;
  threads: CommunityThreadSummary[];
};

export type CommunityRecommendedThreadsResponse = {
  basedOn?: {reportId: string} | null;
  threads: CommunityThreadSummary[];
};

export type CommunityThreadListRequest = {
  category?: CommunityCategory;
  cursor?: string | null;
  limit?: number;
  sort?: CommunitySort;
  windowDays?: number;
};

export type CreateCommunityThreadInput = {
  body: string;
  category: WritableCommunityCategory;
  difficulty?: CommunityDifficulty | null;
  durationMinutes?: number | null;
  mediaIds: string[];
  localMedia?: CommunityMedia[];
  moodTags: string[];
  productUsage: CommunityProductUsage;
  situationTags: string[];
  title: string;
};

export type UpdateCommunityThreadInput = CreateCommunityThreadInput;

export type DeleteCommunityThreadResponse = {
  deleted: boolean;
  threadId: string;
};

export type CreateCommunityReplyInput = {
  body: string;
  parentReplyId?: string | null;
};

export type CreateCommunityReplyResponse = {
  counts: Pick<CommunityThreadCounts, 'replies'>;
  reply: CommunityReply;
};


export type UpdateCommunityReplyInput = {
  body: string;
};

export type UpdateCommunityReplyResponse = {
  reply: CommunityReply;
};
export type DeleteCommunityReplyResponse = {
  counts: Pick<CommunityThreadCounts, 'replies'>;
  deleted: boolean;
  replyId: string;
};


export const communityCategories: Array<{id: CommunityCategory; label: string}> = [
  {id: 'trending', label: '트렌딩'},
  {id: 'lookbook', label: '룩북'},
  {id: 'question', label: '질문'},
  {id: 'product_combo', label: '제품조합'},
  {id: 'before_after', label: '비포애프터'},
];

export const writableCommunityCategories: Array<{id: WritableCommunityCategory; label: string}> = [
  {id: 'lookbook', label: '룩북'},
  {id: 'question', label: '질문'},
  {id: 'product_combo', label: '제품조합'},
  {id: 'before_after', label: '비포애프터'},
];

export const emptyProductUsage: CommunityProductUsage = {
  base: [],
  cheek: [],
  eye: [],
  lip: [],
};
