from uuid import uuid4

import pytest

from app.core.errors import AppError
from app.core.settings import Settings
from app.services.media_deletion import (
  collect_report_media_refs,
  is_report_owned_object_key,
)
from app.services.s3 import S3Service, is_makeup_recommendation_object_key


def test_collect_report_media_refs_limits_to_report_owned_objects() -> None:
  source_media_id = uuid4()
  refs = collect_report_media_refs(
    {
      "source_media_bucket": "aura-mobile-media-dev",
      "source_media_id": source_media_id,
      "source_media_object_key": "uploads/capture/source-face.jpg",
      "source_thumbnail_media_bucket": "aura-mobile-media-dev",
      "source_thumbnail_media_object_key": "uploads/capture/source-face-thumbnail.jpg",
      "detail_payload": {
        "result": {
          "recommendedMakeups": [
            {
              "imageUrl": (
                "https://d3t1pbvtir1lj.cloudfront.net/"
                "uploads/generated-makeup/look-1.jpg"
              ),
            },
            {
              "imageUrl": (
                "https://d3t1pbvtir1lj.cloudfront.net/"
                "uploads/app-assets/logo/aura-mark-placeholder.png"
              ),
            },
            {"objectKey": "uploads/products/shared-product.png"},
          ],
        },
      },
    },
    cdn_base_url="https://d3t1pbvtir1lj.cloudfront.net",
    default_bucket="aura-mobile-media-dev",
  )

  object_keys = sorted(ref.object_key for ref in refs)

  assert object_keys == [
    "uploads/capture/source-face-thumbnail.jpg",
    "uploads/capture/source-face.jpg",
    "uploads/generated-makeup/look-1.jpg",
  ]
  assert {
    ref.media_asset_id
    for ref in refs
    if ref.object_key.startswith("uploads/capture/")
  } == {source_media_id}

def test_makeup_recommendation_objects_are_managed_s3_targets() -> None:
  settings = Settings(
    s3_bucket_name="aura-media",
    makeup_private_asset_prefix="private/generated-makeup-recommendations",
  )
  service = S3Service(settings)
  public_key = "uploads/generated-makeup-recommendations/report/look.webp"
  private_key = "private/generated-makeup-recommendations/report/look.webp"

  service.assert_managed_media_location(bucket="aura-media", object_key=public_key)
  service.assert_managed_media_location(bucket="aura-media", object_key=private_key)
  assert is_makeup_recommendation_object_key(public_key, settings) is True
  assert is_makeup_recommendation_object_key(private_key, settings) is True

  with pytest.raises(AppError):
    service.assert_managed_media_location(bucket="other-bucket", object_key=private_key)
  with pytest.raises(AppError):
    service.assert_managed_media_location(bucket="aura-media", object_key="private/unmanaged/look.webp")


def test_face_analysis_source_and_legacy_thumbnail_are_report_owned() -> None:
  assert is_report_owned_object_key(
    "uploads/face-analysis-source/source.jpg",
  )
  assert is_report_owned_object_key(
    "uploads/face-analysis-source-thumbnail/source-thumb.jpg",
  )
  assert is_report_owned_object_key(
    "uploads/capture-thumbnail/capture-thumb.jpg",
  )
