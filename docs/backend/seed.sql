-- Development seed data for AI AR Makeup Guide.
-- Safe to rerun: rows use stable external keys or titles with ON CONFLICT guards.

insert into products (
  external_key,
  brand_name,
  product_name,
  shade_name,
  category,
  price_krw,
  tags,
  palette,
  product_payload
)
values
  (
    'seed-lip-rose-veil',
    '오라랩',
    '로즈 베일 틴트',
    '로즈 베일',
    'lip',
    18000,
    array['데일리', '로즈', '글로우'],
    array['#C96E7B', '#E8A3AE'],
    '{"finish":"glow","matchRate":92}'::jsonb
  ),
  (
    'seed-cheek-peach-dusk',
    '오라랩',
    '피치 더스크 블러셔',
    '피치 더스크',
    'cheek',
    22000,
    array['피치', '소프트', '웜톤'],
    array['#E99A83', '#F3B7A5'],
    '{"finish":"sheer","matchRate":88}'::jsonb
  ),
  (
    'seed-shadow-rose-neutral',
    '오라랩',
    '로즈 뉴트럴 아이 팔레트',
    '로즈 뉴트럴',
    'shadow',
    32000,
    array['뉴트럴', '로즈', '팔레트'],
    array['#8B5E57', '#C08A82', '#E7C1B8'],
    '{"finish":"satin","matchRate":90}'::jsonb
  )
on conflict (external_key) do update
set brand_name = excluded.brand_name,
    product_name = excluded.product_name,
    shade_name = excluded.shade_name,
    category = excluded.category,
    price_krw = excluded.price_krw,
    tags = excluded.tags,
    palette = excluded.palette,
    product_payload = excluded.product_payload;

insert into ar_filters (
  external_key,
  category,
  title,
  subtitle,
  intensity_label,
  filter_payload
)
values
  (
    'seed-filter-clear-rose',
    'recommended',
    '맑은 로즈 밸런스',
    '데일리 메이크업에 맞춘 부드러운 로즈 립·치크 가이드',
    '은은함',
    '{"facePartIds":["lip","cheek"],"colorOptions":[{"id":"rose","label":"로즈","hex":"#C96E7B"}]}'::jsonb
  ),
  (
    'seed-filter-peach-clean',
    'trend',
    '피치 클린 글로우',
    '따뜻한 피치 베이스와 깔끔한 눈매 포인트',
    '보통',
    '{"facePartIds":["base","eye","cheek"],"colorOptions":[{"id":"peach","label":"피치","hex":"#E99A83"}]}'::jsonb
  )
on conflict (external_key) do update
set category = excluded.category,
    title = excluded.title,
    subtitle = excluded.subtitle,
    intensity_label = excluded.intensity_label,
    filter_payload = excluded.filter_payload;

insert into home_hero_banners (
  title,
  eyebrow,
  description,
  cta_label,
  cta_target,
  is_active,
  sort_order
)
select
  '오늘의 메이크업 밸런스 찾기',
  'AI AR 메이크업 가이드',
  '얼굴 사진을 촬영하거나 업로드하면 분석, 필터, 추천 제품을 한 흐름에서 확인할 수 있어요.',
  '분석 시작',
  'FaceCapture',
  true,
  0
where not exists (
  select 1 from home_hero_banners where title = '오늘의 메이크업 밸런스 찾기'
);

insert into home_notices (
  hero_banner_id,
  title,
  description,
  is_active,
  sort_order
)
select
  h.id,
  '구글 로그인을 사용할 수 있어요',
  '현재 Cognito 구글 로그인을 먼저 연결했고, 카카오와 네이버 로그인은 확장 예정이에요.',
  true,
  0
from home_hero_banners h
where h.title = '오늘의 메이크업 밸런스 찾기'
  and not exists (
    select 1 from home_notices n
    where n.hero_banner_id = h.id
      and n.title = '구글 로그인을 사용할 수 있어요'
  );

insert into home_filter_store_items (
  title,
  description,
  category,
  ar_filter_id,
  target_payload,
  is_active,
  sort_order
)
select
  f.title,
  f.subtitle,
  'AR Filter',
  f.id,
  jsonb_build_object('route', 'ARFilter', 'filterId', f.id),
  true,
  row_number() over (order by f.created_at)
from ar_filters f
where f.external_key in ('seed-filter-clear-rose', 'seed-filter-peach-clean')
  and not exists (
    select 1 from home_filter_store_items item
    where item.ar_filter_id = f.id
  );

insert into home_recommended_looks (
  title,
  description,
  display_date,
  target_payload,
  is_active,
  sort_order
)
select
  '로즈 뉴트럴 데일리 룩',
  '추천 상품과 AR 필터 카탈로그에 맞춘 부드러운 로즈 밸런스 룩',
  current_date,
  '{"route":"MakeupLookList"}'::jsonb,
  true,
  0
where not exists (
  select 1 from home_recommended_looks where title = '로즈 뉴트럴 데일리 룩'
);
