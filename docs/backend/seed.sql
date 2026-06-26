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
    'AURA Lab',
    'Rose Veil Tint',
    'Rose Veil',
    'lip',
    18000,
    array['daily', 'rose', 'glow'],
    array['#C96E7B', '#E8A3AE'],
    '{"finish":"glow","matchRate":92}'::jsonb
  ),
  (
    'seed-cheek-peach-dusk',
    'AURA Lab',
    'Peach Dusk Blush',
    'Peach Dusk',
    'cheek',
    22000,
    array['peach', 'soft', 'warm'],
    array['#E99A83', '#F3B7A5'],
    '{"finish":"sheer","matchRate":88}'::jsonb
  ),
  (
    'seed-shadow-rose-neutral',
    'AURA Lab',
    'Rose Neutral Eye Palette',
    'Rose Neutral',
    'shadow',
    32000,
    array['neutral', 'rose', 'palette'],
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
    'Clear Rose Balance',
    'Soft rose lip and cheek guide for daily makeup.',
    'Soft',
    '{"facePartIds":["lip","cheek"],"colorOptions":[{"id":"rose","label":"Rose","hex":"#C96E7B"}]}'::jsonb
  ),
  (
    'seed-filter-peach-clean',
    'trend',
    'Peach Clean Glow',
    'Warm peach base with clean eye accents.',
    'Medium',
    '{"facePartIds":["base","eye","cheek"],"colorOptions":[{"id":"peach","label":"Peach","hex":"#E99A83"}]}'::jsonb
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
  'Find your daily makeup balance',
  'AI AR Makeup Guide',
  'Upload or capture a face photo and keep analysis, filters, and recommendations in one flow.',
  'Start analysis',
  'FaceCapture',
  true,
  0
where not exists (
  select 1 from home_hero_banners where title = 'Find your daily makeup balance'
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
  'Google login enabled',
  'Use Cognito Google login first; Kakao and Naver remain extension targets.',
  true,
  0
from home_hero_banners h
where h.title = 'Find your daily makeup balance'
  and not exists (
    select 1 from home_notices n
    where n.hero_banner_id = h.id
      and n.title = 'Google login enabled'
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
  'Rose neutral daily look',
  'A soft rose balance matched with the seeded product and AR filter catalog.',
  current_date,
  '{"route":"MakeupLookList"}'::jsonb,
  true,
  0
where not exists (
  select 1 from home_recommended_looks where title = 'Rose neutral daily look'
);
