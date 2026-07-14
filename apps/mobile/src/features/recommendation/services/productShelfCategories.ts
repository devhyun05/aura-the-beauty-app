import type {
  CatalogProduct,
  ProductRecommendationCategory,
  ProductRecommendationTab,
} from '../types';

export const PRODUCT_SHELF_CATEGORY_TABS: readonly ProductRecommendationTab[] = [
  {id: 'all', label: '전체'},
  {id: 'base', label: '베이스'},
  {id: 'shadow', label: '아이섀도우'},
  {id: 'brow', label: '아이브로우'},
  {id: 'cheek', label: '치크'},
  {id: 'lip', label: '립'},
  {id: 'liner', label: '아이라이너'},
];

const CATEGORY_ALIASES: Record<Exclude<ProductRecommendationCategory, 'all'>, readonly string[]> = {
  base: ['base', 'foundation', 'cushion', 'concealer', 'powder', '베이스', '파운데이션', '쿠션', '컨실러', '파우더'],
  shadow: ['shadow', 'eyeshadow', 'eye_shadow', 'eye', '아이', '아이쉐도우', '아이_쉐도우', '쉐도우', '아이섬도우', '아이_섬도우', '섬도우'],
  brow: ['brow', 'eyebrow', 'eye_brow', '아이브로우', '브로우', '눈썹'],
  cheek: ['cheek', 'blush', 'blusher', '치크', '블러셔', '블러시'],
  lip: ['lip', 'lipstick', 'tint', 'gloss', '립', '립스틱', '틴트', '글로스'],
  liner: ['liner', 'eyeliner', 'eye_liner', '아이라이너', '라이너'],
};

export function normalizeProductShelfCategory(
  value: string | null | undefined,
): Exclude<ProductRecommendationCategory, 'all'> | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s/-]+/g, '_');
  if (!normalized) return null;

  const match = Object.entries(CATEGORY_ALIASES).find(([, aliases]) =>
    aliases.includes(normalized),
  );
  return (match?.[0] as Exclude<ProductRecommendationCategory, 'all'> | undefined) ?? null;
}

export function filterProductShelfItems(
  items: readonly CatalogProduct[],
  category: ProductRecommendationCategory,
): CatalogProduct[] {
  if (category === 'all') return [...items];
  return items.filter(item => normalizeProductShelfCategory(item.category) === category);
}

export function productShelfCategoryLabel(category: ProductRecommendationCategory): string {
  return PRODUCT_SHELF_CATEGORY_TABS.find(tab => tab.id === category)?.label ?? '선택한 카테고리';
}
