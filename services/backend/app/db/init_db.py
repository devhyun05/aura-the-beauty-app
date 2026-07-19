import argparse
import asyncio
from pathlib import Path

import asyncpg

from app.core.settings import get_settings
from app.db.connection_config import DatabaseConfigurationError, connect_database
from app.services.face_analysis_schema import FACE_ANALYSIS_STAGE_SCHEMA_SQL
from app.services.face_measurement_schema import (
  FACE_MEASUREMENT_MIGRATION_SQL,
  FACE_MEASUREMENT_SCHEMA_VERSION,
)
from app.services.media_upload_schema import MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL
from app.services.makeup_recommendation_schema import MAKEUP_RECOMMENDATION_SCHEMA_SQL


SCHEMA_VERSION = "schema.sql:v8-makeup-journey"
ANALYSIS_LAB_REMOVAL_SCHEMA_VERSION = "schema.sql:remove-analysis-lab-v1"
ANALYSIS_LAB_REMOVAL_SQL = """
  drop table if exists analysis_lab_runs;
  drop table if exists analysis_lab_sessions;
  delete from schema_migrations
  where version = 'schema.sql:analysis-lab-runs-v3';
"""

POST_SCHEMA_MIGRATIONS = {
  "schema.sql:makeup-journey-v1": """
    alter table makeup_feedback_reports
      add column if not exists entry_date date,
      add column if not exists feedback_kind text not null default 'initial',
      add column if not exists parent_feedback_report_id uuid;

    update makeup_feedback_reports
    set entry_date = (coalesce(completed_at, created_at) at time zone 'Asia/Seoul')::date
    where entry_date is null;

    alter table makeup_feedback_reports
      alter column entry_date set default ((now() at time zone 'Asia/Seoul')::date),
      alter column entry_date set not null,
      drop constraint if exists chk_makeup_feedback_kind,
      add constraint chk_makeup_feedback_kind check (feedback_kind in ('initial', 'correction')),
      drop constraint if exists chk_makeup_feedback_parent_presence,
      add constraint chk_makeup_feedback_parent_presence check (
        (feedback_kind = 'initial' and parent_feedback_report_id is null)
        or (feedback_kind = 'correction' and parent_feedback_report_id is not null)
      ),
      drop constraint if exists chk_makeup_feedback_parent_not_self,
      add constraint chk_makeup_feedback_parent_not_self check (
        parent_feedback_report_id is null or parent_feedback_report_id <> id
      ),
      drop constraint if exists fk_makeup_feedback_reports_parent,
      add constraint fk_makeup_feedback_reports_parent
        foreign key (parent_feedback_report_id) references makeup_feedback_reports(id) on delete cascade;

    create table if not exists makeup_journey_settings (
      user_id uuid primary key references users(id) on delete cascade,
      goal_score smallint not null check (goal_score between 1 and 100),
      mission_level text not null check (mission_level in ('beginner', 'intermediate', 'advanced')),
      timezone_name text not null default 'Asia/Seoul'
        check (char_length(btrim(timezone_name)) between 1 and 64),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists makeup_journey_day_notes (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      entry_date date not null,
      content text not null check (char_length(content) <= 2000),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, entry_date)
    );

    create table if not exists makeup_journey_missions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      entry_date date not null,
      source text not null check (source in ('curated', 'ai', 'user')),
      difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
      title text not null check (char_length(btrim(title)) between 1 and 120),
      is_completed boolean not null default false,
      completed_at timestamptz,
      sort_order smallint not null default 0,
      generation_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint chk_makeup_journey_mission_completion check (
        (is_completed and completed_at is not null)
        or (not is_completed and completed_at is null)
      )
    );

    create index if not exists idx_makeup_feedback_reports_user_entry_status_completed
      on makeup_feedback_reports (user_id, entry_date, status, completed_at, id);
    create index if not exists idx_makeup_feedback_reports_parent
      on makeup_feedback_reports (parent_feedback_report_id)
      where parent_feedback_report_id is not null;
    create index if not exists idx_makeup_journey_missions_user_date_order
      on makeup_journey_missions (user_id, entry_date, sort_order);
    create unique index if not exists uq_makeup_journey_missions_user_date_title_ci
      on makeup_journey_missions (user_id, entry_date, lower(title));
  """,
  "schema.sql:makeup-journey-score-selection-v1": """
    create table if not exists makeup_journey_day_score_selections (
      user_id uuid not null,
      entry_date date not null,
      report_id uuid not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint pk_makeup_journey_day_score_selections primary key (user_id, entry_date),
      constraint fk_makeup_journey_day_score_selections_user
        foreign key (user_id) references users(id) on delete cascade,
      constraint fk_makeup_journey_day_score_selections_report
        foreign key (report_id) references makeup_feedback_reports(id) on delete cascade
    );

    create index if not exists idx_makeup_journey_day_score_selections_report
      on makeup_journey_day_score_selections (report_id);
  """,
  "schema.sql:makeup-journey-report-notes-v1": """
    alter table makeup_journey_day_notes
      add column if not exists report_id uuid;

    update makeup_journey_day_notes notes
    set report_id = (
      select reports.id
      from makeup_feedback_reports reports
      where reports.user_id = notes.user_id
        and reports.entry_date = notes.entry_date
        and reports.status = 'completed'
        and reports.score is not null
      order by coalesce(reports.completed_at, reports.created_at) desc, reports.id desc
      limit 1
    )
    where notes.report_id is null;

    alter table makeup_journey_day_notes
      drop constraint if exists uq_makeup_journey_day_notes_user_date,
      drop constraint if exists makeup_journey_day_notes_user_id_entry_date_key,
      drop constraint if exists fk_makeup_journey_day_notes_report,
      add constraint fk_makeup_journey_day_notes_report
        foreign key (report_id) references makeup_feedback_reports(id) on delete cascade;

    create unique index if not exists uq_makeup_journey_day_notes_report
      on makeup_journey_day_notes (user_id, entry_date, report_id)
      where report_id is not null;
    create unique index if not exists uq_makeup_journey_day_notes_empty_date
      on makeup_journey_day_notes (user_id, entry_date)
      where report_id is null;
  """,
  "schema.sql:external-product-like-auradin-source-v1": """
    alter table external_product_likes
      drop constraint if exists chk_external_product_likes_source,
      add constraint chk_external_product_likes_source
        check (external_source in ('naver_shopping_search','auradin_search','auradin_catalog'));
  """,
  "schema.sql:external-product-catalog-events-v1": """
    alter table external_product_likes
      drop constraint if exists chk_external_product_likes_source,
      add constraint chk_external_product_likes_source
        check (external_source in ('naver_shopping_search','auradin_search','auradin_catalog'));
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
          external_source in ('naver_shopping_search','auradin_search','auradin_catalog')
          and char_length(external_product_id) between 1 and 160
        )
      );
    create index if not exists idx_product_engagement_external_product_type
      on product_engagement_events (external_source, external_product_id, event_type, occurred_at desc)
      where external_source is not null;
  """,
  "schema.sql:external-product-legacy-auradin-seed-likes-v1": """
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
  """,
  "schema.sql:product-category-brow-v1": """
    alter type product_category add value if not exists 'brow';
  """,
  "schema.sql:product-shades-shadow-region-v1": """
    alter table product_shades
      drop constraint if exists chk_product_shades_region,
      add constraint chk_product_shades_region
        check (product_region in ('lip','cheek','shadow','liner','base','brow'));
  """,
  "schema.sql:product-event-query-minimization-v1": """
    update product_engagement_events
    set context = context - 'query'
    where context ? 'query';
  """,
  "schema.sql:product-operator-rbac-v1": """
    create table if not exists product_recommendation_operators (
      user_id uuid primary key,
      roles text[] not null,
      is_active boolean not null default true,
      granted_by uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint chk_product_recommendation_operator_roles check (
        cardinality(roles) > 0 and roles <@ array[
          'catalog_admin','seasonal_editor','seasonal_reviewer',
          'seasonal_publisher','seasonal_operator'
        ]::text[]
      )
    );
    alter table product_recommendation_operators
      drop constraint if exists fk_product_recommendation_operator_user,
      add constraint fk_product_recommendation_operator_user
        foreign key (user_id) references users(id) on delete cascade,
      drop constraint if exists fk_product_recommendation_operator_granted_by,
      add constraint fk_product_recommendation_operator_granted_by
        foreign key (granted_by) references users(id) on delete set null;
    create index if not exists idx_product_recommendation_operators_active_roles
      on product_recommendation_operators using gin (roles) where is_active=true;
  """,
  "schema.sql:product-event-shade-parent-v1": """
    do $$
    begin
      if not exists (select 1 from pg_constraint where conname='fk_product_engagement_shade_product') then
        alter table product_engagement_events
          add constraint fk_product_engagement_shade_product
          foreign key (shade_id, product_id) references product_shades(id, product_id)
          on delete set null (shade_id) not valid;
      end if;
    end $$;
  """,
  "schema.sql:user-product-like-shade-parent-v1": """
    do $$
    begin
      if not exists (select 1 from pg_constraint where conname='fk_user_product_likes_shade_product') then
        alter table user_product_likes
          add constraint fk_user_product_likes_shade_product
          foreign key (source_shade_id, product_id) references product_shades(id, product_id)
          on delete set null (source_shade_id) not valid;
      end if;
    end $$;
  """,
  "schema.sql:product-shade-parent-integrity-v1": """
    do $$
    begin
      if not exists (select 1 from pg_constraint where conname='uq_product_shades_id_product') then
        alter table product_shades
          add constraint uq_product_shades_id_product unique (id, product_id);
      end if;
      if not exists (select 1 from pg_constraint where conname='fk_product_assets_shade_product') then
        alter table product_assets
          add constraint fk_product_assets_shade_product
          foreign key (shade_id, product_id) references product_shades(id, product_id)
          on delete cascade not valid;
      end if;
      if not exists (select 1 from pg_constraint where conname='fk_product_offers_shade_product') then
        alter table product_offers
          add constraint fk_product_offers_shade_product
          foreign key (shade_id, product_id) references product_shades(id, product_id)
          on delete set null (shade_id) not valid;
      end if;
      if not exists (select 1 from pg_constraint where conname='fk_product_seasonal_items_shade_product') then
        alter table product_seasonal_collection_items
          add constraint fk_product_seasonal_items_shade_product
          foreign key (shade_id, product_id) references product_shades(id, product_id)
          on delete set null (shade_id) not valid;
      end if;
    end $$;
  """,
  "schema.sql:product-consent-ordering-v1": """
    alter table user_consents
      add column if not exists recorded_at timestamptz not null default clock_timestamp();
    create index if not exists idx_user_consents_user_type_recorded
      on user_consents (user_id, consent_type, recorded_at desc);
  """,
  "schema.sql:community-core-v1": """
    create extension if not exists vector;
    create extension if not exists pg_trgm;

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

    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_threads_author') then
      alter table community_threads add constraint fk_community_threads_author foreign key (author_user_id) references users(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_thread_media_thread') then
      alter table community_thread_media add constraint fk_community_thread_media_thread foreign key (thread_id) references community_threads(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_thread_media_media') then
      alter table community_thread_media add constraint fk_community_thread_media_media foreign key (media_id) references media_assets(id) on delete restrict;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_replies_thread') then
      alter table community_replies add constraint fk_community_replies_thread foreign key (thread_id) references community_threads(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_replies_parent') then
      alter table community_replies add constraint fk_community_replies_parent foreign key (parent_reply_id) references community_replies(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_replies_author') then
      alter table community_replies add constraint fk_community_replies_author foreign key (author_user_id) references users(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_thread_likes_user') then
      alter table community_thread_likes add constraint fk_community_thread_likes_user foreign key (user_id) references users(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_thread_likes_thread') then
      alter table community_thread_likes add constraint fk_community_thread_likes_thread foreign key (thread_id) references community_threads(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_thread_saves_user') then
      alter table community_thread_saves add constraint fk_community_thread_saves_user foreign key (user_id) references users(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_thread_saves_thread') then
      alter table community_thread_saves add constraint fk_community_thread_saves_thread foreign key (thread_id) references community_threads(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_reply_likes_user') then
      alter table community_reply_likes add constraint fk_community_reply_likes_user foreign key (user_id) references users(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_reply_likes_reply') then
      alter table community_reply_likes add constraint fk_community_reply_likes_reply foreign key (reply_id) references community_replies(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_reports_reporter') then
      alter table community_reports add constraint fk_community_reports_reporter foreign key (reporter_user_id) references users(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_reports_thread') then
      alter table community_reports add constraint fk_community_reports_thread foreign key (target_thread_id) references community_threads(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_reports_reply') then
      alter table community_reports add constraint fk_community_reports_reply foreign key (target_reply_id) references community_replies(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_events_user') then
      alter table community_events add constraint fk_community_events_user foreign key (user_id) references users(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_community_events_thread') then
      alter table community_events add constraint fk_community_events_thread foreign key (thread_id) references community_threads(id) on delete cascade;
    end if; end $migration$;

    create index if not exists idx_community_threads_category_created on community_threads (category, created_at desc) where deleted_at is null and status = 'active';
    create index if not exists idx_community_threads_popular on community_threads ((like_count + save_count * 2 + reply_count), created_at desc) where deleted_at is null and status = 'active';
    create index if not exists idx_community_threads_title_trgm on community_threads using gin (title gin_trgm_ops) where deleted_at is null and status = 'active';
    create index if not exists idx_community_threads_body_trgm on community_threads using gin (body gin_trgm_ops) where deleted_at is null and status = 'active';
    create index if not exists idx_community_thread_media_thread_order on community_thread_media (thread_id, sort_order);
    create index if not exists idx_community_replies_thread_created on community_replies (thread_id, created_at asc) where deleted_at is null and status = 'active';
    create index if not exists idx_community_thread_likes_thread on community_thread_likes (thread_id, liked_at desc);
    create index if not exists idx_community_thread_saves_thread on community_thread_saves (thread_id, saved_at desc);
    create index if not exists idx_community_reply_likes_reply on community_reply_likes (reply_id);
    create index if not exists idx_community_reports_thread on community_reports (target_thread_id) where target_thread_id is not null;
    create index if not exists idx_community_reports_reply on community_reports (target_reply_id) where target_reply_id is not null;
    create index if not exists idx_community_events_user_time on community_events (user_id, created_at desc);

    create or replace function set_updated_at()
    returns trigger as $function$
    begin
      new.updated_at = now();
      return new;
    end;
    $function$ language plpgsql;

    drop trigger if exists trg_community_threads_updated_at on community_threads;
    create trigger trg_community_threads_updated_at
    before update on community_threads
    for each row execute function set_updated_at();

    drop trigger if exists trg_community_replies_updated_at on community_replies;
    create trigger trg_community_replies_updated_at
    before update on community_replies
    for each row execute function set_updated_at();
  """,
  "schema.sql:community-embeddings-v1": """
    create extension if not exists vector;
    alter table community_threads add column if not exists embedding vector(1024);
    alter table analysis_reports add column if not exists embedding vector(1024);
  """,
  "schema.sql:analysis-stage-runs-v1": FACE_ANALYSIS_STAGE_SCHEMA_SQL,
  FACE_MEASUREMENT_SCHEMA_VERSION: FACE_MEASUREMENT_MIGRATION_SQL,
  ANALYSIS_LAB_REMOVAL_SCHEMA_VERSION: ANALYSIS_LAB_REMOVAL_SQL,
  "schema.sql:media-thumbnails-v1": """
    alter table media_assets add column if not exists thumbnail_bucket text;
    alter table media_assets add column if not exists thumbnail_object_key text;
    alter table media_assets add column if not exists thumbnail_cdn_url text;
    alter table media_assets add column if not exists thumbnail_content_type text;
    alter table media_assets add column if not exists thumbnail_byte_size bigint;
    alter table media_assets add column if not exists thumbnail_width integer;
    alter table media_assets add column if not exists thumbnail_height integer;
  """,
  "schema.sql:consulting-messages-v1": """
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

    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_consulting_messages_booking') then
      alter table consulting_messages add constraint fk_consulting_messages_booking foreign key (booking_id) references consulting_bookings(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_consulting_messages_sender_user') then
      alter table consulting_messages add constraint fk_consulting_messages_sender_user foreign key (sender_user_id) references users(id) on delete set null;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_consulting_message_media_message') then
      alter table consulting_message_media add constraint fk_consulting_message_media_message foreign key (message_id) references consulting_messages(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_consulting_message_media_media') then
      alter table consulting_message_media add constraint fk_consulting_message_media_media foreign key (media_id) references media_assets(id) on delete restrict;
    end if; end $migration$;

    create index if not exists idx_consulting_messages_booking_created on consulting_messages (booking_id, created_at desc)
      where deleted_at is null;
    create index if not exists idx_consulting_message_media_message_order on consulting_message_media (message_id, sort_order);
  """,
  "schema.sql:consulting-partner-accounts-v1": """
    create extension if not exists pgcrypto;
    create extension if not exists citext;

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
      status text not null default 'submitted',
      expert_id text,
      rejection_reason text,
      reviewed_by_subject text,
      reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint chk_consulting_partner_applications_status check (status in ('submitted', 'needs_update', 'approved', 'rejected'))
    );

    create unique index if not exists uq_consulting_partner_applications_pending_email
      on consulting_partner_applications (email) where status in ('submitted', 'needs_update');

    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_consulting_partner_accounts_expert') then
      alter table consulting_partner_accounts add constraint fk_consulting_partner_accounts_expert foreign key (expert_id) references consulting_experts(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_consulting_partner_sessions_account') then
      alter table consulting_partner_sessions add constraint fk_consulting_partner_sessions_account foreign key (account_id) references consulting_partner_accounts(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_consulting_partner_applications_expert') then
      alter table consulting_partner_applications add constraint fk_consulting_partner_applications_expert foreign key (expert_id) references consulting_experts(id) on delete set null;
    end if; end $migration$;

    create index if not exists idx_consulting_partner_accounts_expert on consulting_partner_accounts (expert_id);
    create index if not exists idx_consulting_partner_sessions_account_expires on consulting_partner_sessions (account_id, expires_at);
  """,
  "schema.sql:consulting-partner-onboarding-v1": """
    create extension if not exists pgcrypto;
    create extension if not exists citext;

    create table if not exists consulting_partner_applications (
      id uuid primary key default gen_random_uuid(),
      email citext not null,
      name text not null,
      title text not null,
      studio_name text,
      phone text,
      message text,
      status text not null default 'submitted',
      expert_id text,
      rejection_reason text,
      reviewed_by_subject text,
      reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint chk_consulting_partner_applications_status check (status in ('submitted', 'needs_update', 'approved', 'rejected'))
    );

    create unique index if not exists uq_consulting_partner_applications_pending_email
      on consulting_partner_applications (email) where status in ('submitted', 'needs_update');

    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_consulting_partner_applications_expert') then
      alter table consulting_partner_applications add constraint fk_consulting_partner_applications_expert foreign key (expert_id) references consulting_experts(id) on delete set null;
    end if; end $migration$;
  """,
  "schema.sql:consulting-request-flow-v1": """
    alter table consulting_bookings add column if not exists contact_name text;
    alter table consulting_bookings add column if not exists contact_phone text;
    alter table consulting_bookings add column if not exists preferred_contact_method text;
    alter table consulting_bookings add column if not exists session_mode text not null default 'online';
    alter table consulting_bookings add column if not exists operator_note text;
    alter table consulting_bookings add column if not exists confirmed_at timestamptz;
    alter table consulting_bookings add column if not exists expert_read_at timestamptz;

    update consulting_bookings
    set status = 'confirmed',
        confirmed_at = coalesce(confirmed_at, created_at)
    where status = 'upcoming';

    alter table consulting_bookings alter column status set default 'requested';
    alter table consulting_bookings
      drop constraint if exists chk_consulting_bookings_status,
      add constraint chk_consulting_bookings_status
      check (status in ('requested', 'contacting', 'confirmed', 'scheduled', 'in_progress', 'unavailable', 'completed', 'canceled'));

    alter table consulting_bookings
      drop constraint if exists chk_consulting_bookings_session_mode,
      add constraint chk_consulting_bookings_session_mode
      check (session_mode in ('online', 'offline'));

    alter table consulting_bookings
      drop constraint if exists ex_consulting_bookings_expert_upcoming_time,
      add constraint ex_consulting_bookings_expert_upcoming_time
      exclude using gist (
        expert_id with =,
        scheduled_date with =,
        int4range(slot_start_minutes, slot_start_minutes + coalesce(duration_minutes, 30), '[)') with &&
      )
      where (status in ('contacting', 'confirmed', 'scheduled', 'in_progress') and scheduled_date is not null and slot_start_minutes is not null);
  """,
  "schema.sql:consulting-chat-read-state-v1": """
    alter table consulting_bookings add column if not exists expert_read_at timestamptz;
  """,
  "schema.sql:consulting-conversation-lifecycle-v1": """
    alter table consulting_bookings add column if not exists conversation_id uuid;
    alter table consulting_bookings add column if not exists customer_left_at timestamptz;
    alter table consulting_bookings add column if not exists expert_left_at timestamptz;

    with conversation_seeds as (
      select user_id, expert_id, (array_agg(id order by created_at asc))[1] as conversation_id
      from consulting_bookings
      group by user_id, expert_id
    )
    update consulting_bookings booking
    set conversation_id = seed.conversation_id
    from conversation_seeds seed
    where booking.user_id = seed.user_id
      and booking.expert_id = seed.expert_id
      and booking.conversation_id is null;

    alter table consulting_bookings alter column conversation_id set default gen_random_uuid();
    alter table consulting_bookings alter column conversation_id set not null;
    create index if not exists idx_consulting_bookings_conversation_created
      on consulting_bookings (conversation_id, created_at desc);
    create index if not exists idx_consulting_bookings_open_conversation
      on consulting_bookings (user_id, expert_id, created_at desc)
      where customer_left_at is null and expert_left_at is null;
  """,
  "schema.sql:consulting-expert-operating-settings-v1": """
    alter table consulting_experts add column if not exists operating_hours jsonb;
    alter table consulting_experts add column if not exists holiday_dates jsonb;
    alter table consulting_experts add column if not exists booking_open_months integer not null default 1;
    update consulting_experts set booking_open_months = 1 where booking_open_months is null;
  """,
  "schema.sql:consulting-call-sessions-v1": """
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

    create index if not exists idx_consulting_call_sessions_booking on consulting_call_sessions (booking_id);
    create index if not exists idx_consulting_call_sessions_expert_status on consulting_call_sessions (expert_id, status, created_at desc);
  """,
  "schema.sql:community-bedrock-embeddings-v2": """
    create extension if not exists vector;
    alter table community_threads add column if not exists embedding vector(1024);
    alter table analysis_reports add column if not exists embedding vector(1024);
    alter table community_threads alter column embedding type vector(1024) using null;
    alter table analysis_reports alter column embedding type vector(1024) using null;
    create index if not exists idx_community_threads_embedding
      on community_threads using hnsw (embedding vector_cosine_ops)
      where embedding is not null and deleted_at is null and status = 'active';
  """,
  "schema.sql:community-search-v1": """
    create extension if not exists pg_trgm;
    create index if not exists idx_community_threads_title_trgm
      on community_threads using gin (title gin_trgm_ops)
      where deleted_at is null and status = 'active';
    create index if not exists idx_community_threads_body_trgm
      on community_threads using gin (body gin_trgm_ops)
      where deleted_at is null and status = 'active';
  """,
  "schema.sql:auradin-sessions-v1": """
    create table if not exists auradin_search_sessions (
      session_id text primary key,
      state jsonb not null,
      expires_at timestamptz not null,
      updated_at timestamptz not null
    );
    create index if not exists idx_auradin_search_sessions_expires_at
      on auradin_search_sessions (expires_at);
    create index if not exists idx_auradin_search_sessions_owner_subject
      on auradin_search_sessions ((state ->> 'ownerSubject'));
  """,
  "schema.sql:auradin-sessions-v2": """
    -- A9 세션 멱등성·CAS (M1 핫픽스 Stage 0). 기존 행 backfill 후 NOT NULL —
    -- backfill 불가한 행이 남아 있으면 set not null이 실패해 마이그레이션이 중단된다(의도된 사전검사).
    alter table auradin_search_sessions add column if not exists owner_subject text;
    alter table auradin_search_sessions add column if not exists version integer;
    alter table auradin_search_sessions add column if not exists client_request_id text;
    alter table auradin_search_sessions add column if not exists request_fingerprint text;
    alter table auradin_search_sessions add column if not exists idempotency_expires_at timestamptz;
    update auradin_search_sessions set owner_subject = state->>'ownerSubject' where owner_subject is null;
    update auradin_search_sessions set version = 0 where version is null;
    alter table auradin_search_sessions alter column owner_subject set not null;
    alter table auradin_search_sessions alter column version set not null;
    alter table auradin_search_sessions alter column version set default 0;
    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conname = 'chk_auradin_sessions_idempotency_fields'
          and conrelid = 'public.auradin_search_sessions'::regclass
      ) then
        alter table auradin_search_sessions
          add constraint chk_auradin_sessions_idempotency_fields
          check (
            ((client_request_id is null) = (request_fingerprint is null))
            and ((client_request_id is null) = (idempotency_expires_at is null))
          );
      end if;
    end $$;
    create unique index if not exists uq_auradin_sessions_owner_client_request
      on auradin_search_sessions (owner_subject, client_request_id)
      where client_request_id is not null;
    create index if not exists idx_auradin_sessions_idempotency_expires
      on auradin_search_sessions (idempotency_expires_at)
      where idempotency_expires_at is not null;
  """,
  "schema.sql:auradin-events-v1": """
    -- A5 이벤트 로깅 (M3) — §7.2 SQL 정본. 멱등성은 (owner_subject, client_event_id) 복합 유니크,
    -- owner_subject는 익명 식별 계약(anon:v1/user:v1)만 — dev fallback 공용 subject 적재 금지.
    -- payload는 allowlist 구조화 값만(raw query 원문 금지). 보존은 received_at 인덱스 기반 배치 DELETE.
    create table if not exists auradin_events (
      id bigserial primary key,
      client_event_id text not null,
      schema_version smallint not null default 1,
      owner_subject text not null,
      session_id text, turn_id text, result_set_id text,
      event_type text not null check (event_type in (
        'session_start','question_answered','impression','product_open',
        'save','unsave','purchase_click','refine_dial','refine_prompt','hide','unhide')),
      product_id text, category text, rank int, role text, match_rate int,
      data_manifest_id text not null,
      release_manifest_id text not null,
      catalog_run_date text, ranker_version text,
      payload jsonb,
      occurred_at timestamptz not null,
      received_at timestamptz not null default now(),
      experiment_id text, variant text,
      unique (owner_subject, client_event_id)
    );
    create index if not exists idx_auradin_events_owner_time
      on auradin_events (owner_subject, occurred_at desc);
    create index if not exists idx_auradin_events_session
      on auradin_events (session_id);
    create index if not exists idx_auradin_events_manifest
      on auradin_events (data_manifest_id);
    create index if not exists idx_auradin_events_received
      on auradin_events (received_at);
  """,
  "schema.sql:account-deletion-v1": """
    create table if not exists account_deletion_tombstones (
      subject_hash text primary key,
      auth_provider text not null,
      deleted_at timestamptz not null default now()
    );
    create index if not exists idx_account_deletion_tombstones_deleted_at
      on account_deletion_tombstones (deleted_at);
  """,
  "schema.sql:makeup-recommendation-v2": MAKEUP_RECOMMENDATION_SCHEMA_SQL,
  "schema.sql:makeup-report-product-snapshots-v1": """
    alter table product_recommendation_runs
      add column if not exists source_makeup_report_id uuid,
      add column if not exists source_look_id text,
      add column if not exists strategy text not null default 'legacy_v1',
      add column if not exists algorithm_version text,
      add column if not exists recipe_hash text,
      add column if not exists catalog_version text,
      add column if not exists status text not null default 'ready',
      add column if not exists revision integer not null default 1,
      add column if not exists started_at timestamptz,
      add column if not exists completed_at timestamptz,
      add column if not exists error_code text;

    alter table product_recommendation_runs
      drop constraint if exists chk_product_recommendation_runs_strategy,
      add constraint chk_product_recommendation_runs_strategy check (
        strategy in (
          'legacy_v1','ar_v1','seasonal_v1','personalized_v1','cohort_v1','makeup_report_v1'
        )
      ),
      drop constraint if exists chk_product_recommendation_runs_status,
      add constraint chk_product_recommendation_runs_status check (
        status in ('pending','processing','ready','partial','failed')
      ),
      drop constraint if exists chk_product_recommendation_runs_revision,
      add constraint chk_product_recommendation_runs_revision check (revision >= 1),
      drop constraint if exists chk_product_recommendation_runs_makeup_snapshot,
      add constraint chk_product_recommendation_runs_makeup_snapshot check (
        (
          strategy = 'makeup_report_v1'
          and source_makeup_report_id is not null
          and source_look_id is not null
          and char_length(btrim(source_look_id)) between 1 and 128
          and recipe_hash is not null
          and recipe_hash ~ '^[0-9a-f]{64}$'
          and algorithm_version is not null
          and char_length(btrim(algorithm_version)) between 1 and 128
          and catalog_version is not null
          and char_length(btrim(catalog_version)) between 1 and 128
        )
        or (
          strategy <> 'makeup_report_v1'
          and source_makeup_report_id is null
        )
      ),
      drop constraint if exists chk_product_recommendation_runs_makeup_completion,
      add constraint chk_product_recommendation_runs_makeup_completion check (
        strategy <> 'makeup_report_v1'
        or (status = 'pending' and started_at is null and completed_at is null and error_code is null)
        or (status = 'processing' and started_at is not null and completed_at is null and error_code is null)
        or (
          status in ('ready','partial')
          and started_at is not null
          and completed_at is not null
          and completed_at >= started_at
          and error_code is null
        )
        or (
          status = 'failed'
          and started_at is not null
          and completed_at is not null
          and completed_at >= started_at
          and error_code is not null
          and char_length(btrim(error_code)) between 1 and 128
        )
      ),
      drop constraint if exists fk_product_recommendation_runs_source_makeup_report,
      add constraint fk_product_recommendation_runs_source_makeup_report
        foreign key (source_makeup_report_id)
        references makeup_recommendation_reports(id) on delete cascade;

    create index if not exists idx_product_recommendation_runs_source_makeup_report
      on product_recommendation_runs (source_makeup_report_id)
      where source_makeup_report_id is not null;
    create unique index if not exists uq_product_recommendation_runs_makeup_snapshot_revision
      on product_recommendation_runs (
        source_makeup_report_id, source_look_id, recipe_hash,
        algorithm_version, catalog_version, revision
      )
      where strategy = 'makeup_report_v1';
    create unique index if not exists uq_product_recommendation_runs_makeup_look_revision
      on product_recommendation_runs (source_makeup_report_id, source_look_id, revision)
      where strategy = 'makeup_report_v1';
    create index if not exists idx_product_recommendation_runs_makeup_ready_revision
      on product_recommendation_runs (user_id, source_makeup_report_id, source_look_id, revision desc)
      where strategy = 'makeup_report_v1' and status in ('ready','partial');
    create index if not exists idx_product_recommendation_runs_makeup_work_queue
      on product_recommendation_runs (status, started_at, created_at)
      where strategy = 'makeup_report_v1' and status in ('pending','processing');
  """,
  "schema.sql:makeup-trend-draft-evidence-v1": """
    do $migration$
    begin
      if to_regclass('public.makeup_scenario_library') is not null then
        alter table makeup_scenario_library
          drop constraint if exists chk_makeup_scenario_library_trend_evidence;
        alter table makeup_scenario_library
          add constraint chk_makeup_scenario_library_trend_evidence check (
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
      end if;
    end $migration$;
  """,
  "schema.sql:media-upload-sessions-v1": MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL,
}
# NOTE(M3 후속): 동일 (user_id, source_media_id) in-flight 중복을 막는 부분 유니크
# 인덱스는 이 POST_SCHEMA_MIGRATIONS(단일 트랜잭션)로는 CONCURRENTLY 불가 →
# 대용량 테이블 잠금·롤링배포 중 동시 insert로 빌드 실패 위험이 있어 제외한다.
# 도입 시 CREATE INDEX CONCURRENTLY 별도 ops 마이그레이션 + 실DB 리허설 필요.

def get_schema_path() -> Path:
  current_file = Path(__file__).resolve()
  candidates = [
    Path.cwd() / "docs" / "backend" / "schema.sql",
    Path.cwd().parent.parent / "docs" / "backend" / "schema.sql",
  ]

  for parent in current_file.parents:
    candidates.append(parent / "docs" / "backend" / "schema.sql")

  for candidate in candidates:
    if candidate.exists():
      return candidate

  raise FileNotFoundError("Could not find docs/backend/schema.sql")


async def ensure_migration_table(connection: asyncpg.Connection) -> None:
  await connection.execute(
    """
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
    """,
  )


async def has_schema_version(connection: asyncpg.Connection, version: str) -> bool:
  row = await connection.fetchrow(
    "select version from schema_migrations where version = $1",
    version,
  )

  return row is not None


async def record_schema_version(connection: asyncpg.Connection, version: str) -> None:
  await connection.execute(
    """
    insert into schema_migrations (version)
    values ($1)
    on conflict (version) do update set applied_at = now()
    """,
    version,
  )

async def apply_pending_schema_migrations(connection: asyncpg.Connection) -> list[str]:
  applied: list[str] = []
  for version, sql in POST_SCHEMA_MIGRATIONS.items():
    if await has_schema_version(connection, version):
      continue

    await connection.execute(sql)
    await record_schema_version(connection, version)
    applied.append(version)
  return applied


async def apply_schema(database_url: str | None = None, force: bool = False) -> str:
  settings = get_settings()
  dsn = database_url or settings.database_url

  if dsn:
    connection = await asyncpg.connect(dsn=dsn)
  else:
    try:
      connection, _ = await connect_database(settings)
    except DatabaseConfigurationError as error:
      raise RuntimeError("DATABASE_URL or DATABASE_SECRET_ID is required to apply the schema.") from error

  schema = get_schema_path().read_text(encoding="utf-8")
  try:
    await ensure_migration_table(connection)

    if not force and await has_schema_version(connection, SCHEMA_VERSION):
      async with connection.transaction():
        applied = await apply_pending_schema_migrations(connection)
      suffix = f" Applied pending migrations: {', '.join(applied)}." if applied else ""
      return f"Skipped {SCHEMA_VERSION}; already applied." + suffix

    async with connection.transaction():
      await connection.execute(schema)
      await record_schema_version(connection, SCHEMA_VERSION)
      applied = await apply_pending_schema_migrations(connection)

    suffix = f" Applied pending migrations: {', '.join(applied)}." if applied else ""
    return f"Applied {SCHEMA_VERSION}." + suffix
  finally:
    await connection.close()


async def main() -> None:
  parser = argparse.ArgumentParser(description="Apply backend PostgreSQL schema.")
  parser.add_argument("--force", action="store_true", help="Apply schema even when the marker exists.")
  args = parser.parse_args()
  result = await apply_schema(force=args.force)
  print(result)


if __name__ == "__main__":
  asyncio.run(main())
