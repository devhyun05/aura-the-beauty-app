from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.schemas.makeup_recommendation import MakeupRecommendationGenerate
from app.services.openai_analysis import OpenAIAnalysisService


router = APIRouter(prefix="/makeup-recommendations", tags=["makeup-recommendations"])


@router.post("/generate")
async def generate_makeup_recommendations(
  payload: MakeupRecommendationGenerate,
  _auth: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
) -> dict:
  service = OpenAIAnalysisService(settings)
  result = await service.generate_personalized_makeup_recommendations(
    payload.model_dump(by_alias=True, exclude_none=True),
  )
  return success(result)
