from pydantic import Field

from app.schemas.base import CamelModel


class ARFilterStateUpsert(CamelModel):
  selected_face_part: str | None = Field(default=None, alias="selectedFacePart")
  selected_color_id: str | None = Field(default=None, alias="selectedColorId")
  selected_type_id: str | None = Field(default=None, alias="selectedTypeId")
  selected_texture_id: str | None = Field(default=None, alias="selectedTextureId")
  guide_mode: str | None = Field(default=None, alias="guideMode")
  comparison_mode: str | None = Field(default=None, alias="comparisonMode")
  is_overlay_visible: bool = Field(default=True, alias="isOverlayVisible")
  landmarks: list[dict] = Field(default_factory=list)
  adjustments: dict = Field(default_factory=dict)
