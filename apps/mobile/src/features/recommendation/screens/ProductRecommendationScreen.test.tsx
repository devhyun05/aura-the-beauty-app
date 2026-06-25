import React from 'react';

import {
  ProductRecommendationScreen,
  getRecommendationSetSectionTitle,
  productRecommendationHeaderCopy,
} from './ProductRecommendationScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  productRecommendationHeaderCopy.productSectionEyebrow,
  undefined,
  'product recommendation section eyebrow copy',
);
expectEqual(
  productRecommendationHeaderCopy.setSectionEyebrow,
  undefined,
  'recommendation set section eyebrow copy',
);
expectEqual(
  getRecommendationSetSectionTitle('여두치'),
  '여두치 님의 스타일과 잘 맞는 추천 조합',
  'nickname recommendation set section title',
);

<ProductRecommendationScreen />;
