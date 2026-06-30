import React from 'react';

import {
  ProductRecommendationScreen,
  getRecommendationSetSectionTitle,
  getProductRecommendationReportLabel,
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
  '여두치 님의 룩과 잘 맞는 추천 조합',
  'nickname recommendation set section title',
);
expectEqual(
  getProductRecommendationReportLabel({
    analyzedAt: '2026-06-30T12:34:56.000Z',
    personalColor: '봄웜 라이트',
  }),
  '06.30 · 봄웜 라이트',
  'product recommendation report selector label',
);
expectEqual(
  getProductRecommendationReportLabel(null),
  '최근 분석 기준',
  'product recommendation report selector fallback label',
);

<ProductRecommendationScreen />;
