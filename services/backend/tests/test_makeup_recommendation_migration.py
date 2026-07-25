from __future__ import annotations

from uuid import UUID

import pytest

from app.ops.makeup_recommendation_migration import (
  DestinationState,
  MigrationBundle,
  MigrationCollisionError,
  MigrationPreconditionError,
  bundle_from_json,
  bundle_to_json,
  build_bundle_from_snapshot,
  build_migration_plan,
  prepare_row_for_insert,
  stable_batch_id,
)


LOCAL_USER_ID = UUID("727abd9b-9134-4d36-9598-9acb42771a7f")
DEPLOYED_USER_ID = UUID("606063d1-ccec-4a75-97d3-225796c32828")
REPORT_ID = UUID("1dd498d9-d23e-4ee9-8779-7873f4cd9b5a")


def _bundle(
  *,
  subject: str = "cognito-google-sub",
  rows: dict[str, tuple[dict, ...]] | None = None,
) -> MigrationBundle:
  return MigrationBundle(
    batch_id=stable_batch_id("google", subject, [REPORT_ID]),
    source_user_id=LOCAL_USER_ID,
    auth_provider="google",
    oauth_sub=subject,
    email="du822623@gmail.com",
    rows=rows or {
      "makeup_recommendation_reports": ({"id": str(REPORT_ID)},),
    },
    s3_objects=(),
  )


def _destination(
  *,
  subject: str = "cognito-google-sub",
  existing_rows: dict[str, dict[str, dict]] | None = None,
) -> DestinationState:
  return DestinationState(
    user_id=DEPLOYED_USER_ID,
    auth_provider="google",
    oauth_sub=subject,
    email="du822623@gmail.com",
    existing_rows=existing_rows or {},
    available_static_ids={},
  )


def test_plan_maps_destination_user_by_auth_identity_not_local_uuid() -> None:
  plan = build_migration_plan(_bundle(), _destination())

  assert plan.destination_user_id == DEPLOYED_USER_ID
  assert plan.destination_user_id != LOCAL_USER_ID
  assert plan.insert_counts == {"makeup_recommendation_reports": 1}


def test_plan_rejects_same_email_with_different_auth_subject() -> None:
  with pytest.raises(MigrationPreconditionError, match="authentication identity"):
    build_migration_plan(
      _bundle(subject="source-sub"),
      _destination(subject="other-sub"),
    )


def test_plan_rejects_unrelated_existing_uuid() -> None:
  existing = {
    "makeup_recommendation_reports": {
      str(REPORT_ID): {
        "id": str(REPORT_ID),
        "context_snapshot": {},
      },
    },
  }

  with pytest.raises(MigrationCollisionError, match=str(REPORT_ID)):
    build_migration_plan(
      _bundle(),
      _destination(existing_rows=existing),
    )


def test_plan_skips_row_marked_with_same_batch_and_source_id() -> None:
  bundle = _bundle()
  existing = {
    "makeup_recommendation_reports": {
      str(REPORT_ID): {
        "id": str(REPORT_ID),
        "context_snapshot": {
          "migration": {
            "batchId": bundle.batch_id,
            "sourceEnvironment": "local",
            "sourceId": str(REPORT_ID),
          },
        },
      },
    },
  }

  plan = build_migration_plan(
    bundle,
    _destination(existing_rows=existing),
  )

  assert plan.insert_counts == {"makeup_recommendation_reports": 0}
  assert plan.skip_counts == {"makeup_recommendation_reports": 1}


def test_bundle_includes_only_report_linked_sessions_and_prerequisites() -> None:
  report_id = str(REPORT_ID)
  session_id = "10000000-0000-0000-0000-000000000001"
  unlinked_session_id = "10000000-0000-0000-0000-000000000002"
  analysis_id = "20000000-0000-0000-0000-000000000001"
  capture_id = "30000000-0000-0000-0000-000000000001"
  media_id = "40000000-0000-0000-0000-000000000001"
  asset_id = "50000000-0000-0000-0000-000000000001"
  run_id = "60000000-0000-0000-0000-000000000001"
  snapshot = {
    "makeup_recommendation_reports": (
      {
        "id": report_id,
        "user_id": str(LOCAL_USER_ID),
        "session_id": session_id,
        "source_analysis_report_id": analysis_id,
      },
    ),
    "makeup_recommendation_sessions": (
      {
        "id": session_id,
        "user_id": str(LOCAL_USER_ID),
        "analysis_report_id": analysis_id,
        "report_id": report_id,
      },
      {
        "id": unlinked_session_id,
        "user_id": str(LOCAL_USER_ID),
        "analysis_report_id": analysis_id,
        "report_id": None,
      },
    ),
    "analysis_reports": (
      {
        "id": analysis_id,
        "user_id": str(LOCAL_USER_ID),
        "photo_capture_id": capture_id,
        "source_media_id": media_id,
        "preview_media_id": None,
        "golden_mask_media_id": None,
      },
    ),
    "photo_captures": (
      {
        "id": capture_id,
        "user_id": str(LOCAL_USER_ID),
        "media_id": media_id,
      },
    ),
    "media_assets": (
      {
        "id": media_id,
        "owner_user_id": str(LOCAL_USER_ID),
        "bucket": "aura-mobile-media-dev",
        "object_key": "uploads/source.webp",
      },
    ),
    "makeup_recommendation_assets": (
      {
        "id": asset_id,
        "report_id": report_id,
        "input_media_id": media_id,
        "storage_bucket": "aura-mobile-media-dev",
        "object_key": "generated/result.png",
      },
    ),
    "product_recommendation_runs": (
      {
        "id": run_id,
        "user_id": str(LOCAL_USER_ID),
        "source_makeup_report_id": report_id,
        "source_analysis_report_id": analysis_id,
        "look_media_id": None,
      },
    ),
    "analysis_stage_runs": (
      {"id": "70000000-0000-0000-0000-000000000001", "report_id": analysis_id},
    ),
    "face_length_measurement_snapshots": (),
  }

  bundle = build_bundle_from_snapshot(
    source_user_id=LOCAL_USER_ID,
    auth_provider="google",
    oauth_sub="cognito-google-sub",
    email="du822623@gmail.com",
    snapshot=snapshot,
  )

  assert len(bundle.rows["makeup_recommendation_reports"]) == 1
  assert [row["id"] for row in bundle.rows["makeup_recommendation_sessions"]] == [
    session_id,
  ]
  assert len(bundle.rows["analysis_reports"]) == 1
  assert len(bundle.rows["photo_captures"]) == 1
  assert len(bundle.rows["media_assets"]) == 1
  assert len(bundle.rows["analysis_stage_runs"]) == 1
  assert len(bundle.rows["makeup_recommendation_assets"]) == 1
  assert len(bundle.rows["product_recommendation_runs"]) == 1
  assert {
    (item.bucket, item.object_key)
    for item in bundle.s3_objects
  } == {
    ("aura-mobile-media-dev", "uploads/source.webp"),
    ("aura-mobile-media-dev", "generated/result.png"),
  }


def test_bundle_json_round_trip_preserves_identity_rows_and_s3_references() -> None:
  original = _bundle(
    rows={
      "makeup_recommendation_reports": (
        {
          "id": str(REPORT_ID),
          "created_at": "2026-07-25T02:50:21.589738+00:00",
          "context_snapshot": {"profile": {"gender": "female"}},
        },
      ),
    },
  )

  restored = bundle_from_json(bundle_to_json(original))

  assert restored == original


def test_prepare_report_maps_user_adds_marker_and_defers_circular_links() -> None:
  bundle = _bundle()
  source = {
    "id": str(REPORT_ID),
    "user_id": str(LOCAL_USER_ID),
    "session_id": "10000000-0000-0000-0000-000000000001",
    "parent_report_id": "10000000-0000-0000-0000-000000000002",
    "context_snapshot": {"profile": {"gender": "female"}},
  }

  prepared = prepare_row_for_insert(
    "makeup_recommendation_reports",
    source,
    bundle=bundle,
    destination_user_id=DEPLOYED_USER_ID,
  )

  assert prepared["user_id"] == str(DEPLOYED_USER_ID)
  assert prepared["session_id"] is None
  assert prepared["parent_report_id"] is None
  assert prepared["context_snapshot"]["profile"] == {"gender": "female"}
  assert prepared["context_snapshot"]["migration"] == {
    "batchId": bundle.batch_id,
    "sourceEnvironment": "local",
    "sourceId": str(REPORT_ID),
  }


def test_plan_skips_identical_markerless_media_row_after_user_remap() -> None:
  media_id = "40000000-0000-0000-0000-000000000001"
  source = {
    "id": media_id,
    "owner_user_id": str(LOCAL_USER_ID),
    "media_kind": "face-analysis",
    "bucket": "aura-mobile-media-dev",
    "object_key": "uploads/source.webp",
  }
  deployed = {
    **source,
    "owner_user_id": str(DEPLOYED_USER_ID),
  }
  bundle = _bundle(rows={"media_assets": (source,)})
  destination = _destination(
    existing_rows={"media_assets": {media_id: deployed}},
  )

  plan = build_migration_plan(bundle, destination)

  assert plan.insert_counts == {"media_assets": 0}
  assert plan.skip_counts == {"media_assets": 1}


def test_bundle_includes_every_visible_saved_report_type_and_shared_dependencies() -> None:
  analysis_id = "20000000-0000-0000-0000-000000000011"
  deleted_analysis_id = "20000000-0000-0000-0000-000000000012"
  extraction_id = "80000000-0000-0000-0000-000000000011"
  failed_extraction_id = "80000000-0000-0000-0000-000000000012"
  feedback_id = "90000000-0000-0000-0000-000000000011"
  scoreless_feedback_id = "90000000-0000-0000-0000-000000000012"
  capture_id = "30000000-0000-0000-0000-000000000011"
  media_id = "40000000-0000-0000-0000-000000000011"
  product_run_id = "60000000-0000-0000-0000-000000000011"
  snapshot = {
    "makeup_recommendation_reports": (),
    "makeup_recommendation_sessions": (),
    "makeup_recommendation_assets": (),
    "analysis_reports": (
      {
        "id": analysis_id,
        "user_id": str(LOCAL_USER_ID),
        "status": "completed",
        "deleted_at": None,
        "photo_capture_id": capture_id,
        "source_media_id": media_id,
        "preview_media_id": None,
        "golden_mask_media_id": None,
      },
      {
        "id": deleted_analysis_id,
        "user_id": str(LOCAL_USER_ID),
        "status": "completed",
        "deleted_at": "2026-07-01T00:00:00+00:00",
      },
    ),
    "filter_extraction_reports": (
      {
        "id": extraction_id,
        "user_id": str(LOCAL_USER_ID),
        "status": "completed",
        "photo_capture_id": capture_id,
        "result_media_id": media_id,
      },
      {
        "id": failed_extraction_id,
        "user_id": str(LOCAL_USER_ID),
        "status": "failed",
      },
    ),
    "makeup_feedback_reports": (
      {
        "id": feedback_id,
        "user_id": str(LOCAL_USER_ID),
        "status": "completed",
        "score": 91,
        "feedback_kind": "initial",
        "parent_feedback_report_id": None,
        "photo_capture_id": capture_id,
        "uploaded_media_id": media_id,
      },
      {
        "id": scoreless_feedback_id,
        "user_id": str(LOCAL_USER_ID),
        "status": "completed",
        "score": None,
        "feedback_kind": "initial",
        "parent_feedback_report_id": None,
      },
    ),
    "photo_captures": (
      {
        "id": capture_id,
        "user_id": str(LOCAL_USER_ID),
        "media_id": media_id,
      },
    ),
    "media_assets": (
      {
        "id": media_id,
        "owner_user_id": str(LOCAL_USER_ID),
        "bucket": "aura-mobile-media-dev",
        "object_key": "uploads/shared.webp",
        "cdn_url": "https://cdn.example/uploads/shared.webp",
      },
    ),
    "analysis_stage_runs": (
      {"id": "70000000-0000-0000-0000-000000000011", "report_id": analysis_id},
      {"id": "70000000-0000-0000-0000-000000000012", "report_id": deleted_analysis_id},
    ),
    "face_length_measurement_snapshots": (),
    "product_recommendation_runs": (
      {
        "id": product_run_id,
        "user_id": str(LOCAL_USER_ID),
        "source_analysis_report_id": analysis_id,
        "source_makeup_report_id": None,
        "look_media_id": media_id,
      },
    ),
  }

  bundle = build_bundle_from_snapshot(
    source_user_id=LOCAL_USER_ID,
    auth_provider="google",
    oauth_sub="cognito-google-sub",
    email="du822623@gmail.com",
    snapshot=snapshot,
  )

  assert [row["id"] for row in bundle.rows["analysis_reports"]] == [analysis_id]
  assert [row["id"] for row in bundle.rows["filter_extraction_reports"]] == [extraction_id]
  assert [row["id"] for row in bundle.rows["makeup_feedback_reports"]] == [feedback_id]
  assert [row["id"] for row in bundle.rows["analysis_stage_runs"]] == [
    "70000000-0000-0000-0000-000000000011",
  ]
  assert [row["id"] for row in bundle.rows["photo_captures"]] == [capture_id]
  assert [row["id"] for row in bundle.rows["media_assets"]] == [media_id]
  assert [row["id"] for row in bundle.rows["product_recommendation_runs"]] == [
    product_run_id,
  ]
  assert [(item.bucket, item.object_key) for item in bundle.s3_objects] == [
    ("aura-mobile-media-dev", "uploads/shared.webp"),
  ]


def test_bundle_orders_feedback_parent_before_completed_correction() -> None:
  parent_id = "90000000-0000-0000-0000-000000000021"
  correction_id = "90000000-0000-0000-0000-000000000022"
  snapshot = {
    "makeup_recommendation_reports": (),
    "makeup_recommendation_sessions": (),
    "makeup_recommendation_assets": (),
    "analysis_reports": (),
    "filter_extraction_reports": (),
    "makeup_feedback_reports": (
      {
        "id": correction_id,
        "user_id": str(LOCAL_USER_ID),
        "status": "completed",
        "score": 70,
        "feedback_kind": "correction",
        "parent_feedback_report_id": parent_id,
      },
      {
        "id": parent_id,
        "user_id": str(LOCAL_USER_ID),
        "status": "completed",
        "score": 65,
        "feedback_kind": "initial",
        "parent_feedback_report_id": None,
      },
    ),
    "photo_captures": (),
    "media_assets": (),
    "analysis_stage_runs": (),
    "face_length_measurement_snapshots": (),
    "product_recommendation_runs": (),
  }

  bundle = build_bundle_from_snapshot(
    source_user_id=LOCAL_USER_ID,
    auth_provider="google",
    oauth_sub="cognito-google-sub",
    email="du822623@gmail.com",
    snapshot=snapshot,
  )

  assert [row["id"] for row in bundle.rows["makeup_feedback_reports"]] == [
    parent_id,
    correction_id,
  ]


def test_plan_skips_prior_local_migration_marker_from_an_older_batch() -> None:
  bundle = _bundle()
  existing = {
    "makeup_recommendation_reports": {
      str(REPORT_ID): {
        "id": str(REPORT_ID),
        "context_snapshot": {
          "migration": {
            "batchId": "local-makeup-reports:older-reviewed-batch",
            "sourceEnvironment": "local",
            "sourceId": str(REPORT_ID),
          },
        },
      },
    },
  }

  plan = build_migration_plan(
    bundle,
    _destination(existing_rows=existing),
  )

  assert plan.insert_counts == {"makeup_recommendation_reports": 0}
  assert plan.skip_counts == {"makeup_recommendation_reports": 1}


@pytest.mark.parametrize(
  ("table", "payload_field"),
  (
    ("filter_extraction_reports", "result_payload"),
    ("makeup_feedback_reports", "feedback_payload"),
  ),
)
def test_prepare_new_report_types_maps_user_and_preserves_payload(
  table: str,
  payload_field: str,
) -> None:
  bundle = _bundle()
  source = {
    "id": str(REPORT_ID),
    "user_id": str(LOCAL_USER_ID),
    payload_field: {"result": {"headline": "stored report"}},
  }

  prepared = prepare_row_for_insert(
    table,
    source,
    bundle=bundle,
    destination_user_id=DEPLOYED_USER_ID,
  )

  assert prepared["user_id"] == str(DEPLOYED_USER_ID)
  assert prepared[payload_field]["result"] == {"headline": "stored report"}
  assert prepared[payload_field]["migration"]["sourceId"] == str(REPORT_ID)
