from fastapi import APIRouter

from app.api import (
  analysis,
  ar,
  community,
  feedback,
  filter_extractions,
  health,
  home,
  makeup_styles,
  media,
  products,
  search_sessions,
  users,
)


api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(users.router)
api_router.include_router(home.router)
api_router.include_router(community.router)
api_router.include_router(media.router)
api_router.include_router(analysis.router)
api_router.include_router(products.router)
api_router.include_router(search_sessions.router)
api_router.include_router(makeup_styles.router)
api_router.include_router(feedback.router)
api_router.include_router(filter_extractions.router)
api_router.include_router(ar.router)