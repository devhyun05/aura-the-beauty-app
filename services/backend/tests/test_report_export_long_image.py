from io import BytesIO

import pytest
from PIL import Image

from app.services.report_export_long_image import (
  MAX_OUTPUT_HEIGHT,
  ReportExportPage,
  stitch_report_pages,
)


def _jpeg(color: tuple[int, int, int], size: tuple[int, int]) -> bytes:
  output = BytesIO()
  Image.new("RGB", size, color).save(output, format="JPEG", quality=95)
  return output.getvalue()


def test_stitch_report_pages_preserves_order_and_targets_1440_width() -> None:
  result = stitch_report_pages([
    ReportExportPage(index=0, content=_jpeg((220, 30, 30), (100, 80))),
    ReportExportPage(index=1, content=_jpeg((30, 40, 220), (100, 40))),
  ])

  assert result.width == 1440
  assert result.height == 1728
  assert result.byte_size == len(result.content)
  with Image.open(BytesIO(result.content)) as image:
    assert image.format == "JPEG"
    assert image.getpixel((720, 200))[0] > image.getpixel((720, 200))[2]
    assert image.getpixel((720, 1500))[2] > image.getpixel((720, 1500))[0]


def test_stitch_report_pages_rejects_missing_page_index() -> None:
  with pytest.raises(ValueError, match="contiguous"):
    stitch_report_pages([
      ReportExportPage(index=0, content=_jpeg((20, 20, 20), (100, 100))),
      ReportExportPage(index=2, content=_jpeg((40, 40, 40), (100, 100))),
    ])


def test_stitch_report_pages_scales_down_before_height_limit() -> None:
  tall_page = _jpeg((80, 90, 100), (100, 1800))
  result = stitch_report_pages([
    ReportExportPage(index=index, content=tall_page)
    for index in range(2)
  ])

  assert result.width < 1440
  assert result.width >= 720
  assert result.height <= MAX_OUTPUT_HEIGHT


def test_stitch_report_pages_rejects_an_undecodable_chunk() -> None:
  with pytest.raises(ValueError, match="decode"):
    stitch_report_pages([ReportExportPage(index=0, content=b"not-a-jpeg")])
