from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.core.settings import Settings


FaceShape = Literal["oval", "round", "square", "heart", "oblong", "diamond"]


@dataclass(frozen=True)
class HairStyle:
  style_id: str
  name: str
  length: str
  texture: str
  bangs: str
  face_shapes: tuple[FaceShape, ...]
  transition_lengths: tuple[str, ...]
  description: str
  prompt: str


HAIR_CATALOG_VERSION = "hair-catalog-v1"

HAIR_STYLES: tuple[HairStyle, ...] = (
  HairStyle("soft-crop", "소프트 크롭", "short", "straight", "side", ("oval", "round", "heart"), ("short", "bob", "medium", "long"), "가볍고 단정한 짧은 레이어", "a soft cropped haircut with airy side fringe and natural texture"),
  HairStyle("pixie-layer", "픽시 레이어", "short", "straight", "side", ("oval", "heart", "diamond"), ("short", "bob", "medium", "long"), "얼굴선을 또렷하게 보여주는 픽시 레이어", "a polished layered pixie haircut with soft side-swept fringe"),
  HairStyle("leaf-cut", "리프 컷", "short", "straight", "curtain", ("oval", "round", "oblong"), ("short", "bob", "medium"), "얼굴 양옆을 부드럽게 감싸는 리프 실루엣", "a Korean leaf cut with a soft center part and face-framing ends"),
  HairStyle("chin-bob", "턱선 보브", "bob", "straight", "none", ("oval", "oblong", "heart"), ("short", "bob", "medium", "long"), "턱선을 정돈해 보이는 미니멀 보브", "a precise chin-length bob with natural ends and no bangs"),
  HairStyle("c-curl-bob", "C컬 보브", "bob", "straight", "curtain", ("round", "square", "heart"), ("bob", "medium", "long"), "끝선을 안쪽으로 정돈한 부드러운 C컬", "a chin-to-neck C-curl bob with soft curtain bangs"),
  HairStyle("hush-bob", "허쉬 보브", "bob", "wavy", "see_through", ("oval", "round", "square"), ("bob", "medium", "long"), "가벼운 층과 질감이 살아 있는 허쉬 보브", "a textured hush bob with airy see-through bangs and light layers"),
  HairStyle("medium-layer", "중단발 레이어", "medium", "straight", "curtain", ("round", "square", "heart", "diamond"), ("bob", "medium", "long"), "광대와 턱선을 자연스럽게 감싸는 중단발", "a collarbone-length layered haircut with face-framing curtain pieces"),
  HairStyle("wolf-cut", "울프 컷", "medium", "wavy", "see_through", ("oval", "round", "heart"), ("short", "bob", "medium", "long"), "상단 볼륨과 가벼운 끝선이 대비되는 울프 컷", "a wearable Korean wolf cut with controlled crown volume and wispy ends"),
  HairStyle("soft-wave-medium", "미디엄 소프트 웨이브", "medium", "wavy", "none", ("oval", "square", "oblong", "diamond"), ("bob", "medium", "long"), "자연스러운 굴곡으로 얼굴선을 완화하는 웨이브", "a medium-length soft natural wave with a clean forehead"),
  HairStyle("long-layer", "롱 레이어", "long", "straight", "curtain", ("round", "square", "heart", "oblong"), ("medium", "long"), "세로 흐름과 얼굴 주변 층을 살린 롱 레이어", "long layered hair with subtle face-framing curtain layers"),
  HairStyle("hippie-wave", "히피 웨이브", "long", "curly", "see_through", ("oval", "oblong", "diamond"), ("medium", "long"), "잔잔한 컬과 풍성한 질감의 히피 웨이브", "long soft hippie waves with fine natural curls and airy fringe"),
  HairStyle("curtain-straight", "커튼뱅 스트레이트", "long", "straight", "curtain", ("round", "square", "heart"), ("bob", "medium", "long"), "커튼뱅과 매끈한 길이감을 결합한 스타일", "sleek long straight hair with balanced curtain bangs"),
)

HAIR_STYLE_BY_ID = {style.style_id: style for style in HAIR_STYLES}
FACE_SHAPE_LABELS = {
  "oval": "계란형",
  "round": "둥근형",
  "square": "각진형",
  "heart": "하트형",
  "oblong": "긴형",
  "diamond": "다이아몬드형",
}


def _asset_url(settings: Settings, style_id: str, suffix: str) -> str | None:
  base_url = settings.effective_cdn_base_url
  if not base_url:
    return None
  return f"{base_url.rstrip('/')}/{settings.hair_style_asset_prefix}/{style_id}-{suffix}.webp"


def serialize_hair_style(style: HairStyle, settings: Settings) -> dict:
  return {
    "styleId": style.style_id,
    "name": style.name,
    "length": style.length,
    "texture": style.texture,
    "bangs": style.bangs,
    "faceShapes": list(style.face_shapes),
    "transitionLengths": list(style.transition_lengths),
    "description": style.description,
    "previewUrl": _asset_url(settings, style.style_id, "preview"),
    "referenceUrl": _asset_url(settings, style.style_id, "reference"),
    "catalogVersion": HAIR_CATALOG_VERSION,
  }


def list_hair_styles(settings: Settings) -> list[dict]:
  return [serialize_hair_style(style, settings) for style in HAIR_STYLES]


def get_hair_style(style_id: str) -> HairStyle | None:
  return HAIR_STYLE_BY_ID.get(style_id)


def recommend_hair_styles(analysis: dict, limit: int = 3) -> list[dict]:
  face_shape = str(analysis.get("faceShape") or "oval")
  current_length = str(analysis.get("currentLength") or "medium")
  hairline = str(analysis.get("hairline") or "balanced")

  candidates: list[tuple[float, HairStyle, list[str]]] = []
  for style in HAIR_STYLES:
    face_score = 1.0 if face_shape in style.face_shapes else 0.35
    transition_score = 1.0 if current_length in style.transition_lengths else 0.3
    hairline_score = 1.0
    if hairline == "high" and style.bangs == "none":
      hairline_score = 0.45
    elif hairline == "low" and style.bangs in {"see_through", "curtain"}:
      hairline_score = 0.75

    score = face_score * 0.60 + transition_score * 0.20 + hairline_score * 0.15
    reasons = [f"{FACE_SHAPE_LABELS.get(face_shape, '현재')} 얼굴형의 비율을 자연스럽게 정돈해요."]
    if style.bangs != "none":
      reasons.append("앞머리와 얼굴 주변 층이 이마와 윤곽의 균형을 잡아줘요.")
    else:
      reasons.append("이마를 열어 얼굴 중심선을 또렷하게 보여줘요.")
    candidates.append((score, style, reasons))

  selected: list[tuple[float, HairStyle, list[str]]] = []
  used_lengths: set[str] = set()
  remaining = list(candidates)
  while remaining and len(selected) < limit:
    scored = [
      (
        base_score + (0.05 if style.length not in used_lengths else 0.0),
        style,
        reasons,
      )
      for base_score, style, reasons in remaining
    ]
    scored.sort(key=lambda item: (-item[0], item[1].style_id))
    winner = scored[0]
    selected.append(winner)
    used_lengths.add(winner[1].length)
    remaining = [item for item in remaining if item[1].style_id != winner[1].style_id]

  return [
    {
      "styleId": style.style_id,
      "score": round(score, 4),
      "reasons": reasons,
    }
    for score, style, reasons in selected
  ]
