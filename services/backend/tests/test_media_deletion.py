from uuid import uuid4

from app.services.media_deletion import collect_report_media_refs


def test_collect_report_media_refs_limits_to_report_owned_objects() -> None:
  source_media_id = uuid4()
  refs = collect_report_media_refs(
    {
      "source_media_bucket": "aura-mobile-media-dev",
      "source_media_id": source_media_id,
      "source_media_object_key": "uploads/capture/source-face.jpg",
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
    "uploads/capture/source-face.jpg",
    "uploads/generated-makeup/look-1.jpg",
  ]
  assert refs[0].media_asset_id == source_media_id
