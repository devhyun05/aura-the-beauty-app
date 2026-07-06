from __future__ import annotations

import html
import re
from typing import Any


def clean_text(value: Any) -> str:
  text = html.unescape(str(value or ""))
  text = re.sub(r"<[^>]+>", "", text)
  text = re.sub(r"\s+", " ", text).strip()

  return text


def parse_price(value: Any) -> int:
  try:
    return max(0, int(str(value or "0").replace(",", "")))
  except ValueError:
    return 0
