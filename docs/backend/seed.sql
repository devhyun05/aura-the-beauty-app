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

with seed_recommended_makeup_filters (
  external_key,
  category,
  title,
  subtitle,
  intensity_label,
  filter_payload
) as (
values
  ('filter-clean-smoky-city', 'recommended', '클린 스모키', '쿨 브라운과 그레이 베이지로 또렷하게 정돈한 도시형 스모키 룩', '96% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"차가운 도시의","displayTitle":"클린 스모키","description":"쿨 브라운과 그레이 베이지로 또렷하게 정돈한 도시형 스모키 룩","categoryTags":["smoky","brown","trend"],"keywords":["쿨","스모키","브라운","그레이","차도녀"],"embeddingVector":[0.92,0.18,0.22,0.78,0.26],"matchScore":96,"sortOrder":0}$filter_json$::jsonb),
  ('filter-gyaru-glow', 'trend', '갸루 글로우', '샴페인 펄과 코랄 글로스로 선명도를 살린 하이틴 글로우 룩', '94% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"빛나는 거리의","displayTitle":"갸루 글로우","description":"샴페인 펄과 코랄 글로스로 선명도를 살린 하이틴 글로우 룩","categoryTags":["glow","trend","unique"],"keywords":["글로우","코랄","펄","라이너","갸루"],"embeddingVector":[0.38,0.7,0.6,0.36,0.96],"matchScore":94,"sortOrder":1}$filter_json$::jsonb),
  ('filter-kuro-gyaru-bronze', 'trend', '쿠로갸루 무드', '브론즈 베이스와 골드 하이라이트로 건강한 광을 강조한 룩', '90% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"브론즈 태닝의","displayTitle":"쿠로갸루 무드","description":"브론즈 베이스와 골드 하이라이트로 건강한 광을 강조한 룩","categoryTags":["glow","brown","unique"],"keywords":["브론즈","골드","태닝","누드","갸루"],"embeddingVector":[0.2,0.96,0.32,0.82,0.86],"matchScore":90,"sortOrder":2}$filter_json$::jsonb),
  ('filter-one-gyaru-rose', 'popular', '오네갸루 로즈', '로즈 브라운 음영과 새틴 립으로 단정하게 깊이를 만든 룩', '91% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"단정한 어른빛","displayTitle":"오네갸루 로즈","description":"로즈 브라운 음영과 새틴 립으로 단정하게 깊이를 만든 룩","categoryTags":["brown","trend"],"keywords":["로즈","브라운","새틴","소프트 래쉬","성숙"],"embeddingVector":[0.48,0.62,0.58,0.8,0.44],"matchScore":91,"sortOrder":3}$filter_json$::jsonb),
  ('filter-water-glow-clean', 'personal_color', '물광 클린', '클리어 베이스와 젤리 핑크로 투명한 수분감을 만든 룩', '95% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"하얀 조명의","displayTitle":"물광 클린","description":"클리어 베이스와 젤리 핑크로 투명한 수분감을 만든 룩","categoryTags":["glow","pink"],"keywords":["물광","클린","젤리핑크","투명","베이스"],"embeddingVector":[0.72,0.34,0.78,0.2,0.98],"matchScore":95,"sortOrder":4}$filter_json$::jsonb),
  ('filter-glass-skin-nude', 'personal_color', '윤광 누디', '누드 베이지와 피부광을 중심으로 얇게 입체감을 준 룩', '92% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"유리알 피부의","displayTitle":"윤광 누디","description":"누드 베이지와 피부광을 중심으로 얇게 입체감을 준 룩","categoryTags":["glow","brown"],"keywords":["윤광","누디","베이지","컨투어","글래스"],"embeddingVector":[0.58,0.55,0.24,0.68,0.94],"matchScore":92,"sortOrder":5}$filter_json$::jsonb),
  ('filter-milky-strawberry-pink', 'popular', '밀키 핑크', '밀키 핑크와 라이트 모브로 말랑한 혈색을 얹은 룩', '93% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"딸기 우유빛","displayTitle":"밀키 핑크","description":"밀키 핑크와 라이트 모브로 말랑한 혈색을 얹은 룩","categoryTags":["pink","trend"],"keywords":["딸기우유","핑크","코켓","발레코어","블러셔"],"embeddingVector":[0.5,0.42,0.98,0.18,0.7],"matchScore":93,"sortOrder":6}$filter_json$::jsonb),
  ('filter-mori-girl-natural', 'personal_color', '모리걸 내추럴', '세이지 브라운과 살구 베이지로 담백하게 정돈한 내추럴 룩', '86% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"숲속 오후의","displayTitle":"모리걸 내추럴","description":"세이지 브라운과 살구 베이지로 담백하게 정돈한 내추럴 룩","categoryTags":["brown","unique"],"keywords":["모리걸","내추럴","세이지","살구","소프트매트"],"embeddingVector":[0.42,0.76,0.34,0.72,0.38],"matchScore":86,"sortOrder":7}$filter_json$::jsonb),
  ('filter-dolly-larme', 'trend', '돌리 라르무', '핑크 베이지와 언더 포인트로 또렷한 눈매를 만든 글로시 룩', '89% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"인형 같은 시선의","displayTitle":"돌리 라르무","description":"핑크 베이지와 언더 포인트로 또렷한 눈매를 만든 글로시 룩","categoryTags":["pink","trend","unique"],"keywords":["돌리","라르무","핑크베이지","언더","글로시"],"embeddingVector":[0.54,0.35,0.9,0.28,0.82],"matchScore":89,"sortOrder":8}$filter_json$::jsonb),
  ('filter-igari-blush', 'popular', '이가리 블러시', '애프리콧 레드 치크와 촉촉한 립으로 생기를 높인 룩', '88% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"붉게 번진","displayTitle":"이가리 블러시","description":"애프리콧 레드 치크와 촉촉한 립으로 생기를 높인 룩","categoryTags":["red","glow","trend"],"keywords":["이가리","블러시","코랄","애프리콧","촉촉한립"],"embeddingVector":[0.46,0.74,0.76,0.24,0.78],"matchScore":88,"sortOrder":9}$filter_json$::jsonb),
  ('filter-juice-coral', 'popular', '자몽 코랄', '자몽 코랄과 투명 글로스로 밝은 과즙감을 만든 룩', '87% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"과즙 터지는","displayTitle":"자몽 코랄","description":"자몽 코랄과 투명 글로스로 밝은 과즙감을 만든 룩","categoryTags":["glow","trend"],"keywords":["과즙","자몽","코랄","투명글로스","밝은치크"],"embeddingVector":[0.36,0.9,0.65,0.18,0.9],"matchScore":87,"sortOrder":10}$filter_json$::jsonb),
  ('filter-douyin-pink', 'trend', '도우인 핑크', '핑크 펄과 애교살 글리터 포인트로 반짝이는 눈매를 만든 룩', '97% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"렌즈광 같은","displayTitle":"도우인 핑크","description":"핑크 펄과 애교살 글리터 포인트로 반짝이는 눈매를 만든 룩","categoryTags":["pink","glow","trend"],"keywords":["도우인","핑크펄","애교살","글리터","왕홍"],"embeddingVector":[0.68,0.38,0.96,0.2,0.94],"matchScore":97,"sortOrder":11}$filter_json$::jsonb),
  ('filter-latte-brown', 'recommended', '라떼 브라운', '밀크 브라운과 토스트 베이지로 음영을 부드럽게 쌓은 룩', '85% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"따뜻한 카페의","displayTitle":"라떼 브라운","description":"밀크 브라운과 토스트 베이지로 음영을 부드럽게 쌓은 룩","categoryTags":["brown"],"keywords":["라떼","브라운","베이지","음영","컨투어"],"embeddingVector":[0.28,0.88,0.2,0.94,0.5],"matchScore":85,"sortOrder":12}$filter_json$::jsonb),
  ('filter-office-siren', 'recommended', '오피스 사이렌', '쿨 토프와 얇은 아이라인으로 세련된 긴장감을 만든 룩', '93% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"날카로운 출근길","displayTitle":"오피스 사이렌","description":"쿨 토프와 얇은 아이라인으로 세련된 긴장감을 만든 룩","categoryTags":["smoky","brown","trend"],"keywords":["오피스","쿨토프","얇은아이라인","뮤트립","슬릭"],"embeddingVector":[0.88,0.22,0.25,0.82,0.32],"matchScore":93,"sortOrder":13}$filter_json$::jsonb),
  ('filter-soft-goth', 'trend', '소프트 고스', '플럼 브라운 스모키와 딥 로즈 립으로 부드러운 어둠을 얹은 룩', '84% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"희미한 밤의","displayTitle":"소프트 고스","description":"플럼 브라운 스모키와 딥 로즈 립으로 부드러운 어둠을 얹은 룩","categoryTags":["smoky","brown","unique"],"keywords":["소프트고스","그런지","플럼","스모키","딥로즈"],"embeddingVector":[0.82,0.28,0.48,0.86,0.34],"matchScore":84,"sortOrder":14}$filter_json$::jsonb),
  ('filter-wanghong-glass-pink', 'trend', '왕홍 레드 글래스', '레드 음영과 루비 글로스 립으로 화면 속 선명도를 높인 왕홍 무드 룩', '98% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"렌즈광이 번지는","displayTitle":"왕홍 레드 글래스","description":"레드 음영과 루비 글로스 립으로 화면 속 선명도를 높인 왕홍 무드 룩","categoryTags":["red","glow","trend"],"keywords":["왕홍","도우인","레드","글로우","트렌드"],"embeddingVector":[0.74,0.4,0.98,0.24,0.98],"matchScore":98,"sortOrder":15}$filter_json$::jsonb),
  ('filter-cloud-blur-matte', 'popular', '클라우드 블러', '블러 베이스와 벨벳 로즈 립으로 부드럽게 초점을 맞춘 룩', '92% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"구름처럼 흐린","displayTitle":"클라우드 블러","description":"블러 베이스와 벨벳 로즈 립으로 부드럽게 초점을 맞춘 룩","categoryTags":["pink","brown","trend"],"keywords":["블러","소프트매트","핑크","베이지","트렌드"],"embeddingVector":[0.62,0.54,0.78,0.5,0.68],"matchScore":92,"sortOrder":16}$filter_json$::jsonb),
  ('filter-aura-blush-lift', 'popular', '아우라 블러시', '높은 위치의 워터 로즈 치크와 쉬어 립으로 생기를 끌어올린 룩', '91% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"볼 위로 피어난","displayTitle":"아우라 블러시","description":"높은 위치의 워터 로즈 치크와 쉬어 립으로 생기를 끌어올린 룩","categoryTags":["pink","glow","trend"],"keywords":["블러셔","핑크","글로우","로즈","트렌드"],"embeddingVector":[0.48,0.66,0.88,0.18,0.84],"matchScore":91,"sortOrder":17}$filter_json$::jsonb),
  ('filter-plum-syrup-gloss', 'trend', '플럼 시럽 글로스', '투명한 플럼 립과 모브 음영으로 촉촉하게 깊이를 만든 룩', '90% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"시럽처럼 맺힌","displayTitle":"플럼 시럽 글로스","description":"투명한 플럼 립과 모브 음영으로 촉촉하게 깊이를 만든 룩","categoryTags":["glow","smoky","trend"],"keywords":["플럼","글로스","스모키","글로우","트렌드"],"embeddingVector":[0.78,0.32,0.58,0.72,0.76],"matchScore":90,"sortOrder":18}$filter_json$::jsonb),
  ('filter-chrome-pearl-eye', 'trend', '크롬 펄 아이', '실버 펄 아이와 누드 글로스로 깨끗한 반짝임을 더한 룩', '89% match', $filter_json${"kind":"recommendedMakeupFilter","headline":"빛 조각 같은","displayTitle":"크롬 펄 아이","description":"실버 펄 아이와 누드 글로스로 깨끗한 반짝임을 더한 룩","categoryTags":["glow","trend","unique"],"keywords":["크롬","펄","글로우","글리터","트렌드"],"embeddingVector":[0.66,0.36,0.72,0.44,0.96],"matchScore":89,"sortOrder":19}$filter_json$::jsonb)
)
insert into ar_filters (
  external_key,
  category,
  title,
  subtitle,
  intensity_label,
  filter_payload,
  is_public
)
select
  f.external_key,
  f.category::filter_category,
  f.title,
  f.subtitle,
  f.intensity_label,
  f.filter_payload,
  true
from seed_recommended_makeup_filters f
on conflict (external_key) do update
set category = excluded.category,
    title = excluded.title,
    subtitle = excluded.subtitle,
    intensity_label = excluded.intensity_label,
    preview_media_id = null,
    filter_payload = excluded.filter_payload,
    is_public = true,
    updated_at = now();

delete from media_assets
where media_kind = 'makeup_filter_preview'
  and source = 'seed'
  and object_key like 'uploads/makeup-filters/%';

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
