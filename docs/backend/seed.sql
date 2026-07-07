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

-- -----------------------------------------------------------------------------
-- Consulting seed
-- -----------------------------------------------------------------------------
insert into consulting_categories (id, title, description, icon, sort_order) values
  ('personalColor', '퍼스널컬러 진단', '내 톤이 헷갈릴 때', 'palette', 0),
  ('makeupClinic', '메이크업 클리닉', 'AI 피드백 심화 상담', 'brush', 1),
  ('lipColor', '패션 · 골격 진단', '어울리는 옷 스타일', 'sparkles', 2),
  ('hairStyle', '헤어 · 스타일', '이미지 전체 코디', 'scissors', 3)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true;

insert into consulting_experts (
  id, name, title, signature_line, initials, avatar_tone, career_years, rating,
  review_count, session_count, rebook_rate, response_minutes, intro, availability_note,
  tags, certifications, image_url, studio_name, sort_order
) values
  (
    'exp_sea', '김세아', '메이크업 아티스트',
    '진단으로 끝나지 않는, 손에 잡히는 메이크업 처방', '세아', 'rose', 12, 4.9,
    128, 1024, 87, 30,
    'AI 진단 결과를 함께 보며 톤을 확정하고, 지금 화장에서 딱 한 가지만 바꿔도 달라지는 포인트를 짚어드려요. 상담이 끝나면 바로 따라 할 수 있는 단계별 처방 노트를 남겨드립니다.',
    '평일 저녁 · 주말 오전 상담 가능',
    array['여름 쿨 전문', '데일리 메이크업', '웨딩', '퍼스널컬러 처방']::text[],
    array['퍼스널컬러 컨설턴트 1급', '메이크업 국가자격 2급', '색채심리 지도사']::text[],
    'https://d3t1pbvtir1lj.cloudfront.net/uploads/optimized/consulting/expert-sea.jpg',
    'AURA 성수 메이크업 스튜디오',
    0
  ),
  (
    'exp_doa', '정도아', '퍼스널컬러 컬러리스트',
    '조명이 달라져도 흔들리지 않는 정밀 톤 진단', '도아', 'mauve', 8, 4.9,
    210, 1560, 91, 15,
    '화상 카메라의 조명 편차까지 고려해 여러 각도로 확인하며 톤을 진단해요. 진단 후에는 나만의 베스트 컬러 팔레트와 피해야 할 컬러 리스트를 함께 정리해 드려요.',
    '평일 오후 · 저녁 상담 가능',
    array['사계절 세분 진단', '컬러 코디', '드레이핑', '베스트 컬러 팔레트']::text[],
    array['컬러리스트 기사', '이미지 컨설팅 전문가']::text[],
    'https://d3t1pbvtir1lj.cloudfront.net/uploads/optimized/consulting/expert-doa.jpg',
    'AURA 컬러 랩',
    1
  ),
  (
    'exp_lian', '박리안', '패션 · 이미지 디렉터',
    '얼굴형과 톤을 함께 읽는 스타일 설계', '리안', 'sand', 9, 4.8,
    96, 720, 82, 60,
    '얼굴형과 골격, 퍼스널 톤을 함께 고려해 어울리는 옷 실루엣과 헤어 방향을 제안해요. 쇼핑할 때 바로 참고할 수 있는 스타일 가이드를 만들어 드립니다.',
    '화 · 목 저녁, 주말 상담 가능',
    array['골격 진단', '패션 스타일링', '얼굴형 분석']::text[],
    array['미용사(일반) 국가자격', '퍼스널 이미지 코치']::text[],
    'https://d3t1pbvtir1lj.cloudfront.net/uploads/optimized/consulting/expert-lian.jpg',
    'AURA 청담 이미지 살롱',
    2
  )
on conflict (id) do update set
  name = excluded.name,
  title = excluded.title,
  signature_line = excluded.signature_line,
  initials = excluded.initials,
  avatar_tone = excluded.avatar_tone,
  career_years = excluded.career_years,
  rating = excluded.rating,
  review_count = excluded.review_count,
  session_count = excluded.session_count,
  rebook_rate = excluded.rebook_rate,
  response_minutes = excluded.response_minutes,
  intro = excluded.intro,
  availability_note = excluded.availability_note,
  tags = excluded.tags,
  certifications = excluded.certifications,
  image_url = excluded.image_url,
  studio_name = excluded.studio_name,
  sort_order = excluded.sort_order,
  is_active = true;

delete from consulting_expert_categories
where category_id = 'lipColor' and expert_id in ('exp_sea', 'exp_doa');

insert into consulting_expert_categories (expert_id, category_id) values
  ('exp_sea', 'personalColor'),
  ('exp_sea', 'makeupClinic'),
  ('exp_doa', 'personalColor'),
  ('exp_lian', 'lipColor'),
  ('exp_lian', 'hairStyle'),
  ('exp_lian', 'makeupClinic')
on conflict (expert_id, category_id) do nothing;

delete from consulting_expert_durations
where expert_id in ('exp_sea', 'exp_doa', 'exp_lian') and code = 'd15';

insert into consulting_expert_durations (expert_id, code, label, minutes, price, description, recommended, sort_order) values
  ('exp_sea', 'd30', '30분', 30, 19000, '핵심 진단 + 우선 교정', true, 0),
  ('exp_sea', 'd60', '1시간', 60, 34000, '진단 + 실습 + 제품 루틴', false, 1),
  ('exp_doa', 'd30', '30분', 30, 22000, '정밀 진단 + 컬러 팔레트', true, 0),
  ('exp_doa', 'd60', '1시간', 60, 39000, '정밀 진단 + 쇼핑 가이드', false, 1),
  ('exp_lian', 'd30', '30분', 30, 18000, '골격 진단 + 스타일 방향', true, 0),
  ('exp_lian', 'd60', '1시간', 60, 32000, '골격 + 헤어 + 쇼핑 가이드', false, 1)
on conflict (expert_id, code) do update set
  label = excluded.label,
  minutes = excluded.minutes,
  price = excluded.price,
  description = excluded.description,
  recommended = excluded.recommended,
  sort_order = excluded.sort_order;

insert into consulting_expert_career (expert_id, code, period, role, sort_order) values
  ('exp_sea', 'c1', '2020 — 현재', 'AURA 파트너 수석 컨설턴트', 0),
  ('exp_sea', 'c2', '2016 — 2020', '뷰티 아카데미 메이크업 강사', 1),
  ('exp_sea', 'c3', '2013 — 2016', '방송 · 화보 메이크업 아티스트', 2),
  ('exp_doa', 'c1', '2021 — 현재', 'AURA 파트너 컬러리스트', 0),
  ('exp_doa', 'c2', '2018 — 2021', '백화점 뷰티 브랜드 컬러 컨설턴트', 1),
  ('exp_lian', 'c1', '2019 — 현재', '청담 헤어살롱 원장', 0),
  ('exp_lian', 'c2', '2015 — 2019', '헤어 디자이너 · 이미지 코치', 1)
on conflict (expert_id, code) do update set
  period = excluded.period,
  role = excluded.role,
  sort_order = excluded.sort_order;

insert into consulting_expert_reviews (id, expert_id, author, category, body, rating, date_label) values
  ('rv_sea_1', 'exp_sea', '지은*', '퍼스널컬러 진단', '퍼스널컬러가 계속 애매했는데, 진단부터 어울리는 화장법까지 한 번에 잡아주셨어요. 처방 노트 덕분에 다음 날 바로 적용했어요.', 5, '6월 28일'),
  ('rv_sea_2', 'exp_sea', '수민*', '메이크업 클리닉', '블러셔가 붉게 뜨는 이유가 색이 아니라 위치였다는 걸 알려주셔서 놀랐어요. 30분이 아깝지 않았습니다.', 5, '6월 21일'),
  ('rv_sea_3', 'exp_sea', '하영*', '메이크업 클리닉', '평소 화장이 답답해 보이는 이유를 순서대로 잡아주셔서 다음 날 바로 따라 했어요.', 4, '6월 12일'),
  ('rv_doa_1', 'exp_doa', '현지*', '퍼스널컬러 진단', '앱 진단이랑 결과가 거의 같았는데, 왜 그런지 이유까지 설명해 주셔서 확신이 생겼어요.', 5, '7월 1일'),
  ('rv_doa_2', 'exp_doa', '보라*', '퍼스널컬러 진단', '피해야 할 컬러 리스트가 진짜 유용해요. 옷 살 때도 계속 보게 돼요.', 5, '6월 25일'),
  ('rv_lian_1', 'exp_lian', '유나*', '패션 · 골격 진단', '상체 골격에 맞는 재킷 길이와 네크라인 기준을 잡아주셔서 옷 고르기가 훨씬 쉬워졌어요.', 5, '6월 30일')
on conflict (id) do update set
  author = excluded.author,
  category = excluded.category,
  body = excluded.body,
  rating = excluded.rating,
  date_label = excluded.date_label;

insert into consulting_membership_plans (
  id, name, tagline, price_per_month, original_price_per_month, benefits, badge, highlight, sort_order
) values
  (
    'plan_lite', '라이트', '가볍게 시작하는 뷰티 케어', 9900, null,
    array['모든 상담 10% 상시 할인', '월 1회 포토 질문권', '상담 요약 리포트 무제한 보관']::text[],
    null, false, 0
  ),
  (
    'plan_standard', '스탠다드', '가장 많이 선택하는 플랜', 14900, 19900,
    array['모든 상담 20% 상시 할인', '월 1회 30분 화상 체크인 포함', '전문가 우선 예약', '신제품 샘플 박스 분기 1회']::text[],
    '인기', true, 1
  ),
  (
    'plan_premium', '프리미엄', '나만의 뷰티 디렉터', 29900, null,
    array['모든 상담 30% 상시 할인', '월 1회 30분 화상 상담 포함', '전담 전문가 지정', '시즌별 퍼스널 스타일 리포트']::text[],
    null, false, 2
  )
on conflict (id) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  price_per_month = excluded.price_per_month,
  original_price_per_month = excluded.original_price_per_month,
  benefits = excluded.benefits,
  badge = excluded.badge,
  highlight = excluded.highlight,
  sort_order = excluded.sort_order,
  is_active = true;
