import {
  buildCommunityThreadsPath,
  validateCreateCommunityThreadInput,
} from './communityService';
import type {CreateCommunityThreadInput} from '../types';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const baseInput: CreateCommunityThreadInput = {
  body: 'soft daily glow',
  category: 'lookbook',
  difficulty: 'easy',
  durationMinutes: 10,
  mediaIds: ['media-1'],
  moodTags: ['글로우'],
  productUsage: {base: [], cheek: [], eye: [], lip: []},
  situationTags: ['데일리'],
  title: '데일리 글로우',
};

expectEqual(
  buildCommunityThreadsPath({category: 'trending', limit: 12, sort: 'popular'}),
  '/community/threads?category=trending&limit=12&sort=popular',
  'trending threads path uses popular sort query',
);
expectEqual(
  buildCommunityThreadsPath({category: 'lookbook', cursor: '2026-07-01T00:00:00.000Z'}),
  '/community/threads?category=lookbook&limit=20&cursor=2026-07-01T00%3A00%3A00.000Z',
  'category threads path includes encoded cursor',
);
expectEqual(
  validateCreateCommunityThreadInput(baseInput).length,
  0,
  'valid create thread input has no validation errors',
);
expectEqual(
  validateCreateCommunityThreadInput({...baseInput, mediaIds: []}).some(error => error.includes('이미지')),
  true,
  'create thread requires at least one image',
);
expectEqual(
  validateCreateCommunityThreadInput({...baseInput, mediaIds: ['1', '2', '3', '4', '5']}).some(error => error.includes('이미지')),
  true,
  'create thread rejects more than four images',
);
expectEqual(
  validateCreateCommunityThreadInput({...baseInput, moodTags: ['1', '2', '3', '4', '5', '6', '7']}).some(error => error.includes('태그')),
  true,
  'create thread rejects more than six mood tags',
);
expectEqual(
  validateCreateCommunityThreadInput({...baseInput, category: 'before_after', mediaIds: ['1']}).some(error => error.includes('비포')),
  true,
  'before_after requires exactly two images (one rejected)',
);
expectEqual(
  validateCreateCommunityThreadInput({...baseInput, category: 'before_after', mediaIds: ['1', '2']}).length,
  0,
  'before_after with two images passes',
);
expectEqual(
  validateCreateCommunityThreadInput({...baseInput, category: 'product_combo'}).some(error => error.includes('제품')),
  true,
  'product_combo requires at least two products',
);
expectEqual(
  validateCreateCommunityThreadInput({
    ...baseInput,
    category: 'product_combo',
    productUsage: {base: [{name: '쿠션'}], cheek: [], eye: [], lip: [{name: '틴트'}]},
  }).length,
  0,
  'product_combo with two products across groups passes',
);
