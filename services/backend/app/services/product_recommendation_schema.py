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
  """Upgrade recommendation serving tables on an existing RDS schema."""

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

      seasonal_collections_exist = await connection.fetchval(
        "select to_regclass('public.product_seasonal_collections') is not null"
      )
      if seasonal_collections_exist:
        await connection.execute(
          """
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
            add column if not exists next_evaluation_at timestamptz
          """
        )

      seasonal_items_exist = await connection.fetchval(
        "select to_regclass('public.product_seasonal_collection_items') is not null"
      )
      if seasonal_items_exist:
        await connection.execute(
          """
          alter table product_seasonal_collection_items
            add column if not exists reason_codes text[] not null default '{}',
            add column if not exists match_score double precision not null default 0,
            add column if not exists score_components jsonb not null default '{}'::jsonb,
            add column if not exists ranking_model_version text
          """
        )

      await connection.execute(
        """
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
            region_code in (
              'KR-00','KR-11','KR-26','KR-27','KR-28','KR-29','KR-30','KR-31',
              'KR-41','KR-42','KR-43','KR-44','KR-45','KR-46','KR-47','KR-48',
              'KR-49','KR-50'
            )
          ),
          constraint chk_seasonal_serving_health_counts check (
            request_count >= 0 and fallback_count >= 0 and fallback_count <= request_count
          )
        );
        create index if not exists idx_seasonal_serving_health_recent
          on seasonal_serving_health_buckets (locale, bucket_started_at desc, region_code)
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
