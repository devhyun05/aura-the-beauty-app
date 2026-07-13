from __future__ import annotations

from app.db.session import Database


async def ensure_consulting_runtime_schema(db: Database) -> None:
  if not db.is_connected:
    return

  await db.execute(
    """
    alter table consulting_bookings add column if not exists contact_name text;
    alter table consulting_bookings add column if not exists contact_phone text;
    alter table consulting_bookings add column if not exists preferred_contact_method text;
    alter table consulting_bookings add column if not exists session_mode text not null default 'online';
    alter table consulting_bookings add column if not exists operator_note text;
    alter table consulting_bookings add column if not exists confirmed_at timestamptz;
    alter table consulting_bookings add column if not exists expert_read_at timestamptz;
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

    alter table consulting_bookings
      drop constraint if exists chk_consulting_bookings_status,
      add constraint chk_consulting_bookings_status
      check (status in ('requested', 'contacting', 'confirmed', 'scheduled', 'in_progress', 'unavailable', 'completed', 'canceled'));

    alter table consulting_bookings
      drop constraint if exists chk_consulting_bookings_session_mode,
      add constraint chk_consulting_bookings_session_mode
      check (session_mode in ('online', 'offline'));

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

    alter table consulting_call_sessions add column if not exists control_region text not null default 'ap-northeast-2';

    alter table consulting_call_sessions
      drop constraint if exists chk_consulting_call_sessions_status,
      add constraint chk_consulting_call_sessions_status
      check (status in ('created', 'active', 'ended', 'failed'));

    """,
  )
