"""Small forward-compatible schema guards for deployed product recommendations."""

from __future__ import annotations

from app.db.session import Database


_EXTERNAL_PRODUCT_SOURCES_SQL = "'naver_shopping_search','auradin_search','auradin_catalog'"
_EXTERNAL_PRODUCT_SOURCES = ("naver_shopping_search", "auradin_search", "auradin_catalog")


def _allows_all_external_product_sources(definition: object | None) -> bool:
  normalized = str(definition or "")
  return all(source in normalized for source in _EXTERNAL_PRODUCT_SOURCES)


def _has_current_event_identity_constraint(definition: object | None) -> bool:
  normalized = str(definition or "").lower()
  return all(
    token in normalized
    for token in ("search_submit", "product_id", "shade_id", "external_source", "external_product_id")
  )


async def ensure_product_recommendation_runtime_schema(db: Database) -> None:
  """Upgrade external likes and engagement identities on an existing RDS schema."""

  if not db.is_connected or db.pool is None:
    return
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      likes_table_exists = await connection.fetchval(
        "select to_regclass('public.external_product_likes') is not null"
      )
      if likes_table_exists:
        await connection.execute("lock table external_product_likes in share row exclusive mode")
        likes_definition = await connection.fetchval(
          """
          select pg_get_constraintdef(oid)
          from pg_constraint
          where conrelid='external_product_likes'::regclass
            and conname='chk_external_product_likes_source'
          """
        )
        if not _allows_all_external_product_sources(likes_definition):
          await connection.execute(
            f"""
            alter table external_product_likes
              drop constraint if exists chk_external_product_likes_source,
              add constraint chk_external_product_likes_source
                check (external_source in ({_EXTERNAL_PRODUCT_SOURCES_SQL}))
            """
          )
        await connection.execute(
          """
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
          """
        )

      events_table_exists = await connection.fetchval(
        "select to_regclass('public.product_engagement_events') is not null"
      )
      if not events_table_exists:
        return

      await connection.execute(
        """
        alter table product_engagement_events
          add column if not exists external_source text,
          add column if not exists external_product_id text
        """
      )
      await connection.execute("lock table product_engagement_events in share row exclusive mode")
      source_definition = await connection.fetchval(
        """
        select pg_get_constraintdef(oid)
        from pg_constraint
        where conrelid='product_engagement_events'::regclass
          and conname='chk_product_engagement_source'
        """
      )
      external_definition = await connection.fetchval(
        """
        select pg_get_constraintdef(oid)
        from pg_constraint
        where conrelid='product_engagement_events'::regclass
          and conname='chk_product_engagement_external_source'
        """
      )
      source_is_current = _has_current_event_identity_constraint(source_definition)
      external_is_current = _allows_all_external_product_sources(external_definition)
      if not source_is_current or not external_is_current:
        await connection.execute(
          f"""
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
                external_source in ({_EXTERNAL_PRODUCT_SOURCES_SQL})
                and char_length(external_product_id) between 1 and 160
              )
            )
          """
        )
      await connection.execute(
        """
        create index if not exists idx_product_engagement_external_product_type
          on product_engagement_events (external_source, external_product_id, event_type, occurred_at desc)
          where external_source is not null
        """
      )
