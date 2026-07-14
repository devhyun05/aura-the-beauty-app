from app.db.session import Database


MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL = """
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
  ),
  constraint fk_media_upload_sessions_owner_user
    foreign key (owner_user_id) references users(id) on delete cascade,
  constraint fk_media_upload_sessions_partner_account
    foreign key (partner_account_id) references consulting_partner_accounts(id) on delete cascade,
  constraint fk_media_upload_sessions_media_asset
    foreign key (media_asset_id) references media_assets(id) on delete set null
);
alter table media_upload_sessions
  alter column status set default 'pending';
create index if not exists idx_media_upload_sessions_owner_status
  on media_upload_sessions (owner_user_id, status, expires_at);
create index if not exists idx_media_upload_sessions_partner_status
  on media_upload_sessions (partner_account_id, status, expires_at);
create index if not exists idx_media_upload_sessions_pending_expires
  on media_upload_sessions (expires_at) where status = 'pending';
""".strip()


async def ensure_media_upload_schema(db: Database) -> None:
  if not db.is_connected:
    return

  await db.execute(MEDIA_UPLOAD_SESSIONS_SCHEMA_SQL)
