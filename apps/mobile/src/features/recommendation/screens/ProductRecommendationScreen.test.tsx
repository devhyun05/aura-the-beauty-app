import React from 'react';

import {
  ProductRecommendationScreen,
  getRecommendationSetSectionTitle,
  getProductRecommendationReportLabel,
  productCategoryTabWidthMode,
  productListScrollAxis,
  productRecommendationHeaderCopy,
} from './ProductRecommendationScreen';
import {isTrustedCatalogProductId} from '../services/productRecommendationService';

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
expectEqual(
  productCategoryTabWidthMode,
  'labelContent',
  'product category tab width mode',
);
expectEqual(
  productListScrollAxis,
  'vertical',
  'product list scroll axis',
);
expectEqual(
  isTrustedCatalogProductId('9d6421bb-b2a6-4c79-9ff5-2bc4fca87c85'),
  true,
  'trusted catalog UUID',
);
expectEqual(
  isTrustedCatalogProductId('naver-1234567890'),
  false,
  'external shopping product is not trusted catalog',
);

<ProductRecommendationScreen />;
