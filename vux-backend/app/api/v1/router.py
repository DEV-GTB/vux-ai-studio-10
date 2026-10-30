from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.chat import router as chat_router
from app.api.v1.files import router as files_router
from app.api.v1.images import router as images_router
from app.api.v1.projects import router as projects_router


api_router = APIRouter()

api_router.include_router(
    health_router,
    prefix="/health",
    tags=["Health"],
)

api_router.include_router(
    chat_router,
    prefix="/chat",
    tags=["Chat"],
)

api_router.include_router(
    files_router,
    prefix="/files",
    tags=["Files"],
)

api_router.include_router(
    images_router,
    prefix="/images",
    tags=["Images"],
)

api_router.include_router(
    projects_router,
    prefix="/projects",
    tags=["Projects"],
)
