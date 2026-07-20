import argparse
import asyncio
import json
import re

import asyncpg

from app.core.settings import get_settings
from app.db.connection_config import DatabaseConfigurationError, connect_database
from app.db.init_db import (
  POST_SCHEMA_MIGRATIONS,
  SCHEMA_VERSION,
)
from app.db.seed_db import SEED_VERSION


EXPECTED_TABLES = {
  "users",
  "media_assets",
  "media_upload_sessions",
  "photo_captures",
  "analysis_reports",
  "analysis_stage_runs",
  "face_measurement_preferences",
  "face_length_measurement_snapshots",
  "saved_makeup_styles",
  "product_recommendation_operators",
  "product_recommendation_service_principals",
  "products",
  "user_product_likes",
  "external_product_likes",
  "auradin_search_sessions",
  "auradin_events",
  "product_recommendation_runs",
  "product_shades",
  "product_assets",
  "product_offers",
  "product_seasonal_collections",
  "product_seasonal_collection_items",
  "trend_keyword_candidates",
  "trend_source_observations",
  "weather_region_snapshots",
  "product_attribute_evidence",
  "product_signal_hourly",
  "search_intent_hourly",
  "seasonal_serving_health_buckets",
  "seasonal_ranking_models",
  "seasonal_pipeline_runs",
  "trend_external_call_quotas",
  "seasonal_auto_publish_audit_log",
  "product_catalog_imports",
  "product_engagement_events",
  "product_preference_profiles",
  "product_request_rate_limits",
  "product_color_cohort_memberships",
  "ar_filters",
  "user_ar_filter_states",
  "filter_extraction_reports",
  "makeup_feedback_reports",
  "makeup_journey_settings",
  "makeup_journey_day_notes",
  "makeup_journey_day_score_selections",
  "makeup_journey_missions",
  "makeup_scenario_library",
  "makeup_scenario_generation_limits",
  "makeup_situations",
  "makeup_situation_keywords",
  "makeup_keyword_question_templates",
  "makeup_recommendation_sessions",
  "makeup_recommendation_reports",
  "makeup_recommendation_assets",
  "community_threads",
  "community_thread_media",
  "community_replies",
  "community_thread_likes",
  "community_thread_saves",
  "community_reply_likes",
  "community_reports",
  "community_events",
  "consulting_categories",
  "consulting_experts",
  "consulting_expert_categories",
  "consulting_expert_durations",
  "consulting_expert_career",
  "consulting_expert_reviews",
  "consulting_bookings",
  "consulting_summaries",
  "consulting_membership_plans",
  "user_consulting_memberships",
  "consulting_payments",
  "home_hero_banners",
  "home_notices",
  "home_trend_items",
  "home_filter_store_items",
  "home_recommended_looks",
  "user_consents",
  "data_deletion_requests",
  "account_deletion_tombstones",
  "audit_logs",
  "schema_migrations",
}

EXPECTED_EXTENSIONS = {"btree_gist", "pg_trgm", "vector"}

EXPECTED_CONSTRAINTS = {
  "face_measurement_preferences": {
    "face_measurement_preferences_pkey",
    "face_measurement_preferences_user_id_fkey",
    "chk_face_measurement_preferences_source",
    "chk_face_measurement_preferences_locale_format",
    "chk_face_measurement_preferences_selection_state",
  },
  "face_length_measurement_snapshots": {
    "face_length_measurement_snapshots_pkey",
    "face_length_measurement_snapshots_report_id_fkey",
    "chk_face_length_snapshot_capture_id",
    "chk_face_length_snapshot_contract_id",
    "chk_face_length_snapshot_finite_positive",
    "chk_face_length_snapshot_band",
    "chk_face_length_snapshot_client_observed_only",
  },
  "product_recommendation_operators": {
    "fk_product_recommendation_operator_user",
    "fk_product_recommendation_operator_granted_by",
  },
  "user_product_likes": {"fk_user_product_likes_shade_product"},
  "product_recommendation_runs": {
    "fk_product_recommendation_runs_source_makeup_report",
    "chk_product_recommendation_runs_strategy",
    "chk_product_recommendation_runs_status",
    "chk_product_recommendation_runs_revision",
    "chk_product_recommendation_runs_makeup_snapshot",
    "chk_product_recommendation_runs_makeup_completion",
  },
  "product_shades": {"uq_product_shades_id_product", "chk_product_shades_region"},
  "product_assets": {"fk_product_assets_shade_product"},
  "product_offers": {"fk_product_offers_shade_product"},
  "product_seasonal_collection_items": {"fk_product_seasonal_items_shade_product"},
  "product_seasonal_collections": {
    "fk_product_seasonal_pipeline_run",
    "fk_product_seasonal_service_publisher",
  },
  "product_engagement_events": {"fk_product_engagement_shade_product"},
  "product_signal_hourly": {"chk_product_signal_hourly_privacy_threshold"},
  "search_intent_hourly": {"chk_search_intent_hourly_privacy_threshold"},
  "seasonal_serving_health_buckets": {
    "chk_seasonal_serving_health_region",
    "chk_seasonal_serving_health_counts",
  },
  "seasonal_pipeline_runs": {"chk_seasonal_pipeline_run_trigger"},
  "seasonal_auto_publish_audit_log": {"chk_seasonal_auto_publish_decision_refs"},
  "makeup_feedback_reports": {
    "fk_makeup_feedback_reports_parent",
    "chk_makeup_feedback_kind",
    "chk_makeup_feedback_parent_presence",
    "chk_makeup_feedback_parent_not_self",
  },
  "makeup_journey_settings": {
    "fk_makeup_journey_settings_user",
    "chk_makeup_journey_goal_score",
    "chk_makeup_journey_mission_level",
    "chk_makeup_journey_timezone_name",
  },
  "makeup_journey_day_notes": {
    "fk_makeup_journey_day_notes_user",
    "fk_makeup_journey_day_notes_report",
    "chk_makeup_journey_day_note_length",
  },
  "makeup_journey_day_score_selections": {
    "pk_makeup_journey_day_score_selections",
    "fk_makeup_journey_day_score_selections_user",
    "fk_makeup_journey_day_score_selections_report",
  },
  "makeup_journey_missions": {
    "fk_makeup_journey_missions_user",
    "chk_makeup_journey_mission_source",
    "chk_makeup_journey_mission_difficulty",
    "chk_makeup_journey_mission_title",
    "chk_makeup_journey_mission_completion",
  },
  "makeup_recommendation_sessions": {
    "uq_makeup_recommendation_sessions_user_idempotency",
    "uq_makeup_recommendation_sessions_report",
  },
  "makeup_recommendation_reports": {"fk_makeup_recommendation_reports_session"},
  "makeup_scenario_library": {"chk_makeup_scenario_library_trend_evidence"},
  "makeup_recommendation_assets": {
    "uq_makeup_recommendation_assets_report_look",
    "chk_makeup_recommendation_assets_private_url",
    "chk_makeup_recommendation_assets_provenance",
  },
}

EXPECTED_COLUMNS = {
  "analysis_reports": {"embedding", "deleted_at"},
  "face_measurement_preferences": {
    "user_id",
    "self_selected_locale",
    "locale_selection_source",
    "locale_selected_at",
    "created_at",
    "updated_at",
  },
  "face_length_measurement_snapshots": {
    "report_id",
    "measurement_capture_id",
    "measurement_contract_id",
    "face_length_ratio",
    "estimate_low",
    "estimate_high",
    "captured_at",
    "evidence_provenance",
    "norm_training_eligible",
    "norm_attestation_id",
    "created_at",
  },
  "community_threads": {"embedding"},
  "auradin_search_sessions": {
    "state",
    "expires_at",
    # A9 v2 (schema.sql:auradin-sessions-v2) — 멱등성·CAS 컬럼
    "owner_subject",
    "version",
    "client_request_id",
    "request_fingerprint",
    "idempotency_expires_at",
  },
  "media_upload_sessions": {"media_asset_id", "owner_user_id", "partner_account_id"},
  # A5 (schema.sql:auradin-events-v1) — §7.2 이벤트 스키마 정본
  "auradin_events": {
    "client_event_id",
    "schema_version",
    "owner_subject",
    "session_id",
    "turn_id",
    "result_set_id",
    "event_type",
    "product_id",
    "category",
    "rank",
    "role",
    "match_rate",
    "data_manifest_id",
    "release_manifest_id",
    "catalog_run_date",
    "ranker_version",
    "payload",
    "occurred_at",
    "received_at",
    "experiment_id",
    "variant",
  },
  "saved_makeup_styles": {"client_request_id", "style_payload", "archived_at"},
  "products": {
    "catalog_status",
    "catalog_version",
    "license_status",
    "allowed_uses",
    "tags",
    "product_payload",
  },
  "product_seasonal_collections": {
    "region_code",
    "region_label",
    "algorithm_version",
    "input_fingerprint",
    "freshness_status",
    "auto_publish_policy_version",
    "pipeline_run_id",
    "published_by_service_principal_id",
    "next_evaluation_at",
  },
  "product_seasonal_collection_items": {"score_components", "ranking_model_version"},
  "seasonal_serving_health_buckets": {
    "bucket_started_at",
    "locale",
    "region_code",
    "request_count",
    "fallback_count",
  },
  "product_recommendation_operators": {"roles", "is_active", "granted_by"},
  "user_product_likes": {"source_shade_id"},
  "external_product_likes": {"external_source", "external_product_id", "purchase_url", "liked_at"},
  "product_engagement_events": {"external_source", "external_product_id"},
  "product_recommendation_runs": {
    "source_style_id",
    "source_makeup_report_id",
    "source_look_id",
    "strategy",
    "algorithm_version",
    "recipe_hash",
    "catalog_version",
    "status",
    "revision",
    "started_at",
    "completed_at",
    "error_code",
    "expires_at",
  },
  "makeup_recommendation_reports": {
    "recommendation",
    "image_status",
    "image_url",
    "recommendation_model_id",
    "parent_report_id",
    "refinement_type",
    "source_analysis_report_id",
    "session_id",
    "situation_id",
    "keyword_id",
    "context_snapshot",
    "schema_version",
    "image_mode",
  },
  "makeup_scenario_library": {
    "normalized_text",
    "seed_prompt",
    "status",
    "usage_count",
    "model_id",
    "last_served_at",
    "keyword_kind",
    "source_name",
    "source_url",
    "source_published_at",
    "evidence_summary",
    "market_scope",
    "trend_score",
    "confidence",
    "review_status",
    "locale",
    "as_of",
    "valid_from",
    "expires_at",
  },
  "makeup_scenario_generation_limits": {
    "user_id",
    "window_started_at",
    "request_count",
  },
  "makeup_situations": {
    "key",
    "label",
    "description",
    "image_asset_key",
    "icon_key",
    "sort_order",
    "status",
  },
  "makeup_situation_keywords": {
    "situation_id",
    "keyword_id",
    "relevance_score",
    "sort_order",
    "status",
  },
  "makeup_keyword_question_templates": {
    "keyword_id",
    "template_version",
    "locale",
    "questions",
    "source",
    "model_id",
    "prompt_version",
    "review_status",
    "status",
    "reviewed_at",
  },
  "makeup_recommendation_sessions": {
    "user_id",
    "analysis_report_id",
    "situation_id",
    "keyword_id",
    "custom_situation_text",
    "context_snapshot",
    "questions",
    "answers",
    "current_question_index",
    "status",
    "report_id",
    "idempotency_key",
    "image_mode",
    "expires_at",
  },
  "makeup_recommendation_assets": {
    "report_id",
    "look_id",
    "role",
    "status",
    "image_url",
    "storage_bucket",
    "object_key",
    "content_type",
    "is_private",
    "input_media_id",
    "provenance",
    "attempt_count",
  },
  "user_consents": {"recorded_at"},
  "makeup_feedback_reports": {"entry_date", "feedback_kind", "parent_feedback_report_id"},
  "makeup_journey_settings": {
    "user_id", "goal_score", "mission_level", "timezone_name", "created_at", "updated_at",
  },
  "makeup_journey_day_notes": {
    "id", "user_id", "entry_date", "report_id", "content", "created_at", "updated_at",
  },
  "makeup_journey_day_score_selections": {
    "user_id", "entry_date", "report_id", "created_at", "updated_at",
  },
  "makeup_journey_missions": {
    "id", "user_id", "entry_date", "source", "difficulty", "title", "is_completed",
    "completed_at", "sort_order", "generation_payload", "created_at", "updated_at",
  },
}

EXPECTED_COLUMN_CONTRACTS = {
  "face_measurement_preferences.user_id": {"is_nullable": "NO"},
  "face_measurement_preferences.self_selected_locale": {"is_nullable": "YES"},
  "face_measurement_preferences.locale_selection_source": {
    "is_nullable": "NO",
    "default_contains": "unset",
  },
  "face_length_measurement_snapshots.report_id": {"is_nullable": "NO"},
  "face_length_measurement_snapshots.measurement_capture_id": {"is_nullable": "NO"},
  "face_length_measurement_snapshots.measurement_contract_id": {"is_nullable": "NO"},
  "face_length_measurement_snapshots.face_length_ratio": {"is_nullable": "NO"},
  "face_length_measurement_snapshots.estimate_low": {"is_nullable": "NO"},
  "face_length_measurement_snapshots.estimate_high": {"is_nullable": "NO"},
  "face_length_measurement_snapshots.captured_at": {"is_nullable": "NO"},
  "face_length_measurement_snapshots.evidence_provenance": {
    "is_nullable": "NO",
    "default_contains": "client_observed_unverified",
  },
  "face_length_measurement_snapshots.norm_training_eligible": {
    "is_nullable": "NO",
    "default_contains": "false",
  },
  "face_length_measurement_snapshots.norm_attestation_id": {"is_nullable": "YES"},
  "auradin_search_sessions.owner_subject": {"is_nullable": "NO"},
  "auradin_search_sessions.version": {"is_nullable": "NO", "default_contains": "0"},
  # A5 — MVP 필수 계약 필드(멱등성·귀속·시간)는 소급 추가 불가라 NOT NULL을 검증한다.
  "auradin_events.client_event_id": {"is_nullable": "NO"},
  "auradin_events.owner_subject": {"is_nullable": "NO"},
  "auradin_events.event_type": {"is_nullable": "NO"},
  "auradin_events.schema_version": {"is_nullable": "NO", "default_contains": "1"},
  "auradin_events.data_manifest_id": {"is_nullable": "NO"},
  "auradin_events.release_manifest_id": {"is_nullable": "NO"},
  "auradin_events.occurred_at": {"is_nullable": "NO"},
  "auradin_events.received_at": {"is_nullable": "NO", "default_contains": "now"},
  "product_recommendation_runs.status": {
    "is_nullable": "NO",
    "default_contains": "ready",
  },
  "product_recommendation_runs.revision": {
    "is_nullable": "NO",
    "default_contains": "1",
  },
  "makeup_feedback_reports.entry_date": {
    "is_nullable": "NO",
    "default_contains": "Asia/Seoul",
  },
  "makeup_feedback_reports.feedback_kind": {"is_nullable": "NO", "default_contains": "initial"},
  "makeup_journey_settings.goal_score": {"is_nullable": "NO"},
  "makeup_journey_settings.mission_level": {"is_nullable": "NO"},
  "makeup_journey_settings.timezone_name": {
    "is_nullable": "NO",
    "default_contains": "Asia/Seoul",
  },
  "makeup_journey_day_notes.user_id": {"is_nullable": "NO"},
  "makeup_journey_day_notes.entry_date": {"is_nullable": "NO"},
  "makeup_journey_day_notes.report_id": {"is_nullable": "YES"},
  "makeup_journey_day_notes.content": {"is_nullable": "NO"},
  "makeup_journey_day_score_selections.user_id": {"is_nullable": "NO"},
  "makeup_journey_day_score_selections.entry_date": {"is_nullable": "NO"},
  "makeup_journey_day_score_selections.report_id": {"is_nullable": "NO"},
  "makeup_journey_missions.user_id": {"is_nullable": "NO"},
  "makeup_journey_missions.entry_date": {"is_nullable": "NO"},
  "makeup_journey_missions.source": {"is_nullable": "NO"},
  "makeup_journey_missions.difficulty": {"is_nullable": "NO"},
  "makeup_journey_missions.title": {"is_nullable": "NO"},
  "makeup_journey_missions.is_completed": {
    "is_nullable": "NO",
    "default_contains": "false",
  },
  "makeup_journey_missions.sort_order": {"is_nullable": "NO", "default_contains": "0"},
  "makeup_journey_missions.generation_payload": {"is_nullable": "NO", "default_contains": "{}"},
  "makeup_recommendation_sessions.user_id": {"is_nullable": "NO"},
  "makeup_recommendation_sessions.analysis_report_id": {"is_nullable": "NO"},
  "makeup_recommendation_sessions.idempotency_key": {"is_nullable": "NO"},
  "makeup_recommendation_sessions.image_mode": {"is_nullable": "NO", "default_contains": "generic"},
  "makeup_recommendation_reports.context_snapshot": {"is_nullable": "NO"},
  "makeup_recommendation_reports.schema_version": {
    "is_nullable": "NO",
    "default_contains": "makeup-recommendation-v2",
  },
  "makeup_recommendation_reports.image_mode": {"is_nullable": "NO", "default_contains": "generic"},
  "makeup_recommendation_assets.is_private": {"is_nullable": "NO", "default_contains": "false"},
  "makeup_recommendation_assets.provenance": {"is_nullable": "NO", "default_contains": "{}"},
}

EXPECTED_CONSTRAINT_CONTRACTS = {
  "fk_product_recommendation_runs_source_makeup_report": (
    "foreign key (source_makeup_report_id)",
    "references makeup_recommendation_reports(id)",
    "on delete cascade",
  ),
  "chk_product_recommendation_runs_strategy": (
    "'makeup_report_v1'",
    "'legacy_v1'",
    "'ar_v1'",
  ),
  "chk_product_recommendation_runs_status": (
    "'pending'",
    "'processing'",
    "'ready'",
    "'partial'",
    "'failed'",
  ),
  "chk_product_recommendation_runs_revision": ("revision >= 1",),
  "chk_product_recommendation_runs_makeup_snapshot": (
    "strategy = 'makeup_report_v1'",
    "source_makeup_report_id is not null",
    "source_look_id is not null",
    "recipe_hash is not null",
    "algorithm_version is not null",
    "catalog_version is not null",
    "strategy <> 'makeup_report_v1'",
    "source_makeup_report_id is null",
  ),
  "chk_product_recommendation_runs_makeup_completion": (
    "status = 'pending'",
    "status = 'processing'",
    "status = any (array['ready'",
    "'partial'",
    "started_at is not null",
    "completed_at is not null",
    "completed_at >= started_at",
    "status = 'failed'",
    "error_code is not null",
  ),
  "chk_product_shades_region": (
    "product_region",
    "'lip'::text",
    "'cheek'::text",
    "'shadow'::text",
    "'liner'::text",
    "'base'::text",
    "'brow'::text",
  ),
  "chk_face_length_snapshot_client_observed_only": (
    "evidence_provenance = 'client_observed_unverified'",
    "norm_training_eligible = false",
    "norm_attestation_id is null",
    " and ",
  ),
  "chk_makeup_scenario_library_trend_evidence": (
    "keyword_kind <> 'trend'",
    "source_name is not null",
    "source_url is not null",
    "source_published_at is not null",
    "market_scope is not null",
    "as_of is not null",
    "expires_at is not null",
  ),
  "chk_auradin_sessions_idempotency_fields": (
    "(client_request_id is null) = (request_fingerprint is null)",
    "(client_request_id is null) = (idempotency_expires_at is null)",
    " and ",
  ),
  # A5 — 이벤트 타입 정본 11종 enum (§7.2 SQL이 정본)
  "auradin_events_event_type_check": (
    "'session_start'",
    "'question_answered'",
    "'impression'",
    "'product_open'",
    "'save'",
    "'unsave'",
    "'purchase_click'",
    "'refine_dial'",
    "'refine_prompt'",
    "'hide'",
    "'unhide'",
  ),
  # A5 — 재시도 멱등성 유니크는 전역 ID가 아니라 (owner_subject, client_event_id) 복합
  "auradin_events_owner_subject_client_event_id_key": (
    "unique",
    "owner_subject",
    "client_event_id",
  ),
  "chk_product_signal_hourly_privacy_threshold": (
    "not is_privacy_eligible",
    "distinct_user_count >= 20",
  ),
  "chk_search_intent_hourly_privacy_threshold": (
    "not is_privacy_eligible",
    "distinct_user_count >= 20",
  ),
  "chk_seasonal_serving_health_counts": (
    "request_count >= 0",
    "fallback_count >= 0",
    "fallback_count <= request_count",
  ),
  "chk_seasonal_pipeline_run_trigger": (
    "'scheduled'",
    "'manual'",
    "'retry'",
    "'health'",
  ),
  "chk_seasonal_auto_publish_decision_refs": (
    "decision = 'published'",
    "collection_id is not null",
    "decision = 'rolled_back'",
    "previous_collection_id is not null",
  ),
  "chk_makeup_feedback_parent_presence": (
    "feedback_kind = 'initial'::text",
    "parent_feedback_report_id is null",
    "feedback_kind = 'correction'::text",
    "parent_feedback_report_id is not null",
  ),
  "chk_makeup_feedback_parent_not_self": (
    "parent_feedback_report_id is null",
    "parent_feedback_report_id <> id",
  ),
  "chk_makeup_journey_goal_score": (
    "goal_score >= 1",
    "goal_score <= 100",
  ),
  "chk_makeup_journey_mission_level": (
    "'beginner'",
    "'intermediate'",
    "'advanced'",
  ),
  "chk_makeup_journey_timezone_name": (
    "char_length(btrim(timezone_name)) >= 1",
    "char_length(btrim(timezone_name)) <= 64",
  ),
  "chk_makeup_journey_day_note_length": (
    "char_length(content) <= 2000",
  ),
  "chk_makeup_journey_mission_source": (
    "'curated'",
    "'ai'",
    "'user'",
  ),
  "chk_makeup_journey_mission_difficulty": (
    "'beginner'",
    "'intermediate'",
    "'advanced'",
  ),
  "chk_makeup_journey_mission_title": (
    "char_length(btrim(title)) >= 1",
    "char_length(btrim(title)) <= 120",
  ),
  "chk_makeup_journey_mission_completion": (
    "is_completed",
    "completed_at is not null",
    "not is_completed",
    "completed_at is null",
  ),
}

EXPECTED_TRIGGER_CONTRACTS = {
  "trg_seasonal_auto_publish_audit_immutable": (
    "before",
    "delete",
    "update",
    "seasonal_auto_publish_audit_log",
  ),
  "trg_seasonal_auto_publish_audit_no_truncate": (
    "before truncate",
    "seasonal_auto_publish_audit_log",
  ),
}

FORBIDDEN_CONSTRAINT_FRAGMENTS = {
  "chk_makeup_scenario_library_trend_evidence": ("review_status = 'approved'",),
}

# R1 (schema.sql:product-category-brow-v1) — brow가 빠지면 Auradin 브로우 찜이 lip으로 강등된다.
EXPECTED_ENUM_VALUES = {
  "product_category": {"lip", "cheek", "shadow", "liner", "base", "brow"},
}

EXPECTED_INDEX_CONTRACTS = {
  "idx_product_recommendation_runs_source_makeup_report": (
    "source_makeup_report_id",
    "where (source_makeup_report_id is not null)",
  ),
  "uq_product_recommendation_runs_makeup_snapshot_revision": (
    "unique",
    "source_makeup_report_id",
    "source_look_id",
    "recipe_hash",
    "algorithm_version",
    "catalog_version",
    "revision",
    "where (strategy = 'makeup_report_v1'::text)",
  ),
  "uq_product_recommendation_runs_makeup_look_revision": (
    "unique",
    "source_makeup_report_id",
    "source_look_id",
    "revision",
    "where (strategy = 'makeup_report_v1'::text)",
  ),
  "idx_product_recommendation_runs_makeup_ready_revision": (
    "user_id",
    "source_makeup_report_id",
    "source_look_id",
    "revision desc",
    "where",
    "strategy = 'makeup_report_v1'::text",
    "status = any",
  ),
  "idx_product_recommendation_runs_makeup_work_queue": (
    "status",
    "started_at",
    "created_at",
    "where",
    "strategy = 'makeup_report_v1'::text",
    "status = any",
  ),
  "idx_face_length_snapshots_contract_captured": (
    "measurement_contract_id",
    "captured_at",
    "report_id",
  ),
  "idx_analysis_reports_user_active_analyzed": (
    "user_id",
    "analyzed_at",
    "where (deleted_at is null)",
  ),
  "idx_makeup_situations_active_sort": ("status", "sort_order", "key"),
  "idx_makeup_situation_keywords_discovery": ("situation_id", "status", "sort_order"),
  "idx_makeup_keyword_question_templates_lookup": (
    "keyword_id",
    "locale",
    "status",
    "review_status",
    "template_version",
  ),
  "uq_makeup_keyword_question_templates_active_reviewed": (
    "unique",
    "keyword_id",
    "where",
    "status = 'active'",
    "review_status = 'approved'",
  ),
  "idx_makeup_scenario_library_discovery": ("locale", "keyword_kind", "review_status", "status"),
  "uq_makeup_scenario_library_locale_scope": (
    "unique",
    "normalized_text",
    "locale",
    "coalesce",
    "market_scope",
  ),
  "idx_makeup_recommendation_sessions_active": ("user_id", "status", "expires_at"),
  "uq_makeup_recommendation_reports_session": (
    "unique",
    "session_id",
  ),
  "idx_makeup_recommendation_assets_report_status": ("report_id", "status", "role"),
  "idx_auradin_search_sessions_expires_at": ("expires_at",),
  "uq_auradin_sessions_owner_client_request": (
    "unique",
    "owner_subject",
    "client_request_id",
    "where (client_request_id is not null)",
  ),
  "idx_auradin_sessions_idempotency_expires": (
    "idempotency_expires_at",
    "where (idempotency_expires_at is not null)",
  ),
  # A5 — §7.2 인덱스 4종
  "idx_auradin_events_owner_time": ("owner_subject", "occurred_at"),
  "idx_auradin_events_session": ("session_id",),
  "idx_auradin_events_manifest": ("data_manifest_id",),
  "idx_auradin_events_received": ("received_at",),
  "uq_product_seasonal_single_published": (
    "unique",
    "product_seasonal_collections",
    "slug",
    "where (status = 'published'::text)",
  ),
  "idx_seasonal_serving_health_recent": (
    "seasonal_serving_health_buckets",
    "locale",
    "bucket_started_at",
    "region_code",
  ),
  "idx_makeup_feedback_reports_user_entry_status_completed": (
    "user_id", "entry_date", "status", "completed_at", "id",
  ),
  "idx_makeup_journey_missions_user_date_order": (
    "user_id", "entry_date", "sort_order",
  ),
  "uq_makeup_journey_missions_user_date_title_ci": (
    "unique", "user_id", "entry_date", "lower(title)",
  ),
  "idx_makeup_journey_day_score_selections_report": (
    "report_id",
  ),
  "uq_makeup_journey_day_notes_report": (
    "unique", "user_id", "entry_date", "report_id", "where (report_id is not null)",
  ),
  "uq_makeup_journey_day_notes_empty_date": (
    "unique", "user_id", "entry_date", "where (report_id is null)",
  ),
}

def _is_legacy_global_keyword_unique_index(definition: str) -> bool:
  normalized = " ".join(str(definition or "").lower().replace('"', "").split())
  return bool(
    re.search(
      r"\bcreate unique index\b.*\bon (?:public\.)?makeup_scenario_library"
      r"(?: using [a-z0-9_]+)? \(normalized_text\)(?:\s|$)",
      normalized,
    ),
  )


async def fetch_table_names(connection: asyncpg.Connection) -> set[str]:
  rows = await connection.fetch(
    """
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    """,
  )

  return {row["table_name"] for row in rows}

async def fetch_table_columns(connection: asyncpg.Connection) -> dict[str, set[str]]:
  rows = await connection.fetch(
    """
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
    """,
  )

  columns: dict[str, set[str]] = {}
  for row in rows:
    columns.setdefault(row["table_name"], set()).add(row["column_name"])
  return columns


async def fetch_column_contracts(connection: asyncpg.Connection) -> dict[str, dict[str, str | None]]:
  rows = await connection.fetch(
    """
    select table_name, column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
    """,
  )
  return {
    f"{row['table_name']}.{row['column_name']}": {
      "is_nullable": row["is_nullable"],
      "column_default": row["column_default"],
    }
    for row in rows
  }


async def fetch_constraints(connection: asyncpg.Connection) -> dict[str, str]:
  rows = await connection.fetch(
    """
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where connamespace = 'public'::regnamespace
    """,
  )
  return {str(row["conname"]): str(row["definition"]).lower() for row in rows}


async def fetch_triggers(connection: asyncpg.Connection) -> dict[str, str]:
  rows = await connection.fetch(
    """
    select trigger_row.tgname,pg_get_triggerdef(trigger_row.oid) as definition
    from pg_trigger trigger_row
    join pg_class relation on relation.oid=trigger_row.tgrelid
    join pg_namespace namespace_row on namespace_row.oid=relation.relnamespace
    where namespace_row.nspname='public' and not trigger_row.tgisinternal
    """,
  )
  return {str(row["tgname"]): str(row["definition"]).lower() for row in rows}


async def fetch_indexes(connection: asyncpg.Connection) -> dict[str, str]:
  rows = await connection.fetch(
    """
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
    """,
  )
  return {str(row["indexname"]): str(row["indexdef"]).lower() for row in rows}


async def fetch_enum_values(connection: asyncpg.Connection) -> dict[str, set[str]]:
  rows = await connection.fetch(
    """
    select t.typname, e.enumlabel
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    """,
  )
  values: dict[str, set[str]] = {}
  for row in rows:
    values.setdefault(str(row["typname"]), set()).add(str(row["enumlabel"]))
  return values


async def fetch_extensions(connection: asyncpg.Connection) -> set[str]:
  rows = await connection.fetch("select extname from pg_extension")
  return {row["extname"] for row in rows}

async def fetch_table_constraints(connection: asyncpg.Connection) -> dict[str, set[str]]:
  rows = await connection.fetch(
    """
    select relation.relname as table_name, constraint_row.conname as constraint_name
    from pg_constraint constraint_row
    join pg_class relation on relation.oid=constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid=relation.relnamespace
    where namespace_row.nspname='public'
    """,
  )
  constraints: dict[str, set[str]] = {}
  for row in rows:
    constraints.setdefault(row["table_name"], set()).add(row["constraint_name"])
  return constraints

async def fetch_applied_versions(connection: asyncpg.Connection) -> set[str]:
  if "schema_migrations" not in await fetch_table_names(connection):
    return set()

  rows = await connection.fetch("select version from schema_migrations")

  return {row["version"] for row in rows}


def build_schema_report(
  table_names: set[str],
  applied_versions: set[str],
  require_seed: bool = False,
  table_columns: dict[str, set[str]] | None = None,
  installed_extensions: set[str] | None = None,
  column_contracts: dict[str, dict[str, str | None]] | None = None,
  constraints: set[str] | dict[str, str] | None = None,
  indexes: dict[str, str] | None = None,
  triggers: dict[str, str] | None = None,
  enum_values: dict[str, set[str]] | None = None,
  table_constraints: dict[str, set[str]] | None = None,
) -> dict[str, object]:
  expected_versions = {SCHEMA_VERSION, *POST_SCHEMA_MIGRATIONS}

  if require_seed:
    expected_versions.add(SEED_VERSION)

  missing_tables = sorted(EXPECTED_TABLES - table_names)
  missing_versions = sorted(expected_versions - applied_versions)
  missing_extensions = []
  if installed_extensions is not None:
    missing_extensions = sorted(EXPECTED_EXTENSIONS - installed_extensions)
  missing_columns = {}
  if table_columns is not None:
    missing_columns = {
      table: sorted(columns - table_columns.get(table, set()))
      for table, columns in EXPECTED_COLUMNS.items()
      if columns - table_columns.get(table, set())
    }
  invalid_column_contracts = []
  if column_contracts is not None:
    for column, expected in EXPECTED_COLUMN_CONTRACTS.items():
      actual = column_contracts.get(column, {})
      nullable = expected.get("is_nullable")
      default_contains = expected.get("default_contains")
      if nullable and actual.get("is_nullable") != nullable:
        invalid_column_contracts.append(f"{column}.nullability")
      if default_contains and default_contains not in str(actual.get("column_default") or ""):
        invalid_column_contracts.append(f"{column}.default")
  missing_constraints = []
  invalid_constraints = []
  if constraints is not None:
    constraint_names = set(constraints)
    missing_constraints = sorted(set(EXPECTED_CONSTRAINT_CONTRACTS) - constraint_names)
    if isinstance(constraints, dict):
      for name, fragments in EXPECTED_CONSTRAINT_CONTRACTS.items():
        definition = constraints.get(name, "")
        forbidden = FORBIDDEN_CONSTRAINT_FRAGMENTS.get(name, ())
        if definition and (
          any(fragment not in definition for fragment in fragments)
          or any(fragment in definition for fragment in forbidden)
        ):
          invalid_constraints.append(name)
  invalid_indexes = []
  legacy_global_unique_indexes = []
  if indexes is not None:
    for name, fragments in EXPECTED_INDEX_CONTRACTS.items():
      definition = indexes.get(name, "")
      if not definition or any(fragment not in definition for fragment in fragments):
        invalid_indexes.append(name)
    legacy_global_unique_indexes = sorted(
      name
      for name, definition in indexes.items()
      if _is_legacy_global_keyword_unique_index(definition)
    )
  invalid_triggers = []
  if triggers is not None:
    for name, fragments in EXPECTED_TRIGGER_CONTRACTS.items():
      definition = triggers.get(name, "")
      if not definition or any(fragment not in definition for fragment in fragments):
        invalid_triggers.append(name)
  missing_enum_values = {}
  if enum_values is not None:
    missing_enum_values = {
      enum_name: sorted(expected - enum_values.get(enum_name, set()))
      for enum_name, expected in EXPECTED_ENUM_VALUES.items()
      if expected - enum_values.get(enum_name, set())
    }
  # dev: per-table named constraints (EXPECTED_CONSTRAINTS) — distinct from the
  # A5 constraint-contract check above, so it keeps its own report key.
  missing_table_constraints = {}
  if table_constraints is not None:
    missing_table_constraints = {
      table: sorted(expected - table_constraints.get(table, set()))
      for table, expected in EXPECTED_CONSTRAINTS.items()
      if expected - table_constraints.get(table, set())
    }

  return {
    "ok": not any((
      missing_tables,
      missing_versions,
      missing_columns,
      missing_extensions,
      invalid_column_contracts,
      missing_constraints,
      invalid_constraints,
      invalid_indexes,
      invalid_triggers,
      legacy_global_unique_indexes,
      missing_enum_values,
      missing_table_constraints,
    )),
    "expectedTables": sorted(EXPECTED_TABLES),
    "missingTables": missing_tables,
    "expectedExtensions": sorted(EXPECTED_EXTENSIONS),
    "missingExtensions": missing_extensions,
    "expectedColumns": {table: sorted(columns) for table, columns in EXPECTED_COLUMNS.items()},
    "missingColumns": missing_columns,
    "expectedEnumValues": {name: sorted(values) for name, values in EXPECTED_ENUM_VALUES.items()},
    "missingEnumValues": missing_enum_values,
    "invalidColumnContracts": sorted(invalid_column_contracts),
    "missingConstraints": missing_constraints,
    "invalidConstraints": sorted(invalid_constraints),
    "invalidIndexes": sorted(invalid_indexes),
    "invalidTriggers": sorted(invalid_triggers),
    "legacyGlobalUniqueIndexes": legacy_global_unique_indexes,
    "expectedConstraints": {table: sorted(constraints) for table, constraints in EXPECTED_CONSTRAINTS.items()},
    "missingTableConstraints": missing_table_constraints,
    "appliedVersions": sorted(applied_versions),
    "missingVersions": missing_versions,
  }


async def check_schema(database_url: str | None = None, require_seed: bool = False) -> dict[str, object]:
  settings = get_settings()
  dsn = database_url or settings.database_url

  if dsn:
    connection = await asyncpg.connect(dsn=dsn)
  else:
    try:
      connection, _ = await connect_database(settings)
    except DatabaseConfigurationError as error:
      raise RuntimeError("DATABASE_URL or DATABASE_SECRET_ID is required to check the schema.") from error

  try:
    table_names = await fetch_table_names(connection)
    table_columns = await fetch_table_columns(connection)
    column_contracts = await fetch_column_contracts(connection)
    constraints = await fetch_constraints(connection)
    indexes = await fetch_indexes(connection)
    triggers = await fetch_triggers(connection)
    installed_extensions = await fetch_extensions(connection)
    enum_values = await fetch_enum_values(connection)
    table_constraints = await fetch_table_constraints(connection)
    applied_versions = await fetch_applied_versions(connection)
  finally:
    await connection.close()

  return build_schema_report(
    table_names,
    applied_versions,
    require_seed=require_seed,
    table_columns=table_columns,
    installed_extensions=installed_extensions,
    column_contracts=column_contracts,
    constraints=constraints,
    indexes=indexes,
    triggers=triggers,
    enum_values=enum_values,
    table_constraints=table_constraints,
  )


def format_schema_report(report: dict[str, object]) -> str:
  status = "ok" if report["ok"] else "failed"
  lines = [f"Schema check: {status}"]

  missing_tables = report["missingTables"]
  missing_extensions = report["missingExtensions"]
  missing_columns = report["missingColumns"]
  missing_enum_values = report["missingEnumValues"]
  invalid_column_contracts = report["invalidColumnContracts"]
  missing_constraints = report["missingConstraints"]
  invalid_indexes = report["invalidIndexes"]
  legacy_global_unique_indexes = report["legacyGlobalUniqueIndexes"]
  invalid_constraints = report["invalidConstraints"]
  invalid_triggers = report["invalidTriggers"]
  missing_versions = report["missingVersions"]
  missing_table_constraints = report["missingTableConstraints"]

  if missing_tables:
    lines.append("Missing tables:")
    lines.extend(f"- {name}" for name in missing_tables)

  if missing_extensions:
    lines.append("Missing extensions:")
    lines.extend(f"- {name}" for name in missing_extensions)

  if missing_columns:
    lines.append("Missing columns:")
    for table, columns in missing_columns.items():
      lines.extend(f"- {table}.{column}" for column in columns)

  if missing_enum_values:
    lines.append("Missing enum values:")
    for enum_name, values in missing_enum_values.items():
      lines.extend(f"- {enum_name}.{value}" for value in values)

  if missing_versions:
    lines.append("Missing migration markers:")
    lines.extend(f"- {version}" for version in missing_versions)

  if invalid_column_contracts:
    lines.append("Invalid column contracts:")
    lines.extend(f"- {name}" for name in invalid_column_contracts)

  if missing_constraints:
    lines.append("Missing constraints:")
    lines.extend(f"- {name}" for name in missing_constraints)

  if missing_table_constraints:
    lines.append("Missing table constraints:")
    for table, constraints in missing_table_constraints.items():
      lines.extend(f"- {table}.{constraint}" for constraint in constraints)

  if invalid_constraints:
    lines.append("Invalid constraints:")
    lines.extend(f"- {name}" for name in invalid_constraints)

  if invalid_indexes:
    lines.append("Missing or invalid indexes:")
    lines.extend(f"- {name}" for name in invalid_indexes)

  if invalid_triggers:
    lines.append("Missing or invalid triggers:")
    lines.extend(f"- {name}" for name in invalid_triggers)
  if legacy_global_unique_indexes:
    lines.append("Legacy global keyword unique indexes that must be removed:")
    lines.extend(f"- {name}" for name in legacy_global_unique_indexes)

  if not any((
    missing_tables,
    missing_versions,
    missing_columns,
    missing_extensions,
    missing_enum_values,
    invalid_column_contracts,
    missing_constraints,
    invalid_constraints,
    invalid_indexes,
    invalid_triggers,
    legacy_global_unique_indexes,
    missing_table_constraints,
  )):
    lines.append("All expected tables and migration markers are present.")

  return "\n".join(lines)


async def main() -> None:
  parser = argparse.ArgumentParser(description="Check backend PostgreSQL schema readiness.")
  parser.add_argument("--require-seed", action="store_true", help="Require the seed.sql marker too.")
  parser.add_argument("--json", action="store_true", help="Print the full report as JSON.")
  args = parser.parse_args()

  report = await check_schema(require_seed=args.require_seed)

  if args.json:
    print(json.dumps(report, indent=2))
  else:
    print(format_schema_report(report))

  if not report["ok"]:
    raise SystemExit(1)


if __name__ == "__main__":
  asyncio.run(main())
