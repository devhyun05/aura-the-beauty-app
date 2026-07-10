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

  if not exists (select 1 from pg_type where typname = 'product_category') then
    create type product_category as enum ('lip', 'cheek', 'shadow', 'liner', 'base');
  end if;

  if not exists (select 1 from pg_type where typname = 'filter_category') then
    create type filter_category as enum ('recommended', 'trend', 'personal_color', 'popular');
  end if;

  if not exists (select 1 from pg_type where typname = 'face_part') then
    create type face_part as enum ('all', 'base', 'eye', 'lip', 'contour');
  end if;

  if not exists (select 1 from pg_type where typname = 'consent_type') then
    create type consent_type as enum ('privacy_policy', 'camera_analysis', 'ai_processing', 'third_party_ai', 'marketing');
  end if;
end
$$;

alter type capture_type add value if not exists 'hair_analysis';

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
  updated_at timestamptz not null default now()
);

comment on table saved_makeup_styles is 'MakeupStyleList plus saved filters and saved recipes from the filter extraction flow.';

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
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_products_price_krw check (price_krw >= 0)
);

comment on table products is 'ProductRecommendation and LikedProductList product catalog.';

create table if not exists user_product_likes (
  user_id uuid not null,
  product_id uuid not null,
  liked_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

comment on table user_product_likes is 'LikedProductList and product heart state.';

create table if not exists product_recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_analysis_report_id uuid,
  user_nickname text,
  look_title text,
  look_description text,
  look_media_id uuid,
  product_ids uuid[],
  recommendation_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table product_recommendation_runs is 'ProductRecommendationData. tabs, products, sets, matchRate, reason are kept in recommendation_payload for v1 API flexibility.';

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
  metadata jsonb not null default '{}'::jsonb
);

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

comment on table data_deletion_requests is 'Account/photo/report/feedback/filter deletion request tracking.';

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
  foreign key (product_id) references products(id) on delete cascade;

alter table product_recommendation_runs
  drop constraint if exists fk_product_recommendation_runs_user,
  add constraint fk_product_recommendation_runs_user
  foreign key (user_id) references users(id) on delete cascade,
  drop constraint if exists fk_product_recommendation_runs_source_analysis_report,
  add constraint fk_product_recommendation_runs_source_analysis_report
  foreign key (source_analysis_report_id) references analysis_reports(id) on delete set null,
  drop constraint if exists fk_product_recommendation_runs_look_media,
  add constraint fk_product_recommendation_runs_look_media
  foreign key (look_media_id) references media_assets(id) on delete set null;

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
  add constraint fk_community_threads_author
  foreign key (author_user_id) references users(id) on delete cascade;

alter table community_thread_media
  add constraint fk_community_thread_media_thread
  foreign key (thread_id) references community_threads(id) on delete cascade,
  add constraint fk_community_thread_media_media
  foreign key (media_id) references media_assets(id) on delete restrict;

alter table community_replies
  add constraint fk_community_replies_thread
  foreign key (thread_id) references community_threads(id) on delete cascade,
  add constraint fk_community_replies_parent
  foreign key (parent_reply_id) references community_replies(id) on delete cascade,
  add constraint fk_community_replies_author
  foreign key (author_user_id) references users(id) on delete cascade;

alter table community_thread_likes
  add constraint fk_community_thread_likes_user
  foreign key (user_id) references users(id) on delete cascade,
  add constraint fk_community_thread_likes_thread
  foreign key (thread_id) references community_threads(id) on delete cascade;

alter table community_thread_saves
  add constraint fk_community_thread_saves_user
  foreign key (user_id) references users(id) on delete cascade,
  add constraint fk_community_thread_saves_thread
  foreign key (thread_id) references community_threads(id) on delete cascade;

alter table community_reply_likes
  add constraint fk_community_reply_likes_user
  foreign key (user_id) references users(id) on delete cascade,
  add constraint fk_community_reply_likes_reply
  foreign key (reply_id) references community_replies(id) on delete cascade;

alter table community_reports
  add constraint fk_community_reports_reporter
  foreign key (reporter_user_id) references users(id) on delete cascade,
  add constraint fk_community_reports_thread
  foreign key (target_thread_id) references community_threads(id) on delete cascade,
  add constraint fk_community_reports_reply
  foreign key (target_reply_id) references community_replies(id) on delete cascade;

alter table community_events
  add constraint fk_community_events_user
  foreign key (user_id) references users(id) on delete cascade,
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
create index if not exists idx_user_product_likes_user_liked on user_product_likes (user_id, liked_at desc);
create index if not exists idx_product_recommendation_runs_user_created on product_recommendation_runs (user_id, created_at desc);
create index if not exists idx_product_recommendation_runs_source_analysis on product_recommendation_runs (source_analysis_report_id);
create index if not exists idx_ar_filters_category_public on ar_filters (category, is_public);
create index if not exists idx_user_ar_filter_states_user_created on user_ar_filter_states (user_id, created_at desc);
create index if not exists idx_filter_extraction_reports_user_created on filter_extraction_reports (user_id, created_at desc);
create index if not exists idx_makeup_feedback_reports_user_created on makeup_feedback_reports (user_id, created_at desc);
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
  check (status in ('requested', 'contacting', 'confirmed', 'unavailable', 'completed', 'canceled'));

alter table consulting_bookings
  drop constraint if exists chk_consulting_bookings_session_mode,
  add constraint chk_consulting_bookings_session_mode
  check (session_mode in ('online', 'offline'));

alter table consulting_summaries
  drop constraint if exists fk_consulting_summaries_booking,
  add constraint fk_consulting_summaries_booking
  foreign key (booking_id) references consulting_bookings(id) on delete cascade;

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
    status in ('contacting', 'confirmed')
    and scheduled_date is not null
    and slot_start_minutes is not null
  );
create index if not exists idx_consulting_payments_user on consulting_payments (user_id, created_at desc);
create index if not exists idx_user_consulting_memberships_user on user_consulting_memberships (user_id, status);

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
