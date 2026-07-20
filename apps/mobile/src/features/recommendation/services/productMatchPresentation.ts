import type {CatalogProduct} from '../types';

export function normalizeProductMatchRate(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function productMatchRate(product: Pick<CatalogProduct, 'matchRate'>): number | null {
  return normalizeProductMatchRate(product.matchRate);
}

export function productMatchRateLabel(product: Pick<CatalogProduct, 'matchRate'>): string | null {
  const rate = productMatchRate(product);
  return rate == null ? null : `${rate}% 일치`;
}

export function sortCatalogProductsByMatchRate<T extends CatalogProduct>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({item, index, rate: productMatchRate(item)}))
    .sort((left, right) => {
      if (left.rate == null && right.rate == null) return left.index - right.index;
      if (left.rate == null) return 1;
      if (right.rate == null) return -1;
      if (right.rate !== left.rate) return right.rate - left.rate;
      return left.index - right.index;
    })
    .map(entry => entry.item);
}
