from fastapi import APIRouter, Depends, HTTPException

from app.schemas.chat import ChatRequest
from app.core.security import get_current_user
from app.services.ai.router import AIRouter


router = APIRouter()

ai_router = AIRouter()


@router.post("")
async def chat(
    request: ChatRequest,
    user=Depends(get_current_user),
):

    try:

        result = await ai_router.chat(
            provider=request.provider,
            contents=request.message,
            model=request.model,
        )

        return {
            "success": True,
            "conversation_id": request.conversation_id,
            "message": {
                "role": "assistant",
                "content": result["text"],
            },
            "model": result["model"],
        }

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )
