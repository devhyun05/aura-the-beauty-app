import json

from app.db.session import Database
from app.services.makeup_keyword_question_templates import (
  CURATED_KEYWORD_QUESTION_TEMPLATES,
  MAKEUP_KEYWORD_QUESTION_TEMPLATE_SCHEMA_SQL,
  QUESTION_TEMPLATE_PROMPT_VERSION,
  QUESTION_TEMPLATE_VERSION,
)


MAKEUP_RECOMMENDATION_SCHEMA_SQL = r"""
alter table analysis_reports add column if not exists deleted_at timestamptz;
create index if not exists idx_analysis_reports_user_active_analyzed
  on analysis_reports (user_id, analyzed_at desc) where deleted_at is null;

create table if not exists makeup_scenario_library (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  normalized_text text not null,
  seed_prompt text not null,
  tags jsonb not null default '[]'::jsonb,
  source text not null default 'ai',
  model_id text,
  prompt_version text not null default 'makeup-scenario-v2',
  status text not null default 'active',
  usage_count integer not null default 0,
  last_served_at timestamptz,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_makeup_scenario_library_source check (source in ('ai', 'curated')),
  constraint chk_makeup_scenario_library_status check (status in ('active', 'disabled')),
  constraint chk_makeup_scenario_library_usage_count check (usage_count >= 0),
  constraint chk_makeup_scenario_library_text_length check (char_length(text) between 1 and 60),
  constraint chk_makeup_scenario_library_seed_prompt_length check (char_length(seed_prompt) between 1 and 240)
);

alter table makeup_scenario_library add column if not exists last_served_at timestamptz;
alter table makeup_scenario_library add column if not exists keyword_kind text not null default 'legacy_scenario';
alter table makeup_scenario_library add column if not exists source_name text;
alter table makeup_scenario_library add column if not exists source_url text;
alter table makeup_scenario_library add column if not exists source_published_at timestamptz;
alter table makeup_scenario_library add column if not exists evidence_summary text;
alter table makeup_scenario_library add column if not exists market_scope text;
alter table makeup_scenario_library add column if not exists trend_score numeric(5,4);
alter table makeup_scenario_library add column if not exists confidence text;
alter table makeup_scenario_library add column if not exists review_status text not null default 'draft';
alter table makeup_scenario_library add column if not exists locale text not null default 'ko-KR';
alter table makeup_scenario_library add column if not exists as_of timestamptz;
alter table makeup_scenario_library add column if not exists valid_from timestamptz;
alter table makeup_scenario_library add column if not exists expires_at timestamptz;

-- V2 uniqueness is scoped by locale and market. Remove the legacy global
-- normalized_text UNIQUE regardless of its auto-generated constraint name.
do $$
declare legacy_constraint_name text;
begin
  for legacy_constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.makeup_scenario_library'::regclass
      and constraint_row.contype = 'u'
      and constraint_row.conkey = array[
        (
          select attribute.attnum
          from pg_attribute attribute
          where attribute.attrelid = constraint_row.conrelid
            and attribute.attname = 'normalized_text'
            and not attribute.attisdropped
        )
      ]::smallint[]
  loop
    execute format(
      'alter table public.makeup_scenario_library drop constraint %I',
      legacy_constraint_name
    );
  end loop;
end $$;

-- A legacy deployment may have created the same global uniqueness as a
-- standalone index with an arbitrary name. Drop only an unqualified,
-- non-partial, single-column normalized_text unique index; never the V2
-- locale/market composite index or a constraint-backed index.
do $$
declare legacy_index_name text;
begin
  for legacy_index_name in
    select index_class.relname
    from pg_index index_row
    join pg_class index_class on index_class.oid = index_row.indexrelid
    join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    where index_row.indrelid = 'public.makeup_scenario_library'::regclass
      and index_namespace.nspname = 'public'
      and index_row.indisunique
      and index_row.indnkeyatts = 1
      and index_row.indexprs is null
      and index_row.indpred is null
      and index_row.indkey[0] = (
        select attribute.attnum
        from pg_attribute attribute
        where attribute.attrelid = index_row.indrelid
          and attribute.attname = 'normalized_text'
          and not attribute.attisdropped
      )
      and not exists (
        select 1
        from pg_constraint constraint_row
        where constraint_row.conindid = index_row.indexrelid
      )
  loop
    execute format('drop index if exists public.%I', legacy_index_name);
  end loop;
end $$;

alter table makeup_scenario_library drop constraint if exists chk_makeup_scenario_library_keyword_kind;
alter table makeup_scenario_library add constraint chk_makeup_scenario_library_keyword_kind
  check (keyword_kind in ('curated', 'steady', 'trend', 'legacy_scenario'));
alter table makeup_scenario_library drop constraint if exists chk_makeup_scenario_library_review_status;
alter table makeup_scenario_library add constraint chk_makeup_scenario_library_review_status
  check (review_status in ('draft', 'approved', 'rejected'));
alter table makeup_scenario_library drop constraint if exists chk_makeup_scenario_library_confidence;
alter table makeup_scenario_library add constraint chk_makeup_scenario_library_confidence
  check (confidence is null or confidence in ('A', 'B'));
alter table makeup_scenario_library drop constraint if exists chk_makeup_scenario_library_trend_score;
alter table makeup_scenario_library add constraint chk_makeup_scenario_library_trend_score
  check (trend_score is null or trend_score between 0 and 1);
alter table makeup_scenario_library drop constraint if exists chk_makeup_scenario_library_trend_evidence;
alter table makeup_scenario_library add constraint chk_makeup_scenario_library_trend_evidence check (
  keyword_kind <> 'trend'
  or (
    source_name is not null
    and source_url is not null
    and source_published_at is not null
    and market_scope is not null
    and as_of is not null
    and expires_at is not null
  )
);

create index if not exists idx_makeup_scenario_library_active_usage
  on makeup_scenario_library (status, usage_count, created_at desc);
create index if not exists idx_makeup_scenario_library_replacement
  on makeup_scenario_library (source, status, usage_count, last_served_at, created_at);
create index if not exists idx_makeup_scenario_library_discovery
  on makeup_scenario_library (locale, keyword_kind, review_status, status, expires_at);
create unique index if not exists uq_makeup_scenario_library_locale_scope
  on makeup_scenario_library (normalized_text, locale, coalesce(market_scope, ''));

create table if not exists makeup_situations (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text not null,
  image_asset_key text,
  icon_key text,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_makeup_situations_key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint chk_makeup_situations_status check (status in ('active', 'disabled')),
  constraint chk_makeup_situations_sort_order check (sort_order >= 0)
);
create index if not exists idx_makeup_situations_active_sort
  on makeup_situations (status, sort_order, key);

insert into makeup_situations as current
  (id, key, label, description, image_asset_key, icon_key, sort_order, status)
values
  ('1f4f03a6-1e0e-51cd-8f2b-a7d5c61c8d66'::uuid, 'daily', '일상', '출근, 등교, 가벼운 약속과 주말 외출', 'daily', 'sun', 10, 'active'),
  ('3b815ca8-77ec-577c-8342-38554b0a59cf'::uuid, 'work', '출근·면접', '상위 상황 개편으로 특별한 날에 통합', 'work', 'briefcase', 60, 'disabled'),
  ('09d48540-2b35-54fd-ba23-8568dc820118'::uuid, 'date', '데이트', '상위 상황 개편으로 특별한 날에 통합', 'date', 'heart', 70, 'disabled'),
  ('875e3912-5cb0-546a-8393-b8880bcc26e4'::uuid, 'social', '모임·파티', '상위 상황 개편으로 특별한 날과 독특한 날에 통합', 'social', 'sparkles', 80, 'disabled'),
  ('4f83dc3c-dec5-58ee-b613-fbb23d94c3f1'::uuid, 'formal_event', '특별한 날', '데이트, 중요한 일정과 기념일', 'formal-event', 'gem', 20, 'active'),
  ('14d89a7a-c3dc-56eb-9ea1-24a1638e8bcd'::uuid, 'travel_outdoor', '여행·야외', '상위 상황 개편으로 일상과 특별한 날에 통합', 'travel-outdoor', 'plane', 90, 'disabled'),
  ('fd515514-5a42-5906-9b40-e5b470aef233'::uuid, 'camera_content', '촬영', '증명사진부터 프로필과 영상까지', 'camera-content', 'camera', 30, 'active'),
  ('0354d00a-8ff7-55e1-863c-738d85513135'::uuid, 'festival_performance', '독특한 날', '공연, 테마 파티와 색다른 이벤트', 'festival-performance', 'music', 40, 'active'),
  ('587aa9fd-8c4c-5034-9c90-e982ec1e8903'::uuid, 'custom', '직접 입력', '원하는 장면과 제약을 직접 설명', null, 'edit', 50, 'active')
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  image_asset_key = excluded.image_asset_key,
  icon_key = excluded.icon_key,
  sort_order = excluded.sort_order,
  status = excluded.status
where (current.label, current.description, current.image_asset_key, current.icon_key, current.sort_order, current.status)
  is distinct from
  (excluded.label, excluded.description, excluded.image_asset_key, excluded.icon_key, excluded.sort_order, excluded.status);

with source_registry(source_key, source_name, source_url, published_at, evidence, as_of, expires_at) as (
  values
    ('K_BAZAAR', 'Harper''s Bazaar', 'https://www.harpersbazaar.com/beauty/makeup/g69969668/2026-korean-makeup-trends/', '2026-01-16'::timestamptz, '2026 서울 K-뷰티 현장 취재', '2026-07-16'::timestamptz, '2026-10-14'::timestamptz),
    ('K_VOGUE', 'Vogue', 'https://www.vogue.com/article/k-beauty-makeup-trends', '2026-01-30'::timestamptz, '2026 K-뷰티 메이크업 흐름', '2026-07-16'::timestamptz, '2026-10-14'::timestamptz),
    ('G_ALLURE', 'Allure', 'https://www.allure.com/story/summer-makeup-trends-2026', '2026-05-20'::timestamptz, 'Summer 2026 메이크업 트렌드', '2026-07-16'::timestamptz, '2026-09-30'::timestamptz),
    ('G_ELLE', 'ELLE', 'https://www.elle.com/beauty/makeup-skin-care/a70607092/spring-2026-best-makeup-trends/', '2026-03-04'::timestamptz, 'Spring 2026 메이크업 트렌드', '2026-07-16'::timestamptz, '2026-09-30'::timestamptz),
    ('G_PINTEREST', 'Pinterest', 'https://newsroom.pinterest.com/news/summer-trend-report-2026/', '2026-05-26'::timestamptz, 'Summer 2026 검색 트렌드', '2026-07-16'::timestamptz, '2026-09-30'::timestamptz)
),
keyword_seed(id, text, seed_prompt, keyword_kind, source_key, market_scope, confidence) as (
  values
    ('36224560-13aa-5e42-b3af-3d45a20cf6a0'::uuid, '란제리 메이크업', '피부가 비쳐 보이는 듯 얇고 섬세한 누드 핑크 메이크업', 'trend', 'K_BAZAAR', 'KR', 'A'),
    ('6ca4067c-5569-53f0-b162-c35900295cd1'::uuid, '워터컬러 플러시', '수채화처럼 경계가 번지는 맑은 치크와 얇은 피부 표현', 'trend', 'K_BAZAAR', 'KR', 'A'),
    ('73c4d1e5-65f0-5186-b353-1aa7a4963f62'::uuid, '블러드 소프트 립', '입술 경계를 부드럽게 흐린 차분한 소프트 립', 'steady', null, 'KR', 'A'),
    ('7a06c5cf-ac5d-5c10-afe0-32fd23b4e696'::uuid, '애교살 포인트', '과하지 않은 밝기와 음영으로 또렷하게 만드는 애교살', 'steady', null, 'KR', 'A'),
    ('ee86c671-b471-520d-8d0e-d10cf6edb3bd'::uuid, '5분 톤온톤', '하나의 색조 계열로 빠르게 완성하는 실용적인 메이크업', 'curated', null, 'KR', 'A'),
    ('d7220191-916e-5278-a2c5-8317031a1592'::uuid, '모던 소프트 매트', '건조해 보이지 않는 정돈된 소프트 매트 피부와 색조', 'trend', 'G_ALLURE', 'GLOBAL_SS26', 'A'),
    ('d07c236b-7ac4-50df-a512-35dd5dcb3e7e'::uuid, '시어 스키니멀리즘', '피부 결은 살리고 필요한 부분만 정돈하는 시어 베이스', 'trend', 'G_ELLE', 'GLOBAL_SS26', 'A'),
    ('fbdb5b16-0df1-5ab7-b7dd-3fbb7d2ab3f0'::uuid, '블러드 뮤트 립', '채도를 낮추고 경계를 흐린 단정한 뮤트 립', 'steady', null, 'KR', 'A'),
    ('29ce3ff2-ccf1-5581-863a-a382c402e3f3'::uuid, '뉴트럴 토프 음영', '회갈색 토프로 눈매와 윤곽을 깔끔하게 정돈', 'curated', null, 'KR', 'A'),
    ('16f951f2-1165-51a6-99c0-78072bd106bc'::uuid, '묻어남 적은 립', '회의와 식사 중 유지하기 쉬운 얇은 레이어드 립', 'curated', null, 'KR', 'A'),
    ('51c11f50-67cb-5bfc-ab1e-f8c27521178c'::uuid, '스트로베리 밀크', '우윳빛이 도는 딸기 핑크 치크와 립의 부드러운 조합', 'trend', 'K_BAZAAR', 'KR', 'A'),
    ('7b3460e7-b65f-52a9-a0fc-daea9a72126e'::uuid, '라벤더 글레이즈', '맑은 라벤더 광택을 눈과 입술에 얇게 쌓는 메이크업', 'trend', 'K_BAZAAR', 'KR', 'A'),
    ('f1af0981-13cf-5ab8-ae76-c5cb2adfef32'::uuid, '워터컬러 언더아이 플러시', '눈 아래에서 볼까지 연결되는 투명한 수채화 홍조', 'trend', 'K_VOGUE', 'KR', 'A'),
    ('875c7660-8641-5726-97b8-5fe94e790f34'::uuid, '라커 글로시 립', '유리처럼 선명한 광택과 또렷한 색을 가진 라커 립', 'trend', 'G_ALLURE', 'GLOBAL_SS26', 'A'),
    ('9c8a0a2c-bfdd-550a-8390-05f7f968d4a6'::uuid, '로즈베이지 모노톤', '로즈베이지 한 계열로 눈, 치크, 립을 연결', 'curated', null, 'KR', 'A'),
    ('f80405f3-b047-5d37-9838-4c0d7d6f1ee2'::uuid, '리플렉티브 아이', '빛을 받을 때 선명하게 반사되는 아이 포인트', 'trend', 'G_ALLURE', 'GLOBAL_SS26', 'A'),
    ('b6b7eada-6fd1-5098-91c8-727e73674027'::uuid, '리브드인 스모키', '완벽하게 각 잡지 않고 자연스럽게 번진 스모키 아이', 'trend', 'G_ALLURE', 'GLOBAL_SS26', 'A'),
    ('7c6fb11d-791b-5da7-98a4-d37858aa0ec1'::uuid, '스테이트먼트 립', '하나의 선명한 립을 중심으로 완성하는 메이크업', 'trend', 'G_ELLE', 'GLOBAL_SS26', 'A'),
    ('2f2a0ad1-462a-53e3-9d34-8ca38ce6e3a8'::uuid, '컬러 래시', '블랙 대신 플럼이나 컬러 마스카라로 주는 포인트', 'trend', 'G_ELLE', 'GLOBAL_SS26', 'A'),
    ('11ddc0ec-6db4-51d2-8efa-9a8ad5c4093d'::uuid, '워터라인 라이너', '점막을 따라 선명하게 넣어 눈매를 강조하는 라이너', 'trend', 'G_ALLURE', 'GLOBAL_SS26', 'A'),
    ('77507173-795a-5d77-99bb-092e8d7206e1'::uuid, '미니멀 리플렉티브 포인트', '격식은 유지하며 눈가 한 곳에만 반사광을 더하는 메이크업', 'trend', 'G_ALLURE', 'GLOBAL_SS26', 'B'),
    ('b9060c06-584e-5fb9-829d-b1ffde6edc93'::uuid, '로즈베이지 엘레강스', '사진과 대면 모두 안정적인 로즈베이지 격식 메이크업', 'curated', null, 'KR', 'A'),
    ('918d59a9-0b34-5bf4-9453-5366785afd30'::uuid, '플래시 세이프 롱웨어', '플래시 백탁을 줄이고 오래 유지되는 사진 친화 베이스', 'curated', null, 'KR', 'A'),
    ('4da488c0-3686-56e4-9e65-4039e8ab708c'::uuid, '선키스드 브론즈', '햇빛에 자연스럽게 그을린 듯한 브론즈 톤', 'trend', 'G_ALLURE', 'GLOBAL_SS26', 'B'),
    ('556d1141-ace4-5858-9b05-9f40cf87d7ed'::uuid, '선셋 블러시', '코랄과 테라코타를 해질녘처럼 연결한 블러시', 'trend', 'G_ALLURE', 'GLOBAL_SS26', 'B'),
    ('deca60a5-b5bf-5212-97e6-fbc1292515c9'::uuid, '온더고 글로우', '여행 중 빠르게 덧바를 수 있는 맑은 윤광 포인트', 'trend', 'G_PINTEREST', 'GLOBAL_SS26', 'A'),
    ('6a1bbc76-d8e6-5acb-8b97-27268a6d005c'::uuid, '스웨트프루프 UV 베이스', '자외선과 땀을 고려해 얇게 고정하는 야외 베이스', 'curated', null, 'KR', 'A'),
    ('d66861e7-50c6-5910-b648-7c13c94a37d4'::uuid, '습도 대응 미니멀', '습한 날 무너짐을 줄이도록 레이어를 줄인 메이크업', 'curated', null, 'KR', 'A'),
    ('31cfc02a-7203-589f-a2be-c9872a3e815b'::uuid, '하이 블러시', '광대 위쪽에 올려 카메라에서 윤곽을 살리는 블러시', 'trend', 'G_ALLURE', 'GLOBAL_SS26', 'A'),
    ('11d5e282-8c78-5394-a591-117ba5ddd4bc'::uuid, '이너코너 하이라이트', '눈 앞머리에 맑은 빛을 더해 화면에서 또렷하게 표현', 'trend', 'K_BAZAAR', 'KR', 'A'),
    ('0ab2826e-1054-5cf8-bea0-ad98479ad1e4'::uuid, '스탠드아웃 래시', '영상과 사진에서 분리되어 보이는 선명한 속눈썹', 'trend', 'G_ELLE', 'GLOBAL_SS26', 'B'),
    ('11fa9c0a-d204-5ce3-813c-4b5a53cc4d6e'::uuid, '플래시 세이프 베이스', '백탁과 과한 번들거림을 줄인 촬영용 베이스', 'curated', null, 'KR', 'A'),
    ('73e35ee8-517b-5d27-8cd4-68634e8160ea'::uuid, '펩랠리 글램', '스포티한 컬러와 선명한 포인트를 섞은 축제 글램', 'trend', 'G_PINTEREST', 'GLOBAL_SS26', 'A'),
    ('79dff7ca-5265-5d11-a422-b12415ecde89'::uuid, '프로스티드 아이시 블루', '차가운 블루와 서리 같은 광택을 쌓은 아이 메이크업', 'trend', 'G_PINTEREST', 'GLOBAL_SS26', 'A'),
    ('c1f7c442-8054-569e-bcf6-e8bc2f06ae9c'::uuid, '리플렉티브 메탈릭', '무대 조명에서 반사되는 메탈릭 아이 포인트', 'trend', 'G_ALLURE', 'GLOBAL_SS26', 'B'),
    ('8d5670ea-5b21-5e33-9f96-6b1aeb8e6e1c'::uuid, '페이스 젬 포인트', '작은 젬을 제한된 부위에 배치하는 페스티벌 포인트', 'trend', 'G_PINTEREST', 'GLOBAL_SS26', 'A'),
    ('da30ac53-acbd-5320-b23d-94a653541b24'::uuid, '출근·등교', '평일 아침 출근이나 등교를 준비하는 상황', 'curated', null, 'KR', 'A'),
    ('8d7baf2a-1048-5568-adf8-b906791eb3e8'::uuid, '카페·브런치', '낮 시간 카페나 브런치 약속이 있는 상황', 'curated', null, 'KR', 'A'),
    ('b9f8c0e0-19cd-5ad8-98a5-2007b4b46d17'::uuid, '가벼운 약속', '친구와 부담 없이 만나는 가벼운 약속 상황', 'curated', null, 'KR', 'A'),
    ('38de80b8-54fb-5e7a-b1a7-bf898b702162'::uuid, '퇴근 후 약속', '퇴근 뒤 바로 저녁 약속으로 이동하는 상황', 'curated', null, 'KR', 'A'),
    ('0d2b4a17-290f-578d-a584-1709c86ef893'::uuid, '주말 나들이', '주말에 산책하거나 가까운 곳으로 외출하는 상황', 'curated', null, 'KR', 'A'),
    ('885e91fc-0763-57f6-8dad-f1de8d4db89d'::uuid, '소개팅·데이트', '소개팅이나 데이트를 앞둔 특별한 약속 상황', 'curated', null, 'KR', 'A'),
    ('94913241-e93b-5a24-a877-b4bc3b5fdf81'::uuid, '결혼식 하객', '결혼식에 하객으로 참석하는 상황', 'curated', null, 'KR', 'A'),
    ('7d67353b-4eb9-5ce7-b8fd-d5b3eb782560'::uuid, '면접·중요한 발표', '면접이나 중요한 발표로 신뢰감이 필요한 상황', 'curated', null, 'KR', 'A'),
    ('ad4b586f-08c2-5c27-a6b9-4b43df888ed5'::uuid, '기념일·생일', '기념일 저녁이나 생일 모임을 즐기는 상황', 'curated', null, 'KR', 'A'),
    ('f33d1601-fc38-5ac9-bf69-b2024fec6295'::uuid, '졸업식·가족 행사', '졸업식이나 가족 행사에 참석하는 상황', 'curated', null, 'KR', 'A'),
    ('dfb8b3d5-9ae0-521a-bb06-5b82fc00cad5'::uuid, '증명사진', '신분증이나 지원서에 사용할 증명사진을 촬영하는 상황', 'curated', null, 'KR', 'A'),
    ('1f7206ab-547e-56f7-8c3d-f0cb898cd020'::uuid, '프로필 촬영', '개인 프로필이나 포트폴리오 사진을 촬영하는 상황', 'curated', null, 'KR', 'A'),
    ('77a1020c-ee61-5a70-a39b-6e114aa13134'::uuid, 'SNS 셀카', 'SNS에 올릴 셀카와 짧은 콘텐츠를 촬영하는 상황', 'curated', null, 'KR', 'A'),
    ('1e47ed93-0230-5a26-98df-c2aaf8bbef63'::uuid, '영상·라이브', '영상 콘텐츠나 라이브 방송에 출연하는 상황', 'curated', null, 'KR', 'A'),
    ('61e866a6-41ff-5e82-aa09-6aad4757ce62'::uuid, '야구장 전광판', '야외 야구장에서 전광판 카메라에 잡힐 수 있는 상황', 'curated', null, 'KR', 'A'),
    ('4b752db4-8ef5-5e06-bb6c-11d4c7958a24'::uuid, '콘서트·페스티벌', '콘서트나 야외 페스티벌을 오래 즐기는 상황', 'curated', null, 'KR', 'A'),
    ('99d5c986-4c36-5191-a45c-033566b80aad'::uuid, '클럽·야간 파티', '어두운 조명 아래 클럽이나 야간 파티를 즐기는 상황', 'curated', null, 'KR', 'A'),
    ('d7e8d63d-8bd1-5d0f-88a3-730808876fd9'::uuid, '테마 파티·코스프레', '정해진 테마나 캐릭터가 있는 파티에 참여하는 상황', 'curated', null, 'KR', 'A'),
    ('7c82e3cb-a2c4-58d7-aa17-e55bae7a7f10'::uuid, '무대 공연', '관객과 조명 앞에서 무대 공연을 하는 상황', 'curated', null, 'KR', 'A'),
    ('d9d57ef7-699e-52fd-a0b5-44297525ab92'::uuid, '패션 행사·전시 오프닝', '패션 행사나 전시 오프닝에 참석하는 색다른 상황', 'curated', null, 'KR', 'A'),
    ('c4964d4c-76e2-5f73-8db8-7065658cb254'::uuid, '로판 여주', '로맨스 판타지 여주인공처럼 우아하고 몽환적이되 실제로 재현 가능한 메이크업 상황', 'curated', null, 'KR', 'A')
)
insert into makeup_scenario_library as current (
  id, text, normalized_text, seed_prompt, tags, source, prompt_version, status,
  keyword_kind, source_name, source_url, source_published_at, evidence_summary,
  market_scope, confidence, review_status, locale, as_of, valid_from, expires_at
)
select
  seed.id, seed.text, seed.text, seed.seed_prompt, '[]'::jsonb, 'curated', 'makeup-keyword-seed-v2', 'active',
  seed.keyword_kind, coalesce(source.source_name, 'AURA editorial'), source.source_url,
  source.published_at, coalesce(source.evidence, '상황 적합성을 운영 검수한 선택지'),
  seed.market_scope, seed.confidence, 'approved', 'ko-KR',
  coalesce(source.as_of, '2026-07-16'::timestamptz),
  '2026-07-16'::timestamptz, source.expires_at
from keyword_seed seed
left join source_registry source on source.source_key = seed.source_key
on conflict (normalized_text, locale, (coalesce(market_scope, ''))) do update set
  text = excluded.text,
  seed_prompt = excluded.seed_prompt,
  tags = excluded.tags,
  source = excluded.source,
  prompt_version = excluded.prompt_version,
  status = excluded.status,
  keyword_kind = excluded.keyword_kind,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  source_published_at = excluded.source_published_at,
  evidence_summary = excluded.evidence_summary,
  market_scope = excluded.market_scope,
  confidence = excluded.confidence,
  review_status = excluded.review_status,
  locale = excluded.locale,
  as_of = excluded.as_of,
  valid_from = excluded.valid_from,
  expires_at = excluded.expires_at
where (
  current.text, current.seed_prompt, current.tags, current.source, current.prompt_version,
  current.status, current.keyword_kind, current.source_name, current.source_url,
  current.source_published_at, current.evidence_summary, current.market_scope,
  current.confidence, current.review_status, current.locale, current.as_of,
  current.valid_from, current.expires_at
) is distinct from (
  excluded.text, excluded.seed_prompt, excluded.tags, excluded.source, excluded.prompt_version,
  excluded.status, excluded.keyword_kind, excluded.source_name, excluded.source_url,
  excluded.source_published_at, excluded.evidence_summary, excluded.market_scope,
  excluded.confidence, excluded.review_status, excluded.locale, excluded.as_of,
  excluded.valid_from, excluded.expires_at
);

create table if not exists makeup_situation_keywords (
  situation_id uuid not null references makeup_situations(id) on delete cascade,
  keyword_id uuid not null references makeup_scenario_library(id) on delete cascade,
  relevance_score numeric(5,4) not null default 1,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (situation_id, keyword_id),
  constraint chk_makeup_situation_keywords_relevance check (relevance_score between 0 and 1),
  constraint chk_makeup_situation_keywords_sort_order check (sort_order >= 0),
  constraint chk_makeup_situation_keywords_status check (status in ('active', 'disabled'))
);
create index if not exists idx_makeup_situation_keywords_discovery
  on makeup_situation_keywords (situation_id, status, sort_order, relevance_score desc);

update makeup_situation_keywords mapping
set status = 'disabled', updated_at = now()
from makeup_situations situation
where mapping.situation_id = situation.id
  and situation.key in ('daily', 'work', 'date', 'social', 'formal_event', 'travel_outdoor', 'camera_content', 'festival_performance')
  and mapping.status <> 'disabled';

with seed(situation_key, keyword_text, sort_order) as (
  values
    ('daily', '출근·등교', 10), ('daily', '카페·브런치', 20),
    ('daily', '가벼운 약속', 30), ('daily', '퇴근 후 약속', 40), ('daily', '주말 나들이', 50),
    ('formal_event', '소개팅·데이트', 10), ('formal_event', '결혼식 하객', 20),
    ('formal_event', '면접·중요한 발표', 30), ('formal_event', '기념일·생일', 40), ('formal_event', '졸업식·가족 행사', 50),
    ('camera_content', '증명사진', 10), ('camera_content', '프로필 촬영', 20),
    ('camera_content', 'SNS 셀카', 30), ('camera_content', '영상·라이브', 40), ('camera_content', '야구장 전광판', 50),
    ('festival_performance', '콘서트·페스티벌', 10), ('festival_performance', '클럽·야간 파티', 20),
    ('festival_performance', '테마 파티·코스프레', 30), ('festival_performance', '무대 공연', 40),
    ('festival_performance', '패션 행사·전시 오프닝', 50), ('festival_performance', '로판 여주', 60)
)
insert into makeup_situation_keywords as current
  (situation_id, keyword_id, relevance_score, sort_order, status)
select situation.id, keyword.id, 1, seed.sort_order, 'active'
from seed
join makeup_situations situation on situation.key = seed.situation_key
join makeup_scenario_library keyword on keyword.id = (
  select candidate.id
  from makeup_scenario_library candidate
  where candidate.normalized_text = seed.keyword_text
    and candidate.locale = 'ko-KR'
  order by (candidate.prompt_version = 'makeup-keyword-seed-v2') desc, candidate.created_at, candidate.id
  limit 1
)
on conflict (situation_id, keyword_id) do update set
  relevance_score = excluded.relevance_score,
  sort_order = excluded.sort_order,
  status = excluded.status
where (current.relevance_score, current.sort_order, current.status)
  is distinct from (excluded.relevance_score, excluded.sort_order, excluded.status);

create table if not exists makeup_scenario_generation_limits (
  user_id uuid primary key references users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  constraint chk_makeup_scenario_generation_limit_count check (request_count between 0 and 4)
);

create table if not exists makeup_recommendation_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  parent_report_id uuid references makeup_recommendation_reports(id) on delete set null,
  refinement_type text,
  scenario_text text not null,
  scenario_tags jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  recommendation jsonb not null,
  image_status text not null default 'pending',
  image_url text,
  image_error text,
  scenario_model_id text,
  question_model_id text,
  recommendation_model_id text,
  image_model_id text,
  prompt_version text not null,
  source_analysis_report_id uuid references analysis_reports(id) on delete set null,
  session_id uuid,
  situation_id uuid references makeup_situations(id) on delete set null,
  keyword_id uuid references makeup_scenario_library(id) on delete set null,
  context_snapshot jsonb not null default '{}'::jsonb,
  schema_version text not null default 'makeup-recommendation-v2',
  image_mode text not null default 'generic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_makeup_recommendation_reports_image_status
    check (image_status in ('pending', 'processing', 'partial', 'completed', 'failed')),
  constraint chk_makeup_recommendation_reports_refinement_type
    check (refinement_type is null or refinement_type in ('natural', 'hip', 'differentColor', 'replaceProducts')),
  constraint chk_makeup_recommendation_reports_image_mode check (image_mode in ('generic', 'personalized')),
  constraint chk_makeup_recommendation_reports_context_snapshot check (jsonb_typeof(context_snapshot) = 'object')
);

alter table makeup_recommendation_reports add column if not exists parent_report_id uuid references makeup_recommendation_reports(id) on delete set null;
alter table makeup_recommendation_reports add column if not exists refinement_type text;
alter table makeup_recommendation_reports add column if not exists image_error text;
alter table makeup_recommendation_reports add column if not exists scenario_model_id text;
alter table makeup_recommendation_reports add column if not exists question_model_id text;
alter table makeup_recommendation_reports add column if not exists image_model_id text;
alter table makeup_recommendation_reports add column if not exists source_analysis_report_id uuid references analysis_reports(id) on delete set null;
alter table makeup_recommendation_reports add column if not exists session_id uuid;
alter table makeup_recommendation_reports add column if not exists situation_id uuid references makeup_situations(id) on delete set null;
alter table makeup_recommendation_reports add column if not exists keyword_id uuid references makeup_scenario_library(id) on delete set null;
alter table makeup_recommendation_reports add column if not exists context_snapshot jsonb;
alter table makeup_recommendation_reports add column if not exists schema_version text;
alter table makeup_recommendation_reports add column if not exists image_mode text;
alter table makeup_recommendation_reports add column if not exists updated_at timestamptz not null default now();
update makeup_recommendation_reports set context_snapshot = '{}'::jsonb where context_snapshot is null;
update makeup_recommendation_reports
set schema_version = case
  when prompt_version like '%v2%' then 'makeup-recommendation-v2'
  else 'makeup-recommendation-v1'
end
where schema_version is null;
update makeup_recommendation_reports set image_mode = 'generic' where image_mode is null;
alter table makeup_recommendation_reports alter column context_snapshot set default '{}'::jsonb;
alter table makeup_recommendation_reports alter column context_snapshot set not null;
alter table makeup_recommendation_reports alter column schema_version set default 'makeup-recommendation-v2';
alter table makeup_recommendation_reports alter column schema_version set not null;
alter table makeup_recommendation_reports alter column image_mode set default 'generic';
alter table makeup_recommendation_reports alter column image_mode set not null;
alter table makeup_recommendation_reports drop constraint if exists chk_makeup_recommendation_reports_image_status;
alter table makeup_recommendation_reports add constraint chk_makeup_recommendation_reports_image_status
  check (image_status in ('pending', 'processing', 'partial', 'completed', 'failed'));
alter table makeup_recommendation_reports drop constraint if exists chk_makeup_recommendation_reports_refinement_type;
alter table makeup_recommendation_reports add constraint chk_makeup_recommendation_reports_refinement_type
  check (refinement_type is null or refinement_type in ('natural', 'hip', 'differentColor', 'replaceProducts'));
alter table makeup_recommendation_reports drop constraint if exists chk_makeup_recommendation_reports_image_mode;
alter table makeup_recommendation_reports add constraint chk_makeup_recommendation_reports_image_mode
  check (image_mode in ('generic', 'personalized'));
alter table makeup_recommendation_reports drop constraint if exists chk_makeup_recommendation_reports_context_snapshot;
alter table makeup_recommendation_reports add constraint chk_makeup_recommendation_reports_context_snapshot
  check (jsonb_typeof(context_snapshot) = 'object');

create table if not exists makeup_recommendation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  analysis_report_id uuid not null references analysis_reports(id) on delete restrict,
  situation_id uuid references makeup_situations(id) on delete restrict,
  keyword_id uuid references makeup_scenario_library(id) on delete restrict,
  custom_situation_text text,
  context_snapshot jsonb not null default '{}'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  current_question_index integer not null default 0,
  status text not null default 'questioning',
  report_id uuid references makeup_recommendation_reports(id) on delete set null,
  idempotency_key text not null,
  image_mode text not null default 'generic',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_makeup_recommendation_sessions_status
    check (status in ('questioning', 'ready', 'generating', 'completed', 'failed', 'expired')),
  constraint chk_makeup_recommendation_sessions_image_mode check (image_mode in ('generic', 'personalized')),
  constraint chk_makeup_recommendation_sessions_question_index check (current_question_index >= 0),
  constraint chk_makeup_recommendation_sessions_custom_length
    check (custom_situation_text is null or char_length(btrim(custom_situation_text)) between 1 and 240),
  constraint chk_makeup_recommendation_sessions_context_snapshot check (jsonb_typeof(context_snapshot) = 'object'),
  constraint uq_makeup_recommendation_sessions_user_idempotency unique (user_id, idempotency_key),
  constraint uq_makeup_recommendation_sessions_report unique (report_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fk_makeup_recommendation_reports_session'
      and conrelid = 'public.makeup_recommendation_reports'::regclass
  ) then
    alter table makeup_recommendation_reports
      add constraint fk_makeup_recommendation_reports_session
      foreign key (session_id) references makeup_recommendation_sessions(id) on delete set null;
  end if;
end
$$;

create index if not exists idx_makeup_recommendation_sessions_user_created
  on makeup_recommendation_sessions (user_id, created_at desc);
create index if not exists idx_makeup_recommendation_sessions_active
  on makeup_recommendation_sessions (user_id, status, expires_at);
create index if not exists idx_makeup_recommendation_reports_user_created
  on makeup_recommendation_reports (user_id, created_at desc);
create index if not exists idx_makeup_recommendation_reports_parent
  on makeup_recommendation_reports (parent_report_id);
drop index if exists uq_makeup_recommendation_reports_session;
create unique index uq_makeup_recommendation_reports_session
  on makeup_recommendation_reports (session_id);

create table if not exists makeup_recommendation_assets (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references makeup_recommendation_reports(id) on delete cascade,
  look_id text not null,
  role text not null,
  status text not null default 'pending',
  image_url text,
  image_error text,
  storage_bucket text,
  object_key text,
  content_type text,
  is_private boolean not null default false,
  input_media_id uuid references media_assets(id) on delete set null,
  model_id text not null,
  prompt_version text not null,
  provenance jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_makeup_recommendation_assets_report_look unique (report_id, look_id),
  constraint chk_makeup_recommendation_assets_role check (role in ('anchor', 'bold', 'discovery')),
  constraint chk_makeup_recommendation_assets_status check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint chk_makeup_recommendation_assets_attempt_count check (attempt_count >= 0),
  constraint chk_makeup_recommendation_assets_private_url check (not is_private or image_url is null),
  constraint chk_makeup_recommendation_assets_provenance check (jsonb_typeof(provenance) = 'object')
);
alter table makeup_recommendation_assets
  add column if not exists provenance jsonb not null default '{}'::jsonb;
alter table makeup_recommendation_assets
  drop constraint if exists chk_makeup_recommendation_assets_provenance;
alter table makeup_recommendation_assets
  add constraint chk_makeup_recommendation_assets_provenance
  check (jsonb_typeof(provenance) = 'object');
create index if not exists idx_makeup_recommendation_assets_report_status
  on makeup_recommendation_assets (report_id, status, role);

drop trigger if exists trg_makeup_scenario_library_updated_at on makeup_scenario_library;
create trigger trg_makeup_scenario_library_updated_at before update on makeup_scenario_library
for each row execute function set_updated_at();
drop trigger if exists trg_makeup_situations_updated_at on makeup_situations;
create trigger trg_makeup_situations_updated_at before update on makeup_situations
for each row execute function set_updated_at();
drop trigger if exists trg_makeup_situation_keywords_updated_at on makeup_situation_keywords;
create trigger trg_makeup_situation_keywords_updated_at before update on makeup_situation_keywords
for each row execute function set_updated_at();
drop trigger if exists trg_makeup_recommendation_sessions_updated_at on makeup_recommendation_sessions;
create trigger trg_makeup_recommendation_sessions_updated_at before update on makeup_recommendation_sessions
for each row execute function set_updated_at();
drop trigger if exists trg_makeup_recommendation_reports_updated_at on makeup_recommendation_reports;
create trigger trg_makeup_recommendation_reports_updated_at before update on makeup_recommendation_reports
for each row execute function set_updated_at();
drop trigger if exists trg_makeup_recommendation_assets_updated_at on makeup_recommendation_assets;
create trigger trg_makeup_recommendation_assets_updated_at before update on makeup_recommendation_assets
for each row execute function set_updated_at();
"""

MAKEUP_RECOMMENDATION_SCHEMA_SQL += "\n" + MAKEUP_KEYWORD_QUESTION_TEMPLATE_SCHEMA_SQL


_ROMANTASY_HEROINE_QUESTIONS_JSON = json.dumps(
  CURATED_KEYWORD_QUESTION_TEMPLATES["로판 여주"],
  ensure_ascii=False,
  separators=(",", ":"),
)

# `schema.sql:makeup-recommendation-v2`가 이미 적용된 운영 DB에도 새 선택지와
# 검수 질문을 반영하기 위한 독립 증분 migration. 전체 V2 schema 문자열을
# 수정하는 것만으로는 기존 migration marker 때문에 재실행되지 않는다.
ROMANTASY_HEROINE_SEED_MIGRATION_SQL = f"""
insert into makeup_scenario_library as current (
  id, text, normalized_text, seed_prompt, tags, source, prompt_version, status,
  keyword_kind, source_name, source_url, source_published_at, evidence_summary,
  market_scope, confidence, review_status, locale, as_of, valid_from, expires_at
)
values (
  'c4964d4c-76e2-5f73-8db8-7065658cb254'::uuid,
  '로판 여주',
  '로판 여주',
  '로맨스 판타지 여주인공처럼 우아하고 몽환적이되 실제로 재현 가능한 메이크업 상황',
  '[]'::jsonb,
  'curated',
  'makeup-keyword-seed-v2',
  'active',
  'curated',
  'AURA editorial',
  null,
  null,
  '상황 적합성을 운영 검수한 선택지',
  'KR',
  'A',
  'approved',
  'ko-KR',
  '2026-07-16'::timestamptz,
  '2026-07-16'::timestamptz,
  null
)
on conflict (normalized_text, locale, (coalesce(market_scope, ''))) do update set
  text = excluded.text,
  seed_prompt = excluded.seed_prompt,
  tags = excluded.tags,
  source = excluded.source,
  prompt_version = excluded.prompt_version,
  status = excluded.status,
  keyword_kind = excluded.keyword_kind,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  source_published_at = excluded.source_published_at,
  evidence_summary = excluded.evidence_summary,
  market_scope = excluded.market_scope,
  confidence = excluded.confidence,
  review_status = excluded.review_status,
  as_of = excluded.as_of,
  valid_from = excluded.valid_from,
  expires_at = excluded.expires_at
where (
  current.text,
  current.seed_prompt,
  current.tags,
  current.source,
  current.prompt_version,
  current.status,
  current.keyword_kind,
  current.source_name,
  current.source_url,
  current.source_published_at,
  current.evidence_summary,
  current.market_scope,
  current.confidence,
  current.review_status,
  current.as_of,
  current.valid_from,
  current.expires_at
) is distinct from (
  excluded.text,
  excluded.seed_prompt,
  excluded.tags,
  excluded.source,
  excluded.prompt_version,
  excluded.status,
  excluded.keyword_kind,
  excluded.source_name,
  excluded.source_url,
  excluded.source_published_at,
  excluded.evidence_summary,
  excluded.market_scope,
  excluded.confidence,
  excluded.review_status,
  excluded.as_of,
  excluded.valid_from,
  excluded.expires_at
);

with resolved as (
  select situation.id as situation_id, keyword.id as keyword_id
  from makeup_situations situation
  join lateral (
    select candidate.id
    from makeup_scenario_library candidate
    where candidate.normalized_text = '로판 여주'
      and candidate.locale = 'ko-KR'
      and candidate.status = 'active'
      and candidate.review_status = 'approved'
    order by (candidate.prompt_version = 'makeup-keyword-seed-v2') desc,
             candidate.created_at,
             candidate.id
    limit 1
  ) keyword on true
  where situation.key = 'festival_performance'
)
insert into makeup_situation_keywords as current
  (situation_id, keyword_id, relevance_score, sort_order, status)
select situation_id, keyword_id, 1, 60, 'active'
from resolved
on conflict (situation_id, keyword_id) do update set
  relevance_score = excluded.relevance_score,
  sort_order = excluded.sort_order,
  status = excluded.status
where (current.relevance_score, current.sort_order, current.status)
  is distinct from (excluded.relevance_score, excluded.sort_order, excluded.status);

with keyword as (
  select candidate.id
  from makeup_scenario_library candidate
  where candidate.normalized_text = '로판 여주'
    and candidate.locale = 'ko-KR'
    and candidate.status = 'active'
    and candidate.review_status = 'approved'
  order by (candidate.prompt_version = 'makeup-keyword-seed-v2') desc,
           candidate.created_at,
           candidate.id
  limit 1
)
insert into makeup_keyword_question_templates as current (
  keyword_id, template_version, locale, questions, source, model_id,
  prompt_version, review_status, status, reviewed_at
)
select
  keyword.id,
  {QUESTION_TEMPLATE_VERSION},
  'ko-KR',
  $romantasy${_ROMANTASY_HEROINE_QUESTIONS_JSON}$romantasy$::jsonb,
  'curated',
  null,
  '{QUESTION_TEMPLATE_PROMPT_VERSION}',
  'approved',
  'active',
  now()
from keyword
where not exists (
  select 1
  from makeup_keyword_question_templates approved
  where approved.keyword_id = keyword.id
    and approved.status = 'active'
    and approved.review_status = 'approved'
)
on conflict (keyword_id, template_version) do update set
  locale = excluded.locale,
  questions = excluded.questions,
  source = excluded.source,
  model_id = excluded.model_id,
  prompt_version = excluded.prompt_version,
  review_status = excluded.review_status,
  status = excluded.status,
  reviewed_at = excluded.reviewed_at,
  updated_at = now();
"""


async def ensure_makeup_recommendation_schema(db: Database) -> None:
  if not db.is_connected:
    return
  await db.execute(MAKEUP_RECOMMENDATION_SCHEMA_SQL)
