from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from app.schemas.chat import ImageGenerationRequest
from app.core.security import get_current_user
from app.services.ai.router import AIRouter
from app.core.config import settings


router = APIRouter()

ai_router = AIRouter()


@router.post("/generate")
async def generate_image(
    request: ImageGenerationRequest,
    user=Depends(get_current_user),
):

    model = (
        request.model
        or settings.gemini_image_model
    )

    try:

        result = await ai_router.generate_image(
            provider="gemini",
            prompt=request.prompt,
            model=model,
        )

        return {
            "success": True,
            "model": model,
            "result": result,
        }

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )
