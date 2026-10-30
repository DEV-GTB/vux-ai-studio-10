from fastapi import Header, HTTPException
from jose import jwt
from typing import Optional

from app.core.config import settings


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header",
        )

    token = authorization.split(" ", 1)[1]

    try:
        payload = jwt.decode(
            token,
            options={
                "verify_signature": False
            },
        )

        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid token",
            )

        return {
            "id": user_id,
            "email": payload.get("email"),
        }

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )
