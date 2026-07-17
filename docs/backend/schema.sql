-- PostgreSQL schema for AI AR Makeup Guide
-- Generated from docs/backend/aws-postgresql-schema.dbml
-- Target: current-screen backend integration v1

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists btree_gist;
create extension if not exists vector;
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'auth_provider') then
    create type auth_provider as enum ('google', 'kakao', 'naver', 'apple');
  end if;

  if not exists (select 1 from pg_type where typname = 'gender_type') then
    create type gender_type as enum ('female', 'male', 'other', 'unknown');
  end if;

  if not exists (select 1 from pg_type where typname = 'media_source_type') then
    create type media_source_type as enum ('camera', 'gallery', 'seed', 'generated');
  end if;

  if not exists (select 1 from pg_type where typname = 'capture_type') then
    create type capture_type as enum ('face_analysis', 'makeup_feedback', 'filter_extraction', 'ar_try_on', 'hair_analysis');
  end if;

  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type job_status as enum ('pending', 'processing', 'completed', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'makeup_style_type') then
    create type makeup_style_type as enum ('look', 'filter', 'recipe');
  end if;

  -- R1 (schema.sql:product-category-brow-v1): brow 포함 — Auradin 브로우 찜의 카테고리 손실 방지.
  if not exists (select 1 from pg_type where typname = 'product_category') then
    create type product_category as enum ('lip', 'cheek', 'shadow', 'liner', 'base', 'brow');
  end if;

  if not exists (select 1 from pg_type where typname = 'filter_category') then
    create type filter_category as enum ('recommended', 'trend', 'personal_color', 'popular');
  end if;

  if not exists (select 1 from pg_type where typname = 'face_part') then
    create type face_part as enum ('all', 'base', 'eye', 'lip', 'contour');
  end if;

  if not exists (select 1 from pg_type where typname = 'consent_type') then
    create type consent_type as enum ('privacy_policy', 'camera_analysis', 'ai_processing', 'third_party_ai', 'marketing', 'engagement_personalization', 'color_cohort');
  end if;
end
$$;

alter type capture_type add value if not exists 'hair_analysis';
-- R1 (schema.sql:product-category-brow-v1): 기존 DB 소급 — add value if not exists = 멱등.
alter type product_category add value if not exists 'brow';
alter type consent_type add value if not exists 'engagement_personalization';
alter type consent_type add value if not exists 'color_cohort';

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_provider auth_provider,
  oauth_sub text,
  email citext,
  name text,
  nickname text not null,
  phone text,
  birth_date date,
  gender gender_type not null default 'unknown',
  interest text,
  personal_color text,
  skin_type text,
  skin_tone text,
  tags text[],
  avatar_media_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table users is 'Login, MyPage, ProfileEdit. Beauty profile fields are kept here for v1 API simplicity.';

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid,
  media_kind text not null,
  source media_source_type not null,
  bucket text,
  object_key text,
  cdn_url text,
  thumbnail_bucket text,
  thumbnail_object_key text,
  thumbnail_cdn_url text,
  thumbnail_content_type text,
  thumbnail_byte_size bigint,
  thumbnail_width integer,
  thumbnail_height integer,
  content_type text,
  byte_size bigint,
  width integer,
  height integer,
  checksum_sha256 text,
  original_filename text,
  is_original boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint uq_media_assets_bucket_object_key unique (bucket, object_key),
  constraint chk_media_assets_byte_size check (byte_size is null or byte_size >= 0),
  constraint chk_media_assets_thumbnail_byte_size check (thumbnail_byte_size is null or thumbnail_byte_size >= 0),
  constraint chk_media_assets_width check (width is null or width > 0),
  constraint chk_media_assets_height check (height is null or height > 0),
  constraint chk_media_assets_thumbnail_width check (thumbnail_width is null or thumbnail_width > 0),
  constraint chk_media_assets_thumbnail_height check (thumbnail_height is null or thumbnail_height > 0)
);

comment on table media_assets is 'S3/CDN metadata for avatar, capture, analysis, product, look, AR preview images.';

create table if not exists media_upload_sessions (
  id uuid primary key,
  owner_user_id uuid,
  partner_account_id uuid,
  media_kind text not null,
  source media_source_type not null,
  bucket text not null,
  object_key text not null,
  cdn_url text,
  content_type text not null,
  expected_byte_size bigint,
  width integer,
  height integer,
  original_filename text,
  thumbnail_bucket text,
  thumbnail_object_key text,
  thumbnail_cdn_url text,
  thumbnail_content_type text,
  thumbnail_expected_byte_size bigint,
  thumbnail_width integer,
  thumbnail_height integer,
  status text not null default 'pending',
  media_asset_id uuid,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uq_media_upload_sessions_bucket_key unique (bucket, object_key),
  constraint uq_media_upload_sessions_thumbnail_bucket_key unique (thumbnail_bucket, thumbnail_object_key),
  constraint chk_media_upload_sessions_principal check (
    (owner_user_id is not null and partner_account_id is null)
    or (owner_user_id is null and partner_account_id is not null)
  ),
  constraint chk_media_upload_sessions_status check (status in ('pending', 'completed', 'expired')),
  constraint chk_media_upload_sessions_expected_size check (
    expected_byte_size is null or expected_byte_size between 1 and 52428800
  ),
  constraint chk_media_upload_sessions_thumbnail_expected_size check (
    thumbnail_expected_byte_size is null or thumbnail_expected_byte_size between 1 and 52428800
  )
);

comment on table media_upload_sessions is 'Server-issued, principal-bound S3 upload locations consumed exactly once.';

create table if not exists photo_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  media_id uuid not null,
  capture_type capture_type not null,
  source media_source_type not null,
  status job_status not null default 'pending',
  captured_at timestamptz not null default now(),
  device_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table photo_captures is 'A single uploaded/captured image can feed analysis, feedback, filter extraction, or AR try-on.';

create table if not exists analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  photo_capture_id uuid,
  source_media_id uuid,
  preview_media_id uuid,
  status job_status not null default 'completed',
  ai_provider text,
  ai_model text,
  request_id text,
  error_message text,
  analyzed_at timestamptz,
  title text not null,
  report_title text not null,
  environment_label text,
  personal_color text,
  face_shape text,
  skin_type text,
  tone_summary text,
  recommended_mood text,
  summary text,
  short_summary text,
  skin_analysis_summary text,
  base_makeup_guide text,
  tags text[],
  detail_payload jsonb not null default '{}'::jsonb,
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table analysis_reports is 'ImageAnalysisReportsList and ImageAnalysisReportDetail. facePointGuide, recommendedMakeups, avoidedMakeups live in detail_payload.';

create table if not exists analysis_stage_runs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references analysis_reports(id) on delete cascade,
  stage text not null check (stage in ('ai_measurement', 'ai_perception', 'ai_consulting')),
  status text not null check (status in ('pending', 'processing', 'completed', 'partial', 'failed')),
  schema_version text not null,
  prompt_version text not null,
  model text not null,
  input_hash text not null,
  normalized_output jsonb not null default '{}'::jsonb,
  raw_response jsonb not null default '{}'::jsonb,
  error_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hair_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_request_id uuid not null,
  photo_capture_id uuid,
  source_media_id uuid not null,
  mask_media_id uuid,
  status text not null default 'queued',
  analysis_payload jsonb not null default '{}'::jsonb,
  recommended_style_ids text[] not null default '{}',
  error_code text,
  error_message text,
  attempt_count integer not null default 0,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_hair_analyses_user_request unique (user_id, client_request_id),
  constraint chk_hair_analyses_status check (status in ('queued', 'processing', 'completed', 'failed', 'expired')),
  constraint chk_hair_analyses_attempt_count check (attempt_count >= 0)
);

comment on table hair_analyses is 'Private 24-hour iOS hair analysis sessions and deterministic style recommendations.';

create table if not exists hair_simulations (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null,
  user_id uuid not null,
  client_request_id uuid not null,
  style_id text not null,
  status text not null default 'queued',
  result_media_id uuid,
  provider text,
  model text,
  attempt_count integer not null default 0,
  quality_attempt_count integer not null default 0,
  quality_payload jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  saved_at timestamptz,
  expires_at timestamptz default (now() + interval '24 hours'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_hair_simulations_user_request unique (user_id, client_request_id),
  constraint uq_hair_simulations_analysis_style unique (analysis_id, style_id),
  constraint chk_hair_simulations_status check (status in ('queued', 'processing', 'completed', 'failed', 'expired')),
  constraint chk_hair_simulations_attempt_count check (attempt_count >= 0),
  constraint chk_hair_simulations_quality_attempt_count check (quality_attempt_count >= 0)
);

comment on table hair_simulations is 'One generated hairstyle per selected catalog style; unsaved output expires after 24 hours.';

create table if not exists saved_makeup_styles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_request_id uuid not null default gen_random_uuid(),
  style_type makeup_style_type not null default 'look',
  source_analysis_report_id uuid,
  source_filter_extraction_id uuid,
  source_media_id uuid,
  thumbnail_media_id uuid,
  title text not null,
  mood_label text,
  short_description text,
  tags text[],
  visibility text not null default 'private',
  style_payload jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_saved_makeup_styles_user_request unique (user_id, client_request_id),
  constraint chk_saved_makeup_styles_payload_object check (jsonb_typeof(style_payload) = 'object')
);

comment on table saved_makeup_styles is 'MakeupStyleList plus saved filters and saved recipes from the filter extraction flow.';

create table if not exists product_recommendation_operators (
  user_id uuid primary key,
  roles text[] not null,
  is_active boolean not null default true,
  granted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_product_recommendation_operator_roles check (
    cardinality(roles) > 0 and roles <@ array[
      'catalog_admin',
      'seasonal_editor',
      'seasonal_reviewer',
      'seasonal_publisher',
      'seasonal_operator'
    ]::text[]
  )
);

comment on table product_recommendation_operators is
  'Explicit internal RBAC grants for signed catalog and seasonal operations.';

create table if not exists product_recommendation_service_principals (
  id uuid primary key default gen_random_uuid(),
  principal_key text not null unique,
  display_name text not null,
  external_subject text unique,
  roles text[] not null default array['seasonal_auto_publisher']::text[],
  status text not null default 'active',
  created_by uuid,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_product_recommendation_service_principal_key
    check (principal_key ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  constraint chk_product_recommendation_service_principal_roles check (
    cardinality(roles) > 0
    and roles <@ array['seasonal_auto_publisher']::text[]
  ),
  constraint chk_product_recommendation_service_principal_status
    check (status in ('active', 'disabled', 'revoked'))
);

comment on table product_recommendation_service_principals is
  'Credential-free identities for scheduled recommendation jobs. Human seasonal RBAC remains in product_recommendation_operators.';

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,
  brand_name text not null,
  product_name text not null,
  shade_name text,
  category product_category not null,
  price_krw integer not null default 0,
  image_media_id uuid,
  tags text[],
  palette text[],
  product_payload jsonb not null default '{}'::jsonb,
  source_provider text,
  source_license_type text,
  source_reference text,
  license_status text not null default 'unverified',
  license_valid_from timestamptz,
  license_valid_until timestamptz,
  allowed_uses text[] not null default '{}',
  catalog_status text not null default 'draft',
  catalog_version text not null default 'catalog_v2',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_products_price_krw check (price_krw >= 0),
  constraint chk_products_license_status check (license_status in ('unverified', 'valid', 'expired', 'blocked')),
  constraint chk_products_catalog_status check (catalog_status in ('draft', 'reviewed', 'published', 'blocked')),
  constraint chk_products_license_window check (license_valid_until is null or license_valid_from is null or license_valid_until > license_valid_from)
);

comment on table products is 'ProductRecommendation and LikedProductList product catalog.';

create table if not exists user_product_likes (
  user_id uuid not null,
  product_id uuid not null,
  source_shade_id uuid,
  liked_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

comment on table user_product_likes is 'LikedProductList and product heart state.';

create table if not exists external_product_likes (
  user_id uuid not null,
  external_source text not null,
  external_product_id text not null,
  brand_name text not null,
  product_name text not null,
  category text not null,
  image_url text not null,
  purchase_url text not null,
  price_amount numeric(12,2),
  price_currency char(3) not null default 'KRW',
  source_updated_at timestamptz,
  liked_at timestamptz not null default now(),
  primary key (user_id, external_source, external_product_id),
  constraint chk_external_product_likes_source check (
    external_source in ('naver_shopping_search', 'auradin_search', 'auradin_catalog')
  ),
  constraint chk_external_product_likes_identity check (
    char_length(external_product_id) between 1 and 160
    and char_length(brand_name) between 1 and 200
    and char_length(product_name) between 1 and 500
  ),
  constraint chk_external_product_likes_price check (price_amount is null or price_amount >= 0)
);

comment on table external_product_likes is
  'User bookmarks for server-verified external shopping results; rows are never trusted catalog products.';

alter table external_product_likes
  drop constraint if exists chk_external_product_likes_source,
  add constraint chk_external_product_likes_source
    check (external_source in ('naver_shopping_search', 'auradin_search', 'auradin_catalog'));

insert into external_product_likes (
  user_id,external_source,external_product_id,brand_name,product_name,category,
  image_url,purchase_url,price_amount,price_currency,source_updated_at,liked_at
)
select user_id,'auradin_catalog',external_product_id,brand_name,product_name,category,
  image_url,purchase_url,price_amount,price_currency,source_updated_at,liked_at
from external_product_likes
where external_source='auradin_search' and external_product_id like 'auradin-seed-%'
on conflict (user_id,external_source,external_product_id) do nothing;

delete from external_product_likes
where external_source='auradin_search' and external_product_id like 'auradin-seed-%';

create table if not exists auradin_search_sessions (
  session_id text primary key,
  state jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null,
  -- A9 v2 (schema.sql:auradin-sessions-v2): 멱등성·동시성
  owner_subject text not null,
  version integer not null default 0,
  client_request_id text,
  request_fingerprint text,
  idempotency_expires_at timestamptz,
  constraint chk_auradin_sessions_idempotency_fields check (
    ((client_request_id is null) = (request_fingerprint is null))
    and ((client_request_id is null) = (idempotency_expires_at is null))
  )
);

create unique index if not exists uq_auradin_sessions_owner_client_request
  on auradin_search_sessions (owner_subject, client_request_id)
  where client_request_id is not null;

create index if not exists idx_auradin_sessions_idempotency_expires
  on auradin_search_sessions (idempotency_expires_at)
  where idempotency_expires_at is not null;

create index if not exists idx_auradin_search_sessions_owner_subject
  on auradin_search_sessions ((state ->> 'ownerSubject'));

comment on table auradin_search_sessions is
  'Temporary Auradin conversation state. Product likes are stored separately in user_product_likes. '
  'client_request_id/request_fingerprint/idempotency_expires_at: A9 create 멱등성 (retention은 세션 TTL과 별개), '
  'version: mutator CAS.';

create table if not exists auradin_events (
  id bigserial primary key,
  client_event_id text not null,           -- 재시도 멱등성 — 유니크는 (owner_subject, client_event_id) 복합
                                           -- (클라이언트 생성 ID는 사용자 간 충돌 가능)
  schema_version smallint not null default 1,
  owner_subject text not null,             -- 익명 식별 계약 확정 후 사용 (dev fallback 공용 subject 금지)
  session_id text, turn_id text, result_set_id text,   -- 세션·턴·결과셋 연결 (만료 후에도 이벤트 잔존)
  event_type text not null check (event_type in (
    'session_start','question_answered','impression','product_open',
    'save','unsave','purchase_click','refine_dial','refine_prompt','hide','unhide')),
  product_id text, category text, rank int, role text, match_rate int,
  data_manifest_id text not null,           -- 귀속 정본 (Data Manifest)
  release_manifest_id text not null,        -- 귀속 정본 (Release Manifest)
  catalog_run_date text, ranker_version text,  -- 조회 편의용 중복 컬럼 (정본은 manifest ID)
  payload jsonb,                            -- scoreSnapshot(components), filterDelta, dial 등 구조화 값만.
                                            -- **raw query 원문은 저장하지 않는다** — 파싱된 filterDelta/softPreferences로 대체
                                            -- (파서 개선용 원문 수집은 별도 opt-in 트랙). 앱 버전/플랫폼/locale/동의도 payload에.
  occurred_at timestamptz not null,         -- 클라이언트 발생 시각
  received_at timestamptz not null default now(),  -- 서버 수신 시각
  experiment_id text, variant text,         -- Future Extension: nullable 예약 (B7 A/B 시작 시 사용)
  unique (owner_subject, client_event_id)
);

create index if not exists idx_auradin_events_owner_time on auradin_events (owner_subject, occurred_at desc);
create index if not exists idx_auradin_events_session on auradin_events (session_id);
create index if not exists idx_auradin_events_manifest on auradin_events (data_manifest_id);
create index if not exists idx_auradin_events_received on auradin_events (received_at);

comment on table auradin_events is
  'A5 (schema.sql:auradin-events-v1) — §7.2 이벤트 로깅. payload는 allowlist 구조화 값만(raw query 원문 금지). '
  '보존: received_at 인덱스 기반 주기 배치 DELETE(비파티션 MVP). 사용자 삭제 시 이벤트와 파생 user_taste_profile을 한 트랜잭션으로 삭제.';

create table if not exists product_recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_analysis_report_id uuid,
  user_nickname text,
  look_title text,
  look_description text,
  look_media_id uuid,
  source_style_id uuid,
  strategy text not null default 'legacy_v1',
  algorithm_version text,
  consent_snapshot jsonb not null default '{}'::jsonb,
  product_ids uuid[],
  recommendation_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint chk_product_recommendation_runs_strategy check (strategy in ('legacy_v1', 'ar_v1', 'seasonal_v1', 'personalized_v1', 'cohort_v1'))
);

comment on table product_recommendation_runs is 'ProductRecommendationData. tabs, products, sets, matchRate, reason are kept in recommendation_payload for v1 API flexibility.';

create table if not exists product_shades (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  external_shade_key text not null,
  shade_name text not null,
  product_region text not null,
  srgb_hex text,
  lab_l double precision,
  lab_a double precision,
  lab_b double precision,
  color_family text,
  finish text,
  coverage text,
  opacity double precision,
  evidence_type text not null,
  evidence_reference text,
  evidence_confidence double precision not null default 0,
  license_status text not null default 'unverified',
  license_valid_from timestamptz,
  license_valid_until timestamptz,
  allowed_uses text[] not null default '{}',
  measured_at timestamptz,
  reviewed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_product_shades_product_key unique (product_id, external_shade_key),
  constraint uq_product_shades_id_product unique (id, product_id),
  constraint chk_product_shades_region check (product_region in ('lip', 'cheek', 'liner', 'base', 'brow')),
  constraint chk_product_shades_hex check (srgb_hex is null or srgb_hex ~ '^#[0-9A-Fa-f]{6}$'),
  constraint chk_product_shades_lab check (
    (lab_l is null and lab_a is null and lab_b is null)
    or (lab_l between 0 and 100 and lab_a between -160 and 160 and lab_b between -160 and 160)
  ),
  constraint chk_product_shades_opacity check (opacity is null or opacity between 0 and 1),
  constraint chk_product_shades_confidence check (evidence_confidence between 0 and 1),
  constraint chk_product_shades_evidence check (evidence_type in ('measured_swatch', 'licensed_partner_feed', 'brand_official_swatch', 'manual_review', 'title_inferred')),
  constraint chk_product_shades_license_status check (license_status in ('unverified', 'valid', 'expired', 'blocked')),
  constraint chk_product_shades_license_window check (license_valid_until is null or license_valid_from is null or license_valid_until > license_valid_from)
);

create table if not exists product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  shade_id uuid,
  asset_type text not null,
  media_id uuid,
  asset_url text,
  checksum_sha256 text,
  source_provider text not null,
  source_reference text,
  license_type text,
  license_status text not null default 'unverified',
  allowed_uses text[] not null default '{}',
  valid_from timestamptz,
  valid_until timestamptz,
  reviewed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_product_assets_type check (asset_type in ('packshot', 'swatch', 'thumbnail')),
  constraint chk_product_assets_source check ((media_id is not null) <> (asset_url is not null)),
  constraint chk_product_assets_license_status check (license_status in ('unverified', 'valid', 'expired', 'blocked')),
  constraint chk_product_assets_validity check (valid_until is null or valid_from is null or valid_until > valid_from),
  constraint uq_product_assets_source unique (source_provider, source_reference, asset_type)
);

create table if not exists product_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  shade_id uuid,
  seller_name text not null,
  seller_domain text not null,
  purchase_url text not null,
  currency text not null default 'KRW',
  price_amount integer,
  availability_status text not null default 'unknown',
  availability_checked_at timestamptz,
  price_updated_at timestamptz,
  affiliate_type text not null default 'none',
  disclosure_label text,
  source_provider text not null,
  source_reference text,
  license_status text not null default 'unverified',
  allowed_uses text[] not null default '{}',
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_product_offers_price check (price_amount is null or price_amount >= 0),
  constraint chk_product_offers_url check (purchase_url ~ '^https://'),
  constraint chk_product_offers_availability check (availability_status in ('in_stock', 'limited', 'out_of_stock', 'discontinued', 'unknown')),
  constraint chk_product_offers_affiliate check (affiliate_type in ('none', 'affiliate', 'sponsored')),
  constraint chk_product_offers_license_status check (license_status in ('unverified', 'valid', 'expired', 'blocked')),
  constraint uq_product_offers_source unique (source_provider, source_reference)
);

create table if not exists product_seasonal_collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  summary text not null,
  locale text not null default 'ko-KR',
  region_code text not null default 'KR-00',
  region_label text not null default '전국',
  trend_window text not null,
  source_name text not null default 'editorial',
  source_updated_at timestamptz,
  source_labels text[] not null default '{}',
  source_payload jsonb not null default '{}'::jsonb,
  trend_keywords text[] not null default '{}',
  reason_codes text[] not null default '{}',
  confidence_score double precision not null default 0.5,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  reviewed_at timestamptz,
  published_at timestamptz,
  status text not null default 'draft',
  revision integer not null default 1,
  algorithm_version text not null default 'seasonal_v1',
  input_fingerprint text,
  freshness_status text not null default 'fresh',
  auto_publish_policy_version text,
  pipeline_run_id uuid,
  published_by_service_principal_id uuid,
  next_evaluation_at timestamptz,
  created_by uuid,
  reviewed_by uuid,
  published_by uuid,
  previous_revision_id uuid,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_product_seasonal_collection_revision unique (slug, revision),
  constraint chk_product_seasonal_collection_window check (valid_until > valid_from),
  constraint chk_product_seasonal_collection_region check (
    region_code in ('KR-00','KR-11','KR-26','KR-27','KR-28','KR-29','KR-30','KR-31','KR-41','KR-42','KR-43','KR-44','KR-45','KR-46','KR-47','KR-48','KR-49','KR-50')
  ),
  constraint chk_product_seasonal_collection_confidence check (confidence_score between 0 and 1),
  constraint chk_product_seasonal_collection_fingerprint check (
    input_fingerprint is null or input_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint chk_product_seasonal_collection_freshness
    check (freshness_status in ('fresh', 'stale', 'fallback')),
  constraint chk_product_seasonal_collection_status check (status in ('draft', 'in_review', 'published', 'suspended', 'expired')),
  constraint chk_product_seasonal_two_person_publish check (
    status <> 'published'
    or (
      reviewed_by is not null
      and published_by is not null
      and created_by <> published_by
      and reviewed_by <> published_by
      and published_by_service_principal_id is null
    )
    or (
      created_by is null
      and reviewed_by is null
      and published_by is null
      and published_by_service_principal_id is not null
      and auto_publish_policy_version is not null
      and pipeline_run_id is not null
    )
  )
);

create table if not exists product_seasonal_collection_items (
  collection_id uuid not null,
  product_id uuid not null,
  shade_id uuid,
  position integer not null,
  reason_code text not null,
  reason_codes text[] not null default '{}',
  match_score double precision not null default 0,
  score_components jsonb not null default '{}'::jsonb,
  ranking_model_version text,
  sponsorship_type text not null default 'organic',
  created_at timestamptz not null default now(),
  primary key (collection_id, product_id),
  constraint uq_product_seasonal_item_position unique (collection_id, position),
  constraint chk_product_seasonal_item_position check (position >= 0),
  constraint chk_product_seasonal_item_match_score check (match_score >= 0),
  constraint chk_product_seasonal_item_score_components check (jsonb_typeof(score_components) = 'object'),
  constraint chk_product_seasonal_sponsorship check (sponsorship_type in ('organic', 'affiliate', 'sponsored'))
);

create table if not exists product_catalog_imports (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null unique,
  manifest_sha256 text not null,
  source_provider text not null,
  catalog_version text not null,
  actor_user_id uuid,
  status text not null default 'validated',
  summary jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  constraint chk_product_catalog_import_status check (status in ('validated', 'applied', 'rejected', 'rolled_back'))
);

create table if not exists product_engagement_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null,
  run_id uuid,
  collection_id uuid,
  search_request_id uuid,
  product_id uuid,
  external_source text,
  external_product_id text,
  shade_id uuid,
  event_type text not null,
  section text not null,
  position integer,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  context jsonb not null default '{}'::jsonb,
  constraint uq_product_engagement_event unique (user_id, event_id),
  constraint chk_product_engagement_event_type check (event_type in ('impression','product_open','search_submit','search_result_open','like','unlike','seller_outbound','hide')),
  constraint chk_product_engagement_section check (section in ('legacy','ar','seasonal','search','personalized','cohort','auradin')),
  constraint chk_product_engagement_position check (position is null or position between 0 and 1000),
  constraint chk_product_engagement_source check (
    (
      event_type = 'search_submit'
      and search_request_id is not null
      and product_id is null
      and shade_id is null
      and external_source is null
      and external_product_id is null
    )
    or (
      event_type <> 'search_submit'
      and (
        (product_id is not null and external_source is null and external_product_id is null)
        or (product_id is null and external_source is not null and external_product_id is not null)
      )
      and (shade_id is null or product_id is not null)
    )
  ),
  constraint chk_product_engagement_external_source check (
    (external_source is null and external_product_id is null)
    or (
      external_source in ('naver_shopping_search', 'auradin_search', 'auradin_catalog')
      and char_length(external_product_id) between 1 and 160
    )
  )
);

alter table product_engagement_events
  add column if not exists external_source text,
  add column if not exists external_product_id text;

alter table product_engagement_events
  drop constraint if exists chk_product_engagement_source,
  drop constraint if exists chk_product_engagement_external_source,
  add constraint chk_product_engagement_source check (
    (
      event_type = 'search_submit'
      and search_request_id is not null
      and product_id is null
      and shade_id is null
      and external_source is null
      and external_product_id is null
    )
    or (
      event_type <> 'search_submit'
      and (
        (product_id is not null and external_source is null and external_product_id is null)
        or (product_id is null and external_source is not null and external_product_id is not null)
      )
      and (shade_id is null or product_id is not null)
    )
  ),
  add constraint chk_product_engagement_external_source check (
    (external_source is null and external_product_id is null)
    or (
      external_source in ('naver_shopping_search', 'auradin_search', 'auradin_catalog')
      and char_length(external_product_id) between 1 and 160
    )
  );

create table if not exists trend_keyword_candidates (
  id uuid primary key default gen_random_uuid(),
  normalized_keyword text not null,
  locale text not null default 'ko-KR',
  status text not null default 'observed',
  category_codes text[] not null default '{}',
  benefit_tags text[] not null default '{}',
  finish_tags text[] not null default '{}',
  confidence_score double precision not null default 0,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  qualified_at timestamptz,
  expires_at timestamptz,
  normalization_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_trend_keyword_candidate unique (locale, normalized_keyword),
  constraint chk_trend_keyword_candidate_status
    check (status in ('observed', 'qualified', 'rejected', 'suspended', 'expired')),
  constraint chk_trend_keyword_candidate_confidence check (confidence_score between 0 and 1),
  constraint chk_trend_keyword_candidate_window check (last_observed_at >= first_observed_at),
  constraint chk_trend_keyword_candidate_metadata check (jsonb_typeof(normalization_metadata) = 'object')
);

create table if not exists trend_source_observations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  source_name text not null,
  source_kind text not null,
  observed_at timestamptz not null,
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  document_count integer not null default 0,
  distinct_content_type_count integer not null default 0,
  distinct_user_count integer,
  baseline_7d double precision,
  baseline_28d double precision,
  current_value double precision,
  change_ratio double precision,
  z_score double precision,
  evidence_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint uq_trend_source_observation_evidence unique (candidate_id, source_name, evidence_hash),
  constraint chk_trend_source_observation_kind check (
    source_kind in ('content', 'search_trend', 'shopping_insight', 'internal_engagement', 'operator')
  ),
  constraint chk_trend_source_observation_window check (window_ended_at > window_started_at),
  constraint chk_trend_source_observation_counts check (
    document_count >= 0
    and distinct_content_type_count >= 0
    and (distinct_user_count is null or distinct_user_count >= 0)
  ),
  constraint chk_trend_source_observation_hash check (evidence_hash ~ '^[0-9a-f]{64}$'),
  constraint chk_trend_source_observation_metadata check (jsonb_typeof(source_metadata) = 'object')
);

comment on table trend_source_observations is
  'Stores aggregate counts and content hashes only; fetched article/blog/cafe bodies and raw user search text are not retained.';

create table if not exists weather_region_snapshots (
  id uuid primary key default gen_random_uuid(),
  region_code text not null,
  region_label text not null,
  source_name text not null default 'kma_short_term_forecast',
  source_updated_at timestamptz not null,
  forecast_at timestamptz not null,
  expires_at timestamptz not null,
  temperature_c double precision,
  humidity_percent smallint,
  precipitation_probability_percent smallint,
  precipitation_mm double precision,
  wind_speed_mps double precision,
  weather_code text,
  weather_summary text,
  created_at timestamptz not null default now(),
  constraint uq_weather_region_snapshot unique (region_code, source_name, forecast_at),
  constraint chk_weather_region_snapshot_region check (
    region_code in ('KR-00','KR-11','KR-26','KR-27','KR-28','KR-29','KR-30','KR-31','KR-41','KR-42','KR-43','KR-44','KR-45','KR-46','KR-47','KR-48','KR-49','KR-50')
  ),
  constraint chk_weather_region_snapshot_window check (expires_at > forecast_at),
  constraint chk_weather_region_snapshot_temperature
    check (temperature_c is null or temperature_c between -80 and 60),
  constraint chk_weather_region_snapshot_humidity
    check (humidity_percent is null or humidity_percent between 0 and 100),
  constraint chk_weather_region_snapshot_precipitation_probability
    check (precipitation_probability_percent is null or precipitation_probability_percent between 0 and 100),
  constraint chk_weather_region_snapshot_precipitation
    check (precipitation_mm is null or precipitation_mm >= 0),
  constraint chk_weather_region_snapshot_wind check (wind_speed_mps is null or wind_speed_mps >= 0)
);

comment on table weather_region_snapshots is
  'Coarse Korean region forecasts only. Precise device latitude/longitude must never be persisted.';

create table if not exists product_attribute_evidence (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  attribute_key text not null,
  attribute_value jsonb not null,
  source_type text not null,
  source_reference text,
  evidence_fingerprint text not null,
  confidence_score double precision not null default 0,
  status text not null default 'unverified',
  observed_at timestamptz,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_product_attribute_evidence unique (product_id, attribute_key, evidence_fingerprint),
  constraint chk_product_attribute_evidence_key
    check (attribute_key in (
      'finish', 'texture', 'coverage', 'lightweight', 'hydrating', 'moisturizing',
      'oil_control', 'waterproof', 'longwear', 'transfer_resistant', 'skin_type_tags'
    )),
  constraint chk_product_attribute_evidence_source
    check (source_type in ('licensed_catalog', 'brand_official', 'manual_review', 'validated_inference')),
  constraint chk_product_attribute_evidence_hash check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint chk_product_attribute_evidence_confidence check (confidence_score between 0 and 1),
  constraint chk_product_attribute_evidence_status
    check (status in ('unverified', 'verified', 'rejected', 'expired'))
);

create table if not exists product_signal_hourly (
  bucket_started_at timestamptz not null,
  region_code text not null default 'KR-00',
  product_id uuid not null,
  impression_count integer not null default 0,
  product_open_count integer not null default 0,
  like_count integer not null default 0,
  unlike_count integer not null default 0,
  seller_outbound_count integer not null default 0,
  hide_count integer not null default 0,
  distinct_user_count integer not null default 0,
  position_adjusted_score double precision not null default 0,
  is_privacy_eligible boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (bucket_started_at, region_code, product_id),
  constraint chk_product_signal_hourly_region check (
    region_code in ('KR-00','KR-11','KR-26','KR-27','KR-28','KR-29','KR-30','KR-31','KR-41','KR-42','KR-43','KR-44','KR-45','KR-46','KR-47','KR-48','KR-49','KR-50')
  ),
  constraint chk_product_signal_hourly_counts check (
    impression_count >= 0
    and product_open_count >= 0
    and like_count >= 0
    and unlike_count >= 0
    and seller_outbound_count >= 0
    and hide_count >= 0
    and distinct_user_count >= 0
  ),
  constraint chk_product_signal_hourly_privacy_threshold check (
    not is_privacy_eligible or distinct_user_count >= 20
  )
);

create table if not exists search_intent_hourly (
  bucket_started_at timestamptz not null,
  locale text not null default 'ko-KR',
  region_code text not null default 'KR-00',
  intent_hash text not null,
  candidate_id uuid,
  search_count integer not null default 0,
  result_open_count integer not null default 0,
  distinct_user_count integer not null default 0,
  is_privacy_eligible boolean not null default false,
  datalab_confirmed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (bucket_started_at, locale, region_code, intent_hash),
  constraint chk_search_intent_hourly_region check (
    region_code in ('KR-00','KR-11','KR-26','KR-27','KR-28','KR-29','KR-30','KR-31','KR-41','KR-42','KR-43','KR-44','KR-45','KR-46','KR-47','KR-48','KR-49','KR-50')
  ),
  constraint chk_search_intent_hourly_hash check (intent_hash ~ '^[0-9a-f]{64}$'),
  constraint chk_search_intent_hourly_counts check (
    search_count >= 0 and result_open_count >= 0 and distinct_user_count >= 0
  ),
  constraint chk_search_intent_hourly_privacy_threshold check (
    not is_privacy_eligible or distinct_user_count >= 20
  )
);

comment on table search_intent_hourly is
  'Privacy-thresholded aggregate keyed by an opaque HMAC-SHA-256 intent hash. Raw search queries are prohibited.';

create table if not exists seasonal_serving_health_buckets (
  bucket_started_at timestamptz not null,
  locale text not null default 'ko-KR',
  region_code text not null default 'KR-00',
  request_count bigint not null default 0,
  fallback_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket_started_at, locale, region_code),
  constraint chk_seasonal_serving_health_region check (
    region_code in ('KR-00','KR-11','KR-26','KR-27','KR-28','KR-29','KR-30','KR-31','KR-41','KR-42','KR-43','KR-44','KR-45','KR-46','KR-47','KR-48','KR-49','KR-50')
  ),
  constraint chk_seasonal_serving_health_counts check (
    request_count >= 0 and fallback_count >= 0 and fallback_count <= request_count
  )
);

comment on table seasonal_serving_health_buckets is
  'Anonymous 15-minute serving health counters used for fallback-ratio alarms and automatic rollback.';

create table if not exists seasonal_ranking_models (
  id uuid primary key default gen_random_uuid(),
  model_version text not null unique,
  model_type text not null,
  status text not null default 'draft',
  feature_schema jsonb not null default '{}'::jsonb,
  coefficients jsonb not null default '{}'::jsonb,
  training_window_started_at timestamptz,
  training_window_ended_at timestamptz,
  training_impression_count integer not null default 0,
  training_action_count integer not null default 0,
  validation_metrics jsonb not null default '{}'::jsonb,
  ndcg_at_12 double precision,
  baseline_ndcg_at_12 double precision,
  validation_uplift double precision,
  activated_by_service_principal_id uuid,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_seasonal_ranking_model_type check (model_type in ('rrf', 'logistic')),
  constraint chk_seasonal_ranking_model_status check (status in ('draft', 'shadow', 'active', 'retired', 'failed')),
  constraint chk_seasonal_ranking_model_counts
    check (training_impression_count >= 0 and training_action_count >= 0),
  constraint chk_seasonal_ranking_model_window check (
    training_window_started_at is null
    or training_window_ended_at is null
    or training_window_ended_at > training_window_started_at
  ),
  constraint chk_seasonal_ranking_model_feature_schema check (jsonb_typeof(feature_schema) = 'object'),
  constraint chk_seasonal_ranking_model_coefficients check (jsonb_typeof(coefficients) = 'object'),
  constraint chk_seasonal_ranking_model_validation_metrics check (jsonb_typeof(validation_metrics) = 'object')
);

create table if not exists seasonal_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  trigger_type text not null,
  status text not null default 'queued',
  shadow_mode boolean not null default true,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  algorithm_version text not null,
  auto_publish_policy_version text,
  input_fingerprint text,
  service_principal_id uuid,
  ranking_model_id uuid,
  step_results jsonb not null default '{}'::jsonb,
  source_usage jsonb not null default '{}'::jsonb,
  bedrock_invocation_count smallint not null default 0,
  bedrock_input_tokens integer not null default 0,
  bedrock_output_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  constraint chk_seasonal_pipeline_run_trigger check (trigger_type in ('scheduled', 'manual', 'retry', 'health')),
  constraint chk_seasonal_pipeline_run_status
    check (status in ('queued', 'running', 'succeeded', 'failed', 'skipped')),
  constraint chk_seasonal_pipeline_run_window check (
    completed_at is null or started_at is null or completed_at >= started_at
  ),
  constraint chk_seasonal_pipeline_run_fingerprint check (
    input_fingerprint is null or input_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint chk_seasonal_pipeline_run_json check (
    jsonb_typeof(step_results) = 'object' and jsonb_typeof(source_usage) = 'object'
  ),
  constraint chk_seasonal_pipeline_run_bedrock_budget check (
    bedrock_invocation_count between 0 and 1
    and bedrock_input_tokens between 0 and 8000
    and bedrock_output_tokens between 0 and 800
  ),
  constraint chk_seasonal_pipeline_run_cost check (estimated_cost_usd >= 0)
);

create table if not exists trend_external_call_quotas (
  provider text not null,
  period_start timestamptz not null,
  period_kind text not null,
  call_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, period_start, period_kind),
  constraint chk_trend_external_call_quota_provider check (
    provider in ('naver', 'naver_search', 'naver_datalab', 'kma', 'bedrock')
  ),
  constraint chk_trend_external_call_quota_period check (period_kind in ('hour', 'day', 'month')),
  constraint chk_trend_external_call_quota_count check (call_count >= 0)
);

alter table trend_external_call_quotas
  drop constraint if exists chk_trend_external_call_quota_provider,
  add constraint chk_trend_external_call_quota_provider check (
    provider in ('naver', 'naver_search', 'naver_datalab', 'kma', 'bedrock')
  );

create table if not exists seasonal_auto_publish_audit_log (
  id bigserial primary key,
  pipeline_run_id uuid not null,
  collection_id uuid,
  previous_collection_id uuid,
  service_principal_id uuid not null,
  policy_version text not null,
  decision text not null,
  input_fingerprint text not null,
  gate_results jsonb not null default '{}'::jsonb,
  reason_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint chk_seasonal_auto_publish_decision
    check (decision in ('published', 'blocked', 'skipped', 'rolled_back')),
  constraint chk_seasonal_auto_publish_fingerprint
    check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint chk_seasonal_auto_publish_decision_refs check (
    (decision='published' and collection_id is not null)
    or (decision='rolled_back' and collection_id is not null and previous_collection_id is not null)
    or decision in ('blocked','skipped')
  ),
  constraint chk_seasonal_auto_publish_gate_results check (jsonb_typeof(gate_results) = 'object')
);

comment on table seasonal_auto_publish_audit_log is
  'Append-only evidence for automated publish gates and rollback decisions.';

create table if not exists product_preference_profiles (
  user_id uuid primary key,
  profile_version text not null,
  preference_payload jsonb not null default '{}'::jsonb,
  source_event_count integer not null default 0,
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint chk_product_preference_event_count check (source_event_count >= 0)
);

create table if not exists product_request_rate_limits (
  user_id uuid not null,
  scope text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, scope),
  constraint chk_product_request_rate_scope check (scope in ('recommendation','search','like','event','detail','outbound','privacy')),
  constraint chk_product_request_rate_count check (request_count >= 0)
);

create table if not exists product_color_cohort_memberships (
  user_id uuid primary key,
  cohort_key text not null,
  bucket_version text not null,
  contribution_count integer not null default 0,
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint chk_product_cohort_contribution check (contribution_count between 0 and 100)
);

create table if not exists ar_filters (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,
  category filter_category not null,
  title text not null,
  subtitle text,
  intensity_label text,
  preview_media_id uuid,
  source_analysis_report_id uuid,
  source_filter_extraction_id uuid,
  filter_payload jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table ar_filters is 'ARMakeupGuideData. facePartIds, colorOptions, typeOptions, textureOptions are stored in filter_payload.';

create table if not exists user_ar_filter_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  filter_id uuid not null,
  selected_face_part face_part,
  selected_color_id text,
  selected_type_id text,
  selected_texture_id text,
  guide_mode text,
  comparison_mode text,
  is_overlay_visible boolean not null default true,
  landmarks jsonb not null default '[]'::jsonb,
  adjustments jsonb not null default '{}'::jsonb,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table user_ar_filter_states is 'ARFilterLocation and ARFilterStyle current/saved customization state.';

create table if not exists filter_extraction_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  photo_capture_id uuid,
  result_media_id uuid,
  status job_status not null default 'completed',
  title text not null,
  subtitle text,
  tags text[],
  accuracy integer,
  model_version text,
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint chk_filter_extraction_accuracy check (accuracy is null or accuracy between 0 and 100)
);

comment on table filter_extraction_reports is 'FilterUpload/Loading/Result/TryOn/Save/RecipeDetail. palette, points, loadingSteps, recipeItems live in result_payload.';

create table if not exists makeup_feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  photo_capture_id uuid,
  uploaded_media_id uuid,
  source media_source_type not null,
  source_label text,
  score integer,
  status job_status not null default 'completed',
  model_version text,
  feedback_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint chk_makeup_feedback_score check (score is null or score between 0 and 100)
);

comment on table makeup_feedback_reports is 'FeedbackResult/Guide/Tip. summaryBadges, callouts, points, strengths live in feedback_payload.';

create table if not exists user_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  expo_push_token text not null,
  platform text not null,
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_user_push_devices_token unique (expo_push_token),
  constraint chk_user_push_devices_platform check (platform in ('ios', 'android'))
);

comment on table user_push_devices is 'Authenticated Expo Push Service device registrations. iOS delivery uses APNs without Firebase.';

create table if not exists app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  notification_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uq_app_notifications_user_dedupe unique (user_id, dedupe_key)
);

comment on table app_notifications is 'Unified in-app completion notifications for face analysis, makeup recommendation, extraction, and feedback reports.';

create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_notification_outbox_notification unique (notification_id),
  constraint chk_notification_outbox_status check (status in ('pending', 'sending', 'completed', 'failed')),
  constraint chk_notification_outbox_attempts check (attempts >= 0)
);

comment on table notification_outbox is 'Idempotent, retryable delivery state for Expo push notifications.';

create table if not exists home_hero_banners (
  id uuid primary key default gen_random_uuid(),
  eyebrow text,
  title text not null,
  description text,
  image_media_id uuid,
  cta_label text,
  cta_target text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table home_hero_banners is 'HomeData.hero. Controls the main carousel headline, copy, CTA, and fallback image.';

create table if not exists home_notices (
  id uuid primary key default gen_random_uuid(),
  hero_banner_id uuid,
  title text not null,
  description text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table home_notices is 'HomeData.hero.notices. Announcement rows attached to the home hero.';

create table if not exists home_trend_items (
  id uuid primary key default gen_random_uuid(),
  hero_banner_id uuid,
  target_style_id uuid,
  title text not null,
  tone text,
  image_media_id uuid,
  target_payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table home_trend_items is 'HomeData.hero.trends. Weekly trend carousel cards.';

create table if not exists home_filter_store_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null,
  image_media_id uuid,
  product_id uuid,
  ar_filter_id uuid,
  target_payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table home_filter_store_items is 'HomeData.filterStore. Home filter store cards can point to product catalog or AR filter catalog.';

create table if not exists home_recommended_looks (
  id uuid primary key default gen_random_uuid(),
  saved_makeup_style_id uuid,
  title text not null,
  description text not null,
  display_date date,
  image_media_id uuid,
  target_payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table home_recommended_looks is 'HomeData.recommendedLooks. Home recommended makeup look cards.';

create table if not exists user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  consent_type consent_type not null,
  version text not null,
  accepted boolean not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  metadata jsonb not null default '{}'::jsonb
);

alter table user_consents
  add column if not exists recorded_at timestamptz not null default clock_timestamp();

comment on table user_consents is 'Privacy, camera analysis, AI processing, third-party AI, marketing consent history.';

create table if not exists data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  target_type text not null,
  target_id uuid,
  status job_status not null default 'pending',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  reason text
);

comment on table data_deletion_requests is 'Account/photo/report/feedback/filter/product-personalization deletion request tracking.';

create table if not exists account_deletion_tombstones (
  subject_hash text primary key,
  auth_provider text not null,
  deleted_at timestamptz not null default now()
);

comment on table account_deletion_tombstones is 'Hashed auth identities of deleted accounts. Prevents a still-valid token from recreating deleted data.';

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table audit_logs is 'Operational audit trail for sensitive media and AI analysis data.';

-- -----------------------------------------------------------------------------
-- Community look feed
-- -----------------------------------------------------------------------------
create table if not exists community_threads (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null,
  category text not null,
  title text not null,
  body text not null default '',
  mood_tags text[] not null default '{}',
  situation_tags text[] not null default '{}',
  difficulty text,
  duration_minutes integer,
  product_usage jsonb not null default '{"base": [], "eye": [], "cheek": [], "lip": []}',
  like_count integer not null default 0,
  reply_count integer not null default 0,
  save_count integer not null default 0,
  view_count integer not null default 0,
  status text not null default 'active',
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_community_threads_category check (category in ('lookbook', 'question', 'product_combo', 'before_after')),
  constraint chk_community_threads_title check (char_length(trim(title)) between 1 and 30),
  constraint chk_community_threads_difficulty check (difficulty is null or difficulty in ('easy', 'medium', 'hard')),
  constraint chk_community_threads_duration check (duration_minutes is null or duration_minutes between 1 and 240),
  constraint chk_community_threads_counts check (like_count >= 0 and reply_count >= 0 and save_count >= 0 and view_count >= 0),
  constraint chk_community_threads_status check (status in ('active', 'hidden', 'deleted'))
);

comment on table community_threads is 'Look-first community feed posts. Trending is derived by sort, not stored as a category.';

create table if not exists community_thread_media (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  media_id uuid not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint chk_community_thread_media_sort_order check (sort_order between 0 and 3),
  constraint uq_community_thread_media_thread_media unique (thread_id, media_id),
  constraint uq_community_thread_media_thread_sort unique (thread_id, sort_order)
);

comment on table community_thread_media is 'Ordered 1-4 community thread images. sort_order 0 is the feed cover image.';

create table if not exists community_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  parent_reply_id uuid,
  author_user_id uuid not null,
  body text not null,
  like_count integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_community_replies_body check (char_length(trim(body)) between 1 and 1000),
  constraint chk_community_replies_like_count check (like_count >= 0),
  constraint chk_community_replies_status check (status in ('active', 'hidden', 'deleted'))
);

comment on table community_replies is 'Community comments with one-level nested replies enforced by API validation.';

create table if not exists community_thread_likes (
  user_id uuid not null,
  thread_id uuid not null,
  liked_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

create table if not exists community_thread_saves (
  user_id uuid not null,
  thread_id uuid not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

create table if not exists community_reply_likes (
  user_id uuid not null,
  reply_id uuid not null,
  liked_at timestamptz not null default now(),
  primary key (user_id, reply_id)
);

create table if not exists community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null,
  target_type text not null,
  target_thread_id uuid,
  target_reply_id uuid,
  reason text not null,
  detail text,
  created_at timestamptz not null default now(),
  constraint chk_community_reports_target_type check (target_type in ('thread', 'reply')),
  constraint chk_community_reports_reason check (reason in ('spam', 'abuse', 'privacy', 'other')),
  constraint chk_community_reports_target check (
    (target_type = 'thread' and target_thread_id is not null and target_reply_id is null)
    or (target_type = 'reply' and target_reply_id is not null and target_thread_id is null)
  ),
  constraint uq_community_reports_reporter_thread unique (reporter_user_id, target_thread_id),
  constraint uq_community_reports_reporter_reply unique (reporter_user_id, target_reply_id)
);

comment on table community_reports is 'Duplicate-safe moderation reports for community threads and replies.';
create table if not exists community_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  thread_id uuid,
  event_type text not null,
  search_query text,
  dwell_ms integer,
  created_at timestamptz not null default now(),
  constraint chk_community_events_type check (
    event_type in ('impression', 'view', 'revisit', 'dwell', 'like', 'save', 'reply', 'slider', 'search')
  ),
  constraint chk_community_events_target check (
    (event_type = 'search' and search_query is not null)
    or (event_type <> 'search' and thread_id is not null)
  ),
  constraint chk_community_events_dwell_ms check (dwell_ms is null or dwell_ms >= 0)
);

comment on table community_events is 'Community behavior events for look recommendation signals.';

-- Embedding columns are repeated as idempotent alters so existing v1 databases are upgraded.
alter table community_threads add column if not exists embedding vector(1024);
alter table analysis_reports add column if not exists embedding vector(1024);
-- -----------------------------------------------------------------------------
-- Product recommendation V2 forward migration for existing installations.
alter table saved_makeup_styles add column if not exists client_request_id uuid;
update saved_makeup_styles set client_request_id = gen_random_uuid() where client_request_id is null;
alter table saved_makeup_styles alter column client_request_id set default gen_random_uuid();
alter table saved_makeup_styles alter column client_request_id set not null;
create unique index if not exists uq_saved_makeup_styles_user_request_idx
  on saved_makeup_styles (user_id, client_request_id);

alter table products add column if not exists source_provider text;
alter table products add column if not exists source_license_type text;
alter table products add column if not exists source_reference text;
alter table products add column if not exists license_status text not null default 'unverified';
alter table products add column if not exists license_valid_from timestamptz;
alter table products add column if not exists license_valid_until timestamptz;
alter table products add column if not exists allowed_uses text[] not null default '{}';
alter table products add column if not exists catalog_status text not null default 'draft';
alter table products add column if not exists catalog_version text not null default 'catalog_v2';

alter table user_product_likes add column if not exists source_shade_id uuid;

alter table product_recommendation_runs add column if not exists source_style_id uuid;
alter table product_recommendation_runs add column if not exists strategy text not null default 'legacy_v1';
alter table product_recommendation_runs add column if not exists algorithm_version text;
alter table product_recommendation_runs add column if not exists consent_snapshot jsonb not null default '{}'::jsonb;
alter table product_recommendation_runs add column if not exists expires_at timestamptz;
update product_recommendation_runs set expires_at = created_at + interval '30 days' where expires_at is null;
alter table product_recommendation_runs alter column expires_at set default (now() + interval '30 days');
alter table product_recommendation_runs alter column expires_at set not null;

-- Foreign keys
-- -----------------------------------------------------------------------------
alter table users
  drop constraint if exists fk_users_avatar_media,
  add constraint fk_users_avatar_media
  foreign key (avatar_media_id) references media_assets(id) on delete set null;

alter table media_assets
  drop constraint if exists fk_media_assets_owner_user,
  add constraint fk_media_assets_owner_user
  foreign key (owner_user_id) references users(id) on delete set null;

alter table photo_captures
  drop constraint if exists fk_photo_captures_user,
  add constraint fk_photo_captures_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_photo_captures_media,
  add constraint fk_photo_captures_media
  foreign key (media_id) references media_assets(id) on delete restrict;

alter table analysis_reports
  drop constraint if exists fk_analysis_reports_user,
  add constraint fk_analysis_reports_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_analysis_reports_photo_capture,
  add constraint fk_analysis_reports_photo_capture
  foreign key (photo_capture_id) references photo_captures(id) on delete set null,
  drop constraint if exists fk_analysis_reports_source_media,
  add constraint fk_analysis_reports_source_media
  foreign key (source_media_id) references media_assets(id) on delete set null,
  drop constraint if exists fk_analysis_reports_preview_media,
  add constraint fk_analysis_reports_preview_media
  foreign key (preview_media_id) references media_assets(id) on delete set null;

alter table hair_analyses
  drop constraint if exists fk_hair_analyses_user,
  add constraint fk_hair_analyses_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_hair_analyses_photo_capture,
  add constraint fk_hair_analyses_photo_capture
  foreign key (photo_capture_id) references photo_captures(id) on delete set null,
  drop constraint if exists fk_hair_analyses_source_media,
  add constraint fk_hair_analyses_source_media
  foreign key (source_media_id) references media_assets(id) on delete restrict,
  drop constraint if exists fk_hair_analyses_mask_media,
  add constraint fk_hair_analyses_mask_media
  foreign key (mask_media_id) references media_assets(id) on delete set null;

alter table hair_simulations
  drop constraint if exists fk_hair_simulations_analysis,
  add constraint fk_hair_simulations_analysis
  foreign key (analysis_id) references hair_analyses(id) on delete cascade,
  drop constraint if exists fk_hair_simulations_user,
  add constraint fk_hair_simulations_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_hair_simulations_result_media,
  add constraint fk_hair_simulations_result_media
  foreign key (result_media_id) references media_assets(id) on delete set null;

alter table saved_makeup_styles
  drop constraint if exists fk_saved_makeup_styles_user,
  add constraint fk_saved_makeup_styles_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_saved_makeup_styles_source_analysis_report,
  add constraint fk_saved_makeup_styles_source_analysis_report
  foreign key (source_analysis_report_id) references analysis_reports(id) on delete set null,
  drop constraint if exists fk_saved_makeup_styles_source_filter_extraction,
  add constraint fk_saved_makeup_styles_source_filter_extraction
  foreign key (source_filter_extraction_id) references filter_extraction_reports(id) on delete set null,
  drop constraint if exists fk_saved_makeup_styles_source_media,
  add constraint fk_saved_makeup_styles_source_media
  foreign key (source_media_id) references media_assets(id) on delete set null,
  drop constraint if exists fk_saved_makeup_styles_thumbnail_media,
  add constraint fk_saved_makeup_styles_thumbnail_media
  foreign key (thumbnail_media_id) references media_assets(id) on delete set null;

alter table products
  drop constraint if exists fk_products_image_media,
  add constraint fk_products_image_media
  foreign key (image_media_id) references media_assets(id) on delete set null;

alter table user_product_likes
  drop constraint if exists fk_user_product_likes_user,
  add constraint fk_user_product_likes_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_user_product_likes_product,
  add constraint fk_user_product_likes_product
  foreign key (product_id) references products(id) on delete cascade,
  drop constraint if exists fk_user_product_likes_source_shade,
  add constraint fk_user_product_likes_source_shade
  foreign key (source_shade_id) references product_shades(id) on delete set null;

alter table user_product_likes
  drop constraint if exists fk_user_product_likes_shade_product,
  add constraint fk_user_product_likes_shade_product
  foreign key (source_shade_id, product_id) references product_shades(id, product_id)
  on delete set null (source_shade_id);

alter table external_product_likes
  drop constraint if exists fk_external_product_likes_user,
  add constraint fk_external_product_likes_user
    foreign key (user_id) references users(id) on delete cascade;

alter table product_recommendation_runs
  drop constraint if exists fk_product_recommendation_runs_user,
  add constraint fk_product_recommendation_runs_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_product_recommendation_runs_source_analysis_report,
  add constraint fk_product_recommendation_runs_source_analysis_report
  foreign key (source_analysis_report_id) references analysis_reports(id) on delete set null,
  drop constraint if exists fk_product_recommendation_runs_look_media,
  add constraint fk_product_recommendation_runs_look_media
  foreign key (look_media_id) references media_assets(id) on delete set null,
  drop constraint if exists fk_product_recommendation_runs_source_style,
  add constraint fk_product_recommendation_runs_source_style
  foreign key (source_style_id) references saved_makeup_styles(id) on delete cascade;

alter table product_shades
  drop constraint if exists fk_product_shades_product,
  add constraint fk_product_shades_product foreign key (product_id) references products(id) on delete cascade;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='uq_product_shades_id_product') then
    alter table product_shades
      add constraint uq_product_shades_id_product unique (id, product_id);
  end if;
end $$;

alter table product_assets
  drop constraint if exists fk_product_assets_product,
  add constraint fk_product_assets_product foreign key (product_id) references products(id) on delete cascade,
  drop constraint if exists fk_product_assets_shade,
  add constraint fk_product_assets_shade foreign key (shade_id) references product_shades(id) on delete cascade,
  drop constraint if exists fk_product_assets_media,
  add constraint fk_product_assets_media foreign key (media_id) references media_assets(id) on delete set null;

alter table product_assets
  drop constraint if exists fk_product_assets_shade_product,
  add constraint fk_product_assets_shade_product
  foreign key (shade_id, product_id) references product_shades(id, product_id) on delete cascade;

alter table product_offers
  drop constraint if exists fk_product_offers_product,
  add constraint fk_product_offers_product foreign key (product_id) references products(id) on delete cascade,
  drop constraint if exists fk_product_offers_shade,
  add constraint fk_product_offers_shade foreign key (shade_id) references product_shades(id) on delete set null;

alter table product_offers
  drop constraint if exists fk_product_offers_shade_product,
  add constraint fk_product_offers_shade_product
  foreign key (shade_id, product_id) references product_shades(id, product_id)
  on delete set null (shade_id);

alter table product_seasonal_collections
  add column if not exists source_name text not null default 'editorial',
  add column if not exists source_updated_at timestamptz,
  add column if not exists trend_keywords text[] not null default '{}',
  add column if not exists reason_codes text[] not null default '{}',
  add column if not exists confidence_score double precision not null default 0.5,
  add column if not exists region_code text not null default 'KR-00',
  add column if not exists region_label text not null default '전국',
  add column if not exists algorithm_version text not null default 'seasonal_v1',
  add column if not exists input_fingerprint text,
  add column if not exists freshness_status text not null default 'fresh',
  add column if not exists auto_publish_policy_version text,
  add column if not exists pipeline_run_id uuid,
  add column if not exists published_by_service_principal_id uuid,
  add column if not exists next_evaluation_at timestamptz,
  drop constraint if exists chk_product_seasonal_collection_region,
  add constraint chk_product_seasonal_collection_region check (
    region_code in ('KR-00','KR-11','KR-26','KR-27','KR-28','KR-29','KR-30','KR-31','KR-41','KR-42','KR-43','KR-44','KR-45','KR-46','KR-47','KR-48','KR-49','KR-50')
  ),
  drop constraint if exists chk_product_seasonal_collection_confidence,
  add constraint chk_product_seasonal_collection_confidence check (confidence_score between 0 and 1),
  drop constraint if exists chk_product_seasonal_collection_fingerprint,
  add constraint chk_product_seasonal_collection_fingerprint check (
    input_fingerprint is null or input_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  drop constraint if exists chk_product_seasonal_collection_freshness,
  add constraint chk_product_seasonal_collection_freshness
    check (freshness_status in ('fresh', 'stale', 'fallback')),
  drop constraint if exists chk_product_seasonal_two_person_publish,
  add constraint chk_product_seasonal_two_person_publish check (
    status <> 'published'
    or (
      reviewed_by is not null
      and published_by is not null
      and created_by <> published_by
      and reviewed_by <> published_by
      and published_by_service_principal_id is null
    )
    or (
      created_by is null
      and reviewed_by is null
      and published_by is null
      and published_by_service_principal_id is not null
      and auto_publish_policy_version is not null
      and pipeline_run_id is not null
    )
  ),
  drop constraint if exists fk_product_seasonal_created_by,
  add constraint fk_product_seasonal_created_by foreign key (created_by) references users(id) on delete set null,
  drop constraint if exists fk_product_seasonal_reviewed_by,
  add constraint fk_product_seasonal_reviewed_by foreign key (reviewed_by) references users(id) on delete set null,
  drop constraint if exists fk_product_seasonal_published_by,
  add constraint fk_product_seasonal_published_by foreign key (published_by) references users(id) on delete set null,
  drop constraint if exists fk_product_seasonal_previous_revision,
  add constraint fk_product_seasonal_previous_revision foreign key (previous_revision_id) references product_seasonal_collections(id) on delete set null,
  drop constraint if exists fk_product_seasonal_pipeline_run,
  add constraint fk_product_seasonal_pipeline_run foreign key (pipeline_run_id) references seasonal_pipeline_runs(id) on delete set null,
  drop constraint if exists fk_product_seasonal_service_publisher,
  add constraint fk_product_seasonal_service_publisher
    foreign key (published_by_service_principal_id)
    references product_recommendation_service_principals(id) on delete restrict;

alter table product_recommendation_operators
  drop constraint if exists fk_product_recommendation_operator_user,
  add constraint fk_product_recommendation_operator_user foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_product_recommendation_operator_granted_by,
  add constraint fk_product_recommendation_operator_granted_by foreign key (granted_by) references users(id) on delete set null;

alter table product_recommendation_service_principals
  drop constraint if exists fk_product_recommendation_service_principal_creator,
  add constraint fk_product_recommendation_service_principal_creator
    foreign key (created_by) references users(id) on delete set null;

alter table product_seasonal_collection_items
  add column if not exists reason_codes text[] not null default '{}',
  add column if not exists match_score double precision not null default 0,
  add column if not exists score_components jsonb not null default '{}'::jsonb,
  add column if not exists ranking_model_version text,
  drop constraint if exists chk_product_seasonal_item_match_score,
  add constraint chk_product_seasonal_item_match_score check (match_score >= 0),
  drop constraint if exists chk_product_seasonal_item_score_components,
  add constraint chk_product_seasonal_item_score_components
    check (jsonb_typeof(score_components) = 'object'),
  drop constraint if exists fk_product_seasonal_items_collection,
  add constraint fk_product_seasonal_items_collection foreign key (collection_id) references product_seasonal_collections(id) on delete cascade,
  drop constraint if exists fk_product_seasonal_items_product,
  add constraint fk_product_seasonal_items_product foreign key (product_id) references products(id) on delete restrict,
  drop constraint if exists fk_product_seasonal_items_shade,
  add constraint fk_product_seasonal_items_shade foreign key (shade_id) references product_shades(id) on delete set null;

alter table product_seasonal_collection_items
  drop constraint if exists fk_product_seasonal_items_shade_product,
  add constraint fk_product_seasonal_items_shade_product
  foreign key (shade_id, product_id) references product_shades(id, product_id)
  on delete set null (shade_id);

alter table product_catalog_imports
  drop constraint if exists fk_product_catalog_imports_actor,
  add constraint fk_product_catalog_imports_actor foreign key (actor_user_id) references users(id) on delete set null;

alter table product_engagement_events
  drop constraint if exists fk_product_engagement_user,
  add constraint fk_product_engagement_user foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_product_engagement_run,
  add constraint fk_product_engagement_run foreign key (run_id) references product_recommendation_runs(id) on delete set null,
  drop constraint if exists fk_product_engagement_collection,
  add constraint fk_product_engagement_collection foreign key (collection_id) references product_seasonal_collections(id) on delete set null,
  drop constraint if exists fk_product_engagement_product,
  add constraint fk_product_engagement_product foreign key (product_id) references products(id) on delete cascade,
  drop constraint if exists fk_product_engagement_shade,
  add constraint fk_product_engagement_shade foreign key (shade_id) references product_shades(id) on delete set null;

alter table product_engagement_events
  drop constraint if exists fk_product_engagement_shade_product,
  add constraint fk_product_engagement_shade_product
  foreign key (shade_id, product_id) references product_shades(id, product_id)
  on delete set null (shade_id);

alter table trend_source_observations
  drop constraint if exists fk_trend_source_observation_candidate,
  add constraint fk_trend_source_observation_candidate
    foreign key (candidate_id) references trend_keyword_candidates(id) on delete cascade;

alter table product_attribute_evidence
  drop constraint if exists fk_product_attribute_evidence_product,
  add constraint fk_product_attribute_evidence_product
    foreign key (product_id) references products(id) on delete cascade;

alter table product_signal_hourly
  drop constraint if exists chk_product_signal_hourly_privacy_threshold,
  add constraint chk_product_signal_hourly_privacy_threshold check (
    not is_privacy_eligible or distinct_user_count >= 20
  ),
  drop constraint if exists fk_product_signal_hourly_product,
  add constraint fk_product_signal_hourly_product
    foreign key (product_id) references products(id) on delete cascade;

alter table search_intent_hourly
  drop constraint if exists chk_search_intent_hourly_privacy_threshold,
  add constraint chk_search_intent_hourly_privacy_threshold check (
    not is_privacy_eligible or distinct_user_count >= 20
  ),
  drop constraint if exists fk_search_intent_hourly_candidate,
  add constraint fk_search_intent_hourly_candidate
    foreign key (candidate_id) references trend_keyword_candidates(id) on delete set null;

alter table seasonal_ranking_models
  drop constraint if exists fk_seasonal_ranking_model_service_principal,
  add constraint fk_seasonal_ranking_model_service_principal
    foreign key (activated_by_service_principal_id)
    references product_recommendation_service_principals(id) on delete restrict;

alter table seasonal_pipeline_runs
  drop constraint if exists chk_seasonal_pipeline_run_trigger,
  add constraint chk_seasonal_pipeline_run_trigger
    check (trigger_type in ('scheduled', 'manual', 'retry', 'health')),
  drop constraint if exists fk_seasonal_pipeline_run_service_principal,
  add constraint fk_seasonal_pipeline_run_service_principal
    foreign key (service_principal_id)
    references product_recommendation_service_principals(id) on delete restrict,
  drop constraint if exists fk_seasonal_pipeline_run_ranking_model,
  add constraint fk_seasonal_pipeline_run_ranking_model
    foreign key (ranking_model_id) references seasonal_ranking_models(id) on delete set null;

alter table seasonal_auto_publish_audit_log
  drop constraint if exists chk_seasonal_auto_publish_decision_refs,
  add constraint chk_seasonal_auto_publish_decision_refs check (
    (decision='published' and collection_id is not null)
    or (decision='rolled_back' and collection_id is not null and previous_collection_id is not null)
    or decision in ('blocked','skipped')
  ),
  drop constraint if exists fk_seasonal_auto_publish_pipeline_run,
  add constraint fk_seasonal_auto_publish_pipeline_run
    foreign key (pipeline_run_id) references seasonal_pipeline_runs(id) on delete restrict,
  drop constraint if exists fk_seasonal_auto_publish_collection,
  add constraint fk_seasonal_auto_publish_collection
    foreign key (collection_id) references product_seasonal_collections(id) on delete restrict,
  drop constraint if exists fk_seasonal_auto_publish_previous_collection,
  add constraint fk_seasonal_auto_publish_previous_collection
    foreign key (previous_collection_id) references product_seasonal_collections(id) on delete restrict,
  drop constraint if exists fk_seasonal_auto_publish_service_principal,
  add constraint fk_seasonal_auto_publish_service_principal
    foreign key (service_principal_id)
    references product_recommendation_service_principals(id) on delete restrict;

alter table product_preference_profiles
  drop constraint if exists fk_product_preference_profile_user,
  add constraint fk_product_preference_profile_user foreign key (user_id) references users(id) on delete cascade;

alter table product_request_rate_limits
  drop constraint if exists fk_product_request_rate_user,
  add constraint fk_product_request_rate_user foreign key (user_id) references users(id) on delete cascade;

alter table product_color_cohort_memberships
  drop constraint if exists fk_product_cohort_user,
  add constraint fk_product_cohort_user foreign key (user_id) references users(id) on delete cascade;

alter table ar_filters
  drop constraint if exists fk_ar_filters_preview_media,
  add constraint fk_ar_filters_preview_media
  foreign key (preview_media_id) references media_assets(id) on delete set null,
  drop constraint if exists fk_ar_filters_source_analysis_report,
  add constraint fk_ar_filters_source_analysis_report
  foreign key (source_analysis_report_id) references analysis_reports(id) on delete set null,
  drop constraint if exists fk_ar_filters_source_filter_extraction,
  add constraint fk_ar_filters_source_filter_extraction
  foreign key (source_filter_extraction_id) references filter_extraction_reports(id) on delete set null;

alter table user_ar_filter_states
  drop constraint if exists fk_user_ar_filter_states_user,
  add constraint fk_user_ar_filter_states_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_user_ar_filter_states_filter,
  add constraint fk_user_ar_filter_states_filter
  foreign key (filter_id) references ar_filters(id) on delete cascade;

alter table filter_extraction_reports
  drop constraint if exists fk_filter_extraction_reports_user,
  add constraint fk_filter_extraction_reports_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_filter_extraction_reports_photo_capture,
  add constraint fk_filter_extraction_reports_photo_capture
  foreign key (photo_capture_id) references photo_captures(id) on delete set null,
  drop constraint if exists fk_filter_extraction_reports_result_media,
  add constraint fk_filter_extraction_reports_result_media
  foreign key (result_media_id) references media_assets(id) on delete set null;

alter table makeup_feedback_reports
  drop constraint if exists fk_makeup_feedback_reports_user,
  add constraint fk_makeup_feedback_reports_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_makeup_feedback_reports_photo_capture,
  add constraint fk_makeup_feedback_reports_photo_capture
  foreign key (photo_capture_id) references photo_captures(id) on delete set null,
  drop constraint if exists fk_makeup_feedback_reports_uploaded_media,
  add constraint fk_makeup_feedback_reports_uploaded_media
  foreign key (uploaded_media_id) references media_assets(id) on delete set null;

alter table user_push_devices
  drop constraint if exists fk_user_push_devices_user,
  add constraint fk_user_push_devices_user
  foreign key (user_id) references users(id) on delete cascade;

alter table app_notifications
  drop constraint if exists fk_app_notifications_user,
  add constraint fk_app_notifications_user
  foreign key (user_id) references users(id) on delete cascade;

alter table notification_outbox
  drop constraint if exists fk_notification_outbox_notification,
  add constraint fk_notification_outbox_notification
  foreign key (notification_id) references app_notifications(id) on delete cascade;

alter table home_hero_banners
  drop constraint if exists fk_home_hero_banners_image_media,
  add constraint fk_home_hero_banners_image_media
  foreign key (image_media_id) references media_assets(id) on delete set null;

alter table home_notices
  drop constraint if exists fk_home_notices_hero_banner,
  add constraint fk_home_notices_hero_banner
  foreign key (hero_banner_id) references home_hero_banners(id) on delete cascade;

alter table home_trend_items
  drop constraint if exists fk_home_trend_items_hero_banner,
  add constraint fk_home_trend_items_hero_banner
  foreign key (hero_banner_id) references home_hero_banners(id) on delete cascade,
  drop constraint if exists fk_home_trend_items_target_style,
  add constraint fk_home_trend_items_target_style
  foreign key (target_style_id) references saved_makeup_styles(id) on delete set null,
  drop constraint if exists fk_home_trend_items_image_media,
  add constraint fk_home_trend_items_image_media
  foreign key (image_media_id) references media_assets(id) on delete set null;

alter table home_filter_store_items
  drop constraint if exists fk_home_filter_store_items_image_media,
  add constraint fk_home_filter_store_items_image_media
  foreign key (image_media_id) references media_assets(id) on delete set null,
  drop constraint if exists fk_home_filter_store_items_product,
  add constraint fk_home_filter_store_items_product
  foreign key (product_id) references products(id) on delete set null,
  drop constraint if exists fk_home_filter_store_items_ar_filter,
  add constraint fk_home_filter_store_items_ar_filter
  foreign key (ar_filter_id) references ar_filters(id) on delete set null;

alter table home_recommended_looks
  drop constraint if exists fk_home_recommended_looks_saved_makeup_style,
  add constraint fk_home_recommended_looks_saved_makeup_style
  foreign key (saved_makeup_style_id) references saved_makeup_styles(id) on delete set null,
  drop constraint if exists fk_home_recommended_looks_image_media,
  add constraint fk_home_recommended_looks_image_media
  foreign key (image_media_id) references media_assets(id) on delete set null;

alter table community_threads
  drop constraint if exists fk_community_threads_author,
  add constraint fk_community_threads_author
  foreign key (author_user_id) references users(id) on delete cascade;

alter table community_thread_media
  drop constraint if exists fk_community_thread_media_thread,
  add constraint fk_community_thread_media_thread
  foreign key (thread_id) references community_threads(id) on delete cascade,
  drop constraint if exists fk_community_thread_media_media,
  add constraint fk_community_thread_media_media
  foreign key (media_id) references media_assets(id) on delete restrict;

alter table community_replies
  drop constraint if exists fk_community_replies_thread,
  add constraint fk_community_replies_thread
  foreign key (thread_id) references community_threads(id) on delete cascade,
  drop constraint if exists fk_community_replies_parent,
  add constraint fk_community_replies_parent
  foreign key (parent_reply_id) references community_replies(id) on delete cascade,
  drop constraint if exists fk_community_replies_author,
  add constraint fk_community_replies_author
  foreign key (author_user_id) references users(id) on delete cascade;

alter table community_thread_likes
  drop constraint if exists fk_community_thread_likes_user,
  add constraint fk_community_thread_likes_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_community_thread_likes_thread,
  add constraint fk_community_thread_likes_thread
  foreign key (thread_id) references community_threads(id) on delete cascade;

alter table community_thread_saves
  drop constraint if exists fk_community_thread_saves_user,
  add constraint fk_community_thread_saves_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_community_thread_saves_thread,
  add constraint fk_community_thread_saves_thread
  foreign key (thread_id) references community_threads(id) on delete cascade;

alter table community_reply_likes
  drop constraint if exists fk_community_reply_likes_user,
  add constraint fk_community_reply_likes_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_community_reply_likes_reply,
  add constraint fk_community_reply_likes_reply
  foreign key (reply_id) references community_replies(id) on delete cascade;

alter table community_reports
  drop constraint if exists fk_community_reports_reporter,
  add constraint fk_community_reports_reporter
  foreign key (reporter_user_id) references users(id) on delete cascade,
  drop constraint if exists fk_community_reports_thread,
  add constraint fk_community_reports_thread
  foreign key (target_thread_id) references community_threads(id) on delete cascade,
  drop constraint if exists fk_community_reports_reply,
  add constraint fk_community_reports_reply
  foreign key (target_reply_id) references community_replies(id) on delete cascade;

alter table community_events
  drop constraint if exists fk_community_events_user,
  add constraint fk_community_events_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_community_events_thread,
  add constraint fk_community_events_thread
  foreign key (thread_id) references community_threads(id) on delete cascade;
alter table user_consents
  drop constraint if exists fk_user_consents_user,
  add constraint fk_user_consents_user
  foreign key (user_id) references users(id) on delete cascade;

alter table data_deletion_requests
  drop constraint if exists fk_data_deletion_requests_user,
  add constraint fk_data_deletion_requests_user
  foreign key (user_id) references users(id) on delete cascade;

alter table audit_logs
  drop constraint if exists fk_audit_logs_actor_user,
  add constraint fk_audit_logs_actor_user
  foreign key (actor_user_id) references users(id) on delete set null;

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create unique index if not exists idx_users_provider_sub
  on users (auth_provider, oauth_sub)
  where oauth_sub is not null and deleted_at is null;

create index if not exists idx_users_email on users (email);
create index if not exists idx_account_deletion_tombstones_deleted_at on account_deletion_tombstones (deleted_at);
create index if not exists idx_media_assets_owner_created on media_assets (owner_user_id, created_at desc);
create index if not exists idx_photo_captures_user_type_created on photo_captures (user_id, capture_type, created_at desc);
create index if not exists idx_analysis_reports_user_analyzed on analysis_reports (user_id, analyzed_at desc);
create index if not exists idx_analysis_stage_runs_report_stage_created
  on analysis_stage_runs (report_id, stage, created_at desc);
create index if not exists idx_analysis_stage_runs_completed_cache
  on analysis_stage_runs (stage, input_hash, schema_version, prompt_version, model)
  where status = 'completed';
create unique index if not exists uq_analysis_stage_runs_one_processing
  on analysis_stage_runs (report_id, stage) where status = 'processing';
create index if not exists idx_hair_analyses_user_created on hair_analyses (user_id, created_at desc);
create index if not exists idx_hair_analyses_status_created on hair_analyses (status, created_at);
create index if not exists idx_hair_analyses_expires on hair_analyses (expires_at) where status <> 'expired';
create index if not exists idx_hair_simulations_analysis_created on hair_simulations (analysis_id, created_at desc);
create index if not exists idx_hair_simulations_user_created on hair_simulations (user_id, created_at desc);
create index if not exists idx_hair_simulations_expires on hair_simulations (expires_at) where saved_at is null and status <> 'expired';
create index if not exists idx_saved_makeup_styles_user_saved on saved_makeup_styles (user_id, saved_at desc);
create index if not exists idx_saved_makeup_styles_source_analysis on saved_makeup_styles (source_analysis_report_id);
create index if not exists idx_saved_makeup_styles_source_filter on saved_makeup_styles (source_filter_extraction_id);
create index if not exists idx_products_category_active on products (category, is_active);
create index if not exists idx_products_catalog_eligible on products (catalog_status, license_status, category) where is_active = true;
create index if not exists idx_products_name_trgm on products using gin (product_name gin_trgm_ops);
create index if not exists idx_products_brand_trgm on products using gin (brand_name gin_trgm_ops);
create index if not exists idx_user_product_likes_user_liked on user_product_likes (user_id, liked_at desc);
create index if not exists idx_external_product_likes_user_liked on external_product_likes (user_id, liked_at desc);
create index if not exists idx_external_product_likes_source_product on external_product_likes (external_source, external_product_id, liked_at desc);
create index if not exists idx_product_shades_candidate on product_shades (product_region, finish, lab_l) where is_active = true;
create index if not exists idx_product_shades_product_active on product_shades (product_id, is_active);
create index if not exists idx_product_assets_product_active on product_assets (product_id, asset_type, is_active);
create index if not exists idx_product_assets_valid_until on product_assets (valid_until) where is_active = true;
create index if not exists idx_product_offers_product_active on product_offers (product_id, availability_status, is_active);
create index if not exists idx_product_offers_valid_until on product_offers (valid_until) where is_active = true;
create index if not exists idx_product_seasonal_public on product_seasonal_collections (locale, status, valid_from, valid_until);
create index if not exists idx_product_seasonal_region_public
  on product_seasonal_collections (locale, region_code, status, valid_from desc, valid_until);
create index if not exists idx_product_seasonal_source_updated on product_seasonal_collections (source_updated_at desc);
create index if not exists idx_product_seasonal_input_fingerprint
  on product_seasonal_collections (locale, region_code, input_fingerprint)
  where input_fingerprint is not null;
-- Older writers could leave more than one published revision for the same slug.
-- Deterministically keep the newest revision before enforcing the production invariant.
with duplicate_published as (
  select id,row_number() over (
    partition by slug
    order by revision desc,published_at desc nulls last,created_at desc,id desc
  ) as published_rank
  from product_seasonal_collections
  where status='published'
)
update product_seasonal_collections collection set
  status='suspended',
  freshness_status='stale',
  suspension_reason='superseded_by_schema_repair',
  updated_at=now()
from duplicate_published duplicate
where collection.id=duplicate.id and duplicate.published_rank>1;
create unique index if not exists uq_product_seasonal_single_published
  on product_seasonal_collections (slug)
  where status='published';
create index if not exists idx_product_recommendation_operators_active_roles
  on product_recommendation_operators using gin (roles) where is_active=true;
create index if not exists idx_product_recommendation_service_principals_active_roles
  on product_recommendation_service_principals using gin (roles) where status='active';
create index if not exists idx_product_seasonal_items_order on product_seasonal_collection_items (collection_id, position);
create index if not exists idx_product_engagement_user_occurred on product_engagement_events (user_id, occurred_at desc);
create index if not exists idx_product_engagement_occurred on product_engagement_events (occurred_at);
create index if not exists idx_product_engagement_product_type on product_engagement_events (product_id, event_type, occurred_at desc);
create index if not exists idx_product_engagement_external_product_type
  on product_engagement_events (external_source, external_product_id, event_type, occurred_at desc)
  where external_source is not null;
create index if not exists idx_trend_keyword_candidates_status_observed
  on trend_keyword_candidates (locale, status, last_observed_at desc);
create index if not exists idx_trend_keyword_candidates_categories
  on trend_keyword_candidates using gin (category_codes);
create index if not exists idx_trend_source_observations_candidate_observed
  on trend_source_observations (candidate_id, observed_at desc);
create index if not exists idx_trend_source_observations_source_observed
  on trend_source_observations (source_kind, source_name, observed_at desc);
create index if not exists idx_weather_region_snapshots_lookup
  on weather_region_snapshots (region_code, forecast_at desc, expires_at);
create index if not exists idx_product_attribute_evidence_usable
  on product_attribute_evidence (product_id, attribute_key, confidence_score desc)
  where status='verified';
create index if not exists idx_product_attribute_evidence_expires
  on product_attribute_evidence (expires_at) where expires_at is not null;
create index if not exists idx_product_signal_hourly_product_bucket
  on product_signal_hourly (product_id, bucket_started_at desc);
create index if not exists idx_product_signal_hourly_privacy_region
  on product_signal_hourly (region_code, bucket_started_at desc)
  where is_privacy_eligible=true;
create index if not exists idx_search_intent_hourly_privacy_region
  on search_intent_hourly (locale, region_code, bucket_started_at desc)
  where is_privacy_eligible=true;
create index if not exists idx_search_intent_hourly_candidate
  on search_intent_hourly (candidate_id, bucket_started_at desc)
  where candidate_id is not null;
create index if not exists idx_seasonal_serving_health_recent
  on seasonal_serving_health_buckets (locale, bucket_started_at desc, region_code);
create index if not exists idx_seasonal_ranking_models_status_created
  on seasonal_ranking_models (status, created_at desc);
create index if not exists idx_seasonal_pipeline_runs_status_scheduled
  on seasonal_pipeline_runs (status, scheduled_for desc);
create index if not exists idx_seasonal_pipeline_runs_fingerprint
  on seasonal_pipeline_runs (input_fingerprint) where input_fingerprint is not null;
create index if not exists idx_trend_external_call_quotas_updated
  on trend_external_call_quotas (provider, period_kind, updated_at desc);
create index if not exists idx_seasonal_auto_publish_audit_run
  on seasonal_auto_publish_audit_log (pipeline_run_id, created_at desc);
create index if not exists idx_seasonal_auto_publish_audit_collection
  on seasonal_auto_publish_audit_log (collection_id, created_at desc)
  where collection_id is not null;
create index if not exists idx_product_request_rate_window on product_request_rate_limits (window_started_at);
create index if not exists idx_product_preference_expires on product_preference_profiles (expires_at);
create index if not exists idx_product_cohort_key_expires on product_color_cohort_memberships (cohort_key, expires_at);
create index if not exists idx_auradin_search_sessions_expires_at on auradin_search_sessions (expires_at);
create index if not exists idx_product_recommendation_runs_user_created on product_recommendation_runs (user_id, created_at desc);
create index if not exists idx_product_recommendation_runs_source_analysis on product_recommendation_runs (source_analysis_report_id);
create index if not exists idx_product_recommendation_runs_expires on product_recommendation_runs (expires_at);
create index if not exists idx_ar_filters_category_public on ar_filters (category, is_public);
create index if not exists idx_user_ar_filter_states_user_created on user_ar_filter_states (user_id, created_at desc);
create index if not exists idx_filter_extraction_reports_user_created on filter_extraction_reports (user_id, created_at desc);
create index if not exists idx_makeup_feedback_reports_user_created on makeup_feedback_reports (user_id, created_at desc);
create index if not exists idx_user_push_devices_user_enabled on user_push_devices (user_id, enabled, last_seen_at desc);
create index if not exists idx_app_notifications_user_created on app_notifications (user_id, created_at desc);
create index if not exists idx_app_notifications_user_unread on app_notifications (user_id, created_at desc) where read_at is null;
create index if not exists idx_notification_outbox_pending on notification_outbox (status, next_attempt_at) where status in ('pending', 'failed');
create index if not exists idx_home_hero_banners_active_order on home_hero_banners (is_active, sort_order);
create index if not exists idx_home_notices_hero_order on home_notices (hero_banner_id, sort_order);
create index if not exists idx_home_notices_active_order on home_notices (is_active, sort_order);
create index if not exists idx_home_trend_items_hero_order on home_trend_items (hero_banner_id, sort_order);
create index if not exists idx_home_trend_items_active_order on home_trend_items (is_active, sort_order);
create index if not exists idx_home_filter_store_items_category_active on home_filter_store_items (category, is_active);
create index if not exists idx_home_filter_store_items_active_order on home_filter_store_items (is_active, sort_order);
create index if not exists idx_home_recommended_looks_active_order on home_recommended_looks (is_active, sort_order);
create index if not exists idx_home_recommended_looks_display_date on home_recommended_looks (display_date);
create index if not exists idx_user_consents_user_type_version on user_consents (user_id, consent_type, version);
create index if not exists idx_user_consents_user_type_recorded on user_consents (user_id, consent_type, recorded_at desc);
create index if not exists idx_data_deletion_requests_user_requested on data_deletion_requests (user_id, requested_at desc);
create index if not exists idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_actor_created on audit_logs (actor_user_id, created_at desc);

create index if not exists idx_community_threads_category_created on community_threads (category, created_at desc) where deleted_at is null and status = 'active';
create index if not exists idx_community_threads_popular on community_threads ((like_count + save_count * 2 + reply_count), created_at desc) where deleted_at is null and status = 'active';
create index if not exists idx_community_threads_title_trgm on community_threads using gin (title gin_trgm_ops) where deleted_at is null and status = 'active';
create index if not exists idx_community_threads_body_trgm on community_threads using gin (body gin_trgm_ops) where deleted_at is null and status = 'active';
create index if not exists idx_community_threads_embedding on community_threads using hnsw (embedding vector_cosine_ops) where embedding is not null and deleted_at is null and status = 'active';
create index if not exists idx_community_thread_media_thread_order on community_thread_media (thread_id, sort_order);
create index if not exists idx_community_replies_thread_created on community_replies (thread_id, created_at asc) where deleted_at is null and status = 'active';
create index if not exists idx_community_thread_likes_thread on community_thread_likes (thread_id, liked_at desc);
create index if not exists idx_community_thread_saves_thread on community_thread_saves (thread_id, saved_at desc);
create index if not exists idx_community_reply_likes_reply on community_reply_likes (reply_id);
create index if not exists idx_community_reports_thread on community_reports (target_thread_id) where target_thread_id is not null;
create index if not exists idx_community_reports_reply on community_reports (target_reply_id) where target_reply_id is not null;
create index if not exists idx_community_events_user_time on community_events (user_id, created_at desc);
-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
before update on users
for each row execute function set_updated_at();

drop trigger if exists trg_analysis_reports_updated_at on analysis_reports;
create trigger trg_analysis_reports_updated_at
before update on analysis_reports
for each row execute function set_updated_at();

drop trigger if exists trg_analysis_stage_runs_updated_at on analysis_stage_runs;
create trigger trg_analysis_stage_runs_updated_at
before update on analysis_stage_runs
for each row execute function set_updated_at();

drop trigger if exists trg_hair_analyses_updated_at on hair_analyses;
create trigger trg_hair_analyses_updated_at
before update on hair_analyses
for each row execute function set_updated_at();

drop trigger if exists trg_hair_simulations_updated_at on hair_simulations;
create trigger trg_hair_simulations_updated_at
before update on hair_simulations
for each row execute function set_updated_at();

drop trigger if exists trg_saved_makeup_styles_updated_at on saved_makeup_styles;
create trigger trg_saved_makeup_styles_updated_at
before update on saved_makeup_styles
for each row execute function set_updated_at();

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
before update on products
for each row execute function set_updated_at();

drop trigger if exists trg_product_recommendation_service_principals_updated_at
  on product_recommendation_service_principals;
create trigger trg_product_recommendation_service_principals_updated_at
before update on product_recommendation_service_principals
for each row execute function set_updated_at();

drop trigger if exists trg_product_seasonal_collections_updated_at on product_seasonal_collections;
create trigger trg_product_seasonal_collections_updated_at
before update on product_seasonal_collections
for each row execute function set_updated_at();

drop trigger if exists trg_trend_keyword_candidates_updated_at on trend_keyword_candidates;
create trigger trg_trend_keyword_candidates_updated_at
before update on trend_keyword_candidates
for each row execute function set_updated_at();

drop trigger if exists trg_product_attribute_evidence_updated_at on product_attribute_evidence;
create trigger trg_product_attribute_evidence_updated_at
before update on product_attribute_evidence
for each row execute function set_updated_at();

drop trigger if exists trg_seasonal_ranking_models_updated_at on seasonal_ranking_models;
create trigger trg_seasonal_ranking_models_updated_at
before update on seasonal_ranking_models
for each row execute function set_updated_at();

create or replace function prevent_seasonal_auto_publish_audit_mutation()
returns trigger as $$
begin
  raise exception 'seasonal_auto_publish_audit_log is append-only';
end;
$$ language plpgsql;

drop trigger if exists trg_seasonal_auto_publish_audit_immutable
  on seasonal_auto_publish_audit_log;
create trigger trg_seasonal_auto_publish_audit_immutable
before update or delete on seasonal_auto_publish_audit_log
for each row execute function prevent_seasonal_auto_publish_audit_mutation();

drop trigger if exists trg_seasonal_auto_publish_audit_no_truncate
  on seasonal_auto_publish_audit_log;
create trigger trg_seasonal_auto_publish_audit_no_truncate
before truncate on seasonal_auto_publish_audit_log
for each statement execute function prevent_seasonal_auto_publish_audit_mutation();

drop trigger if exists trg_ar_filters_updated_at on ar_filters;
create trigger trg_ar_filters_updated_at
before update on ar_filters
for each row execute function set_updated_at();

drop trigger if exists trg_user_ar_filter_states_updated_at on user_ar_filter_states;
create trigger trg_user_ar_filter_states_updated_at
before update on user_ar_filter_states
for each row execute function set_updated_at();

drop trigger if exists trg_home_hero_banners_updated_at on home_hero_banners;
create trigger trg_home_hero_banners_updated_at
before update on home_hero_banners
for each row execute function set_updated_at();

drop trigger if exists trg_home_trend_items_updated_at on home_trend_items;
create trigger trg_home_trend_items_updated_at
before update on home_trend_items
for each row execute function set_updated_at();

drop trigger if exists trg_home_filter_store_items_updated_at on home_filter_store_items;
create trigger trg_home_filter_store_items_updated_at
before update on home_filter_store_items
for each row execute function set_updated_at();

drop trigger if exists trg_home_recommended_looks_updated_at on home_recommended_looks;
create trigger trg_home_recommended_looks_updated_at
before update on home_recommended_looks
for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Consulting (1:1 expert video consulting)
-- -----------------------------------------------------------------------------
create table if not exists consulting_categories (
  id text primary key,
  title text not null,
  description text not null default '',
  icon text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists consulting_experts (
  id text primary key,
  name text not null,
  title text not null,
  signature_line text not null default '',
  initials text not null,
  avatar_tone text not null default 'rose',
  image_url text,
  studio_name text,
  career_years integer not null default 0,
  rating numeric(2,1) not null default 0,
  review_count integer not null default 0,
  session_count integer not null default 0,
  rebook_rate integer not null default 0,
  response_minutes integer not null default 0,
  intro text not null default '',
  availability_note text,
  operating_hours jsonb,
  holiday_dates jsonb,
  booking_open_months integer not null default 1,
  tags text[] not null default '{}',
  certifications text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists consulting_expert_categories (
  expert_id text not null,
  category_id text not null,
  primary key (expert_id, category_id)
);

create table if not exists consulting_expert_durations (
  id uuid primary key default gen_random_uuid(),
  expert_id text not null,
  code text not null,
  label text not null,
  minutes integer not null,
  price integer not null,
  description text not null default '',
  recommended boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (expert_id, code)
);

create table if not exists consulting_expert_career (
  id uuid primary key default gen_random_uuid(),
  expert_id text not null,
  code text not null,
  period text not null,
  role text not null,
  sort_order integer not null default 0,
  unique (expert_id, code)
);

create table if not exists consulting_expert_reviews (
  id text primary key,
  expert_id text not null,
  booking_id uuid,
  author text not null,
  author_user_id uuid,
  category text not null default '',
  body text not null,
  rating integer not null default 5,
  date_label text,
  created_at timestamptz not null default now()
);

create table if not exists consulting_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  expert_id text not null,
  duration_code text,
  duration_label text,
  duration_minutes integer,
  category_label text,
  scheduled_at timestamptz,
  scheduled_date date,
  slot_start_minutes integer,
  date_label text,
  slot_id text,
  concern_id text,
  concern_label text,
  share_reports boolean not null default false,
  shared_report_ids uuid[] not null default '{}',
  question text,
  contact_name text,
  contact_phone text,
  preferred_contact_method text,
  session_mode text not null default 'online',
  operator_note text,
  confirmed_at timestamptz,
  expert_read_at timestamptz,
  status text not null default 'requested',
  price integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists consulting_summaries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique,
  expert_id text not null,
  duration_label text,
  date_label text,
  notes jsonb not null default '[]'::jsonb,
  products jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists consulting_call_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique,
  user_id uuid not null,
  expert_id text not null,
  provider text not null default 'chime',
  provider_meeting_id text,
  provider_external_meeting_id text,
  control_region text not null default 'ap-northeast-2',
  media_region text,
  status text not null default 'created',
  started_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists consulting_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  client_message_id text not null,
  sender_type text not null,
  sender_user_id uuid,
  sender_name text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint uq_consulting_messages_booking_sender_client unique (booking_id, sender_type, client_message_id),
  constraint chk_consulting_messages_sender_type check (sender_type in ('user', 'expert', 'operator', 'system')),
  constraint chk_consulting_messages_body_length check (char_length(body) <= 1000)
);

create table if not exists consulting_partner_accounts (
  id uuid primary key default gen_random_uuid(),
  expert_id text not null,
  email citext not null unique,
  password_hash text not null,
  password_salt text not null,
  role text not null default 'expert',
  workspace_scope text not null default 'expert_personal',
  status text not null default 'active',
  password_change_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_consulting_partner_accounts_role check (role in ('expert', 'business_manager', 'operator')),
  constraint chk_consulting_partner_accounts_scope check (workspace_scope in ('expert_personal', 'business_operations')),
  constraint chk_consulting_partner_accounts_status check (status in ('invited', 'active', 'suspended'))
);

create table if not exists consulting_partner_sessions (
  token_hash text primary key,
  account_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists consulting_partner_applications (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  name text not null,
  title text not null,
  studio_name text,
  phone text,
  message text,
  status text not null default 'pending',
  expert_id text,
  rejection_reason text,
  reviewed_by_subject text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_consulting_partner_applications_status
    check (status in ('submitted', 'needs_update', 'approved', 'rejected'))
);

create unique index if not exists uq_consulting_partner_applications_pending_email
  on consulting_partner_applications (email) where status in ('submitted', 'needs_update');


create table if not exists consulting_message_media (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  media_id uuid not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint uq_consulting_message_media_message_media unique (message_id, media_id),
  constraint uq_consulting_message_media_message_sort unique (message_id, sort_order),
  constraint chk_consulting_message_media_sort_order check (sort_order between 0 and 9)
);

create table if not exists consulting_membership_plans (
  id text primary key,
  name text not null,
  tagline text not null default '',
  price_per_month integer not null,
  original_price_per_month integer,
  benefits text[] not null default '{}',
  badge text,
  highlight boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_consulting_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id text not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists consulting_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  option_id text,
  booking_id uuid,
  membership_id uuid,
  amount integer not null default 0,
  currency text not null default 'KRW',
  status text not null default 'pending',
  method text,
  pg_provider text,
  pg_tx_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table consulting_experts
  add column if not exists image_url text,
  add column if not exists studio_name text;

alter table consulting_expert_reviews
  add column if not exists booking_id uuid;

-- Consulting foreign keys
alter table consulting_expert_categories
  drop constraint if exists fk_consulting_expert_categories_expert,
  add constraint fk_consulting_expert_categories_expert
  foreign key (expert_id) references consulting_experts(id) on delete cascade;

alter table consulting_expert_categories
  drop constraint if exists fk_consulting_expert_categories_category,
  add constraint fk_consulting_expert_categories_category
  foreign key (category_id) references consulting_categories(id) on delete cascade;

alter table consulting_expert_durations
  drop constraint if exists fk_consulting_expert_durations_expert,
  add constraint fk_consulting_expert_durations_expert
  foreign key (expert_id) references consulting_experts(id) on delete cascade;

alter table consulting_expert_career
  drop constraint if exists fk_consulting_expert_career_expert,
  add constraint fk_consulting_expert_career_expert
  foreign key (expert_id) references consulting_experts(id) on delete cascade;

alter table consulting_expert_reviews
  drop constraint if exists fk_consulting_expert_reviews_expert,
  add constraint fk_consulting_expert_reviews_expert
  foreign key (expert_id) references consulting_experts(id) on delete cascade;

alter table consulting_expert_reviews
  drop constraint if exists fk_consulting_expert_reviews_user,
  add constraint fk_consulting_expert_reviews_user
  foreign key (author_user_id) references users(id) on delete set null;

alter table consulting_expert_reviews
  drop constraint if exists fk_consulting_expert_reviews_booking,
  add constraint fk_consulting_expert_reviews_booking
  foreign key (booking_id) references consulting_bookings(id) on delete set null;

alter table consulting_bookings
  add column if not exists expert_read_at timestamptz;

alter table consulting_bookings
  add column if not exists session_mode text not null default 'online';

alter table consulting_bookings
  drop constraint if exists fk_consulting_bookings_user,
  add constraint fk_consulting_bookings_user
  foreign key (user_id) references users(id) on delete cascade;

alter table consulting_bookings
  drop constraint if exists fk_consulting_bookings_expert,
  add constraint fk_consulting_bookings_expert
  foreign key (expert_id) references consulting_experts(id) on delete cascade;

alter table consulting_bookings
  drop constraint if exists chk_consulting_bookings_slot_start_minutes,
  add constraint chk_consulting_bookings_slot_start_minutes
  check (
    slot_start_minutes is null
    or (slot_start_minutes >= 0 and slot_start_minutes < 1440)
  );

alter table consulting_bookings
  drop constraint if exists chk_consulting_bookings_status,
  add constraint chk_consulting_bookings_status
  check (status in ('requested', 'contacting', 'confirmed', 'scheduled', 'in_progress', 'unavailable', 'completed', 'canceled'));

alter table consulting_bookings
  drop constraint if exists chk_consulting_bookings_session_mode,
  add constraint chk_consulting_bookings_session_mode
  check (session_mode in ('online', 'offline'));

alter table consulting_summaries
  drop constraint if exists fk_consulting_summaries_booking,
  add constraint fk_consulting_summaries_booking
  foreign key (booking_id) references consulting_bookings(id) on delete cascade;

alter table consulting_call_sessions
  drop constraint if exists fk_consulting_call_sessions_booking,
  add constraint fk_consulting_call_sessions_booking
  foreign key (booking_id) references consulting_bookings(id) on delete cascade not valid;

alter table consulting_call_sessions
  drop constraint if exists fk_consulting_call_sessions_user,
  add constraint fk_consulting_call_sessions_user
  foreign key (user_id) references users(id) on delete cascade;

alter table consulting_call_sessions
  drop constraint if exists fk_consulting_call_sessions_expert,
  add constraint fk_consulting_call_sessions_expert
  foreign key (expert_id) references consulting_experts(id) on delete cascade;

alter table consulting_call_sessions
  drop constraint if exists chk_consulting_call_sessions_provider,
  add constraint chk_consulting_call_sessions_provider
  check (provider in ('chime'));

alter table consulting_call_sessions
  drop constraint if exists chk_consulting_call_sessions_status,
  add constraint chk_consulting_call_sessions_status
  check (status in ('created', 'active', 'ended', 'failed'));

alter table consulting_call_sessions add column if not exists control_region text not null default 'ap-northeast-2';

alter table consulting_messages
  drop constraint if exists fk_consulting_messages_booking,
  add constraint fk_consulting_messages_booking
  foreign key (booking_id) references consulting_bookings(id) on delete cascade;

alter table consulting_messages
  drop constraint if exists fk_consulting_messages_sender_user,
  add constraint fk_consulting_messages_sender_user
  foreign key (sender_user_id) references users(id) on delete set null;

alter table consulting_partner_accounts
  drop constraint if exists fk_consulting_partner_accounts_expert,
  add constraint fk_consulting_partner_accounts_expert
  foreign key (expert_id) references consulting_experts(id) on delete cascade;

alter table consulting_partner_sessions
  drop constraint if exists fk_consulting_partner_sessions_account,
  add constraint fk_consulting_partner_sessions_account
  foreign key (account_id) references consulting_partner_accounts(id) on delete cascade;

alter table consulting_partner_applications
  drop constraint if exists fk_consulting_partner_applications_expert,
  add constraint fk_consulting_partner_applications_expert
  foreign key (expert_id) references consulting_experts(id) on delete set null;

alter table media_upload_sessions
  drop constraint if exists fk_media_upload_sessions_owner_user,
  add constraint fk_media_upload_sessions_owner_user
  foreign key (owner_user_id) references users(id) on delete cascade,
  drop constraint if exists fk_media_upload_sessions_partner_account,
  add constraint fk_media_upload_sessions_partner_account
  foreign key (partner_account_id) references consulting_partner_accounts(id) on delete cascade,
  drop constraint if exists fk_media_upload_sessions_media_asset,
  add constraint fk_media_upload_sessions_media_asset
  foreign key (media_asset_id) references media_assets(id) on delete set null;

alter table consulting_message_media
  drop constraint if exists fk_consulting_message_media_message,
  add constraint fk_consulting_message_media_message
  foreign key (message_id) references consulting_messages(id) on delete cascade;

alter table consulting_message_media
  drop constraint if exists fk_consulting_message_media_media,
  add constraint fk_consulting_message_media_media
  foreign key (media_id) references media_assets(id) on delete restrict;

alter table user_consulting_memberships
  drop constraint if exists fk_user_consulting_memberships_user,
  add constraint fk_user_consulting_memberships_user
  foreign key (user_id) references users(id) on delete cascade;

alter table user_consulting_memberships
  drop constraint if exists fk_user_consulting_memberships_plan,
  add constraint fk_user_consulting_memberships_plan
  foreign key (plan_id) references consulting_membership_plans(id) on delete cascade;

alter table consulting_payments
  drop constraint if exists fk_consulting_payments_user,
  add constraint fk_consulting_payments_user
  foreign key (user_id) references users(id) on delete cascade;

alter table consulting_payments
  drop constraint if exists fk_consulting_payments_booking,
  add constraint fk_consulting_payments_booking
  foreign key (booking_id) references consulting_bookings(id) on delete set null;

alter table consulting_payments
  drop constraint if exists fk_consulting_payments_membership,
  add constraint fk_consulting_payments_membership
  foreign key (membership_id) references user_consulting_memberships(id) on delete set null;

-- Consulting indexes
create index if not exists idx_consulting_categories_active_order on consulting_categories (is_active, sort_order);
create index if not exists idx_consulting_experts_active_order on consulting_experts (is_active, sort_order);
create index if not exists idx_consulting_expert_categories_category on consulting_expert_categories (category_id);
create index if not exists idx_consulting_expert_durations_expert on consulting_expert_durations (expert_id, sort_order);
create index if not exists idx_consulting_expert_career_expert on consulting_expert_career (expert_id, sort_order);
create index if not exists idx_consulting_expert_reviews_expert on consulting_expert_reviews (expert_id, created_at desc);
create unique index if not exists idx_consulting_expert_reviews_booking
  on consulting_expert_reviews (booking_id)
  where booking_id is not null;
create index if not exists idx_consulting_bookings_user_status on consulting_bookings (user_id, status, created_at desc);
create index if not exists idx_consulting_bookings_expert on consulting_bookings (expert_id);
create index if not exists idx_consulting_call_sessions_booking on consulting_call_sessions (booking_id);
create index if not exists idx_consulting_call_sessions_expert_status on consulting_call_sessions (expert_id, status, created_at desc);
create index if not exists idx_consulting_messages_booking_created on consulting_messages (booking_id, created_at desc)
  where deleted_at is null;
create index if not exists idx_consulting_partner_accounts_expert on consulting_partner_accounts (expert_id);
create index if not exists idx_consulting_partner_sessions_account_expires on consulting_partner_sessions (account_id, expires_at);
create index if not exists idx_consulting_message_media_message_order on consulting_message_media (message_id, sort_order);
create index if not exists idx_media_upload_sessions_owner_status on media_upload_sessions (owner_user_id, status, expires_at);
create index if not exists idx_media_upload_sessions_partner_status on media_upload_sessions (partner_account_id, status, expires_at);
create index if not exists idx_media_upload_sessions_pending_expires on media_upload_sessions (expires_at) where status = 'pending';
drop index if exists idx_consulting_bookings_expert_upcoming_slot;
alter table consulting_bookings
  drop constraint if exists ex_consulting_bookings_expert_upcoming_time,
  add constraint ex_consulting_bookings_expert_upcoming_time
  exclude using gist (
    expert_id with =,
    scheduled_date with =,
    int4range(
      slot_start_minutes,
      slot_start_minutes + coalesce(duration_minutes, 30),
      '[)'
    ) with &&
  )
  where (
    status in ('contacting', 'confirmed', 'scheduled', 'in_progress')
    and scheduled_date is not null
    and slot_start_minutes is not null
  );
create index if not exists idx_consulting_payments_user on consulting_payments (user_id, created_at desc);
create index if not exists idx_user_consulting_memberships_user on user_consulting_memberships (user_id, status);

-- Shared AI makeup situation-card library
create table if not exists makeup_scenario_library (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  normalized_text text not null unique,
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
create index if not exists idx_makeup_scenario_library_active_usage
  on makeup_scenario_library (status, usage_count, created_at desc);
create index if not exists idx_makeup_scenario_library_replacement
  on makeup_scenario_library (source, status, usage_count, last_served_at, created_at);

create table if not exists makeup_scenario_generation_limits (
  user_id uuid primary key references users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  constraint chk_makeup_scenario_generation_limit_count check (request_count between 0 and 4)
);

-- AI makeup recommendation reports
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_makeup_recommendation_reports_image_status
    check (image_status in ('pending', 'processing', 'completed', 'failed')),
  constraint chk_makeup_recommendation_reports_refinement_type
    check (refinement_type is null or refinement_type in ('natural', 'hip', 'differentColor', 'replaceProducts'))
);
create index if not exists idx_makeup_recommendation_reports_user_created on makeup_recommendation_reports (user_id, created_at desc);
create index if not exists idx_makeup_recommendation_reports_parent on makeup_recommendation_reports (parent_report_id);

drop trigger if exists trg_makeup_scenario_library_updated_at on makeup_scenario_library;
create trigger trg_makeup_scenario_library_updated_at
before update on makeup_scenario_library
for each row execute function set_updated_at();

-- Consulting updated_at triggers
drop trigger if exists trg_consulting_categories_updated_at on consulting_categories;
create trigger trg_consulting_categories_updated_at
before update on consulting_categories
for each row execute function set_updated_at();

drop trigger if exists trg_consulting_experts_updated_at on consulting_experts;
create trigger trg_consulting_experts_updated_at
before update on consulting_experts
for each row execute function set_updated_at();

drop trigger if exists trg_consulting_bookings_updated_at on consulting_bookings;
create trigger trg_consulting_bookings_updated_at
before update on consulting_bookings
for each row execute function set_updated_at();

drop trigger if exists trg_consulting_call_sessions_updated_at on consulting_call_sessions;
create trigger trg_consulting_call_sessions_updated_at
before update on consulting_call_sessions
for each row execute function set_updated_at();

drop trigger if exists trg_consulting_membership_plans_updated_at on consulting_membership_plans;
create trigger trg_consulting_membership_plans_updated_at
before update on consulting_membership_plans
for each row execute function set_updated_at();

drop trigger if exists trg_user_consulting_memberships_updated_at on user_consulting_memberships;
create trigger trg_user_consulting_memberships_updated_at
before update on user_consulting_memberships
for each row execute function set_updated_at();

drop trigger if exists trg_consulting_payments_updated_at on consulting_payments;
create trigger trg_consulting_payments_updated_at
before update on consulting_payments
for each row execute function set_updated_at();

drop trigger if exists trg_community_threads_updated_at on community_threads;
create trigger trg_community_threads_updated_at
before update on community_threads
for each row execute function set_updated_at();

drop trigger if exists trg_community_replies_updated_at on community_replies;
create trigger trg_community_replies_updated_at
before update on community_replies
for each row execute function set_updated_at();

drop trigger if exists trg_makeup_recommendation_reports_updated_at on makeup_recommendation_reports;
create trigger trg_makeup_recommendation_reports_updated_at
before update on makeup_recommendation_reports
for each row execute function set_updated_at();
