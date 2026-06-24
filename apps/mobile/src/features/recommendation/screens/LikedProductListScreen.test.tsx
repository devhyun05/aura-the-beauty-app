import React from 'react';

import {
  LIKED_PRODUCT_LIST_FAVORITE_ICON_NAME,
  LikedProductListScreen,
} from './LikedProductListScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  LIKED_PRODUCT_LIST_FAVORITE_ICON_NAME,
  'Heart',
  'liked product list favorite icon name',
);

<LikedProductListScreen />;
