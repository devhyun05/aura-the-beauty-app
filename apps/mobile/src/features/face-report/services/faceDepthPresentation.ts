export function formatRelativeDepthValue(value: number): string {
  if (!Number.isFinite(value)) return '측정 보류';
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

export function relativeDepthDirection(value: number): '기준면' | '전방' | '후방' {
  if (Math.abs(value) < 0.015) return '기준면';
  return value > 0 ? '전방' : '후방';
}
