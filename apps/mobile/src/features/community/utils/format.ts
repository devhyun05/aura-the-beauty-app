import type {CommunityDifficulty} from '../types';

export const difficultyLabels: Record<CommunityDifficulty, string> = {
  easy: '쉬움',
  hard: '어려움',
  medium: '보통',
};

export function formatCount(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }

  return String(value);
}

export function formatRelativeTime(isoDate: string) {
  const timestamp = Date.parse(isoDate);

  if (Number.isNaN(timestamp)) {
    return '';
  }

  const elapsedMs = Date.now() - timestamp;
  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 1) {
    return '방금 전';
  }

  if (minutes < 60) {
    return `${minutes}분 전`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}시간 전`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}일 전`;
  }

  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}
