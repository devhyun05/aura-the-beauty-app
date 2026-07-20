export function productLikeKey(
  productId: string,
  externalSource?: string | null,
): string {
  return `${externalSource?.trim() || 'catalog'}:${productId.trim()}`;
}
