from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import math

from PIL import Image, ImageOps, UnidentifiedImageError


TARGET_OUTPUT_WIDTH = 1440
MIN_OUTPUT_WIDTH = 720
MAX_OUTPUT_HEIGHT = 30_000
MAX_OUTPUT_PIXELS = 36_000_000
MAX_PAGE_COUNT = 64
MAX_PAGE_PIXELS = 12_000_000


@dataclass(frozen=True)
class ReportExportPage:
  index: int
  content: bytes
  expected_width: int | None = None
  expected_height: int | None = None


@dataclass(frozen=True)
class StitchedReportImage:
  content: bytes
  width: int
  height: int
  byte_size: int


def _decode_page(page: ReportExportPage) -> Image.Image:
  try:
    with Image.open(BytesIO(page.content)) as opened:
      image = ImageOps.exif_transpose(opened).convert("RGB")
      image.load()
  except (OSError, UnidentifiedImageError, ValueError) as error:
    raise ValueError(f"Report export page {page.index} could not be decoded.") from error
  if image.width <= 0 or image.height <= 0 or image.width * image.height > MAX_PAGE_PIXELS:
    image.close()
    raise ValueError(f"Report export page {page.index} has invalid dimensions.")
  if (
    (page.expected_width is not None and image.width != page.expected_width)
    or (page.expected_height is not None and image.height != page.expected_height)
  ):
    image.close()
    raise ValueError(f"Report export page {page.index} dimensions do not match its manifest.")
  return image


def _resolve_output_width(aspect_height: float, target_width: int) -> int:
  max_for_height = math.floor(MAX_OUTPUT_HEIGHT / aspect_height)
  max_for_pixels = math.floor(math.sqrt(MAX_OUTPUT_PIXELS / aspect_height))
  width = min(target_width, max_for_height, max_for_pixels)
  if width < MIN_OUTPUT_WIDTH:
    raise ValueError("The report is too long to export as one image.")
  return width


def stitch_report_pages(
  pages: list[ReportExportPage],
  *,
  target_width: int = TARGET_OUTPUT_WIDTH,
) -> StitchedReportImage:
  if not pages or len(pages) > MAX_PAGE_COUNT:
    raise ValueError("Report export page count is invalid.")
  ordered = sorted(pages, key=lambda page: page.index)
  if [page.index for page in ordered] != list(range(len(ordered))):
    raise ValueError("Report export page indexes must be contiguous.")

  decoded = [_decode_page(page) for page in ordered]
  try:
    aspect_height = sum(image.height / image.width for image in decoded)
    output_width = _resolve_output_width(aspect_height, target_width)
    page_heights = [max(1, round(output_width * image.height / image.width)) for image in decoded]
    output_height = sum(page_heights)
    if output_height > MAX_OUTPUT_HEIGHT or output_width * output_height > MAX_OUTPUT_PIXELS:
      raise ValueError("The report exceeds the long-image output limit.")

    canvas = Image.new("RGB", (output_width, output_height), "white")
    cursor = 0
    try:
      for image, page_height in zip(decoded, page_heights, strict=True):
        resized = image.resize((output_width, page_height), Image.Resampling.LANCZOS)
        try:
          canvas.paste(resized, (0, cursor))
        finally:
          resized.close()
        cursor += page_height

      output = BytesIO()
      canvas.save(output, format="JPEG", quality=90, optimize=True, progressive=True)
      content = output.getvalue()
      return StitchedReportImage(
        content=content,
        width=output_width,
        height=output_height,
        byte_size=len(content),
      )
    finally:
      canvas.close()
  finally:
    for image in decoded:
      image.close()
