import argparse
import asyncio
from pathlib import Path

import asyncpg

from app.core.settings import get_settings
from app.db.connection_config import DatabaseConfigurationError, connect_database


SCHEMA_VERSION = "schema.sql:v3"

POST_SCHEMA_MIGRATIONS = {
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

    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_consulting_partner_accounts_expert') then
      alter table consulting_partner_accounts add constraint fk_consulting_partner_accounts_expert foreign key (expert_id) references consulting_experts(id) on delete cascade;
    end if; end $migration$;
    do $migration$ begin if not exists (select 1 from pg_constraint where conname = 'fk_consulting_partner_sessions_account') then
      alter table consulting_partner_sessions add constraint fk_consulting_partner_sessions_account foreign key (account_id) references consulting_partner_accounts(id) on delete cascade;
    end if; end $migration$;

    create index if not exists idx_consulting_partner_accounts_expert on consulting_partner_accounts (expert_id);
    create index if not exists idx_consulting_partner_sessions_account_expires on consulting_partner_sessions (account_id, expires_at);
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
      transcription_status text not null default 'disabled',
      transcription_language_code text,
      customer_language_code text not null default 'ko-KR',
      expert_language_code text not null default 'ko-KR',
      transcription_mode text not null default 'fixed',
      started_at timestamptz,
      ended_at timestamptz,
      expires_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists consulting_transcript_segments (
      id uuid primary key default gen_random_uuid(),
      call_session_id uuid not null,
      booking_id uuid not null,
      participant_type text not null,
      participant_id text,
      language_code text not null,
      source_text text not null default '',
      translated_text text,
      result_id text,
      speaker_type text not null default 'unknown',
      source_language_code text,
      content text,
      target_language_code text,
      translated_content text,
      start_time_ms integer,
      end_time_ms integer,
      is_partial boolean not null default false,
      started_at timestamptz,
      ended_at timestamptz,
      created_at timestamptz not null default now()
    );

    alter table consulting_call_sessions
      drop constraint if exists fk_consulting_call_sessions_booking,
      add constraint fk_consulting_call_sessions_booking
      foreign key (booking_id) references consulting_bookings(id) on delete cascade;
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
    alter table consulting_call_sessions add column if not exists customer_language_code text not null default 'ko-KR';
    alter table consulting_call_sessions add column if not exists expert_language_code text not null default 'ko-KR';
    alter table consulting_call_sessions add column if not exists transcription_mode text not null default 'fixed';
    alter table consulting_call_sessions
      drop constraint if exists chk_consulting_call_sessions_transcription_status,
      add constraint chk_consulting_call_sessions_transcription_status
      check (transcription_status in ('disabled', 'stopped', 'starting', 'active', 'stopping', 'failed'));
    alter table consulting_call_sessions
      drop constraint if exists chk_consulting_call_sessions_transcription_language,
      add constraint chk_consulting_call_sessions_transcription_language
      check (transcription_language_code is null or transcription_language_code in ('ko-KR', 'en-US'));
    alter table consulting_call_sessions
      drop constraint if exists chk_consulting_call_sessions_customer_language,
      add constraint chk_consulting_call_sessions_customer_language
      check (customer_language_code in ('ko-KR', 'en-US'));
    alter table consulting_call_sessions
      drop constraint if exists chk_consulting_call_sessions_expert_language,
      add constraint chk_consulting_call_sessions_expert_language
      check (expert_language_code in ('ko-KR', 'en-US'));
    alter table consulting_call_sessions
      drop constraint if exists chk_consulting_call_sessions_transcription_mode,
      add constraint chk_consulting_call_sessions_transcription_mode
      check (transcription_mode in ('fixed', 'identify'));
    alter table consulting_transcript_segments add column if not exists result_id text;
    alter table consulting_transcript_segments add column if not exists speaker_type text not null default 'unknown';
    alter table consulting_transcript_segments add column if not exists source_language_code text;
    alter table consulting_transcript_segments add column if not exists content text;
    alter table consulting_transcript_segments add column if not exists target_language_code text;
    alter table consulting_transcript_segments add column if not exists translated_content text;
    alter table consulting_transcript_segments add column if not exists start_time_ms integer;
    alter table consulting_transcript_segments add column if not exists end_time_ms integer;
    alter table consulting_transcript_segments
      drop constraint if exists fk_consulting_transcript_segments_call_session,
      add constraint fk_consulting_transcript_segments_call_session
      foreign key (call_session_id) references consulting_call_sessions(id) on delete cascade;
    alter table consulting_transcript_segments
      drop constraint if exists fk_consulting_transcript_segments_booking,
      add constraint fk_consulting_transcript_segments_booking
      foreign key (booking_id) references consulting_bookings(id) on delete cascade;
    alter table consulting_transcript_segments
      drop constraint if exists chk_consulting_transcript_segments_participant_type,
      add constraint chk_consulting_transcript_segments_participant_type
      check (participant_type in ('customer', 'partner'));
    alter table consulting_transcript_segments
      drop constraint if exists chk_consulting_transcript_segments_language,
      add constraint chk_consulting_transcript_segments_language
      check (language_code in ('ko-KR', 'en-US'));
    alter table consulting_transcript_segments
      drop constraint if exists chk_consulting_transcript_segments_speaker,
      add constraint chk_consulting_transcript_segments_speaker
      check (speaker_type in ('user', 'expert', 'unknown'));
    alter table consulting_transcript_segments
      drop constraint if exists chk_consulting_transcript_segments_source_language,
      add constraint chk_consulting_transcript_segments_source_language
      check (source_language_code is null or source_language_code in ('ko-KR', 'en-US'));

    create index if not exists idx_consulting_call_sessions_booking on consulting_call_sessions (booking_id);
    create index if not exists idx_consulting_call_sessions_expert_status on consulting_call_sessions (expert_id, status, created_at desc);
    create index if not exists idx_consulting_transcript_segments_session_created on consulting_transcript_segments (call_session_id, created_at);
    create unique index if not exists uq_consulting_transcript_segments_result
      on consulting_transcript_segments (call_session_id, result_id)
      where result_id is not null;
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
  """,  "schema.sql:community-search-v1": """
    create extension if not exists pg_trgm;
    create index if not exists idx_community_threads_title_trgm
      on community_threads using gin (title gin_trgm_ops)
      where deleted_at is null and status = 'active';
    create index if not exists idx_community_threads_body_trgm
      on community_threads using gin (body gin_trgm_ops)
      where deleted_at is null and status = 'active';
  """,
}

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
