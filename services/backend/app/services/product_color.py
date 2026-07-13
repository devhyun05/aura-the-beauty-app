"""Deterministic colour utilities used by AR product ranking.

The recommendation pipeline compares the recipe's authoring colour with a
licensed shade swatch.  It deliberately does not infer a photographed or
on-face composite colour.
"""

from __future__ import annotations

from math import atan2, cos, degrees, exp, radians, sin, sqrt
import re


HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")


def normalize_hex_color(value: str) -> str:
  normalized = str(value or "").strip()
  if not HEX_COLOR_PATTERN.fullmatch(normalized):
    raise ValueError("Colour must use the #RRGGBB format.")
  return normalized.upper()


def _linearize_srgb(channel: float) -> float:
  return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def srgb_hex_to_lab(value: str) -> tuple[float, float, float]:
  """Convert an sRGB #RRGGBB colour to CIELAB using the D65 white point."""

  color = normalize_hex_color(value)
  red = _linearize_srgb(int(color[1:3], 16) / 255)
  green = _linearize_srgb(int(color[3:5], 16) / 255)
  blue = _linearize_srgb(int(color[5:7], 16) / 255)

  x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047
  y = red * 0.2126729 + green * 0.7151522 + blue * 0.0721750
  z = (red * 0.0193339 + green * 0.1191920 + blue * 0.9503041) / 1.08883

  epsilon = 216 / 24389
  kappa = 24389 / 27

  def pivot(component: float) -> float:
    return component ** (1 / 3) if component > epsilon else (kappa * component + 16) / 116

  fx = pivot(x)
  fy = pivot(y)
  fz = pivot(z)
  return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e_ciede2000(
  first: tuple[float, float, float],
  second: tuple[float, float, float],
) -> float:
  """Return CIEDE2000 colour difference for two Lab triples.

  The implementation follows Sharma, Wu and Dalal (2005), with the graphic
  arts weighting factors kL=kC=kH=1.
  """

  l1, a1, b1 = first
  l2, a2, b2 = second
  c1 = sqrt(a1 * a1 + b1 * b1)
  c2 = sqrt(a2 * a2 + b2 * b2)
  c_bar = (c1 + c2) / 2
  c_bar_7 = c_bar ** 7
  g = 0.5 * (1 - sqrt(c_bar_7 / (c_bar_7 + 25 ** 7)))
  a1_prime = (1 + g) * a1
  a2_prime = (1 + g) * a2
  c1_prime = sqrt(a1_prime * a1_prime + b1 * b1)
  c2_prime = sqrt(a2_prime * a2_prime + b2 * b2)

  def hue(a_value: float, b_value: float) -> float:
    if a_value == 0 and b_value == 0:
      return 0
    return degrees(atan2(b_value, a_value)) % 360

  h1_prime = hue(a1_prime, b1)
  h2_prime = hue(a2_prime, b2)
  delta_l_prime = l2 - l1
  delta_c_prime = c2_prime - c1_prime
  hue_difference = h2_prime - h1_prime
  if c1_prime * c2_prime == 0:
    delta_h_prime = 0
  elif abs(hue_difference) <= 180:
    delta_h_prime = hue_difference
  elif hue_difference > 180:
    delta_h_prime = hue_difference - 360
  else:
    delta_h_prime = hue_difference + 360
  delta_big_h_prime = 2 * sqrt(c1_prime * c2_prime) * sin(radians(delta_h_prime / 2))

  l_bar_prime = (l1 + l2) / 2
  c_bar_prime = (c1_prime + c2_prime) / 2
  if c1_prime * c2_prime == 0:
    h_bar_prime = h1_prime + h2_prime
  elif abs(h1_prime - h2_prime) <= 180:
    h_bar_prime = (h1_prime + h2_prime) / 2
  elif h1_prime + h2_prime < 360:
    h_bar_prime = (h1_prime + h2_prime + 360) / 2
  else:
    h_bar_prime = (h1_prime + h2_prime - 360) / 2

  t = (
    1
    - 0.17 * cos(radians(h_bar_prime - 30))
    + 0.24 * cos(radians(2 * h_bar_prime))
    + 0.32 * cos(radians(3 * h_bar_prime + 6))
    - 0.20 * cos(radians(4 * h_bar_prime - 63))
  )
  delta_theta = 30 * exp(-(((h_bar_prime - 275) / 25) ** 2))
  c_bar_prime_7 = c_bar_prime ** 7
  r_c = 2 * sqrt(c_bar_prime_7 / (c_bar_prime_7 + 25 ** 7))
  s_l = 1 + (0.015 * ((l_bar_prime - 50) ** 2)) / sqrt(20 + ((l_bar_prime - 50) ** 2))
  s_c = 1 + 0.045 * c_bar_prime
  s_h = 1 + 0.015 * c_bar_prime * t
  r_t = -sin(radians(2 * delta_theta)) * r_c
  lightness = delta_l_prime / s_l
  chroma = delta_c_prime / s_c
  hue_term = delta_big_h_prime / s_h
  return sqrt(lightness ** 2 + chroma ** 2 + hue_term ** 2 + r_t * chroma * hue_term)

