import asyncio
import os
from uuid import uuid4

import asyncpg
import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.init_db import POST_SCHEMA_MIGRATIONS
from app.schemas.media import PresignedUploadRequest
from app.services.media_uploads import (
  bind_legacy_thumbnail_session,
  complete_upload_session,
  issue_upload_session,
  resolve_legacy_upload_session_id,
)


TEST_DATABASE_URL = os.getenv("AURA_TEST_DATABASE_URL")


class ConnectionDatabase:
  def __init__(self, connection: asyncpg.Connection) -> None:
    self.connection = connection

  async def fetchrow(self, query: str, *args):
    row = await self.connection.fetchrow(query, *args)
    return dict(row) if row else None


class FakeS3Service:
  def create_presigned_upload(self, media_kind: str, content_type: str, original_filename: str | None, expires_in=900):
    object_key = f"uploads/{media_kind}/{uuid4()}.jpg"
    return {
      "bucket": "media-bucket",
      "cache_control": "private, no-store",
      "cdn_url": f"https://cdn.example.com/{object_key}",
      "content_type": content_type,
      "expires_in": expires_in,
      "method": "PUT",
      "object_key": object_key,
      "upload_url": f"https://upload.example.com/{object_key}",
    }

  def get_object_metadata(self, *, bucket: str, object_key: str):
    assert bucket == "media-bucket"
    assert object_key.startswith("uploads/")
    return {"byte_size": 123, "content_type": "image/jpeg"}

  def assert_managed_media_location(self, *, bucket: str, object_key: str):
    assert bucket == "media-bucket"
    assert object_key.startswith("uploads/")


@pytest.mark.skipif(not TEST_DATABASE_URL, reason="AURA_TEST_DATABASE_URL is not configured")
@pytest.mark.asyncio
async def test_upload_claim_insert_and_idempotency_are_atomic_in_postgres() -> None:
  connection = await asyncpg.connect(TEST_DATABASE_URL)
  schema = f"upload_security_{uuid4().hex}"
  try:
    await connection.execute(f'create schema "{schema}"')
    await connection.execute(f'set search_path to "{schema}"')
    await connection.execute(
      """
      create type media_source_type as enum ('camera', 'gallery', 'seed', 'generated');
      create table users (id uuid primary key);
      create table consulting_partner_accounts (id uuid primary key);
      create table media_assets (
        id uuid primary key,
        owner_user_id uuid,
        media_kind text not null,
        source text not null,
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
        original_filename text,
        status text not null default 'active',
        deleted_at timestamptz
      );
      """,
    )
    await connection.execute(POST_SCHEMA_MIGRATIONS["schema.sql:media-upload-sessions-v1"])
    db = ConnectionDatabase(connection)
    owner_user_id = uuid4()
    await connection.execute("insert into users (id) values ($1)", owner_user_id)
    payload = PresignedUploadRequest.model_validate(
      {
        "mediaKind": "profile-avatar",
        "contentType": "image/jpeg",
        "byteSize": 123,
        "source": "camera",
        "originalFilename": "face.jpg",
      },
    )
    s3 = FakeS3Service()
    upload = await issue_upload_session(
      db,
      Settings(s3_bucket_name="media-bucket"),
      payload,
      owner_user_id=owner_user_id,
      s3_service=s3,
    )

    with pytest.raises(AppError) as attacker_error:
      await complete_upload_session(
        db,
        Settings(s3_bucket_name="media-bucket"),
        upload["upload_id"],
        owner_user_id=uuid4(),
        s3_service=s3,
      )
    assert attacker_error.value.code == "UPLOAD_SESSION_INVALID"

    first = await complete_upload_session(
      db,
      Settings(s3_bucket_name="media-bucket"),
      upload["upload_id"],
      owner_user_id=owner_user_id,
      s3_service=s3,
    )
    second = await complete_upload_session(
      db,
      Settings(s3_bucket_name="media-bucket"),
      upload["upload_id"],
      owner_user_id=owner_user_id,
      s3_service=s3,
    )

    assert first["id"] == second["id"]
    session = await connection.fetchrow("select status, media_asset_id from media_upload_sessions where id = $1", upload["upload_id"])
    assert session["status"] == "completed"
    assert session["media_asset_id"] == first["id"]
    assert await connection.fetchval("select count(*) from media_assets") == 1

    concurrent_upload = await issue_upload_session(
      db,
      Settings(s3_bucket_name="media-bucket"),
      payload,
      owner_user_id=owner_user_id,
      s3_service=s3,
    )
    connection_a = await asyncpg.connect(TEST_DATABASE_URL)
    connection_b = await asyncpg.connect(TEST_DATABASE_URL)
    try:
      await connection_a.execute(f'set search_path to "{schema}"')
      await connection_b.execute(f'set search_path to "{schema}"')
      result_a, result_b = await asyncio.gather(
        complete_upload_session(
          ConnectionDatabase(connection_a),
          Settings(s3_bucket_name="media-bucket"),
          concurrent_upload["upload_id"],
          owner_user_id=owner_user_id,
          s3_service=s3,
        ),
        complete_upload_session(
          ConnectionDatabase(connection_b),
          Settings(s3_bucket_name="media-bucket"),
          concurrent_upload["upload_id"],
          owner_user_id=owner_user_id,
          s3_service=s3,
        ),
      )
    finally:
      await connection_a.close()
      await connection_b.close()

    assert result_a["id"] == result_b["id"]
    concurrent_session = await connection.fetchrow(
      "select status, media_asset_id from media_upload_sessions where id = $1",
      concurrent_upload["upload_id"],
    )
    assert concurrent_session["status"] == "completed"
    assert concurrent_session["media_asset_id"] == result_a["id"]
    assert await connection.fetchval("select count(*) from media_assets") == 2

    legacy_thumbnail = await issue_upload_session(
      db,
      Settings(s3_bucket_name="media-bucket"),
      PresignedUploadRequest.model_validate(
        {
          "mediaKind": "community-thread-thumbnail",
          "contentType": "image/jpeg",
          "source": "gallery",
          "originalFilename": "look-thumb.jpg",
        },
      ),
      owner_user_id=owner_user_id,
      s3_service=s3,
    )
    legacy_primary = await issue_upload_session(
      db,
      Settings(s3_bucket_name="media-bucket"),
      PresignedUploadRequest.model_validate(
        {
          "mediaKind": "community-thread",
          "contentType": "image/jpeg",
          "source": "gallery",
          "originalFilename": "look.jpg",
        },
      ),
      owner_user_id=owner_user_id,
      s3_service=s3,
    )
    resolved_id = await resolve_legacy_upload_session_id(
      db,
      Settings(s3_bucket_name="media-bucket"),
      bucket=legacy_primary["bucket"],
      object_key=legacy_primary["object_key"],
      owner_user_id=owner_user_id,
      s3_service=s3,
    )
    assert resolved_id == legacy_primary["upload_id"]
    await bind_legacy_thumbnail_session(
      db,
      Settings(s3_bucket_name="media-bucket"),
      resolved_id,
      thumbnail_bucket=legacy_thumbnail["bucket"],
      thumbnail_object_key=legacy_thumbnail["object_key"],
      owner_user_id=owner_user_id,
      s3_service=s3,
    )
    legacy_media = await complete_upload_session(
      db,
      Settings(s3_bucket_name="media-bucket"),
      resolved_id,
      owner_user_id=owner_user_id,
      s3_service=s3,
    )
    assert legacy_media["thumbnail_object_key"] == legacy_thumbnail["object_key"]
    assert await connection.fetchval("select count(*) from media_assets") == 3
  finally:
    await connection.execute(f'drop schema if exists "{schema}" cascade')
    await connection.close()
