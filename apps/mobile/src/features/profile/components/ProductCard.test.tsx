import React from 'react';

import {PRODUCT_CARD_FAVORITE_ICON_NAME, ProductCard} from './ProductCard';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(PRODUCT_CARD_FAVORITE_ICON_NAME, 'Heart', 'product card favorite icon name');

<ProductCard
  product={{
    brandName: 'AURA',
    id: 'test-product',
    imageSource: {uri: 'test-product'},
    isLiked: true,
    price: 12000,
    productName: '테스트 립',
  }}
/>;
